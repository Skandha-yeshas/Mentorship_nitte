import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRoster, normalizeRosterRow, safeCsvCell } from './rosterValidation.js';
import { quotaDelay } from '../server/mailQueue.js';
import { createQueueCipher } from '../server/security/queueCipher.js';
import { randomBytes } from 'node:crypto';
import { deliverQueuedMessage } from '../server/emailDelivery.js';

const student = { 'Student ID': 's-a', 'Student Name': 'Alice', 'Student Gmail': 'alice@college.edu', Branch: 'CSE', Semester: 4 };
test('roster validation supports college headers and 1,000 rows without fabricating account identities', () => {
  assert.equal(normalizeRosterRow('students', student).id, 'S-A');
  assert.equal(validateRoster('students', Array.from({ length: 1000 }, (_, i) => ({ ...student, 'Student ID': `S-${i}` }))).length, 1000);
  assert.throws(() => normalizeRosterRow('students', { ...student, 'Student ID': '', 'Mentor ID': 'M-1' }), /account ID/);
  assert.throws(() => normalizeRosterRow('students', { ...student, 'Student Gmail': '' }), /email is required/);
  assert.throws(() => normalizeRosterRow('students', { ...student, Semester: 'abc' }), /Semester/);
  assert.throws(() => validateRoster('students', [student, student]), /Duplicate account ID/);
  assert.throws(() => validateRoster('students', Array(2001).fill(student)), /2000/);
  assert.throws(() => normalizeRosterRow('students', { ...student, constructor: 'malicious' }), /column name/);
});
test('credentials exports neutralize spreadsheet formulas without removing normal content', () => {
  assert.equal(safeCsvCell('Alice'), '"Alice"');
  assert.ok(safeCsvCell('=HYPERLINK("https://bad.example")').startsWith('"\''));
});
test('queue payloads are authenticated encryption and reject changed ciphertext or a wrong key', () => {
  const cipher = createQueueCipher(randomBytes(32)); const payload = { password: 'Secret-fixture-password!' };
  const sealed = cipher.seal(payload); assert.ok(!sealed.includes(payload.password));
  assert.deepEqual(cipher.open(sealed), payload);
  assert.throws(() => createQueueCipher(randomBytes(32)).open(sealed));
  const parts = sealed.split('.'); parts[2] = Buffer.alloc(16).toString('base64url');
  assert.throws(() => cipher.open(parts.join('.')));
});
test('mail quotas use rolling windows and wait for both minute and daily allowances', () => {
  const now = Date.now();
  assert.equal(quotaDelay([], now, 1, 2), 0);
  assert.ok(quotaDelay([now - 1000], now, 1, 2) >= 59000);
  assert.ok(quotaDelay([now - 100000, now - 50000], now, 10, 2) > 86000000);
  assert.equal(quotaDelay([now - 86400001], now, 1, 1), 0);
});
test('provider quota errors pause delivery and do not trigger immediate bulk retries', async () => {
  const result = await deliverQueuedMessage({ to: 'student@college.edu', subject: 'Fixture', text: 'Fixture' }, {
    sender: 'portal@college.edu', getTransporter: () => ({ sendMail: async () => { throw Object.assign(new Error('Daily sending quota exceeded'), { responseCode: 550 }); } })
  });
  assert.equal(result.retryable, true); assert.equal(result.pauseMs, 86400000);
});
