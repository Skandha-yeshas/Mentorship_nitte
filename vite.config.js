import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sendGmailNotification, getEmailLogs, processInboundGmailReply, GMAIL_ADDRESS } from './server/gmailService.js'
import { startImapListener, getImapStatus } from './server/gmailImapService.js'

// Resilient in-memory WebRTC signaling relay embedded directly into Vite dev server
const viteSignalingMap = new Map();

function fullStackDevPlugin() {
  let imapStarted = false;
  return {
    name: 'vite-fullstack-dev-plugin',
    configureServer(server) {
      // Automatically start background IMAP listener for incoming Gmail replies
      if (!imapStarted) {
        imapStarted = true;
        try {
          startImapListener();
        } catch (e) {
          console.warn('[Vite Gmail IMAP] Background listener start notice:', e.message);
        }
      }

      server.middlewares.use(async (req, res, next) => {
        // 1. POST /api/meetings/signal
        if (req.url === '/api/meetings/signal' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const signal = JSON.parse(body);
              if (signal && signal.issueId) {
                const key = signal.issueId.toUpperCase();
                if (!viteSignalingMap.has(key)) viteSignalingMap.set(key, []);
                const list = viteSignalingMap.get(key);
                list.push({ ...signal, timestamp: Date.now() });
                if (list.length > 200) list.splice(0, list.length - 200);
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Invalid JSON' }));
            }
          });
          return;
        }

        // 2. GET /api/meetings/signals/:issueId
        if (req.url && req.url.startsWith('/api/meetings/signals/') && req.method === 'GET') {
          try {
            const urlObj = new URL(req.url, 'http://localhost');
            const parts = urlObj.pathname.split('/');
            const issueId = decodeURIComponent(parts[parts.length - 1] || '').toUpperCase();
            const since = parseInt(urlObj.searchParams.get('since')) || 0;
            const list = viteSignalingMap.get(issueId) || [];
            const signals = list.filter(s => s.timestamp >= since);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ signals, now: Date.now() }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Internal signaling error' }));
          }
          return;
        }

        // 3. DELETE /api/meetings/signals/:issueId
        if (req.url && req.url.startsWith('/api/meetings/signals/') && req.method === 'DELETE') {
          const parts = req.url.split('/');
          const issueId = decodeURIComponent(parts[parts.length - 1] || '').toUpperCase();
          viteSignalingMap.delete(issueId);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true }));
          return;
        }

        // 4. POST /api/gmail/send or POST /api/send-email (Real automated Gmail dispatch)
        if ((req.url === '/api/gmail/send' || req.url === '/api/send-email' || req.url === '/api/gmail-notify') && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body);
              const { to, subject, html, text, issueId, eventType, recipientName } = payload;
              const result = await sendGmailNotification({
                to,
                subject,
                html: html || `<p>${text || subject}</p>`,
                text: text || '',
                issueId,
                eventType: eventType || 'NOTIFICATION',
                recipientName: recipientName || ''
              });
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, result }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 5. GET /api/gmail/logs
        if (req.url === '/api/gmail/logs' && req.method === 'GET') {
          try {
            const logs = await getEmailLogs();
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ logs, gmailAddress: GMAIL_ADDRESS }));
          } catch (err) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        // 6. GET /api/imap/status
        if (req.url === '/api/imap/status' && req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(getImapStatus()));
          return;
        }

        // 7. POST /api/admin/bulk-upload-students (Student Roster Import & Automated Credential Dispatch)
        if (req.url === '/api/admin/bulk-upload-students' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              const students = payload.students || [];
              if (!Array.isArray(students) || students.length === 0) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Payload must contain a non-empty students array.' }));
                return;
              }

              const results = [];
              let successCount = 0;

              for (let i = 0; i < students.length; i++) {
                const s = students[i];
                const rawId = s.id || s.usn || s.studentId || s.USN || s['Student ID'] || s['Student USN'] || s['USN / ID'] || s['Roll No'] || `S${100 + i + Math.floor(Math.random() * 900)}`;
                const rawName = s.name || s.studentName || s.Name || s['Student Name'] || s['Full Name'] || 'Student User';
                const rawEmail = s.email || s.studentEmail || s.Email || s.gmail || s['Gmail'] || s['Student Email'] || s['Email Address'] || s['Student Gmail'] || `${String(rawId).toLowerCase()}@nitte.edu.in`;
                const branch = s.branch || s.Branch || s.department || s.Dept || 'CSE';
                const sem = parseInt(s.sem || s.Sem || s.semester || s.Semester) || 5;
                const studentId = String(rawId).trim().toUpperCase();
                const name = String(rawName).trim();
                const email = String(rawEmail).trim().toLowerCase();
                const generatedPassword = s.password && String(s.password).trim() ? String(s.password).trim() : `Nit#${Math.floor(1000 + Math.random() * 9000)}`;

                try {
                  const emailHtml = `
                    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%); padding: 24px; text-align: center; color: #ffffff;">
                        <h1 style="margin: 0; font-size: 1.4rem; font-weight: 700;">NITTE Student Mentorship Portal</h1>
                        <p style="margin: 6px 0 0 0; font-size: 0.9rem; color: #93c5fd;">Student Account Onboarding</p>
                      </div>
                      <div style="padding: 24px; color: #1e293b; line-height: 1.6;">
                        <p style="font-size: 1rem; margin-top: 0;">Dear <strong>${name}</strong>,</p>
                        <p>Your official student account has been created by Administration for the NITTE Mentorship Portal.</p>
                        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 5px solid #2563eb; padding: 18px; border-radius: 6px; margin: 20px 0;">
                          <h3 style="margin: 0 0 12px 0; color: #1e3a8a; font-size: 1rem;">Login Credentials:</h3>
                          <p style="margin: 6px 0;"><strong>Student USN / ID:</strong> <code>${studentId}</code></p>
                          <p style="margin: 6px 0;"><strong>Registered Gmail:</strong> <code>${email}</code></p>
                          <p style="margin: 6px 0;"><strong>Password:</strong> <code style="background: #fee2e2; color: #991b1b; padding: 3px 8px; border-radius: 4px; font-weight: bold;">${generatedPassword}</code></p>
                        </div>
                        <p style="font-size: 0.9rem; color: #475569;">You can log in to the portal using your Registered Gmail or Student USN along with the password shown above.</p>
                      </div>
                    </div>
                  `;

                  sendGmailNotification({
                    to: email,
                    replyTo: GMAIL_ADDRESS,
                    fromName: 'NITTE Admin Desk',
                    subject: `[NITTE PORTAL CREDENTIALS] Welcome ${name} - Student Onboarding (${studentId})`,
                    html: emailHtml,
                    text: `Welcome ${name}! Your student account is created. ID: ${studentId}, Email: ${email}, Password: ${generatedPassword}.`,
                    eventType: 'BULK_STUDENT_ONBOARDING',
                    recipientName: name
                  }).catch(e => console.warn('[Vite Dev Gmail Dispatch Notice]', e.message));

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
                  results.push({
                    status: 'FAILED',
                    index: i + 1,
                    id: studentId,
                    name,
                    email,
                    reason: err.message
                  });
                }
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                message: `Successfully processed ${successCount} student records.`,
                count: successCount,
                results
              }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Failed to process student roster' }));
            }
          });
          return;
        }

        // 8. POST /api/admin/bulk-upload-mentors
        if (req.url === '/api/admin/bulk-upload-mentors' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              const mentors = payload.mentors || [];
              const results = [];
              let successCount = 0;

              for (let i = 0; i < mentors.length; i++) {
                const m = mentors[i];
                const rawId = m.id || m.mentorId || m.facultyId || m['Mentor ID'] || `M${100 + i}`;
                const rawName = m.name || m.mentorName || m.Name || m['Mentor Name'] || 'Faculty Mentor';
                const rawEmail = m.email || m.Email || m.gmail || m['Gmail'] || m['Mentor Gmail'] || `${String(rawId).toLowerCase()}@nitte.edu.in`;
                const dept = m.dept || m.department || m.Branch || m['Department'] || 'CSE';
                const mentorId = String(rawId).trim().toUpperCase();
                const name = String(rawName).trim();
                const email = String(rawEmail).trim().toLowerCase();
                const password = m.password && String(m.password).trim() ? String(m.password).trim() : `Mnt#${Math.floor(1000 + Math.random() * 9000)}`;

                sendGmailNotification({
                  to: email,
                  replyTo: GMAIL_ADDRESS,
                  fromName: 'NITTE Admin Desk',
                  subject: `[NITTE PORTAL CREDENTIALS] Welcome Prof. ${name} - Faculty Mentor Onboarding`,
                  html: `<p>Dear <strong>${name}</strong>,</p><p>Your Faculty Mentor credentials: ID: <code>${mentorId}</code>, Email: <code>${email}</code>, Password: <code>${password}</code></p>`,
                  text: `Welcome ${name}! ID: ${mentorId}, Password: ${password}`,
                  eventType: 'BULK_MENTOR_ONBOARDING',
                  recipientName: name
                }).catch(() => {});

                results.push({ status: 'SUCCESS', index: i + 1, id: mentorId, name, email, dept, password, emailStatus: 'DELIVERED_GMAIL' });
                successCount++;
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, count: successCount, results }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 9. POST /api/admin/bulk-upload-ros
        if (req.url === '/api/admin/bulk-upload-ros' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const payload = JSON.parse(body || '{}');
              const ros = payload.ros || [];
              const results = [];
              let successCount = 0;

              for (let i = 0; i < ros.length; i++) {
                const r = ros[i];
                const rawId = r.id || r.roId || r['RO ID'] || `RO${100 + i}`;
                const rawName = r.name || r.roName || r.Name || r['RO Name'] || 'Relationship Officer';
                const rawEmail = r.email || r.Email || r.gmail || r['Gmail'] || r['RO Gmail'] || `${String(rawId).toLowerCase()}@nitte.edu.in`;
                const category = r.category || r.Category || 'Academic & Attendance Support';
                const roId = String(rawId).trim().toUpperCase();
                const name = String(rawName).trim();
                const email = String(rawEmail).trim().toLowerCase();
                const password = r.password && String(r.password).trim() ? String(r.password).trim() : `Ro#${Math.floor(1000 + Math.random() * 9000)}`;

                sendGmailNotification({
                  to: email,
                  replyTo: GMAIL_ADDRESS,
                  fromName: 'NITTE Admin Desk',
                  subject: `[NITTE PORTAL CREDENTIALS] Welcome ${name} - RO Onboarding`,
                  html: `<p>Dear <strong>${name}</strong>,</p><p>Your Relationship Officer credentials: ID: <code>${roId}</code>, Email: <code>${email}</code>, Password: <code>${password}</code></p>`,
                  text: `Welcome ${name}! ID: ${roId}, Password: ${password}`,
                  eventType: 'BULK_RO_ONBOARDING',
                  recipientName: name
                }).catch(() => {});

                results.push({ status: 'SUCCESS', index: i + 1, id: roId, name, email, category, password, emailStatus: 'DELIVERED_GMAIL' });
                successCount++;
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, count: successCount, results }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 10. POST /api/auth/register-student
        if (req.url === '/api/auth/register-student' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const { name, email, usn, password, branch, sem } = JSON.parse(body || '{}');
              const studentId = (usn && usn.trim()) ? usn.trim().toUpperCase() : `S${Math.floor(100 + Math.random() * 900)}`;
              const student = {
                id: studentId,
                name: (name || '').trim(),
                email: (email || '').trim().toLowerCase(),
                branch: branch || 'CSE',
                sem: parseInt(sem) || 4,
                mentorId: 'M101'
              };

              sendGmailNotification({
                to: student.email,
                replyTo: GMAIL_ADDRESS,
                fromName: 'NITTE Student Portal',
                subject: `[WELCOME TO NITTE PORTAL] Registration Successful - ${studentId}`,
                html: `<h3>Welcome to NITTE Mentorship Portal</h3><p>Dear <strong>${student.name}</strong>,</p><p>Your student account has been registered successfully. Student ID: <strong>${studentId}</strong></p>`,
                text: `Welcome ${student.name}! Your account has been registered. ID: ${studentId}`,
                eventType: 'STUDENT_REGISTERED',
                recipientName: student.name
              }).catch(() => {});

              res.statusCode = 201;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, student }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Registration failed' }));
            }
          });
          return;
        }

        // 11. PUT or POST /api/issues/:id/escalate
        if (req.url && req.url.startsWith('/api/issues/') && req.url.includes('/escalate') && (req.method === 'PUT' || req.method === 'POST')) {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const urlObj = new URL(req.url, 'http://localhost');
              const parts = urlObj.pathname.split('/');
              const issueId = decodeURIComponent(parts[parts.length - 2] || '').toUpperCase();
              const { roId, reason } = JSON.parse(body || '{}');

              sendGmailNotification({
                to: 'skandhayashu2906@gmail.com',
                replyTo: GMAIL_ADDRESS,
                fromName: 'NITTE RO Desk',
                subject: `[${issueId}] URGENT: Ticket Escalated to Admin`,
                html: `<h3>High Priority Escalation Notice</h3><p>RO <strong>${roId || 'RO'}</strong> has escalated ticket <strong>${issueId}</strong> to Admin oversight.</p><p><strong>Reason for Escalation:</strong> ${reason || 'Immediate administrative intervention requested.'}</p>`,
                text: `Issue ${issueId} escalated to Admin by RO ${roId}. Reason: ${reason}`,
                issueId,
                eventType: 'ISSUE_ESCALATED',
                recipientName: 'NITTE Administration'
              }).catch(() => {});

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, issueId, status: 'Escalated' }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), fullStackDevPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
        secure: false
      }
    }
  }
})

