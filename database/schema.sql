CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schools (id text PRIMARY KEY, code text NOT NULL UNIQUE, name text NOT NULL, status text NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS users (id text PRIMARY KEY, email text NOT NULL UNIQUE, username text, full_name text NOT NULL, role text NOT NULL, access_scope text NOT NULL DEFAULT 'SCHOOL', school_id text REFERENCES schools(id), employee_id text, student_id text, password_hash text NOT NULL, password_salt text, password_iterations integer, is_active boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'Active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz);
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS users_student_id_idx ON users (school_id, student_id) WHERE student_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS user_school_access (user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE, PRIMARY KEY (user_id, school_id));
CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, active_school_id text REFERENCES schools(id), status text NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS employees (id text NOT NULL, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE, employee_code text, full_name text NOT NULL, department text, job_title text, status text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (school_id,id));
CREATE INDEX IF NOT EXISTS employees_school_id_idx ON employees(school_id);
CREATE TABLE IF NOT EXISTS students (id text NOT NULL, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE, student_code text, full_name text NOT NULL, grade text, classroom text, section text, status text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (school_id,id));
CREATE INDEX IF NOT EXISTS students_school_grade_idx ON students(school_id, grade);
CREATE INDEX IF NOT EXISTS students_school_code_idx ON students(school_id, student_code) WHERE student_code IS NOT NULL;
CREATE TABLE IF NOT EXISTS academic_years (id text PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE, name text NOT NULL, start_date date, end_date date, is_active boolean NOT NULL DEFAULT false, payload jsonb NOT NULL DEFAULT '{}'::jsonb);
CREATE TABLE IF NOT EXISTS audit_logs (id bigserial PRIMARY KEY, school_id text REFERENCES schools(id), user_id text REFERENCES users(id), username text, role text, action text NOT NULL, entity text, target_id text, details text, request_id text, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS audit_logs_school_created_idx ON audit_logs(school_id, created_at DESC);
CREATE TABLE IF NOT EXISTS student_attendance (id bigserial PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE, student_id text NOT NULL, attendance_date date NOT NULL, status text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE (school_id, student_id, attendance_date));
CREATE INDEX IF NOT EXISTS student_attendance_school_date_idx ON student_attendance(school_id, attendance_date);
DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='student_attendance_student_school_fkey') THEN ALTER TABLE student_attendance ADD CONSTRAINT student_attendance_student_school_fkey FOREIGN KEY (school_id,student_id) REFERENCES students(school_id,id) ON DELETE CASCADE; END IF; END $;
CREATE TABLE IF NOT EXISTS employee_attendance (id bigserial PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE, employee_id text NOT NULL, attendance_date date NOT NULL, status text, check_in timestamptz, check_out timestamptz, payload jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE (school_id, employee_id, attendance_date));
CREATE INDEX IF NOT EXISTS employee_attendance_school_date_idx ON employee_attendance(school_id, attendance_date);
DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='employee_attendance_employee_school_fkey') THEN ALTER TABLE employee_attendance ADD CONSTRAINT employee_attendance_employee_school_fkey FOREIGN KEY (school_id,employee_id) REFERENCES employees(school_id,id) ON DELETE CASCADE; END IF; END $;

CREATE TABLE IF NOT EXISTS leaves (
  id text PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  employee_id text, start_date date, end_date date,
  status text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leaves_school_dates_idx ON leaves(school_id,start_date,end_date);
DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='leaves_employee_school_fkey') THEN ALTER TABLE leaves ADD CONSTRAINT leaves_employee_school_fkey FOREIGN KEY (school_id,employee_id) REFERENCES employees(school_id,id) ON DELETE NO ACTION; END IF; END $;

CREATE TABLE IF NOT EXISTS permissions (
  id text PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  employee_id text, permission_date date,
  status text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permissions_school_date_idx ON permissions(school_id,permission_date);
DO $ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='permissions_employee_school_fkey') THEN ALTER TABLE permissions ADD CONSTRAINT permissions_employee_school_fkey FOREIGN KEY (school_id,employee_id) REFERENCES employees(school_id,id) ON DELETE NO ACTION; END IF; END $;

CREATE TABLE IF NOT EXISTS schedule (
  id text PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id text REFERENCES academic_years(id) ON DELETE SET NULL,
  teacher_id text, grade text, classroom text, weekday text, period_no integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedule_school_class_idx ON schedule(school_id,grade,classroom,weekday);


-- Curriculum subsystem (additive, canonical schema)
CREATE TABLE IF NOT EXISTS curriculum_plans (
  id text PRIMARY KEY,
  school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year text NOT NULL,
  term text NOT NULL,
  grade text NOT NULL,
  grade_id text,
  classroom text NOT NULL,
  subject text NOT NULL,
  subject_id text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'Draft',
  uploaded_by text NOT NULL,
  uploaded_by_name text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  file_meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS curriculum_plans_school_lookup_idx ON curriculum_plans(school_id,academic_year,term,grade,classroom,subject,status);

CREATE TABLE IF NOT EXISTS curriculum_plan_items (
  id text PRIMARY KEY,
  plan_id text NOT NULL REFERENCES curriculum_plans(id) ON DELETE CASCADE,
  week integer NOT NULL,
  unit text,
  lesson_title text NOT NULL,
  objectives text,
  resources text,
  assessment text,
  estimated_periods integer NOT NULL DEFAULT 1,
  notes text,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS curriculum_plan_items_plan_week_idx ON curriculum_plan_items(plan_id,week,sort_order);

CREATE TABLE IF NOT EXISTS curriculum_distributions (
  id text PRIMARY KEY,
  school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES curriculum_plans(id) ON DELETE CASCADE,
  plan_item_id text NOT NULL REFERENCES curriculum_plan_items(id) ON DELETE CASCADE,
  schedule_item_id text,
  teacher_id text NOT NULL,
  teacher_name text,
  grade text NOT NULL,
  classroom text NOT NULL,
  subject text NOT NULL,
  day_of_week text,
  period_number integer,
  target_date date,
  status text NOT NULL DEFAULT 'Planned',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS curriculum_distributions_school_plan_idx ON curriculum_distributions(school_id,plan_id,plan_item_id);
CREATE INDEX IF NOT EXISTS curriculum_distributions_slot_idx ON curriculum_distributions(school_id,schedule_item_id,status) WHERE schedule_item_id IS NOT NULL;
