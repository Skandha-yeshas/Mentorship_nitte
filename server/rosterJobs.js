import express from 'express';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { validateRoster } from '../shared/rosterValidation.js';
import { hashPassword } from './security/passwords.js';

const roles = { students: 'Student', mentors: 'Mentor', ros: 'RO' };
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const statsSql = `SELECT j.id, j.kind, j.total, j.created_at AS "createdAt", j.created_by AS "createdBy",
  COUNT(*) FILTER(WHERE r.status<>'PENDING')::integer AS processed,
  COUNT(*) FILTER(WHERE r.status='DONE')::integer AS "successCount",
  COUNT(*) FILTER(WHERE r.status='FAILED')::integer AS "failureCount",
  COUNT(*) FILTER(WHERE m.status='DELIVERED_GMAIL')::integer AS "emailsSent",
  COUNT(*) FILTER(WHERE m.status IN ('QUEUED','DEFERRED','RETRY','SENDING'))::integer AS "emailsWaiting",
  COUNT(*) FILTER(WHERE m.id IS NOT NULL AND m.status NOT IN ('DELIVERED_GMAIL','QUEUED','DEFERRED','RETRY','SENDING'))::integer AS "emailsUnsent"
  FROM roster_imports j JOIN roster_import_rows r ON r.job_id=j.id LEFT JOIN email_logs m ON m.id::text=r.mail_log_id`;
const metadata = row => ({ ...row, count: row.successCount, totalProcessed: row.processed,
  status: row.processed === row.total ? 'COMPLETED' : row.processed ? 'PROCESSING' : 'QUEUED', queued: row.processed !== row.total });

export function createRosterJobs({ getClient, query, cipher, createMailSender, portalUrl = '', passwordHasher = hashPassword }) {
  async function enqueue(kind, input, actor, requestId = randomUUID()) {
    const rows = validateRoster(kind, input);
    if (!uuid.test(requestId)) throw Object.assign(new Error('Invalid import request ID.'), { status: 400 });
    const digest = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    const client = await getClient();
    try {
      await client.query('BEGIN');
      const id = randomUUID();
      const inserted = await client.query(`INSERT INTO roster_imports(id,kind,created_by,request_key,payload_digest,total)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(created_by,request_key) DO NOTHING RETURNING id`, [id, kind, actor.id, requestId, digest, rows.length]);
      if (!inserted.rows.length) {
        const existing = (await client.query('SELECT id,payload_digest FROM roster_imports WHERE created_by=$1 AND request_key=$2', [actor.id, requestId])).rows[0];
        if (existing.payload_digest !== digest) throw Object.assign(new Error('This request ID belongs to a different roster.'), { status: 409 });
        await client.query('COMMIT'); return { jobId: existing.id, id: existing.id, kind, total: rows.length, status: 'QUEUED', queued: true };
      }
      await client.query(`INSERT INTO roster_import_rows(job_id,row_number,input_cipher)
        SELECT $1, row_number, input_cipher FROM jsonb_to_recordset($2::jsonb) AS input(row_number INTEGER,input_cipher TEXT)`,
      [id, JSON.stringify(rows.map((row, index) => ({ row_number: index + 1, input_cipher: cipher.seal(row) })))]);
      await client.query('COMMIT');
      return { jobId: id, id, kind, total: rows.length, status: 'QUEUED', queued: true };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }

  async function tick() {
    const client = await getClient(); let row;
    try {
      await client.query('BEGIN');
      row = (await client.query(`SELECT r.*,j.kind,j.created_by FROM roster_import_rows r JOIN roster_imports j ON j.id=r.job_id
        WHERE r.status='PENDING' ORDER BY j.created_at,r.row_number FOR UPDATE OF r SKIP LOCKED LIMIT 1`)).rows[0];
      if (!row) { await client.query('COMMIT'); return false; }
      const data = cipher.open(row.input_cipher);
      const table = row.kind; const role = roles[table];
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`roster:${role}:${data.id}`]);
      const existing = (await client.query(`SELECT id FROM ${table} WHERE UPPER(id)=UPPER($1) FOR UPDATE`, [data.id])).rows[0];
      if (existing) data.id = existing.id;
      if (table === 'students' && data.mentorId) {
        const mentor = (await client.query('SELECT id FROM mentors WHERE UPPER(id)=UPPER($1)', [data.mentorId])).rows[0];
        if (!mentor) throw Object.assign(new Error('Assigned Mentor ID was not found.'), { rowFailure: true });
        data.mentorId = mentor.id;
      }
      if (table === 'ros') {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`roster-category:${data.region.toLowerCase()}`]);
        if ((await client.query('SELECT id FROM ros WHERE LOWER(TRIM(region))=LOWER(TRIM($1)) AND UPPER(id)<>UPPER($2)', [data.region, data.id])).rows.length) throw Object.assign(new Error('This category is already assigned to another RO.'), { rowFailure: true });
      }
      const password = existing ? null : data.password || randomBytes(24).toString('base64url');
      const encoded = existing ? null : await passwordHasher(password);
      if (table === 'students') {
        if (existing) await client.query('UPDATE students SET name=$1,email=$2,branch=$3,sem=$4,mentor_id=COALESCE($5,mentor_id) WHERE id=$6', [data.name, data.email, data.branch, data.sem, data.mentorId, data.id]);
        else await client.query('INSERT INTO students(id,name,email,branch,sem,mentor_id,phone,password) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [data.id, data.name, data.email, data.branch, data.sem, data.mentorId, '', encoded]);
      } else if (table === 'mentors') {
        if (existing) await client.query('UPDATE mentors SET name=$1,email=$2,dept=$3,class=$4 WHERE id=$5', [data.name, data.email, data.dept, data.class, data.id]);
        else await client.query('INSERT INTO mentors(id,name,email,dept,class,password) VALUES($1,$2,$3,$4,$5,$6)', [data.id, data.name, data.email, data.dept, data.class, encoded]);
      } else {
        if (existing) await client.query('UPDATE ros SET name=$1,email=$2,region=$3 WHERE id=$4', [data.name, data.email, data.region, data.id]);
        else await client.query('INSERT INTO ros(id,name,email,region,password) VALUES($1,$2,$3,$4,$5)', [data.id, data.name, data.email, data.region, encoded]);
      }
      let mail;
      if (!existing) {
        const link = portalUrl ? `${portalUrl.replace(/\/$/, '')}/?role=${role}&id=${encodeURIComponent(data.id)}` : 'the mentorship portal';
        mail = await createMailSender((sql, params) => client.query(sql, params))({ to: data.email, recipientName: data.name,
          subject: `Your ${role} mentorship portal account`, text: `Dear ${data.name},\n\nYour ${role} account has been created.\nAccount ID: ${data.id}\nInitial password: ${password}\nSign in at ${link}\nChange your password after signing in.`,
          eventType: `BULK_${role.toUpperCase()}_ONBOARDING`, notificationKey: `roster:${row.job_id}:${row.row_number}`,
          recipientBinding: { role, id: data.id, passwordHash: encoded } });
        if (!mail.id || mail.status === 'FAILED') throw new Error('Account notification could not be saved.');
      }
      const result = { ...data, password: password || '', status: 'SUCCESS', action: existing ? 'UPDATED' : 'CREATED',
        passwordStatus: existing ? 'UNCHANGED' : data.password ? 'PROVIDED' : 'GENERATED', emailStatus: mail?.status || 'NOT_REQUIRED_EXISTING_ACCOUNT', index: row.row_number };
      await client.query(`UPDATE roster_import_rows SET status='DONE',input_cipher=NULL,result_cipher=$1,mail_log_id=$2,processed_at=NOW()
        WHERE job_id=$3 AND row_number=$4`, [cipher.seal(result), mail ? String(mail.id) : null, row.job_id, row.row_number]);
      await client.query('INSERT INTO system_logs(text,user_role,user_id) VALUES($1,$2,$3)', [`Roster import ${row.job_id}: ${existing ? 'updated' : 'created'} ${role} ${data.id}.`, 'Admin', row.created_by]);
      await client.query('COMMIT'); return true;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (row && (error.rowFailure || ['23502', '23503', '23505', '22001'].includes(error.code))) {
        await client.query("UPDATE roster_import_rows SET status='FAILED',error=$1,processed_at=NOW(),input_cipher=NULL WHERE job_id=$2 AND row_number=$3", [error.rowFailure ? error.message : 'The account fields conflict with existing records.', row.job_id, row.row_number]);
        return true;
      }
      throw error;
    } finally { client.release(); }
  }
  async function get(id, includeResults = false) {
    if (!uuid.test(id)) throw Object.assign(new Error('Invalid import ID.'), { status: 400 });
    const job = (await query(`${statsSql} WHERE j.id=$1 GROUP BY j.id`, [id])).rows[0];
    if (!job) throw Object.assign(new Error('Import not found.'), { status: 404 });
    const result = metadata(job);
    if (includeResults) result.results = (await query(`SELECT r.row_number,r.result_cipher,r.error,m.status AS email_status FROM roster_import_rows r
      LEFT JOIN email_logs m ON m.id::text=r.mail_log_id WHERE job_id=$1 ORDER BY row_number`, [id])).rows.map(row => row.result_cipher
      ? { ...cipher.open(row.result_cipher), ...(row.email_status ? { emailStatus: row.email_status } : {}) }
      : { index: row.row_number, status: row.error ? 'FAILED' : 'PENDING', reason: row.error || 'Not processed yet.' });
    return result;
  }
  const router = express.Router();
  router.use((req, res, next) => req.user?.role === 'Admin' ? next() : res.status(403).json({ error: 'Admin access required.' }));
  router.post('/bulk-upload-:kind', async (req, res) => {
    const kind = req.params.kind;
    try { res.status(202).json(await enqueue(kind, req.body[kind], req.user, req.body.requestId)); }
    catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'The roster could not be queued. No import completion has been reported.' }); }
  });
  router.get('/roster-jobs', async (req, res) => {
    try { res.json((await query(`${statsSql} GROUP BY j.id ORDER BY j.created_at DESC LIMIT 20`)).rows.map(metadata)); }
    catch { res.status(503).json({ error: 'Import progress is temporarily unavailable.' }); }
  });
  router.get('/roster-jobs/:id', async (req, res) => {
    try { res.json(await get(req.params.id, req.query.results === '1')); }
    catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Import results are temporarily unavailable.' }); }
  });
  router.post('/roster-jobs/:id/retry-emails', async (req, res) => {
    try {
      await get(req.params.id);
      const retried = await query(`UPDATE email_logs m SET status='QUEUED',next_attempt_at=NOW(),delivery_reason='Requeued by an administrator.'
        FROM roster_import_rows r WHERE r.job_id=$1 AND r.mail_log_id=m.id::text AND m.queued_payload IS NOT NULL
        AND m.status IN ('FAILED','SKIPPED_DISABLED','SKIPPED_UNCONFIGURED') RETURNING m.id`, [req.params.id]);
      res.json({ queued: retried.rows.length });
    } catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'Email retries could not be queued.' }); }
  });
  return { enqueue, tick, get, router };
}
