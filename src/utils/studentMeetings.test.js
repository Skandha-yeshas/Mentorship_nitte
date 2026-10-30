import test from 'node:test';
import assert from 'node:assert/strict';
import { getStudentIssues, getLiveStudentMeetings } from './studentMeetings.js';

const alice = { id: 'S-001', email: 'alice@example.test', name: 'Same Name' };
const bob = { id: 'S-002', email: 'bob@example.test', name: 'Same Name' };
const issues = [
  { id: 'ISS-A', studentId: alice.id, studentName: alice.name, status: 'Meeting Scheduled' },
  { id: 'ISS-B', studentId: bob.id, studentName: bob.name, status: 'Meeting Scheduled' }
];
const meeting = { id: 'MEET-A', issueId: 'ISS-A', studentId: alice.id, studentName: alice.name, status: 'Started', mode: 'Online' };
const live = (student, meetings = [meeting], currentIssues = issues) => getLiveStudentMeetings({ student, meetings, issues: currentIssues });

test('an RO starting Alice\'s meeting only exposes it to Alice, even when Bob has an issue and the same name', () => {
  assert.deepEqual(live(alice), [meeting]);
  assert.deepEqual(live(bob), []);
  assert.deepEqual(getStudentIssues(issues, bob), [issues[1]]);
});

test('meeting link appears only after the RO starts it and disappears when ended', () => {
  for (const status of ['Scheduled', 'Confirmed', 'Pending', 'In-Progress', 'Meeting Started', 'Completed', 'Finished', 'Cancelled', 'Concluded']) {
    assert.deepEqual(live(alice, [{ ...meeting, status }]), [], status);
  }
  assert.equal(live(alice, [{ ...meeting, status: 'Started' }]).length, 1);
});

test('offline meetings do not expose an online call', () => {
  assert.deepEqual(live(alice, [{ ...meeting, mode: 'Offline' }]), []);
});

test('each student gets their own room when both meetings are started', () => {
  const second = { ...meeting, id: 'MEET-B', issueId: 'ISS-B', studentId: bob.id };
  assert.deepEqual(live(alice, [second, meeting]), [meeting]);
  assert.deepEqual(live(bob, [meeting, second]), [second]);
});

test('a meeting without student metadata can match its owned issue', () => {
  const linked = { ...meeting, studentId: undefined, studentName: undefined };
  assert.deepEqual(live(alice, [linked]), [linked]);
  assert.deepEqual(live(bob, [linked]), []);
});

test('conflicting issue and meeting owners fail closed for both students', () => {
  const mismatched = { ...meeting, studentId: bob.id };
  assert.deepEqual(live(alice, [mismatched]), []);
  assert.deepEqual(live(bob, [mismatched]), []);
});

test('missing issue data still requires an explicit matching student ID', () => {
  assert.deepEqual(live(alice, [meeting], []), [meeting]);
  assert.deepEqual(live(bob, [meeting], []), []);
  assert.deepEqual(live(alice, [{ ...meeting, studentId: undefined }], []), []);
});

test('student names never establish ownership and a room needs an issue ID', () => {
  assert.deepEqual(live(alice, [{ ...meeting, studentId: undefined, issueId: undefined }]), []);
  assert.deepEqual(getStudentIssues([{ id: 'ISS-X', studentName: alice.name }], alice), []);
});

test('normalizes case and whitespace and supports database column names and email identifiers', () => {
  const row = { id: 'MEET-X', issue_id: ' iss-x ', student_id: ' ALICE@EXAMPLE.TEST ', status: 'Started', mode: 'Online' };
  const issue = { issue_id: 'ISS-X', student_id: ' s-001 ' };
  assert.deepEqual(live(alice, [row], [issue]), [row]);
  assert.deepEqual(live(bob, [row], [issue]), []);
});

test('issue status alone never exposes a join link before the RO starts the meeting record', () => {
  const started = [{ ...issues[0], status: 'Meeting Started' }, issues[1]];
  assert.deepEqual(live(alice, [], started), []);
  assert.deepEqual(live(alice, [{ ...meeting, status: 'Scheduled' }], started), []);
  assert.deepEqual(live(alice, [meeting], started), [meeting]);
  assert.deepEqual(live(bob, [], started), []);
});

test('an ended meeting with a stale Started status cannot expose a join link', () => {
  for (const ended of [{ endedByRo: true }, { endedAt: '2026-10-30T10:00:00Z' }, { ended_at: '2026-10-30T10:00:00Z' }]) {
    assert.deepEqual(live(alice, [{ ...meeting, ...ended }]), []);
  }
});

test('stale issue status cannot revive a scheduled, offline, or completed meeting', () => {
  const stale = [{ ...issues[0], status: 'Meeting Started' }];
  for (const overrides of [{ status: 'Completed' }, { status: 'Scheduled' }, { mode: 'Offline' }, { studentId: bob.id }]) {
    assert.deepEqual(live(alice, [{ ...meeting, ...overrides }], stale), []);
  }
});

test('resolved or escalated issues cannot advertise a live meeting', () => {
  for (const status of ['Resolved', 'Closed', 'Escalated', 'Re-escalated']) {
    assert.deepEqual(live(alice, [meeting], [{ ...issues[0], status }]), [], status);
  }
});

test('a student without an identity receives no issues or meeting links', () => {
  assert.deepEqual(getStudentIssues(issues, null), []);
  assert.deepEqual(live(null), []);
  assert.deepEqual(getLiveStudentMeetings({}), []);
});
