import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID, randomBytes } from 'node:crypto';
import { getQuotaLockMessage } from '../shared/grievanceQuota.js';
import { createIssueQuotaReader, createStudentSubmissionLock } from './issueQuota.js';
import { createIssueActivityStore } from './issueActivity.js';
import { getCategoryVideoUpdate } from '../shared/categoryGuidance.js';
import { createMeetingScheduleEvent } from '../shared/meetingReassignments.js';
import { createAdminAnalyticsReader, createAdminAnalyticsRouter } from './adminAnalytics.js';
import { createAuth } from './security/auth.js';
import { createAccessPolicy } from './security/access.js';
import { createDataGateway, tableScope } from './security/dataGateway.js';
import { scopeState, stripSecrets } from './security/scopedState.js';
import { initializeSecurity } from './security/initialize.js';
import { hashPassword, validatePassword } from './security/passwords.js';
import { createRecordingRepository, createRecordingsRouter } from './recordings.js';
import { initDb, query, isDbConnected, getFallbackState, getPool } from './db.js';
import { normalizeRoRosterRow } from '../shared/roCatalog.js';
import { sendGmailNotification, getEmailLogs, processInboundGmailReply, GMAIL_ADDRESS } from './gmailService.js';
import { startImapListener, getImapStatus } from './gmailImapService.js';

dotenv.config();

// Prevent network socket resets (like ECONNRESET) from crashing server process
process.on('uncaughtException', (err) => {
  console.warn('[Server] Uncaught exception caught safely:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.warn('[Server] Unhandled rejection caught safely:', reason?.message || reason);
});

const app = express();
const auth = createAuth({ query, secure: process.env.NODE_ENV === 'production' });
const access = createAccessPolicy(query);
const recordingAuth = {
  require(req, res, next) {
    if (!req.user || !['Admin', 'RO'].includes(req.user.role)) return res.status(403).json({ error: 'Recording access is restricted.' });
    req.recordingUser = req.user; next();
  },
  revoke(req, res) { res.status(204).end(); }
};
const PORT = process.env.PORT || 5001;

const allowedOrigin = origin => !origin || origin === process.env.APP_ORIGIN
  || process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):(5173|5001)$/.test(origin);
app.use(cors({ origin: (origin, callback) => callback(null, allowedOrigin(origin)), credentials: true }));
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !allowedOrigin(req.get('Origin'))) return res.status(403).json({ error: 'Request origin is not allowed.' });
  next();
});
app.use(express.json({ limit: '2mb' }));
app.use('/api/auth', auth.router);
app.use('/api', (req, res, next) => req.path === '/auth/register-student' ? next() : auth.require(req, res, next));
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/register-student') return next();
  if (req.path === '/db-state') {
    const send = res.json.bind(res);
    res.json = body => send(body.error ? body : scopeState(body, req.user));
    res.set('Cache-Control', 'private, no-store');
  }
  access.middleware(req, res, next);
});
app.use('/api/data', createDataGateway(query));
app.use('/api/admin/analytics', createAdminAnalyticsRouter({ read: createAdminAnalyticsReader(query) }));

// Initialize Database & Gmail IMAP Poller on server start
// Initialization and password migration finish before the HTTP server begins accepting requests.

// Helper to log system events to PostgreSQL
const logSystemEvent = async (text, userRole, userId) => {
  if (!isDbConnected()) return;
  try {
    await query(
      `INSERT INTO system_logs (text, user_role, user_id) VALUES ($1, $2, $3)`,
      [text, userRole, userId]
    );
  } catch (err) {
    console.error('Failed to write system log:', err);
  }
};

// In-memory issue store to guarantee zero data loss when direct PG pool is disconnected
const inMemoryIssues = [];
// In-memory meeting store to guarantee zero meeting status loss across restarts/polling
const inMemoryMeetings = [];

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tadfbhczpmnyouoailds.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_JcJbgPJnh3ecRyMqqpetEg_r-q3IZLO';

async function fetchSupabaseState() {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  try {
    const [stuRes, mntRes, rosRes, issRes, meetRes, sessRes, resRes, recRes, fbRes, vidRes] = await Promise.allSettled([
      fetch(`${SUPABASE_URL}/rest/v1/students?select=*`, { headers }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/mentors?select=*`, { headers }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/ros?select=*`, { headers }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/issues?select=*&order=created_at.desc`, { headers }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/meetings?select=*`, { headers }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/group_sessions?select=*&order=date_time.asc`, { headers }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/resources?select=*&order=date_shared.desc`, { headers }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/mentor_session_records?select=*&order=created_at.desc`, { headers }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/mentor_feedbacks?select=*&order=created_at.desc`, { headers }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/category_videos?select=*`, { headers }).then(r => r.json())
    ]);

    const rawIssues = issRes.status === 'fulfilled' && Array.isArray(issRes.value) ? issRes.value : [];
    const mappedIssues = rawIssues.map(issue => {
      let feedback = null;
      if (issue.feedback_rating !== null && issue.feedback_rating !== undefined) {
        feedback = {
          rating: issue.feedback_rating,
          comments: issue.feedback_comments || ''
        };
      }
      return {
        id: issue.id,
        studentId: issue.student_id || issue.studentId,
        student_id: issue.student_id || issue.studentId,
        studentName: issue.student_name || issue.studentName,
        student_name: issue.student_name || issue.studentName,
        category: issue.category,
        description: issue.description,
        priority: issue.priority,
        status: issue.status,
        roId: issue.ro_id || issue.roId,
        ro_id: issue.ro_id || issue.roId,
        createdAt: issue.created_at || issue.createdAt,
        created_at: issue.created_at || issue.createdAt,
        resolvedAt: issue.resolved_at || issue.resolvedAt,
        resolutionNotes: issue.resolution_notes || issue.resolutionNotes,
        feedback,
        logs: Array.isArray(issue.logs) ? issue.logs : (typeof issue.logs === 'string' ? JSON.parse(issue.logs || '[]') : [])
      };
    });

    // Merge any recent in-memory issues
    const idSet = new Set(mappedIssues.map(i => (i.id || '').toUpperCase()));
    for (const im of inMemoryIssues) {
      if (!idSet.has((im.id || '').toUpperCase())) {
        mappedIssues.unshift(im);
      }
    }

    const rawMeetings = meetRes.status === 'fulfilled' && Array.isArray(meetRes.value) ? meetRes.value : [];
    const mappedMeetings = rawMeetings.map(m => ({
      id: m.id,
      issueId: m.issue_id || m.issueId,
      studentId: m.student_id || m.studentId,
      studentName: m.student_name || m.studentName,
      roId: m.ro_id || m.roId,
      date: m.date,
      time: m.time,
      mode: m.mode,
      location: m.location,
      notes: m.notes,
      status: m.status
    }));

    // Merge recent in-memory meetings to preserve active statuses (e.g. Started)
    for (const im of inMemoryMeetings) {
      const imKey = (im.id || im.issueId || '').toUpperCase();
      const matchIdx = mappedMeetings.findIndex(m =>
        (m.id && String(m.id).toUpperCase() === imKey) ||
        (m.issueId && String(m.issueId).toUpperCase() === imKey)
      );
      if (matchIdx >= 0) {
        mappedMeetings[matchIdx] = { ...mappedMeetings[matchIdx], ...im };
      } else {
        mappedMeetings.unshift(im);
      }
    }

    return {
      users: {
        students: stuRes.status === 'fulfilled' && Array.isArray(stuRes.value) ? stuRes.value : [],
        mentors: mntRes.status === 'fulfilled' && Array.isArray(mntRes.value) ? mntRes.value : [],
        ros: rosRes.status === 'fulfilled' && Array.isArray(rosRes.value) ? rosRes.value : []
      },
      issues: mappedIssues,
      meetings: mappedMeetings,
      groupSessions: sessRes.status === 'fulfilled' && Array.isArray(sessRes.value) ? sessRes.value : [],
      resources: resRes.status === 'fulfilled' && Array.isArray(resRes.value) ? resRes.value : [],
      mentorSessionRecords: recRes.status === 'fulfilled' && Array.isArray(recRes.value) ? recRes.value : [],
      categoryVideos: vidRes.status === 'fulfilled' && Array.isArray(vidRes.value) ? vidRes.value : [],
      mentorFeedbacks: fbRes.status === 'fulfilled' && Array.isArray(fbRes.value) ? fbRes.value : [],
      systemLogs: []
    };
  } catch (err) {
    console.warn('[Server] Supabase REST fetch error:', err.message);
    return null;
  }
}

// 1. GET FULL APP STATE (For quick frontend loading)
app.get('/api/db-state', async (req, res) => {
  const emailLogs = await getEmailLogs().catch(() => []);

  if (!isDbConnected()) {
    const cloudState = await fetchSupabaseState();
    if (cloudState) {
      return res.json({
        ...cloudState,
        isPgConnected: false,
        gmailAddress: GMAIL_ADDRESS,
        gmailLogs: emailLogs,
        imapStatus: getImapStatus()
      });
    }
    const fallback = getFallbackState();
    return res.json({
      ...fallback,
      issues: inMemoryIssues.length > 0 ? inMemoryIssues : fallback.issues,
      gmailAddress: GMAIL_ADDRESS,
      gmailLogs: emailLogs,
      imapStatus: getImapStatus()
    });
  }

  try {
    const studentsRes = await query(`SELECT id, name, email, mentor_id AS "mentorId", phone, branch, sem FROM students`);
    const resetVersion = await query("SELECT value FROM app_settings WHERE key = 'grievance_reset_version'");
    const mentorsRes = await query(`SELECT id, name, email, dept, class FROM mentors`);
    const rosRes = await query(`SELECT id, name, email, region FROM ros`);
    const issuesRes = await query(`
      SELECT id, student_id AS "studentId", student_name AS "studentName", 
             category, description, priority, status, ro_id AS "roId", 
             created_at AS "createdAt", resolved_at AS "resolvedAt", 
             resolution_notes AS "resolutionNotes", feedback_rating AS "feedbackRating", 
             feedback_comments AS "feedbackComments", logs 
      FROM issues ORDER BY created_at DESC
    `);
    const meetingsRes = await query(`SELECT id, issue_id AS "issueId", student_id AS "studentId", student_name AS "studentName", ro_id AS "roId", date, time, mode, location, notes, status FROM meetings`);
    const sessionsRes = await query(`SELECT id, mentor_id AS "mentorId", mentor_name AS "mentorName", title, date_time AS "dateTime", description, link FROM group_sessions ORDER BY date_time ASC`);
    const resourcesRes = await query(`SELECT id, mentor_id AS "mentorId", title, type, content, date_shared AS "dateShared" FROM resources ORDER BY date_shared DESC`);
    const mentorRecordsRes = await query(`SELECT id, mentor_id AS "mentorId", session_date AS "sessionDate", students_attended AS "studentsAttended", topic, notes, which_class AS "whichClass", location, status, created_at AS "createdAt" FROM mentor_session_records ORDER BY created_at DESC`);
    const mentorFeedbacksRes = await query(`SELECT id, student_id AS "studentId", student_name AS "studentName", mentor_id AS "mentorId", mentor_name AS "mentorName", regularity_rating AS "regularityRating", clarity_rating AS "clarityRating", participation_rating AS "participationRating", difficulties, created_at AS "createdAt" FROM mentor_feedbacks ORDER BY created_at DESC`);
    const logsRes = await query(`SELECT id, text, timestamp, user_role AS "userRole", user_id AS "userId" FROM system_logs ORDER BY timestamp DESC LIMIT 100`);
    let categoryVideosRes = { rows: [] };
    try {
      categoryVideosRes = await query(`SELECT category, title, video_url AS "videoUrl", description, updated_by AS "updatedBy", updated_at AS "updatedAt" FROM category_videos`);
    } catch (e) {
      console.warn('Could not query category_videos:', e.message);
    }
    const emailLogs = await getEmailLogs();

    // Map issues database columns to camelCase matching frontend layout
    const mappedIssues = issuesRes.rows.map(issue => {
      let feedback = null;
      if (issue.feedback_rating !== null && issue.feedback_rating !== undefined) {
        feedback = {
          rating: issue.feedback_rating,
          comments: issue.feedback_comments || ''
        };
      }
      return {
        id: issue.id,
        studentId: issue.student_id || issue.studentId,
        studentName: issue.student_name || issue.studentName,
        category: issue.category,
        description: issue.description,
        priority: issue.priority,
        status: issue.status,
        roId: issue.ro_id || issue.roId,
        createdAt: issue.created_at || issue.createdAt,
        resolvedAt: issue.resolved_at || issue.resolvedAt,
        resolutionNotes: issue.resolution_notes || issue.resolutionNotes,
        feedback,
        logs: issue.logs
      };
    });

    const mergedPgMeetings = [...meetingsRes.rows];
    for (const im of inMemoryMeetings) {
      const imKey = (im.id || im.issueId || '').toUpperCase();
      const matchIdx = mergedPgMeetings.findIndex(m =>
        (m.id && String(m.id).toUpperCase() === imKey) ||
        (m.issueId && String(m.issueId).toUpperCase() === imKey)
      );
      if (matchIdx >= 0) {
        mergedPgMeetings[matchIdx] = { ...mergedPgMeetings[matchIdx], ...im };
      } else {
        mergedPgMeetings.unshift(im);
      }
    }

    res.json({
      users: {
        students: studentsRes.rows,
        mentors: mentorsRes.rows,
        ros: rosRes.rows
      },
      issues: mappedIssues,
      grievanceResetVersion: resetVersion.rows[0]?.value || null,
      meetings: mergedPgMeetings,
      groupSessions: sessionsRes.rows,
      resources: resourcesRes.rows,
      mentorSessionRecords: mentorRecordsRes.rows,
      categoryVideos: categoryVideosRes.rows,
      mentorFeedbacks: mentorFeedbacksRes.rows,
      systemLogs: logsRes.rows,
      gmailAddress: GMAIL_ADDRESS,
      gmailLogs: emailLogs,
      imapStatus: getImapStatus()
    });
  } catch (err) {
    console.warn('[Server] DB query error, falling back to Supabase Cloud REST:', err.message);
    const cloudState = await fetchSupabaseState();
    if (cloudState) {
      return res.json({
        ...cloudState,
        isPgConnected: false,
        gmailAddress: GMAIL_ADDRESS,
        gmailLogs: emailLogs,
        imapStatus: getImapStatus()
      });
    }
    const fallback = getFallbackState();
    res.json({
      ...fallback,
      issues: inMemoryIssues.length > 0 ? inMemoryIssues : fallback.issues,
      gmailAddress: GMAIL_ADDRESS,
      gmailLogs: emailLogs,
      imapStatus: getImapStatus()
    });
  }
});

// GMAIL SYSTEM API ENDPOINTS
app.get('/api/gmail/imap-status', (req, res) => {
  res.json(getImapStatus());
});

app.get('/api/gmail/logs', async (req, res) => {
  try {
    const logs = await getEmailLogs();
    const params = [];
    const scope = tableScope('issues', req.user, params);
    const ids = new Set((await query(`SELECT id FROM issues WHERE ${scope}`, params)).rows.map(row => row.id));
    res.set('Cache-Control', 'private, no-store').json({
      gmailAddress: req.user.role === 'Admin' ? GMAIL_ADDRESS : undefined,
      imapStatus: req.user.role === 'Admin' ? getImapStatus() : undefined,
      logs: logs.filter(row => req.user.role === 'Admin' || ids.has(row.issueId || row.issue_id)).map(({ body, html, text, ...row }) => stripSecrets(row))
    });
  } catch (err) {
    console.error('Error fetching Gmail logs:', err);
    res.status(500).json({ error: 'Failed to fetch Gmail logs' });
  }
});

app.post('/api/gmail/send', async (req, res) => {
  const { to, subject, html, text, issueId, eventType } = req.body;
  if (!to || !subject || (!html && !text)) {
    return res.status(400).json({ error: 'Missing required parameters (to, subject, content)' });
  }
  try {
    const record = await sendGmailNotification({ to, subject, html, text, issueId, eventType });
    res.status(201).json({ success: true, record });
  } catch (err) {
    console.error('Error sending custom Gmail:', err);
    res.status(500).json({ error: 'Failed to send Gmail message' });
  }
});

app.post('/api/gmail/simulate-inbound', async (req, res) => {
  const { senderEmail, senderName, issueId, replyText } = req.body;
  if (!senderEmail || !issueId || !replyText) {
    return res.status(400).json({ error: 'Missing required fields (senderEmail, issueId, replyText)' });
  }
  try {
    const result = await processInboundGmailReply({ senderEmail, senderName, issueId, replyText });
    res.json(result);
  } catch (err) {
    console.error('Error processing Gmail inbound reply:', err);
    res.status(500).json({ error: 'Failed to process Gmail reply' });
  }
});

// COMPUTER PASSWORD GENERATOR HELPER
const generateComputerPassword = () => {
  return randomBytes(18).toString('base64url');
};

// Student enrollment is managed by Admin roster imports.
app.post('/api/auth/register-student', (req, res) => {
  res.status(403).json({ error: 'Student accounts are created through Admin roster import. Contact your college administrator.' });
});

// ADMIN BULK STUDENT ROSTER UPLOAD & AUTOMATED GMAIL CREDENTIAL DISPATCH
app.post('/api/admin/assign-students-to-mentor', async (req, res) => {
  try {
    const { mentorId, studentIdsToAssign = [], studentIdsToUnassign = [] } = req.body;
    if (!Array.isArray(studentIdsToAssign) || !Array.isArray(studentIdsToUnassign) || studentIdsToAssign.length + studentIdsToUnassign.length > 2000) return res.status(400).json({ error: 'Invalid student assignment list.' });
    if (!(await query('SELECT id FROM mentors WHERE id = $1', [mentorId])).rowCount) return res.status(400).json({ error: 'Mentor not found.' });
    if (studentIdsToAssign.length) await query('UPDATE students SET mentor_id = $1 WHERE id = ANY($2::varchar[])', [mentorId, studentIdsToAssign]);
    if (studentIdsToUnassign.length) await query('UPDATE students SET mentor_id = NULL WHERE mentor_id = $1 AND id = ANY($2::varchar[])', [mentorId, studentIdsToUnassign]);
    res.json({ success: true, count: studentIdsToAssign.length });
  } catch { res.status(503).json({ error: 'Could not update mentor assignments.' }); }
});
app.post('/api/admin/delete-ro', async (req, res) => {
  try { await query('DELETE FROM ros WHERE id = $1', [req.body.roId]); res.json({ success: true }); }
  catch { res.status(503).json({ error: 'Could not remove this RO.' }); }
});

app.post('/api/admin/bulk-upload-students', async (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'Payload must contain a non-empty "students" array.' });
  }

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    if (!s || typeof s !== 'object') continue;
    const rawId = s.id || s.usn || s.studentId || s.USN || s['Student ID'] || s['Student USN'] || s['USN / ID'] || s['Roll No'] || s['Roll Number'] || s['ID'];
    const rawName = s.name || s.studentName || s.Name || s['Student Name'] || s['Full Name'] || s['Student'];

    // Skip empty or blank lines
    if (!rawId && !rawName) continue;

    const studentId = String(rawId || `4NM23CS${String(i + 1).padStart(3, '0')}`).trim().toUpperCase();
    const name = String(rawName || `Student ${studentId}`).trim();
    const defaultEmail = `${studentId.toLowerCase()}@nitte.edu.in`;
    const rawEmail = s.email || s.studentEmail || s.Email || s.gmail || s['Gmail'] || s['Student Email'] || s['Email Address'] || s['Student Gmail'] || s['Mail'] || defaultEmail;
    const branch = s.branch || s.Branch || s.department || s.Dept || 'CSE';
    const sem = parseInt(s.sem || s.Sem || s.semester || s.Semester) || 5;
    const phone = s.phone || s.Phone || s.mobile || '9876543210';
    let mentorId = (s.mentorId || s.mentor_id || '').trim() || null;
    if (mentorId) {
      try {
        const checkMentor = await query('SELECT id FROM mentors WHERE UPPER(id) = $1', [mentorId.toUpperCase()]);
        if (!checkMentor.rows || checkMentor.rows.length === 0) {
          mentorId = null;
        } else {
          mentorId = checkMentor.rows[0].id;
        }
      } catch (e) {
        mentorId = null;
      }
    }

    const email = String(rawEmail).trim().toLowerCase();
    const generatedPassword = s.password && String(s.password).trim() ? String(s.password).trim() : generateComputerPassword();

    try {
      // Upsert into PostgreSQL students table
      validatePassword(generatedPassword);
      await query(
        `INSERT INTO students (id, name, email, mentor_id, phone, branch, sem, password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           branch = EXCLUDED.branch,
           sem = EXCLUDED.sem,
           password = EXCLUDED.password,
           mentor_id = COALESCE(EXCLUDED.mentor_id, students.mentor_id)`,
        [studentId, name, email, mentorId, phone, branch, sem, await hashPassword(generatedPassword)]
      );
      await query('DELETE FROM auth_sessions WHERE user_id = $1 AND user_role = $2', [studentId, 'Student']);

      const portalBaseUrl = process.env.APP_URL || (req.headers.host ? `http://${req.headers.host}` : 'http://localhost:5173');
      const directLoginUrl = `${portalBaseUrl.replace(/\/$/, '')}/?role=Student&id=${encodeURIComponent(studentId)}`;

      // Send automated onboarding credential email via Gmail SMTP
      const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NITTE Student Account Credentials</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Modern Gradient Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #091e42 0%, #1e3a8a 52%, #2563eb 100%); padding: 36px 32px 28px; text-align: center; color: #ffffff;">
              <div style="display: inline-block; background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 30px; padding: 5px 16px; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #bfdbfe; margin-bottom: 14px;">
                🏛️ NITTE (DEEMED TO BE UNIVERSITY)
              </div>
              <h1 style="margin: 0; font-size: 23px; font-weight: 800; letter-spacing: -0.3px; color: #ffffff; line-height: 1.3;">
                Student Mentorship Portal
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #93c5fd; font-weight: 400;">
                Official Account Activation & One-Click Login Access
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px;">
              <p style="margin: 0 0 14px; font-size: 16px; color: #0f172a; line-height: 1.5;">
                Dear <strong style="color: #1e3a8a;">${name}</strong>,
              </p>
              <p style="margin: 0 0 18px; font-size: 14px; color: #475569; line-height: 1.6;">
                Welcome! Your official student account has been created and verified by College Administration. You are now officially enrolled in the <strong>NITTE Student Mentorship & Grievance Escalation System</strong>.
              </p>

              <!-- Academic Profile Snapshot Tag -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 22px;">
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #334155;">
                    <span style="display: inline-block; margin-right: 18px;"><strong>📚 Branch:</strong> ${branch}</span>
                    <span style="display: inline-block; margin-right: 18px;"><strong>🎓 Semester:</strong> Sem ${sem}</span>
                    <span style="display: inline-block;"><strong>🛡️ Role:</strong> Student (Mentee)</span>
                  </td>
                </tr>
              </table>

              <!-- Modern Credentials Box -->
              <div style="background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); border: 1px solid #cbd5e1; border-top: 4px solid #2563eb; border-radius: 12px; padding: 20px; margin-bottom: 26px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                  <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #1e3a8a;">
                    🔐 Official Login Credentials
                  </h3>
                  <span style="font-size: 11px; background: #ecfdf5; color: #059669; padding: 3px 8px; border-radius: 20px; font-weight: 700; border: 1px solid #a7f3d0;">
                    ✓ Active
                  </span>
                </div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; color: #1e293b; line-height: 1.8;">
                  <tr>
                    <td width="38%" style="color: #64748b; font-weight: 600; padding: 5px 0;">Student USN / ID:</td>
                    <td style="padding: 5px 0;">
                      <code style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 14px; font-weight: 700; background: #eff6ff; color: #1d4ed8; padding: 3px 8px; border-radius: 6px; border: 1px solid #bfdbfe;">
                        ${studentId}
                      </code>
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0;">Registered Gmail:</td>
                    <td style="padding: 5px 0;">
                      <code style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 13px; color: #334155; background: #f1f5f9; padding: 3px 8px; border-radius: 6px;">
                        ${email}
                      </code>
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0;">Generated Password:</td>
                    <td style="padding: 5px 0;">
                      <code style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 15px; font-weight: 800; background: #fef2f2; color: #dc2626; padding: 4px 10px; border-radius: 6px; border: 1px solid #fecaca; letter-spacing: 0.5px;">
                        ${generatedPassword}
                      </code>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Direct 1-Click Login Button Section -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0 16px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35);">
                          <a href="${directLoginUrl}" target="_blank" style="display: inline-block; padding: 14px 34px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; letter-spacing: 0.2px;">
                            👉 Open Student Login Portal
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b; text-align: center;">
                      ⚡ Pre-fills your USN on the login page. Simply click "Sign In" to enter.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct URL Box -->
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; margin-top: 18px; font-size: 12px; color: #475569;">
                <p style="margin: 0 0 6px; font-weight: 600; color: #334155;">Direct Login Link (if button does not open):</p>
                <a href="${directLoginUrl}" target="_blank" style="color: #2563eb; text-decoration: underline; word-break: break-all; font-family: monospace; font-size: 11px;">
                  ${directLoginUrl}
                </a>
              </div>

              <!-- Feature Highlights / Guidelines -->
              <div style="margin-top: 26px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 700;">
                  What you can do in your portal:
                </h4>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; color: #334155; line-height: 1.6;">
                  <tr>
                    <td style="padding: 4px 0;">🎯 <strong>Faculty Mentorship:</strong> View assigned faculty mentor contact details & schedule 1-on-1 counseling.</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0;">🎫 <strong>Raise Issues:</strong> Submit confidential academic, infrastructure, or attendance tickets (up to 2 active per week).</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0;">🔒 <strong>Privacy:</strong> Your issues are only visible to your assigned mentor and designated college officers.</td>
                  </tr>
                </table>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0 0 4px; font-weight: 600; color: #334155;">
                NITTE Mentorship & Academic Support Administration
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                This automated credential notification was sent by NITTE System Administration via ${GMAIL_ADDRESS}.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      await sendGmailNotification({
        to: email,
        replyTo: GMAIL_ADDRESS,
        fromName: 'NITTE Admin Desk',
        subject: `[NITTE PORTAL CREDENTIALS] Welcome ${name} - Student Onboarding (${studentId})`,
        html: emailHtml,
        text: `Welcome ${name}! Your student account has been created. Student ID: ${studentId}, Email: ${email}, Password: ${generatedPassword}. Log in directly at: ${directLoginUrl}`,
        eventType: 'BULK_STUDENT_ONBOARDING'
      });

      await logSystemEvent(`Bulk Upload: Registered student ${name} (${studentId}) with generated password and dispatched Gmail credentials to ${email}`, 'Admin', 'ADMIN');

      results.push({
        status: 'SUCCESS',
        index: i + 1,
        id: studentId,
        name,
        email,
        branch,
        sem,
        password: generatedPassword,
        emailStatus: 'DELIVERED_GMAIL'
      });
      successCount++;
    } catch (err) {
      console.error(`[Bulk Upload Error] Failed for student ${studentId}:`, err);
      results.push({
        status: 'FAILED',
        index: i + 1,
        id: studentId,
        name,
        email,
        reason: err.message || 'Database insertion error'
      });
      failureCount++;
    }
  }

  res.json({
    success: true,
    totalProcessed: students.length,
    successCount,
    failureCount,
    results
  });
});

// ADMIN SINGLE STUDENT REMOVAL ENDPOINT
app.post('/api/admin/delete-student', async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'Student ID is required.' });
    await query('DELETE FROM students WHERE id = $1', [studentId]);
    res.json({ success: true, studentId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN BULK STUDENT REMOVAL (CLEAR ALL STUDENTS)
app.post('/api/admin/delete-all-students', async (req, res) => {
  try {
    await query('DELETE FROM students');
    await logSystemEvent('Admin removed all students from database.', 'Admin', 'ADMIN');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN SINGLE FACULTY MENTOR REMOVAL ENDPOINT
app.post('/api/admin/delete-mentor', async (req, res) => {
  try {
    const { mentorId } = req.body;
    if (!mentorId) return res.status(400).json({ error: 'Mentor ID is required.' });
    await query('UPDATE students SET mentor_id = NULL WHERE mentor_id = $1', [mentorId]);
    await query('DELETE FROM mentors WHERE id = $1', [mentorId]);
    await logSystemEvent(`Admin removed faculty mentor ${mentorId}. Mentees unassigned.`, 'Admin', 'ADMIN');
    res.json({ success: true, mentorId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN BULK FACULTY MENTOR REMOVAL (CLEAR ALL MENTORS)
app.post('/api/admin/delete-all-mentors', async (req, res) => {
  try {
    await query('UPDATE students SET mentor_id = NULL');
    await query('DELETE FROM mentors');
    await logSystemEvent('Admin removed all faculty mentors. All mentees unassigned.', 'Admin', 'ADMIN');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMIN BULK FACULTY MENTORS ROSTER UPLOAD & AUTOMATED GMAIL CREDENTIAL DISPATCH
app.post('/api/admin/bulk-upload-mentors', async (req, res) => {
  const { mentors } = req.body;
  if (!Array.isArray(mentors) || mentors.length === 0) {
    return res.status(400).json({ error: 'Payload must contain a non-empty "mentors" array.' });
  }

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < mentors.length; i++) {
    const m = mentors[i];
    const rawId = m.id || m.mentorId || m['Mentor ID'] || m['FAC ID'] || m['Faculty ID'] || m['Employee ID'] || m['Mentor Id'];
    const rawName = m.name || m.mentorName || m['Faculty Name'] || m['Mentor Name'] || m['Name'] || m['Full Name'];
    const rawEmail = m.email || m.mentorEmail || m['Faculty Email'] || m['Mentor Email'] || m['Email'] || m['Gmail'] || m['Email Address'];
    const dept = m.dept || m.Dept || m['Department'] || m['Dept'] || m['Branch'] || 'CSE';
    const assignedClass = m.class || m['Class'] || m['Assigned Class'] || m['Section'] || m['Class & Section'] || 'General Faculty Mentorship';

    if (!rawId || !rawName || !rawEmail) {
      results.push({
        status: 'FAILED',
        index: i + 1,
        id: rawId || 'N/A',
        name: rawName || 'N/A',
        email: rawEmail || 'N/A',
        reason: 'Missing required Mentor ID, Faculty Name, or Email.'
      });
      failureCount++;
      continue;
    }

    const mentorId = String(rawId).trim().toUpperCase();
    const name = String(rawName).trim();
    const email = String(rawEmail).trim().toLowerCase();
    const rawPassword = m.password || m['Initial Password'] || m['initial password'] || m['Password'] || m['password'] || m.pwd;
    const generatedPassword = rawPassword && String(rawPassword).trim() ? String(rawPassword).trim() : generateComputerPassword();

    try {
      // Upsert into PostgreSQL mentors table
      validatePassword(generatedPassword);
      await query(
        `INSERT INTO mentors (id, name, email, dept, class, password)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           dept = EXCLUDED.dept,
           class = EXCLUDED.class,
           password = EXCLUDED.password`,
        [mentorId, name, email, dept, assignedClass, await hashPassword(generatedPassword)]
      );
      await query('DELETE FROM auth_sessions WHERE user_id = $1 AND user_role = $2', [mentorId, 'Mentor']);

      const portalBaseUrl = process.env.APP_URL || (req.headers.host ? `http://${req.headers.host}` : 'http://localhost:5173');
      const directLoginUrl = `${portalBaseUrl.replace(/\/$/, '')}/?role=Mentor&id=${encodeURIComponent(mentorId)}`;

      // Send automated onboarding credential email via Gmail SMTP with identical institutional theme
      const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NITTE Faculty Mentor Account Credentials</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
          
          <!-- Modern Gradient Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #091e42 0%, #1e3a8a 52%, #059669 100%); padding: 36px 32px 28px; text-align: center; color: #ffffff;">
              <div style="display: inline-block; background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 30px; padding: 5px 16px; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase; color: #a7f3d0; margin-bottom: 14px;">
                🏛️ NITTE (DEEMED TO BE UNIVERSITY)
              </div>
              <h1 style="margin: 0; font-size: 23px; font-weight: 800; letter-spacing: -0.3px; color: #ffffff; line-height: 1.3;">
                Faculty Mentorship Portal
              </h1>
              <p style="margin: 8px 0 0 0; font-size: 13px; color: #93c5fd; font-weight: 400;">
                Official Faculty Appointment & Direct Access Credentials
              </p>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding: 32px 32px 24px;">
              <p style="margin: 0 0 14px; font-size: 16px; color: #0f172a; line-height: 1.5;">
                Dear Prof. / Dr. <strong style="color: #1e3a8a;">${name}</strong>,
              </p>
              <p style="margin: 0 0 18px; font-size: 14px; color: #475569; line-height: 1.6;">
                Welcome to the NITTE Faculty Mentorship Network! Your official faculty advisor account has been provisioned and verified by Institutional Administration. You are now designated as an official mentor on the <strong>NITTE Student Mentorship & Grievance Escalation Portal</strong>.
              </p>

              <!-- Faculty Profile Snapshot Tag -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 22px;">
                <tr>
                  <td style="padding: 12px 18px; font-size: 13px; color: #334155;">
                    <span style="display: inline-block; margin-right: 18px;"><strong>📚 Department:</strong> ${dept}</span>
                    <span style="display: inline-block; margin-right: 18px;"><strong>👥 Mentorship Class:</strong> ${assignedClass || 'General Batch'}</span>
                    <span style="display: inline-block; margin-right: 18px;"><strong>🛡️ Role:</strong> Faculty Mentor</span>
                    <span style="display: inline-block;"><strong>👥 Capacity:</strong> Up to 30 Mentees</span>
                  </td>
                </tr>
              </table>

              <!-- Modern Credentials Box -->
              <div style="background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%); border: 1px solid #cbd5e1; border-top: 4px solid #059669; border-radius: 12px; padding: 20px; margin-bottom: 26px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px;">
                  <h3 style="margin: 0; font-size: 15px; font-weight: 700; color: #065f46;">
                    🔐 Official Faculty Login Credentials
                  </h3>
                  <span style="font-size: 11px; background: #ecfdf5; color: #059669; padding: 3px 8px; border-radius: 20px; font-weight: 700; border: 1px solid #a7f3d0;">
                    ✓ Active
                  </span>
                </div>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; color: #1e293b; line-height: 1.8;">
                  <tr>
                    <td width="38%" style="color: #64748b; font-weight: 600; padding: 5px 0;">Faculty / Mentor ID:</td>
                    <td style="padding: 5px 0;">
                      <code style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 14px; font-weight: 700; background: #ecfdf5; color: #047857; padding: 3px 8px; border-radius: 6px; border: 1px solid #a7f3d0;">
                        ${mentorId}
                      </code>
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0;">Official Email:</td>
                    <td style="padding: 5px 0;">
                      <code style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 13px; color: #334155; background: #f1f5f9; padding: 3px 8px; border-radius: 6px;">
                        ${email}
                      </code>
                    </td>
                  </tr>
                  <tr>
                    <td style="color: #64748b; font-weight: 600; padding: 5px 0;">Generated Password:</td>
                    <td style="padding: 5px 0;">
                      <code style="font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 15px; font-weight: 800; background: #fef2f2; color: #dc2626; padding: 4px 10px; border-radius: 6px; border: 1px solid #fecaca; letter-spacing: 0.5px;">
                        ${generatedPassword}
                      </code>
                    </td>
                  </tr>
                </table>
              </div>

              <!-- Direct 1-Click Login Button Section -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0 16px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #059669 0%, #047857 100%); box-shadow: 0 4px 16px rgba(5, 150, 105, 0.35);">
                          <a href="${directLoginUrl}" target="_blank" style="display: inline-block; padding: 14px 34px; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 10px; letter-spacing: 0.2px;">
                            👉 Open Faculty Mentor Portal
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 10px 0 0 0; font-size: 12px; color: #64748b; text-align: center;">
                      ⚡ Pre-fills your Faculty ID on the login page. Simply click "Sign In to Faculty Mentor Portal" to enter.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Fallback Direct URL Box -->
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 12px; margin-top: 18px; font-size: 12px; color: #475569;">
                <p style="margin: 0 0 6px; font-weight: 600; color: #334155;">Direct Login Link (if button does not open):</p>
                <a href="${directLoginUrl}" target="_blank" style="color: #059669; text-decoration: underline; word-break: break-all; font-family: monospace; font-size: 11px;">
                  ${directLoginUrl}
                </a>
              </div>

              <!-- Feature Highlights / Guidelines -->
              <div style="margin-top: 26px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                <h4 style="margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; font-weight: 700;">
                  What you can do in your Faculty Portal:
                </h4>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-size: 13px; color: #334155; line-height: 1.6;">
                  <tr>
                    <td style="padding: 4px 0;">👥 <strong>Mentee Management:</strong> Review all assigned undergraduate / postgraduate students and monitor attendance or performance.</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0;">🗓️ <strong>Counseling Sessions:</strong> Schedule and conduct 1-on-1 or group advisory meetings with integrated digital notes.</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0;">🎫 <strong>Student Concerns & Tickets:</strong> Review issues filed by your mentees, provide initial guidance, or escalate unresolved matters to Relationship Officers (RO).</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0;">📑 <strong>Session Reports:</strong> Record session attendance and interaction notes.</td>
                  </tr>
                </table>
              </div>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 12px; color: #64748b; line-height: 1.5;">
              <p style="margin: 0 0 4px; font-weight: 600; color: #334155;">
                NITTE Mentorship & Academic Support Administration
              </p>
              <p style="margin: 0 0 4px; font-size: 11px; color: #64748b;">
                Nitte (Deemed to be University), Deralakatte, Mangaluru, Karnataka 575018
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                This automated credential notification was sent by NITTE System Administration via ${GMAIL_ADDRESS}.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

      const emailText = `NITTE (Deemed to be University) - Faculty Mentorship Portal
Official Faculty Account Activation & Credentials

Dear Prof. / Dr. ${name},

Welcome to the NITTE Faculty Mentorship Network! Your official faculty advisor account has been provisioned and verified by Institutional Administration.

Faculty Details:
- Department: ${dept}
- Mentorship Class / Batch: ${assignedClass || 'General Batch'}
- Role: Faculty Mentor (Advisor)
- Capacity: Up to 30 Mentees

Your Login Credentials:
- Faculty / Mentor ID: ${mentorId}
- Registered Email: ${email}
- Password: ${generatedPassword}

👉 Click the direct link below to open the faculty portal (pre-fills your credentials):
${directLoginUrl}

⚡ Note: The link will pre-fill your Faculty ID. Simply click "Sign In to Faculty Mentor Portal" to enter your dashboard.

Portal: ${portalBaseUrl}
NITTE Mentorship & Academic Support Desk
Nitte (Deemed to be University), Deralakatte, Mangaluru, Karnataka 575018`;

      await sendGmailNotification({
        to: email,
        replyTo: GMAIL_ADDRESS,
        fromName: 'NITTE Admin Desk',
        subject: `[NITTE FACULTY CREDENTIALS] Welcome Prof. ${name} - Faculty Mentor Portal (${mentorId})`,
        html: emailHtml,
        text: emailText,
        eventType: 'BULK_MENTOR_ONBOARDING'
      });

      await logSystemEvent(`Bulk Upload: Registered faculty mentor ${name} (${mentorId}, ${dept}) with generated password and dispatched Gmail credentials to ${email}`, 'Admin', 'ADMIN');

      results.push({
        status: 'SUCCESS',
        index: i + 1,
        id: mentorId,
        name,
        email,
        dept,
        class: assignedClass,
        password: generatedPassword,
        emailStatus: 'DELIVERED_GMAIL'
      });
      successCount++;
    } catch (err) {
      console.error(`[Bulk Upload Error] Failed for mentor ${mentorId}:`, err);
      results.push({
        status: 'FAILED',
        index: i + 1,
        id: mentorId,
        name,
        email,
        reason: err.message || 'Database insertion error'
      });
      failureCount++;
    }
  }

  res.json({
    success: true,
    totalProcessed: mentors.length,
    successCount,
    failureCount,
    results
  });
});

// ADMIN BULK RELATIONSHIP OFFICERS (ROS) ROSTER UPLOAD & AUTOMATED GMAIL CREDENTIAL DISPATCH
app.post('/api/admin/bulk-upload-ros', async (req, res) => {
  const { ros } = req.body;
  if (!Array.isArray(ros) || ros.length === 0) {
    return res.status(400).json({ error: 'Payload must contain a non-empty "ros" array.' });
  }

  const results = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < ros.length; i++) {
    const r = ros[i];
    let parsed;
    try { parsed = normalizeRoRosterRow(r); }
    catch (error) {
      results.push({ status: 'FAILED', index: i + 1, reason: error.message });
      failureCount++;
      continue;
    }
    const { id: roId, name, email, region } = parsed;
    const generatedPassword = parsed.password || generateComputerPassword();

    try {
      const assigned = await query('SELECT id FROM ros WHERE LOWER(TRIM(region)) = LOWER(TRIM($1)) AND UPPER(id) <> UPPER($2)', [region, roId]);
      if (assigned.rowCount) throw new Error('This issue category is already assigned to another RO.');
      // Upsert into PostgreSQL ros table
      validatePassword(generatedPassword);
      await query(
        `INSERT INTO ros (id, name, email, region, password)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           region = EXCLUDED.region,
           password = EXCLUDED.password`,
        [roId, name, email, region, await hashPassword(generatedPassword)]
      );
      await query('DELETE FROM auth_sessions WHERE user_id = $1 AND user_role = $2', [roId, 'RO']);

      // Send automated onboarding credential email via Gmail SMTP
      const emailHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background: linear-gradient(135deg, #065f46 0%, #0f172a 100%); padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 1.4rem; font-weight: 700; letter-spacing: 0.5px;">NITTE Student Mentorship & Support System</h1>
            <p style="margin: 6px 0 0 0; font-size: 0.9rem; color: #6ee7b7;">Relationship Officer (RO) Account Onboarding</p>
          </div>
          <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
            <p style="font-size: 1rem; margin-top: 0;">Dear Officer <strong>${name}</strong>,</p>
            <p>Welcome! Your official Relationship Officer account has been registered on the NITTE Mentorship & Escalation Portal to oversee dedicated category resolutions.</p>
            
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #059669; padding: 18px; border-radius: 6px; margin: 20px 0;">
              <h3 style="margin: 0 0 12px 0; color: #065f46; font-size: 1rem;">🔐 Your RO Login Credentials:</h3>
              <p style="margin: 6px 0; font-size: 0.95rem;"><strong>Portal URL:</strong> <a href="http://localhost:5173" style="color: #059669; font-weight: 600; text-decoration: underline;">http://localhost:5173</a></p>
              <p style="margin: 6px 0; font-size: 0.95rem;"><strong>Officer ID / Code:</strong> <code style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${roId}</code></p>
              <p style="margin: 6px 0; font-size: 0.95rem;"><strong>Assigned Issue Category:</strong> <code style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px;">${region}</code></p>
              <p style="margin: 6px 0; font-size: 0.95rem;"><strong>Official Gmail:</strong> <code style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px;">${email}</code></p>
              <p style="margin: 6px 0; font-size: 0.95rem;"><strong>Generated Password:</strong> <code style="background: #fee2e2; color: #991b1b; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 1.05rem;">${generatedPassword}</code></p>
            </div>

            <p style="font-size: 0.9rem; color: #475569;">You can log in to the portal as <strong>Relationship Officer (RO)</strong> using your Officer ID or Official Gmail along with the password above to manage escalated student tickets and online WebRTC hearings.</p>
            
            <div style="text-align: center; margin-top: 24px;">
              <a href="http://localhost:5173" style="display: inline-block; background: #059669; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-weight: 600; font-size: 0.95rem;">Log In to RO Portal</a>
            </div>
          </div>
          <div style="background-color: #f1f5f9; padding: 14px 24px; text-align: center; font-size: 0.78rem; color: #64748b; border-top: 1px solid #e2e8f0;">
            This automated credential notification was dispatched by NITTE System Administration via ${GMAIL_ADDRESS}.
          </div>
        </div>
      `;

      let emailStatus = 'NOT_SENT_TEST_ADDRESS';
      if (!email.endsWith('.invalid')) {
      try {
      await sendGmailNotification({
        to: email,
        replyTo: GMAIL_ADDRESS,
        fromName: 'NITTE Admin Desk',
        subject: `[NITTE RELATIONSHIP OFFICER CREDENTIALS] Welcome ${name} - RO Account Onboarding (${roId})`,
        html: emailHtml,
        text: `Welcome ${name}! Your Relationship Officer account has been registered. RO ID: ${roId}, Assigned Issue Category: ${region}, Email: ${email}, Password: ${generatedPassword}. Log in at http://localhost:5173`,
        eventType: 'BULK_RO_ONBOARDING'
      });
      emailStatus = 'DELIVERED_GMAIL';
      } catch { emailStatus = 'FAILED'; }
      }

      await logSystemEvent(`Bulk Upload: Registered relationship officer ${name} (${roId}, ${region}); credential email status: ${emailStatus}.`, 'Admin', 'ADMIN');

      results.push({
        status: 'SUCCESS',
        index: i + 1,
        id: roId,
        name,
        email,
        region,
        password: generatedPassword,
        emailStatus
      });
      successCount++;
    } catch (err) {
      console.error(`[Bulk Upload Error] Failed for RO ${roId}:`, err);
      results.push({
        status: 'FAILED',
        index: i + 1,
        id: roId,
        name,
        email,
        reason: err.message || 'Database insertion error'
      });
      failureCount++;
    }
  }

  res.json({
    success: true,
    totalProcessed: ros.length,
    successCount,
    failureCount,
    results
  });
});



const issueActivity = createIssueActivityStore({
  query, getMemoryIssues: () => inMemoryIssues,
  readCloudIssue: async issueId => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/issues?id=ilike.${encodeURIComponent(issueId)}&select=id,logs,status&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });
    if (!response.ok) throw new Error('Ticket activity lookup unavailable');
    const rows = await response.json();
    return Array.isArray(rows) ? rows[0] : null;
  },
  writeCloudIssue: async (issueId, update) => {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/issues?id=ilike.${encodeURIComponent(issueId)}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(update)
    });
    if (!response.ok) throw new Error('Could not save ticket activity');
  }
});

app.use('/api/recordings', createRecordingsRouter({
  repository: createRecordingRepository(query), auth: recordingAuth,
  onSaved: row => issueActivity.append(row.issue_id, {
    id: `recording:${row.id}`, eventType: 'MEETING_RECORDING_SAVED', actor: row.ro_id,
    text: `Meeting recording saved to the database (${row.duration_seconds} seconds).`,
    time: new Date(row.recorded_at).toISOString()
  })
}));

app.get('/api/issues/:id/activity', async (req, res) => {
  try {
    const history = await issueActivity.read(req.params.id);
    if (!history) return res.status(404).json({ error: 'Issue not found' });
    const emailLogs = await getEmailLogs({ issueId: history.issueId });
    res.json({ ...history, emailLogs });
  } catch (error) {
    res.status(503).json({ error: 'Ticket activity is temporarily unavailable' });
  }
});

const readStudentQuota = createIssueQuotaReader({
  query, isDbConnected,
  getMemoryIssues: () => inMemoryIssues,
  fetchCloudIssues: async studentId => {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/issues?student_id=eq.${encodeURIComponent(studentId)}&select=id,student_id,created_at,status`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    if (!response.ok) throw new Error('Cloud quota lookup unavailable');
    return response.json();
  }
});
const acquireStudentSubmission = createStudentSubmissionLock();

// Both quota display and submission enforce the same two-slot, seven-day policy.
app.get('/api/students/:id/issue-limit', async (req, res) => {
  try {
    res.json(await readStudentQuota(req.params.id));
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// 2. SUBMIT AN ISSUE (Two submissions per rolling seven-day period)
app.post('/api/issues', async (req, res) => {
  const { studentId, category, description, priority, studentName } = req.body;
  if (!studentId || !category || !description || !priority) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const releaseSubmission = await acquireStudentSubmission(studentId);
  try {
    const quota = await readStudentQuota(studentId);
    if (quota.isLocked) {
      return res.status(429).json({ code: 'GRIEVANCE_QUOTA_LOCKED', error: getQuotaLockMessage(quota), quota });
    }

    const assigned = await query('SELECT id FROM ros WHERE LOWER(TRIM(region)) = LOWER(TRIM($1)) ORDER BY id', [category]);
    if (assigned.rows.length !== 1) return res.status(400).json({ error: 'This issue category must have exactly one imported Relationship Officer.' });
    const calculatedRoId = assigned.rows[0].id;

    const initialStatus = 'Assigned to RO';
    const logText = `Issue submitted by ${studentName} and assigned to ${calculatedRoId}.`;

    // IDs are generated by the server so another ticket cannot be overwritten.
    const issueId = `ISS-${randomUUID()}`;
    const timestamp = new Date().toISOString();
    const initialLogs = JSON.stringify([{ text: logText, time: timestamp }]);

      await query(
        `INSERT INTO issues (id, student_id, student_name, category, description, priority, status, ro_id, created_at, logs)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
`,
        [issueId, studentId, studentName, category, description, priority, initialStatus, calculatedRoId, timestamp, initialLogs]
      );

    await logSystemEvent(`Student ${studentName} submitted issue: ${category} (${initialStatus})`, 'Student', studentId);

    // 1. Dispatch email to RO Officer (skandhayashu2906@gmail.com) in background
    sendGmailNotification({
      to: 'skandhayashu2906@gmail.com',
      replyTo: 'skandhayashas2906@gmail.com',
      fromName: `NITTE Portal (${studentName})`,
      subject: `[RO ACTION REQUIRED - ${calculatedRoId}] New Issue: ${category} (${issueId})`,
      html: `<h3>New Student Issue Registered for RO Office</h3>
             <p>Hello RO Officer (<strong>${calculatedRoId}</strong>),</p>
             <p>Student <strong>${studentName}</strong> (from skandhayashas2906@gmail.com) has submitted an issue:</p>
             <ul>
               <li><strong>Ticket ID:</strong> ${issueId}</li>
               <li><strong>Category:</strong> ${category}</li>
               <li><strong>Priority:</strong> ${priority}</li>
               <li><strong>Status:</strong> ${initialStatus}</li>
               <li><strong>Student Name:</strong> ${studentName} (${studentId})</li>
               <li><strong>Description:</strong> ${description}</li>
             </ul>
             <p>Please log into your RO Dashboard to review and take action.</p>
             <hr/>
             <p><em>Dispatched to RO Office email: skandhayashu2906@gmail.com</em></p>`,
      issueId,
      eventType: 'ISSUE_SUBMITTED_TO_RO',
      recipientName: 'RO Officer'
    }).catch(err => console.error('[Gmail SMTP] RO email error:', err));

    // 2. Dispatch confirmation to Student (skandhayashas2906@gmail.com) in background
    sendGmailNotification({
      to: 'skandhayashas2906@gmail.com',
      replyTo: 'skandhayashu2906@gmail.com',
      fromName: 'NITTE Mentorship Support',
      subject: `[TICKET CONFIRMATION - ${issueId}] Issue Submitted: ${category}`,
      html: `<h3>NITTE Student Support Ticket Registered</h3>
             <p>Dear <strong>${studentName}</strong>,</p>
             <p>Your issue has been successfully submitted and forwarded to RO Officer <strong>${calculatedRoId}</strong>.</p>
             <ul>
               <li><strong>Ticket ID:</strong> ${issueId}</li>
               <li><strong>Category:</strong> ${category}</li>
               <li><strong>Priority:</strong> ${priority}</li>
               <li><strong>Status:</strong> ${initialStatus}</li>
             </ul>
             <hr/>
             <p><em>Dispatched to Student email: skandhayashas2906@gmail.com</em></p>`,
      issueId,
      eventType: 'ISSUE_SUBMITTED_STUDENT_CONFIRM',
      recipientName: studentName
    }).catch(err => console.error('[Gmail SMTP] Student email error:', err));

    res.status(201).json({ id: issueId, status: initialStatus, createdAt: timestamp });
  } catch (err) {
    console.error('Error submitting issue:', err);
    res.status(503).json({ error: err.message || 'Failed to submit issue' });
  } finally {
    releaseSubmission();
  }
});

// 3. SCHEDULE / RESCHEDULE A MEETING (RO ASSIGNED)
app.post('/api/meetings', async (req, res) => {
  const { id: requestedMeetingId, scheduleEventId, isReschedule: requestedReschedule, issueId, studentId, studentName, roId, date, time, mode, location, notes, discussionSummary, actionItems, reassignFeedback } = req.body;
  
  // Resolve valid studentId from parameter or fallback to issues table
  let validStudentId = studentId;
  if (!validStudentId && issueId) {
    try {
      const issueCheck = await query(`SELECT student_id FROM issues WHERE UPPER(id) = UPPER($1)`, [issueId]);
      if (issueCheck.rowCount > 0 && issueCheck.rows[0].student_id) {
        validStudentId = issueCheck.rows[0].student_id;
      }
    } catch (e) {
      console.warn('Could not query issue for student_id:', e.message);
    }
  }

  if (!issueId || !validStudentId || !roId || !date || !time) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const timestamp = new Date().toISOString();
  const meetLoc = location || (mode === 'Online' ? 'Google Meet / Zoom Online Video Link' : 'RO Office Desk 1 (Admin Block)');
  const cleanSummary = (discussionSummary || '').trim();
  const cleanFeedback = (reassignFeedback || '').trim();
  let finalNotes = notes || '';
  if (cleanFeedback && !finalNotes.includes(cleanFeedback)) {
    finalNotes = finalNotes ? `${finalNotes} | [Feedback / Switch Reason]: ${cleanFeedback}` : `[Feedback / Switch Reason]: ${cleanFeedback}`;
  } else if (cleanSummary && !finalNotes.includes(cleanSummary)) {
    finalNotes = finalNotes ? `${finalNotes} | Discussions: ${cleanSummary}` : `Discussions: ${cleanSummary}`;
  }

  const existingMemMeet = inMemoryMeetings.find(m => m.issueId && String(m.issueId).toUpperCase() === String(issueId).toUpperCase());
  // Keep the client, Postgres, and cloud copies on the same meeting ID.
  const meetId = requestedMeetingId || existingMemMeet?.id || `MEET-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
  let isReschedule = Boolean(existingMemMeet || requestedReschedule);

  try {
    try {
      // Ensure student_id exists in database or fallback to issue's student_id
      const studentCheck = await query(`SELECT id FROM students WHERE UPPER(id) = UPPER($1)`, [validStudentId]);
      if (studentCheck.rowCount === 0) {
        const issueCheck = await query(`SELECT student_id FROM issues WHERE UPPER(id) = UPPER($1)`, [issueId]);
        if (issueCheck.rowCount > 0 && issueCheck.rows[0].student_id) {
          validStudentId = issueCheck.rows[0].student_id;
        }
      }

      // Check if meeting already exists for this issue or if meeting was previously scheduled
      const existingMeet = await query(`SELECT id FROM meetings WHERE UPPER(issue_id) = UPPER($1)`, [issueId]);
      if (existingMeet.rowCount > 0 && !isReschedule) {
        isReschedule = true;
      }
      const issueStatusCheck = await query(`SELECT status, logs FROM issues WHERE UPPER(id) = UPPER($1)`, [issueId]);

      if (isReschedule || (existingMeet && existingMeet.rowCount > 0)) {
        // Delete any previous meeting rows for this issue to ensure no stale 'Started' status remains
        await query(`DELETE FROM meetings WHERE UPPER(issue_id) = UPPER($1)`, [issueId]);
        await query(
          `INSERT INTO meetings (id, issue_id, student_id, student_name, ro_id, date, time, mode, location, notes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Confirmed')`,
          [meetId, issueId, validStudentId, studentName, roId, date, time, mode || 'Offline', meetLoc, finalNotes]
        );
      } else {
        await query(
          `INSERT INTO meetings (id, issue_id, student_id, student_name, ro_id, date, time, mode, location, notes, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Confirmed')`,
          [meetId, issueId, validStudentId, studentName, roId, date, time, mode || 'Offline', meetLoc, finalNotes]
        );
      }

    } catch (pgErr) {
      console.warn('[Server] Direct PG meeting insert notice (using Supabase & in-memory):', pgErr.message);
    }

    const eventId = /^schedule:[a-f0-9-]{36}$/i.test(String(scheduleEventId || '')) ? scheduleEventId : `schedule:${randomUUID()}`;
    await issueActivity.append(issueId, createMeetingScheduleEvent({
      id: eventId, timestamp, isReschedule, meetingId: meetId, date, time,
      mode: mode || 'Offline', location: meetLoc, roId, feedback: cleanFeedback, discussionMinutes: cleanSummary
    }), 'Meeting Scheduled');
    await logSystemEvent(`RO ${roId} ${isReschedule ? 'rescheduled' : 'scheduled'} a meeting with Student ${studentName} for ${date} at ${time}`, 'RO', roId);

    // Dynamically resolve student email from database
    let resolvedStudentEmail = 'skandhayashas2906@gmail.com';
    try {
      const studentEmailQuery = await query(`SELECT email FROM students WHERE UPPER(id) = UPPER($1)`, [validStudentId]);
      if (studentEmailQuery.rowCount > 0 && studentEmailQuery.rows[0].email) {
        resolvedStudentEmail = studentEmailQuery.rows[0].email.trim();
      }
    } catch (e) { }

    const targetRecipients = Array.from(new Set([resolvedStudentEmail, 'skandhayashas2906@gmail.com'])).filter(Boolean).join(', ');

    // Dispatch Gmail notification via skandhayashu2906@gmail.com
    await sendGmailNotification({
      to: targetRecipients,
      replyTo: 'skandhayashu2906@gmail.com',
      fromName: `RO Officer (${roId})`,
      subject: `[MEETING ${isReschedule ? 'RESCHEDULED' : 'CONFIRMATION'} - ${issueId}] ${date} at ${time}`,
      html: `<h3>Meeting ${isReschedule ? 'Rescheduled' : 'Confirmation'} Notice</h3>
             <p>Dear <strong>${studentName}</strong>,</p>
             <p>Relationship Officer <strong>${roId}</strong> (skandhayashu2906@gmail.com) has ${isReschedule ? 'rescheduled' : 'scheduled'} your meeting regarding Ticket <strong>${issueId}</strong>.</p>
             <ul>
               <li><strong>Date:</strong> ${date}</li>
               <li><strong>Time:</strong> ${time}</li>
               <li><strong>Mode:</strong> ${mode || 'Offline'}</li>
               <li><strong>Location:</strong> ${meetLoc}</li>
               <li><strong>Notes:</strong> ${notes || 'None'}</li>
               ${cleanFeedback ? `<li><strong>Feedback / Switch Reason:</strong> ${cleanFeedback}</li>` : (cleanSummary ? `<li><strong>Logged Minutes / Agenda:</strong> ${cleanSummary}</li>` : '')}
             </ul>
             <hr/>
             <p><em>Dispatched via Gmail System: ${GMAIL_ADDRESS}</em></p>`,
      issueId,
      eventType: isReschedule ? 'MEETING_RESCHEDULED' : 'MEETING_SCHEDULED',
      recipientName: studentName
    });

    const memoryMeeting = {
      id: meetId,
      issueId,
      studentId: validStudentId,
      studentName,
      roId,
      date,
      time,
      mode: mode || 'Offline',
      location: meetLoc,
      notes: finalNotes,
      status: 'Confirmed'
    };
    const mIdx = inMemoryMeetings.findIndex(m => m.id === meetId || (m.issueId && m.issueId.toUpperCase() === issueId.toUpperCase()));
    if (mIdx >= 0) inMemoryMeetings[mIdx] = memoryMeeting;
    else inMemoryMeetings.unshift(memoryMeeting);

    // Direct Supabase Cloud REST upsert
    try {
      const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' };
      fetch(`${SUPABASE_URL}/rest/v1/meetings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: meetId,
          issue_id: issueId,
          student_id: validStudentId,
          student_name: studentName,
          ro_id: roId,
          date,
          time,
          mode: mode || 'Offline',
          location: meetLoc,
          notes: finalNotes,
          status: 'Confirmed'
        })
      }).catch(e => console.warn('[Server] Supabase meeting insert warning:', e.message));
    } catch (e) {}

    res.status(201).json({ id: meetId, isReschedule });
  } catch (err) {
    console.error('Error scheduling meeting:', err);
    res.status(500).json({ error: 'Failed to schedule meeting' });
  }
});

// 4. UPDATE MEETING STATUS & DISCUSSION MINUTES (Confirm/Cancel/Notes)
app.put('/api/meetings/:id', async (req, res) => {
  const meetId = req.params.id;
  const { status, notes, discussionSummary, actionItems, outcome, followUpNeeded } = req.body;

  try {
    const combinedNotes = notes || (discussionSummary ? `Discussions: ${discussionSummary}${actionItems ? ` | Action Items: ${actionItems}` : ''}` : null);
    
    // 1. Update in-memory meetings store
    const targetKey = String(meetId).toUpperCase();
    let memMeet = inMemoryMeetings.find(m =>
      (m.id && String(m.id).toUpperCase() === targetKey) ||
      (m.issueId && String(m.issueId).toUpperCase() === targetKey)
    );
    // After a restart the meeting may exist only in persistent storage.
    // Resolve it before caching an update; a meeting ID is not an issue ID.
    if (!memMeet) {
      let storedMeeting;
      try {
        const result = await query(
          `SELECT id, issue_id AS "issueId", student_id AS "studentId", student_name AS "studentName", ro_id AS "roId", date, time, mode, location, notes, status FROM meetings WHERE UPPER(id) = UPPER($1) OR UPPER(issue_id) = UPPER($1) LIMIT 1`,
          [meetId]
        );
        storedMeeting = result.rows[0];
      } catch (e) {
        console.warn('[Server] Meeting lookup notice:', e.message);
      }
      if (!storedMeeting) {
        const lookupId = encodeURIComponent(meetId);
        const response = await fetch(`${SUPABASE_URL}/rest/v1/meetings?or=(id.eq.${lookupId},issue_id.eq.${lookupId})&limit=1`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
        });
        const rows = response.ok ? await response.json() : [];
        if (Array.isArray(rows) && rows[0]) {
          const row = rows[0];
          storedMeeting = { ...row, issueId: row.issue_id, studentId: row.student_id, studentName: row.student_name, roId: row.ro_id };
        }
      }
      if (!storedMeeting) return res.status(404).json({ error: 'Meeting not found. Please schedule the meeting before starting it.' });
      memMeet = storedMeeting;
      inMemoryMeetings.unshift(memMeet);
    }
    const previousStatus = memMeet.status;
    if (memMeet) {
      if (status) memMeet.status = status;
      if (combinedNotes) memMeet.notes = combinedNotes;
      if (discussionSummary?.trim()) {
        memMeet.discussionSummary = discussionSummary.trim();
        memMeet.actionItems = actionItems || '';
        memMeet.feedbackSubmittedAt = new Date().toISOString();
      }
      if (status === 'Started') {
        memMeet.startedAt = new Date().toISOString();
        memMeet.endedAt = null;
        memMeet.endedByRo = false;
      }
      if (status === 'Completed' || status === 'Finished') memMeet.endedAt = new Date().toISOString();
    }

    // 2. If Started, also ensure matching issue in inMemoryIssues is set to 'Meeting Started'
    if (status === 'Started') {
      const targetIssueId = (memMeet && memMeet.issueId) || meetId;
      const memIss = inMemoryIssues.find(i => (i.id || '').toUpperCase() === String(targetIssueId).toUpperCase());
      if (memIss) {
        memIss.status = 'Meeting Started';
      }
    }

    // 3. Update Supabase Cloud REST
    try {
      const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };
      fetch(`${SUPABASE_URL}/rest/v1/meetings?or=(id.eq.${meetId},issue_id.eq.${meetId})`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          status: status || 'Completed',
          ...(combinedNotes ? { notes: combinedNotes } : {})
        })
      }).catch(e => console.warn('[Server] Supabase meeting patch warning:', e.message));

      if (status === 'Started') {
        const targetIssueId = (memMeet && memMeet.issueId) || meetId;
        fetch(`${SUPABASE_URL}/rest/v1/issues?id=eq.${targetIssueId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'Meeting Started' })
        }).catch(e => console.warn('[Server] Supabase issue status patch warning:', e.message));
      }
    } catch (e) {}

    // 4. Update Postgres pool if connected
    try {
      if (combinedNotes) {
        await query(
          `UPDATE meetings SET status = COALESCE($1, status), notes = $2 WHERE id = $3 OR UPPER(issue_id) = UPPER($3)`,
          [status || 'Completed', combinedNotes, meetId]
        );
      } else {
        await query(`UPDATE meetings SET status = $1 WHERE id = $2 OR UPPER(issue_id) = UPPER($2)`, [status, meetId]);
      }
    } catch (pgErr) {
      console.warn('[Server] PG meeting update notice (using Supabase & in-memory):', pgErr.message);
    }
    const eventTime = new Date().toISOString();
    const targetIssueId = memMeet.issueId || memMeet.issue_id;
    const actor = memMeet.roId || memMeet.ro_id || 'RO';
    if (status === 'Started' && previousStatus !== 'Started') {
      await issueActivity.append(targetIssueId, {
        id: `meeting-start:${memMeet.id}:${eventTime}`, eventType: 'MEETING_STARTED',
        text: `Meeting started by ${actor} (${memMeet.mode || 'Online'}).`, time: eventTime, actor
      }, 'Meeting Started');
    } else if (['Completed', 'Finished'].includes(status) && !['Completed', 'Finished', 'Concluded'].includes(previousStatus)) {
      await issueActivity.append(targetIssueId, {
        id: `meeting-end:${memMeet.id}:${eventTime}`, eventType: 'MEETING_ENDED',
        text: `Meeting ended by ${actor}. Awaiting RO minutes / feedback.`, time: eventTime, actor
      }, 'In-Progress');
    } else if (status === 'Cancelled' && previousStatus !== 'Cancelled') {
      await issueActivity.append(targetIssueId, {
        id: `meeting-cancel:${memMeet.id}:${eventTime}`, eventType: 'MEETING_CANCELLED',
        text: `Meeting cancelled by ${actor}.`, time: eventTime, actor
      }, 'In-Progress');
    }
    if (discussionSummary?.trim()) {
      await issueActivity.append(targetIssueId, {
        id: `ro-feedback:${memMeet.id}:${eventTime}`, eventType: 'RO_FEEDBACK_SUBMITTED', actor,
        text: `[RO POST-MEETING DISCUSSION RECORD] Deliberations: "${discussionSummary.trim()}"${actionItems ? ` | Action Items: "${actionItems}"` : ''}${outcome ? ` | Outcome: ${outcome}` : ''}${followUpNeeded ? ' | Follow-up required.' : ''}`,
        time: eventTime
      });
    }
    await logSystemEvent(`Meeting ${meetId} updated (${status || 'Completed'})${discussionSummary ? ' with discussion minutes' : ''}`, 'RO', 'MEETING_MGR');
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating meeting status:', err);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// WebRTC Signaling Relay for Real-Time Peer-to-Peer Video Meetings
const webrtcSignals = new Map(); // issueId -> array of { sender, type, data, timestamp }

app.post('/api/meetings/signal', (req, res) => {
  const signal = req.body;
  if (!signal || !signal.issueId) return res.status(400).json({ error: 'issueId required' });
  const key = signal.issueId.toUpperCase();
  if (!webrtcSignals.has(key)) {
    webrtcSignals.set(key, []);
  }
  const list = webrtcSignals.get(key);
  list.push({ ...signal, timestamp: Date.now() });
  if (list.length > 100) list.splice(0, list.length - 100);
  res.json({ success: true });
});

app.get('/api/meetings/signals/:issueId', (req, res) => {
  const key = req.params.issueId.toUpperCase();
  const since = parseInt(req.query.since) || 0;
  const list = webrtcSignals.get(key) || [];
  const signals = list.filter(s => s.timestamp >= since);
  res.json({ signals, now: Date.now() });
});

app.delete('/api/meetings/signals/:issueId', (req, res) => {
  webrtcSignals.delete(req.params.issueId.toUpperCase());
  res.json({ success: true });
});

// Category Guidance & Solution Videos (RO YouTube Video Management)
app.get('/api/category-videos', async (req, res) => {
  try {
    const r = await query(`SELECT category, title, video_url AS "videoUrl", description, updated_by AS "updatedBy", updated_at AS "updatedAt" FROM category_videos ORDER BY category ASC`);
    res.json(r.rows);
  } catch (err) {
    console.error('Error fetching category videos:', err);
    res.status(500).json({ error: 'Failed to fetch category videos' });
  }
});

app.put('/api/category-videos/:category', async (req, res) => {
  const rawCat = decodeURIComponent(req.params.category || '').trim();
  const { title, videoUrl, video_url, description, roId, noVideo } = req.body;
  const finalCat = (req.body.category || rawCat).trim();
  let setting;
  try { setting = getCategoryVideoUpdate({ videoUrl, video_url, noVideo }); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const finalVideoUrl = setting.videoUrl;

  try {
    // 1. Authorization check: Verify that RO is authorized to edit video for this category
    if (roId && roId !== 'ADMIN') {
      const cleanRoId = String(roId).trim().toUpperCase();
      // Authorization follows the imported category assignment, never an RO ID position.

      // Also check if this RO has assigned issues in this specific category or if RO region matches
      const roCheck = await query(
        `SELECT 1 FROM issues WHERE (UPPER(ro_id) = $1 OR UPPER(ro_id) = $2) AND category = $3 LIMIT 1`,
        [cleanRoId, `RO-${cleanRoId}`, finalCat]
      );

      const regionCheck = await query(
        `SELECT 1 FROM ros WHERE (UPPER(id) = $1 OR UPPER(id) = $2) AND (region = $3 OR region LIKE $4) LIMIT 1`,
        [cleanRoId, `RO-${cleanRoId}`, finalCat, `%${finalCat}%`]
      );

      if (roCheck.rowCount === 0 && regionCheck.rowCount === 0) {
        return res.status(403).json({
          error: `Access Denied: Relationship Officer (${roId}) is only permitted to update solution videos for their own assigned issues and categories.`
        });
      }
    }

    // 2. Primary insert/update for this specific category
    await query(`
      INSERT INTO category_videos (category, title, video_url, description, updated_by, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (category) DO UPDATE SET
        title = EXCLUDED.title,
        video_url = EXCLUDED.video_url,
        description = EXCLUDED.description,
        updated_by = EXCLUDED.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `, [finalCat, title || `${finalCat} Guidance Video`, finalVideoUrl, description || '', roId || 'RO']);

    // 3. Synchronize main category and Support Desk variations only when updating main category
    const MAIN_DEPTS = ['Academic', 'Exams', 'Financial', 'Hostels', 'Placements', 'Facilities', 'Personal'];
    
    // If saving 'Academic', also update 'Academic Support Desk'
    if (MAIN_DEPTS.includes(finalCat)) {
      await query(`
        INSERT INTO category_videos (category, title, video_url, description, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT (category) DO UPDATE SET
          title = EXCLUDED.title,
          video_url = EXCLUDED.video_url,
          description = EXCLUDED.description,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
      `, [`${finalCat} Support Desk`, title || `${finalCat} Guidance Video`, finalVideoUrl, description || '', roId || 'RO']);
    }

    // If saving 'Academic Support Desk', also update 'Academic'
    const matchedDept = MAIN_DEPTS.find(d => finalCat.toLowerCase().startsWith(d.toLowerCase()));
    if (matchedDept && finalCat.toLowerCase().includes('support desk')) {
      await query(`
        INSERT INTO category_videos (category, title, video_url, description, updated_by, updated_at)
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        ON CONFLICT (category) DO UPDATE SET
          title = EXCLUDED.title,
          video_url = EXCLUDED.video_url,
          description = EXCLUDED.description,
          updated_by = EXCLUDED.updated_by,
          updated_at = CURRENT_TIMESTAMP
      `, [matchedDept, title || `${matchedDept} Guidance Video`, finalVideoUrl, description || '', roId || 'RO']);
    }

    await logSystemEvent(`RO ${roId || 'RO'} ${setting.noVideo ? 'marked No Video Available' : 'updated solution video'} for category "${finalCat}"`, 'RO', roId || 'RO');
    res.json({ success: true, category: finalCat, videoUrl: finalVideoUrl, noVideo: setting.noVideo });
  } catch (err) {
    console.error('Error updating category video:', err);
    res.status(500).json({ error: 'Failed to update category video' });
  }
});

// 5. RESOLVE AN ISSUE (RO/Admin)
app.put('/api/issues/:id/resolve', async (req, res) => {
  const issueId = req.params.id;
  const { roId, resolutionNotes, userRole } = req.body;
  const timestamp = new Date().toISOString();
  const logText = userRole === 'Admin'
    ? `Issue resolved by Administrator: ${resolutionNotes}`
    : (userRole === 'Student' ? `Issue self-resolved by Student via guidance video: ${resolutionNotes}` : `Issue resolved by RO (${roId || 'RO'}): ${resolutionNotes}`);

  try {
    const issueRes = await query(`SELECT logs FROM issues WHERE id = $1`, [issueId]);
    if (issueRes.rowCount === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const logs = typeof issueRes.rows[0].logs === 'string' ? JSON.parse(issueRes.rows[0].logs) : (issueRes.rows[0].logs || []);
    logs.push({ text: logText, time: timestamp });

    await query(
      `UPDATE issues 
       SET status = 'Resolved', resolved_at = $1, resolution_notes = $2, logs = $3 
       WHERE id = $4`,
      [timestamp, resolutionNotes, JSON.stringify(logs), issueId]
    );

    await logSystemEvent(`Issue ${issueId} resolved by ${userRole} ${roId}`, userRole, roId);

    // Dispatch Gmail notification via skandhayashu2906@gmail.com
    await sendGmailNotification({
      to: 'skandhayashas2906@gmail.com',
      replyTo: 'skandhayashu2906@gmail.com',
      fromName: `RO Officer (${roId})`,
      subject: `[TICKET RESOLVED - ${issueId}] Marked as Resolved`,
      html: `<h3>Ticket Resolution Notice</h3>
             <p>Your ticket <strong>${issueId}</strong> has been marked as <strong>Resolved</strong> by ${userRole} (${roId}).</p>
             <p><strong>Resolution Notes:</strong> ${resolutionNotes}</p>
             <p>Please log in to your portal to review, provide feedback rating, or request re-opening if needed.</p>
             <hr/>
             <p><em>Dispatched via Gmail System: ${GMAIL_ADDRESS}</em></p>`,
      issueId,
      eventType: 'ISSUE_RESOLVED'
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error resolving issue:', err);
    res.status(500).json({ error: 'Failed to resolve issue' });
  }
});

// 5b. REOPEN AN ISSUE (Routes back to the assigned RO)
app.put('/api/issues/:id/reopen', async (req, res) => {
  const issueId = req.params.id;
  const { studentId, reason } = req.body;
  const timestamp = new Date().toISOString();
  const reopenReasonText = reason ? `: ${reason}` : '';

  try {
    const issueRes = await query(`SELECT logs, ro_id, student_id, category FROM issues WHERE id = $1`, [issueId]);
    if (issueRes.rowCount === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const { ro_id: roId, student_id: issueStudentId, category } = issueRes.rows[0];
    let logs = [];
    if (issueRes.rows[0]?.logs) {
      logs = typeof issueRes.rows[0].logs === 'string' ? JSON.parse(issueRes.rows[0].logs) : issueRes.rows[0].logs;
    }

    const newStatus = 'Re-opened by Student';
    const logText = `Ticket re-opened by student due to unsatisfied resolution${reopenReasonText}`;

    logs.push({ text: logText, time: timestamp });

    await query(
      `UPDATE issues 
       SET status = $1, resolved_at = NULL, logs = $2 
       WHERE id = $3`,
      [newStatus, JSON.stringify(logs), issueId]
    );

    await logSystemEvent(`Issue ${issueId} re-opened by student ${studentId} (${newStatus})`, 'Student', studentId);

    // Dispatch Gmail notification via skandhayashu2906@gmail.com
    await sendGmailNotification({
      to: 'skandhayashu2906@gmail.com',
      replyTo: 'skandhayashas2906@gmail.com',
      fromName: `Student Portal (${studentId})`,
      subject: `[RO URGENT - TICKET REOPENED] Ticket ${issueId} Re-opened by Student`,
      html: `<h3>Alert: Ticket Re-opened by Student</h3>
             <p>Student <strong>${studentId}</strong> (skandhayashas2906@gmail.com) has re-opened ticket <strong>${issueId}</strong> (Category: ${category}).</p>
             <p><strong>Reason:</strong> ${reason || 'Unsatisfied resolution'}</p>
             <p><strong>Status:</strong> <span style="color: #2563eb; font-weight: bold;">${newStatus}</span></p>
             <hr/>
             <p><em>Dispatched via Gmail System: ${GMAIL_ADDRESS}</em></p>`,
      issueId,
      eventType: 'ISSUE_REOPENED'
    });

    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error('Error reopening issue:', err);
    res.status(500).json({ error: 'Failed to reopen issue' });
  }
});

// 6. ESCALATE AN ISSUE
app.put('/api/issues/:id/escalate', async (req, res) => {
  const issueId = req.params.id;
  const { roId, reason } = req.body;
  const timestamp = new Date().toISOString();
  const logText = `Issue ESCALATED to Admin by RO. Reason: ${reason}`;

  try {
    const issueRes = await query(`SELECT logs FROM issues WHERE id = $1`, [issueId]);
    if (issueRes.rowCount === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const logs = issueRes.rows[0].logs;
    logs.push({ text: logText, time: timestamp });

    await query(
      `UPDATE issues SET status = 'Escalated', logs = $1 WHERE id = $2`,
      [JSON.stringify(logs), issueId]
    );

    await logSystemEvent(`Issue ${issueId} ESCALATED by RO ${roId}. Reason: ${reason}`, 'RO', roId);

    // Dispatch Gmail notification via skandhayashu2906@gmail.com
    await sendGmailNotification({
      to: `admin@nitte.edu`,
      subject: `[${issueId}] URGENT: Ticket Escalated to Admin`,
      html: `<h3>High Priority Escalation Notice</h3>
             <p>RO <strong>${roId}</strong> has escalated ticket <strong>${issueId}</strong> to Admin oversight.</p>
             <p><strong>Reason for Escalation:</strong> ${reason}</p>
             <hr/>
             <p><em>Dispatched automatically via Gmail System: ${GMAIL_ADDRESS}</em></p>`,
      issueId,
      eventType: 'ISSUE_ESCALATED'
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error escalating issue:', err);
    res.status(500).json({ error: 'Failed to escalate issue' });
  }
});

// 7. SUBMIT FEEDBACK
app.put('/api/issues/:id/feedback', async (req, res) => {
  const issueId = req.params.id;
  const { rating, comments } = req.body;
  const timestamp = new Date().toISOString();
  const logText = `Student submitted feedback: ${rating} Stars - "${comments}"`;

  try {
    const issueRes = await query(`SELECT logs FROM issues WHERE id = $1`, [issueId]);
    if (issueRes.rowCount === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const logs = issueRes.rows[0].logs;
    logs.push({ text: logText, time: timestamp });

    await query(
      `UPDATE issues SET feedback_rating = $1, feedback_comments = $2, logs = $3 WHERE id = $4`,
      [rating, comments, JSON.stringify(logs), issueId]
    );

    await logSystemEvent(`Feedback submitted for Issue ${issueId}: ${rating} stars`, 'Student', 'FEEDBACK');

    // Dispatch Gmail notification via skandhayashu2906@gmail.com
    await sendGmailNotification({
      to: 'skandhayashu2906@gmail.com',
      replyTo: 'skandhayashas2906@gmail.com',
      fromName: 'Student Feedback System',
      subject: `[RO FEEDBACK ALERT] Feedback Received for Ticket ${issueId} (${rating} Stars)`,
      html: `<h3>Student Resolution Feedback</h3>
             <p>Feedback for ticket <strong>${issueId}</strong> has been logged by student.</p>
             <p><strong>Rating:</strong> ${rating} / 5 Stars</p>
             <p><strong>Comments:</strong> "${comments}"</p>
             <hr/>
             <p><em>Dispatched to RO Office email: skandhayashu2906@gmail.com</em></p>`,
      issueId,
      eventType: 'FEEDBACK_SUBMITTED'
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error submitting feedback:', err);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// 8. REASSIGN RO (Admin override)
app.put('/api/issues/:id/reassign', async (req, res) => {
  const issueId = req.params.id;
  const { newRoId, roName } = req.body;
  const timestamp = new Date().toISOString();
  const logText = `Issue reassigned to ${roName} by Admin`;

  try {
    const issueRes = await query(`SELECT logs FROM issues WHERE id = $1`, [issueId]);
    if (issueRes.rowCount === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const logs = issueRes.rows[0].logs;
    logs.push({ text: logText, time: timestamp });

    await query(
      `UPDATE issues SET ro_id = $1, logs = $2 WHERE id = $3`,
      [newRoId, JSON.stringify(logs), issueId]
    );

    await logSystemEvent(`Issue ${issueId} reassigned to RO ${newRoId} by Admin`, 'Admin', 'ADMIN');
    res.json({ success: true });
  } catch (err) {
    console.error('Error reassigning issue:', err);
    res.status(500).json({ error: 'Failed to reassign issue' });
  }
});

// 9. SCHEDULE GROUP SESSION (Mentor)
app.post('/api/sessions', async (req, res) => {
  const { mentorId, mentorName, title, dateTime, description, link } = req.body;
  if (!mentorId || !title || !dateTime || !link) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const sessId = `SESS-${Math.floor(100 + Math.random() * 900)}`;

  try {
    await query(
      `INSERT INTO group_sessions (id, mentor_id, mentor_name, title, date_time, description, link)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [sessId, mentorId, mentorName, title, dateTime, description, link]
    );

    await logSystemEvent(`Mentor ${mentorName} scheduled a group session: ${title}`, 'Mentor', mentorId);
    res.status(201).json({ id: sessId });
  } catch (err) {
    console.error('Error adding group session:', err);
    res.status(500).json({ error: 'Failed to add group session' });
  }
});

// 10. SHARE RESOURCE (Mentor)
app.post('/api/resources', async (req, res) => {
  const { mentorId, title, type, content } = req.body;
  if (!mentorId || !title || !type || !content) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const resId = `RES-${Math.floor(100 + Math.random() * 900)}`;
  const dateShared = new Date().toISOString().split('T')[0];

  try {
    await query(
      `INSERT INTO resources (id, mentor_id, title, type, content, date_shared)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [resId, mentorId, title, type, content, dateShared]
    );

    await logSystemEvent(`Mentor ${mentorId} shared a new resource: ${title}`, 'Mentor', mentorId);
    res.status(201).json({ id: resId });
  } catch (err) {
    console.error('Error adding resource:', err);
    res.status(500).json({ error: 'Failed to add resource' });
  }
});

// 10.5. SUBMIT MENTOR SESSION RECORD
app.post('/api/mentor/session-records', async (req, res) => {
  const { id, mentorId, sessionDate, studentsAttended, topic, notes, whichClass, location, status } = req.body;
  if (!mentorId || !sessionDate || !topic) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const recordId = id || `REC-${Date.now()}`;
  const recordStatus = status || 'Submitted';
  const attendedCount = parseInt(studentsAttended) || 0;

  try {
    await query(
      `INSERT INTO mentor_session_records (id, mentor_id, session_date, students_attended, topic, notes, which_class, location, status)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         session_date = EXCLUDED.session_date,
         students_attended = EXCLUDED.students_attended,
         topic = EXCLUDED.topic,
         notes = EXCLUDED.notes,
         which_class = EXCLUDED.which_class,
         location = EXCLUDED.location,
         status = EXCLUDED.status`,
      [recordId, mentorId, sessionDate, JSON.stringify(attendedCount), topic, notes || '', whichClass || '6th Sem CSE-A', location || 'Seminar Hall 1 (Admin Block)', recordStatus]
    );

    await logSystemEvent(`Mentor ${mentorId} ${recordStatus === 'Draft' ? 'saved draft report' : 'submitted session report'} for ${whichClass || 'Class'}: ${topic}`, 'Mentor', mentorId);
    res.status(201).json({ success: true, id: recordId, status: recordStatus });
  } catch (err) {
    console.error('Error logging mentor session record:', err);
    res.status(500).json({ error: 'Failed to save session record: ' + err.message });
  }
});

// 10.6. SUBMIT MENTOR FEEDBACK (Student feedback on mentoring classes)
app.post('/api/mentor-feedbacks', async (req, res) => {
  const { studentId, studentName, mentorId, mentorName, regularityRating, clarityRating, participationRating, difficulties } = req.body;
  if (!studentId || !mentorId || !regularityRating || !clarityRating || !participationRating) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const result = await query(
      `INSERT INTO mentor_feedbacks (student_id, student_name, mentor_id, mentor_name, regularity_rating, clarity_rating, participation_rating, difficulties)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [studentId, studentName || 'Student', mentorId, mentorName || 'Mentor', regularityRating, clarityRating, participationRating, difficulties || '']
    );

    await logSystemEvent(`Student ${studentName} (${studentId}) submitted mentor feedback for ${mentorName} (${mentorId})`, 'Student', studentId);
    res.status(201).json({ success: true, id: result.rows[0].id });
  } catch (err) {
    console.error('Error submitting mentor feedback:', err);
    res.status(500).json({ error: 'Failed to submit mentor feedback' });
  }
});

await initDb();
const securityClient = await getPool().connect();
try {
  await securityClient.query('BEGIN');
  await initializeSecurity((sql, params) => securityClient.query(sql, params));
  await securityClient.query('COMMIT');
} catch (error) {
  await securityClient.query('ROLLBACK');
  throw error;
} finally { securityClient.release(); }
if (process.env.DISABLE_EMAIL !== '1') startImapListener();
app.listen(PORT, () => {
  console.log(`Express API Server running on port ${PORT}`);
});
