import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import dotenv from 'dotenv';
import { createAdminAnalyticsReader } from './adminAnalytics.js';

test('Admin analytics match live PostgreSQL counts and resolution durations using a read-only snapshot', {
  skip: process.env.ADMIN_ANALYTICS_DATABASE_TEST !== '1', timeout: 30000
}, async () => {
  dotenv.config({ path: 'server/.env', quiet: true });
  dotenv.config({ quiet: true });
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
  const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const data = await createAdminAnalyticsReader((sql, params) => client.query(sql, params))();
    const { rows: [expected] } = await client.query(`SELECT COUNT(*)::integer AS total,
      COUNT(*) FILTER (WHERE UPPER(TRIM(status)) NOT IN ('RESOLVED', 'CLOSED'))::integer AS active,
      COUNT(*) FILTER (WHERE UPPER(TRIM(status)) IN ('RESOLVED', 'CLOSED'))::integer AS resolved,
      AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600)
        FILTER (WHERE UPPER(TRIM(status)) IN ('RESOLVED', 'CLOSED') AND resolved_at >= created_at) AS average
      FROM issues`);
    assert.equal(data.totals.totalIssues, expected.total);
    assert.equal(data.totals.activeIssues, expected.active);
    assert.equal(data.totals.resolvedIssues, expected.resolved);
    assert.equal(data.domains.reduce((sum, row) => sum + row.count, 0), expected.active);
    assert.equal(data.branches.reduce((sum, row) => sum + row.totalTickets, 0), expected.total);
    const students = await client.query('SELECT COUNT(*)::integer AS count FROM students');
    const mentors = await client.query('SELECT COUNT(*)::integer AS count FROM mentors');
    assert.equal(data.branches.reduce((sum, row) => sum + row.enrolled, 0), students.rows[0].count);
    assert.equal(data.branches.reduce((sum, row) => sum + row.mentorCount, 0), mentors.rows[0].count);
    if (expected.average === null) assert.equal(data.totals.averageResolutionHours, null);
    else assert.ok(Math.abs(data.totals.averageResolutionHours - Number(expected.average)) < 0.000001);
    if (process.env.ADMIN_ANALYTICS_APP_URL) {
      const response = await fetch(`${process.env.ADMIN_ANALYTICS_APP_URL}/api/admin/analytics`);
      assert.equal(response.status, 200);
      const live = await response.json();
      assert.equal(live.source, 'database');
      assert.ok(Array.isArray(live.domains));
      assert.ok(Array.isArray(live.branches));
      assert.ok(Date.now() - Date.parse(live.generatedAt) < 10000);
    }
  } finally { await client.query('ROLLBACK'); await client.end(); }
});
