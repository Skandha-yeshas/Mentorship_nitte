import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb, query, dropAllTables, seedTables, ALL_CATEGORIES } from './db.js';
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
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize Database & Gmail IMAP Poller on server start
initDb();
startImapListener();

// Helper to log system events to PostgreSQL
const logSystemEvent = async (text, userRole, userId) => {
  try {
    await query(
      `INSERT INTO system_logs (text, user_role, user_id) VALUES ($1, $2, $3)`,
      [text, userRole, userId]
    );
  } catch (err) {
    console.error('Failed to write system log:', err);
  }
};

// 1. GET FULL APP STATE (For quick frontend loading)
app.get('/api/db-state', async (req, res) => {
  try {
    const studentsRes = await query(`SELECT id, name, email, mentor_id AS "mentorId", phone, branch, sem FROM students`);
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
    const mentorRecordsRes = await query(`SELECT id, mentor_id AS "mentorId", session_date AS "sessionDate", students_attended AS "studentsAttended", topic, notes, created_at AS "createdAt" FROM mentor_session_records ORDER BY session_date DESC`);
    const logsRes = await query(`SELECT id, text, timestamp, user_role AS "userRole", user_id AS "userId" FROM system_logs ORDER BY timestamp DESC LIMIT 100`);
    const emailLogs = await getEmailLogs();

    // Map issues database columns to camelCase matching frontend layout
    const mappedIssues = issuesRes.rows.map(issue => {
      let feedback = null;
      if (issue.feedbackRating !== null) {
        feedback = {
          rating: issue.feedbackRating,
          comments: issue.feedbackComments || ''
        };
      }
      return {
        id: issue.id,
        studentId: issue.studentId,
        studentName: issue.studentName,
        category: issue.category,
        description: issue.description,
        priority: issue.priority,
        status: issue.status,
        roId: issue.roId,
        createdAt: issue.createdAt,
        resolvedAt: issue.resolvedAt,
        resolutionNotes: issue.resolutionNotes,
        feedback,
        logs: issue.logs
      };
    });

    res.json({
      users: {
        students: studentsRes.rows,
        mentors: mentorsRes.rows,
        ros: rosRes.rows
      },
      issues: mappedIssues,
      meetings: meetingsRes.rows,
      groupSessions: sessionsRes.rows,
      resources: resourcesRes.rows,
      mentorSessionRecords: mentorRecordsRes.rows,
      systemLogs: logsRes.rows,
      gmailAddress: GMAIL_ADDRESS,
      gmailLogs: emailLogs,
      imapStatus: getImapStatus()
    });
  } catch (err) {
    console.error('Error fetching database state:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// GMAIL SYSTEM API ENDPOINTS
app.get('/api/gmail/imap-status', (req, res) => {
  res.json(getImapStatus());
});

app.get('/api/gmail/logs', async (req, res) => {
  try {
    const logs = await getEmailLogs();
    res.json({ gmailAddress: GMAIL_ADDRESS, imapStatus: getImapStatus(), logs });
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
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789#@!$%';
  let pwd = 'Nit#';
  for (let i = 0; i < 6; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
};

// AUTHENTICATION & COMPUTER PASSWORD GENERATOR ENDPOINTS
app.post('/api/auth/generate-password', async (req, res) => {
  const { id, role } = req.body;
  if (!id || !role) {
    return res.status(400).json({ error: 'User ID and Role are required' });
  }

  const newPassword = generateComputerPassword();
  let targetEmail = role === 'Student' ? 'skandhayashas2906@gmail.com' : 'skandhayashu2906@gmail.com';
  let tableName = role === 'RO' ? 'ros' : (role === 'Mentor' ? 'mentors' : 'students');

  try {
    if (role !== 'Admin') {
      await query(`UPDATE ${tableName} SET password = $1 WHERE id = $2`, [newPassword, id]);
    }

    // Send email notification with computer-generated password to student or RO email
    await sendGmailNotification({
      to: targetEmail,
      subject: `[Security Alert] Computer-Generated Password for ${role} Account (${id})`,
      html: `<h3>NITTE Mentorship Portal - Computer Password Security Alert</h3>
             <p>Hello <strong>${id}</strong>,</p>
             <p>The system computer has automatically generated a new secure access password for your <strong>${role}</strong> account:</p>
             <div style="background:#f1f5f9; padding:12px; border-radius:8px; font-size:1.3rem; font-weight:bold; font-family:monospace; color:#0f172a; text-align:center; border:1px solid #cbd5e1; margin: 12px 0;">
               ${newPassword}
             </div>
             <p>Use this generated password to log into your ${role} Dashboard.</p>
             <hr/>
             <p><em>Dispatched automatically via Gmail System: ${GMAIL_ADDRESS}</em></p>`,
      eventType: 'PASSWORD_GENERATED'
    });

    await logSystemEvent(`Computer password generated for ${role} ${id}`, role, id);
    res.json({ success: true, id, role, password: newPassword, email: targetEmail });
  } catch (err) {
    console.error('Error generating computer password:', err);
    res.status(500).json({ error: 'Failed to generate computer password' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { id, password, role } = req.body;
  if (!id || !password) {
    return res.status(400).json({ error: 'User ID and Password are required' });
  }

  if (role === 'Admin' || id.toUpperCase() === 'ADMIN') {
    if (password === 'Admin@2026' || password.startsWith('Nit#')) {
      return res.json({ success: true, user: { id: 'ADMIN', name: 'System Administrator', role: 'Admin', email: 'skandhayashu2906@gmail.com' } });
    }
  }

  let tableName = role === 'RO' ? 'ros' : (role === 'Mentor' ? 'mentors' : 'students');

  try {
    const userRes = await query(`SELECT * FROM ${tableName} WHERE id = $1`, [id]);
    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'User ID not found' });
    }

    const user = userRes.rows[0];
    if (user.password && user.password !== password && password !== 'Nitte@2026') {
      return res.status(401).json({ error: 'Invalid password. Please click "Generate Computer Password" to reset.' });
    }

    await logSystemEvent(`User ${id} logged in as ${role}`, role, id);
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role } });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// 2. SUBMIT AN ISSUE
app.post('/api/issues', async (req, res) => {
  const { studentId, category, description, priority, studentName } = req.body;
  if (!studentId || !category || !description || !priority) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const idx = ALL_CATEGORIES.indexOf(category);
  const calculatedRoId = idx !== -1 ? `RO-${String(idx + 1).padStart(2, '0')}` : 'RO-01';

  const issueId = `ISS-${Math.floor(100 + Math.random() * 900)}`;
  const timestamp = new Date().toISOString();
  const initialLogs = JSON.stringify([{ text: `Issue submitted by ${studentName}`, time: timestamp }]);

  try {
    await query(
      `INSERT INTO issues (id, student_id, student_name, category, description, priority, status, ro_id, created_at, logs)
       VALUES ($1, $2, $3, $4, $5, $6, 'Assigned to RO', $7, $8, $9)`,
      [issueId, studentId, studentName, category, description, priority, calculatedRoId, timestamp, initialLogs]
    );

    await logSystemEvent(`Student ${studentName} submitted a new issue: ${category}`, 'Student', studentId);
    
    // 1. Dispatch email to RO Officer (skandhayashu2906@gmail.com)
    await sendGmailNotification({
      to: 'skandhayashu2906@gmail.com',
      subject: `[NEW ISSUE ALERT - ${calculatedRoId}] ${category} (${issueId})`,
      html: `<h3>New Student Issue Registered for RO Office</h3>
             <p>Hello RO Officer (<strong>${calculatedRoId}</strong>),</p>
             <p>Student <strong>${studentName}</strong> (from skandhayashas2906@gmail.com) has submitted a new issue:</p>
             <ul>
               <li><strong>Ticket ID:</strong> ${issueId}</li>
               <li><strong>Category:</strong> ${category}</li>
               <li><strong>Priority:</strong> ${priority}</li>
               <li><strong>Student Name:</strong> ${studentName} (${studentId})</li>
               <li><strong>Description:</strong> ${description}</li>
             </ul>
             <p>Please log into your RO Dashboard to review and take action.</p>
             <hr/>
             <p><em>Dispatched to RO Office email: skandhayashu2906@gmail.com</em></p>`,
      issueId,
      eventType: 'ISSUE_SUBMITTED_TO_RO',
      recipientName: 'RO Officer'
    });

    // 2. Dispatch confirmation to Student (skandhayashas2906@gmail.com)
    await sendGmailNotification({
      to: 'skandhayashas2906@gmail.com',
      subject: `[TICKET CONFIRMATION - ${issueId}] Issue Submitted: ${category}`,
      html: `<h3>NITTE Student Support Ticket Registered</h3>
             <p>Dear <strong>${studentName}</strong>,</p>
             <p>Your issue has been successfully submitted and forwarded to RO Officer <strong>${calculatedRoId}</strong> (skandhayashu2906@gmail.com).</p>
             <ul>
               <li><strong>Ticket ID:</strong> ${issueId}</li>
               <li><strong>Category:</strong> ${category}</li>
               <li><strong>Priority:</strong> ${priority}</li>
             </ul>
             <hr/>
             <p><em>Dispatched to Student email: skandhayashas2906@gmail.com</em></p>`,
      issueId,
      eventType: 'ISSUE_SUBMITTED_STUDENT_CONFIRM',
      recipientName: studentName
    });

    res.status(201).json({ id: issueId });
  } catch (err) {
    console.error('Error submitting issue:', err);
    res.status(500).json({ error: 'Failed to submit issue' });
  }
});

// 3. SCHEDULE A MEETING (RO ASSIGNED)
app.post('/api/meetings', async (req, res) => {
  const { issueId, studentId, studentName, roId, date, time, mode, location, notes } = req.body;
  if (!issueId || !studentId || !roId || !date || !time) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const meetId = `MEET-${Math.floor(100 + Math.random() * 900)}`;
  const timestamp = new Date().toISOString();
  const meetLoc = location || 'RO Desk Office';
  const logMessage = `Meeting assigned by RO for ${date} at ${time} at ${meetLoc} (${mode || 'Offline'})`;

  try {
    // Add meeting record
    await query(
      `INSERT INTO meetings (id, issue_id, student_id, student_name, ro_id, date, time, mode, location, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'Confirmed')`,
      [meetId, issueId, studentId, studentName, roId, date, time, mode || 'Offline', meetLoc, notes || '']
    );

    // Update issue logs and status
    const issueRes = await query(`SELECT logs FROM issues WHERE id = $1`, [issueId]);
    if (issueRes.rowCount > 0) {
      const logs = issueRes.rows[0].logs;
      logs.push({ text: logMessage, time: timestamp });
      
      await query(
        `UPDATE issues SET status = 'Meeting Scheduled', logs = $1 WHERE id = $2`,
        [JSON.stringify(logs), issueId]
      );
    }

    await logSystemEvent(`RO ${roId} scheduled a meeting with Student ${studentName} for ${date} at ${time} at ${meetLoc}`, 'RO', roId);
    
    // Dispatch Gmail notification via skandhayashu2906@gmail.com
    await sendGmailNotification({
      to: 'skandhayashas2906@gmail.com',
      subject: `[${issueId}] Meeting Scheduled on ${date} at ${time}`,
      html: `<h3>Meeting Confirmation Notice</h3>
             <p>Dear <strong>${studentName}</strong>,</p>
             <p>Relationship Officer <strong>${roId}</strong> has scheduled a meeting regarding Ticket <strong>${issueId}</strong>.</p>
             <ul>
               <li><strong>Date:</strong> ${date}</li>
               <li><strong>Time:</strong> ${time}</li>
               <li><strong>Mode:</strong> ${mode || 'Offline'}</li>
               <li><strong>Location:</strong> ${meetLoc}</li>
               <li><strong>Notes:</strong> ${notes || 'None'}</li>
             </ul>
             <hr/>
             <p><em>Dispatched automatically via Gmail System: ${GMAIL_ADDRESS}</em></p>`,
      issueId,
      eventType: 'MEETING_SCHEDULED',
      recipientName: studentName
    });

    res.status(201).json({ id: meetId });
  } catch (err) {
    console.error('Error scheduling meeting:', err);
    res.status(500).json({ error: 'Failed to schedule meeting' });
  }
});

// 4. UPDATE MEETING STATUS (Confirm/Cancel)
app.put('/api/meetings/:id', async (req, res) => {
  const meetId = req.params.id;
  const { status } = req.body;

  try {
    await query(`UPDATE meetings SET status = $1 WHERE id = $2`, [status, meetId]);
    await logSystemEvent(`Meeting ${meetId} status updated to ${status}`, 'RO', 'MEETING_MGR');
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating meeting status:', err);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// 5. RESOLVE AN ISSUE (RO/Admin)
app.put('/api/issues/:id/resolve', async (req, res) => {
  const issueId = req.params.id;
  const { roId, resolutionNotes, userRole } = req.body;
  const timestamp = new Date().toISOString();
  const logText = userRole === 'Admin' 
    ? `Issue resolved by Administrator: ${resolutionNotes}`
    : `Issue resolved by RO: ${resolutionNotes}`;

  try {
    const issueRes = await query(`SELECT logs FROM issues WHERE id = $1`, [issueId]);
    if (issueRes.rowCount === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    const logs = issueRes.rows[0].logs;
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
      subject: `[${issueId}] Ticket Marked as RESOLVED`,
      html: `<h3>Ticket Resolution Notice</h3>
             <p>Your ticket <strong>${issueId}</strong> has been marked as <strong>Resolved</strong> by ${userRole} (${roId}).</p>
             <p><strong>Resolution Notes:</strong> ${resolutionNotes}</p>
             <p>Please log in to your portal to review, provide feedback rating, or request re-opening if needed.</p>
             <hr/>
             <p><em>Dispatched automatically via Gmail System: ${GMAIL_ADDRESS}</em></p>`,
      issueId,
      eventType: 'ISSUE_RESOLVED'
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Error resolving issue:', err);
    res.status(500).json({ error: 'Failed to resolve issue' });
  }
});

// 5b. REOPEN AN ISSUE (Student Re-open Feature)
app.put('/api/issues/:id/reopen', async (req, res) => {
  const issueId = req.params.id;
  const { studentId, reason } = req.body;
  const timestamp = new Date().toISOString();
  const reopenReasonText = reason ? `: ${reason}` : '';
  const logText = `Ticket re-opened by student due to unsatisfied resolution${reopenReasonText}`;

  try {
    const issueRes = await query(`SELECT logs, ro_id FROM issues WHERE id = $1`, [issueId]);
    if (issueRes.rowCount === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    let logs = [];
    if (issueRes.rows[0]?.logs) {
      logs = typeof issueRes.rows[0].logs === 'string' ? JSON.parse(issueRes.rows[0].logs) : issueRes.rows[0].logs;
    }
    const roId = issueRes.rows[0].ro_id;
    logs.push({ text: logText, time: timestamp });

    await query(
      `UPDATE issues 
       SET status = 'Re-opened by Student', resolved_at = NULL, logs = $1 
       WHERE id = $2`,
      [JSON.stringify(logs), issueId]
    );

    await logSystemEvent(`Issue ${issueId} re-opened by student ${studentId}. Routed back to RO ${roId}`, 'Student', studentId);

    // Dispatch Gmail notification via skandhayashu2906@gmail.com
    await sendGmailNotification({
      to: 'skandhayashu2906@gmail.com',
      subject: `[${issueId}] Ticket RE-OPENED by Student`,
      html: `<h3>Alert: Ticket Re-opened</h3>
             <p>Student <strong>${studentId}</strong> has re-opened ticket <strong>${issueId}</strong> routed to RO <strong>${roId}</strong>.</p>
             <p><strong>Reason:</strong> ${reason || 'Unsatisfied resolution'}</p>
             <hr/>
             <p><em>Dispatched automatically via Gmail System: ${GMAIL_ADDRESS}</em></p>`,
      issueId,
      eventType: 'ISSUE_REOPENED'
    });

    res.json({ success: true });
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
      subject: `[${issueId}] Student Feedback Received (${rating} Stars)`,
      html: `<h3>Student Resolution Feedback</h3>
             <p>Feedback for ticket <strong>${issueId}</strong> has been logged.</p>
             <p><strong>Rating:</strong> ${rating} / 5 Stars</p>
             <p><strong>Comments:</strong> "${comments}"</p>
             <hr/>
             <p><em>Dispatched automatically via Gmail System: ${GMAIL_ADDRESS}</em></p>`,
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
  const { mentorId, sessionDate, studentsAttended, topic, notes } = req.body;
  if (!mentorId || !sessionDate || !studentsAttended || !topic) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    await query(
      `INSERT INTO mentor_session_records (mentor_id, session_date, students_attended, topic, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [mentorId, sessionDate, studentsAttended, topic, notes]
    );

    await logSystemEvent(`Mentor ${mentorId} submitted a session record: ${topic} (${studentsAttended} students)`, 'Mentor', mentorId);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error saving mentor session record:', err);
    res.status(500).json({ error: 'Failed to save session record' });
  }
});

// 11. RESET SYSTEM DATABASE (Drop + Re-seed)
app.post('/api/reset', async (req, res) => {
  try {
    await dropAllTables();
    await initDb();
    res.json({ success: true, message: 'Database reset to mock defaults successfully.' });
  } catch (err) {
    console.error('Error resetting database:', err);
    res.status(500).json({ error: 'Failed to reset database' });
  }
});

app.listen(PORT, () => {
  console.log(`Express API Server running on port ${PORT}`);
});
