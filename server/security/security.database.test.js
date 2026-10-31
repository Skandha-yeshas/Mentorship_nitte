import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { initializeSecurity } from './initialize.js';
import { verifyPassword, hashPassword } from './passwords.js';
import { createAuth } from './auth.js';
import { createDataGateway } from './dataGateway.js';
import express from 'express';
import { once } from 'node:events';

test('real PostgreSQL migration preserves account passwords, restricts public access and supports scoped authenticated queries', {
  skip: process.env.SECURITY_DATABASE_TEST !== '1', timeout: 60000
}, async t => {
  dotenv.config({ path: 'server/.env', quiet: true }); dotenv.config({ quiet: true });
  assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await client.connect();
  t.after(async () => { await client.query('ROLLBACK'); await client.end(); });
  await client.query('BEGIN');
  const schema = `security_test_${randomUUID().replaceAll('-', '')}`;
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET LOCAL search_path TO ${schema}`);
  const password = 'Preserved-Fixture-Password!';
  for (const table of ['students', 'mentors', 'ros', 'admins']) {
    await client.query(`CREATE TABLE ${table} (id VARCHAR(50) PRIMARY KEY, name TEXT, email TEXT, password VARCHAR(100), mentor_id TEXT, region TEXT)`);
  }
  await client.query('INSERT INTO admins (id, password) VALUES ($1, $2)', ['ADMIN', await hashPassword(password)]);
  await client.query("INSERT INTO students VALUES ('S1','Alice','a@example.invalid',$1,'M1',NULL), ('S2','Bob','b@example.invalid',$1,'M2',NULL)", [password]);
  await client.query("CREATE TABLE issues (id TEXT PRIMARY KEY, student_id TEXT, ro_id TEXT); INSERT INTO issues VALUES ('I1','S1','R1'), ('I2','S2','R2')");
  await client.query('CREATE TABLE category_videos (category TEXT PRIMARY KEY, title TEXT)');
  await client.query("INSERT INTO category_videos VALUES ('A','A video')");
  await client.query('CREATE POLICY old_public_access ON students FOR ALL USING (true) WITH CHECK (true)');
  const query = (sql, params) => client.query(sql, params?.[0] === 'public' ? [schema, ...params.slice(1)] : params);
  await initializeSecurity(query);
  const users = (await client.query('SELECT id, password FROM students ORDER BY id')).rows;
  assert.equal(users.length, 2);
  assert.notEqual(users[0].password, password);
  assert.equal(await verifyPassword(password, users[0].password), true);
  assert.equal((await client.query('SELECT policyname FROM pg_policies WHERE schemaname = $1', [schema])).rowCount, 0);
  if ((await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'anon'")).rowCount) {
    assert.equal((await client.query("SELECT has_table_privilege('anon', $1, 'SELECT') AS allowed", [`${schema}.students`])).rows[0].allowed, false);
  }
  const app = express(); const auth = createAuth({ query });
  app.use(express.json()); app.use('/api/auth', auth.router); app.use('/api', auth.require); app.use('/api/data', createDataGateway(query));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const root = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(`${root}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'S1', role: 'Student', password }) });
  assert.equal(response.status, 200);
  const cookies = response.headers.getSetCookie();
  const headers = { cookie: cookies.map(cookie => cookie.split(';')[0]).join('; ') };
  const own = await fetch(`${root}/api/data/students`, { headers });
  assert.equal(own.status, 200);
  const rows = await own.json(); assert.deepEqual(rows.map(row => row.id), ['S1']); assert.equal(rows[0].password, undefined);
  const videos = await fetch(`${root}/api/data/category_videos`, { headers });
  assert.equal(videos.status, 200); assert.equal((await videos.json()).length, 1);
  const other = await fetch(`${root}/api/data/issues?student_id=eq.S2`, { headers });
  assert.equal(other.status, 200); assert.deepEqual(await other.json(), []);
  const csrf = cookies.find(cookie => cookie.startsWith('nitte_csrf='))?.split(';')[0].slice('nitte_csrf='.length);
  const changed = await fetch(`${root}/api/auth/change-password`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ currentPassword: password, newPassword: 'Changed-Fixture-Password!' })
  });
  assert.equal(changed.status, 200);
  assert.equal((await fetch(`${root}/api/auth/session`, { headers })).status, 401);
  const relogin = async newPassword => fetch(`${root}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'S1', role: 'Student', password: newPassword }) });
  assert.equal((await relogin(password)).status, 401);
  assert.equal((await relogin('Changed-Fixture-Password!')).status, 200);
});
