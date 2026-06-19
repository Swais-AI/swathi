import os
import base64
import binascii
from contextlib import contextmanager
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
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
        "http://localhost:3004",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
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
