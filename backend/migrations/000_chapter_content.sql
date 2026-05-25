-- Chapter content table used by GET /chapter-content.
-- Run this once against PostgreSQL before loading chapter text.

CREATE TABLE IF NOT EXISTS sgs_chapter_content (
    id BIGSERIAL PRIMARY KEY,
    chapter_id INTEGER NOT NULL UNIQUE,
    subject VARCHAR(120) NOT NULL DEFAULT 'Social Science',
    lesson VARCHAR(120) NOT NULL,
    content_title VARCHAR(200) NOT NULL,
    full_text_content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sgs_chapter_content_subject_lesson
    ON sgs_chapter_content (subject, lesson);

-- Replace this sample row with production chapter text.
INSERT INTO sgs_chapter_content (
    chapter_id,
    subject,
    lesson,
    content_title,
    full_text_content
)
VALUES (
    1,
    'Social Science',
    'Lesson 1',
    'Democratic India',
    'Add the complete Lesson 1 chapter content here.'
)
ON CONFLICT (chapter_id)
DO UPDATE SET
    subject = EXCLUDED.subject,
    lesson = EXCLUDED.lesson,
    content_title = EXCLUDED.content_title,
    full_text_content = EXCLUDED.full_text_content,
    updated_at = NOW();
