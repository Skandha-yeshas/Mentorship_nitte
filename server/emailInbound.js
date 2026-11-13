import { createHash } from 'node:crypto';
import { normalizeEmail, recipientProblem } from './emailAddress.js';

export function createInboundEmailProcessor({ query, sender, allowLegacy = false }) {
  return async ({ senderEmail, senderName = 'Portal user', issueId, replyText, messageId }) => {
    const email = normalizeEmail(senderEmail);
    if (recipientProblem(email, { allowLegacy })) return { success: false, reason: 'Sender address is not eligible for ticket replies.' };
    const row = (await query(`SELECT i.id, i.ticket_number, s.email AS student_email, r.email AS ro_email FROM issues i
      LEFT JOIN students s ON s.id = i.student_id LEFT JOIN ros r ON r.id = i.ro_id
      WHERE UPPER(i.id) = UPPER($1) OR UPPER('GRV-' || LPAD(i.ticket_number::text, GREATEST(6, LENGTH(i.ticket_number::text)), '0')) = UPPER($1)`, [issueId])).rows[0];
    if (!row) return { success: false, reason: 'Ticket not found.' };
    const participant = [row.student_email, row.ro_email].some(value => normalizeEmail(value) === email);
    if (!participant && !(await query('SELECT id FROM admins WHERE LOWER(email) = $1', [email])).rows.length) return { success: false, reason: 'Sender does not belong to this ticket.' };
    const text = String(replyText || '').slice(0, 2000);
    const key = createHash('sha256').update(`inbound:${messageId || `${row.id}:${email}:${text}`}`).digest('hex');
    const event = { text: `Email reply from ${senderName} (${email}): "${text}"`, time: new Date().toISOString(), eventType: 'EMAIL_REPLY', id: `mail-reply:${key}` };
    // Claim the message and append the ticket action atomically; a failed append can be retried safely.
    const saved = await query(`WITH incoming AS (
      INSERT INTO email_logs (direction, sender, recipient, recipient_email, recipient_name, subject, body, event_type, issue_id, status, notification_key)
      VALUES ('INBOUND', $1, $2::text, $2::text, 'Institutional support inbox', $3, $4, 'GMAIL_REPLY', $5, 'RECEIVED', $6)
      ON CONFLICT (notification_key) DO NOTHING RETURNING id
    ) UPDATE issues SET logs = COALESCE(logs, '[]'::jsonb) || $7::jsonb
      WHERE id = $5 AND EXISTS (SELECT 1 FROM incoming) RETURNING id`,
    [email, sender, `Re: [GRV-${String(row.ticket_number).padStart(6, '0')}] Portal reply`, text, row.id, key, JSON.stringify([event])]);
    return { success: true, duplicate: !saved.rows.length, issueId: row.id };
  };
}
