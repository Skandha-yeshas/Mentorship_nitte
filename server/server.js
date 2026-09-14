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
    const mentorRecordsRes = await query(`SELECT id, mentor_id AS "mentorId", session_date AS "sessionDate", students_attended AS "studentsAttended", topic, notes, which_class AS "whichClass", location, created_at AS "createdAt" FROM mentor_session_records ORDER BY session_date DESC`);
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
      categoryVideos: categoryVideosRes.rows,
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

// 1. STUDENT REGISTRATION ENDPOINT
app.post('/api/auth/register-student', async (req, res) => {
  const { name, email, usn, password, branch, sem } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, Gmail ID, and Password are required.' });
  }

  const studentId = (usn && usn.trim()) ? usn.trim().toUpperCase() : `S${Math.floor(100 + Math.random() * 900)}`;

  try {
    // Check if student with this email or ID already exists
    const existing = await query(`SELECT * FROM students WHERE LOWER(email) = LOWER($1) OR UPPER(id) = UPPER($2)`, [email.trim(), studentId]);
    if (existing.rowCount > 0) {
      return res.status(400).json({ error: 'A student account with this Email or USN/ID already exists.' });
    }

    const mentorId = 'M101';
    const semester = parseInt(sem) || 4;
    const studentBranch = branch || 'CSE';

    await query(
      `INSERT INTO students (id, name, email, mentor_id, phone, branch, sem, password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [studentId, name.trim(), email.trim(), mentorId, '9876543210', studentBranch, semester, password.trim()]
    );

    await logSystemEvent(`New Student registered: ${name} (${email})`, 'Student', studentId);

    // Dispatch Welcome & Confirmation Email via Nodemailer Gmail system
    await sendGmailNotification({
      to: email.trim(),
      replyTo: 'skandhayashu2906@gmail.com',
      fromName: 'NITTE Student Portal',
      subject: `[WELCOME TO NITTE PORTAL] Registration Successful - ${studentId}`,
      html: `<h3>Welcome to NITTE Mentorship Portal</h3>
             <p>Dear <strong>${name.trim()}</strong>,</p>
             <p>Your student account has been successfully registered!</p>
             <ul>
               <li><strong>Student ID / USN:</strong> ${studentId}</li>
               <li><strong>Registered Gmail:</strong> ${email.trim()}</li>
               <li><strong>Department:</strong> ${studentBranch}</li>
               <li><strong>Semester:</strong> ${semester}</li>
             </ul>
             <p>You can now log into your student dashboard using your Gmail address and password.</p>
             <hr/>
             <p><em>Dispatched automatically by NITTE Mentorship System</em></p>`,
      recipientName: name.trim(),
      eventType: 'STUDENT_REGISTERED'
    });

    res.status(201).json({
      success: true,
      student: {
        id: studentId,
        name: name.trim(),
        email: email.trim(),
        branch: studentBranch,
        sem: semester
      }
    });
  } catch (err) {
    console.error('Error registering student:', err);
    res.status(500).json({ error: 'Failed to register student account' });
  }
});

// ADMIN BULK STUDENT ROSTER UPLOAD & AUTOMATED GMAIL CREDENTIAL DISPATCH
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
    const rawId = s.id || s.usn || s.studentId || s.USN || s['Student ID'] || s['Student USN'] || s['USN / ID'];
    const rawName = s.name || s.studentName || s.Name || s['Student Name'] || s['Full Name'] || s['Name'];
    const rawEmail = s.email || s.studentEmail || s.Email || s.gmail || s['Gmail'] || s['Student Email'] || s['Email Address'] || s['Student Gmail'];
    const branch = s.branch || s.Branch || s.department || s.Dept || 'CSE';
    const sem = parseInt(s.sem || s.Sem || s.semester || s.Semester) || 5;
    const phone = s.phone || s.Phone || s.mobile || '9876543210';
    const mentorId = s.mentorId || s.mentor_id || 'M01';

    if (!rawId || !rawName || !rawEmail) {
      results.push({
        status: 'FAILED',
        index: i + 1,
        id: rawId || 'N/A',
        name: rawName || 'N/A',
        email: rawEmail || 'N/A',
        reason: 'Missing required Student ID, Name, or Email.'
      });
      failureCount++;
      continue;
    }

    const studentId = String(rawId).trim().toUpperCase();
    const name = String(rawName).trim();
    const email = String(rawEmail).trim().toLowerCase();
    const generatedPassword = s.password && String(s.password).trim() ? String(s.password).trim() : generateComputerPassword();

    try {
      // Upsert into PostgreSQL students table
      await query(
        `INSERT INTO students (id, name, email, mentor_id, phone, branch, sem, password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           branch = EXCLUDED.branch,
           sem = EXCLUDED.sem,
           password = EXCLUDED.password`,
        [studentId, name, email, mentorId, phone, branch, sem, generatedPassword]
      );

      // Send automated onboarding credential email via Gmail SMTP
      const emailHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); padding: 24px; text-align: center; color: #ffffff;">
            <h1 style="margin: 0; font-size: 1.4rem; font-weight: 700; letter-spacing: 0.5px;">NITTE Student Mentorship & Support System</h1>
            <p style="margin: 6px 0 0 0; font-size: 0.9rem; color: #93c5fd;">Official Student Account Onboarding</p>
          </div>
          <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
            <p style="font-size: 1rem; margin-top: 0;">Dear <strong>${name}</strong>,</p>
            <p>Welcome! Your official student account has been created by the Administration for the NITTE Mentorship Portal.</p>
            
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #2563eb; padding: 18px; border-radius: 6px; margin: 20px 0;">
              <h3 style="margin: 0 0 12px 0; color: #1e3a8a; font-size: 1rem;">🔐 Your Login Credentials:</h3>
              <p style="margin: 6px 0; font-size: 0.95rem;"><strong>Portal URL:</strong> <a href="http://localhost:5173" style="color: #2563eb; font-weight: 600; text-decoration: underline;">http://localhost:5173</a></p>
              <p style="margin: 6px 0; font-size: 0.95rem;"><strong>Student USN / ID:</strong> <code style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${studentId}</code></p>
              <p style="margin: 6px 0; font-size: 0.95rem;"><strong>Registered Gmail:</strong> <code style="background: #e2e8f0; padding: 2px 8px; border-radius: 4px;">${email}</code></p>
              <p style="margin: 6px 0; font-size: 0.95rem;"><strong>Generated Password:</strong> <code style="background: #fee2e2; color: #991b1b; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 1.05rem;">${generatedPassword}</code></p>
            </div>

            <p style="font-size: 0.9rem; color: #475569;">You can log in to the portal using either your <strong>Registered Gmail</strong> or <strong>Student USN</strong> along with the generated password shown above.</p>
            
            <div style="text-align: center; margin-top: 24px;">
              <a href="http://localhost:5173" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-weight: 600; font-size: 0.95rem;">Log In to Student Dashboard</a>
            </div>
          </div>
          <div style="background-color: #f1f5f9; padding: 14px 24px; text-align: center; font-size: 0.78rem; color: #64748b; border-top: 1px solid #e2e8f0;">
            This automated credential notification was sent by NITTE System Administration via ${GMAIL_ADDRESS}.
          </div>
        </div>
      `;

      await sendGmailNotification({
        to: email,
        replyTo: GMAIL_ADDRESS,
        fromName: 'NITTE Admin Desk',
        subject: `[NITTE PORTAL CREDENTIALS] Welcome ${name} - Student Onboarding (${studentId})`,
        html: emailHtml,
        text: `Welcome ${name}! Your student account has been created. Student ID: ${studentId}, Email: ${email}, Password: ${generatedPassword}. Log in at http://localhost:5173`,
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


app.post('/api/auth/login', async (req, res) => {
  const { id, email, password, role } = req.body;
  const loginIdentifier = (email || id || '').trim();
  if (!loginIdentifier || !password) {
    return res.status(400).json({ error: 'Email / User ID and Password are required' });
  }

  if (role === 'Admin' || loginIdentifier.toUpperCase() === 'ADMIN' || loginIdentifier === 'skandhayashu2906@gmail.com') {
    if (password === 'Admin@2026' || password.startsWith('Nit#') || password === 'Nitte@2026') {
      return res.json({ success: true, user: { id: 'ADMIN', name: 'System Administrator', role: 'Admin', email: 'skandhayashu2906@gmail.com' } });
    }
  }

  let tableName = role === 'RO' ? 'ros' : (role === 'Mentor' ? 'mentors' : 'students');

  try {
    const userRes = await query(
      `SELECT * FROM ${tableName} WHERE UPPER(id) = UPPER($1) OR LOWER(email) = LOWER($1)`,
      [loginIdentifier]
    );

    if (userRes.rowCount === 0) {
      return res.status(404).json({ error: 'No account found with this Email or User ID.' });
    }

    const user = userRes.rows[0];
    if (user.password && user.password !== password.trim() && password !== 'Nitte@2026') {
      return res.status(401).json({ error: 'Incorrect password. Please check your credentials.' });
    }

    await logSystemEvent(`User ${user.id} (${user.email}) logged in as ${role || 'User'}`, role || 'Student', user.id);
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: role || 'Student' } });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// 1b. GET STUDENT ISSUE LIMIT STATUS (2 Issues Per 7 Days Limit)
app.get('/api/students/:id/issue-limit', async (req, res) => {
  const studentId = req.params.id;
  try {
    const checkRes = await query(
      `SELECT created_at FROM issues 
       WHERE student_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
       ORDER BY created_at ASC`,
      [studentId]
    );

    const recentCount = checkRes.rowCount;
    const maxLimit = 2;
    const isEligible = recentCount < maxLimit;

    if (recentCount > 0) {
      const oldestCreated = new Date(checkRes.rows[0].created_at);
      const nextAllowed = new Date(oldestCreated.getTime() + 7 * 24 * 60 * 60 * 1000);
      const diffMs = Math.max(0, nextAllowed.getTime() - Date.now());

      res.json({
        isEligible,
        recentCount,
        maxLimit,
        maxQuota: maxLimit, // backwards compatibility alias
        remainingLimit: Math.max(0, maxLimit - recentCount),
        remainingQuota: Math.max(0, maxLimit - recentCount),
        oldestSubmittedAt: oldestCreated.toISOString(),
        nextAllowedAt: nextAllowed.toISOString(),
        cooldownMs: diffMs
      });
    } else {
      res.json({
        isEligible: true,
        recentCount: 0,
        maxLimit,
        maxQuota: maxLimit,
        remainingLimit: maxLimit,
        remainingQuota: maxLimit,
        oldestSubmittedAt: null,
        nextAllowedAt: null,
        cooldownMs: 0
      });
    }
  } catch (err) {
    console.error('Error checking student issue limit:', err);
    res.status(500).json({ error: 'Failed to check issue limit' });
  }
});

// 2. SUBMIT AN ISSUE (Allows 2 Issues per 7 Days & Supports Demo Bypass)
app.post('/api/issues', async (req, res) => {
  const { studentId, category, description, priority, studentName, bypassLimit } = req.body;
  if (!studentId || !category || !description || !priority) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Check 7-day 2-issue limit for this student unless Demo Bypass is active
    if (!bypassLimit) {
      const checkRes = await query(
        `SELECT created_at FROM issues 
         WHERE student_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
         ORDER BY created_at ASC`,
        [studentId]
      );

      if (checkRes.rowCount >= 2) {
        const oldestCreated = new Date(checkRes.rows[0].created_at);
        const nextAllowed = new Date(oldestCreated.getTime() + 7 * 24 * 60 * 60 * 1000);
        const diffMs = Math.max(0, nextAllowed.getTime() - Date.now());
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

        const timeText = diffDays > 0 ? `${diffDays} days and ${diffHours} hours` : `${diffHours} hours`;

        return res.status(400).json({
          error: `Weekly Limit Reached (2 / 2 Issues Used): Students can submit up to 2 issues per 7 days. Your next issue submission opens in ${timeText}. (Tip: Turn on Demo Mode to bypass)`,
          nextAllowedDate: nextAllowed.toISOString(),
          cooldownRemainingMs: diffMs
        });
      }
    }

    const idx = ALL_CATEGORIES.indexOf(category);
    const calculatedRoId = idx !== -1 ? `RO-${String(idx + 1).padStart(2, '0')}` : 'RO-01';

    // Count previous attempts/issues in this category for this student
    const catCheck = await query(
      `SELECT id, logs FROM issues WHERE student_id = $1 AND (category = $2 OR ro_id = $3)`,
      [studentId, category, calculatedRoId]
    );

    let totalAttempts = catCheck.rowCount;
    catCheck.rows.forEach(row => {
      const lArr = typeof row.logs === 'string' ? JSON.parse(row.logs) : (row.logs || []);
      const reopens = lArr.filter(l => l.text && l.text.toLowerCase().includes('re-opened')).length;
      totalAttempts += reopens;
    });

    const isThirdAttempt = totalAttempts >= 2; // 3rd attempt or higher
    const initialStatus = isThirdAttempt ? 'Escalated' : 'Assigned to RO';
    const logText = isThirdAttempt
      ? `[AUTO-ESCALATED TO ADMIN] 3rd attempt reached for category ${category}. Automatically escalated directly to Admin Office for priority resolution.`
      : `Issue submitted by ${studentName} (Attempt #${totalAttempts + 1} for ${category}).`;

    const issueId = `ISS-${Math.floor(100 + Math.random() * 900)}`;
    const timestamp = new Date().toISOString();
    const initialLogs = JSON.stringify([{ text: logText, time: timestamp }]);

    await query(
      `INSERT INTO issues (id, student_id, student_name, category, description, priority, status, ro_id, created_at, logs)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [issueId, studentId, studentName, category, description, priority, initialStatus, calculatedRoId, timestamp, initialLogs]
    );

    await logSystemEvent(`Student ${studentName} submitted issue: ${category} (${initialStatus})`, 'Student', studentId);

    // 1. Dispatch email to RO Officer (skandhayashu2906@gmail.com) in background
    sendGmailNotification({
      to: 'skandhayashu2906@gmail.com',
      replyTo: 'skandhayashas2906@gmail.com',
      fromName: `NITTE Portal (${studentName})`,
      subject: isThirdAttempt ? `[ADMIN AUTO-ESCALATION - 3RD ATTEMPT] ${category} (${issueId})` : `[RO ACTION REQUIRED - ${calculatedRoId}] New Issue: ${category} (${issueId})`,
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
             ${isThirdAttempt ? '<p style="color: #dc2626; font-weight: bold;">⚠️ Note: This is the 3rd attempt for this category. It has been automatically escalated to Admin Office.</p>' : ''}
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
             <p>Your issue has been successfully submitted ${isThirdAttempt ? 'and <strong>automatically escalated to the Admin Office</strong> (3rd Attempt Limit)' : `and forwarded to RO Officer <strong>${calculatedRoId}</strong>`}.</p>
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

    res.status(201).json({ id: issueId, status: initialStatus, isThirdAttempt });
  } catch (err) {
    console.error('Error submitting issue:', err);
    res.status(500).json({ error: 'Failed to submit issue' });
  }
});

// 3. SCHEDULE / RESCHEDULE A MEETING (RO ASSIGNED)
app.post('/api/meetings', async (req, res) => {
  const { issueId, studentId, studentName, roId, date, time, mode, location, notes, discussionSummary, actionItems, reassignFeedback } = req.body;
  if (!issueId || !studentId || !roId || !date || !time) {
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

  try {
    // Ensure student_id exists in database or fallback to issue's student_id
    let validStudentId = studentId;
    const studentCheck = await query(`SELECT id FROM students WHERE UPPER(id) = UPPER($1)`, [studentId]);
    if (studentCheck.rowCount === 0) {
      const issueCheck = await query(`SELECT student_id FROM issues WHERE UPPER(id) = UPPER($1)`, [issueId]);
      if (issueCheck.rowCount > 0 && issueCheck.rows[0].student_id) {
        validStudentId = issueCheck.rows[0].student_id;
      }
    }

    // Check if meeting already exists for this issue or if meeting was previously scheduled
    const existingMeet = await query(`SELECT id FROM meetings WHERE UPPER(issue_id) = UPPER($1)`, [issueId]);
    const issueStatusCheck = await query(`SELECT status, logs FROM issues WHERE UPPER(id) = UPPER($1)`, [issueId]);
    const currentStatus = issueStatusCheck.rowCount > 0 ? issueStatusCheck.rows[0].status : '';

    const isReschedule = existingMeet.rowCount > 0 ||
      currentStatus === 'Meeting Scheduled' ||
      currentStatus === 'Meeting Started' ||
      currentStatus === 'In-Progress' ||
      currentStatus === 'In Progress';

    const meetId = existingMeet.rowCount > 0 ? existingMeet.rows[0].id : `MEET-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    if (isReschedule) {
      if (issueStatusCheck.rowCount > 0) {
        const lArr = typeof issueStatusCheck.rows[0].logs === 'string' ? JSON.parse(issueStatusCheck.rows[0].logs) : (issueStatusCheck.rows[0].logs || []);
        const getLogText = (l) => {
          if (!l) return '';
          if (typeof l === 'string') {
            if (l.trim().startsWith('{') && l.includes('"text"')) {
              try { const p = JSON.parse(l); if (p && p.text) return String(p.text); } catch (e) { }
            }
            return l;
          }
          if (typeof l === 'object' && l.text) return String(l.text);
          return String(l);
        };
        const reassignCount = lArr.filter(l => {
          const txt = getLogText(l).toLowerCase();
          return (txt.includes('rescheduled') || txt.includes('reassigned') || txt.includes('re-assigned')) && !txt.includes('reassigned to');
        }).length;
        if (reassignCount >= 2) {
          return res.status(400).json({ error: 'RO Limit Reached: Maximum 2 meeting reassignments allowed per issue. Please escalate to Admin for further changes.' });
        }
      }

      // Delete any previous meeting rows for this issue to ensure no stale 'Started' status remains
      await query(`DELETE FROM meetings WHERE UPPER(issue_id) = UPPER($1)`, [issueId]);

      // Insert fresh meeting record with status = 'Confirmed'
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

    let logMessage = isReschedule
      ? `Meeting rescheduled / reassigned by RO (${mode || 'Offline'}) for ${date} at ${time} at ${meetLoc}`
      : `Meeting scheduled by RO (${mode || 'Offline'}) for ${date} at ${time} at ${meetLoc}`;
    if (cleanFeedback) {
      logMessage += ` | [REASSIGN FEEDBACK]: "${cleanFeedback}"`;
    } else if (cleanSummary) {
      logMessage += ` | [LOGGED DISCUSSION MINUTES]: "${cleanSummary}"`;
    }

    // Update issue logs and status (reset status to Meeting Scheduled)
    const issueRes = await query(`SELECT logs FROM issues WHERE UPPER(id) = UPPER($1)`, [issueId]);
    if (issueRes.rowCount > 0) {
      const logs = typeof issueRes.rows[0].logs === 'string' ? JSON.parse(issueRes.rows[0].logs) : (issueRes.rows[0].logs || []);
      logs.push({ text: logMessage, time: timestamp });

      await query(
        `UPDATE issues SET status = 'Meeting Scheduled', logs = $1 WHERE UPPER(id) = UPPER($2)`,
        [JSON.stringify(logs), issueId]
      );
    }

    await logSystemEvent(`RO ${roId} ${isReschedule ? 'rescheduled' : 'scheduled'} a meeting with Student ${studentName} for ${date} at ${time}`, 'RO', roId);

    // Dispatch Gmail notification via skandhayashu2906@gmail.com
    await sendGmailNotification({
      to: 'skandhayashas2906@gmail.com',
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
      eventType: 'MEETING_SCHEDULED',
      recipientName: studentName
    });

    res.status(201).json({ id: meetId, isReschedule });
  } catch (err) {
    console.error('Error scheduling meeting:', err);
    res.status(500).json({ error: 'Failed to schedule meeting' });
  }
});

// 4. UPDATE MEETING STATUS & DISCUSSION MINUTES (Confirm/Cancel/Notes)
app.put('/api/meetings/:id', async (req, res) => {
  const meetId = req.params.id;
  const { status, notes, discussionSummary, actionItems } = req.body;

  try {
    const combinedNotes = notes || (discussionSummary ? `Discussions: ${discussionSummary}${actionItems ? ` | Action Items: ${actionItems}` : ''}` : null);
    if (combinedNotes) {
      await query(
        `UPDATE meetings SET status = COALESCE($1, status), notes = $2 WHERE id = $3 OR UPPER(issue_id) = UPPER($3)`,
        [status || 'Completed', combinedNotes, meetId]
      );
    } else {
      await query(`UPDATE meetings SET status = $1 WHERE id = $2 OR UPPER(issue_id) = UPPER($2)`, [status, meetId]);
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
  const signals = list.filter(s => s.timestamp > since);
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
  const { title, videoUrl, video_url, description, roId } = req.body;
  const finalCat = (req.body.category || rawCat).trim();
  const finalVideoUrl = videoUrl || video_url;

  if (!finalVideoUrl) {
    return res.status(400).json({ error: 'videoUrl is required' });
  }

  try {
    // 1. Authorization check: Verify that RO is authorized to edit video for this category
    if (roId && roId !== 'ADMIN') {
      const cleanRoId = String(roId).trim().toUpperCase();
      const catIdx = ALL_CATEGORIES.indexOf(finalCat);
      const expectedRoId = catIdx !== -1 ? `RO-${String(catIdx + 1).padStart(2, '0')}` : null;
      
      const isDesignatedRo = Boolean(expectedRoId && (
        cleanRoId === expectedRoId ||
        cleanRoId.includes(expectedRoId) ||
        expectedRoId.includes(cleanRoId)
      ));

      // Also check if this RO has assigned issues in this specific category or if RO region matches
      const roCheck = await query(
        `SELECT 1 FROM issues WHERE (UPPER(ro_id) = $1 OR UPPER(ro_id) = $2) AND category = $3 LIMIT 1`,
        [cleanRoId, `RO-${cleanRoId}`, finalCat]
      );

      const regionCheck = await query(
        `SELECT 1 FROM ros WHERE (UPPER(id) = $1 OR UPPER(id) = $2) AND (region = $3 OR region LIKE $4) LIMIT 1`,
        [cleanRoId, `RO-${cleanRoId}`, finalCat, `%${finalCat}%`]
      );

      if (!isDesignatedRo && roCheck.rowCount === 0 && regionCheck.rowCount === 0) {
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

    await logSystemEvent(`RO ${roId || 'RO'} updated solution video for category "${finalCat}"`, 'RO', roId || 'RO');
    res.json({ success: true, category: finalCat });
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

// 5b. REOPEN AN ISSUE (Student Re-open Feature with 3rd Attempt Auto-Escalation)
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

    // Count attempts in this category
    const catCheck = await query(
      `SELECT id, logs FROM issues WHERE student_id = $1 AND (category = $2 OR ro_id = $3)`,
      [issueStudentId || studentId, category, roId]
    );
    let totalAttempts = catCheck.rowCount;
    catCheck.rows.forEach(row => {
      const lArr = typeof row.logs === 'string' ? JSON.parse(row.logs) : (row.logs || []);
      const reopens = lArr.filter(l => l.text && l.text.toLowerCase().includes('re-opened')).length;
      totalAttempts += reopens;
    });

    const isThirdAttempt = totalAttempts >= 2; // 3rd attempt or higher
    const newStatus = isThirdAttempt ? 'Escalated' : 'Re-opened by Student';
    const logText = isThirdAttempt
      ? `[AUTO-ESCALATED TO ADMIN] 3rd re-escalation attempt for category ${category}. Automatically escalated directly to Admin Office for priority intervention.`
      : `Ticket re-opened by student due to unsatisfied resolution${reopenReasonText}`;

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
      subject: isThirdAttempt ? `[ADMIN AUTO-ESCALATION - 3RD REOPEN] Ticket ${issueId}` : `[RO URGENT - TICKET REOPENED] Ticket ${issueId} Re-opened by Student`,
      html: `<h3>Alert: Ticket Re-opened by Student</h3>
             <p>Student <strong>${studentId}</strong> (skandhayashas2906@gmail.com) has re-opened ticket <strong>${issueId}</strong> (Category: ${category}).</p>
             <p><strong>Reason:</strong> ${reason || 'Unsatisfied resolution'}</p>
             <p><strong>Status:</strong> <span style="color: ${isThirdAttempt ? '#dc2626' : '#2563eb'}; font-weight: bold;">${newStatus}</span></p>
             ${isThirdAttempt ? '<p style="color: #dc2626; font-weight: bold;">⚠️ 3rd Attempt reached. Automatically escalated directly to Admin Office.</p>' : ''}
             <hr/>
             <p><em>Dispatched via Gmail System: ${GMAIL_ADDRESS}</em></p>`,
      issueId,
      eventType: 'ISSUE_REOPENED'
    });

    res.json({ success: true, status: newStatus, isThirdAttempt });
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
  const { mentorId, sessionDate, studentsAttended, topic, notes, whichClass, location } = req.body;
  if (!mentorId || !sessionDate || !topic) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    await query(
      `INSERT INTO mentor_session_records (mentor_id, session_date, students_attended, topic, notes, which_class, location)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [mentorId, sessionDate, parseInt(studentsAttended) || 0, topic, notes || '', whichClass || '6th Sem CSE-A', location || 'Seminar Hall 1 (Admin Block)']
    );

    await logSystemEvent(`Mentor ${mentorId} submitted session report for ${whichClass || 'Class'}: ${topic}`, 'Mentor', mentorId);
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Error logging mentor session record:', err);
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
