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
      authTimeout: 10000,
      tlsOptions: { rejectUnauthorized: false }
    }
  };
};

/**
 * Poll Gmail INBOX for unread replies matching issue IDs
 */
export const pollGmailInbox = async () => {
  const config = getConfig();
  if (!config) {
    imapStatus.active = false;
    imapStatus.lastError = 'GMAIL_APP_PASS not configured in server/.env';
    return;
  }

  try {
    const connection = await imapSimple.connect(config);
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
      const idHeader = `ImapMessageID: ${id}`;

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
        } else {
          console.log(`[Gmail IMAP] Unread email received from ${senderEmail} but no Issue ID found in subject: "${subject}"`);
        }
      }
    }

    connection.end();
  } catch (err) {
    console.warn(`[Gmail IMAP Listener] Polling warning/notice (${err.message}). Real IMAP ready when credentials supplied.`);
    imapStatus.active = false;
    imapStatus.lastError = err.message;
  }
};

/**
 * Start Real-Time Gmail IMAP Background Listener
 */
export const startImapListener = () => {
  console.log(`[Gmail IMAP Engine] Initializing Real-Time Inbox Listener for ${GMAIL_ADDRESS}...`);
  
  // Perform initial poll
  pollGmailInbox();

  // Poll every 20 seconds
  if (!pollInterval) {
    pollInterval = setInterval(pollGmailInbox, 20000);
  }
};

export const getImapStatus = () => {
  return {
    ...imapStatus,
    gmailAddress: GMAIL_ADDRESS
  };
};
