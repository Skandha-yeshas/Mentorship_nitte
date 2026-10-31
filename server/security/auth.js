import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { hashPassword, verifyPassword, validatePassword } from './passwords.js';

export const roleTables = Object.freeze({ Admin: 'admins', Student: 'students', Mentor: 'mentors', RO: 'ros' });
const digest = value => createHash('sha256').update(value).digest('hex');
const cookie = (req, name) => (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1);
export const publicUser = (row, role) => Object.fromEntries(Object.entries({ id: row.id, role, name: row.name, email: row.email,
  mentorId: row.mentor_id, branch: row.branch, sem: row.sem, dept: row.dept, region: row.region }).filter(([, value]) => value !== undefined));

export function createAuth({ query, now = Date.now, secure = false }) {
  const options = { httpOnly: true, sameSite: 'strict', secure, path: '/api' };
  const csrfOptions = { httpOnly: false, sameSite: 'strict', secure, path: '/' };
  const failures = new Map();
  const failedMessage = 'Incorrect account ID, role, or password.';
  let dummyHash;
  async function userForSession(req) {
    const token = cookie(req, 'nitte_session');
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const result = await query('SELECT user_id, user_role, csrf_hash FROM auth_sessions WHERE token_hash = $1 AND expires_at > $2', [digest(token), new Date(now())]);
    const session = result.rows[0];
    if (!session || !roleTables[session.user_role]) return null;
    const user = (await query(`SELECT * FROM ${roleTables[session.user_role]} WHERE id = $1`, [session.user_id])).rows[0];
    return user ? { user: publicUser(user, session.user_role), csrfHash: session.csrf_hash, tokenHash: digest(token) } : null;
  }
  async function requireSession(req, res, next) {
    try {
      const session = await userForSession(req);
      if (!session) return res.status(401).json({ error: 'Please sign in to continue.' });
      req.user = session.user;
      req.authSession = session;
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const csrf = req.get('X-CSRF-Token');
        if (!csrf || digest(csrf) !== session.csrfHash) return res.status(403).json({ error: 'Your security token is missing or expired. Refresh and try again.' });
      }
      next();
    } catch { res.status(503).json({ error: 'Sign-in verification is temporarily unavailable.' }); }
  }
  async function issue(user, res) {
    const token = randomBytes(32).toString('base64url');
    const csrf = randomBytes(32).toString('base64url');
    const lifetime = 8 * 60 * 60 * 1000;
    await query('INSERT INTO auth_sessions (token_hash, user_id, user_role, csrf_hash, expires_at) VALUES ($1, $2, $3, $4, $5)', [digest(token), user.id, user.role, digest(csrf), new Date(now() + lifetime)]);
    res.cookie('nitte_session', token, { ...options, maxAge: lifetime });
    res.cookie('nitte_csrf', csrf, { ...csrfOptions, maxAge: lifetime });
  }
  function clear(res) {
    res.clearCookie('nitte_session', options);
    res.clearCookie('nitte_csrf', csrfOptions);
    res.clearCookie('nitte_recording_session', { ...options, path: '/api/recordings' });
  }
  const router = express.Router();
  router.post('/login', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { id, email, password, role } = req.body || {};
    const identifier = String(email || id || '').trim();
    if (!roleTables[role] || !identifier || identifier.length > 150 || typeof password !== 'string' || !password || password.length > 128) return res.status(400).json({ error: 'Enter a valid account ID, role, and password.' });
    const key = `${role}:${identifier.toLowerCase()}`;
    const attempt = failures.get(key);
    if (attempt && attempt.until > now() && attempt.count >= 10) return res.status(429).set('Retry-After', String(Math.ceil((attempt.until - now()) / 1000))).json({ error: 'Too many unsuccessful attempts for this account. Try again in 15 minutes.' });
    try {
      const users = (await query(`SELECT * FROM ${roleTables[role]} WHERE UPPER(id) = UPPER($1) OR LOWER(email) = LOWER($1) LIMIT 100`, [identifier])).rows;
      const exact = users.find(user => String(user.id).toLowerCase() === identifier.toLowerCase());
      if (!exact && users.length > 1) return res.status(401).json({ error: 'This email is shared by several accounts. Sign in using your institutional account ID.' });
      const candidates = exact ? [exact] : users;
      let verified;
      // Shared institutional test inboxes may belong to several existing accounts. IDs remain unambiguous.
      for (const user of candidates) if (await verifyPassword(password, user.password)) { verified = user; break; }
      if (!verified) {
        if (!candidates.length) { dummyHash ||= hashPassword(randomBytes(24).toString('base64url')); await verifyPassword(password, await dummyHash); }
        for (const [entryKey, entry] of failures) if (entry.until <= now()) failures.delete(entryKey);
        if (failures.size > 10000) failures.clear();
        failures.set(key, { count: attempt && attempt.until > now() ? attempt.count + 1 : 1, until: attempt && attempt.until > now() ? attempt.until : now() + 15 * 60 * 1000 });
        return res.status(401).json({ error: failedMessage });
      }
      failures.delete(key);
      const oldToken = cookie(req, 'nitte_session');
      if (oldToken) await query('DELETE FROM auth_sessions WHERE token_hash = $1', [digest(oldToken)]);
      const user = publicUser(verified, role);
      await issue(user, res);
      res.json({ success: true, user });
    } catch { res.status(503).json({ error: 'Sign-in is temporarily unavailable. Please try again.' }); }
  });
  router.get('/session', requireSession, (req, res) => res.set('Cache-Control', 'no-store').json({ user: req.user }));
  router.post('/logout', requireSession, async (req, res) => {
    try { await query('DELETE FROM auth_sessions WHERE token_hash = $1', [req.authSession.tokenHash]); clear(res); res.status(204).end(); }
    catch { res.status(503).json({ error: 'Could not end your session. Please retry.' }); }
  });
  router.post('/change-password', requireSession, async (req, res) => {
    try {
      validatePassword(req.body.newPassword);
      const table = roleTables[req.user.role];
      const row = (await query(`SELECT password FROM ${table} WHERE id = $1`, [req.user.id])).rows[0];
      if (!await verifyPassword(req.body.currentPassword, row?.password)) return res.status(401).json({ error: 'Your current password is incorrect.' });
      await query(`UPDATE ${table} SET password = $1 WHERE id = $2`, [await hashPassword(req.body.newPassword), req.user.id]);
      await query('DELETE FROM auth_sessions WHERE user_id = $1 AND user_role = $2', [req.user.id, req.user.role]);
      clear(res);
      res.json({ success: true, message: 'Password changed. Sign in again.' });
    } catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Could not change your password. Please retry.' }); }
  });
  return { router, require: requireSession, userForSession };
}
