import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { hashPassword, isPasswordHash } from './passwords.js';

export async function initializeSecurity(query) {
  await query(`CREATE TABLE IF NOT EXISTS admins (id VARCHAR(50) PRIMARY KEY, name VARCHAR(100) NOT NULL,
    email VARCHAR(150), password VARCHAR(255) NOT NULL)`);
  await query(`CREATE TABLE IF NOT EXISTS auth_sessions (token_hash CHAR(64) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL, user_role VARCHAR(20) NOT NULL CHECK (user_role IN ('Admin','Student','Mentor','RO')),
    csrf_hash CHAR(64) NOT NULL, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await query('CREATE INDEX IF NOT EXISTS auth_sessions_expiry_idx ON auth_sessions (expires_at)');
  await query('ALTER TABLE admins ENABLE ROW LEVEL SECURITY');
  await query('ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY');
  for (const table of ['students', 'mentors', 'ros']) {
    await query(`ALTER TABLE ${table} ALTER COLUMN password TYPE VARCHAR(255)`);
    await query(`ALTER TABLE ${table} ALTER COLUMN password DROP DEFAULT`);
    const rows = (await query(`SELECT id, password FROM ${table}`)).rows;
    for (const row of rows) if (!isPasswordHash(row.password)) {
      // Unusable missing passwords are replaced by an unknown random value; no universal fallback exists.
      await query(`UPDATE ${table} SET password = $1 WHERE id = $2 AND password IS NOT DISTINCT FROM $3`, [await hashPassword(row.password || randomBytes(32).toString('base64url')), row.id, row.password]);
    }
  }
  if (!(await query('SELECT id FROM admins LIMIT 1')).rows.length) {
    const folder = fileURLToPath(new URL('../../.local/', import.meta.url));
    const path = fileURLToPath(new URL('../../.local/admin-bootstrap.json', import.meta.url));
    await mkdir(folder, { recursive: true });
    let credentials;
    try { credentials = JSON.parse(await readFile(path, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      credentials = { id: 'ADMIN', role: 'Admin', password: randomBytes(24).toString('base64url'), note: 'Private initial Admin login. Keep this file out of Git and change the password after signing in.' };
      await writeFile(path, JSON.stringify(credentials, null, 2), { flag: 'wx', mode: 0o600 });
    }
    await query("INSERT INTO admins (id, name, email, password) VALUES ($1, 'Administrator', $2, $3) ON CONFLICT (id) DO NOTHING", [credentials.id, process.env.ADMIN_EMAIL || null, await hashPassword(credentials.password)]);
    console.log('[Security] Initial Admin credentials saved to .local/admin-bootstrap.json (excluded from Git).');
  }
  await query('DELETE FROM auth_sessions WHERE expires_at <= NOW()');
  // Browsers use our authenticated API. The public Supabase REST roles receive no table access.
  const tables = ['admins', 'auth_sessions', 'students', 'mentors', 'ros', 'issues', 'meetings',
    'group_sessions', 'resources', 'system_logs', 'mentor_session_records', 'email_logs',
    'category_videos', 'mentor_feedbacks', 'meeting_recordings', 'app_settings'];
  const schema = (await query('SELECT current_schema() AS schema')).rows[0].schema;
  const quote = name => '"' + name.replaceAll('"', '""') + '"';
  const existing = (await query('SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename = ANY($2::text[])', [schema, tables])).rows;
  const policies = (await query('SELECT tablename, policyname FROM pg_policies WHERE schemaname = $1 AND tablename = ANY($2::text[])', [schema, tables])).rows;
  for (const policy of policies) await query(`DROP POLICY ${quote(policy.policyname)} ON ${quote(schema)}.${quote(policy.tablename)}`);
  const roles = (await query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")).rows;
  for (const { tablename } of existing) {
    const table = `${quote(schema)}.${quote(tablename)}`;
    await query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await query(`REVOKE ALL ON TABLE ${table} FROM PUBLIC`);
    for (const { rolname } of roles) await query(`REVOKE ALL ON TABLE ${table} FROM ${quote(rolname)}`);
  }
}
