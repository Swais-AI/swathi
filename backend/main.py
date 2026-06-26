import os
from contextlib import contextmanager
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from ai_learning_path_service import classify_reader, get_learning_path_generator


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
            student_id,
            full_name,
            roll_no,
            admission_no,
            COALESCE(NULLIF(BTRIM(class_name), ''), class_id::text) AS class_name,
            section
        FROM sgs_student_master
        WHERE COALESCE(record_status, 'Active') = 'Active'
          AND COALESCE(is_active, true) = true
        ORDER BY
            CASE WHEN admission_no IS NULL THEN 1 ELSE 0 END,
            student_id
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
        raise HTTPException(status_code=502, detail=str(error)) from error

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
