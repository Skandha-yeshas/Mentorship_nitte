import test from 'node:test';
import assert from 'node:assert/strict';
import { createIssueQuotaReader, createStudentSubmissionLock } from './issueQuota.js';

const now = Date.parse('2026-10-30T10:00:00Z');
const issue = id => ({ id, student_id: 'S-1', created_at: new Date(now - 1000).toISOString(), status: 'Resolved' });
const reader = overrides => createIssueQuotaReader({
  query: async () => ({ rows: [] }), isDbConnected: () => true,
  fetchCloudIssues: async () => [], getMemoryIssues: () => [], now: () => now,
  ...overrides
});

test('server quota counts resolved issues from both stores without double counting', async () => {
  const read = reader({ query: async () => ({ rows: [issue('A'), issue('B')] }), fetchCloudIssues: async () => [issue('A'), issue('B')], getMemoryIssues: () => [issue('A')] });
  const quota = await read('S-1');
  assert.equal(quota.usedCount, 2);
  assert.equal(quota.isLocked, true);
});

test('server can verify the quota when either persistent source is available', async () => {
  const dbDown = reader({ isDbConnected: () => false, fetchCloudIssues: async () => [issue('A'), issue('B')] });
  assert.equal((await dbDown('S-1')).isLocked, true);
  const cloudDown = reader({ fetchCloudIssues: async () => { throw new Error('Offline'); }, query: async () => ({ rows: [issue('A'), issue('B')] }) });
  assert.equal((await cloudDown('S-1')).isLocked, true);
});

test('server refuses unverified submissions when both persistent stores are unavailable', async () => {
  const read = reader({ isDbConnected: () => false, fetchCloudIssues: async () => { throw new Error('Offline'); } });
  await assert.rejects(read('S-1'), /Cannot verify the 7-day grievance quota/);
});

test('simultaneous submissions are serialized so only two can consume slots', async () => {
  const memory = [];
  const acquire = createStudentSubmissionLock();
  const read = reader({ getMemoryIssues: () => memory });
  const results = await Promise.all([1, 2, 3].map(async id => {
    const release = await acquire('S-1');
    try {
      const quota = await read('S-1');
      if (quota.isLocked) return 'blocked';
      memory.push(issue(String(id)));
      return 'assigned-to-ro';
    } finally { release(); }
  }));
  assert.deepEqual(results, ['assigned-to-ro', 'assigned-to-ro', 'blocked']);
  assert.equal(memory.length, 2);
});

test('a lock for one student does not block another student', async () => {
  const acquire = createStudentSubmissionLock();
  const releaseFirst = await acquire('S-1');
  const releaseOther = await acquire('S-2');
  releaseOther();
  releaseFirst();
  const releaseAgain = await acquire(' s-1 ');
  releaseAgain();
});
