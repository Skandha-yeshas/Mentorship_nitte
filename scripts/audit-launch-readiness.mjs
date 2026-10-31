// Read-only checks. Never invokes login, email, reset, or other mutation APIs.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: fileURLToPath(new URL('../server/.env', import.meta.url)), quiet: true });
dotenv.config({ quiet: true });
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const report = { assessedAt: new Date().toISOString(), method: 'Read-only metadata queries and anonymous GET requests; no load testing or mutation requests.' };
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  report.tableSecurity = (await client.query(`SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname IN ('students','mentors','ros','issues','meetings','meeting_recordings','email_logs','app_settings') ORDER BY c.relname`)).rows;
  report.policies = (await client.query(`SELECT tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('students','mentors','ros','issues','meetings','meeting_recordings','email_logs','app_settings') ORDER BY tablename, policyname`)).rows;
  report.publicRolePrivileges = [];
  const roles = (await client.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")).rows;
  for (const { rolname } of roles) {
    for (const { table_name } of report.tableSecurity) {
      const privileges = (await client.query(`SELECT has_table_privilege($1, $2, 'SELECT') AS can_select,
        has_table_privilege($1, $2, 'INSERT') AS can_insert, has_table_privilege($1, $2, 'UPDATE') AS can_update,
        has_table_privilege($1, $2, 'DELETE') AS can_delete`, [rolname, `public.${table_name}`])).rows[0];
      report.publicRolePrivileges.push({ role: rolname, table: table_name, ...privileges });
    }
  }
  await client.query('ROLLBACK');
} finally { await client.end(); }

const origin = process.env.LAUNCH_AUDIT_URL || 'http://localhost:5001';
const response = await fetch(`${origin}/api/db-state`, { signal: AbortSignal.timeout(15000) });
const body = await response.text();
if (response.ok) {
  const state = JSON.parse(body);
  const accounts = [...(state.users?.students || []), ...(state.users?.mentors || []), ...(state.users?.ros || [])];
  report.anonymousDbState = { status: response.status, responseBytes: Buffer.byteLength(body),
    accountsReturned: accounts.length,
    accountsWithPasswordField: accounts.filter(row => Object.hasOwn(row, 'password')).length,
    accountsWithRecognizedPasswordHash: accounts.filter(row => /^\$2[aby]\$|^\$argon2|^scrypt\$/.test(String(row.password || ''))).length };
} else report.anonymousDbState = { status: response.status };

await mkdir(fileURLToPath(new URL('../docs/', import.meta.url)), { recursive: true });
await writeFile(fileURLToPath(new URL('../docs/launch-readiness-check.json', import.meta.url)), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ anonymousDbState: report.anonymousDbState, tableSecurity: report.tableSecurity,
  publicAllPolicies: report.policies.filter(row => row.cmd === 'ALL' && row.qual === 'true' && row.with_check === 'true').map(row => row.tablename),
  report: 'docs/launch-readiness-check.json' }));
