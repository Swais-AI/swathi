import json
import os
import re
from contextlib import contextmanager
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


class QuizGenerationInput(BaseModel):
    chapter_id: int = Field(..., ge=1)
    question_count: int = Field(default=5, ge=3, le=10)


class TextTranslationInput(BaseModel):
    text: str = Field(..., min_length=1, max_length=12000)
    target_language: str = Field(..., min_length=2, max_length=80)
    source_language: str | None = Field(default=None, max_length=80)


class LearningContentGenerationInput(BaseModel):
    student_id: int = Field(..., ge=1)
    chapter_id: int = Field(..., ge=1)
    chapter_title: str = Field(..., min_length=1, max_length=160)
    classification: str = Field(..., min_length=1, max_length=40)
    focus_area: str | None = Field(default=None, max_length=500)
    steps: list[str] = Field(default_factory=list, max_length=8)


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


def gemini_generate_json(prompt: str, max_output_tokens: int = 4096) -> dict:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    base_url = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com").rstrip("/")
    primary_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    fallback_models = os.getenv("GEMINI_FALLBACK_MODELS", "gemini-2.0-flash,gemini-2.0-flash-lite")
    model_names = []
    for model_name in [primary_model, *fallback_models.split(",")]:
        cleaned_name = model_name.strip()
        if cleaned_name and cleaned_name not in model_names:
            model_names.append(cleaned_name)

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": max_output_tokens,
            "responseMimeType": "application/json",
        },
    }
    request_body = json.dumps(payload).encode("utf-8")
    last_error = None

    for model_name in model_names:
        model = quote(model_name, safe="")
        url = f"{base_url}/v1beta/models/{model}:generateContent?key={api_key}"
        request = Request(
            url,
            data=request_body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urlopen(request, timeout=45) as response:
                response_data = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            error_body = error.read().decode("utf-8", errors="replace")
            last_error = f"Gemini request failed for {model_name}: {error.code} {error_body}"
            if error.code in {400, 401, 403, 404}:
                continue
            raise RuntimeError(last_error) from error
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            raise RuntimeError(f"Gemini request failed: {error}") from error

        try:
            text = response_data["candidates"][0]["content"]["parts"][0]["text"]
        except (KeyError, IndexError, TypeError) as error:
            raise RuntimeError("Gemini returned an unexpected response.") from error

        cleaned_text = text.strip()
        if cleaned_text.startswith("```"):
            cleaned_text = re.sub(r"^```(?:json)?\s*", "", cleaned_text)
            cleaned_text = re.sub(r"\s*```$", "", cleaned_text)

        try:
            return json.loads(cleaned_text)
        except json.JSONDecodeError as error:
            raise RuntimeError("Gemini returned invalid JSON.") from error

    raise RuntimeError(last_error or "Gemini request failed for all configured models.")


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


def _string_list(value, limit: int = 8) -> list[str]:
    if not isinstance(value, list):
        return []

    return [str(item).strip() for item in value if str(item).strip()][:limit]


def normalize_generated_learning_content(raw_content) -> dict:
    if not isinstance(raw_content, dict):
        raise ValueError("Learning content response must be a JSON object.")

    simple_notes = _string_list(raw_content.get("simple_notes"), 8)
    recap = _string_list(raw_content.get("recap"), 6)

    key_terms = []
    raw_terms = raw_content.get("key_terms")
    if isinstance(raw_terms, list):
        for item in raw_terms[:10]:
            if isinstance(item, dict):
                term = str(item.get("term") or "").strip()
                meaning = str(item.get("meaning") or "").strip()
                if term and meaning:
                    key_terms.append({"term": term, "meaning": meaning})
            else:
                text = str(item).strip()
                if text:
                    key_terms.append({"term": text, "meaning": ""})

    practice = []
    raw_practice = raw_content.get("practice")
    if isinstance(raw_practice, list):
        for item in raw_practice[:8]:
            if isinstance(item, dict):
                question = str(item.get("question") or "").strip()
                hint = str(item.get("hint") or "").strip()
                if question:
                    practice.append({"question": question, "hint": hint})
            else:
                question = str(item).strip()
                if question:
                    practice.append({"question": question, "hint": ""})

    if not simple_notes and not key_terms and not recap and not practice:
        raise ValueError("Gemini returned empty learning content.")

    return {
        "simple_notes": simple_notes,
        "key_terms": key_terms,
        "recap": recap,
        "practice": practice,
    }


def fetch_chapter_for_ai(chapter_id: int) -> dict:
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


@app.post("/ai/generate-quiz")
def generate_ai_quiz(payload: QuizGenerationInput):
    chapter = fetch_chapter_for_ai(payload.chapter_id)
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


@app.post("/learning-content/generate")
def generate_learning_content(payload: LearningContentGenerationInput):
    chapter = fetch_chapter_for_ai(payload.chapter_id)
    chapter_content = str(chapter["full_text_content"])[:18000]
    focus_area = payload.focus_area or "Help the student understand the selected lesson."
    path_steps = [str(step).strip() for step in payload.steps if str(step).strip()][:6]
    prompt = f"""
        You are an expert school teacher. Create personalized reading content for this student.

        Student reader type: {payload.classification}
        Selected lesson: {chapter["chapter_title"]}
        Learning path focus area: {focus_area}
        Learning path steps: {json.dumps(path_steps, ensure_ascii=False)}

        Adapt the content style:
        - Fast Reader: concise notes, deeper thinking, challenge practice.
        - Average Reader: balanced explanation, checkpoints, moderate practice.
        - Slow Reader: simple words, smaller reading blocks, keyword help, easy recap.

        Return only valid JSON in this exact shape:
        {{
          "simple_notes": ["5 to 8 personalized study notes"],
          "key_terms": [
            {{"term": "keyword", "meaning": "student-friendly meaning"}}
          ],
          "recap": ["3 to 6 quick recap points"],
          "practice": [
            {{"question": "practice question", "hint": "short hint"}}
          ]
        }}

        Rules:
        - Use only the selected lesson content below.
        - Do not mention that content was generated by AI.
        - Keep language suitable for a school student.
        - Do not include markdown or extra text.

        Selected lesson content:
        {chapter_content}
    """

    try:
        content_data = gemini_generate_json(prompt, max_output_tokens=4096)
        generated_content = normalize_generated_learning_content(content_data)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {
        "provider": "gemini",
        "student_id": payload.student_id,
        "chapter_id": chapter["chapter_id"],
        "chapter_title": chapter["chapter_title"],
        "classification": payload.classification,
        "generated_content": generated_content,
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
