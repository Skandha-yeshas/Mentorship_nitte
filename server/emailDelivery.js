import { createHash, randomUUID } from 'node:crypto';
import { normalizeEmail, recipientProblem, escapeEmailHtml } from './emailAddress.js';

export async function initializeEmailSchema(query) {
  await query('ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS notification_key CHAR(64)');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS email_logs_notification_key_idx ON email_logs (notification_key)');
  await query('ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS delivery_reason TEXT');
  await query('ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS mentor_id VARCHAR(50)');
  await query('ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient_email VARCHAR(150)');
  await query('ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(200)');
  await query('ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS queued_payload TEXT');
  await query('ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()');
  await query('ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0');
  await query('ALTER TABLE email_logs ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ');
  await query('CREATE INDEX IF NOT EXISTS email_logs_queue_idx ON email_logs (status, next_attempt_at)');
  await query("ALTER TABLE email_logs ALTER COLUMN status SET DEFAULT 'PENDING'");
  const idColumn = (await query(`SELECT format_type(a.atttypid, a.atttypmod) AS type, pg_get_expr(d.adbin, d.adrelid) AS default_value
    FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'email_logs'::regclass AND a.attname = 'id'`)).rows[0];
  if (idColumn && /^(character varying|text)/.test(idColumn.type) && !idColumn.default_value) {
    await query('ALTER TABLE email_logs ALTER COLUMN id SET DEFAULT gen_random_uuid()::text');
  }
  for (const table of ['students', 'ros']) await query(`ALTER TABLE ${table} ALTER COLUMN email DROP DEFAULT`);
}

export function createEmailDelivery({ query, getTransporter, sender, enabled, allowLegacy = false, configurationProblem = () => null, rememberFailure = () => {}, queueCipher = null }) {
  return async function send(message) {
    const to = normalizeEmail(message.to);
    const subject = String(message.subject || 'Portal notification').replace(/[\r\n]/g, ' ').slice(0, 300);
    const text = String(message.text || String(message.html || '').replace(/<[^>]+>/g, ' '));
    const key = createHash('sha256').update(`${message.notificationKey || randomUUID()}|${to}`).digest('hex');
    const record = { direction: 'OUTBOUND', sender, recipient: to, subject,
      body: /ONBOARDING|CREDENTIALS/.test(message.eventType || '') ? 'Account notification. Initial credentials omitted from the audit log.' : text,
      eventType: message.eventType || 'NOTIFICATION', issueId: message.issueId || null, mentorId: message.mentorId || null,
      status: 'PENDING', createdAt: new Date().toISOString(), deliveryReason: null };
    const problem = message.routingFailure || recipientProblem(message.to, { allowLegacy });
    if (problem) { record.status = 'SKIPPED_INVALID_RECIPIENT'; record.deliveryReason = problem; }
    else if (!enabled()) { record.status = 'SKIPPED_DISABLED'; record.deliveryReason = 'Email delivery is disabled.'; }
    else if (recipientProblem(sender, { allowLegacy })) { record.status = 'SKIPPED_UNCONFIGURED'; record.deliveryReason = 'A valid institutional sender must be configured.'; }
    else if (configurationProblem()) { record.status = 'SKIPPED_UNCONFIGURED'; record.deliveryReason = configurationProblem(); }
    if (queueCipher && record.status === 'PENDING') { record.status = 'QUEUED'; record.deliveryReason = 'Waiting for background delivery.'; }
    const payload = queueCipher && !problem ? queueCipher.seal({ ...message, to, subject, text }) : null;
    let claimed;
    try {
      const saved = await query(`INSERT INTO email_logs
        (direction, sender, recipient, recipient_email, recipient_name, subject, body, event_type, issue_id, mentor_id, status, notification_key, delivery_reason, queued_payload)
        VALUES ('OUTBOUND', $1, $2::text, $2::text, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (notification_key) DO NOTHING RETURNING id, created_at AS "createdAt"`,
      [sender, to, String(message.recipientName || to).slice(0, 200), subject, record.body, record.eventType, record.issueId, record.mentorId, record.status, key, record.deliveryReason, payload]);
      claimed = saved.rows[0];
      if (!claimed) {
        const existing = (await query('SELECT id, status, delivery_reason AS "deliveryReason" FROM email_logs WHERE notification_key = $1', [key])).rows[0];
        return { ...record, ...existing, duplicate: true };
      }
    } catch {
      const failure = { ...record, id: `mail-failed-${randomUUID()}`, status: 'FAILED', deliveryReason: 'Email log could not be saved. No message was sent.' };
      rememberFailure(failure); return failure;
    }
    Object.assign(record, claimed);
    if (record.status !== 'PENDING') return record;
    try {
      const transporter = getTransporter();
      if (!transporter) { record.status = 'SKIPPED_UNCONFIGURED'; record.deliveryReason = 'Institutional mail credentials are not configured.'; }
      else {
        const result = await transporter.sendMail({
          from: { name: String(message.fromName || 'Smart Mentorship & Grievance Portal').replace(/[\r\n]/g, ' '), address: sender },
          to, replyTo: sender, subject, text,
          html: message.html || `<p style="white-space:pre-wrap">${escapeEmailHtml(text)}</p>`,
          disableFileAccess: true, disableUrlAccess: true
        });
        const accepted = (result.accepted || []).some(address => normalizeEmail(typeof address === 'string' ? address : address.address) === to);
        record.status = accepted ? 'DELIVERED_GMAIL' : 'FAILED';
        record.deliveryReason = accepted ? 'Accepted by the mail server; inbox receipt is not confirmed.' : 'The mail server did not accept this recipient.';
      }
    } catch { record.status = 'FAILED'; record.deliveryReason = 'The mail server could not accept the message. Check the mail service configuration.'; }
    try { await query('UPDATE email_logs SET status = $1, delivery_reason = $2 WHERE id = $3', [record.status, record.deliveryReason, record.id]); }
    catch {
      record.status = 'DELIVERY_UNKNOWN'; record.deliveryReason = 'The final mail status could not be saved. Check the provider before retrying.';
      rememberFailure(record);
    }
    return record;
  };
}

export async function deliverQueuedMessage(message, { getTransporter, sender, allowLegacy = false }) {
  const problem = recipientProblem(message.to, { allowLegacy }) || recipientProblem(sender, { allowLegacy });
  if (problem) return { status: 'SKIPPED_INVALID_RECIPIENT', reason: problem };
  try {
    const transporter = getTransporter();
    if (!transporter) return { status: 'SKIPPED_UNCONFIGURED', reason: 'Institutional mail credentials are not configured.' };
    const result = await transporter.sendMail({ from: { name: String(message.fromName || 'Smart Mentorship & Grievance Portal').replace(/[\r\n]/g, ' '), address: sender },
      to: normalizeEmail(message.to), replyTo: sender, subject: String(message.subject).replace(/[\r\n]/g, ' ').slice(0, 300),
      text: message.text, html: message.html || `<p style="white-space:pre-wrap">${escapeEmailHtml(message.text)}</p>`, disableFileAccess: true, disableUrlAccess: true });
    const accepted = (result.accepted || []).some(address => normalizeEmail(typeof address === 'string' ? address : address.address) === normalizeEmail(message.to));
    return { status: accepted ? 'DELIVERED_GMAIL' : 'FAILED', reason: accepted ? 'Accepted by the mail server; inbox receipt is not confirmed.' : 'The mail server rejected the recipient.' };
  } catch (error) {
    const rateLimited = /(?:quota|daily.*limit|sending.*limit|too many messages)/i.test(String(error.response || error.message || ''));
    const authFailure = error.code === 'EAUTH';
    const retryable = Number(error.responseCode) >= 400 && Number(error.responseCode) < 500 || ['EDNS', 'ECONNECTION'].includes(error.code);
    const uncertain = !error.responseCode && ['ETIMEDOUT', 'ESOCKET'].includes(error.code) && error.command !== 'CONN';
    return { status: uncertain ? 'DELIVERY_UNKNOWN' : 'FAILED', retryable: (retryable || rateLimited) && !uncertain,
      pauseMs: rateLimited ? 86400000 : authFailure ? 900000 : 0,
      reason: uncertain ? 'Delivery could not be confirmed. Check provider logs before retrying.' : rateLimited ? 'The provider sending allowance is exhausted. Delivery will wait before retrying.' : 'The mail server could not accept the message.' };
  }
}
