ALTER TABLE public.sgs_assignment_results
    ADD COLUMN IF NOT EXISTS submitted_file_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS submitted_file_type VARCHAR(160),
    ADD COLUMN IF NOT EXISTS submitted_file_size BIGINT,
    ADD COLUMN IF NOT EXISTS submitted_file_content BYTEA;
