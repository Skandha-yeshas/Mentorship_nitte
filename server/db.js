import pg from 'pg';
const { Client, Pool } = pg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:Nsamfgc%40123@db.tadfbhczpmnyouoailds.supabase.co:5432/postgres';

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

let pool = null;
let isPgAvailable = false;
const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

// Check and Create database if it doesn't exist (only on local PostgreSQL)
const ensureDatabaseExists = async () => {
  if (!isLocalhost) return; // Managed cloud databases (Supabase, Neon) have DB already created
  const client = new Client({ connectionString: baseConnectionString, connectionTimeoutMillis: 1500 });
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
    // Gracefully ignore error when local PostgreSQL daemon is not active
  } finally {
    try { await client.end(); } catch (e) { }
  }
};

// Initialize PostgreSQL Pool
export const initDb = async () => {
  if (isLocalhost) {
    await ensureDatabaseExists();
  }
  
  pool = new Pool({
    connectionString,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });

  pool.on('error', (err) => {
    // Catch idle client errors without crashing server process
    isPgAvailable = false;
  });
  
  try {
    const client = await pool.connect();
    isPgAvailable = true;
    console.log(`Connected to PostgreSQL database: "${dbName}" (SSL: ${!isLocalhost})`);
    client.release();
    
    await createTables();
    await seedTables();
  } catch (err) {
    isPgAvailable = false;
    console.log('[PostgreSQL] Local database offline on port 5432. Running Express API in graceful In-Memory Demo Mode.');
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
    )`,

    // 11. Category Guidance & Solution Videos (RO Manageable)
    `CREATE TABLE IF NOT EXISTS category_videos (
      category VARCHAR(255) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      video_url TEXT NOT NULL,
      description TEXT,
      updated_by VARCHAR(100) DEFAULT 'System',
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,

    // 12. Mentor Feedbacks (Student feedback on mentoring classes)
    `CREATE TABLE IF NOT EXISTS mentor_feedbacks (
      id SERIAL PRIMARY KEY,
      student_id VARCHAR(50) REFERENCES students(id) ON DELETE CASCADE,
      student_name VARCHAR(100) NOT NULL,
      mentor_id VARCHAR(50) REFERENCES mentors(id) ON DELETE CASCADE,
      mentor_name VARCHAR(100) NOT NULL,
      regularity_rating INT NOT NULL CHECK (regularity_rating BETWEEN 1 AND 5),
      clarity_rating INT NOT NULL CHECK (clarity_rating BETWEEN 1 AND 5),
      participation_rating INT NOT NULL CHECK (participation_rating BETWEEN 1 AND 5),
      difficulties TEXT DEFAULT '',
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

    // Seed default guidance videos if not existing
    const defaultVideos = [
      {
        category: 'Academic',
        title: 'NITTE Academic Guide: Course Enrollment & Attendance Policy',
        video_url: 'https://www.youtube.com/watch?v=kqtD5dpn9C8',
        description: '1. Check student ERP portal for minimum 75% attendance threshold.\n2. Medical or duty leave certificates must be submitted to HOD within 3 days.\n3. Verify course elective credits with your department coordinator.'
      },
      {
        category: 'Exams',
        title: 'Examination Portal & Hall Ticket Resolution Walkthrough',
        video_url: 'https://www.youtube.com/watch?v=3JZ_D3ELwOQ',
        description: '1. Clear pending department dues before downloading exam admit card.\n2. Apply for revaluation via Controller of Examination portal within 7 days of result declaration.\n3. Make-up exam forms are verified automatically based on attendance approval.'
      },
      {
        category: 'Financial',
        title: 'Fee Installments, Scholarships & Payment Receipt Assistance',
        video_url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
        description: '1. Download fee receipt directly from Finance Portal under Transaction History.\n2. For installment plans, submit parent undertaking letter.\n3. State & National Scholarship bonafide certificates are issued at Admin Desk Counter 2.'
      },
      {
        category: 'Hostels',
        title: 'Campus Hostel Maintenance, Mess & Facility Protocol',
        video_url: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
        description: '1. For electrical or plumbing issues, log a ticket in the Hostel Maintenance Register at block warden desk.\n2. Mess committee meetings are held on the 1st of every month.\n3. Curfew extension passes must be requested 24 hours prior via Warden.'
      },
      {
        category: 'Placements',
        title: 'Placement Training, Resume Verification & Drive Registration',
        video_url: 'https://www.youtube.com/watch?v=21X5lGlDOfg',
        description: '1. Ensure resume PDF is verified by Placement Cell coordinator.\n2. Update CGPA and active backlogs in the training portal.\n3. Collect NOC certificates from Training & Placement Officer.'
      },
      {
        category: 'Facilities',
        title: 'Campus Facilities: Library Access, Gym & Transport Services',
        video_url: 'https://www.youtube.com/watch?v=OPf0YbXqDm0',
        description: '1. Digital Library accounts are active for all enrolled students.\n2. Campus bus route passes can be renewed at Transport Office.\n3. Sports equipment is issued with valid student ID card.'
      },
      {
        category: 'Personal',
        title: 'Student Counseling, Wellness & Mentorship Support',
        video_url: 'https://www.youtube.com/watch?v=7wtfhZwyrcc',
        description: '1. Confidential student counseling is available at Wellness Center Block B.\n2. Mentors are available every Wednesday during tutorial hours.\n3. Reach out to your Relationship Officer for a private 1-on-1 session.'
      }
    ];

    for (const v of defaultVideos) {
      await pool.query(
        `INSERT INTO category_videos (category, title, video_url, description, updated_by)
         VALUES ($1, $2, $3, $4, 'System')
         ON CONFLICT (category) DO NOTHING`,
        [v.category, v.title, v.video_url, v.description]
      );
    }
  } catch (err) {
    console.log('Column alter & category videos sync complete:', err.message);
  }

  console.log('PostgreSQL database tables verified/created.');
};

export const seedTables = async () => {
  // Check if ROs are already seeded
  const roCheck = await pool.query(`SELECT COUNT(*) FROM ros`);
  if (parseInt(roCheck.rows[0].count) > 0) {
    console.log('ROs already seeded. Skipping initial seeding.');
    return;
  }

  console.log('Database tables are clean. Seeding 49 category Relationship Officers...');

  // 1. Seed 49 Dedicated ROs Dynamically based on the Categories
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
  // 2. Seed Mentors if empty
  const mentorCheck = await pool.query(`SELECT COUNT(*) FROM mentors`);
  if (parseInt(mentorCheck.rows[0].count) === 0) {
    const defaultMentors = [
      { id: 'M101', name: 'Dr. Radhakrishnan', email: 'radhakrishnan@nitte.edu', dept: 'CSE', class: '5th Sem CSE - Sec A', password: 'Nit#Mnt2026' },
      { id: 'M102', name: 'Dr. Preethi Hegde', email: 'preethi.hegde@nitte.edu', dept: 'CSE', class: '3rd Sem CSE - Sec B', password: 'Nit#Mnt2026' },
      { id: 'M103', name: 'Prof. Ramesh Rao', email: 'ramesh.rao@nitte.edu', dept: 'BCA', class: '3rd Sem BCA - Sec A', password: 'Nit#Mnt2026' },
      { id: 'M104', name: 'Dr. Deepa Shenoy', email: 'deepa.shenoy@nitte.edu', dept: 'BBA', class: '1st Sem BBA - Sec A', password: 'Nit#Mnt2026' },
      { id: 'M105', name: 'Prof. Raghavendra Pai', email: 'raghavendra.pai@nitte.edu', dept: 'BCOM', class: '5th Sem BCOM - Sec A', password: 'Nit#Mnt2026' },
      { id: 'M01', name: 'Dr. Rajesh Kumar', email: 'rajesh.kumar@nitte.edu', dept: 'CSE', class: '5th Sem CSE - Section A (28 Mentees)', password: 'Nit#Mnt2026' },
      { id: 'M02', name: 'Prof. Sunita Sharma', email: 'sunita.sharma@nitte.edu', dept: 'ISE', class: '3rd Sem ISE - Section B (26 Mentees)', password: 'Nit#Mnt2026' }
    ];
    for (const m of defaultMentors) {
      await pool.query(
        `INSERT INTO mentors (id, name, email, dept, class, password) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
        [m.id, m.name, m.email, m.dept, m.class, m.password]
      );
    }
  }

  // 3. Seed Students if empty
  const studentCheck = await pool.query(`SELECT COUNT(*) FROM students`);
  if (parseInt(studentCheck.rows[0].count) === 0) {
    const defaultStudents = [
      { id: 'S101', name: 'Aarav Mehta', email: 'skandhayashas2906@gmail.com', mentorId: 'M101', phone: '9876543210', branch: 'CSE', sem: 5, password: 'Nit#Stu2026' },
      { id: 'S102', name: 'Bhavana Rao', email: 'skandhayashas2906@gmail.com', mentorId: 'M101', phone: '9876543211', branch: 'CSE', sem: 5, password: 'Nit#Stu2026' },
      { id: 'S103', name: 'Chaitra Hegde', email: 'skandhayashas2906@gmail.com', mentorId: 'M101', phone: '9876543212', branch: 'CSE', sem: 5, password: 'Nit#Stu2026' },
      { id: 'S104', name: 'Daniel Dsouza', email: 'skandhayashas2906@gmail.com', mentorId: 'M101', phone: '9876543213', branch: 'CSE', sem: 5, password: 'Nit#Stu2026' },
      { id: 'S105', name: 'Esha Sharma', email: 'skandhayashas2906@gmail.com', mentorId: 'M102', phone: '9876543214', branch: 'ISE', sem: 3, password: 'Nit#Stu2026' },
      { id: 'S106', name: 'Farhan Khan', email: 'skandhayashas2906@gmail.com', mentorId: 'M102', phone: '9876543215', branch: 'ISE', sem: 3, password: 'Nit#Stu2026' },
      { id: 'S107', name: 'Gautam Shenoy', email: 'skandhayashas2906@gmail.com', mentorId: 'M102', phone: '9876543216', branch: 'ISE', sem: 3, password: 'Nit#Stu2026' },
      { id: 'S108', name: 'Harshita Pai', email: 'skandhayashas2906@gmail.com', mentorId: 'M102', phone: '9876543217', branch: 'ISE', sem: 3, password: 'Nit#Stu2026' }
    ];
    for (const s of defaultStudents) {
      await pool.query(
        `INSERT INTO students (id, name, email, mentor_id, phone, branch, sem, password) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
        [s.id, s.name, s.email, s.mentorId, s.phone, s.branch, s.sem, s.password]
      );
    }
  }

  console.log('Database tables seeded with ROs, Mentors, and Students.');
};

const getActivePool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000
    });
    pool.on('error', () => { isPgAvailable = false; });
  }
  return pool;
};

// Generic DB Query Helper
export const query = async (text, params) => {
  if (!isPgAvailable) {
    return { rows: [], rowCount: 0 };
  }
  return getActivePool().query(text, params);
};

export const isDbConnected = () => isPgAvailable;

export const getFallbackState = () => {
  const defaultMentors = [
    { id: 'M101', name: 'Dr. Radhakrishnan', email: 'radhakrishnan@nitte.edu', dept: 'CSE', class: '5th Sem CSE - Sec A', password: 'Nit#Mnt2026' },
    { id: 'M102', name: 'Dr. Preethi Hegde', email: 'preethi.hegde@nitte.edu', dept: 'CSE', class: '3rd Sem CSE - Sec B', password: 'Nit#Mnt2026' },
    { id: 'M103', name: 'Prof. Ramesh Rao', email: 'ramesh.rao@nitte.edu', dept: 'BCA', class: '3rd Sem BCA - Sec A', password: 'Nit#Mnt2026' },
    { id: 'M104', name: 'Dr. Deepa Shenoy', email: 'deepa.shenoy@nitte.edu', dept: 'BBA', class: '1st Sem BBA - Sec A', password: 'Nit#Mnt2026' },
    { id: 'M105', name: 'Prof. Raghavendra Pai', email: 'raghavendra.pai@nitte.edu', dept: 'BCOM', class: '5th Sem BCOM - Sec A', password: 'Nit#Mnt2026' },
    { id: 'M01', name: 'Dr. Rajesh Kumar', email: 'rajesh.kumar@nitte.edu', dept: 'CSE', class: '5th Sem CSE - Section A (28 Mentees)', password: 'Nit#Mnt2026' },
    { id: 'M02', name: 'Prof. Sunita Sharma', email: 'sunita.sharma@nitte.edu', dept: 'ISE', class: '3rd Sem ISE - Section B (26 Mentees)', password: 'Nit#Mnt2026' }
  ];

  const defaultStudents = [
    { id: 'S101', name: 'Aarav Mehta', email: 'skandhayashas2906@gmail.com', mentorId: 'M101', phone: '9876543210', branch: 'CSE', sem: 5, password: 'Nit#Stu2026' },
    { id: 'S102', name: 'Bhavana Rao', email: 'skandhayashas2906@gmail.com', mentorId: 'M101', phone: '9876543211', branch: 'CSE', sem: 5, password: 'Nit#Stu2026' },
    { id: 'S103', name: 'Chaitra Hegde', email: 'skandhayashas2906@gmail.com', mentorId: 'M101', phone: '9876543212', branch: 'CSE', sem: 5, password: 'Nit#Stu2026' },
    { id: 'S104', name: 'Daniel Dsouza', email: 'skandhayashas2906@gmail.com', mentorId: 'M101', phone: '9876543213', branch: 'CSE', sem: 5, password: 'Nit#Stu2026' },
    { id: 'S105', name: 'Esha Sharma', email: 'skandhayashas2906@gmail.com', mentorId: 'M102', phone: '9876543214', branch: 'ISE', sem: 3, password: 'Nit#Stu2026' },
    { id: 'S106', name: 'Farhan Khan', email: 'skandhayashas2906@gmail.com', mentorId: 'M102', phone: '9876543215', branch: 'ISE', sem: 3, password: 'Nit#Stu2026' },
    { id: 'S107', name: 'Gautam Shenoy', email: 'skandhayashas2906@gmail.com', mentorId: 'M102', phone: '9876543216', branch: 'ISE', sem: 3, password: 'Nit#Stu2026' },
    { id: 'S108', name: 'Harshita Pai', email: 'skandhayashas2906@gmail.com', mentorId: 'M102', phone: '9876543217', branch: 'ISE', sem: 3, password: 'Nit#Stu2026' }
  ];

  const defaultRos = ALL_CATEGORIES.map((cat, i) => ({
    id: `RO-${String(i + 1).padStart(2, '0')}`,
    name: `RO - ${cat.split(' - ')[1]}`,
    email: 'skandhayashu2906@gmail.com',
    region: `${cat.split(' - ')[0]} Support Desk`,
    password: 'Nit#Ro2026'
  }));

  return {
    isPgConnected: false,
    users: {
      students: defaultStudents,
      mentors: defaultMentors,
      ros: defaultRos
    },
    issues: [],
    meetings: [],
    groupSessions: [],
    resources: [],
    mentorSessionRecords: [],
    categoryVideos: [],
    mentorFeedbacks: [],
    systemLogs: []
  };
};

export const getPool = () => getActivePool();
export const shutdown = () => pool ? pool.end() : Promise.resolve();
export const dropAllTables = async () => {
  if (!isPgAvailable) return;
  await pool.query(`DROP TABLE IF EXISTS email_logs, system_logs, resources, group_sessions, meetings, issues, students, ros, mentors, mentor_session_records, mentor_feedbacks CASCADE`);
  console.log('All database tables dropped.');
};
