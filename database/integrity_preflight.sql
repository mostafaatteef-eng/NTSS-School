-- Read-only production preflight for timetable/curriculum integrity.
-- Run this before creating/validating constraints. This script never mutates data.

-- Duplicate teacher slots
SELECT school_id, weekday, period_no, teacher_id, COUNT(*) AS duplicate_count,
       array_agg(id ORDER BY id) AS schedule_ids
FROM schedule
WHERE teacher_id IS NOT NULL AND teacher_id <> ''
GROUP BY school_id, weekday, period_no, teacher_id
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, school_id, weekday, period_no;

-- Duplicate classroom slots
SELECT school_id, weekday, period_no, classroom, COUNT(*) AS duplicate_count,
       array_agg(id ORDER BY id) AS schedule_ids
FROM schedule
WHERE classroom IS NOT NULL AND classroom <> ''
GROUP BY school_id, weekday, period_no, classroom
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC, school_id, weekday, period_no;

-- Schedule rows referencing a missing teacher in the same school
SELECT s.id, s.school_id, s.teacher_id, s.weekday, s.period_no
FROM schedule s
LEFT JOIN employees e ON e.school_id=s.school_id AND e.id=s.teacher_id
WHERE s.teacher_id IS NOT NULL AND s.teacher_id <> '' AND e.id IS NULL
ORDER BY s.school_id, s.id;

-- Curriculum distributions referencing a missing schedule row
SELECT d.id, d.school_id, d.schedule_item_id
FROM curriculum_distributions d
LEFT JOIN schedule s ON s.id=d.schedule_item_id
WHERE d.schedule_item_id IS NOT NULL AND d.schedule_item_id <> '' AND s.id IS NULL
ORDER BY d.school_id, d.id;

-- Existing constraint/index state
SELECT conname, convalidated
FROM pg_constraint
WHERE conname IN ('schedule_teacher_school_fkey','curriculum_distribution_schedule_fkey')
ORDER BY conname;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN ('schedule_teacher_slot_unique_idx','schedule_class_slot_unique_idx')
ORDER BY indexname;
