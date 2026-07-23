import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb, query, dropAllTables, seedTables } from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Initialize Database on server start
initDb();

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
    const studentsRes = await query(`SELECT id, name, email, mentor_id AS "mentorId", ro_id AS "roId", phone, branch, sem FROM students`);
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
    const meetingsRes = await query(`SELECT id, issue_id AS "issueId", student_id AS "studentId", student_name AS "studentName", ro_id AS "roId", date, time, mode, status FROM meetings`);
    const sessionsRes = await query(`SELECT id, mentor_id AS "mentorId", mentor_name AS "mentorName", title, date_time AS "dateTime", description, link FROM group_sessions ORDER BY date_time ASC`);
    const resourcesRes = await query(`SELECT id, mentor_id AS "mentorId", title, type, content, date_shared AS "dateShared" FROM resources ORDER BY date_shared DESC`);
    const logsRes = await query(`SELECT id, text, timestamp, user_role AS "userRole", user_id AS "userId" FROM system_logs ORDER BY timestamp DESC LIMIT 100`);

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
      systemLogs: logsRes.rows
    });
  } catch (err) {
    console.error('Error fetching database state:', err);
    res.status(500).json({ error: 'Database query failed' });
  }
});

// 2. SUBMIT AN ISSUE
app.post('/api/issues', async (req, res) => {
  const { studentId, category, description, priority, roId, studentName } = req.body;
  if (!studentId || !category || !description || !priority) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const issueId = `ISS-${Math.floor(100 + Math.random() * 900)}`;
  const timestamp = new Date().toISOString();
  const initialLogs = JSON.stringify([{ text: `Issue submitted by ${studentName}`, time: timestamp }]);

  try {
    await query(
      `INSERT INTO issues (id, student_id, student_name, category, description, priority, status, ro_id, created_at, logs)
       VALUES ($1, $2, $3, $4, $5, $6, 'Assigned to RO', $7, $8, $9)`,
      [issueId, studentId, studentName, category, description, priority, roId, timestamp, initialLogs]
    );

    await logSystemEvent(`Student ${studentName} submitted a new issue: ${category}`, 'Student', studentId);
    res.status(201).json({ id: issueId });
  } catch (err) {
    console.error('Error submitting issue:', err);
    res.status(500).json({ error: 'Failed to submit issue' });
  }
});

// 3. BOOK A MEETING
app.post('/api/meetings', async (req, res) => {
  const { issueId, studentId, studentName, roId, date, time, mode } = req.body;
  if (!issueId || !studentId || !roId || !date || !time) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const meetId = `MEET-${Math.floor(100 + Math.random() * 900)}`;
  const timestamp = new Date().toISOString();
  const logMessage = `Meeting scheduled with RO for ${date} at ${time} (${mode})`;

  try {
    // Add meeting record
    await query(
      `INSERT INTO meetings (id, issue_id, student_id, student_name, ro_id, date, time, mode, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending')`,
      [meetId, issueId, studentId, studentName, roId, date, time, mode]
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

    await logSystemEvent(`Student ${studentName} booked a meeting slot on ${date} at ${time}`, 'Student', studentId);
    res.status(201).json({ id: meetId });
  } catch (err) {
    console.error('Error booking meeting:', err);
    res.status(500).json({ error: 'Failed to book meeting' });
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
    res.json({ success: true });
  } catch (err) {
    console.error('Error resolving issue:', err);
    res.status(500).json({ error: 'Failed to resolve issue' });
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
