import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { createRecordingRepository } from './recordings.js';

test('PostgreSQL stores recording bytes and reads exact seek ranges without changing existing data', { skip: process.env.RECORDING_DATABASE_TEST !== '1', timeout: 30000 }, async () => {
  dotenv.config({ path: 'server/.env', quiet: true });
  dotenv.config({ quiet: true });
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for the database recording test.');
  const local = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: local ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    const security = await client.query("SELECT relrowsecurity FROM pg_class WHERE oid = 'meeting_recordings'::regclass");
    assert.equal(security.rows[0]?.relrowsecurity, true, 'Recordings must not be publicly readable through PostgREST');
    const { rows } = await client.query('SELECT id, ro_id FROM issues WHERE ro_id IS NOT NULL LIMIT 1');
    assert.ok(rows[0], 'An assigned issue is required to test the recording foreign key.');
    const repository = createRecordingRepository((sql, params) => client.query(sql, params));
    const actor = { id: rows[0].ro_id, role: 'RO' };
    const bytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Array.from({ length: 512 }, (_, i) => i % 256)]);
    const id = `REC-${randomUUID()}`;
    await repository.save({ id, meetingId: `MEET-TEST-${randomUUID()}`, issueId: rows[0].id, bytes, mimeType: 'video/webm', durationSeconds: 2, transcriptSummary: 'Transactional recording storage verification' }, actor);
    const stored = await repository.find(id, actor);
    assert.equal(Number(stored.byte_size), bytes.length);
    assert.equal(stored.mime_type, 'video/webm');
    assert.deepEqual(await repository.readBytes(id), bytes);
    assert.deepEqual(await repository.readBytes(id, { start: 50, length: 120 }), bytes.subarray(50, 170));
    assert.equal(await repository.find(id, { id: `OTHER-${randomUUID()}`, role: 'RO' }), null);
    const anonRole = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'anon'");
    if (anonRole.rowCount) {
      const grants = await client.query("SELECT has_table_privilege('anon', 'meeting_recordings', 'SELECT') AS allowed");
      assert.equal(grants.rows[0].allowed, false, 'Anonymous role must have no recording table privileges');
    }

  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
