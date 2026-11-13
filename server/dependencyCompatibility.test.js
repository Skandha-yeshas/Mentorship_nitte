import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import utf7 from 'utf7';

test('the patched mailer builds a single-recipient message entirely in memory', async () => {
  const transporter = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await transporter.sendMail({ from: { name: 'Portal', address: 'portal@college.edu' }, to: 'student@college.edu', replyTo: 'portal@college.edu', subject: 'Compatibility fixture', text: 'No external delivery.' });
  assert.deepEqual(result.envelope.to, ['student@college.edu']);
  assert.ok(result.message.toString().includes('Compatibility fixture'));
});
test('the inbox client encoding works with the patched semver dependency', () => {
  const mailbox = 'INBOX/ವಿದ್ಯಾರ್ಥಿ/学生';
  assert.equal(utf7.imap.decode(utf7.imap.encode(mailbox)), mailbox);
});
