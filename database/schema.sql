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
CREATE TABLE IF NOT EXISTS student_attendance (id bigserial PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE, student_id text NOT NULL REFERENCES students(id) ON DELETE CASCADE, attendance_date date NOT NULL, status text NOT NULL, payload jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE (school_id, student_id, attendance_date));
CREATE INDEX IF NOT EXISTS student_attendance_school_date_idx ON student_attendance(school_id, attendance_date);
CREATE TABLE IF NOT EXISTS employee_attendance (id bigserial PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE, employee_id text NOT NULL REFERENCES employees(id) ON DELETE CASCADE, attendance_date date NOT NULL, status text, check_in timestamptz, check_out timestamptz, payload jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE (school_id, employee_id, attendance_date));
CREATE INDEX IF NOT EXISTS employee_attendance_school_date_idx ON employee_attendance(school_id, attendance_date);

CREATE TABLE IF NOT EXISTS leaves (
  id text PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  employee_id text REFERENCES employees(id) ON DELETE SET NULL, start_date date, end_date date,
  status text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leaves_school_dates_idx ON leaves(school_id,start_date,end_date);

CREATE TABLE IF NOT EXISTS permissions (
  id text PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  employee_id text REFERENCES employees(id) ON DELETE SET NULL, permission_date date,
  status text, payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS permissions_school_date_idx ON permissions(school_id,permission_date);

CREATE TABLE IF NOT EXISTS schedule (
  id text PRIMARY KEY, school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  academic_year_id text REFERENCES academic_years(id) ON DELETE SET NULL,
  teacher_id text, grade text, classroom text, weekday text, period_no integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedule_school_class_idx ON schedule(school_id,grade,classroom,weekday);
