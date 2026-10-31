-- ==============================================================
-- NITTE MENTORSHIP SYSTEM - SUPABASE SCHEMA & INITIAL SEED DATA
-- Run this in the Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================

-- 1. Mentors Table
CREATE TABLE IF NOT EXISTS app_settings (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL);
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS mentors (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  dept VARCHAR(100) NOT NULL,
  class VARCHAR(100) NOT NULL,
  password VARCHAR(255)
);

-- 2. Relationship Officers (ROs) Table
CREATE TABLE IF NOT EXISTS ros (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL DEFAULT 'skandhayashu2906@gmail.com',
  region VARCHAR(200),
  password VARCHAR(255)
);

-- 3. Students Table
CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  mentor_id VARCHAR(50) REFERENCES mentors(id) ON DELETE SET NULL,
  phone VARCHAR(20),
  branch VARCHAR(20),
  sem INT,
  password VARCHAR(255)
);

-- 4. Issues Table
CREATE TABLE IF NOT EXISTS issues (
  id VARCHAR(50) PRIMARY KEY,
  student_id VARCHAR(50) REFERENCES students(id) ON DELETE CASCADE,
  student_name VARCHAR(100) NOT NULL,
  category VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL,
  ro_id VARCHAR(50) REFERENCES ros(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  resolution_notes TEXT,
  feedback_rating INT,
  feedback_comments TEXT,
  logs JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- 5. Meetings Table
CREATE TABLE IF NOT EXISTS meetings (
  id VARCHAR(50) PRIMARY KEY,
  issue_id VARCHAR(50) REFERENCES issues(id) ON DELETE CASCADE,
  student_id VARCHAR(50) REFERENCES students(id) ON DELETE CASCADE,
  student_name VARCHAR(100) NOT NULL,
  ro_id VARCHAR(50) REFERENCES ros(id) ON DELETE CASCADE,
  date VARCHAR(50) NOT NULL,
  time VARCHAR(50) NOT NULL,
  mode VARCHAR(50) NOT NULL,
  location VARCHAR(200) DEFAULT 'RO Office Desk',
  notes TEXT DEFAULT '',
  status VARCHAR(50) NOT NULL
);

-- Durable video bytes. Historical meeting IDs survive meeting rescheduling.
CREATE TABLE IF NOT EXISTS meeting_recordings (
  id VARCHAR(64) PRIMARY KEY,
  meeting_id VARCHAR(100) NOT NULL,
  issue_id VARCHAR(50) NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  ro_id VARCHAR(50) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  byte_size BIGINT NOT NULL CHECK (byte_size > 0),
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  transcript_summary TEXT NOT NULL DEFAULT '',
  media_data BYTEA NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS meeting_recordings_ro_issue_idx
  ON meeting_recordings (ro_id, issue_id, recorded_at DESC);
-- No public policies. Only the backend database connection serves recording bytes.
ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY;

-- 6. Group Sessions Table
CREATE TABLE IF NOT EXISTS group_sessions (
  id VARCHAR(50) PRIMARY KEY,
  mentor_id VARCHAR(50) REFERENCES mentors(id) ON DELETE CASCADE,
  mentor_name VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  date_time VARCHAR(100) NOT NULL,
  description TEXT,
  link TEXT
);

-- 7. Resources Table
CREATE TABLE IF NOT EXISTS resources (
  id VARCHAR(50) PRIMARY KEY,
  mentor_id VARCHAR(50) REFERENCES mentors(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  date_shared TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. System Logs Table
CREATE TABLE IF NOT EXISTS system_logs (
  id SERIAL PRIMARY KEY,
  text TEXT NOT NULL,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_role VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL
);

-- 9. Mentor Session Records Table
CREATE TABLE IF NOT EXISTS mentor_session_records (
  id VARCHAR(50) PRIMARY KEY,
  mentor_id VARCHAR(50) REFERENCES mentors(id) ON DELETE CASCADE,
  session_date VARCHAR(50) NOT NULL,
  students_attended JSONB NOT NULL DEFAULT '[]'::jsonb,
  topic TEXT NOT NULL,
  notes TEXT,
  which_class VARCHAR(100) DEFAULT '6th Sem CSE-A',
  location VARCHAR(200) DEFAULT 'Seminar Hall 1 (Admin Block)',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 10. Email Logs Table
CREATE TABLE IF NOT EXISTS email_logs (
  id VARCHAR(50) PRIMARY KEY,
  recipient_email VARCHAR(200) NOT NULL,
  recipient_name VARCHAR(200),
  subject VARCHAR(300) NOT NULL,
  body TEXT NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  dispatched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP,
  failed_reason TEXT,
  reply_received BOOLEAN DEFAULT FALSE,
  reply_content TEXT
);

-- 11. Category Videos Table
CREATE TABLE IF NOT EXISTS category_videos (
  category VARCHAR(100) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  video_url TEXT NOT NULL,
  description TEXT,
  updated_by VARCHAR(100) DEFAULT 'System',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 12. Mentor Feedbacks Table
CREATE TABLE IF NOT EXISTS mentor_feedbacks (
  id VARCHAR(50) PRIMARY KEY,
  student_id VARCHAR(50) REFERENCES students(id) ON DELETE CASCADE,
  student_name VARCHAR(100) NOT NULL,
  mentor_id VARCHAR(50) REFERENCES mentors(id) ON DELETE CASCADE,
  mentor_name VARCHAR(100) NOT NULL,
  regularity_rating INT NOT NULL DEFAULT 5,
  clarity_rating INT NOT NULL DEFAULT 5,
  participation_rating INT NOT NULL DEFAULT 5,
  difficulties TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ==============================================================
-- Browser database access is disabled. Run the Node server to initialize password
-- hashes, Admin credentials, persistent sessions, and restricted table permissions.
DO $$
DECLARE app_table text; policy_row record; db_role text;
BEGIN
  FOR app_table IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    AND tablename = ANY(ARRAY['students','mentors','ros','issues','meetings','group_sessions',
      'resources','system_logs','mentor_session_records','email_logs','category_videos',
      'mentor_feedbacks','meeting_recordings','app_settings','admins','auth_sessions'])
  LOOP
    FOR policy_row IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = app_table
    LOOP EXECUTE format('DROP POLICY %I ON public.%I', policy_row.policyname, app_table); END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', app_table);
    FOR db_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
    LOOP EXECUTE format('REVOKE ALL ON public.%I FROM %I', app_table, db_role); END LOOP;
  END LOOP;
END $$;

-- ROs and categories are supplied through Admin roster imports.
