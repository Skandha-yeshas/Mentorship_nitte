import pg from 'pg';
const { Client, Pool } = pg;
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required. Configure it in server/.env.');

// Extract database name from connection string
const dbName = connectionString.substring(connectionString.lastIndexOf('/') + 1);
const baseConnectionString = connectionString.substring(0, connectionString.lastIndexOf('/')) + '/postgres';

// RO categories are supplied through roster imports; no issue catalog is seeded.

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
    `CREATE TABLE IF NOT EXISTS app_settings (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL)`,
    `ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY`,
    // 1. Mentors
    `CREATE TABLE IF NOT EXISTS mentors (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL,
      dept VARCHAR(50),
      class VARCHAR(150),
      password VARCHAR(255)
    )`,
    
    // 2. ROs (49 dedicated ones - all using skandhayashu2906@gmail.com)
    `CREATE TABLE IF NOT EXISTS ros (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) NOT NULL DEFAULT 'skandhayashu2906@gmail.com',
      region VARCHAR(200),
      password VARCHAR(255)
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
      password VARCHAR(255)
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

    // Durable meeting media; meeting_id remains historical when a meeting is rescheduled.
    `CREATE TABLE IF NOT EXISTS meeting_recordings (
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
    )`,
    `CREATE INDEX IF NOT EXISTS meeting_recordings_ro_issue_idx ON meeting_recordings (ro_id, issue_id, recorded_at DESC)`,
    // No public policies: video bytes are served only through the authenticated backend.
    `ALTER TABLE meeting_recordings ENABLE ROW LEVEL SECURITY`,

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
    await pool.query(`ALTER TABLE mentor_session_records ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Submitted'`);
    await pool.query(`ALTER TABLE mentor_session_records DROP CONSTRAINT IF EXISTS mentor_session_records_mentor_id_fkey`);
    await pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS location VARCHAR(200) DEFAULT 'RO Office Desk'`);
    await pool.query(`ALTER TABLE meetings ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT ''`);
    await pool.query(`ALTER TABLE mentors ADD COLUMN IF NOT EXISTS password VARCHAR(255)`);
    await pool.query(`ALTER TABLE ros ADD COLUMN IF NOT EXISTS password VARCHAR(255)`);
    await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS password VARCHAR(255)`);
    await pool.query(`ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS direction VARCHAR(10) DEFAULT 'OUTBOUND'`);
    await pool.query(`ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS sender VARCHAR(150) DEFAULT 'system@nitte.edu.in'`);
    await pool.query(`ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient VARCHAR(150) DEFAULT 'student@nitte.edu.in'`);

    // Self-help guidance is entered by ROs after the roster has been imported.
  } catch (err) {
    console.log('Column alter & category videos sync complete:', err.message);
  }

  console.log('PostgreSQL database tables verified/created.');
};

export const seedTables = async () => {
  // All people and issue categories are provisioned through roster imports.
};



const getActivePool = () => {
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    });
    pool.on('error', (err) => {
      console.warn('[PostgreSQL Pool Notice]', err?.message || err);
      if (err?.code === 'ECONNRESET' || err?.code === '57P01' || err?.message?.includes('closed')) {
        pool = null;
      }
    });
  }
  return pool;
};

// Generic DB Query Helper with auto-reconnection
export const query = async (text, params) => {
  try {
    const currentPool = getActivePool();
    const result = await currentPool.query(text, params);
    isPgAvailable = true;
    return result;
  } catch (err) {
    console.warn('[PostgreSQL Query Error]', err.message);
    if (err.message.includes('closed') || err.message.includes('ended') || err.code === 'ECONNRESET') {
      try {
        pool = null;
        const freshPool = getActivePool();
        const retryResult = await freshPool.query(text, params);
        isPgAvailable = true;
        return retryResult;
      } catch (retryErr) {
        console.error('[PostgreSQL Retry Failed]', retryErr.message);
        throw retryErr;
      }
    }
    throw err;
  }
};

export const isDbConnected = () => isPgAvailable;

export const getFallbackState = () => {

  return {
    isPgConnected: false,
    users: {
      students: [],
      mentors: [],
      ros: []
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
