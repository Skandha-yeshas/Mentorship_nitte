// This diagnostic sends nothing unless explicitly invoked with --send.
if (!process.argv.includes('--send')) {
  console.log('No email sent. To send one test message, set MAIL_TEST_TO to your chosen registered test inbox and run node server/testEmail.js --send. DISABLE_EMAIL=1 still prevents delivery.');
} else {
  const { sendGmailNotification } = await import('./gmailService.js');
  if (!process.env.MAIL_TEST_TO) throw new Error('Set MAIL_TEST_TO explicitly. No recipient is assumed.');
  const result = await sendGmailNotification({ to: process.env.MAIL_TEST_TO, subject: 'Mentorship portal mail configuration test',
    text: 'This test message confirms that the configured mentorship portal mail service accepted a message for this inbox.', eventType: 'EXPLICIT_MAIL_TEST' });
  console.log(JSON.stringify({ status: result.status, reason: result.deliveryReason }));
  const { shutdown } = await import('./db.js'); await shutdown();
}
