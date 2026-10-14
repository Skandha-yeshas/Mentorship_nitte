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
              const { to, subject, html, text, issueId, eventType, recipientName, replyTo, fromName } = payload;
              const result = await sendGmailNotification({
                to,
                subject,
                html: html || `<p>${text || subject}</p>`,
                text: text || '',
                issueId,
                eventType: eventType || 'NOTIFICATION',
                recipientName: recipientName || '',
                replyTo: replyTo || null,
                fromName: fromName || 'NITTE Mentorship System'
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
                  const portalBaseUrl = req.headers.host ? `http://${req.headers.host}` : 'http://localhost:5173';
                  const directLoginUrl = `${portalBaseUrl}/?role=Student&id=${encodeURIComponent(studentId)}&pwd=${encodeURIComponent(generatedPassword)}`;

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
                      ⚡ Pre-fills your USN & password on the login page. Simply click "Sign In" to enter.
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
                This is an automated credential notification. Please keep your credentials confidential.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

                  let emailDeliveryStatus = 'DELIVERED_GMAIL';
                  try {
                    await sendGmailNotification({
                      to: email,
                      replyTo: GMAIL_ADDRESS,
                      fromName: 'NITTE Admin Desk',
                      subject: `[NITTE PORTAL CREDENTIALS] Welcome ${name} - Student Onboarding (${studentId})`,
                      html: emailHtml,
                      text: `Welcome ${name}! Your student account is created. ID: ${studentId}, Email: ${email}, Password: ${generatedPassword}. Log in directly at: ${directLoginUrl}`,
                      eventType: 'BULK_STUDENT_ONBOARDING',
                      recipientName: name
                    });
                  } catch (e) {
                    console.warn('[Vite Dev Gmail Dispatch Notice]', e.message);
                    emailDeliveryStatus = 'DISPATCHED_LOCAL';
                  }

                  results.push({
                    status: 'SUCCESS',
                    index: i + 1,
                    id: studentId,
                    name,
                    email,
                    branch,
                    sem,
                    password: generatedPassword,
                    emailStatus: emailDeliveryStatus
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

        // 9b. POST /api/admin/assign-students-to-mentor
        if (req.url === '/api/admin/assign-students-to-mentor' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { mentorId, studentIdsToAssign = [] } = JSON.parse(body || '{}');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, mentorId, count: studentIdsToAssign.length }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 9c. POST /api/admin/delete-student
        if (req.url === '/api/admin/delete-student' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { studentId } = JSON.parse(body || '{}');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, studentId }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        // 9d. POST /api/admin/delete-mentor
        if (req.url === '/api/admin/delete-mentor' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', () => {
            try {
              const { mentorId } = JSON.parse(body || '{}');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, mentorId }));
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

        // 10b. POST /api/auth/login
        if (req.url === '/api/auth/login' && req.method === 'POST') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const { id, email, password, role } = JSON.parse(body || '{}');
              const loginIdentifier = (email || id || '').trim();

              if (!loginIdentifier || !password) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Email / User ID and Password are required.' }));
                return;
              }

              if (role === 'Admin' || loginIdentifier.toUpperCase() === 'ADMIN' || loginIdentifier.toLowerCase() === 'admin@nitte.edu.in') {
                if (password.trim() === 'Admin@2026' || password.trim() === 'Nitte@2026') {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, user: { id: 'ADMIN', name: 'Administrator', role: 'Admin', email: 'admin@nitte.edu.in' } }));
                  return;
                } else {
                  res.statusCode = 401;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: 'Incorrect Admin password.' }));
                  return;
                }
              }

              // Let DatabaseContext handle client state validation
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Fallback to client institutional validator' }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
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
              const { roId, reason, isReEscalated } = JSON.parse(body || '{}');

              // Forward to backend PostgreSQL server if running
              try {
                fetch(`http://localhost:5001/api/issues/${issueId}/escalate`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ roId, reason, isReEscalated })
                }).catch(() => {});
              } catch (e) {}

              sendGmailNotification({
                to: 'skandhayashu2906@gmail.com',
                replyTo: GMAIL_ADDRESS,
                fromName: 'NITTE RO Desk',
                subject: `[${issueId}] URGENT: Ticket ${isReEscalated ? 'RE-ESCALATED' : 'Escalated'} to Admin`,
                html: `<h3>High Priority ${isReEscalated ? 'Re-Escalation' : 'Escalation'} Notice</h3><p>RO <strong>${roId || 'RO'}</strong> has ${isReEscalated ? 're-escalated' : 'escalated'} ticket <strong>${issueId}</strong> to Admin oversight.</p><p><strong>Reason / Directive:</strong> ${reason || 'Immediate administrative intervention requested.'}</p>`,
                text: `Issue ${issueId} ${isReEscalated ? 're-escalated' : 'escalated'} to Admin by RO ${roId}. Reason: ${reason}`,
                issueId,
                eventType: isReEscalated ? 'ISSUE_RE_ESCALATED' : 'ISSUE_ESCALATED',
                recipientName: 'NITTE Administration'
              }).catch(() => {});

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, issueId, status: 'Escalated', isReEscalated: !!isReEscalated }));
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

