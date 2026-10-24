-- ==============================================================
-- NITTE MENTORSHIP SYSTEM - SUPABASE SCHEMA & INITIAL SEED DATA
-- Run this in the Supabase Dashboard -> SQL Editor -> Run
-- ==============================================================

-- 1. Mentors Table
CREATE TABLE IF NOT EXISTS mentors (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  dept VARCHAR(100) NOT NULL,
  class VARCHAR(100) NOT NULL,
  password VARCHAR(100) DEFAULT 'Nit#Mnt2026'
);

-- 2. Relationship Officers (ROs) Table
CREATE TABLE IF NOT EXISTS ros (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL DEFAULT 'skandhayashu2906@gmail.com',
  region VARCHAR(200),
  password VARCHAR(100) DEFAULT 'Nit#Ro2026'
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
  password VARCHAR(100) DEFAULT 'Nit#Stu2026'
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
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enables open read/write access for application users
-- ==============================================================
ALTER TABLE mentors ENABLE ROW LEVEL SECURITY;
ALTER TABLE ros ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_session_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE mentor_feedbacks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access on mentors') THEN
    CREATE POLICY "Allow public access on mentors" ON mentors FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access on ros') THEN
    CREATE POLICY "Allow public access on ros" ON ros FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access on students') THEN
    CREATE POLICY "Allow public access on students" ON students FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access on issues') THEN
    CREATE POLICY "Allow public access on issues" ON issues FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access on meetings') THEN
    CREATE POLICY "Allow public access on meetings" ON meetings FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access on group_sessions') THEN
    CREATE POLICY "Allow public access on group_sessions" ON group_sessions FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access on resources') THEN
    CREATE POLICY "Allow public access on resources" ON resources FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access on system_logs') THEN
    CREATE POLICY "Allow public access on system_logs" ON system_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access on mentor_session_records') THEN
    CREATE POLICY "Allow public access on mentor_session_records" ON mentor_session_records FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access on email_logs') THEN
    CREATE POLICY "Allow public access on email_logs" ON email_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access on category_videos') THEN
    CREATE POLICY "Allow public access on category_videos" ON category_videos FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public access on mentor_feedbacks') THEN
    CREATE POLICY "Allow public access on mentor_feedbacks" ON mentor_feedbacks FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ==============================================================
-- INITIAL SEED DATA
-- Students and Mentors are uploaded/onboarded dynamically via the application
-- Only the 49 Dedicated Institutional Relationship Officers are initialized
-- ==============================================================

-- 3. 49 Dedicated ROs Seed
INSERT INTO ros (id, name, email, region, password) VALUES
('RO-01', 'RO - Course Enrollment issues', 'skandhayashu2906@gmail.com', 'Academic - Course Enrollment issues', 'Nit#Ro2026'),
('RO-02', 'RO - Attendance shortage clarification', 'skandhayashu2906@gmail.com', 'Academic - Attendance shortage clarification', 'Nit#Ro2026'),
('RO-03', 'RO - Internal marks discrepancy', 'skandhayashu2906@gmail.com', 'Academic - Internal marks discrepancy', 'Nit#Ro2026'),
('RO-04', 'RO - Difficulty in understanding subjects', 'skandhayashu2906@gmail.com', 'Academic - Difficulty in understanding subjects', 'Nit#Ro2026'),
('RO-05', 'RO - Lab equipment issues', 'skandhayashu2906@gmail.com', 'Academic - Lab equipment issues', 'Nit#Ro2026'),
('RO-06', 'RO - Syllabus coverage speed', 'skandhayashu2906@gmail.com', 'Academic - Syllabus coverage speed', 'Nit#Ro2026'),
('RO-07', 'RO - Assignment submission extensions', 'skandhayashu2906@gmail.com', 'Academic - Assignment submission extensions', 'Nit#Ro2026'),
('RO-08', 'RO - Elective course selection advice', 'skandhayashu2906@gmail.com', 'Academic - Elective course selection advice', 'Nit#Ro2026'),
('RO-09', 'RO - Hall ticket download errors', 'skandhayashu2906@gmail.com', 'Exams - Hall ticket download errors', 'Nit#Ro2026'),
('RO-10', 'RO - Exam schedule conflicts', 'skandhayashu2906@gmail.com', 'Exams - Exam schedule conflicts', 'Nit#Ro2026'),
('RO-11', 'RO - Revaluation/Re-totalling requests', 'skandhayashu2906@gmail.com', 'Exams - Revaluation/Re-totalling requests', 'Nit#Ro2026'),
('RO-12', 'RO - Make-up exam eligibility', 'skandhayashu2906@gmail.com', 'Exams - Make-up exam eligibility', 'Nit#Ro2026'),
('RO-13', 'RO - Results withholding issues', 'skandhayashu2906@gmail.com', 'Exams - Results withholding issues', 'Nit#Ro2026'),
('RO-14', 'RO - Supplementary exam fees', 'skandhayashu2906@gmail.com', 'Exams - Supplementary exam fees', 'Nit#Ro2026'),
('RO-15', 'RO - Answer sheet copy request', 'skandhayashu2906@gmail.com', 'Exams - Answer sheet copy request', 'Nit#Ro2026'),
('RO-16', 'RO - Grace marks query', 'skandhayashu2906@gmail.com', 'Exams - Grace marks query', 'Nit#Ro2026'),
('RO-17', 'RO - Tuition fee installment requests', 'skandhayashu2906@gmail.com', 'Financial - Tuition fee installment requests', 'Nit#Ro2026'),
('RO-18', 'RO - Scholarship application delay', 'skandhayashu2906@gmail.com', 'Financial - Scholarship application delay', 'Nit#Ro2026'),
('RO-19', 'RO - Hostel fee payment extension', 'skandhayashu2906@gmail.com', 'Financial - Hostel fee payment extension', 'Nit#Ro2026'),
('RO-20', 'RO - Exam fee payment failure', 'skandhayashu2906@gmail.com', 'Financial - Exam fee payment failure', 'Nit#Ro2026'),
('RO-21', 'RO - Refund of caution deposits', 'skandhayashu2906@gmail.com', 'Financial - Refund of caution deposits', 'Nit#Ro2026'),
('RO-22', 'RO - Bank loan bonafide certificate', 'skandhayashu2906@gmail.com', 'Financial - Bank loan bonafide certificate', 'Nit#Ro2026'),
('RO-23', 'RO - Fine waiver appeals', 'skandhayashu2906@gmail.com', 'Financial - Fine waiver appeals', 'Nit#Ro2026'),
('RO-24', 'RO - Late fee penalty queries', 'skandhayashu2906@gmail.com', 'Financial - Late fee penalty queries', 'Nit#Ro2026'),
('RO-25', 'RO - Room maintenance & repairs', 'skandhayashu2906@gmail.com', 'Hostels - Room maintenance & repairs', 'Nit#Ro2026'),
('RO-26', 'RO - Mess food quality/hygiene', 'skandhayashu2906@gmail.com', 'Hostels - Mess food quality/hygiene', 'Nit#Ro2026'),
('RO-27', 'RO - Wi-Fi connectivity issues', 'skandhayashu2906@gmail.com', 'Hostels - Wi-Fi connectivity issues', 'Nit#Ro2026'),
('RO-28', 'RO - Water supply shortage', 'skandhayashu2906@gmail.com', 'Hostels - Water supply shortage', 'Nit#Ro2026'),
('RO-29', 'RO - Roommate conflicts', 'skandhayashu2906@gmail.com', 'Hostels - Roommate conflicts', 'Nit#Ro2026'),
('RO-30', 'RO - Hostel curfew permissions', 'skandhayashu2906@gmail.com', 'Hostels - Hostel curfew permissions', 'Nit#Ro2026'),
('RO-31', 'RO - Laundry services issues', 'skandhayashu2906@gmail.com', 'Hostels - Laundry services issues', 'Nit#Ro2026'),
('RO-32', 'RO - Pest control requests', 'skandhayashu2906@gmail.com', 'Hostels - Pest control requests', 'Nit#Ro2026'),
('RO-33', 'RO - Resume verification delay', 'skandhayashu2906@gmail.com', 'Placements - Resume verification delay', 'Nit#Ro2026'),
('RO-34', 'RO - Eligibility criteria appeals', 'skandhayashu2906@gmail.com', 'Placements - Eligibility criteria appeals', 'Nit#Ro2026'),
('RO-35', 'RO - Interview scheduling clashes', 'skandhayashu2906@gmail.com', 'Placements - Interview scheduling clashes', 'Nit#Ro2026'),
('RO-36', 'RO - Placement training portal bugs', 'skandhayashu2906@gmail.com', 'Placements - Placement training portal bugs', 'Nit#Ro2026'),
('RO-37', 'RO - Company registration issues', 'skandhayashu2906@gmail.com', 'Placements - Company registration issues', 'Nit#Ro2026'),
('RO-38', 'RO - NOC certificate delay', 'skandhayashu2906@gmail.com', 'Placements - NOC certificate delay', 'Nit#Ro2026'),
('RO-39', 'RO - Internship credits validation', 'skandhayashu2906@gmail.com', 'Placements - Internship credits validation', 'Nit#Ro2026'),
('RO-40', 'RO - Mock interview slots', 'skandhayashu2906@gmail.com', 'Placements - Mock interview slots', 'Nit#Ro2026'),
('RO-41', 'RO - Library book renewal limits', 'skandhayashu2906@gmail.com', 'Facilities - Library book renewal limits', 'Nit#Ro2026'),
('RO-42', 'RO - Canteen hygiene & pricing', 'skandhayashu2906@gmail.com', 'Facilities - Canteen hygiene & pricing', 'Nit#Ro2026'),
('RO-43', 'RO - Sports equipment availability', 'skandhayashu2906@gmail.com', 'Facilities - Sports equipment availability', 'Nit#Ro2026'),
('RO-44', 'RO - Gymnasium access timings', 'skandhayashu2906@gmail.com', 'Facilities - Gymnasium access timings', 'Nit#Ro2026'),
('RO-45', 'RO - Campus transport routes', 'skandhayashu2906@gmail.com', 'Facilities - Campus transport routes', 'Nit#Ro2026'),
('RO-46', 'RO - Stress & anxiety management', 'skandhayashu2906@gmail.com', 'Personal - Stress & anxiety management', 'Nit#Ro2026'),
('RO-47', 'RO - Peer pressure adjustments', 'skandhayashu2906@gmail.com', 'Personal - Peer pressure adjustments', 'Nit#Ro2026'),
('RO-48', 'RO - Time management struggles', 'skandhayashu2906@gmail.com', 'Personal - Time management struggles', 'Nit#Ro2026'),
('RO-49', 'RO - Homesickness assistance', 'skandhayashu2906@gmail.com', 'Personal - Homesickness assistance', 'Nit#Ro2026')
ON CONFLICT (id) DO NOTHING;

-- 4. Category Videos Seed
INSERT INTO category_videos (category, title, video_url, description, updated_by) VALUES
('Academic', 'NITTE Academic Guide: Course Enrollment & Attendance Policy', 'https://www.youtube.com/watch?v=kqtD5dpn9C8', '1. Check student ERP portal for minimum 75% attendance threshold.\n2. Medical or duty leave certificates must be submitted to HOD within 3 days.\n3. Verify course elective credits with your department coordinator.', 'System'),
('Exams', 'Examination Portal & Hall Ticket Resolution Walkthrough', 'https://www.youtube.com/watch?v=3JZ_D3ELwOQ', '1. Clear pending department dues before downloading exam admit card.\n2. Apply for revaluation via Controller of Examination portal within 7 days of result declaration.\n3. Make-up exam forms are verified automatically based on attendance approval.', 'System'),
('Financial', 'Fee Installments, Scholarships & Payment Receipt Assistance', 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ', '1. Download fee receipt directly from Finance Portal under Transaction History.\n2. For installment plans, submit parent undertaking letter.\n3. State & National Scholarship bonafide certificates are issued at Admin Desk Counter 2.', 'System'),
('Hostels', 'Campus Hostel Maintenance, Mess & Facility Protocol', 'https://www.youtube.com/watch?v=kJQP7kiw5Fk', '1. For electrical or plumbing issues, log a ticket in the Hostel Maintenance Register at block warden desk.\n2. Mess committee meetings are held on the 1st of every month.\n3. Curfew extension passes must be requested 24 hours prior via Warden.', 'System'),
('Placements', 'Placement Training, Resume Verification & Drive Registration', 'https://www.youtube.com/watch?v=21X5lGlDOfg', '1. Ensure resume PDF is verified by Placement Cell coordinator.\n2. Update CGPA and active backlogs in the training portal.\n3. Collect NOC certificates from Training & Placement Officer.', 'System'),
('Facilities', 'Campus Facilities: Library Access, Gym & Transport Services', 'https://www.youtube.com/watch?v=OPf0YbXqDm0', '1. Digital Library accounts are active for all enrolled students.\n2. Campus bus route passes can be renewed at Transport Office.\n3. Sports equipment is issued with valid student ID card.', 'System'),
('Personal', 'Student Counseling, Wellness & Mentorship Support', 'https://www.youtube.com/watch?v=7wtfhZwyrcc', '1. Confidential student counseling is available at Wellness Center Block B.\n2. Mentors are available every Wednesday during tutorial hours.\n3. Reach out to your Relationship Officer for a private 1-on-1 session.', 'System')
ON CONFLICT (category) DO NOTHING;
