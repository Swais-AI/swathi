import os
import base64
import binascii
import io
import json
import re
import wave
from contextlib import contextmanager
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from backend.ai_learning_path_service import MockLearningPathLLM, classify_reader, get_learning_path_generator


load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

app = FastAPI(title="SGS Chapter Content API")


def get_cors_origins() -> list[str]:
    configured_origins = os.getenv("CORS_ALLOW_ORIGINS", "")
    if configured_origins:
        return [
            origin.strip().rstrip("/")
            for origin in configured_origins.split(",")
            if origin.strip()
        ]

    return [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
        "http://localhost:3004",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
        "http://127.0.0.1:3002",
        "http://127.0.0.1:3003",
        "http://127.0.0.1:3004",
    ]


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


class AssignmentSubmissionInput(BaseModel):
    student_id: int = Field(..., ge=1)
    assignment_id: int = Field(..., ge=1)
    assignment_title: str = Field(..., min_length=1, max_length=180)
    typed_answer: str | None = Field(default=None, max_length=20000)
    file_name: str | None = Field(default=None, max_length=255)
    file_type: str | None = Field(default=None, max_length=120)
    file_size: int | None = Field(default=None, ge=0, le=10 * 1024 * 1024)
    file_content_base64: str | None = None


class QuizGenerationInput(BaseModel):
    chapter_id: int = Field(..., ge=1)
    question_count: int = Field(default=5, ge=3, le=10)


class TextTranslationInput(BaseModel):
    text: str = Field(..., min_length=1, max_length=12000)
    target_language: str = Field(..., min_length=2, max_length=80)
    source_language: str | None = Field(default=None, max_length=80)


class TextTranslationBatchInput(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=80)
    target_language: str = Field(..., min_length=2, max_length=80)
    source_language: str | None = Field(default=None, max_length=80)


class TextToSpeechInput(BaseModel):
    text: str = Field(..., min_length=1, max_length=12000)
    language: str = Field(..., min_length=2, max_length=80)


class SpeechToTextInput(BaseModel):
    audio_base64: str = Field(..., min_length=1)
    mime_type: str = Field(..., min_length=3, max_length=120)
    language: str = Field(default="English", min_length=2, max_length=80)


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
def get_current_student():
    query = """
        SELECT
            student.student_id,
            student.full_name,
            student.roll_no,
            student.admission_no,
            COALESCE(class.class_name, student.class_id::text) AS class_name,
            COALESCE(student.section, class.section_name) AS section
        FROM sgs_student_master student
        LEFT JOIN sgs_class_master class
          ON class.class_id = student.class_id
        WHERE COALESCE(student.record_status, 'Active') = 'Active'
          AND COALESCE(student.is_active, true) = true
        ORDER BY
            CASE WHEN student.admission_no IS NULL THEN 1 ELSE 0 END,
            student.student_id
        LIMIT 1;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query)
                student = cursor.fetchone()
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

    if student is None:
        raise HTTPException(status_code=404, detail="No active student found.")

    return {"student": student}


def decode_submission_file(submission: AssignmentSubmissionInput) -> bytes | None:
    if not submission.file_content_base64:
        return None

    try:
        file_content = base64.b64decode(submission.file_content_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise HTTPException(status_code=400, detail="Uploaded file content is invalid.") from error

    if len(file_content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Uploaded file must be 10 MB or smaller.")

    return file_content


@app.post("/assignment-submissions")
def submit_assignment(submission: AssignmentSubmissionInput):
    typed_answer = (submission.typed_answer or "").strip()
    file_content = decode_submission_file(submission)

    if not typed_answer and file_content is None:
        raise HTTPException(status_code=400, detail="Type an answer or upload a file before submitting.")

    if file_content is not None and not submission.file_name:
        raise HTTPException(status_code=400, detail="Uploaded file name is required.")

    query = """
        INSERT INTO sgs_assignment_submissions (
            student_id,
            assignment_id,
            assignment_title,
            typed_answer,
            file_name,
            file_type,
            file_size,
            file_content,
            status
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'Submitted')
        RETURNING
            id,
            student_id,
            assignment_id,
            assignment_title,
            typed_answer,
            file_name,
            file_type,
            file_size,
            status,
            submitted_at;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(
                    query,
                    (
                        submission.student_id,
                        submission.assignment_id,
                        submission.assignment_title,
                        typed_answer or None,
                        submission.file_name,
                        submission.file_type,
                        len(file_content) if file_content is not None else None,
                        file_content,
                    ),
                )
                saved_submission = cursor.fetchone()
                connection.commit()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Assignment submission table is missing. Create sgs_assignment_submissions in PostgreSQL.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to save assignment submission.") from error

    return {"submission": saved_submission}


@app.get("/assignment-submissions")
def get_assignment_submissions(
    student_id: int = Query(..., ge=1),
    assignment_id: int | None = Query(default=None, ge=1),
):
    filters = ["student_id = %s"]
    params: list[int] = [student_id]

    if assignment_id is not None:
        filters.append("assignment_id = %s")
        params.append(assignment_id)

    query = f"""
        SELECT
            id,
            student_id,
            assignment_id,
            assignment_title,
            typed_answer,
            file_name,
            file_type,
            file_size,
            status,
            submitted_at
        FROM sgs_assignment_submissions
        WHERE {' AND '.join(filters)}
        ORDER BY submitted_at DESC
        LIMIT 20;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, params)
                submissions = cursor.fetchall()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Assignment submission table is missing. Create sgs_assignment_submissions in PostgreSQL.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch assignment submissions.") from error

    return {"submissions": submissions}


@app.get("/assignments")
def get_assignments(student_id: int | None = None):
    submission_join = ""
    submission_status_select = "NULL::text AS submission_status, NULL::timestamptz AS submitted_at"
    params: list[int] = []

    if student_id is not None:
        submission_join = """
            LEFT JOIN LATERAL (
                SELECT status, submitted_at
                FROM sgs_assignment_submissions submission
                WHERE submission.assignment_id = assignment.assignment_id
                  AND submission.student_id = %s
                ORDER BY submitted_at DESC
                LIMIT 1
            ) latest_submission ON true
        """
        submission_status_select = "latest_submission.status AS submission_status, latest_submission.submitted_at"
        params.append(student_id)

    query = f"""
        SELECT
            assignment.assignment_id,
            assignment.chapter_id,
            assignment.assignment_title,
            assignment.assignment_text,
            assignment.due_date,
            COALESCE(assignment.record_status, 'Active') AS record_status,
            {submission_status_select}
        FROM sgs_assignment_master assignment
        {submission_join}
        WHERE COALESCE(assignment.record_status, 'Active') = 'Active'
        ORDER BY
            CASE WHEN assignment.due_date IS NULL THEN 1 ELSE 0 END,
            assignment.due_date,
            assignment.assignment_id;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, params)
                assignments = cursor.fetchall()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Assignment master table is missing. Create sgs_assignment_master in PostgreSQL.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch assignments.") from error

    return {"assignments": assignments}


@app.get("/assignment-feedback")
def get_assignment_feedback(student_id: int | None = Query(default=None, ge=1)):
    filters = ["COALESCE(submission.record_status, 'Active') = 'Active'"]
    params: list[int] = []

    if student_id is not None:
        filters.append("submission.student_id = %s")
        params.append(student_id)

    query = f"""
        SELECT
            submission.submission_id,
            submission.assignment_id,
            submission.student_id,
            COALESCE(assignment.assignment_title, 'Assignment') AS assignment_title,
            submission.submission_text,
            submission.file_path,
            submission.marks_obtained,
            submission.teacher_remarks,
            submission.submitted_at,
            COALESCE(submission.record_status, 'Active') AS record_status
        FROM sgs_student_submission submission
        LEFT JOIN sgs_assignment_master assignment
          ON assignment.assignment_id = submission.assignment_id
        WHERE {' AND '.join(filters)}
        ORDER BY
            CASE WHEN submission.submitted_at IS NULL THEN 1 ELSE 0 END,
            submission.submitted_at DESC,
            submission.submission_id DESC;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, params)
                feedback = cursor.fetchall()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Student submission table is missing. Create sgs_student_submission in PostgreSQL.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch assignment feedback.") from error

    return {"feedback": feedback}


@app.get("/assessment-feedback")
def get_assessment_feedback(student_id: int | None = Query(default=None, ge=1)):
    filters = ["COALESCE(response.record_status, 'Active') = 'Active'"]
    params: list[int] = []

    if student_id is not None:
        filters.append("response.student_id = %s")
        params.append(student_id)

    query = f"""
        SELECT
            response.response_id,
            response.quiz_id,
            response.student_id,
            COALESCE(quiz.quiz_title, 'Assessment') AS assessment_title,
            COALESCE(quiz.total_marks, 100) AS total_marks,
            response.score,
            COALESCE(response.completed_flag, false) AS completed_flag,
            response.created_datetime
        FROM sgs_quiz_response response
        LEFT JOIN sgs_quiz_master quiz
          ON quiz.quiz_id = response.quiz_id
        WHERE {' AND '.join(filters)}
          AND COALESCE(quiz.record_status, 'Active') = 'Active'
        ORDER BY response.created_datetime DESC NULLS LAST, response.response_id DESC;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, params)
                feedback = cursor.fetchall()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Assessment tables are missing. Confirm sgs_quiz_master and sgs_quiz_response exist.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch assessment feedback.") from error

    return {"feedback": feedback}


@app.get("/student-analysis")
def get_student_analysis(student_id: int | None = Query(default=None, ge=1)):
    filters = ["COALESCE(response.record_status, 'Active') = 'Active'"]
    params: list[int] = []

    if student_id is not None:
        filters.append("response.student_id = %s")
        params.append(student_id)

    where_clause = " AND ".join(filters)
    rows_query = f"""
        SELECT
            response.response_id,
            response.quiz_id,
            COALESCE(quiz.quiz_title, 'Assessment') AS assessment_title,
            COALESCE(quiz.total_marks, 100) AS total_marks,
            response.score,
            COALESCE(response.completed_flag, false) AS completed_flag,
            response.created_datetime
        FROM sgs_quiz_response response
        LEFT JOIN sgs_quiz_master quiz
          ON quiz.quiz_id = response.quiz_id
        WHERE {where_clause}
          AND COALESCE(quiz.record_status, 'Active') = 'Active'
        ORDER BY response.created_datetime NULLS LAST, response.response_id;
    """
    summary_query = f"""
        SELECT
            COUNT(*) AS assessment_count,
            COALESCE(ROUND(AVG((response.score / NULLIF(COALESCE(quiz.total_marks, 100), 0)) * 100), 2), 0) AS average_percent,
            COALESCE(MAX((response.score / NULLIF(COALESCE(quiz.total_marks, 100), 0)) * 100), 0) AS best_percent,
            COALESCE(MIN((response.score / NULLIF(COALESCE(quiz.total_marks, 100), 0)) * 100), 0) AS lowest_percent
        FROM sgs_quiz_response response
        LEFT JOIN sgs_quiz_master quiz
          ON quiz.quiz_id = response.quiz_id
        WHERE {where_clause}
          AND COALESCE(quiz.record_status, 'Active') = 'Active';
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(rows_query, params)
                assessments = cursor.fetchall()
                cursor.execute(summary_query, params)
                summary = cursor.fetchone()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Assessment tables are missing. Confirm sgs_quiz_master and sgs_quiz_response exist.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch student analysis.") from error

    return {"summary": summary, "assessments": assessments}


@app.get("/teacher-remarks")
def get_teacher_remarks(student_id: int | None = Query(default=None, ge=1)):
    filters = ["COALESCE(submission.record_status, 'Active') = 'Active'"]
    params: list[int] = []

    if student_id is not None:
        filters.append("submission.student_id = %s")
        params.append(student_id)

    query = f"""
        SELECT
            submission.submission_id,
            submission.assignment_id,
            COALESCE(assignment.assignment_title, 'Assignment') AS item_title,
            submission.marks_obtained,
            submission.teacher_remarks,
            submission.submitted_at,
            teacher.full_name AS teacher_name
        FROM sgs_student_submission submission
        LEFT JOIN sgs_assignment_master assignment
          ON assignment.assignment_id = submission.assignment_id
        LEFT JOIN sgs_teacher_master teacher
          ON teacher.is_active = true
        WHERE {' AND '.join(filters)}
          AND NULLIF(BTRIM(COALESCE(submission.teacher_remarks, '')), '') IS NOT NULL
        ORDER BY submission.submitted_at DESC NULLS LAST, submission.submission_id DESC;
    """

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                cursor.execute(query, params)
                remarks = cursor.fetchall()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Teacher remark tables are missing. Confirm sgs_student_submission and sgs_teacher_master exist.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch teacher remarks.") from error

    return {"remarks": remarks}


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
        path = MockLearningPathLLM().generate_path(
            profile.chapter_title,
            classification,
            metrics,
        )
        path["provider_error"] = str(error)

    return classification, path


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
            "temperature": 0.35,
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
        except (KeyError, IndexError, json.JSONDecodeError, ValueError) as error:
            errors.append(f"{model_name}: Gemini returned an invalid JSON response.")
            continue

    raise RuntimeError("Gemini quiz generation failed. " + " | ".join(errors))


def find_inline_audio_part(value):
    if isinstance(value, dict):
        inline_data = value.get("inlineData") or value.get("inline_data")
        if isinstance(inline_data, dict):
            data = inline_data.get("data")
            mime_type = inline_data.get("mimeType") or inline_data.get("mime_type") or "audio/wav"
            if data:
                return data, mime_type

        for child in value.values():
            found = find_inline_audio_part(child)
            if found:
                return found

    if isinstance(value, list):
        for child in value:
            found = find_inline_audio_part(child)
            if found:
                return found

    return None


def gemini_generate_audio(text: str, language: str) -> tuple[bytes, str]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    base_url = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com").rstrip("/")
    model_name = os.getenv("GEMINI_TTS_MODEL", "gemini-2.5-flash-preview-tts")
    voice_name = os.getenv("GEMINI_TTS_VOICE", "Kore")
    model = quote(model_name.strip(), safe="")
    cleaned_text = text.strip()[:12000]

    prompt = f"""
        Read the following {language} study content aloud for a school student.
        Use clear pronunciation and a natural classroom teaching tone.
        Return audio only.

        Text:
        {cleaned_text}
    """
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": voice_name,
                    }
                }
            },
        },
    }
    request = Request(
        f"{base_url}/v1beta/models/{model}:generateContent?key={api_key}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=45) as response:
            body = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            error_body = json.loads(error.read().decode("utf-8"))
            message = error_body.get("error", {}).get("message")
        except (json.JSONDecodeError, UnicodeDecodeError):
            message = None
        raise RuntimeError(message or f"Gemini TTS API error {error.code}.") from error
    except URLError as error:
        raise RuntimeError(f"Gemini TTS connection failed: {error.reason}") from error

    audio_part = find_inline_audio_part(body)
    if not audio_part:
        raise RuntimeError("Gemini did not return audio data.")

    audio_base64, mime_type = audio_part
    try:
        audio_bytes = base64.b64decode(audio_base64)
    except (binascii.Error, ValueError) as error:
        raise RuntimeError("Gemini returned invalid audio data.") from error

    if "audio/l16" in mime_type.lower() or "audio/pcm" in mime_type.lower():
      rate_match = re.search(r"rate=(\d+)", mime_type)
      sample_rate = int(rate_match.group(1)) if rate_match else 24000
      wav_buffer = io.BytesIO()
      with wave.open(wav_buffer, "wb") as wav_file:
          wav_file.setnchannels(1)
          wav_file.setsampwidth(2)
          wav_file.setframerate(sample_rate)
          wav_file.writeframes(audio_bytes)
      return wav_buffer.getvalue(), "audio/wav"

    return audio_bytes, mime_type


def gemini_transcribe_audio(audio_base64: str, mime_type: str, language: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    try:
        base64.b64decode(audio_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise RuntimeError("Invalid audio data.") from error

    base_url = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com").rstrip("/")
    model_name = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    model = quote(model_name.strip(), safe="")
    payload = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {
                        "text": (
                            f"Transcribe this {language} student voice input for a search box. "
                            "Return only valid JSON in this exact shape: "
                            "{\"transcript\":\"spoken words\"}. Do not add explanations."
                        )
                    },
                    {
                        "inlineData": {
                            "mimeType": mime_type,
                            "data": audio_base64,
                        }
                    },
                ],
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0,
            "maxOutputTokens": 512,
        },
    }
    request = Request(
        f"{base_url}/v1beta/models/{model}:generateContent?key={api_key}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=45) as response:
            body = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        try:
            error_body = json.loads(error.read().decode("utf-8"))
            message = error_body.get("error", {}).get("message")
        except (json.JSONDecodeError, UnicodeDecodeError):
            message = None
        raise RuntimeError(message or f"Gemini speech-to-text API error {error.code}.") from error
    except URLError as error:
        raise RuntimeError(f"Gemini speech-to-text connection failed: {error.reason}") from error

    try:
        parts = body["candidates"][0]["content"]["parts"]
        content = "\n".join(part.get("text", "") for part in parts).strip()
        transcript_data = extract_json_object(content)
    except (KeyError, IndexError, json.JSONDecodeError, ValueError) as error:
        raise RuntimeError("Gemini returned an invalid transcript response.") from error

    transcript = str(transcript_data.get("transcript") or "").strip()
    if not transcript:
        raise RuntimeError("Gemini returned an empty transcript.")

    return transcript


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


@app.post("/ai/translate-text")
def translate_text(payload: TextTranslationInput):
    source_language = payload.source_language or "auto-detect"
    prompt = f"""
        Translate the text into {payload.target_language}.
        Source language: {source_language}.

        Return only valid JSON in this exact shape:
        {{
          "translated_text": "translated text here"
        }}

        Preserve meaning, names, numbers, and school subject terms. Do not add explanations.

        Text:
        {payload.text}
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


@app.post("/ai/text-to-speech")
def text_to_speech(payload: TextToSpeechInput):
    try:
        audio_bytes, mime_type = gemini_generate_audio(payload.text, payload.language)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return Response(
        content=audio_bytes,
        media_type=mime_type,
        headers={"Cache-Control": "no-store"},
    )


@app.post("/ai/speech-to-text")
def speech_to_text(payload: SpeechToTextInput):
    try:
        transcript = gemini_transcribe_audio(payload.audio_base64, payload.mime_type, payload.language)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {
        "language": payload.language,
        "transcript": transcript,
    }


@app.get("/chapter-content")
def get_chapter_content(
    subject: str = Query(..., min_length=1),
    lesson: str = Query(..., min_length=1),
):
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


def get_table_columns(cursor, table_name: str) -> set[str]:
    cursor.execute(
        """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = %s;
        """,
        (table_name,),
    )
    return {row["column_name"] for row in cursor.fetchall()}


def first_existing_column(columns: set[str], candidates: list[str]) -> str | None:
    return next((column for column in candidates if column in columns), None)


def build_file_metadata_join(cursor) -> tuple[str, str, str]:
    file_table = None
    file_columns: set[str] = set()

    for table_name in ("sgs_file_storage_metadata", "sgs_file_repository"):
        columns = get_table_columns(cursor, table_name)
        if columns:
            file_table = table_name
            file_columns = columns
            break

    if file_table is None:
        return "", "NULL::text AS file_name, NULL::text AS file_link", ""

    entity_id_column = first_existing_column(file_columns, ["entity_id", "reference_id", "related_id", "chapter_content_id", "chapter_id"])
    if entity_id_column is None:
        return "", "NULL::text AS file_name, NULL::text AS file_link", ""

    name_column = first_existing_column(file_columns, ["file_name", "original_file_name", "display_name", "filename", "name", "title"])
    link_column = first_existing_column(file_columns, ["file_url", "file_path", "storage_path", "path", "url", "link"])
    status_column = first_existing_column(file_columns, ["record_status", "status"])
    active_column = first_existing_column(file_columns, ["is_active", "active"])
    entity_type_column = first_existing_column(file_columns, ["entity_type", "reference_type", "module_name"])

    join_conditions = [
        f"file_meta.{entity_id_column} IN (content.chapter_content_id, content.chapter_id)"
    ]

    if entity_type_column is not None:
        join_conditions.append(
            f"(file_meta.{entity_type_column} IS NULL OR LOWER(file_meta.{entity_type_column}::text) IN ('chapter_content', 'study_material', 'chapter'))"
        )
    if status_column is not None:
        join_conditions.append(f"COALESCE(file_meta.{status_column}, 'Active') = 'Active'")
    if active_column is not None:
        join_conditions.append(f"COALESCE(file_meta.{active_column}, true) = true")

    select_name = f"file_meta.{name_column}::text" if name_column else "NULL::text"
    select_link = f"file_meta.{link_column}::text" if link_column else "NULL::text"
    join_sql = f"LEFT JOIN {file_table} file_meta ON {' AND '.join(join_conditions)}"

    return join_sql, f"{select_name} AS file_name, {select_link} AS file_link", file_table


@app.get("/study-materials")
def get_study_materials(
    student_class: str = Query(..., min_length=1),
    subject: str = Query(..., min_length=1),
    chapter: str = Query(..., min_length=1),
):
    query_params = {
        "student_class": student_class.strip(),
        "subject": subject.strip(),
        "chapter": chapter.strip(),
    }

    try:
        chapter_id = int(query_params["chapter"])
    except ValueError:
        chapter_id = None

    try:
        with get_connection() as connection:
            with connection.cursor(row_factory=dict_row) as cursor:
                file_join_sql, file_select_sql, file_source = build_file_metadata_join(cursor)
                query = f"""
                    SELECT
                        content.chapter_content_id,
                        content.chapter_id,
                        COALESCE(NULLIF(BTRIM(content.content_format), ''), 'Text') AS content_type,
                        COALESCE(NULLIF(BTRIM(content.content_title), ''), chapter.chapter_name, 'Study Material') AS title,
                        COALESCE(NULLIF(BTRIM(chapter.chapter_description), ''), NULLIF(BTRIM(LEFT(content.full_text_content, 180)), '')) AS description,
                        {file_select_sql}
                    FROM sgs_chapter_content content
                    LEFT JOIN sgs_chapter_master chapter
                      ON chapter.chapter_id = content.chapter_id
                    LEFT JOIN sgs_subject_master subject
                      ON subject.subject_id = chapter.subject_id
                    LEFT JOIN sgs_class_master class
                      ON class.class_id = subject.class_id
                    {file_join_sql}
                    WHERE (
                        LOWER(COALESCE(class.class_name, '')) = LOWER(%(student_class)s)
                        OR class.class_id::text = %(student_class)s
                        OR class.class_id IS NULL
                    )
                      AND (
                        LOWER(COALESCE(subject.subject_name, '')) = LOWER(%(subject)s)
                        OR subject.subject_id IS NULL
                      )
                      AND (
                        content.chapter_id::text = %(chapter)s
                        OR LOWER(COALESCE(chapter.chapter_name, content.content_title, '')) = LOWER(%(chapter)s)
                        OR (%(chapter_id)s IS NOT NULL AND content.chapter_id = %(chapter_id)s)
                      )
                      AND COALESCE(content.is_active, true) = true
                      AND COALESCE(content.record_status, 'Active') = 'Active'
                      AND COALESCE(chapter.record_status, 'Active') = 'Active'
                      AND COALESCE(subject.record_status, 'Active') = 'Active'
                      AND COALESCE(class.record_status, 'Active') = 'Active'
                    ORDER BY content.chapter_content_id;
                """
                cursor.execute(query, {**query_params, "chapter_id": chapter_id})
                materials = cursor.fetchall()
    except psycopg.errors.UndefinedTable as error:
        raise HTTPException(
            status_code=500,
            detail="Study material tables are missing. Confirm sgs_chapter_content and sgs_file_storage_metadata exist in PostgreSQL.",
        ) from error
    except psycopg.errors.UndefinedColumn as error:
        raise HTTPException(
            status_code=500,
            detail="Study material table columns do not match the expected schema.",
        ) from error
    except psycopg.Error as error:
        raise HTTPException(status_code=500, detail="Unable to fetch study material.") from error

    return {
        "filters": query_params,
        "file_source": file_source or None,
        "materials": materials,
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
