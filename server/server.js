import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { createIssueQuotaReader } from './issueQuota.js';
import { createIssueActivityStore } from './issueActivity.js';
import { getCategoryVideoUpdate } from '../shared/categoryGuidance.js';
import { createTicketRouter } from './ticketActions.js';
import { createDashboardReader, initializeReliabilitySchema } from './dashboardState.js';
import { createAdminAnalyticsReader, createAdminAnalyticsRouter } from './adminAnalytics.js';
import { createAuth } from './security/auth.js';
import { createAccessPolicy } from './security/access.js';
import { createDataGateway, tableScope } from './security/dataGateway.js';
import { stripSecrets } from './security/scopedState.js';
import { initializeSecurity } from './security/initialize.js';
import { createRecordingRepository, createRecordingsRouter } from './recordings.js';
import { initDb, query, isDbConnected, getPool, shutdown } from './db.js';
import { sendGmailNotification, getEmailLogs, GMAIL_ADDRESS, createQueuedMailSender, mailWorkerOptions } from './gmailService.js';
import { createRosterJobs } from './rosterJobs.js';
import { initializeJobSchema } from './jobSchema.js';
import { loadQueueCipher, verifyQueueKey } from './security/queueCipher.js';
import { createMailWorker } from './mailQueue.js';
import { startBackgroundWorkers } from './backgroundWorkers.js';
import { createMeetingExpiry } from './meetingExpiry.js';
import { createMeetingIceRouter } from './meetingIce.js';
import { initializeEmailSchema } from './emailDelivery.js';
import { createEmailNotifications } from './emailNotifications.js';
import { createEmailRoutes } from './emailRoutes.js';
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
const queueCipher = await loadQueueCipher();
const rosterJobs = createRosterJobs({ query, getClient: () => getPool().connect(), cipher: queueCipher,
  createMailSender: createQueuedMailSender, portalUrl: process.env.APP_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173') });
const emailNotifications = createEmailNotifications({ query, send: sendGmailNotification,
  portalUrl: process.env.APP_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173'),
  allowLegacy: process.env.NODE_ENV !== 'production' });
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
  access.middleware(req, res, next);
});
app.use('/api', createEmailRoutes({ notifications: emailNotifications, send: sendGmailNotification }));
app.use('/api/data', createDataGateway(query));
app.use('/api/admin', rosterJobs.router);
app.use('/api/admin/analytics', createAdminAnalyticsRouter({ read: createAdminAnalyticsReader(query) }));
app.use('/api', createMeetingIceRouter({ query }));

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

// Database failure is an unavailable response, never an empty/demo dashboard.
const readDashboard = createDashboardReader(query, { gmailAddress: GMAIL_ADDRESS, imapStatus: getImapStatus });
app.get('/api/db-state', async (req, res) => {
  try { res.json(await readDashboard(req.user)); }
  catch (error) {
    console.warn('[Dashboard] Database read failed:', error.code || error.message);
    res.status(503).json({ error: 'Your dashboard could not be refreshed. Please retry.' });
  }
});
app.use('/api', createTicketRouter({ getClient: () => getPool().connect(), createMailSender: createQueuedMailSender,
  portalUrl: process.env.APP_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5173'),
  allowLegacy: process.env.NODE_ENV !== 'production' }));

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
      logs: logs.filter(row => req.user.role === 'Admin' || ids.has(row.issueId || row.issue_id) || req.user.role === 'Mentor' && row.mentorId === req.user.id).map(({ body, html, text, ...row }) => stripSecrets(row))
    });
  } catch (err) {
    console.error('Error fetching Gmail logs:', err);
    res.status(500).json({ error: 'Failed to fetch Gmail logs' });
  }
});

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


// ADMIN BULK RESOLUTION OFFICERS (ROS) ROSTER UPLOAD & AUTOMATED GMAIL CREDENTIAL DISPATCH




const issueActivity = createIssueActivityStore({ query });

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

const readStudentQuota = createIssueQuotaReader({ query });

// Both quota display and submission enforce the same two-slot, seven-day policy.
app.get('/api/students/:id/issue-limit', async (req, res) => {
  try {
    res.json(await readStudentQuota(req.params.id));
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

// WebRTC Signaling Relay for Real-Time Peer-to-Peer Video Meetings
const webrtcSignals = new Map(); // issueId -> array of { sender, type, data, timestamp }
const meetingExpiry = createMeetingExpiry({ query, getClient: () => getPool().connect() });

app.post('/api/meetings/signal', async (req, res) => {
  const signal = req.body;
  if (!signal || !signal.issueId) return res.status(400).json({ error: 'issueId required' });
  try {
    const meeting = await meetingExpiry.roomState(signal.issueId);
    if (!meeting.active) return res.status(409).json({ code: 'MEETING_ENDED', error: 'This meeting is not live or its 30-minute limit has ended.' });
  } catch { return res.status(503).json({ error: 'Meeting availability could not be checked.' }); }
  const key = signal.issueId.toUpperCase();
  if (!webrtcSignals.has(key)) {
    webrtcSignals.set(key, []);
  }
  const list = webrtcSignals.get(key);
  list.push({ ...signal, timestamp: Date.now() });
  if (list.length > 100) list.splice(0, list.length - 100);
  res.json({ success: true });
});

app.get('/api/meetings/signals/:issueId', async (req, res) => {
  let meeting;
  try { meeting = await meetingExpiry.roomState(req.params.issueId); }
  catch { return res.status(503).json({ error: 'Meeting availability could not be checked.' }); }
  const key = req.params.issueId.toUpperCase();
  const since = parseInt(req.query.since) || 0;
  const list = webrtcSignals.get(key) || [];
  const signals = meeting.active ? list.filter(s => s.timestamp >= since && s.timestamp >= new Date(meeting.startedAt).getTime()) : [];
  res.json({ signals, meeting, now: meeting.now });
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
          error: `Access Denied: Resolution Officer (${roId}) is only permitted to update solution videos for their own assigned issues and categories.`
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

// 9. SCHEDULE GROUP SESSION (Mentor)
app.post('/api/sessions', async (req, res) => {
  const { mentorId, mentorName, title, dateTime, description, link } = req.body;
  if (!mentorId || !title || !dateTime || !link) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const sessId = `SESS-${randomUUID()}`;

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

  const resId = `RES-${randomUUID()}`;
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
  await initializeEmailSchema((sql, params) => securityClient.query(sql, params));
  await initializeJobSchema((sql, params) => securityClient.query(sql, params));
  await initializeReliabilitySchema((sql, params) => securityClient.query(sql, params));
  await verifyQueueKey((sql, params) => securityClient.query(sql, params), queueCipher);
  await initializeSecurity((sql, params) => securityClient.query(sql, params));
  await securityClient.query('COMMIT');
} catch (error) {
  await securityClient.query('ROLLBACK');
  throw error;
} finally { securityClient.release(); }
const mailWorker = createMailWorker({ getClient: () => getPool().connect(), cipher: queueCipher, ...mailWorkerOptions,
  perMinute: Math.max(1, Math.min(1000, Math.floor(Number(process.env.EMAIL_MAX_PER_MINUTE) || 10))),
  perDay: Math.max(1, Math.min(100000, Math.floor(Number(process.env.EMAIL_MAX_PER_24_HOURS) || 400))) });
const stopWorkers = startBackgroundWorkers([rosterJobs.tick, mailWorker.tick, meetingExpiry.tick]);
if (process.env.DISABLE_EMAIL !== '1' && process.env.ENABLE_INBOUND_EMAIL_REPLIES === '1') startImapListener();
const httpServer = app.listen(PORT, () => {
  console.log(`Express API Server running on port ${PORT}`);
});
let closing = false;
const closeServer = () => {
  if (closing) return; closing = true;
  const work = stopWorkers();
  const deadline = setTimeout(() => process.exit(0), 30000); deadline.unref();
  httpServer.close(async () => {
    await work; await shutdown(); clearTimeout(deadline); process.exit(0);
  });
  httpServer.closeIdleConnections?.();
};
process.once('SIGTERM', closeServer);
process.once('SIGINT', closeServer);
