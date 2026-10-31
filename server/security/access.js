const norm = value => String(value || '').trim().toUpperCase();
const same = (a, b) => Boolean(norm(a) && norm(a) === norm(b));
const denied = (res, message = 'You do not have permission for this action.') => res.status(403).json({ error: message });

export function createAccessPolicy(query) {
  async function issue(id) {
    return (await query('SELECT id, student_id, ro_id FROM issues WHERE UPPER(id) = UPPER($1)', [id])).rows[0];
  }
  async function student(id) {
    return (await query('SELECT id, name, email, mentor_id FROM students WHERE UPPER(id) = UPPER($1)', [id])).rows[0];
  }
  async function canReadIssue(user, row) {
    if (!row) return false;
    if (user.role === 'Admin') return true;
    if (user.role === 'Student') return same(row.student_id, user.id);
    if (user.role === 'RO') return same(row.ro_id, user.id);
    return user.role === 'Mentor' && same((await student(row.student_id))?.mentor_id, user.id);
  }
  async function middleware(req, res, next) {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    const path = req.path;
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    try {
      if (path === '/reset' || path === '/gmail/simulate-inbound') return res.status(404).json({ error: 'This development endpoint is disabled.' });
      if (path.startsWith('/admin/') || path.startsWith('/gmail/') && path !== '/gmail/logs') return user.role === 'Admin' ? next() : denied(res);
      if (path.startsWith('/recordings')) return ['Admin', 'RO'].includes(user.role) ? next() : denied(res);
      if (path.startsWith('/data/')) return next(); // The data gateway applies table and row authorization.
      if (path === '/db-state' || path === '/gmail/logs') return next(); // Responses are scoped separately.
      if (path === '/category-videos' && !write) return next();
      if (path.startsWith('/category-videos/')) {
        if (user.role === 'Admin') { req.body.roId = 'ADMIN'; return next(); }
        if (user.role !== 'RO') return denied(res);
        const category = req.body.category || decodeURIComponent(path.slice('/category-videos/'.length));
        const row = (await query('SELECT region FROM ros WHERE id = $1', [user.id])).rows[0];
        if (!same(row?.region, category)) return denied(res);
        req.body.roId = user.id;
        return next();
      }
      const quota = /^\/students\/([^/]+)\/issue-limit$/.exec(path);
      if (quota) {
        const id = decodeURIComponent(quota[1]);
        const row = await student(id);
        if (!row || !(user.role === 'Admin' || user.role === 'Student' && same(user.id, id) || user.role === 'Mentor' && same(row.mentor_id, user.id))) return denied(res);
        return next();
      }
      if (path === '/issues' && req.method === 'POST') {
        if (user.role !== 'Student') return denied(res);
        req.body.studentId = user.id; req.body.studentName = user.name;
        return next();
      }
      const issuePath = /^\/issues\/([^/]+)\/(activity|resolve|reopen|escalate|feedback|reassign)$/.exec(path);
      if (issuePath) {
        const row = await issue(decodeURIComponent(issuePath[1]));
        if (!await canReadIssue(user, row)) return denied(res);
        const action = issuePath[2];
        if (action === 'activity' && !write) return next();
        const permitted = user.role === 'Admin'
          || user.role === 'RO' && ['resolve', 'escalate'].includes(action)
          || user.role === 'Student' && ['resolve', 'reopen', 'feedback'].includes(action);
        if (!permitted) return denied(res);
        req.body.studentId = row.student_id;
        req.body.roId = user.id;
        req.body.userRole = user.role;
        return next();
      }
      const signal = /^\/meetings\/signals\/([^/]+)$/.exec(path);
      if (signal || path === '/meetings/signal') {
        const row = await issue(signal ? decodeURIComponent(signal[1]) : req.body.issueId);
        if (!await canReadIssue(user, row) || !['Admin', 'RO', 'Student'].includes(user.role)) return denied(res);
        if (write && !signal) {
          req.body.sender = user.role === 'Student' ? 'student' : 'ro';
          if (user.role === 'Student' && req.body.type === 'meeting-ended') return denied(res, 'Only the RO can end this meeting.');
        }
        return next();
      }
      if (path === '/meetings' || /^\/meetings\/[^/]+$/.test(path)) {
        if (!['Admin', 'RO'].includes(user.role)) return denied(res);
        let row;
        if (path === '/meetings') row = await issue(req.body.issueId);
        else {
          const id = decodeURIComponent(path.split('/')[2]);
          const meeting = (await query('SELECT issue_id FROM meetings WHERE UPPER(id) = UPPER($1) OR UPPER(issue_id) = UPPER($1) LIMIT 1', [id])).rows[0];
          row = await issue(meeting?.issue_id || id);
        }
        if (!await canReadIssue(user, row)) return denied(res);
        if (path === '/meetings' && req.body.id) {
          const existing = (await query('SELECT issue_id FROM meetings WHERE id = $1', [req.body.id])).rows[0];
          if (existing && !same(existing.issue_id, row.id)) return denied(res);
        }
        if (user.role === 'RO') req.body.roId = user.id;
        req.body.studentId = row.student_id;
        return next();
      }
      if (['/sessions', '/resources', '/mentor/session-records'].includes(path)) {
        if (!['Mentor', 'Admin'].includes(user.role)) return denied(res);
        if (user.role === 'Mentor') {
          req.body.mentorId = user.id; req.body.mentorName = user.name;
          if (path === '/mentor/session-records' && req.body.id) {
            const existing = (await query('SELECT mentor_id FROM mentor_session_records WHERE id = $1', [req.body.id])).rows[0];
            if (existing && !same(existing.mentor_id, user.id)) return denied(res);
          }
        }
        return next();
      }
      if (path === '/mentor-feedbacks') {
        if (user.role !== 'Student') return denied(res);
        const row = await student(user.id);
        if (!row?.mentor_id) return denied(res, 'No mentor is assigned to your account.');
        const mentor = (await query('SELECT name FROM mentors WHERE id = $1', [row.mentor_id])).rows[0];
        req.body.studentId = user.id; req.body.studentName = user.name;
        req.body.mentorId = row.mentor_id; req.body.mentorName = mentor?.name || 'Mentor';
        return next();
      }
      return res.status(404).json({ error: 'Endpoint not found.' });
    } catch { res.status(503).json({ error: 'Permission verification is temporarily unavailable.' }); }
  }
  return { middleware, issue, student, canReadIssue };
}
