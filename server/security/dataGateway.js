import express from 'express';
import { hashPassword, validatePassword } from './passwords.js';
import { stripSecrets } from './scopedState.js';

const tables = new Set(['students', 'mentors', 'ros', 'issues', 'meetings', 'group_sessions', 'resources', 'mentor_session_records', 'mentor_feedbacks', 'category_videos', 'email_logs', 'system_logs']);
const quote = name => `"${name}"`;
const norm = value => String(value || '').trim().toUpperCase();
const error = (message, status = 403) => Object.assign(new Error(message), { status });
const relation = { meetings: 'issue_id', email_logs: 'issue_id' };

export function tableScope(table, user, params) {
  const bind = value => { params.push(value); return `$${params.length}`; };
  if (user.role === 'Admin') return 'TRUE';
  if (table === 'category_videos' || table === 'ros' && user.role !== 'RO') return 'TRUE';
  if (table === 'system_logs' || user.role === 'RO' && ['mentor_feedbacks', 'group_sessions', 'resources', 'mentor_session_records'].includes(table)
    || user.role === 'Student' && table === 'mentor_session_records') return 'FALSE';
  const id = bind(user.id);
  const ownedIssues = user.role === 'Student' ? `UPPER(student_id) = UPPER(${id})`
    : user.role === 'RO' ? `UPPER(ro_id) = UPPER(${id})`
      : `student_id IN (SELECT id FROM students WHERE UPPER(mentor_id) = UPPER(${id}))`;
  if (table === 'issues') return ownedIssues;
  if (relation[table]) return `${relation[table]} IN (SELECT id FROM issues WHERE ${ownedIssues})`;
  if (table === 'students') return user.role === 'Student' ? `UPPER(id) = UPPER(${id})` : user.role === 'Mentor' ? `UPPER(mentor_id) = UPPER(${id})` : `id IN (SELECT student_id FROM issues WHERE ${ownedIssues})`;
  if (table === 'mentors') return user.role === 'Mentor' ? `UPPER(id) = UPPER(${id})` : `id IN (SELECT mentor_id FROM students WHERE ${user.role === 'Student' ? `UPPER(id) = UPPER(${id})` : `id IN (SELECT student_id FROM issues WHERE ${ownedIssues})`})`;
  if (table === 'ros') return user.role === 'RO' ? `UPPER(id) = UPPER(${id})` : 'TRUE';
  if (table === 'category_videos') return 'TRUE';
  if (table === 'mentor_feedbacks') return user.role === 'Student' ? `UPPER(student_id) = UPPER(${id})` : user.role === 'Mentor' ? `UPPER(mentor_id) = UPPER(${id})` : 'FALSE';
  if (['group_sessions', 'resources', 'mentor_session_records'].includes(table)) return user.role === 'Mentor' ? `UPPER(mentor_id) = UPPER(${id})` : user.role === 'Student' && table !== 'mentor_session_records' ? `mentor_id IN (SELECT mentor_id FROM students WHERE UPPER(id) = UPPER(${id}))` : 'FALSE';
  return 'FALSE';
}

export function createDataGateway(query) {
  const router = express.Router();
  const columnCache = new Map();
  const columnsFor = async table => {
    if (!columnCache.has(table)) columnCache.set(table, (await query('SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2', ['public', table])).rows.map(row => row.column_name));
    return columnCache.get(table);
  };
  router.all('/:table', async (req, res) => {
    const table = req.params.table;
    if (!tables.has(table)) return res.status(404).json({ error: 'Table not available.' });
    try {
      const columns = await columnsFor(table);
      const safeColumns = columns.filter(column => !/password|secret|credential|token|csrf/i.test(column) && !(table === 'email_logs' && column === 'body'));
      const returned = table === 'ros' && !['Admin', 'RO'].includes(req.user.role) ? ['id', 'name', 'region'] : safeColumns;
      const params = [];
      const bind = value => { params.push(value); return `$${params.length}`; };
      const clauses = [tableScope(table, req.user, params)];
      const parseFilter = (name, value) => {
        if (!columns.includes(name) || /password|secret|token/i.test(name)) throw error('Unsupported filter.', 400);
        const match = /^(eq|ilike|like|neq|is|not\.is)\.(.*)$/.exec(String(value));
        if (!match) throw error('Unsupported filter.', 400);
        const [, op, raw] = match;
        if (op === 'is' || op === 'not.is') {
          if (raw !== 'null') throw error('Unsupported null filter.', 400);
          return `${quote(name)} IS ${op === 'not.is' ? 'NOT ' : ''}NULL`;
        }
        return `${quote(name)} ${({ eq: '=', neq: '<>', ilike: 'ILIKE', like: 'LIKE' })[op]} ${bind(raw)}`;
      };
      for (const [key, value] of Object.entries(req.query)) {
        if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(key)) continue;
        if (key === 'or') {
          const parts = String(value).replace(/^\(|\)$/g, '').split(',');
          if (parts.length > 10) throw error('Too many filters.', 400);
          clauses.push(`(${parts.map(part => { const dot = part.indexOf('.'); return parseFilter(part.slice(0, dot), part.slice(dot + 1)); }).join(' OR ')})`);
        } else clauses.push(parseFilter(key, value));
      }
      const where = clauses.join(' AND ');
      const projection = returned.map(quote).join(', ');
      if (req.method === 'GET') {
        let order = '';
        if (req.query.order) {
          const [column, direction = 'asc'] = String(req.query.order).split('.');
          if (!safeColumns.includes(column) || !['asc', 'desc'].includes(direction)) throw error('Unsupported order.', 400);
          order = ` ORDER BY ${quote(column)} ${direction.toUpperCase()}`;
        }
        const limit = Math.min(10000, Math.max(1, Number.parseInt(req.query.limit, 10) || 10000));
        const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
        return res.json(stripSecrets((await query(`SELECT ${projection} FROM ${quote(table)} WHERE ${where}${order} LIMIT ${bind(limit)} OFFSET ${bind(offset)}`, params)).rows));
      }
      // Existing browser synchronization calls remain supported without anonymous database access.
      const mentorWrite = req.user.role === 'Mentor' && ['resources', 'group_sessions', 'mentor_session_records'].includes(table);
      const adminWrite = req.user.role === 'Admin' && !['email_logs', 'system_logs'].includes(table);
      if (!mentorWrite && !adminWrite) throw error('Use the protected action endpoint for this change.');
      if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) throw error('Method not supported.', 405);
      if (req.method === 'DELETE') {
        await query(`DELETE FROM ${quote(table)} WHERE ${where}`, params);
        return res.status(204).end();
      }
      const rawRows = Array.isArray(req.body) ? req.body : [req.body];
      if (!rawRows.length || rawRows.length > 2000 || req.method === 'PATCH' && rawRows.length !== 1) throw error('Invalid batch size.', 400);
      const output = [];
      for (const raw of rawRows) {
        const row = { ...raw };
        if (mentorWrite) {
          row.mentor_id = req.user.id;
          if (row.id) {
            const existing = (await query(`SELECT mentor_id FROM ${quote(table)} WHERE id = $1`, [row.id])).rows[0];
            if (existing && norm(existing.mentor_id) !== norm(req.user.id)) throw error('This record belongs to another mentor.');
          }
        }
        if (Object.keys(row).some(column => !columns.includes(column))) throw error('Unsupported record field.', 400);
        if (row.password !== undefined) {
          if (req.user.role !== 'Admin' || !['students', 'mentors', 'ros'].includes(table)) throw error('Password changes require the account security endpoint.');
          validatePassword(String(row.password));
          row.password = await hashPassword(String(row.password));
        }
        const names = Object.keys(row);
        if (!names.length) throw error('Empty record.', 400);
        const values = names.map(name => row[name]);
        if (req.method === 'PATCH') {
          const assignments = names.map(name => `${quote(name)} = ${bind(row[name])}`).join(', ');
          output.push(...(await query(`UPDATE ${quote(table)} SET ${assignments} WHERE ${where} RETURNING ${projection}`, params)).rows);
        } else {
          const placeholders = values.map((_, index) => `$${index + 1}`);
          const key = table === 'category_videos' ? 'category' : 'id';
          const updates = names.filter(name => name !== key).map(name => `${quote(name)} = EXCLUDED.${quote(name)}`);
          const conflict = names.includes(key) && updates.length ? ` ON CONFLICT (${quote(key)}) DO UPDATE SET ${updates.join(', ')}` : '';
          output.push(...(await query(`INSERT INTO ${quote(table)} (${names.map(quote).join(', ')}) VALUES (${placeholders.join(', ')})${conflict} RETURNING ${projection}`, values)).rows);
        }
      }
      if (rawRows.some(row => row.password !== undefined)) {
        const role = { students: 'Student', mentors: 'Mentor', ros: 'RO' }[table];
        for (const row of output) await query('DELETE FROM auth_sessions WHERE user_id = $1 AND user_role = $2', [row.id, role]);
      }
      res.status(req.method === 'POST' ? 201 : 200).json(stripSecrets(output));
    } catch (failure) { res.status(failure.status || 503).json({ error: failure.status ? failure.message : 'The database change could not be completed.' }); }
  });
  return router;
}
