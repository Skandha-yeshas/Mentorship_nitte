import { randomBytes } from 'node:crypto';

export function createRecordingAuth({ now = Date.now, secure = false } = {}) {
  const sessions = new Map();
  const cookieName = 'nitte_recording_session';
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure, path: '/api/recordings' };
  const readToken = req => (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return {
    issue(user, res) {
      if (!['RO', 'Admin'].includes(user.role)) return;
      const token = randomBytes(32).toString('base64url');
      const lifetime = 8 * 60 * 60 * 1000;
      for (const [key, value] of sessions) if (value.expiresAt <= now()) sessions.delete(key);
      sessions.set(token, { user: { id: user.id, role: user.role }, expiresAt: now() + lifetime });
      res.cookie(cookieName, token, { ...cookieOptions, maxAge: lifetime });
    },
    require(req, res, next) {
      const token = readToken(req);
      const session = token && sessions.get(token);
      if (!session || session.expiresAt <= now()) {
        if (token) sessions.delete(token);
        return res.status(401).json({ error: 'Sign in as a Relationship Officer or Admin to access recordings.' });
      }
      req.recordingUser = session.user;
      next();
    },
    revoke(req, res) {
      sessions.delete(readToken(req));
      res.clearCookie(cookieName, cookieOptions);
      res.status(204).end();
    }
  };
}
