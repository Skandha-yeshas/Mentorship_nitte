import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createEmailDelivery } from './emailDelivery.js';
import { createEmailNotifications, extractEmailIssueId } from './emailNotifications.js';
import { createEmailRoutes } from './emailRoutes.js';
import { createAccessPolicy } from './security/access.js';
import { recipientProblem } from './emailAddress.js';
import { scopeState } from './security/scopedState.js';
import { createInboundEmailProcessor } from './emailInbound.js';

function fixture(options = {}) {
  const issues = [
    { id: 'ISS-A', category: 'Enrollment', priority: 'High', student_id: 'S-A', student_name: 'Alice', student_email: 'alice@college.edu', ro_id: 'RO-A', ro_name: 'Officer A', ro_email: 'officer-a@college.edu' },
    { id: 'ISS-B', category: 'Hostel', priority: 'Low', student_id: 'S-B', student_name: 'Bob', student_email: 'bob@college.edu', ro_id: 'RO-B', ro_name: 'Officer B', ro_email: 'officer-b@college.edu' }
  ];
  const admins = [{ id: 'A1', name: 'Principal', email: 'principal@college.edu' }, { id: 'A2', name: 'Dean', email: 'dean@college.edu' }, { id: 'A3', name: 'Duplicate address', email: 'DEAN@college.edu' }];
  const mentors = [{ id: 'M-A', name: 'Mentor A', email: 'mentor-a@college.edu', class: 'CSE' }, { id: 'M-B', name: 'Mentor B', email: 'mentor-b@college.edu' }];
  const logs = new Map(); const calls = []; const sent = []; const failures = [];
  let nextId = 0;
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.startsWith('INSERT INTO email_logs')) {
      if (options.logFailure) throw new Error('Database offline');
      if (logs.has(params[9])) return { rows: [] };
      const row = { id: ++nextId, status: params[8], deliveryReason: params[10], recipient: params[1], body: params[4], createdAt: new Date().toISOString() };
      logs.set(params[9], row); return { rows: [row] };
    }
    if (sql.startsWith('UPDATE email_logs')) {
      if (options.finishFailure) throw new Error('Database connection lost after send');
      const row = [...logs.values()].find(row => row.id === params[2]); Object.assign(row, { status: params[0], deliveryReason: params[1] }); return { rows: [] };
    }
    if (sql.includes('FROM email_logs WHERE notification_key')) return { rows: logs.has(params[0]) ? [logs.get(params[0])] : [] };
    if (sql.includes('FROM issues i')) return { rows: issues.filter(row => row.id.toUpperCase() === String(params[0]).toUpperCase()) };
    if (sql.startsWith('SELECT id, name, email FROM admins')) return { rows: admins };
    if (sql.startsWith('SELECT id FROM admins')) return { rows: admins.filter(row => row.email?.toLowerCase() === params[0]) };
    if (sql.includes('FROM mentors WHERE UPPER')) return { rows: mentors.filter(row => row.id.toUpperCase() === String(params[0]).toUpperCase()) };
    if (sql.includes('UNION ALL')) return { rows: [...mentors, ...admins, ...issues.flatMap(row => [{ email: row.student_email }, { email: row.ro_email }])].filter(row => row.email?.toLowerCase() === params[0]) };
    throw new Error('Unexpected query in email fixture');
  };
  const send = createEmailDelivery({ query, sender: options.sender || 'portal@college.edu', enabled: () => options.enabled !== false,
    allowLegacy: options.allowLegacy || false, rememberFailure: row => failures.push(row),
    getTransporter: () => options.unconfigured ? null : { sendMail: async message => {
      if (options.smtpFailure) throw new Error('SMTP failed');
      sent.push(message); return { accepted: options.reject ? [] : [message.to] };
    } }
  });
  return { issues, admins, logs, calls, sent, failures, query, send,
    notifications: createEmailNotifications({ query, send, portalUrl: 'https://portal.college.edu', allowLegacy: options.allowLegacy || false }) };
}

test('issue notifications resolve only the owning student or currently assigned RO, never another ticket owner', async () => {
  const { notifications, sent, issues } = fixture();
  await notifications.issue('ISS-A', 'ISSUE_SUBMITTED_TO_RO', { notificationKey: 'submit-A-ro' });
  await notifications.issue('ISS-A', 'ISSUE_SUBMITTED_STUDENT_CONFIRM', { notificationKey: 'submit-A-student' });
  await notifications.issue('ISS-A', 'MEETING_SCHEDULED', { date: '2026-11-02', time: '10:00', notificationKey: 'schedule-A' });
  await notifications.issue('ISS-A', 'ISSUE_RESOLVED', { resolutionNotes: 'Corrected enrollment.', notificationKey: 'resolve-A' });
  await notifications.issue('ISS-A', 'ISSUE_REOPENED', { reason: 'Needs review', notificationKey: 'reopen-A' });
  await notifications.issue('ISS-A', 'FEEDBACK_SUBMITTED', { rating: 5, comments: 'Thank you', notificationKey: 'feedback-A' });
  assert.deepEqual(sent.map(message => message.to), ['officer-a@college.edu', 'alice@college.edu', 'alice@college.edu', 'alice@college.edu', 'officer-a@college.edu', 'officer-a@college.edu']);
  assert.ok(sent.every(message => message.replyTo === 'portal@college.edu' && !message.cc && !message.bcc));
  issues[0].ro_email = 'replacement@college.edu';
  await notifications.issue('ISS-A', 'ISSUE_REASSIGNED', { notificationKey: 'reassign-A' });
  assert.equal(sent.at(-1).to, 'replacement@college.edu');
});

test('administrative hearings and resolutions notify the ticket student; escalations privately notify distinct registered Admin addresses', async () => {
  const { notifications, sent } = fixture();
  await notifications.issue('ISS-B', 'ADMIN_MEETING_SCHEDULED', { notificationKey: 'admin-meeting-B' });
  await notifications.issue('ISS-B', 'ADMIN_ISSUE_RESOLVED', { notificationKey: 'admin-resolve-B' });
  await notifications.issue('ISS-B', 'ISSUE_ESCALATED', { reason: 'Review needed', notificationKey: 'escalate-B' });
  assert.deepEqual(sent.map(message => message.to), ['bob@college.edu', 'bob@college.edu', 'principal@college.edu', 'dean@college.edu']);
  assert.ok(!sent[2].text.includes('dean@college.edu')); assert.ok(!sent[3].text.includes('principal@college.edu'));
});

test('missing or invalid recipient records never fall back to a developer inbox or another student', async () => {
  const { issues, admins, notifications, sent } = fixture();
  issues[0].student_email = null; issues[0].ro_email = 'bad-address'; admins.length = 0;
  const [student] = await notifications.issue('ISS-A', 'MEETING_RESCHEDULED');
  const [officer] = await notifications.issue('ISS-A', 'ISSUE_REOPENED');
  const [admin] = await notifications.issue('ISS-A', 'ISSUE_ESCALATED');
  assert.ok([student, officer, admin].every(record => record.status === 'SKIPPED_INVALID_RECIPIENT'));
  assert.equal(sent.length, 0);
});

test('reserved addresses and multi-recipient/header injection are rejected before SMTP', async () => {
  const { send, sent } = fixture();
  for (const to of ['test@example.invalid', 'test@example.com', 'alice@college.edu,bob@college.edu', 'Name <alice@college.edu>', 'alice@college.edu\r\nBcc: outsider@other.edu']) {
    assert.equal((await send({ to, subject: 'Test' })).status, 'SKIPPED_INVALID_RECIPIENT');
  }
  assert.equal(sent.length, 0);
});

test('legacy developer addresses remain usable for development tests but are blocked in production', async () => {
  const address = 'skandhayashas2906@gmail.com';
  assert.match(recipientProblem(address), /blocked in production/);
  assert.equal(recipientProblem(address, { allowLegacy: true }), null);
  assert.equal((await fixture().send({ to: address, subject: 'No production send' })).status, 'SKIPPED_INVALID_RECIPIENT');
  const dev = fixture({ allowLegacy: true });
  assert.equal((await dev.send({ to: address, subject: 'Fake development transport' })).status, 'DELIVERED_GMAIL');
  assert.equal(dev.sent.length, 1);
});

test('disabled and unconfigured delivery are logged truthfully without calling SMTP', async () => {
  for (const [options, status] of [[{ enabled: false }, 'SKIPPED_DISABLED'], [{ unconfigured: true }, 'SKIPPED_UNCONFIGURED']]) {
    const { send, sent, logs } = fixture(options);
    assert.equal((await send({ to: 'alice@college.edu', subject: 'Notice', notificationKey: 'one' })).status, status);
    assert.equal(sent.length, 0); assert.equal([...logs.values()][0].status, status);
  }
});

test('missing production portal configuration prevents SMTP dispatch', async () => {
  const f = fixture();
  const send = createEmailDelivery({ query: f.query, sender: 'portal@college.edu', enabled: () => true,
    configurationProblem: () => 'Configure the public HTTPS portal URL.', getTransporter: () => { throw new Error('Must not open SMTP'); } });
  const result = await send({ to: 'alice@college.edu' });
  assert.equal(result.status, 'SKIPPED_UNCONFIGURED');
  assert.match(result.deliveryReason, /HTTPS/);
});

test('persistent notification claims suppress concurrent duplicates and remain effective with a fresh service instance', async () => {
  const { notifications, sent, query } = fixture();
  await Promise.all(Array.from({ length: 4 }, () => notifications.issue('ISS-A', 'MEETING_SCHEDULED', { notificationKey: 'schedule:one' })));
  assert.equal(sent.length, 1);
  const second = createEmailDelivery({ query, sender: 'portal@college.edu', enabled: () => true, getTransporter: () => ({ sendMail: async () => { throw new Error('Duplicate sent'); } }) });
  const duplicate = await second({ to: 'alice@college.edu', subject: 'Retry after restart', notificationKey: 'schedule:one' });
  assert.equal(duplicate.duplicate, true);
  await notifications.issue('ISS-A', 'MEETING_RESCHEDULED', { notificationKey: 'schedule:two' });
  assert.equal(sent.length, 2);
});

test('database failures prevent sending, while failed or rejected SMTP is never reported as delivered', async () => {
  const offline = fixture({ logFailure: true });
  assert.equal((await offline.send({ to: 'alice@college.edu' })).status, 'FAILED'); assert.equal(offline.sent.length, 0);
  for (const options of [{ smtpFailure: true }, { reject: true }]) assert.equal((await fixture(options).send({ to: 'alice@college.edu' })).status, 'FAILED');
  const uncertain = fixture({ finishFailure: true });
  assert.equal((await uncertain.send({ to: 'alice@college.edu' })).status, 'DELIVERY_UNKNOWN'); assert.equal(uncertain.sent.length, 1);
});

test('onboarding logs omit passwords and safely escape user-provided email content', async () => {
  const { send, logs, sent, notifications } = fixture();
  await send({ to: 'alice@college.edu', subject: 'Credentials', text: 'Password: Secret-test-only', eventType: 'BULK_STUDENT_ONBOARDING' });
  assert.ok(![...logs.values()][0].body.includes('Secret-test-only'));
  await notifications.issue('ISS-A', 'ISSUE_RESOLVED', { resolutionNotes: '<img src=x onerror=alert(1)>', notificationKey: 'escaped' });
  assert.ok(sent[1].html.includes('&lt;img')); assert.ok(!sent[1].html.includes('<img'));
});

test('mentor notices use the registered mentor address and support complete UUID ticket IDs in replies', async () => {
  const { notifications, sent } = fixture();
  await notifications.mentor('M-A', 'schedule', { date: '2026-11-02', time: '09:00' }, 'mentor-one');
  await notifications.mentor('M-B', 'deadline', { date: '2026-11-02' }, 'mentor-two');
  assert.deepEqual(sent.map(message => message.to), ['mentor-a@college.edu', 'mentor-b@college.edu']);
  const id = `ISS-${randomUUID()}`;
  assert.equal(extractEmailIssueId(`Re: [${id}] Meeting notice`), id.toUpperCase());
  assert.equal(extractEmailIssueId('Re: ISS-101'), 'ISS-101');
  assert.equal(extractEmailIssueId('No ticket here'), null);
});

test('custom ticket messages accept only its own participants or registered Admins', async () => {
  const { notifications } = fixture();
  assert.equal(await notifications.customRecipient('alice@college.edu', 'ISS-A'), true);
  assert.equal(await notifications.customRecipient('officer-a@college.edu', 'ISS-A'), true);
  assert.equal(await notifications.customRecipient('principal@college.edu', 'ISS-A'), true);
  assert.equal(await notifications.customRecipient('bob@college.edu', 'ISS-A'), false);
  assert.equal(await notifications.customRecipient('unknown@college.edu'), false);
});

test('mentor notification APIs reject other accounts and ignore a forged recipient; custom automated sends are blocked', async t => {
  const f = fixture(); const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.user = { id: req.get('test-user') || 'M-A', role: req.get('test-role') || 'Mentor' }; next(); });
  app.use(createAccessPolicy(f.query).middleware); app.use(createEmailRoutes({ notifications: f.notifications, send: f.send }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const root = `http://127.0.0.1:${server.address().port}`;
  const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'schedule', schedule: { date: '2026-11-02' }, to: 'outsider@other.edu' }) };
  assert.equal((await fetch(`${root}/mentors/M-B/notifications`, options)).status, 403);
  assert.equal((await fetch(`${root}/mentors/M-A/notifications`, options)).status, 201);
  assert.equal(f.sent[0].to, 'mentor-a@college.edu');
  assert.equal((await fetch(`${root}/gmail/send`, { ...options, body: JSON.stringify({ to: 'alice@college.edu', subject: 'Forged', text: 'No', eventType: 'MEETING_SCHEDULED' }), headers: { ...options.headers, 'test-user': 'ADMIN', 'test-role': 'Admin' } })).status, 400);
  assert.equal(f.sent.length, 1);
});

test('mentor email logs remain scoped to the signed-in mentor', () => {
  const scoped = scopeState({ users: { mentors: [{ id: 'M-A' }], students: [], ros: [] }, gmailLogs: [{ id: 1, mentorId: 'M-A' }, { id: 2, mentorId: 'M-B' }] }, { role: 'Mentor', id: 'M-A' });
  assert.deepEqual(scoped.gmailLogs.map(row => row.id), [1]);
});

test('incoming replies from unrelated accounts are rejected and participant replies are claimed with a stable message identity', async () => {
  const f = fixture(); const updates = [];
  const query = async (sql, params) => {
    if (sql.startsWith('WITH incoming')) { updates.push({ sql, params }); return { rows: [{ id: 'ISS-A' }] }; }
    return f.query(sql, params);
  };
  const receive = createInboundEmailProcessor({ query, sender: 'portal@college.edu' });
  assert.equal((await receive({ senderEmail: 'bob@college.edu', issueId: 'ISS-A', replyText: 'Wrong ticket' })).success, false);
  assert.equal(updates.length, 0);
  assert.equal((await receive({ senderEmail: 'alice@college.edu', issueId: 'ISS-A', replyText: 'Correct ticket', messageId: '<fixture-id@college.edu>' })).success, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].params[0], 'alice@college.edu');
  assert.equal(updates[0].params[4], 'ISS-A');
  assert.match(updates[0].sql, /ON CONFLICT \(notification_key\) DO NOTHING/);
});
