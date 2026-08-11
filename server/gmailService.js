import nodemailer from 'nodemailer';
import { query } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

export const GMAIL_ADDRESS = process.env.GMAIL_USER || 'skandhayashu2906@gmail.com';

// In-memory fallback cache if DB is resetting/unavailable
let fallbackEmailLogs = [];

// Initialize Nodemailer transporter for Gmail
const createTransporter = () => {
  const user = GMAIL_ADDRESS.trim();
  const pass = (process.env.GMAIL_APP_PASS || '').replace(/[\s"']/g, '').trim();

  if (user && pass) {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false
      }
    });
  }
  return null;
};

/**
 * Send an email notification via skandhayashu2906@gmail.com
 * and persist transaction into database logs.
 */
export const sendGmailNotification = async ({
  to,
  subject,
  html,
  text = '',
  issueId = null,
  eventType = 'NOTIFICATION',
  recipientName = '',
  replyTo = null,
  fromName = 'NITTE Mentorship System'
}) => {
  const sender = GMAIL_ADDRESS;
  const bodyText = text || html.replace(/<[^>]+>/g, ' ');
  let dispatchStatus = 'SENT';

  const transporter = createTransporter();

  if (transporter) {
    try {
      const mailOptions = {
        from: `"${fromName}" <${sender}>`,
        to,
        subject,
        text: bodyText,
        html,
        headers: {
          'X-Priority': '1',
          'Priority': 'urgent',
          'Importance': 'high'
        }
      };

      if (replyTo) {
        mailOptions.replyTo = replyTo;
      }

      await transporter.sendMail(mailOptions);
      dispatchStatus = 'DELIVERED_GMAIL';
      console.log(`[Gmail SMTP] REAL Email dispatched from ${sender} TO ${to} (Subject: "${subject}")`);
    } catch (err) {
      console.warn(`[Gmail SMTP] Delivery notice (${err.message}). Stored in email logs.`);
      dispatchStatus = 'DISPATCHED_LOCAL';
    }
  } else {
    dispatchStatus = 'DISPATCHED_LOCAL';
    console.log(`[Gmail System] Email logged and dispatched via ${sender} to ${to}`);
  }

  const emailRecord = {
    direction: 'OUTBOUND',
    sender,
    recipient: to,
    subject,
    body: bodyText,
    event_type: eventType,
    issue_id: issueId,
    status: dispatchStatus,
    created_at: new Date().toISOString()
  };

  try {
    const res = await query(
      `INSERT INTO email_logs (direction, sender, recipient, subject, body, event_type, issue_id, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at AS "createdAt"`,
      ['OUTBOUND', sender, to, subject, bodyText, eventType, issueId, dispatchStatus]
    );
    if (res.rows.length > 0) {
      emailRecord.id = res.rows[0].id;
      emailRecord.created_at = res.rows[0].createdAt;
    }
  } catch (dbErr) {
    console.error('[Gmail System] Failed to write to email_logs table, storing in fallback:', dbErr.message);
    emailRecord.id = Date.now();
    fallbackEmailLogs.unshift(emailRecord);
  }

  return emailRecord;
};

/**
 * Get all Gmail logs (Outbound & Inbound)
 */
export const getEmailLogs = async () => {
  try {
    const res = await query(
      `SELECT id, direction, sender, recipient, subject, body, 
              event_type AS "eventType", issue_id AS "issueId", 
              status, created_at AS "createdAt" 
       FROM email_logs ORDER BY created_at DESC LIMIT 100`
    );
    return res.rows.concat(fallbackEmailLogs);
  } catch (err) {
    console.error('[Gmail System] Error reading email logs from DB:', err.message);
    return fallbackEmailLogs;
  }
};

/**
 * Process inbound reply to skandhayashu2906@gmail.com
 * Updates issue in PostgreSQL database directly.
 */
export const processInboundGmailReply = async ({
  senderEmail,
  senderName = 'External User',
  issueId,
  replyText
}) => {
  const timestamp = new Date().toISOString();
  const recipient = GMAIL_ADDRESS;
  const subject = `Re: [${issueId}] Update from Gmail Response`;
  const bodyText = `Response received from ${senderName} (${senderEmail}): "${replyText}"`;

  try {
    // 1. Save inbound email log
    await query(
      `INSERT INTO email_logs (direction, sender, recipient, subject, body, event_type, issue_id, status)
       VALUES ('INBOUND', $1, $2, $3, $4, 'GMAIL_REPLY', $5, 'RECEIVED')`,
      [senderEmail, recipient, subject, bodyText, issueId]
    );

    // 2. Fetch existing logs for the issue
    const issueRes = await query(`SELECT logs, status FROM issues WHERE id = $1`, [issueId]);

    if (issueRes.rowCount > 0) {
      let logs = issueRes.rows[0].logs || [];
      if (typeof logs === 'string') logs = JSON.parse(logs);

      logs.push({
        text: `Gmail Response received via ${GMAIL_ADDRESS} from ${senderName} (${senderEmail}): "${replyText}"`,
        time: timestamp
      });

      // Update issue with new log
      await query(
        `UPDATE issues SET logs = $1 WHERE id = $2`,
        [JSON.stringify(logs), issueId]
      );
    }

    return {
      success: true,
      message: `Gmail reply successfully processed for ${issueId}`,
      issueId
    };
  } catch (err) {
    console.error('[Gmail System] Error processing inbound reply:', err);
    throw err;
  }
};
