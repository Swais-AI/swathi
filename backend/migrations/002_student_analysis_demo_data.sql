-- Repeatable demo dataset for the login-based Student Analysis dashboard.
-- Creates 16 assessments (4 subjects x 4 test periods) and 80 results
-- for Leela Madhuri, Vaibhav Yaso, Renuka Gudavalli, P Ushasri, and Swati.

WITH assessment_seed(title, assessment_type, assessment_date, max_marks, subject) AS (
    VALUES
        ('Unit Test - Mathematics', 'test'::assessment_type, DATE '2026-06-10', 25::numeric, 'Mathematics'),
        ('Unit Test - Science', 'test'::assessment_type, DATE '2026-06-10', 25::numeric, 'Science'),
        ('Unit Test - English', 'test'::assessment_type, DATE '2026-06-10', 25::numeric, 'English'),
        ('Unit Test - Social Studies', 'test'::assessment_type, DATE '2026-06-10', 25::numeric, 'Social Studies'),
        ('Monthly Test - Mathematics', 'test'::assessment_type, DATE '2026-07-15', 50::numeric, 'Mathematics'),
        ('Monthly Test - Science', 'test'::assessment_type, DATE '2026-07-15', 50::numeric, 'Science'),
        ('Monthly Test - English', 'test'::assessment_type, DATE '2026-07-15', 50::numeric, 'English'),
        ('Monthly Test - Social Studies', 'test'::assessment_type, DATE '2026-07-15', 50::numeric, 'Social Studies'),
        ('Quarterly Exam - Mathematics', 'exam'::assessment_type, DATE '2026-09-20', 100::numeric, 'Mathematics'),
        ('Quarterly Exam - Science', 'exam'::assessment_type, DATE '2026-09-20', 100::numeric, 'Science'),
        ('Quarterly Exam - English', 'exam'::assessment_type, DATE '2026-09-20', 100::numeric, 'English'),
        ('Quarterly Exam - Social Studies', 'exam'::assessment_type, DATE '2026-09-20', 100::numeric, 'Social Studies'),
        ('Half Yearly Exam - Mathematics', 'exam'::assessment_type, DATE '2026-11-25', 100::numeric, 'Mathematics'),
        ('Half Yearly Exam - Science', 'exam'::assessment_type, DATE '2026-11-25', 100::numeric, 'Science'),
        ('Half Yearly Exam - English', 'exam'::assessment_type, DATE '2026-11-25', 100::numeric, 'English'),
        ('Half Yearly Exam - Social Studies', 'exam'::assessment_type, DATE '2026-11-25', 100::numeric, 'Social Studies')
)
INSERT INTO sgs_assessments (
    teacher_id,
    title,
    assessment_type,
    assessment_date,
    max_marks,
    class_name,
    section,
    total_students,
    submitted,
    subject,
    record_status,
    version_no
)
SELECT
    '11',
    seed.title,
    seed.assessment_type,
    seed.assessment_date,
    seed.max_marks,
    '8',
    'A',
    5,
    5,
    seed.subject,
    'Active',
    1
FROM assessment_seed seed
WHERE NOT EXISTS (
    SELECT 1
    FROM sgs_assessments existing
    WHERE existing.title = seed.title
      AND existing.assessment_date = seed.assessment_date
      AND existing.class_name = '8'
      AND existing.section = 'A'
      AND existing.subject = seed.subject
      AND existing.record_status = 'Active'
);

WITH student_subject_base(student_id, subject, base_percentage) AS (
    VALUES
        (76::bigint, 'Mathematics', 82::numeric),
        (76::bigint, 'Science', 76::numeric),
        (76::bigint, 'English', 88::numeric),
        (76::bigint, 'Social Studies', 84::numeric),
        (77::bigint, 'Mathematics', 91::numeric),
        (77::bigint, 'Science', 85::numeric),
        (77::bigint, 'English', 79::numeric),
        (77::bigint, 'Social Studies', 88::numeric),
        (78::bigint, 'Mathematics', 72::numeric),
        (78::bigint, 'Science', 89::numeric),
        (78::bigint, 'English', 82::numeric),
        (78::bigint, 'Social Studies', 76::numeric),
        (693::bigint, 'Mathematics', 78::numeric),
        (693::bigint, 'Science', 74::numeric),
        (693::bigint, 'English', 86::numeric),
        (693::bigint, 'Social Studies', 91::numeric),
        (689::bigint, 'Mathematics', 88::numeric),
        (689::bigint, 'Science', 81::numeric),
        (689::bigint, 'English', 84::numeric),
        (689::bigint, 'Social Studies', 79::numeric)
),
test_adjustment(test_name, assessment_date, adjustment) AS (
    VALUES
        ('Unit Test', DATE '2026-06-10', -6::numeric),
        ('Monthly Test', DATE '2026-07-15', -2::numeric),
        ('Quarterly Exam', DATE '2026-09-20', 2::numeric),
        ('Half Yearly Exam', DATE '2026-11-25', 5::numeric)
),
result_seed AS (
    SELECT
        student.student_id,
        student.full_name,
        COALESCE(NULLIF(BTRIM(student.roll_no), ''), student.admission_no) AS roll_number,
        assessment.assessment_id,
        assessment.max_marks,
        LEAST(100::numeric, GREATEST(0::numeric, base.base_percentage + test.adjustment)) AS percentage
    FROM student_subject_base base
    INNER JOIN sgs_student_master student
      ON student.student_id = base.student_id
    CROSS JOIN test_adjustment test
    INNER JOIN sgs_assessments assessment
      ON assessment.title = test.test_name || ' - ' || base.subject
     AND assessment.assessment_date = test.assessment_date
     AND assessment.class_name = '8'
     AND assessment.section = 'A'
     AND assessment.subject = base.subject
     AND assessment.record_status = 'Active'
    WHERE student.class_id = 18
      AND student.record_status = 'Active'
      AND COALESCE(student.is_active, true) = true
)
INSERT INTO sgs_assessment_results (
    assessment_id,
    student_id,
    roll_number,
    student_name,
    marks_obtained,
    percentage,
    is_absent,
    record_status,
    version_no
)
SELECT
    seed.assessment_id,
    seed.student_id,
    seed.roll_number,
    seed.full_name,
    ROUND(seed.max_marks * seed.percentage / 100, 2),
    seed.percentage,
    false,
    'Active',
    1
FROM result_seed seed
WHERE NOT EXISTS (
    SELECT 1
    FROM sgs_assessment_results existing
    WHERE existing.assessment_id = seed.assessment_id
      AND existing.student_id = seed.student_id
      AND existing.record_status = 'Active'
);
