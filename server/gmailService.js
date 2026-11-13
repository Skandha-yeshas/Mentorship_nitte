import nodemailer from 'nodemailer';
import { query } from './db.js';
import { loadQueueCipher } from './security/queueCipher.js';
import dotenv from 'dotenv';
import { createEmailDelivery } from './emailDelivery.js';
import { normalizeEmail } from './emailAddress.js';
import { createInboundEmailProcessor } from './emailInbound.js';
dotenv.config();

export const GMAIL_ADDRESS = normalizeEmail(process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER || '');
export const GMAIL_APP_PASS = process.env.SMTP_PASSWORD || (process.env.GMAIL_APP_PASS || '').replace(/[\s"']/g, '').trim();
const allowLegacy = process.env.NODE_ENV !== 'production';
let fallbackEmailLogs = [];
let transporter;
const createTransporter = () => {
  const user = process.env.SMTP_USER || process.env.GMAIL_USER;
  if (!user || !GMAIL_APP_PASS) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  transporter ||= nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port,
    secure: port === 465, requireTLS: port !== 465, auth: { user, pass: GMAIL_APP_PASS },
    tls: { rejectUnauthorized: true }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true });
  return transporter;
};
export const mailConfigurationProblem = () => {
    if (process.env.NODE_ENV !== 'production') return null;
    try { if (new URL(process.env.APP_URL).protocol === 'https:') return null; } catch { /* Configuration message below. */ }
    return 'A public HTTPS portal URL must be configured before sending production email.';
  };
export const mailWorkerOptions = { sender: GMAIL_ADDRESS, getTransporter: createTransporter,
  enabled: () => process.env.DISABLE_EMAIL !== '1', allowLegacy, configurationProblem: mailConfigurationProblem,
  quotaAccount: (process.env.SMTP_USER || process.env.GMAIL_USER || GMAIL_ADDRESS).trim().toLowerCase() };
export function createQueuedMailSender(queryOverride = query) {
  return async message => {
    const queueCipher = await loadQueueCipher();
    return createEmailDelivery({ query: queryOverride, ...mailWorkerOptions, queueCipher,
      rememberFailure: record => { fallbackEmailLogs.unshift(record); fallbackEmailLogs = fallbackEmailLogs.slice(0, 500); }
    })(message);
  };
}
export const sendGmailNotification = createQueuedMailSender();

/**
 * Get all Gmail logs (Outbound & Inbound)
 */
export const getEmailLogs = async ({ issueId } = {}) => {
  const matchingFallback = issueId
    ? fallbackEmailLogs.filter(log => String(log.issue_id || log.issueId || '').trim().toUpperCase() === String(issueId).trim().toUpperCase())
    : fallbackEmailLogs;
  try {
    const res = await query(
      `SELECT id, direction, sender, recipient, subject, body,
              event_type AS "eventType", issue_id AS "issueId",
              status, delivery_reason AS "deliveryReason", mentor_id AS "mentorId", created_at AS "createdAt"
       FROM email_logs ${issueId ? 'WHERE UPPER(issue_id) = UPPER($1)' : ''}
       ORDER BY created_at DESC ${issueId ? '' : 'LIMIT 100'}`,
      issueId ? [issueId] : []
    );
    return res.rows.concat(matchingFallback);
  } catch (err) {
    console.error('[Gmail System] Error reading email logs from DB:', err.message);
    return matchingFallback;
  }
};

export const processInboundGmailReply = createInboundEmailProcessor({ query, sender: GMAIL_ADDRESS, allowLegacy });
