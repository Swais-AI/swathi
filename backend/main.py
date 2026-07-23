import os
import json
import base64
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from ai_learning_path_service import classify_performance, classify_reader, get_learning_path_generator


load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

app = FastAPI(title="SGS Chapter Content API")


def get_cors_origins() -> list[str]:
    local_origins = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3004",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3004",
    ]
    configured_origins = os.getenv("CORS_ALLOW_ORIGINS", "")
    if configured_origins:
        configured = [
            origin.strip().rstrip("/")
            for origin in configured_origins.split(",")
            if origin.strip()
        ]
        return list(dict.fromkeys([*configured, *local_origins]))

    return local_origins


app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class LearningProfileInput(BaseModel):
    student_id: int = Field(..., ge=1)
    chapter_id: int = Field(..., ge=1)
    chapter_title: str = Field(..., min_length=1, max_length=160)
    reading_time_minutes: int = Field(..., ge=0, le=600)
    quiz_score: int = Field(..., ge=0, le=100)
    retry_count: int = Field(..., ge=0, le=50)
    comprehension_score: int = Field(..., ge=0, le=100)


class PerformanceLearningPathInput(BaseModel):
    student_id: int = Field(..., ge=1)
    assignment_marks: float = Field(..., ge=0, le=100)
    quiz_score: float = Field(..., ge=0, le=100)
    unit_test_marks: float = Field(..., ge=0, le=100)
    retry_count: int = Field(..., ge=0, le=500)


class StudyContentGenerationInput(BaseModel):
    student_id: int = Field(..., ge=1)
    chapter_content_id: int = Field(..., ge=1)
    classification: str | None = Field(default=None, max_length=40)


class QuizGenerationInput(BaseModel):
    chapter_id: int = Field(..., ge=1)
    question_count: int = Field(default=5, ge=3, le=10)


class MockTestGenerationInput(BaseModel):
    chapter_id: int = Field(..., ge=1)


class QuizResultInput(BaseModel):
    student_email: str = Field(..., min_length=3, max_length=150)
    chapter_id: int = Field(..., ge=1)
    score: float = Field(..., ge=0)
    total_marks: float = Field(..., gt=0)
    percentage: float = Field(..., ge=0, le=100)


class TextTranslationBatchInput(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=80)
    target_language: str = Field(..., min_length=2, max_length=80)
    source_language: str | None = Field(default=None, max_length=80)


class TextTranslationInput(BaseModel):
    text: str = Field(..., min_length=1, max_length=12000)
    target_language: str = Field(..., min_length=2, max_length=80)
    source_language: str | None = Field(default=None, max_length=80)


class AssignmentSubmissionInput(BaseModel):
    assignment_id: int = Field(..., ge=1)
    file_name: str = Field(..., min_length=1, max_length=255)
    file_type: str | None = Field(default=None, max_length=160)
    file_size: int = Field(..., ge=1, le=10 * 1024 * 1024)
    file_content_base64: str = Field(..., min_length=1)


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise HTTPException(
            status_code=500,
            detail="DATABASE_URL is not configured for the FastAPI backend.",
        )
    return database_url


@contextmanager
def get_connection():
    with psycopg.connect(get_database_url()) as connection:
        yield connection


def fetch_current_student_record(student_email: str | None = None) -> dict:
    email_filter = "AND LOWER(BTRIM(student_email)) = LOWER(BTRIM(%s))" if student_email else ""
    query = f"""
        SELECT
            student_id,
            full_name,
            roll_no,
            admission_no,
            class_id,
            COALESCE(NULLIF(BTRIM(class_name), ''), class_id::text) AS class_name,
            section,
            student_email
        FROM sgs_student_master
        WHERE COALESCE(record_status, 'Active') = 'Active'
          AND COALESCE(is_active, true) = true
          {email_filter}
        ORDER BY
            CASE WHEN admission_no IS NULL THEN 1 ELSE 0 END,
            student_id
        LIMIT 1;
    """

    with get_connection() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(query, (student_email,) if student_email else ())
            student = cursor.fetchone()

    if student is None:
        detail = "No active student found for the logged-in email." if student_email else "No active student found."
        raise HTTPException(status_code=404, detail=detail)

    return student


def extract_json_object(content: str) -> dict:
    cleaned = content.strip()

    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()

    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        parsed = json.loads(cleaned[start : end + 1])

    if not isinstance(parsed, dict):
        raise ValueError("Expected a JSON object.")

    return parsed


def gemini_generate_json(prompt: str, max_output_tokens: int = 4096) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    base_url = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com").rstrip("/")
    primary_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    fallback_models = os.getenv("GEMINI_FALLBACK_MODELS", "gemini-2.0-flash,gemini-2.0-flash-lite")
    model_names = []

    for model_name in [primary_model, *fallback_models.split(",")]:
        cleaned_model = model_name.strip()
        if cleaned_model and cleaned_model not in model_names:
            model_names.append(cleaned_model)

    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.25,
            "maxOutputTokens": max_output_tokens,
        },
    }

    errors = []
    for model_name in model_names:
        model = quote(model_name, safe="")
        request = Request(
            f"{base_url}/v1beta/models/{model}:generateContent?key={api_key}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=30) as response:
                body = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            try:
                error_body = json.loads(error.read().decode("utf-8"))
                message = error_body.get("error", {}).get("message")
            except (json.JSONDecodeError, UnicodeDecodeError):
                message = None
            errors.append(f"{model_name}: {message or f'Gemini API error {error.code}.'}")
            continue
        except URLError as error:
            errors.append(f"{model_name}: Gemini connection failed: {error.reason}")
            continue

        try:
            parts = body["candidates"][0]["content"]["parts"]
            content = "\n".join(part.get("text", "") for part in parts).strip()
            return extract_json_object(content)
        except (KeyError, IndexError, json.JSONDecodeError, ValueError):
            errors.append(f"{model_name}: Gemini returned an invalid JSON response.")
            continue

    raise RuntimeError("Gemini translation failed. " + " | ".join(errors))


def parse_date_value(value) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def get_due_status(due_date_value) -> dict:
    due_date = parse_date_value(due_date_value)
    if due_date is None:
        return {"label": "Upcoming", "priority": "low", "days_left": None, "is_countable": False}

    days_left = (due_date - date.today()).days
    if days_left < 0:
        return {"label": "Overdue", "priority": "high", "days_left": days_left, "is_countable": True}
    if days_left == 0:
        return {"label": "Due Today", "priority": "high", "days_left": days_left, "is_countable": True}
    if days_left <= 3:
        return {"label": "Due Soon", "priority": "medium", "days_left": days_left, "is_countable": True}
    if days_left <= 7:
        return {"label": "Upcoming", "priority": "low", "days_left": days_left, "is_countable": False}

    return {"label": "Later", "priority": "low", "days_left": days_left, "is_countable": False}


def apply_ai_assignment_messages(assignments: list[dict]) -> list[dict]:
    if not assignments:
        return assignments

    if not os.getenv("GEMINI_API_KEY"):
        raise RuntimeError("GEMINI_API_KEY is required for assignment due alerts.")

    prompt = f"""
        You are a helpful school assistant. Rewrite assignment due alerts for a student.

        Return only valid JSON in this exact shape:
        {{
          "alerts": [
            {{"assignment_id": 1, "message": "short student-friendly alert"}}
          ]
        }}

        Rules:
        - Keep each message under 24 words.
        - Mention urgency clearly for overdue, due today, and due soon assignments.
        - Do not invent dates, marks, or submission details.
        - Use simple school-student language.

        Assignments:
        {json.dumps(assignments, default=str, ensure_ascii=False)}
    """

    generated = gemini_generate_json(prompt, max_output_tokens=2048)

    messages = {}
    for item in generated.get("alerts", []):
        if not isinstance(item, dict):
            continue
        assignment_id = item.get("assignment_id")
        message = str(item.get("message") or "").strip()
        if assignment_id is not None and message:
            messages[int(assignment_id)] = message[:260]

    for assignment in assignments:
        message = messages.get(int(assignment["assignment_id"]))
        if not message:
            raise RuntimeError("Gemini did not return an alert message for every due assignment.")
        assignment["message"] = message

    return assignments


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/health/db")
def database_health_check():
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
    except psycopg.Error as error:
        raise HTTPException(status_code=503, detail="Database connection failed.") from error

    return {"status": "ok", "database": "connected"}


@app.get("/students/current")
def get_current_student(
    email: str | None = Query(default=None, min_length=3, max_length=150),
):
    try:
        student = fetch_current_student_record(email)
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Student master table is missing. Create sgs_student_master in PostgreSQL.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(
            status_code=500,
            detail="Unable to fetch student details.",
        ) from error

    return {"student": student}


def ensure_assignment_submission_columns(cursor) -> None:
    cursor.execute(
        """
        ALTER TABLE sgs_assignment_results
        ADD COLUMN IF NOT EXISTS submitted_file_name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS submitted_file_type VARCHAR(160),
        ADD COLUMN IF NOT EXISTS submitted_file_size BIGINT,
        ADD COLUMN IF NOT EXISTS submitted_file_content BYTEA;
        """
    )


@app.get("/assignments/current")
def get_current_assignments():
    try:
        student = fetch_current_student_record()
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                ensure_assignment_submission_columns(cursor)
                cursor.execute(
                    """
                    SELECT
                        a.assignment_id,
                        a.assignment_title,
                        a.assignment_text,
                        a.due_date,
                        a.class_id,
                        a.subject_id,
                        r.assignment_result_id,
                        r.status AS submission_status,
                        r.submitted_at,
                        r.submitted_file_name,
                        r.submitted_file_size
                    FROM sgs_assignment_master a
                    LEFT JOIN sgs_assignment_results r
                      ON r.assignment_id = a.assignment_id
                     AND r.student_id = %s
                     AND COALESCE(r.record_status, 'ACTIVE') = 'ACTIVE'
                    WHERE a.class_id = %s
                      AND COALESCE(a.record_status, 'Active') = 'Active'
                    ORDER BY a.due_date ASC NULLS LAST, a.assignment_id DESC
                    LIMIT 20;
                    """,
                    (student["student_id"], student["class_id"]),
                )
                assignments = cursor.fetchall()

                if not assignments:
                    cursor.execute(
                        """
                        SELECT
                            a.assignment_id,
                            a.assignment_title,
                            a.assignment_text,
                            a.due_date,
                            a.class_id,
                            a.subject_id,
                            r.assignment_result_id,
                            r.status AS submission_status,
                            r.submitted_at,
                            r.submitted_file_name,
                            r.submitted_file_size
                        FROM sgs_assignment_master a
                        LEFT JOIN sgs_assignment_results r
                          ON r.assignment_id = a.assignment_id
                         AND r.student_id = %s
                         AND COALESCE(r.record_status, 'ACTIVE') = 'ACTIVE'
                        WHERE COALESCE(a.record_status, 'Active') = 'Active'
                        ORDER BY a.due_date ASC NULLS LAST, a.assignment_id DESC
                        LIMIT 20;
                        """,
                        (student["student_id"],),
                    )
                    assignments = cursor.fetchall()
    except psycopg.errors.UndefinedColumn as error:
        raise HTTPException(
            status_code=500,
            detail="Assignment submission columns are missing. Submit one assignment once to initialize columns.",
        ) from error
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Assignment tables are missing. Confirm sgs_assignment_master and sgs_assignment_results exist.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch assignments.") from error

    normalized_assignments = []
    for index, assignment in enumerate(assignments, start=1):
        submitted = bool(assignment.get("submitted_at") or assignment.get("submitted_file_name"))
        normalized_assignments.append(
            {
                "number": index,
                "assignment_id": assignment["assignment_id"],
                "assignment_title": assignment.get("assignment_title") or "Assignment",
                "assignment_text": assignment.get("assignment_text") or "",
                "due_date": assignment.get("due_date"),
                "class_id": assignment.get("class_id"),
                "subject_id": assignment.get("subject_id"),
                "status": "Submitted" if submitted else (assignment.get("submission_status") or "Not Started"),
                "action": "View" if submitted else "Start",
                "submitted_at": assignment.get("submitted_at"),
                "submitted_file_name": assignment.get("submitted_file_name"),
                "submitted_file_size": assignment.get("submitted_file_size"),
            }
        )

    return {"student": student, "assignments": normalized_assignments}


@app.post("/assignments/submit")
def submit_assignment(payload: AssignmentSubmissionInput):
    try:
        file_bytes = base64.b64decode(payload.file_content_base64, validate=True)
    except (ValueError, base64.binascii.Error) as error:
        raise HTTPException(status_code=400, detail="Invalid file content.") from error

    if len(file_bytes) != payload.file_size:
        raise HTTPException(status_code=400, detail="Uploaded file size does not match file metadata.")

    try:
        student = fetch_current_student_record()
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                ensure_assignment_submission_columns(cursor)
                cursor.execute(
                    """
                    SELECT assignment_id, assignment_title, due_date, subject_id
                    FROM sgs_assignment_master
                    WHERE assignment_id = %s
                      AND COALESCE(record_status, 'Active') = 'Active'
                    LIMIT 1;
                    """,
                    (payload.assignment_id,),
                )
                assignment = cursor.fetchone()
                if assignment is None:
                    raise HTTPException(status_code=404, detail="Assignment not found.")

                cursor.execute(
                    """
                    SELECT assignment_result_id
                    FROM sgs_assignment_results
                    WHERE assignment_id = %s
                      AND student_id = %s
                      AND COALESCE(record_status, 'ACTIVE') = 'ACTIVE'
                    LIMIT 1;
                    """,
                    (payload.assignment_id, student["student_id"]),
                )
                existing_result = cursor.fetchone()

                if existing_result:
                    cursor.execute(
                        """
                        UPDATE sgs_assignment_results
                        SET status = 'Submitted',
                            submitted_at = CURRENT_TIMESTAMP,
                            submitted_file_name = %s,
                            submitted_file_type = %s,
                            submitted_file_size = %s,
                            submitted_file_content = %s,
                            modified_datetime = CURRENT_TIMESTAMP,
                            modified_user_id = %s
                        WHERE assignment_result_id = %s
                        RETURNING assignment_result_id, submitted_at, submitted_file_name, submitted_file_size;
                        """,
                        (
                            payload.file_name,
                            payload.file_type or "application/octet-stream",
                            payload.file_size,
                            file_bytes,
                            str(student["student_id"]),
                            existing_result["assignment_result_id"],
                        ),
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO sgs_assignment_results (
                            assignment_id,
                            student_id,
                            subject_id,
                            class_name,
                            assignment_title,
                            status,
                            due_date,
                            submitted_at,
                            submitted_file_name,
                            submitted_file_type,
                            submitted_file_size,
                            submitted_file_content,
                            created_user_id
                        )
                        VALUES (%s, %s, %s, %s, %s, 'Submitted', %s, CURRENT_TIMESTAMP, %s, %s, %s, %s, %s)
                        RETURNING assignment_result_id, submitted_at, submitted_file_name, submitted_file_size;
                        """,
                        (
                            payload.assignment_id,
                            student["student_id"],
                            assignment.get("subject_id"),
                            student.get("class_name"),
                            assignment.get("assignment_title"),
                            assignment.get("due_date"),
                            payload.file_name,
                            payload.file_type or "application/octet-stream",
                            payload.file_size,
                            file_bytes,
                            str(student["student_id"]),
                        ),
                    )

                saved_submission = cursor.fetchone()
            connection.commit()
    except HTTPException:
        raise
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Assignment tables are missing. Confirm sgs_assignment_master and sgs_assignment_results exist.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to save assignment submission.") from error

    return {
        "submitted": True,
        "student_id": student["student_id"],
        "assignment_id": payload.assignment_id,
        "submission": saved_submission,
    }


@app.get("/classes")
def get_classes():
    query = """
        SELECT
            class_id,
            class_name,
            section_name,
            academic_year
        FROM sgs_class_master
        WHERE class_id IS NOT NULL
          AND NULLIF(BTRIM(class_name), '') IS NOT NULL
        ORDER BY class_name, section_name, class_id;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query)
                classes = cursor.fetchall()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Class master table is missing. Confirm sgs_class_master exists.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch classes.") from error

    return {"classes": classes}


@app.get("/subjects")
def get_subjects(
    class_id: int = Query(..., ge=1),
):
    query = """
        SELECT DISTINCT
            subject_id,
            subject_name,
            subject_code
        FROM sgs_subject_master
        WHERE class_id = %s
          AND subject_id IS NOT NULL
          AND NULLIF(BTRIM(subject_name), '') IS NOT NULL
        ORDER BY subject_name;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, (class_id,))
                subjects = cursor.fetchall()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Subject master table is missing. Confirm sgs_subject_master exists.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch subjects.") from error

    return {"subjects": subjects}


@app.get("/chapter-content-list")
def get_chapter_content_list(
    class_id: int = Query(..., ge=1),
    subject_id: int = Query(..., ge=1),
):
    query = """
        SELECT
            chapter_content_id,
            content_title
        FROM sgs_chapter_content
        WHERE class_id = %s
          AND subject_id = %s
          AND chapter_content_id IS NOT NULL
          AND NULLIF(BTRIM(content_title), '') IS NOT NULL
        ORDER BY chapter_content_id;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, (class_id, subject_id))
                chapters = cursor.fetchall()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Chapter content table is missing. Confirm sgs_chapter_content exists.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch chapters.") from error

    return {"chapters": chapters}


@app.get("/quiz-chapters")
def get_quiz_chapters():
    query = """
        SELECT DISTINCT ON (content.chapter_id)
            content.chapter_id,
            COALESCE(
                NULLIF(BTRIM(content.content_title), ''),
                NULLIF(BTRIM(chapter.chapter_name), ''),
                'Chapter'
            ) AS content_title
        FROM sgs_chapter_content content
        LEFT JOIN sgs_chapter_master chapter
          ON chapter.chapter_id = content.chapter_id
        WHERE content.chapter_id IS NOT NULL
          AND content.full_text_content IS NOT NULL
          AND BTRIM(content.full_text_content) <> ''
          AND COALESCE(content.is_active, true) = true
          AND COALESCE(content.record_status, 'Active') = 'Active'
        ORDER BY content.chapter_id, content.chapter_content_id DESC;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query)
                chapters = cursor.fetchall()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Chapter tables are missing. Confirm chapter master and content tables exist.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch quiz chapters.") from error

    return {"chapters": chapters}


@app.get("/notices")
def get_notices(
    student_class: str | None = Query(default=None, min_length=1),
):
    filters = ["COALESCE(record_status, 'Active') = 'Active'"]
    params: list[str] = []

    if student_class is not None:
        filters.append(
            "(applicable_class IS NULL OR BTRIM(applicable_class) = '' OR LOWER(applicable_class) IN ('all', LOWER(%s)))"
        )
        params.append(student_class.strip())

    query = f"""
        SELECT
            notice_id,
            notice_title,
            notice_text,
            notice_date,
            applicable_class,
            posted_by,
            created_datetime
        FROM sgs_notice_board
        WHERE {' AND '.join(filters)}
        ORDER BY
            notice_date DESC NULLS LAST,
            created_datetime DESC NULLS LAST,
            notice_id DESC
        LIMIT 10;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, params)
                notices = cursor.fetchall()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Notice board table is missing. Confirm sgs_notice_board exists.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch notices.") from error

    return {"notices": notices}


@app.get("/notifications")
def get_notifications():
    student_query = """
        SELECT
            student_id,
            class_id,
            COALESCE(NULLIF(BTRIM(class_name), ''), class_id::text) AS class_name
        FROM sgs_student_master
        WHERE COALESCE(record_status, 'Active') = 'Active'
          AND COALESCE(is_active, true) = true
        ORDER BY
            CASE WHEN admission_no IS NULL THEN 1 ELSE 0 END,
            student_id
        LIMIT 1;
    """
    assignment_query = """
        SELECT
            a.assignment_id,
            a.assignment_title,
            a.assignment_text,
            a.due_date,
            a.class_id,
            a.subject_id,
            a.chapter_id,
            s.subject_name,
            c.chapter_name
        FROM sgs_assignment_master a
        LEFT JOIN sgs_subject_master s ON s.subject_id = a.subject_id
        LEFT JOIN sgs_chapter_master c ON c.chapter_id = a.chapter_id
        WHERE a.class_id = %s
          AND COALESCE(a.record_status, 'Active') = 'Active'
          AND a.due_date IS NOT NULL
          AND a.due_date <= %s
        ORDER BY a.due_date ASC, a.assignment_id DESC
        LIMIT 12;
    """
    notices_query = """
        SELECT
            notice_id,
            notice_title,
            notice_text,
            notice_date,
            applicable_class,
            posted_by,
            created_datetime,
            COALESCE(is_read, false) AS is_read
        FROM sgs_notice_board
        WHERE COALESCE(record_status, 'Active') = 'Active'
          AND (
            applicable_class IS NULL
            OR BTRIM(applicable_class) = ''
            OR LOWER(applicable_class) IN ('all', LOWER(%s))
          )
        ORDER BY
            COALESCE(is_read, false) ASC,
            notice_date DESC NULLS LAST,
            created_datetime DESC NULLS LAST,
            notice_id DESC
        LIMIT 10;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(student_query)
                student = cursor.fetchone()
                if student is None:
                    raise HTTPException(status_code=404, detail="No active student found.")

                cursor.execute(assignment_query, (student["class_id"], date.today() + timedelta(days=7)))
                assignment_rows = cursor.fetchall()

                cursor.execute(notices_query, (student["class_name"],))
                notice_rows = cursor.fetchall()
    except HTTPException:
        raise
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Notification source table is missing. Confirm student, assignment, subject, chapter, and notice tables exist.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch notifications.") from error

    assignments = []
    for row in assignment_rows:
        status = get_due_status(row.get("due_date"))
        assignments.append(
            {
                "type": "assignment",
                "id": f"assignment-{row['assignment_id']}",
                "assignment_id": row["assignment_id"],
                "title": row.get("assignment_title") or "Assignment",
                "body": row.get("assignment_text") or "",
                "due_date": row.get("due_date"),
                "class_id": row.get("class_id"),
                "subject_id": row.get("subject_id"),
                "chapter_id": row.get("chapter_id"),
                "subject_name": row.get("subject_name"),
                "chapter_name": row.get("chapter_name"),
                "status": status["label"],
                "priority": status["priority"],
                "days_left": status["days_left"],
                "is_countable": status["is_countable"],
            }
        )

    assignment_alert_error = None
    try:
        assignments = apply_ai_assignment_messages(assignments)
    except RuntimeError as error:
        assignments = []
        assignment_alert_error = str(error)

    notices = [
        {
            "type": "notice",
            "id": f"notice-{notice['notice_id']}",
            "notice_id": notice["notice_id"],
            "title": notice.get("notice_title") or "Notice",
            "message": notice.get("notice_text") or "-",
            "notice_date": notice.get("notice_date"),
            "applicable_class": notice.get("applicable_class") or "All",
            "is_read": bool(notice.get("is_read")),
            "priority": "low",
            "is_countable": not bool(notice.get("is_read")),
        }
        for notice in notice_rows
    ]
    notifications = [*assignments, *notices]
    count = sum(1 for item in notifications if item.get("is_countable"))

    return {
        "student": student,
        "count": count,
        "assignments": assignments,
        "notices": notices,
        "notifications": notifications,
        "assignment_alert_error": assignment_alert_error,
    }


def normalize_quiz_questions(raw_questions) -> list[dict]:
    if not isinstance(raw_questions, list):
        raise ValueError("Quiz response must include a quiz array.")

    questions = []
    for raw_item in raw_questions:
        if not isinstance(raw_item, dict):
            continue

        question = str(raw_item.get("question") or "").strip()
        options = raw_item.get("options")
        answer = raw_item.get("answer")
        explanation = str(raw_item.get("explanation") or "").strip()

        if not question or not isinstance(options, list):
            continue

        cleaned_options = [str(option).strip() for option in options if str(option).strip()]
        if len(cleaned_options) != 4:
            continue

        answer_index = None
        if isinstance(answer, int) and 0 <= answer < len(cleaned_options):
            answer_index = answer
        elif isinstance(answer, str):
            normalized_answer = answer.strip().casefold()
            for index, option in enumerate(cleaned_options):
                if option.casefold() == normalized_answer:
                    answer_index = index
                    break

        if answer_index is None:
            continue

        questions.append(
            {
                "question": question,
                "options": cleaned_options,
                "answer": answer_index,
                "explanation": explanation,
            }
        )

    if not questions:
        raise ValueError("No valid quiz questions were generated.")

    return questions


def fetch_chapter_for_quiz(chapter_id: int) -> dict:
    query = """
        SELECT
            content.chapter_id,
            COALESCE(NULLIF(BTRIM(content.content_title), ''), chapter.chapter_name, 'Chapter') AS chapter_title,
            content.full_text_content
        FROM sgs_chapter_content content
        LEFT JOIN sgs_chapter_master chapter
          ON chapter.chapter_id = content.chapter_id
        WHERE content.chapter_id = %s
          AND content.full_text_content IS NOT NULL
          AND BTRIM(content.full_text_content) <> ''
          AND COALESCE(content.is_active, true) = true
          AND COALESCE(content.record_status, 'Active') = 'Active'
        ORDER BY content.chapter_content_id
        LIMIT 1;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, (chapter_id,))
                chapter = cursor.fetchone()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Chapter content table is missing. Create sgs_chapter_content in PostgreSQL.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch chapter content.") from error

    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter content not found.")

    return chapter


@app.post("/ai/generate-quiz")
def generate_ai_quiz(payload: QuizGenerationInput):
    chapter = fetch_chapter_for_quiz(payload.chapter_id)
    content = str(chapter["full_text_content"])[:18000]
    prompt = f"""
        You are an expert school teacher. Generate {payload.question_count} multiple-choice questions
        from the chapter content below.

        Return only valid JSON in this exact shape:
        {{
          "quiz": [
            {{
              "question": "Question text",
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "answer": "Exact correct option text",
              "explanation": "One short explanation"
            }}
          ]
        }}

        Rules:
        - Use 4 options per question.
        - Make only one option correct.
        - Keep questions clear for a school student.
        - Do not include markdown or extra text.

        Chapter content:
        {content}
    """

    try:
        quiz_data = gemini_generate_json(prompt)
        questions = normalize_quiz_questions(quiz_data.get("quiz"))
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {
        "chapter_id": chapter["chapter_id"],
        "chapter_title": chapter["chapter_title"],
        "quiz": questions[: payload.question_count],
    }


@app.post("/quiz-results")
def save_quiz_result(payload: QuizResultInput):
    try:
        student = fetch_current_student_record(payload.student_email)

        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    """
                    SELECT subject_id
                    FROM sgs_chapter_content
                    WHERE chapter_id = %s
                    ORDER BY chapter_content_id DESC
                    LIMIT 1;
                    """,
                    (payload.chapter_id,),
                )
                chapter = cursor.fetchone()
                if chapter is None:
                    raise HTTPException(status_code=404, detail="Chapter content not found.")

                cursor.execute(
                    """
                    SELECT COALESCE(MAX(attempt_count), 0) + 1 AS next_attempt
                    FROM sgs_quiz_response
                    WHERE student_id = %s
                      AND chapter_id = %s
                      AND COALESCE(record_status, 'Active') = 'Active';
                    """,
                    (student["student_id"], payload.chapter_id),
                )
                attempt = cursor.fetchone()
                attempt_count = int(attempt["next_attempt"] or 1)

                cursor.execute(
                    """
                    INSERT INTO sgs_quiz_response (
                        student_id,
                        score,
                        completed_flag,
                        created_user_id,
                        record_status,
                        version_no,
                        subject_id,
                        chapter_id,
                        total_marks,
                        percentage,
                        attempt_count,
                        completed_at
                    )
                    VALUES (%s, %s, true, %s, 'Active', 1, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP)
                    RETURNING response_id, student_id, chapter_id, score, total_marks,
                              percentage, attempt_count, completed_flag, completed_at;
                    """,
                    (
                        student["student_id"],
                        payload.score,
                        str(student["student_id"]),
                        chapter.get("subject_id"),
                        payload.chapter_id,
                        payload.total_marks,
                        payload.percentage,
                        attempt_count,
                    ),
                )
                saved_result = cursor.fetchone()
            connection.commit()
    except HTTPException:
        raise
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Quiz response or chapter content table is missing.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to save quiz result.") from error

    return {"saved": True, "result": saved_result}


@app.post("/ai/generate-mock-test")
def generate_ai_mock_test(payload: MockTestGenerationInput):
    question_count = 5
    chapter = fetch_chapter_for_quiz(payload.chapter_id)
    content = str(chapter["full_text_content"])[:18000]
    prompt = f"""
        You are an expert school examiner. Generate exactly {question_count} multiple-choice
        mock-test questions from the chapter content below.

        Return only valid JSON in this exact shape:
        {{
          "quiz": [
            {{
              "question": "Question text",
              "options": ["Option A", "Option B", "Option C", "Option D"],
              "answer": "Exact correct option text",
              "explanation": "One short explanation"
            }}
          ]
        }}

        Rules:
        - Return exactly {question_count} questions.
        - Use exactly 4 options per question and make only one option correct.
        - Include 2 easy, 2 medium, and 1 challenging question.
        - Test understanding and application, not only memorization.
        - Keep language clear and appropriate for a school student.
        - Do not include markdown or extra text.

        Chapter content:
        {content}
    """

    try:
        quiz_data = gemini_generate_json(prompt)
        questions = normalize_quiz_questions(quiz_data.get("quiz"))
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    if len(questions) < question_count:
        raise HTTPException(
            status_code=502,
            detail="AI did not return exactly 5 valid mock-test questions. Please generate again.",
        )

    return {
        "chapter_id": chapter["chapter_id"],
        "chapter_title": chapter["chapter_title"],
        "question_count": question_count,
        "duration_minutes": 15,
        "quiz": questions[:question_count],
    }


@app.post("/ai/translate-text")
def translate_text(payload: TextTranslationInput):
    source_language = payload.source_language or "auto-detect"
    source_text = payload.text.strip()[:12000]
    if not source_text:
        raise HTTPException(status_code=400, detail="No text provided for translation.")

    prompt = f"""
        Translate the text into {payload.target_language}.
        Source language: {source_language}.

        Return only valid JSON in this exact shape:
        {{
          "translated_text": "translated text here"
        }}

        Rules:
        - Preserve numbers, names, and school subject terms.
        - Do not add explanations.

        Text:
        {source_text}
    """

    try:
        translation_data = gemini_generate_json(prompt, max_output_tokens=3072)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    translated_text = str(translation_data.get("translated_text") or "").strip()
    if not translated_text:
        raise HTTPException(status_code=502, detail="Gemini returned an empty translation.")

    return {
        "source_language": source_language,
        "target_language": payload.target_language,
        "translated_text": translated_text,
    }


@app.post("/ai/translate-batch")
def translate_text_batch(payload: TextTranslationBatchInput):
    source_language = payload.source_language or "auto-detect"
    cleaned_texts = [str(text).strip()[:3000] for text in payload.texts if str(text).strip()]
    if not cleaned_texts:
        raise HTTPException(status_code=400, detail="No text provided for translation.")

    prompt = f"""
        Translate each item into {payload.target_language}.
        Source language: {source_language}.

        Return only valid JSON in this exact shape:
        {{
          "translations": ["translation for item 1", "translation for item 2"]
        }}

        Rules:
        - Keep the same number and order of translations as the input list.
        - Preserve numbers, names, and school subject terms.
        - Do not add explanations.

        Input list:
        {json.dumps(cleaned_texts, ensure_ascii=False)}
    """

    try:
        translation_data = gemini_generate_json(prompt, max_output_tokens=4096)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    translations = translation_data.get("translations")
    if not isinstance(translations, list):
        raise HTTPException(status_code=502, detail="Gemini returned an invalid translation list.")

    normalized = [str(item).strip() for item in translations]
    if len(normalized) != len(cleaned_texts):
        raise HTTPException(status_code=502, detail="Gemini returned a mismatched translation list.")

    return {
        "source_language": source_language,
        "target_language": payload.target_language,
        "translations": normalized,
    }


def build_learning_profile_payload(profile: LearningProfileInput):
    classification = classify_reader(
        profile.reading_time_minutes,
        profile.quiz_score,
        profile.retry_count,
        profile.comprehension_score,
    )
    metrics = {
        "reading_time_minutes": profile.reading_time_minutes,
        "quiz_score": profile.quiz_score,
        "retry_count": profile.retry_count,
        "comprehension_score": profile.comprehension_score,
    }
    try:
        path = get_learning_path_generator().generate_path(
            profile.chapter_title,
            classification,
            metrics,
        )
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return classification, path


def normalize_percent(value) -> float:
    if value is None:
        return 0.0

    numeric_value = float(value)
    if numeric_value <= 20:
        return round(numeric_value * 5, 2)

    return round(min(numeric_value, 100), 2)


def calculate_performance_summary(student_id: int) -> dict:
    query = """
        SELECT
            (
                SELECT AVG(percentage)
                FROM sgs_assignment_results
                WHERE student_id = %(student_id)s
            ) AS assignment_marks,
            (
                SELECT AVG(COALESCE(percentage, score))
                FROM sgs_quiz_response
                WHERE student_id = %(student_id)s
                  AND COALESCE(completed_flag, true) = true
            ) AS quiz_score,
            (
                SELECT GREATEST(COUNT(*) - 1, 0)
                FROM sgs_quiz_response
                WHERE student_id = %(student_id)s
                  AND COALESCE(completed_flag, true) = true
            ) AS retry_count,
            (
                SELECT AVG((marks_obtained / NULLIF(max_marks, 0)) * 100)
                FROM sgs_student_marks
                WHERE student_id = %(student_id)s
                  AND COALESCE(record_status, 'Active') = 'Active'
            ) AS unit_test_marks;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, {"student_id": student_id})
                row = cursor.fetchone() or {}
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Performance tables are missing. Confirm sgs_assignment_results, sgs_quiz_response, and sgs_student_marks exist.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch performance summary.") from error

    metrics = {
        "assignment_marks": normalize_percent(row.get("assignment_marks")),
        "quiz_score": normalize_percent(row.get("quiz_score")),
        "unit_test_marks": normalize_percent(row.get("unit_test_marks")),
        "retry_count": int(row.get("retry_count") or 0),
    }
    classification = classify_performance(**metrics)

    return {
        "student_id": student_id,
        **metrics,
        "classification": classification,
    }


@app.get("/student-performance-summary")
def get_student_performance_summary(
    student_id: int = Query(..., ge=1),
):
    return calculate_performance_summary(student_id)


@app.post("/learning-path/generate-overall")
def generate_overall_learning_path(payload: PerformanceLearningPathInput):
    metrics = {
        "assignment_marks": round(payload.assignment_marks, 2),
        "quiz_score": round(payload.quiz_score, 2),
        "unit_test_marks": round(payload.unit_test_marks, 2),
        "retry_count": payload.retry_count,
    }
    classification = classify_performance(**metrics)

    try:
        path = get_learning_path_generator().generate_path(
            "Overall Performance",
            classification,
            metrics,
        )
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {
        "student_id": payload.student_id,
        "classification": classification,
        "metrics": metrics,
        "learning_path": path,
    }


@app.post("/ai/generate-study-content")
def generate_study_content(payload: StudyContentGenerationInput):
    performance = calculate_performance_summary(payload.student_id)
    classification = payload.classification or performance["classification"]

    query = """
        SELECT
            chapter_content_id,
            content_title,
            full_text_content
        FROM sgs_chapter_content
        WHERE chapter_content_id = %s
          AND full_text_content IS NOT NULL
          AND BTRIM(full_text_content) <> ''
        LIMIT 1;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, (payload.chapter_content_id,))
                chapter = cursor.fetchone()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Chapter content table is missing. Confirm sgs_chapter_content exists.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch chapter content.") from error

    if chapter is None:
        raise HTTPException(status_code=404, detail="Chapter content not found.")

    chapter_text = str(chapter["full_text_content"])[:18000]
    prompt = f"""
        You are an expert school teacher. Generate personalized study content for a student.

        Learner type: {classification}
        Chapter title: {chapter["content_title"]}
        Overall performance metrics:
        {json.dumps({key: performance[key] for key in ["assignment_marks", "quiz_score", "unit_test_marks", "retry_count"]})}

        Return only valid JSON in this exact shape:
        {{
          "simple_notes": ["5 to 8 clear bullet notes"],
          "key_terms": [{{"term": "term", "meaning": "short meaning"}}],
          "recap": "short recap paragraph",
          "practice_questions": ["4 to 6 practice questions"]
        }}

        Rules:
        - For Fast Reader, keep notes concise and add challenging practice.
        - For Average Reader, use balanced explanation and checkpoint questions.
        - For Slow Reader, use simple words, smaller points, and easier questions.
        - Use only the chapter content below.

        Chapter content:
        {chapter_text}
    """

    try:
        generated_content = gemini_generate_json(prompt, max_output_tokens=4096)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {
        "student_id": payload.student_id,
        "chapter_content_id": payload.chapter_content_id,
        "chapter_title": chapter["content_title"],
        "classification": classification,
        "generated_content": generated_content,
    }


@app.get("/chapter-content")
def get_chapter_content(
    chapter_content_id: int | None = Query(default=None, ge=1),
    subject: str | None = Query(default=None, min_length=1),
    lesson: str | None = Query(default=None, min_length=1),
):
    if chapter_content_id is not None:
        query = """
            SELECT
                chapter_content_id,
                chapter_id,
                class_id,
                subject_id,
                content_title,
                full_text_content
            FROM sgs_chapter_content
            WHERE chapter_content_id = %s
              AND full_text_content IS NOT NULL
              AND BTRIM(full_text_content) <> ''
            LIMIT 1;
        """

        try:
            with get_connection() as connection:
                with connection.cursor(row_factory=dict_row) as cursor:
                    cursor.execute(query, (chapter_content_id,))
                    row = cursor.fetchone()
        except psycopg.errors.UndefinedTable as error:
            raise HTTPException(
                status_code=500,
                detail="Chapter content table is missing. Create sgs_chapter_content in PostgreSQL.",
            ) from error
        except psycopg.Error as error:
            raise HTTPException(
                status_code=500,
                detail="Unable to fetch chapter content.",
            ) from error

        if row is None:
            raise HTTPException(
                status_code=404,
                detail="No chapter content found for this selection.",
            )

        return row

    if subject is None or lesson is None:
        raise HTTPException(
            status_code=400,
            detail="Select a chapter before loading content.",
        )

    normalized_subject = subject.strip().casefold()
    normalized_lesson = lesson.strip().casefold()

    if normalized_subject != "social science":
        raise HTTPException(
            status_code=404,
            detail="No chapter content found for this subject yet.",
        )

    if normalized_lesson not in {"lesson 1", "lesson 1 +"}:
        raise HTTPException(
            status_code=404,
            detail="No chapter content found for this lesson yet.",
        )

    query = """
        SELECT full_text_content
        FROM sgs_chapter_content
        WHERE full_text_content IS NOT NULL
          AND BTRIM(full_text_content) <> ''
        LIMIT 1;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query)
                row = cursor.fetchone()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Chapter content table is missing. Create sgs_chapter_content in PostgreSQL.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(
            status_code=500,
            detail="Unable to fetch chapter content.",
        ) from error

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="No chapter content found for this selection.",
        )

    return {
        "chapter_id": 1,
        "content_title": "Lesson 1",
        "full_text_content": row["full_text_content"],
    }


@app.post("/learning-path/generate")
def generate_learning_path(profile: LearningProfileInput):
    """Return an AI learning path without saving it."""
    classification, path = build_learning_profile_payload(profile)

    return {
        "student_id": profile.student_id,
        "chapter_id": profile.chapter_id,
        "classification": classification,
        "learning_path": path,
    }


@app.post("/student-learning-profile")
def save_student_learning_profile(profile: LearningProfileInput):
    """Save the latest learning profile for a student/chapter pair."""
    classification, path = build_learning_profile_payload(profile)

    query = """
        INSERT INTO sgs_student_learning_profiles (
            student_id,
            chapter_id,
            chapter_title,
            reading_time_minutes,
            quiz_score,
            retry_count,
            comprehension_score,
            reader_classification,
            generated_path
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (student_id, chapter_id)
        DO UPDATE SET
            chapter_title = EXCLUDED.chapter_title,
            reading_time_minutes = EXCLUDED.reading_time_minutes,
            quiz_score = EXCLUDED.quiz_score,
            retry_count = EXCLUDED.retry_count,
            comprehension_score = EXCLUDED.comprehension_score,
            reader_classification = EXCLUDED.reader_classification,
            generated_path = EXCLUDED.generated_path,
            updated_at = NOW()
        RETURNING *;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    query,
                    (
                        profile.student_id,
                        profile.chapter_id,
                        profile.chapter_title,
                        profile.reading_time_minutes,
                        profile.quiz_score,
                        profile.retry_count,
                        profile.comprehension_score,
                        classification,
                        Jsonb(path),
                    ),
                )
                saved_profile = cursor.fetchone()
                connection.commit()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Learning profile table is missing. Run backend/migrations/001_ai_learning_path.sql manually.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(
            status_code=500,
            detail="Unable to save student learning profile.",
        ) from error

    return {
        "profile": saved_profile,
        "learning_path": path,
    }


@app.get("/student-learning-profile")
def get_student_learning_profile(
    student_id: int = Query(..., ge=1),
    chapter_id: int = Query(..., ge=1),
):
    query = """
        SELECT *
        FROM sgs_student_learning_profiles
        WHERE student_id = %s AND chapter_id = %s
        LIMIT 1;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, (student_id, chapter_id))
                profile = cursor.fetchone()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Learning profile table is missing. Run backend/migrations/001_ai_learning_path.sql manually.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(
            status_code=500,
            detail="Unable to fetch student learning profile.",
        ) from error

    if profile is None:
        raise HTTPException(status_code=404, detail="No learning profile found for this student and chapter.")

    return {"profile": profile}
