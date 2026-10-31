import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createAuth } from './auth.js';
import { createAccessPolicy } from './access.js';
import { createDataGateway } from './dataGateway.js';
import { scopeState } from './scopedState.js';
import { hashPassword, verifyPassword } from './passwords.js';

const secret = 'Security-Test-Password-903!';
const encoded = await hashPassword(secret);
const students = [{ id: 'S-A', name: 'Alice', email: 'alice@example.invalid', mentor_id: 'M-A', password: encoded }, { id: 'S-B', name: 'Bob', email: 'bob@example.invalid', mentor_id: 'M-B', password: encoded }];
const issues = [{ id: 'ISS-A', student_id: 'S-A', ro_id: 'RO-A' }, { id: 'ISS-B', student_id: 'S-B', ro_id: 'RO-B' }];
const state = { users: { students, mentors: [{ id: 'M-A', password: encoded }, { id: 'M-B', password: encoded }], ros: [{ id: 'RO-A', region: 'Academic - A', password: encoded }, { id: 'RO-B', region: 'Hostels - B', password: encoded }] },
  issues, meetings: [{ id: 'MEET-A', issue_id: 'ISS-A' }, { id: 'MEET-B', issue_id: 'ISS-B' }],
  gmailLogs: [{ id: 'mailA', issue_id: 'ISS-A', body: 'private body' }, { id: 'mailB', issue_id: 'ISS-B', body: 'private body' }],
  systemLogs: [{ text: 'Admin-only system event' }], mentorFeedbacks: [], resources: [], groupSessions: [] };

async function fixture(t) {
  const sessions = new Map();
  const calls = [];
  let clock = Date.now();
  let mutations = 0;
  const users = { students, mentors: [{ id: 'M-A', role: 'Mentor', name: 'Mentor A', password: encoded }], ros: [{ id: 'RO-A', name: 'Officer A', region: 'Academic - A', password: encoded }], admins: [{ id: 'ADMIN', name: 'Admin', password: encoded }] };
  const query = async (sql, params = []) => {
    calls.push({ sql, params });
    if (sql.startsWith('INSERT INTO auth_sessions')) { sessions.set(params[0], { user_id: params[1], user_role: params[2], csrf_hash: params[3], expires_at: params[4] }); return { rows: [], rowCount: 1 }; }
    if (sql.startsWith('SELECT user_id')) { const row = sessions.get(params[0]); return { rows: row && row.expires_at > params[1] ? [row] : [] }; }
    if (sql.startsWith('DELETE FROM auth_sessions WHERE token_hash')) { sessions.delete(params[0]); return { rows: [], rowCount: 1 }; }
    const userTable = /^SELECT \* FROM (students|mentors|ros|admins)/.exec(sql)?.[1];
    if (userTable) return { rows: users[userTable].filter(user => String(user.id).toUpperCase() === String(params[0]).toUpperCase() || sql.includes('LOWER(email)') && user.email === String(params[0]).toLowerCase()) };
    if (sql.startsWith('SELECT id, student_id, ro_id FROM issues')) return { rows: issues.filter(issue => issue.id === params[0]) };
    if (sql.startsWith('SELECT id, name, email, mentor_id FROM students')) return { rows: students.filter(student => student.id === params[0]) };
    if (sql.startsWith('SELECT issue_id FROM meetings')) return { rows: state.meetings.filter(row => row.id === params[0] || row.issue_id === params[0]) };
    if (sql.startsWith('SELECT region FROM ros')) return { rows: users.ros.filter(row => row.id === params[0]) };
    if (sql.includes('information_schema.columns')) return { rows: ['id', 'name', 'student_id', 'mentor_id', 'ro_id', 'category', 'password'].map(column_name => ({ column_name })) };
    if (sql.startsWith('SELECT')) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  };
  const auth = createAuth({ query, now: () => clock });
  const app = express();
  app.use(express.json());
  app.use('/api/auth', auth.router);
  app.use('/api', auth.require);
  app.use('/api', createAccessPolicy(query).middleware);
  app.use('/api/data', createDataGateway(query));
  app.get('/api/db-state', (req, res) => res.json(scopeState(state, req.user)));
  app.post('/api/admin/delete-all-students', (req, res) => { mutations++; res.json({ success: true }); });
  app.put('/api/issues/:id/resolve', (req, res) => { mutations++; res.json({ actor: req.body.roId, role: req.body.userRole }); });
  app.post('/api/meetings/signal', (req, res) => res.json(req.body));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const root = `http://127.0.0.1:${server.address().port}`;
  const login = async (id, role, password = secret) => {
    const response = await fetch(`${root}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, role, password }) });
    const cookies = response.headers.getSetCookie();
    const headers = { cookie: cookies.map(value => value.split(';')[0]).join('; '), 'Content-Type': 'application/json' };
    const csrf = cookies.find(value => value.startsWith('nitte_csrf='))?.split(';')[0].slice('nitte_csrf='.length);
    if (csrf) headers['X-CSRF-Token'] = csrf;
    return { response, headers, cookies };
  };
  return { root, login, calls, query, expire: () => { clock += 9 * 3600000; }, mutations: () => mutations, sessions };
}

test('passwords are salted hashes and plain strings are never accepted as stored verifiers', async () => {
  const first = await hashPassword(secret);
  const second = await hashPassword(secret);
  assert.notEqual(first, second); assert.ok(!first.includes(secret));
  assert.equal(await verifyPassword(secret, first), true);
  assert.equal(await verifyPassword('wrong', first), false);
  assert.equal(await verifyPassword(secret, secret), false);
});

test('anonymous users cannot read dashboards or call destructive administrative endpoints', async t => {
  const { root, mutations } = await fixture(t);
  assert.equal((await fetch(`${root}/api/db-state`)).status, 401);
  assert.equal((await fetch(`${root}/api/admin/delete-all-students`, { method: 'POST' })).status, 401);
  assert.equal(mutations(), 0);
});

test('password bypasses and client-controlled Admin roles do not authenticate', async t => {
  const { login } = await fixture(t);
  for (const password of ['Admin@2026', 'Nitte@2026', 'Nit#anything']) {
    const attempt = await login('ADMIN', 'Admin', password);
    assert.equal(attempt.response.status, 401);
    assert.equal(attempt.cookies.length, 0);
  }
  assert.equal((await login('S-A', 'Admin')).response.status, 401);
});

test('successful login returns a cookie, never a stored password or browser-readable session token', async t => {
  const { login } = await fixture(t);
  const { response, cookies } = await login('S-A', 'Student');
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.id, 'S-A'); assert.equal(body.user.role, 'Student');
  assert.equal(body.user.password, undefined); assert.equal(body.token, undefined);
  assert.match(cookies.find(value => value.startsWith('nitte_session=')), /HttpOnly/);
  assert.match(cookies[0], /SameSite=Strict/);
});

test('a student cannot become Admin or change another student ticket by forging IDs', async t => {
  const { root, login, mutations } = await fixture(t);
  const { headers } = await login('S-A', 'Student');
  const options = { method: 'POST', headers, body: JSON.stringify({ role: 'Admin', studentId: 'S-B' }) };
  assert.equal((await fetch(`${root}/api/admin/delete-all-students`, options)).status, 403);
  assert.equal((await fetch(`${root}/api/issues/ISS-B/resolve`, { ...options, method: 'PUT' })).status, 403);
  assert.equal(mutations(), 0);
});

test('mutating requests require a CSRF token and server overrides actor IDs', async t => {
  const { root, login } = await fixture(t);
  const { headers } = await login('S-A', 'Student');
  const missing = { ...headers }; delete missing['X-CSRF-Token'];
  assert.equal((await fetch(`${root}/api/issues/ISS-A/resolve`, { method: 'PUT', headers: missing, body: '{}' })).status, 403);
  const response = await fetch(`${root}/api/issues/ISS-A/resolve`, { method: 'PUT', headers, body: JSON.stringify({ roId: 'RO-B', userRole: 'Admin' }) });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { actor: 'S-A', role: 'Student' });
});

test('dashboard responses contain only permitted records and remove passwords and raw email bodies', async t => {
  const { root, login } = await fixture(t);
  const { headers } = await login('S-A', 'Student');
  const response = await fetch(`${root}/api/db-state`, { headers });
  const body = await response.json();
  assert.deepEqual(body.users.students.map(row => row.id), ['S-A']);
  assert.deepEqual(body.issues.map(row => row.id), ['ISS-A']);
  assert.deepEqual(body.meetings.map(row => row.id), ['MEET-A']);
  assert.equal(JSON.stringify(body).includes(encoded), false);
  assert.equal(JSON.stringify(body).includes('private body'), false);
  assert.deepEqual(body.systemLogs, []);
});

test('RO and mentor state scopes exclude another officer or mentor records', () => {
  const ro = scopeState(state, { id: 'RO-A', role: 'RO' });
  assert.deepEqual(ro.issues.map(row => row.id), ['ISS-A']);
  assert.deepEqual(ro.users.students.map(row => row.id), ['S-A']);
  assert.deepEqual(ro.users.ros.map(row => row.id), ['RO-A']);
  const mentor = scopeState(state, { id: 'M-A', role: 'Mentor' });
  assert.deepEqual(mentor.users.students.map(row => row.id), ['S-A']);
  assert.deepEqual(mentor.issues.map(row => row.id), ['ISS-A']);
});

test('database-backed sessions work with a fresh auth instance and expire or revoke correctly', async t => {
  const { root, login, query, expire } = await fixture(t);
  const { headers } = await login('S-A', 'Student');
  const restored = await createAuth({ query }).userForSession({ headers });
  assert.equal(restored.user.id, 'S-A');
  assert.equal((await fetch(`${root}/api/auth/logout`, { method: 'POST', headers })).status, 204);
  assert.equal((await fetch(`${root}/api/auth/session`, { headers })).status, 401);
  const next = await login('S-A', 'Student');
  expire();
  assert.equal((await fetch(`${root}/api/auth/session`, { headers: next.headers })).status, 401);
});

test('data gateway prevents student writes, credential filters, and access to internal authentication tables', async t => {
  const { root, login } = await fixture(t);
  const { headers } = await login('S-A', 'Student');
  assert.equal((await fetch(`${root}/api/data/issues`, { method: 'POST', headers, body: JSON.stringify({ id: 'ISS-B' }) })).status, 403);
  assert.equal((await fetch(`${root}/api/data/students?password=eq.secret`, { headers })).status, 400);
  assert.equal((await fetch(`${root}/api/data/auth_sessions`, { headers })).status, 404);
});

test('data gateway combines user-supplied OR filters with the server-owned student scope', async t => {
  const { root, login, calls } = await fixture(t);
  const { headers } = await login('S-A', 'Student');
  assert.equal((await fetch(`${root}/api/data/issues?or=(id.eq.ISS-A,id.eq.ISS-B)`, { headers })).status, 200);
  const select = calls.findLast(call => call.sql.startsWith('SELECT') && call.sql.includes('FROM "issues"'));
  assert.match(select.sql, /WHERE UPPER\(student_id\) = UPPER\(\$1\) AND/);
  assert.deepEqual(select.params.slice(0, 3), ['S-A', 'ISS-A', 'ISS-B']);
});
