import pg from 'pg';
const { Client, Pool } = pg;
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/mentorship_db';

// Extract database name from connection string
const dbName = connectionString.substring(connectionString.lastIndexOf('/') + 1);
const baseConnectionString = connectionString.substring(0, connectionString.lastIndexOf('/')) + '/postgres';

// Define the exact 49 issue categories corresponding to the 49 dedicated ROs
export const ALL_CATEGORIES = [
  // 1. Academic (8)
  'Academic - Course Enrollment issues',
  'Academic - Attendance shortage clarification',
  'Academic - Internal marks discrepancy',
  'Academic - Difficulty in understanding subjects',
  'Academic - Lab equipment issues',
  'Academic - Syllabus coverage speed',
  'Academic - Assignment submission extensions',
  'Academic - Elective course selection advice',
  // 2. Exams (8)
  'Exams - Hall ticket download errors',
  'Exams - Exam schedule conflicts',
  'Exams - Revaluation/Re-totalling requests',
  'Exams - Make-up exam eligibility',
  'Exams - Results withholding issues',
  'Exams - Supplementary exam fees',
  'Exams - Answer sheet copy request',
  'Exams - Grace marks query',
  // 3. Financial (8)
  'Financial - Tuition fee installment requests',
  'Financial - Scholarship application delay',
  'Financial - Hostel fee payment extension',
  'Financial - Exam fee payment failure',
  'Financial - Refund of caution deposits',
  'Financial - Bank loan bonafide certificate',
  'Financial - Fine waiver appeals',
  'Financial - Late fee penalty queries',
  // 4. Hostels (8)
  'Hostels - Room maintenance & repairs',
  'Hostels - Mess food quality/hygiene',
  'Hostels - Wi-Fi connectivity issues',
  'Hostels - Water supply shortage',
  'Hostels - Roommate conflicts',
  'Hostels - Hostel curfew permissions',
  'Hostels - Laundry services issues',
  'Hostels - Pest control requests',
  // 5. Placements (8)
  'Placements - Resume verification delay',
  'Placements - Eligibility criteria appeals',
  'Placements - Interview scheduling clashes',
  'Placements - Placement training portal bugs',
  'Placements - Company registration issues',
  'Placements - NOC certificate delay',
  'Placements - Internship credits validation',
  'Placements - Mock interview slots',
  // 6. Facilities (5)
  'Facilities - Library book renewal limits',
  'Facilities - Canteen hygiene & pricing',
  'Facilities - Sports equipment availability',
  'Facilities - Gymnasium access timings',
  'Facilities - Campus transport routes',
  // 7. Personal (4)
  'Personal - Stress & anxiety management',
  'Personal - Peer pressure adjustments',
  'Personal - Time management struggles',
  'Personal - Homesickness assistance'
];

let pool;

// Check and Create database if it doesn't exist
const ensureDatabaseExists = async () => {
  const client = new Client({ connectionString: baseConnectionString });
  try {
    await client.connect();
    
    // Check if database exists
    const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (res.rowCount === 0) {
      console.log(`Database "${dbName}" not found. Creating it...`);
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database "${dbName}" created successfully.`);
    }
  } catch (err) {
    console.error(`Error verifying/creating database:`, err);
  } finally {
    await client.end();
  }
};

// Initialize PostgreSQL Pool
export const initDb = async () => {
  await ensureDatabaseExists();
  
  pool = new Pool({ connectionString });
  
  try {
    const client = await pool.connect();
    console.log(`Connected to PostgreSQL database: "${dbName}"`);
    client.release();
    
    await createTables();
    await seedTables();
  } catch (err) {
    console.error('Failed to initialize PostgreSQL pool:', err);
    process.exit(1);
  }
};

const createTables = async () => {
  const queries = [
    // 1. Mentors
    `CREATE TABLE IF NOT EXISTS mentors (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL,
      dept VARCHAR(50),
      class VARCHAR(150),
      password VARCHAR(100) DEFAULT 'Nit#Mnt2026'
    )`,
    
    // 2. ROs (49 dedicated ones - all using skandhayashu2906@gmail.com)
    `CREATE TABLE IF NOT EXISTS ros (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL DEFAULT 'skandhayashu2906@gmail.com',
      region VARCHAR(200),
      password VARCHAR(100) DEFAULT 'Nit#Ro2026'
    )`,

    // 3. Students (All using skandhayashas2906@gmail.com)
    `CREATE TABLE IF NOT EXISTS students (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL DEFAULT 'skandhayashas2906@gmail.com',
      mentor_id VARCHAR(50) REFERENCES mentors(id) ON DELETE SET NULL,
      phone VARCHAR(20),
      branch VARCHAR(20),
      sem INT,
      password VARCHAR(100) DEFAULT 'Nit#Stu2026'
    )`,

    // 4. Issues
    `CREATE TABLE IF NOT EXISTS issues (
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
    )`,

    // 5. Meetings
    `CREATE TABLE IF NOT EXISTS meetings (
      id VARCHAR(50) PRIMARY KEY,
      issue_id VARCHAR(50) REFERENCES issues(id) ON DELETE CASCADE,
      student_id VARCHAR(50) REFERENCES students(id) ON DELETE CASCADE,
      student_name VARCHAR(100) NOT NULL,
      ro_id VARCHAR(50) REFERENCES ros(id) ON DELETE CASCADE,
      date VARCHAR(20) NOT NULL,
      time VARCHAR(20) NOT NULL,
      mode VARCHAR(20) NOT NULL,
      location VARCHAR(200) DEFAULT 'RO Office Desk',
      notes TEXT DEFAULT '',
      status VARCHAR(50) NOT NULL
    )`,

    // 6. Group Sessions
    `CREATE TABLE IF NOT EXISTS group_sessions (
      id VARCHAR(50) PRIMARY KEY,
      mentor_id VARCHAR(50) REFERENCES mentors(id) ON DELETE CASCADE,
      mentor_name VARCHAR(100) NOT NULL,
      title VARCHAR(200) NOT NULL,
      date_time TIMESTAMP NOT NULL,
      description TEXT,
      link VARCHAR(300) NOT NULL
    )`,

    // 7. Resources
    `CREATE TABLE IF NOT EXISTS resources (
      id VARCHAR(50) PRIMARY KEY,
      mentor_id VARCHAR(50) REFERENCES mentors(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      type VARCHAR(50) NOT NULL,
      content TEXT NOT NULL,
      date_shared VARCHAR(20) NOT NULL
    )`,

    // 8. System Logs
    `CREATE TABLE IF NOT EXISTS system_logs (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL,
      timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      user_role VARCHAR(50) NOT NULL,
      user_id VARCHAR(50) NOT NULL
    )`,

    // 9. Mentor Session Records
    `CREATE TABLE IF NOT EXISTS mentor_session_records (
      id SERIAL PRIMARY KEY,
      mentor_id VARCHAR(50) REFERENCES mentors(id) ON DELETE CASCADE,
      session_date DATE NOT NULL,
      students_attended INT NOT NULL,
      topic VARCHAR(200) NOT NULL,
      notes TEXT,
      which_class VARCHAR(100) DEFAULT '6th Sem CSE-A',
      location VARCHAR(200) DEFAULT 'Seminar Hall 1 (Admin Block)',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    // 10. Email Logs (Gmail skandhayashu2906@gmail.com)
    `CREATE TABLE IF NOT EXISTS email_logs (
      id SERIAL PRIMARY KEY,
      direction VARCHAR(10) NOT NULL,
      sender VARCHAR(150) NOT NULL,
      recipient VARCHAR(150) NOT NULL,
      subject VARCHAR(300) NOT NULL,
      body TEXT NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      issue_id VARCHAR(50),
      status VARCHAR(50) NOT NULL DEFAULT 'SENT',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const q of queries) {
    await pool.query(q);
  }

  // Ensure newer columns exist for existing databases
  try {
    await pool.query(`ALTER TABLE mentor_session_records ADD COLUMN IF NOT EXISTS which_class VARCHAR(100) DEFAULT '6th Sem CSE-A'`);
    await pool.query(`ALTER TABLE mentor_session_records ADD COLUMN IF NOT EXISTS location VARCHAR(200) DEFAULT 'Seminar Hall 1 (Admin Block)'`);
    await pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS location VARCHAR(200) DEFAULT 'RO Office Desk'`);
    await pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE mentors ADD COLUMN IF NOT EXISTS password VARCHAR(100) DEFAULT 'Nit#Mnt2026'`);
    await pool.query(`ALTER TABLE ros ADD COLUMN IF NOT EXISTS password VARCHAR(100) DEFAULT 'Nit#Ro2026'`);
    await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS password VARCHAR(100) DEFAULT 'Nit#Stu2026'`);
    await pool.query(`UPDATE ros SET email = 'skandhayashu2906@gmail.com' WHERE email IS NOT NULL`);
    await pool.query(`UPDATE students SET email = 'skandhayashas2906@gmail.com' WHERE email IS NOT NULL`);
  } catch (err) {
    console.log('Column alter & email sync check complete.');
  }

  console.log('PostgreSQL database tables verified/created.');
};

export const seedTables = async () => {
  // Check if seeding is already done (by querying mentors table)
  const mentorCheck = await pool.query(`SELECT COUNT(*) FROM mentors`);
  if (parseInt(mentorCheck.rows[0].count) > 0) {
    console.log('Tables already contain data. Skipping seeding.');
    return;
  }

  console.log('Database tables are empty. Seeding initial mock data...');

  // 1. Seed Mentors
  await pool.query(`
    INSERT INTO mentors (id, name, email, dept, class, password) VALUES
    ('M01', 'Dr. Rajesh Kumar', 'rajesh.kumar@nitte.edu', 'CSE', '5th Sem CSE - Section A (28 Mentees)', 'Nit#Mnt2026'),
    ('M02', 'Prof. Sunita Sharma', 'sunita.sharma@nitte.edu', 'ISE', '3rd Sem ISE - Section B (26 Mentees)', 'Nit#Mnt2026')
  `);

  // 2. Seed 49 ROs Dynamically based on the Categories (All assigned skandhayashu2906@gmail.com)
  for (let i = 0; i < ALL_CATEGORIES.length; i++) {
    const cat = ALL_CATEGORIES[i];
    const roId = `RO-${String(i + 1).padStart(2, '0')}`;
    const dept = cat.split(' - ')[0];
    const subcat = cat.split(' - ')[1];
    const name = `RO - ${subcat}`;
    const email = 'skandhayashu2906@gmail.com';
    const region = `${dept} Support Desk`;
    
    await pool.query(
      `INSERT INTO ros (id, name, email, region, password) VALUES ($1, $2, $3, $4, 'Nit#Ro2026')`,
      [roId, name, email, region]
    );
  }
  console.log('Seeded 49 dedicated Relationship Officers with email skandhayashu2906@gmail.com.');

  // 3. Seed Students (All assigned skandhayashas2906@gmail.com)
  await pool.query(`
    INSERT INTO students (id, name, email, mentor_id, phone, branch, sem, password) VALUES
    ('S101', 'Aarav Mehta', 'skandhayashas2906@gmail.com', 'M01', '9876543210', 'CSE', 5, 'Nit#Stu2026'),
    ('S102', 'Bhavana Rao', 'skandhayashas2906@gmail.com', 'M01', '9876543211', 'CSE', 5, 'Nit#Stu2026'),
    ('S103', 'Chaitra Hegde', 'skandhayashas2906@gmail.com', 'M01', '9876543212', 'CSE', 5, 'Nit#Stu2026'),
    ('S104', 'Daniel Dsouza', 'skandhayashas2906@gmail.com', 'M01', '9876543213', 'CSE', 5, 'Nit#Stu2026'),
    ('S105', 'Esha Sharma', 'skandhayashas2906@gmail.com', 'M02', '9876543214', 'ISE', 3, 'Nit#Stu2026'),
    ('S106', 'Farhan Khan', 'skandhayashas2906@gmail.com', 'M02', '9876543215', 'ISE', 3, 'Nit#Stu2026'),
    ('S107', 'Gautam Shenoy', 'skandhayashas2906@gmail.com', 'M02', '9876543216', 'ISE', 3, 'Nit#Stu2026'),
    ('S108', 'Harshita Pai', 'skandhayashas2906@gmail.com', 'M02', '9876543217', 'ISE', 3, 'Nit#Stu2026')
  `);

  // 4. Seed Issues (Routing RO IDs match the index positions of categories in ALL_CATEGORIES)
  // Academic - Internal marks discrepancy is index 2 -> RO-03
  // Hostels - Mess food quality/hygiene is index 25 -> RO-26
  // Financial - Scholarship application delay is index 17 -> RO-18
  // Facilities - Library book renewal limits is index 40 -> RO-41
  // Personal - Stress & anxiety management is index 45 -> RO-46
  
  const initialLogs1 = JSON.stringify([{ text: 'Issue submitted by Aarav Mehta', time: '2026-07-15T09:30:00Z' }]);
  const initialLogs2 = JSON.stringify([
    { text: 'Issue submitted by Bhavana Rao', time: '2026-07-16T13:45:00Z' },
    { text: 'RO scheduled an offline meeting', time: '2026-07-17T10:00:00Z' }
  ]);
  const initialLogs3 = JSON.stringify([
    { text: 'Issue submitted by Chaitra Hegde', time: '2026-07-10T11:15:00Z' },
    { text: 'Escalated to Admin by RO due to lack of administrative portal access', time: '2026-07-14T15:20:00Z' }
  ]);
  const initialLogs4 = JSON.stringify([
    { text: 'Issue submitted by Daniel Dsouza', time: '2026-07-12T10:00:00Z' },
    { text: 'Resolved by RO: Approved library exemption card.', time: '2026-07-13T14:30:00Z' },
    { text: 'Student submitted 5-star rating.', time: '2026-07-13T16:00:00Z' }
  ]);
  const initialLogs5 = JSON.stringify([{ text: 'Issue submitted by Esha Sharma', time: '2026-07-18T18:00:00Z' }]);

  await pool.query(`
    INSERT INTO issues (id, student_id, student_name, category, description, priority, status, ro_id, created_at, resolved_at, resolution_notes, feedback_rating, feedback_comments, logs) VALUES
    ('ISS-001', 'S101', 'Aarav Mehta', 'Academic - Internal marks discrepancy', 'My internal marks for Software Engineering lab were entered as 12 instead of 22 in the portal. I have cross-checked my sheets.', 'High', 'Assigned to RO', 'RO-03', '2026-07-15T09:30:00Z', NULL, NULL, NULL, NULL, $1),
    ('ISS-002', 'S102', 'Bhavana Rao', 'Hostels - Mess food quality/hygiene', 'Found plastic pieces in the lunch served today. Need immediate inspection of the Block A dining hall.', 'High', 'Meeting Scheduled', 'RO-26', '2026-07-16T13:45:00Z', NULL, NULL, NULL, NULL, $2),
    ('ISS-003', 'S103', 'Chaitra Hegde', 'Financial - Scholarship application delay', 'State Scholarship portal is asking for Nitte bonafide certificate verification, but the college office has not approved it yet.', 'Medium', 'Escalated', 'RO-18', '2026-07-10T11:15:00Z', NULL, NULL, NULL, NULL, $3),
    ('ISS-004', 'S104', 'Daniel Dsouza', 'Facilities - Library book renewal limits', 'Need to renew standard reference text for project work, but the system shows limit exceeded. Project submissions are next week.', 'Low', 'Resolved', 'RO-41', '2026-07-12T10:00:00Z', '2026-07-13T14:30:00Z', 'Approved library exemption card. Book renewed for 15 additional days.', 5, 'Extremely fast resolution. Thank you!', $4),
    ('ISS-005', 'S105', 'Esha Sharma', 'Personal - Stress & anxiety management', 'Struggling to balance ISE syllabus and placement prep, feeling highly overwhelmed and anxious.', 'Medium', 'Submitted', 'RO-46', '2026-07-18T18:00:00Z', NULL, NULL, NULL, NULL, $5)
  `, [initialLogs1, initialLogs2, initialLogs3, initialLogs4, initialLogs5]);

  // 5. Seed Meetings
  await pool.query(`
    INSERT INTO meetings (id, issue_id, student_id, student_name, ro_id, date, time, mode, status) VALUES
    ('MEET-001', 'ISS-002', 'S102', 'Bhavana Rao', 'RO-26', '2026-07-20', '11:30', 'Offline', 'Confirmed')
  `);

  // 6. Seed Group Sessions
  await pool.query(`
    INSERT INTO group_sessions (id, mentor_id, mentor_name, title, date_time, description, link) VALUES
    ('SESS-001', 'M01', 'Dr. Rajesh Kumar', 'Project Selection Strategy & Industry Mentorship', '2026-07-22 14:30:00', 'Discussing the guidelines for final year projects, selecting domains, and assigning industry guides.', 'https://meet.google.com/abc-defg-hij'),
    ('SESS-002', 'M02', 'Prof. Sunita Sharma', 'Mid-Sem Performance Review & Guidance', '2026-07-25 10:00:00', 'One-on-one progress logs and group strategies to clear difficult core courses.', 'https://meet.google.com/xyz-uvwx-yza')
  `);

  // 7. Seed Resources
  await pool.query(`
    INSERT INTO resources (id, mentor_id, title, type, content, date_shared) VALUES
    ('RES-001', 'M01', 'Final Year Project Guidelines PDF', 'PDF', 'Official roadmap and rubrics for engineering design projects.', '2026-07-10'),
    ('RES-002', 'M01', 'Resume Templates for Tech Placement', 'Link', 'https://github.com/nitte-placement/templates', '2026-07-12'),
    ('RES-003', 'M02', 'Notes on Data Structures & Algorithms', 'Note', 'Review lectures 1-15 covering Graphs and Dynamic Programming strategies.', '2026-07-14')
  `);

  // 8. Seed System Logs
  await pool.query(`
    INSERT INTO system_logs (text, timestamp, user_role, user_id) VALUES
    ('System Initialized on PostgreSQL with Dynamic RO Routing.', '2026-07-19T01:00:00Z', 'Admin', 'SYSTEM'),
    ('Seeded 49 Category-Specific Relationship Officers.', '2026-07-19T01:05:00Z', 'Admin', 'SYSTEM'),
    ('Daniel Dsouza Library issue marked as Resolved by RO-41.', '2026-07-13T14:30:00Z', 'RO', 'RO-41'),
    ('Chaitra Hegde Scholarship issue escalated to Admin by RO-18.', '2026-07-14T15:20:00Z', 'RO', 'RO-18')
  `);

  console.log('PostgreSQL database seeded successfully.');
};

// Generic DB Query Helper
export const query = (text, params) => pool.query(text, params);
export const getPool = () => pool;
export const shutdown = () => pool.end();
export const dropAllTables = async () => {
  await pool.query(`DROP TABLE IF EXISTS email_logs, system_logs, resources, group_sessions, meetings, issues, students, ros, mentors, mentor_session_records CASCADE`);
  console.log('All database tables dropped.');
};
