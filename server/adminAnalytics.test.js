import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { buildAdminAnalytics, createAdminAnalyticsReader, createAdminAnalyticsRouter } from './adminAnalytics.js';

const now = new Date('2026-10-30T12:00:00Z');
const issue = (id, overrides = {}) => ({ id, student_id: 'S-1', category: 'Academic - Course Enrollment issues', status: 'Assigned to RO', ...overrides });

test('empty database has zero counts, no invented branches, and no fabricated resolution durations', () => {
  const data = buildAdminAnalytics({}, now);
  assert.equal(data.source, 'database');
  assert.equal(data.generatedAt, now.toISOString());
  assert.equal(data.totals.totalIssues, 0);
  assert.equal(data.totals.activeIssues, 0);
  assert.equal(data.totals.averageResolutionHours, null);
  assert.deepEqual(data.branches, []);
  assert.ok(data.domains.every(domain => domain.count === 0 && domain.percentage === 0));
});

test('each active issue contributes to exactly one domain using its submitted category', () => {
  const issues = [
    issue('1', { category: 'Academic - Lab equipment issues' }),
    issue('2', { category: 'Financial - Hostel fee payment extension' }),
    issue('3', { category: 'Financial - Exam fee payment failure' }),
    issue('4', { category: 'Exams - Revaluation/Re-totalling requests' }),
    issue('5', { category: 'Hostels - Wi-Fi connectivity issues' }),
    issue('6', { category: 'Facilities - Campus transport routes' }),
    issue('7', { category: 'Personal - Stress & anxiety management' }),
    issue('8', { category: 'Placements - Interview scheduling clashes' }),
    issue('9', { category: 'Unknown domain' }),
    issue('10', { category: 'Academic - Attendance shortage clarification', status: 'Resolved' }),
    issue('11', { category: 'Academic', status: 'closed' })
  ];
  const data = buildAdminAnalytics({ issues }, now);
  const counts = Object.fromEntries(data.domains.map(domain => [domain.domain, domain.count]));
  assert.equal(data.totals.activeIssues, 9);
  assert.equal(counts.Academic, 1);
  assert.equal(counts.Financial, 2);
  assert.equal(counts.Exams, 1);
  assert.equal(counts.Hostels, 1);
  assert.equal(counts['Other / Unclassified'], 1);
  assert.equal(data.domains.reduce((sum, domain) => sum + domain.count, 0), data.totals.activeIssues);
  assert.ok(Math.abs(data.domains.reduce((sum, domain) => sum + domain.percentage, 0) - 100) < 0.0001);
});

test('branch enrollment, mentors, active cases, resolution rate and average duration use stored records', () => {
  const data = buildAdminAnalytics({
    students: [{ id: 's-1', branch: ' bca ' }, { id: 'S-2', branch: 'BCA' }, { id: 'S-3', branch: 'MBA' }],
    mentors: [{ id: 'M-1', dept: 'bca' }, { id: 'M-2', dept: 'MBA' }, { id: 'M-3', dept: 'MBA' }],
    issues: [
      issue('1'), issue('2', { student_id: 'S-2', status: 'Escalated' }),
      issue('3', { status: 'Resolved', created_at: '2026-10-28T00:00:00Z', resolved_at: '2026-10-29T00:00:00Z' }),
      issue('4', { student_id: 'S-3', status: 'Closed', created_at: '2026-10-28T00:00:00Z', resolved_at: '2026-10-30T00:00:00Z' })
    ]
  });
  const bca = data.branches.find(branch => branch.code === 'BCA');
  assert.equal(bca.enrolled, 2); assert.equal(bca.mentorCount, 1); assert.equal(bca.activeTickets, 2);
  assert.equal(bca.averageResolutionHours, 24); assert.equal(bca.timedResolutionCount, 1);
  assert.ok(Math.abs(bca.resolutionRate - 100 / 3) < 0.000001);
  const mba = data.branches.find(branch => branch.code === 'MBA');
  assert.equal(mba.enrolled, 1); assert.equal(mba.mentorCount, 2); assert.equal(mba.activeTickets, 0);
  assert.equal(mba.averageResolutionHours, 48); assert.equal(mba.resolutionRate, 100);
  assert.equal(data.totals.averageResolutionHours, 36);
  assert.deepEqual(data.branches.map(branch => branch.code), ['BCA', 'MBA']);
});

test('missing, invalid and stale resolution dates do not fabricate speed metrics', () => {
  const data = buildAdminAnalytics({ students: [{ id: 'S-1', branch: 'CUSTOM' }], issues: [
    issue('missing', { status: 'Resolved' }),
    issue('invalid', { status: 'Resolved', created_at: 'bad', resolved_at: '2026-10-30' }),
    issue('negative', { status: 'Closed', created_at: '2026-10-30', resolved_at: '2026-10-28' }),
    issue('reopened', { status: 'Re-opened by Student', created_at: '2026-10-28', resolved_at: '2026-10-29' })
  ] });
  const row = data.branches[0];
  assert.equal(row.averageResolutionHours, null);
  assert.equal(row.timedResolutionCount, 0);
  assert.equal(row.resolvedCount, 3);
  assert.equal(row.resolutionRate, 75);
  assert.equal(row.activeTickets, 1);
});

test('a zero-hour resolution is valid and branches with no grievances show N/A rates', () => {
  const data = buildAdminAnalytics({ students: [{ id: 'S-1', branch: 'BCA' }, { id: 'S-2', branch: 'CIVIL' }], issues: [
    issue('same-time', { status: 'Resolved', createdAt: '2026-10-30T12:00:00Z', resolvedAt: '2026-10-30T12:00:00Z' })
  ] });
  assert.equal(data.branches.find(branch => branch.code === 'BCA').averageResolutionHours, 0);
  assert.equal(data.branches.find(branch => branch.code === 'CIVIL').resolutionRate, null);
});

test('orphaned issues and missing branch assignments remain visible instead of being silently dropped', () => {
  const data = buildAdminAnalytics({ students: [{ id: 'S-1', branch: '' }], mentors: [{ id: 'M-1', dept: '' }], issues: [issue('one'), issue('orphan', { student_id: 'UNKNOWN', category: '' })] });
  assert.equal(data.branches.length, 1);
  assert.equal(data.branches[0].code, '__UNASSIGNED__');
  assert.equal(data.branches[0].activeTickets, 2);
  assert.equal(data.branches[0].enrolled, 1);
  assert.equal(data.branches[0].mentorCount, 1);
  assert.equal(data.domains.find(domain => domain.domain === 'Other / Unclassified').count, 1);
});

test('reader queries persisted tables only and fails rather than returning samples on database errors', async () => {
  const queried = [];
  const read = createAdminAnalyticsReader(async sql => { queried.push(sql); return { rows: [] }; }, () => now);
  assert.equal((await read()).totals.totalIssues, 0);
  assert.equal(queried.length, 3);
  assert.ok(queried.some(sql => sql.includes('FROM issues')));
  assert.ok(queried.some(sql => sql.includes('FROM students')));
  assert.ok(queried.some(sql => sql.includes('FROM mentors')));
  assert.ok(queried.every(sql => !/password|email|logs|media_data/i.test(sql)));
  await assert.rejects(createAdminAnalyticsReader(async () => { throw new Error('database offline'); })(), /database offline/);
});

test('analytics HTTP route disables caching and returns an explicit unavailable response without mock data', async t => {
  let unavailable = false;
  const app = express();
  app.use('/api/admin/analytics', createAdminAnalyticsRouter({ read: async () => {
    if (unavailable) throw new Error('test database offline');
    return buildAdminAnalytics({}, now);
  } }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/analytics`;
  const response = await fetch(url);
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await response.json()).source, 'database');
  unavailable = true;
  t.mock.method(console, 'warn', () => {});
  const failed = await fetch(url);
  assert.equal(failed.status, 503);
  const body = await failed.json();
  assert.match(body.error, /unavailable/);
  assert.equal(body.domains, undefined); assert.equal(body.branches, undefined);
});
