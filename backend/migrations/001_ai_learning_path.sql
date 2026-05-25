-- AI Learning Path tables for saving each student's chapter-level learner profile.
-- Run this manually against PostgreSQL after configuring DATABASE_URL.

CREATE TABLE IF NOT EXISTS sgs_student_learning_profiles (
    id BIGSERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL,
    chapter_id INTEGER NOT NULL,
    chapter_title VARCHAR(160) NOT NULL,
    reading_time_minutes INTEGER NOT NULL CHECK (reading_time_minutes >= 0 AND reading_time_minutes <= 600),
    quiz_score INTEGER NOT NULL CHECK (quiz_score >= 0 AND quiz_score <= 100),
    retry_count INTEGER NOT NULL CHECK (retry_count >= 0 AND retry_count <= 50),
    comprehension_score INTEGER NOT NULL CHECK (comprehension_score >= 0 AND comprehension_score <= 100),
    reader_classification VARCHAR(32) NOT NULL CHECK (reader_classification IN ('Fast Reader', 'Average Reader', 'Slow Reader')),
    generated_path JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT sgs_student_learning_profiles_student_chapter_unique UNIQUE (student_id, chapter_id)
);

CREATE INDEX IF NOT EXISTS idx_sgs_student_learning_profiles_student_id
    ON sgs_student_learning_profiles (student_id);

CREATE INDEX IF NOT EXISTS idx_sgs_student_learning_profiles_chapter_id
    ON sgs_student_learning_profiles (chapter_id);

-- Sample testing data. Keep these INSERTs optional; remove or edit for production.
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
VALUES
(
    23,
    1,
    'Democratic India',
    18,
    92,
    0,
    88,
    'Fast Reader',
    '{
        "provider": "mock-free-llm",
        "chapter_title": "Democratic India",
        "classification": "Fast Reader",
        "track_title": "Fast Reader Material",
        "summary": "Short, challenge-focused material for students who read quickly and score strongly.",
        "focus_area": "Maintain pace and deepen understanding with challenge practice.",
        "steps": [
            "Read the chapter summary and mark unfamiliar terms.",
            "Attempt higher-order questions before reviewing notes.",
            "Create a one-page revision map for the chapter.",
            "Take a timed quiz and move to enrichment practice."
        ],
        "recommended_materials": [
            "Fast Reader Material - Democratic India reading notes",
            "Democratic India recap worksheet",
            "Democratic India adaptive quiz practice"
        ]
    }'::JSONB
),
(
    24,
    1,
    'Democratic India',
    37,
    72,
    1,
    70,
    'Average Reader',
    '{
        "provider": "mock-free-llm",
        "chapter_title": "Democratic India",
        "classification": "Average Reader",
        "track_title": "Average Reader Material",
        "summary": "Balanced explanations, guided practice, and review checkpoints.",
        "focus_area": "Maintain pace and deepen understanding with challenge practice.",
        "steps": [
            "Read the chapter in two focused sections.",
            "Write three key points after each section.",
            "Review solved examples or teacher notes.",
            "Attempt the quiz, revise weak areas, then retry missed questions."
        ],
        "recommended_materials": [
            "Average Reader Material - Democratic India reading notes",
            "Democratic India recap worksheet",
            "Democratic India adaptive quiz practice"
        ]
    }'::JSONB
),
(
    25,
    1,
    'Democratic India',
    58,
    48,
    4,
    52,
    'Slow Reader',
    '{
        "provider": "mock-free-llm",
        "chapter_title": "Democratic India",
        "classification": "Slow Reader",
        "track_title": "Slow Reader Material",
        "summary": "Step-by-step material with smaller reading blocks and extra comprehension support.",
        "focus_area": "Build comprehension through smaller reading blocks and recap questions.",
        "steps": [
            "Read one small section at a time with audio support if needed.",
            "Underline keywords and write their meanings.",
            "Use short recap notes before each quiz attempt.",
            "Practice easier questions first, then retry with teacher/AI hints."
        ],
        "recommended_materials": [
            "Slow Reader Material - Democratic India reading notes",
            "Democratic India recap worksheet",
            "Democratic India adaptive quiz practice"
        ]
    }'::JSONB
)
ON CONFLICT (student_id, chapter_id) DO NOTHING;
