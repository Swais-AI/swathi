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


LESSON_TO_CHAPTER_ID = {
    "Lesson 1": 1,
}

load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

app = FastAPI(title="SGS Chapter Content API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ],
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
    if subject != "Social Science":
        raise HTTPException(
            status_code=404,
            detail="No chapter content found for this subject yet.",
        )

    chapter_id = LESSON_TO_CHAPTER_ID.get(lesson)
    if chapter_id is None:
        raise HTTPException(
            status_code=404,
            detail="No chapter content found for this lesson yet.",
        )

    query = """
        SELECT content_title, full_text_content
        FROM sgs_chapter_content
        WHERE chapter_id = %s
        LIMIT 1;
    """

    with get_connection() as connection:
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(query, (chapter_id,))
            row = cursor.fetchone()

    if row is None:
        raise HTTPException(
            status_code=404,
            detail="No chapter content found for this selection.",
        )

    return {
        "chapter_id": chapter_id,
        "content_title": row["content_title"],
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
