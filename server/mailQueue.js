import { normalizeEmail } from './emailAddress.js';
import { deliverQueuedMessage } from './emailDelivery.js';

const tables = { Student: 'students', Mentor: 'mentors', RO: 'ros', Admin: 'admins' };
export function quotaDelay(attempts, now, perMinute, perDay) {
  const minute = attempts.filter(date => now - date < 60000).sort((a, b) => a - b);
  const day = attempts.filter(date => now - date < 86400000).sort((a, b) => a - b);
  return Math.max(minute.length >= perMinute ? minute[minute.length - perMinute] + 60001 - now : 0,
    day.length >= perDay ? day[day.length - perDay] + 86400001 - now : 0);
}
export async function queuedRecipientStillMatches(query, message) {
  const binding = message.recipientBinding;
  if (binding && tables[binding.role]) {
    const row = (await query(`SELECT id, email${binding.passwordHash ? ', password' : ''} FROM ${tables[binding.role]} WHERE id = $1`, [binding.id])).rows[0];
    if (!row || normalizeEmail(row.email) !== normalizeEmail(message.to) || binding.passwordHash && row.password !== binding.passwordHash) return false;
    if (message.issueId && ['Student', 'RO'].includes(binding.role)) {
      const issue = (await query('SELECT student_id, ro_id FROM issues WHERE id = $1', [message.issueId])).rows[0];
      if (!issue || issue[binding.role === 'Student' ? 'student_id' : 'ro_id'] !== binding.id) return false;
    }
    return true;
  }
  if (message.eventType === 'EXPLICIT_MAIL_TEST') return true;
  if (message.issueId) {
    return (await query(`SELECT 1 FROM issues i LEFT JOIN students s ON s.id=i.student_id LEFT JOIN ros r ON r.id=i.ro_id
      WHERE i.id=$1 AND (LOWER(s.email)=$2 OR LOWER(r.email)=$2 OR EXISTS(SELECT 1 FROM admins WHERE LOWER(email)=$2))`, [message.issueId, normalizeEmail(message.to)])).rows.length > 0;
  }
  return (await query(`SELECT id FROM students WHERE LOWER(email)=$1 UNION ALL SELECT id FROM mentors WHERE LOWER(email)=$1
    UNION ALL SELECT id FROM ros WHERE LOWER(email)=$1 UNION ALL SELECT id FROM admins WHERE LOWER(email)=$1 LIMIT 1`, [normalizeEmail(message.to)])).rows.length > 0;
}

export function createMailWorker({ getClient, cipher, sender, enabled, getTransporter, allowLegacy = false, configurationProblem = () => null,
  perMinute = 10, perDay = 400, quotaAccount = sender, now = Date.now }) {
  async function tick() {
    if (!enabled() || configurationProblem()) return false;
    const client = await getClient(); let row;
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE email_logs SET status='DELIVERY_UNKNOWN', delivery_reason='Worker stopped during delivery; verify provider logs before retrying.', lease_until=NULL
        WHERE status='SENDING' AND lease_until < NOW()`);
      row = (await client.query(`SELECT id, queued_payload, attempts FROM email_logs
        WHERE status IN ('QUEUED','RETRY','DEFERRED') AND next_attempt_at <= NOW() AND queued_payload IS NOT NULL
        ORDER BY CASE WHEN event_type LIKE 'BULK_%' THEN 1 ELSE 0 END, created_at FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
      if (!row) { await client.query('COMMIT'); return false; }
      await client.query('INSERT INTO mail_sending_limits(sender) VALUES ($1) ON CONFLICT DO NOTHING', [quotaAccount]);
      const senderLimit = (await client.query('SELECT sender,blocked_until FROM mail_sending_limits WHERE sender=$1 FOR UPDATE', [quotaAccount])).rows[0];
      const attempts = (await client.query("SELECT attempted_at FROM mail_sending_attempts WHERE sender=$1 AND attempted_at > NOW()-INTERVAL '24 hours'", [quotaAccount])).rows.map(row => new Date(row.attempted_at).getTime());
      const delay = Math.max(quotaDelay(attempts, now(), perMinute, perDay), senderLimit.blocked_until ? new Date(senderLimit.blocked_until).getTime() - now() : 0);
      if (delay) {
        await client.query("UPDATE email_logs SET status='DEFERRED', next_attempt_at=$1, delivery_reason='Waiting for the configured sending allowance.' WHERE id=$2", [new Date(now() + delay), row.id]);
        await client.query('COMMIT'); return false;
      }
      let message;
      try { message = cipher.open(row.queued_payload); }
      catch {
        await client.query("UPDATE email_logs SET status='FAILED', delivery_reason='Queued message could not be decrypted. Check the private encryption key.' WHERE id=$1", [row.id]);
        await client.query('COMMIT'); return true;
      }
      if (!await queuedRecipientStillMatches((sql, params) => client.query(sql, params), message)) {
        await client.query("UPDATE email_logs SET status='CANCELLED', delivery_reason='Recipient, assignment or password changed; stale message cancelled.', queued_payload=NULL WHERE id=$1", [row.id]);
        await client.query('COMMIT'); return true;
      }
      await client.query('INSERT INTO mail_sending_attempts(sender,mail_log_id,attempt_number) VALUES ($1,$2,$3)', [quotaAccount, String(row.id), Number(row.attempts) + 1]);
      await client.query("UPDATE email_logs SET status='SENDING', sender=$2, attempts=attempts+1, lease_until=NOW()+INTERVAL '2 minutes' WHERE id=$1", [row.id, sender]);
      await client.query('COMMIT');
      const result = await deliverQueuedMessage(message, { getTransporter, sender, allowLegacy });
      if (result.pauseMs) await client.query('UPDATE mail_sending_limits SET blocked_until=$1 WHERE sender=$2', [new Date(now() + result.pauseMs), quotaAccount]);
      const retry = result.retryable && Number(row.attempts) < 4;
      await client.query(`UPDATE email_logs SET status=$1, delivery_reason=$2, lease_until=NULL, next_attempt_at=$3,
        queued_payload=CASE WHEN $1='DELIVERED_GMAIL' THEN NULL ELSE queued_payload END WHERE id=$4`,
      [retry ? 'RETRY' : result.status, retry ? 'Temporary mail failure; a background retry is scheduled.' : result.reason,
        new Date(now() + Math.max(result.pauseMs || 0, Math.min(3600000, 60000 * 2 ** Number(row.attempts)))), row.id]);
      return true;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  return { tick };
}
