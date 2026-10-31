import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoPriorityRank, sortRoIssuesByPriority, getRoIssueReadKey, getRoMeetingReadKey, RO_SEEN_STORAGE_KEY, readRoSeenEntries, markRoItemsSeen } from './roInbox.js';

const issue = { id: 'ISS-1', roId: 'RO-01', createdAt: '2026-10-30T10:00:00Z', priority: 'HIGH' };
const meeting = { id: 'MEET-1', issueId: issue.id, roId: issue.roId, date: '2026-10-31', time: '10:00', status: 'Confirmed' };
function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
}

test('incoming issues are ordered High, Medium, Low regardless of capitalization', () => {
  const items = [{ ...issue, id: 'LOW', priority: 'low' }, { ...issue, id: 'MEDIUM', priority: 'Medium' }, { ...issue, id: 'HIGH', priority: 'HIGH' }];
  assert.deepEqual(sortRoIssuesByPriority(items).map(item => item.id), ['HIGH', 'MEDIUM', 'LOW']);
  assert.deepEqual(items.map(item => item.id), ['LOW', 'MEDIUM', 'HIGH']);
});

test('newer arrivals appear first only within the same priority', () => {
  const items = [
    { ...issue, id: 'OLDER-HIGH', createdAt: '2026-10-29T10:00:00Z' },
    { ...issue, id: 'NEWER-LOW', priority: 'LOW', createdAt: '2026-10-31T10:00:00Z' },
    { ...issue, id: 'NEWER-HIGH', createdAt: '2026-10-30T10:00:00Z' }
  ];
  assert.deepEqual(sortRoIssuesByPriority(items).map(item => item.id), ['NEWER-HIGH', 'OLDER-HIGH', 'NEWER-LOW']);
  assert.equal(getRoPriorityRank(undefined), 1);
  assert.equal(getRoPriorityRank(' Normal '), 1);
});

test('an item starts unseen and opening it persists the seen state through reload', () => {
  const storage = memoryStorage();
  const key = getRoIssueReadKey('RO-01', issue);
  assert.equal(Boolean(readRoSeenEntries(storage)[key]), false);
  const result = markRoItemsSeen({}, [key], storage, '2026-10-30T11:00:00Z');
  assert.equal(result[key], '2026-10-30T11:00:00Z');
  assert.equal(readRoSeenEntries(storage)[key], result[key]);
});

test('one RO opening an item does not mark it seen for another RO', () => {
  const firstKey = getRoIssueReadKey('RO-01', issue);
  const otherKey = getRoIssueReadKey('RO-02', issue);
  const seen = markRoItemsSeen({}, [firstKey], memoryStorage());
  assert.equal(Boolean(seen[firstKey]), true);
  assert.equal(Boolean(seen[otherKey]), false);
});

test('opening an issue can mark that issue and its meeting seen together', () => {
  const issueKey = getRoIssueReadKey('RO-01', issue);
  const meetingKey = getRoMeetingReadKey('RO-01', meeting);
  const seen = markRoItemsSeen({}, [issueKey, meetingKey], memoryStorage());
  assert.equal(Boolean(seen[issueKey]), true);
  assert.equal(Boolean(seen[meetingKey]), true);
  assert.equal(Object.keys(seen).length, 2);
});

test('seeing one item never clears the New badge on another incoming issue or meeting', () => {
  const selectedKey = getRoIssueReadKey('RO-01', issue);
  const otherIssueKey = getRoIssueReadKey('RO-01', { ...issue, id: 'ISS-2' });
  const otherMeetingKey = getRoMeetingReadKey('RO-01', { ...meeting, id: 'MEET-2', issueId: 'ISS-2' });
  const seen = markRoItemsSeen({}, [selectedKey], memoryStorage());
  assert.equal(Boolean(seen[otherIssueKey]), false);
  assert.equal(Boolean(seen[otherMeetingKey]), false);
});

test('polling, priority edits, and meeting status changes do not reset already seen items', () => {
  assert.equal(getRoIssueReadKey('RO-01', issue), getRoIssueReadKey('RO-01', { ...issue, priority: 'LOW', status: 'Meeting Started' }));
  assert.equal(getRoMeetingReadKey('RO-01', meeting), getRoMeetingReadKey('RO-01', { ...meeting, status: 'Started' }));
  assert.equal(getRoMeetingReadKey('RO-01', meeting), getRoMeetingReadKey('RO-01', { ...meeting, status: 'Completed' }));
});

test('a rescheduled slot or a new meeting gets its own unread marker', () => {
  const key = getRoMeetingReadKey('RO-01', meeting);
  assert.notEqual(key, getRoMeetingReadKey('RO-01', { ...meeting, time: '11:00' }));
  assert.notEqual(key, getRoMeetingReadKey('RO-01', { ...meeting, date: '2026-11-01' }));
  assert.notEqual(key, getRoMeetingReadKey('RO-01', { ...meeting, id: 'MEET-NEW' }));
});

test('equivalent database and cache formats use the same read key', () => {
  assert.equal(getRoIssueReadKey('RO-01', issue), getRoIssueReadKey(' ro-01 ', { issue_id: ' iss-1 ', created_at: '2026-10-30T10:00:00.000Z' }));
  assert.equal(getRoMeetingReadKey('RO-01', meeting), getRoMeetingReadKey(' ro-01 ', { ...meeting, time: '10:00:00' }));
});

test('marking an item preserves read entries written by another browser tab', () => {
  const storage = memoryStorage();
  const key = getRoIssueReadKey('RO-01', issue);
  const otherKey = getRoIssueReadKey('RO-02', issue);
  markRoItemsSeen({}, [otherKey], storage);
  const seen = markRoItemsSeen({}, [key], storage);
  assert.equal(Boolean(seen[key]), true);
  assert.equal(Boolean(seen[otherKey]), true);
});

test('bad or unavailable browser storage does not break the inbox', () => {
  const corrupt = memoryStorage();
  corrupt.setItem(RO_SEEN_STORAGE_KEY, '{not json');
  assert.deepEqual(readRoSeenEntries(corrupt), {});
  const blocked = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Blocked'); } };
  const key = getRoIssueReadKey('RO-01', issue);
  assert.deepEqual(readRoSeenEntries(blocked), {});
  assert.equal(Boolean(markRoItemsSeen({}, [key], blocked)[key]), true);
});

test('opening an already seen item preserves its original read time and unchanged state', () => {
  const key = getRoIssueReadKey('RO-01', issue);
  const entries = { [key]: '2026-10-30T11:00:00Z' };
  assert.equal(markRoItemsSeen(entries, [key], memoryStorage(), '2026-10-31T11:00:00Z'), entries);
  assert.equal(getRoIssueReadKey('RO-01', null), '');
  assert.equal(getRoMeetingReadKey('RO-01', null), '');
});
