import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIssueActivity, mergeActivityLogs, normalizeActivityLogs, parseActivityTime, formatActivityTime } from './issueActivity.js';

const issue = { id: 'ISS-1', studentId: 'S-1', createdAt: '2026-10-30T03:00:00Z', logs: [] };
const log = (text, hour, extras = {}) => ({ text, time: `2026-10-30T${hour}:00:00Z`, ...extras });

test('complete lifecycle includes submission, scheduling, rescheduling, start, end, minutes, escalation, resolution, and student feedback', () => {
  const events = [
    log('Issue submitted by student and assigned to RO-01.', '03'),
    log('Meeting scheduled by RO for tomorrow.', '04'),
    log('Meeting rescheduled / reassigned by RO.', '05'),
    log('Meeting started by RO-01.', '06'),
    log('Meeting ended by RO-01. Awaiting RO minutes / feedback.', '07'),
    log('[RO POST-MEETING DISCUSSION RECORD] Deliberations: Reviewed course enrollment.', '08'),
    log('Issue ESCALATED to Admin by RO.', '09'),
    log('Issue resolved by Administrator.', '10'),
    log('Student submitted feedback: 5 Stars.', '11')
  ];
  const activity = buildIssueActivity({ issue: { ...issue, logs: [...events].reverse() } });
  assert.deepEqual(activity.map(item => item.title), [
    'Issue Submitted', 'Meeting Scheduled', 'Meeting Rescheduled', 'Meeting Started', 'Meeting Ended',
    'RO Minutes / Feedback', 'Issue Escalated', 'Issue Resolved', 'Student Feedback Submitted'
  ]);
  assert.equal(activity.at(-1).time, '2026-10-30T11:00:00.000Z');
});

test('emails are interleaved chronologically and scoped to the selected issue only', () => {
  const emailLogs = [
    { id: 1, issue_id: ' iss-1 ', subject: 'Meeting invite', recipient: 'student@example.test', status: 'DELIVERED_GMAIL', created_at: '2026-10-30T04:30:00Z' },
    { id: 2, issueId: 'ISS-2', subject: 'Another student private email', createdAt: '2026-10-30T05:00:00Z' }
  ];
  const activity = buildIssueActivity({ issue: { ...issue, logs: [log('Meeting scheduled by RO.', '04'), log('Meeting started by RO.', '06')] }, emailLogs });
  assert.equal(activity.filter(item => item.kind === 'email').length, 1);
  assert.deepEqual(activity.map(item => item.title), ['Issue Submitted', 'Meeting Scheduled', 'Email Dispatch', 'Meeting Started']);
  assert.equal(activity[2].delivery, 'Dispatched via Gmail');
  assert.equal(activity[2].recipient, 'student@example.test');
});

test('failed or locally queued email is never labelled as sent', () => {
  for (const status of ['DISPATCHED_LOCAL', 'FAILED', 'ERROR', 'BOUNCED', undefined]) {
    const event = buildIssueActivity({ issue, emailLogs: [{ issueId: issue.id, id: status || 'unknown', status, subject: 'Notice' }] }).find(item => item.kind === 'email');
    assert.doesNotMatch(event.delivery, /^sent$|^dispatched via gmail$/i);
  }
});

test('inbound replies and all dispatch metadata are represented without rendering email HTML', () => {
  const email = { id: 1, issueId: 'ISS-1', direction: 'INBOUND', subject: 'Reply', sender: 'officer@example.test', recipient: 'student@example.test', eventType: 'GMAIL_REPLY', body: '<script>unsafe()</script>' };
  const event = buildIssueActivity({ issue, emailLogs: [email] }).find(item => item.kind === 'email');
  assert.equal(event.title, 'Email Received');
  assert.equal(event.delivery, 'Received');
  assert.equal(event.sender, email.sender);
  assert.equal(event.eventType, 'GMAIL REPLY');
  assert.equal(event.body, undefined);
});

test('cache and server copies of the same actions and emails appear once', () => {
  const action = log('Meeting started by RO.', '04', { id: 'start:1' });
  const email = { id: 5, issueId: 'ISS-1', subject: 'Notice', status: 'SENT' };
  const activity = buildIssueActivity({ issue: { ...issue, logs: [action] }, logs: JSON.stringify([action]), emailLogs: [email, { ...email }] });
  assert.equal(activity.filter(item => item.title === 'Meeting Started').length, 1);
  assert.equal(activity.filter(item => item.kind === 'email').length, 1);
});

test('legacy object arrays, serialized arrays, and plain text logs remain readable', () => {
  const logs = [JSON.stringify(log('Meeting scheduled by RO.', '04')), 'Legacy procedure entry', { message: 'Officer assigned', timestamp: '2026-10-30T05:00:00Z' }];
  assert.equal(normalizeActivityLogs(JSON.stringify(logs)).length, 3);
  assert.equal(mergeActivityLogs(logs, logs).length, 3);
});

test('legacy Indian and US date strings sort alongside ISO timestamps and display in IST', () => {
  assert.equal(parseActivityTime('30/10/2026, 15:30:00'), '2026-10-30T10:00:00.000Z');
  assert.equal(parseActivityTime('10/30/2026, 3:30:00 PM'), '2026-10-30T10:00:00.000Z');
  assert.match(formatActivityTime('2026-10-30T10:00:00Z'), /3:30:00 pm IST/i);
  assert.equal(parseActivityTime('not a date'), null);
  assert.equal(formatActivityTime(null), 'Time not recorded');
});

test('all historical events remain available beyond the old 100-email global limit', () => {
  const emails = Array.from({ length: 150 }, (_, id) => ({ id, issueId: 'ISS-1', subject: `Email ${id}`, status: 'SENT', createdAt: new Date(Date.UTC(2026, 9, 30, 5, id)).toISOString() }));
  const activity = buildIssueActivity({ issue, emailLogs: emails });
  assert.equal(activity.filter(item => item.kind === 'email').length, 150);
});

test('known creation date fills a missing submission event without inventing times for other logs', () => {
  const activity = buildIssueActivity({ issue: { ...issue, logs: [{ text: 'Legacy action without timestamp' }] } });
  assert.equal(activity[0].title, 'Issue Submitted');
  assert.equal(activity[1].time, null);
});

test('a repeated reschedule or feedback edit remains a separate action', () => {
  const events = [log('Meeting rescheduled by RO.', '04'), log('Meeting rescheduled by RO.', '05'), log('Student submitted feedback: 4 Stars.', '10'), log('Student submitted feedback: 5 Stars.', '11')];
  const activity = buildIssueActivity({ issue: { ...issue, logs: events } });
  assert.equal(activity.filter(item => item.title === 'Meeting Rescheduled').length, 2);
  assert.equal(activity.filter(item => item.title === 'Student Feedback Submitted').length, 2);
});

test('recording URLs and playback data are not exposed by the action timeline', () => {
  const activity = buildIssueActivity({ issue: { ...issue, recordingUrl: 'https://private.test/recording.webm', recordings: [{ videoUrl: 'secret' }] } });
  assert.doesNotMatch(JSON.stringify(activity), /recording.webm|secret/);
  assert.deepEqual(buildIssueActivity({ issue: null }), []);
});
