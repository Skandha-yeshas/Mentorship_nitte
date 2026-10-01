import imapSimple from 'imap-simple';
import { simpleParser } from 'mailparser';
import { processInboundGmailReply, GMAIL_ADDRESS } from './gmailService.js';
import dotenv from 'dotenv';
dotenv.config();

let imapStatus = {
  active: false,
  lastPoll: null,
  processedCount: 0,
  lastError: null,
  user: GMAIL_ADDRESS
};

let pollInterval = null;

let isPolling = false;

const getConfig = () => {
  const user = (process.env.GMAIL_USER || GMAIL_ADDRESS).trim();
  const password = (process.env.GMAIL_APP_PASS || '').replace(/[\s"']/g, '').trim();

  if (!user || !password) {
    return null;
  }

  return {
    imap: {
      user,
      password,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      authTimeout: 8000,
      connTimeout: 8000,
      tlsOptions: { rejectUnauthorized: false }
    }
  };
};

/**
 * Poll Gmail INBOX for unread replies matching issue IDs
 */
export const pollGmailInbox = async () => {
  if (isPolling) {
    return;
  }

  const config = getConfig();
  if (!config) {
    imapStatus.active = false;
    imapStatus.lastError = 'GMAIL_APP_PASS not configured in server/.env';
    return;
  }

  isPolling = true;
  let connection = null;

  try {
    connection = await imapSimple.connect(config);
    
    // Attach error listeners to both connection wrapper and raw IMAP stream
    if (connection) {
      connection.on('error', () => {});
      if (connection.imap) {
        connection.imap.on('error', () => {});
      }
    }

    await connection.openBox('INBOX');

    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: true
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    imapStatus.active = true;
    imapStatus.lastPoll = new Date().toISOString();
    imapStatus.lastError = null;

    for (const item of messages) {
      const allParts = item.parts.find(part => part.which === '');
      const id = item.attributes.uid;

      if (allParts && allParts.body) {
        const parsed = await simpleParser(allParts.body);
        const subject = parsed.subject || '';
        const senderEmail = parsed.from?.value?.[0]?.address || 'unknown@gmail.com';
        const senderName = parsed.from?.value?.[0]?.name || senderEmail.split('@')[0];
        const bodyText = parsed.text || parsed.html || '';

        // Extract Issue ID (matches ISS-xxx, TICK-xxx, ISS-101, etc.)
        const issueMatch = subject.match(/(ISS-\d+|TICK-\d+)/i) || bodyText.match(/(ISS-\d+|TICK-\d+)/i);

        if (issueMatch) {
          const issueId = issueMatch[0].toUpperCase();
          console.log(`[Gmail IMAP] Real unread email received from ${senderEmail} for Ticket ${issueId}`);
          
          await processInboundGmailReply({
            senderEmail,
            senderName,
            issueId,
            replyText: bodyText.trim().substring(0, 500)
          });

          imapStatus.processedCount += 1;
        }
      }
    }
  } catch (err) {
    imapStatus.active = false;
    imapStatus.lastError = err.message;
  } finally {
    if (connection) {
      try {
        if (connection.imap && typeof connection.imap.end === 'function') {
          connection.imap.removeAllListeners('error');
          connection.imap.on('error', () => {});
        }
        connection.end();
      } catch (closeErr) {
        // Silently ignore connection end errors
      }
    }
    isPolling = false;
  }
};

/**
 * Start Real-Time Gmail IMAP Background Listener
 */
export const startImapListener = () => {
  // Perform initial poll safely
  pollGmailInbox().catch(() => {});

  // Poll every 45 seconds to stay well within Gmail IMAP connection limits
  if (!pollInterval) {
    pollInterval = setInterval(() => {
      pollGmailInbox().catch(() => {});
    }, 45000);
  }
};

export const getImapStatus = () => {
  return {
    ...imapStatus,
    gmailAddress: GMAIL_ADDRESS
  };
};
