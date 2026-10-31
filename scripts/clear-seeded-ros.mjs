import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: fileURLToPath(new URL('../server/.env', import.meta.url)), quiet: true });
dotenv.config({ quiet: true });
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
await client.connect();
try {
  await client.query('BEGIN');
  const counts = async () => (await client.query(`SELECT
    (SELECT COUNT(*)::integer FROM ros) AS ros,
    (SELECT COUNT(*)::integer FROM issues) AS issues,
    (SELECT COUNT(*)::integer FROM meetings) AS meetings,
    (SELECT COUNT(*)::integer FROM students) AS students,
    (SELECT COUNT(*)::integer FROM mentors) AS mentors`)).rows[0];
  const before = await counts();
  assert.equal(before.issues, 0, 'Existing grievances must be handled before removing seeded ROs.');
  assert.equal(before.meetings, 0, 'Existing meetings must be handled before removing seeded ROs.');
  // Only the old generated topic-named accounts are removed; imported people are preserved.
  const deleted = await client.query("DELETE FROM ros WHERE name LIKE 'RO - %' AND COALESCE(TRIM(region), '') = '' RETURNING id");
  const version = `ro-roster-reset:${randomUUID()}`;
  await client.query("INSERT INTO app_settings (key, value) VALUES ('grievance_reset_version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [version]);
  const after = await counts();
  assert.equal(after.ros, before.ros - deleted.rowCount);
  for (const key of ['students', 'mentors', 'issues', 'meetings']) assert.equal(after[key], before[key]);
  await client.query('COMMIT');
  console.log(JSON.stringify({ deletedSeededROs: deleted.rowCount, before, after, cacheResetVersion: version }));
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
