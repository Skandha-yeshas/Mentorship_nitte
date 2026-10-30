import test from 'node:test';
import assert from 'node:assert/strict';
import { getGrievanceQuota, GRIEVANCE_LOCK_MS, getQuotaLockMessage, formatQuotaDate } from './grievanceQuota.js';

const now = Date.parse('2026-10-30T10:00:00Z');
const makeIssue = (id, age, extras = {}) => ({ id, studentId: 'S-1', createdAt: new Date(now - age).toISOString(), status: 'Assigned to RO', ...extras });
const quota = issues => getGrievanceQuota({ issues, studentId: 'S-1', now });

test('two recent issues occupy both slots regardless of resolution, feedback, or archiving', () => {
  const issues = [makeIssue('A', 1000, { status: 'Resolved', feedback: { rating: 5 }, shiftedToLocalStorage: true }), makeIssue('B', 2000, { status: 'Closed' })];
  const result = quota(issues);
  assert.equal(result.usedCount, 2);
  assert.equal(result.isLocked, true);
  assert.equal(result.remainingQuota, 0);
  assert.equal(result.nextSlotAvailableAt, new Date(now - 2000 + GRIEVANCE_LOCK_MS).toISOString());
});

test('feedback never shortens or extends the original seven-day lock', () => {
  const original = makeIssue('A', 1000);
  const submittedFeedback = { ...original, status: 'Resolved', feedback: { submittedAt: new Date(now).toISOString() }, resolvedAt: new Date(now).toISOString() };
  assert.equal(quota([original]).slots[0].unlocksAt, quota([submittedFeedback]).slots[0].unlocksAt);
});

test('a slot stays locked one millisecond before seven days and unlocks exactly at the boundary', () => {
  const issue = makeIssue('A', GRIEVANCE_LOCK_MS - 1);
  assert.equal(quota([issue]).usedCount, 1);
  assert.equal(getGrievanceQuota({ issues: [issue], studentId: 'S-1', now: now + 1 }).usedCount, 0);
});

test('unresolved issues older than seven days no longer consume a weekly slot', () => {
  const result = quota([makeIssue('OLD', GRIEVANCE_LOCK_MS), makeIssue('NEW', 1000)]);
  assert.equal(result.isEligible, true);
  assert.equal(result.usedCount, 1);
  assert.equal(result.remainingQuota, 1);
});

test('each slot has its own rolling deadline rather than a calendar week reset', () => {
  const issues = [makeIssue('A', GRIEVANCE_LOCK_MS - 1000), makeIssue('B', 1000)];
  assert.equal(quota(issues).isLocked, true);
  const afterFirstUnlock = getGrievanceQuota({ issues, studentId: 'S-1', now: now + 1000 });
  assert.equal(afterFirstUnlock.remainingQuota, 1);
  assert.equal(afterFirstUnlock.slots[0].id, 'B');
});

test('quota uses student IDs, not shared names, and deduplicates database and cache records', () => {
  const a = makeIssue('A', 1000, { studentName: 'Same Name' });
  const result = quota([a, { ...a, id: ' a ', studentId: ' s-1 ' }, makeIssue('B', 1000, { studentId: 'S-2', studentName: 'Same Name' })]);
  assert.equal(result.usedCount, 1);
});

test('database column names and original submission timestamps are supported', () => {
  const date = new Date(now - 1000).toISOString();
  const result = quota([{ id: 'A', student_id: 'S-1', created_at: date }, { id: 'A', studentId: 'S-1', createdAt: new Date(now).toISOString() }]);
  assert.equal(result.slots[0].unlocksAt, new Date(now - 1000 + GRIEVANCE_LOCK_MS).toISOString());
});

test('legacy over-quota data unlocks only after enough occupied slots expire', () => {
  const result = quota([makeIssue('A', 3000), makeIssue('B', 2000), makeIssue('C', 1000)]);
  assert.equal(result.nextSlotAvailableAt, new Date(now - 2000 + GRIEVANCE_LOCK_MS).toISOString());
});

test('missing dates fail closed without inventing an unlock time', () => {
  const result = quota([makeIssue('A', 1000, { createdAt: null }), makeIssue('B', 1000, { createdAt: 'invalid' })]);
  assert.equal(result.isLocked, true);
  assert.equal(result.nextSlotAvailableAt, null);
});

test('empty data has two slots and lock notices give an IST unlock time', () => {
  assert.equal(quota([]).remainingQuota, 2);
  const result = quota([makeIssue('A', 1000), makeIssue('B', 2000)]);
  assert.match(getQuotaLockMessage(result), /7 days/);
  assert.match(getQuotaLockMessage(result), /feedback do not unlock/);
  assert.match(formatQuotaDate('2026-10-30T10:00:00Z'), /3:30:00 pm IST/i);
});

test('reopening an existing issue does not count as another submission or restart its clock', () => {
  const issue = makeIssue('A', 1000);
  const reopened = { ...issue, status: 'Re-opened by Student', logs: [{ time: new Date(now).toISOString(), text: 'Re-opened' }] };
  assert.equal(quota([reopened]).usedCount, 1);
  assert.equal(quota([issue]).slots[0].unlocksAt, quota([reopened]).slots[0].unlocksAt);
});
