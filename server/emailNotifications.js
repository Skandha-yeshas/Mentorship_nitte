import { normalizeEmail, recipientProblem, escapeEmailHtml } from './emailAddress.js';
import { formatTicketNumber } from '../shared/ticketNumber.js';

const audiences = { ISSUE_SUBMITTED_TO_RO: 'ro', ISSUE_SUBMITTED_STUDENT_CONFIRM: 'student',
  MEETING_SCHEDULED: 'student', MEETING_RESCHEDULED: 'student', ADMIN_MEETING_SCHEDULED: 'student',
  ISSUE_RESOLVED: 'student', ADMIN_ISSUE_RESOLVED: 'student', ISSUE_REOPENED: 'ro', FEEDBACK_SUBMITTED: 'ro',
  ISSUE_ESCALATED: 'admin', ISSUE_RE_ESCALATED: 'admin', ISSUE_REASSIGNED: 'ro' };
const titles = { ISSUE_SUBMITTED_TO_RO: 'New student issue assigned to you', ISSUE_SUBMITTED_STUDENT_CONFIRM: 'Your issue was submitted',
  MEETING_SCHEDULED: 'Meeting scheduled', MEETING_RESCHEDULED: 'Meeting rescheduled', ADMIN_MEETING_SCHEDULED: 'Administrative hearing scheduled',
  ISSUE_RESOLVED: 'Your issue was resolved', ADMIN_ISSUE_RESOLVED: 'Your issue was resolved by Administration', ISSUE_REOPENED: 'Student reopened an issue',
  FEEDBACK_SUBMITTED: 'Student feedback received', ISSUE_ESCALATED: 'Issue escalated to Administration', ISSUE_RE_ESCALATED: 'Updated escalation to Administration', ISSUE_REASSIGNED: 'An issue was reassigned to you' };

export function extractEmailIssueId(subject, body = '') {
  const pattern = /\b(?:GRV-\d+|ISS-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|(?:ISS|TICK)-\d+)(?![a-z0-9-])/i;
  return (String(subject).match(pattern)?.[0] || String(body).match(pattern)?.[0] || '').toUpperCase() || null;
}

export function createEmailNotifications({ query, send, portalUrl = '', allowLegacy = false }) {
  async function issue(issueId, eventType, details = {}) {
    if (!audiences[eventType]) throw new Error('Unsupported issue notification.');
    const rows = await query(`SELECT i.id, i.ticket_number, i.category, i.priority, i.student_id, i.ro_id,
      s.name AS student_name, s.email AS student_email, r.name AS ro_name, r.email AS ro_email
      FROM issues i LEFT JOIN students s ON s.id = i.student_id LEFT JOIN ros r ON r.id = i.ro_id
      WHERE UPPER(i.id) = UPPER($1)`, [issueId]);
    const row = rows.rows[0];
    if (!row) return [await send({ to: '', issueId, eventType, subject: `${titles[eventType]} [${issueId}]`, routingFailure: 'Ticket not found; recipient could not be verified.' })];
    const ticketNumber = formatTicketNumber(row);
    let recipients = audiences[eventType] === 'student' ? [{ id: row.student_id, name: row.student_name, email: row.student_email }]
      : audiences[eventType] === 'ro' ? [{ id: row.ro_id, name: row.ro_name, email: row.ro_email }]
        : (await query('SELECT id, name, email FROM admins ORDER BY id')).rows;
    if (!recipients.length) recipients = [{ email: '', name: 'Administration' }];
    const seen = new Set();
    const results = [];
    for (const recipient of recipients) {
      const email = normalizeEmail(recipient.email);
      if (seen.has(email)) continue; seen.add(email);
      const lines = [`Dear ${recipient.name || 'Portal user'},`, '', titles[eventType], `Ticket: ${ticketNumber}`, `Category: ${row.category || ''}`,
        `Student: ${row.student_name || row.student_id}`, `Assigned RO: ${row.ro_name || row.ro_id || 'Not assigned'}`];
      if (details.date) lines.push(`Date: ${details.date}`, `Time: ${details.time || ''}`, `Mode: ${details.mode || 'Offline'}`, `Location: ${details.location || ''}`);
      if (details.notes) lines.push(`Notes: ${details.notes}`);
      if (details.reason) lines.push(`Reason: ${details.reason}`);
      if (details.resolutionNotes) lines.push(`Resolution: ${details.resolutionNotes}`);
      if (details.rating !== undefined) lines.push(`Rating: ${details.rating}/5`, `Comments: ${details.comments || ''}`);
      lines.push('', 'Sign in to the mentorship portal to review this ticket.');
      if (portalUrl) lines.push(portalUrl);
      const text = lines.join('\n');
      results.push(await send({ to: email, recipientName: recipient.name, issueId: row.id, eventType,
        recipientBinding: { role: { student: 'Student', ro: 'RO', admin: 'Admin' }[audiences[eventType]], id: recipient.id },
        notificationKey: details.notificationKey, subject: `[${ticketNumber}] ${titles[eventType]}`, text,
        html: `<p style="white-space:pre-wrap">${escapeEmailHtml(text)}</p>` }));
    }
    return results;
  }

  async function mentor(mentorId, kind, schedule = {}, notificationKey) {
    if (!['schedule', 'deadline'].includes(kind)) throw Object.assign(new Error('Choose a schedule or deadline notification.'), { status: 400 });
    const row = (await query('SELECT id, name, email, class FROM mentors WHERE UPPER(id) = UPPER($1)', [mentorId])).rows[0];
    if (!row) throw Object.assign(new Error('Mentor not found.'), { status: 404 });
    const date = String(schedule.date || '').slice(0, 30);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Object.assign(new Error('Choose a valid session date.'), { status: 400 });
    const subject = kind === 'deadline' ? `Mentoring report reminder (${date})` : `Mentoring session schedule (${date})`;
    const text = `Dear ${row.name},\n\n${subject}\nDate: ${date}\nTime: ${String(schedule.time || '').slice(0, 100)}\nClass: ${row.class || ''}\n\n${kind === 'deadline' ? 'Please review and submit your pending mentoring session report.' : 'Please review your mentoring session schedule in the portal.'}${portalUrl ? '\n' + portalUrl : ''}`;
    return send({ to: row.email, recipientName: row.name, mentorId: row.id, subject, text,
      recipientBinding: { role: 'Mentor', id: row.id },
      eventType: kind === 'deadline' ? 'MENTOR_DEADLINE_REMINDER' : 'MENTOR_SCHEDULE_NOTICE', notificationKey });
  }

  async function customRecipient(to, issueId) {
    if (recipientProblem(to, { allowLegacy })) return false;
    const email = normalizeEmail(to);
    if (issueId) {
      const row = (await query(`SELECT s.email AS student_email, r.email AS ro_email FROM issues i
        LEFT JOIN students s ON s.id = i.student_id LEFT JOIN ros r ON r.id = i.ro_id WHERE UPPER(i.id) = UPPER($1)`, [issueId])).rows[0];
      if (!row) return false;
      if ([row.student_email, row.ro_email].some(value => normalizeEmail(value) === email)) return true;
      return (await query('SELECT id FROM admins WHERE LOWER(email) = $1', [email])).rows.length > 0;
    }
    return (await query(`SELECT id FROM students WHERE LOWER(email) = $1 UNION ALL SELECT id FROM mentors WHERE LOWER(email) = $1
      UNION ALL SELECT id FROM ros WHERE LOWER(email) = $1 UNION ALL SELECT id FROM admins WHERE LOWER(email) = $1 LIMIT 1`, [email])).rows.length > 0;
  }
  return { issue, mentor, customRecipient };
}
