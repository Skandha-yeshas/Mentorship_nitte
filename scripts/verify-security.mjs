// Checks the running development app without editing grievances or sending mail.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import XLSX from 'xlsx';
import { isPasswordHash } from '../server/security/passwords.js';

dotenv.config({ path: 'server/.env', quiet: true }); dotenv.config({ quiet: true });
const origin = process.env.SECURITY_APP_URL || 'http://localhost:5173';
const client = new pg.Client({ connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
await client.connect();
try {
  const baseline = JSON.parse(await readFile('.local/security-baseline.json', 'utf8'));
  for (const [table, ids] of Object.entries(baseline)) {
    assert.ok(['students', 'mentors', 'ros', 'issues', 'meetings', 'meeting_recordings'].includes(table));
    assert.deepEqual((await client.query(`SELECT id FROM ${table} ORDER BY id`)).rows.map(row => row.id), ids, `${table} records changed during migration`);
  }
  for (const table of ['students', 'mentors', 'ros', 'admins']) {
    const accounts = (await client.query(`SELECT password FROM ${table}`)).rows;
    assert.ok(accounts.length > 0);
    assert.ok(accounts.every(row => isPasswordHash(row.password)), `${table} has unhashed passwords`);
  }
  for (const path of ['/api/db-state', '/api/recordings', '/api/admin/analytics', '/api/data/students']) {
    assert.equal((await fetch(`${origin}${path}`)).status, 401, path);
  }
  assert.equal((await fetch(`${origin}/api/auth/register-student`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const credentials = JSON.parse(await readFile('.local/admin-bootstrap.json', 'utf8'));
  const browser = await chromium.launch({ executablePath: process.env.RECORDING_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const requests = []; page.on('response', response => { const url = new URL(response.url()); if (url.pathname.startsWith('/api/')) requests.push({ path: url.pathname, status: response.status() }); });
    page.setDefaultTimeout(10000);
    await page.goto(origin);
    await page.getByPlaceholder('admin@nitte.edu.in or ADMIN').fill(credentials.id);
    await page.locator('input[type="password"]').fill(credentials.password);
    await page.getByRole('button', { name: /Sign In to System Admin Portal/ }).click();
    await page.getByRole('button', { name: 'Change password', exact: true }).waitFor().catch(async () => {
      throw new Error(JSON.stringify({ errors, requests, inputLengths: await page.locator('form input').evaluateAll(inputs => inputs.map(input => ({ type: input.type, length: input.value.length, valid: input.validity.valid }))), screen: (await page.locator('body').innerText()).slice(0, 2000) }));
    });
    const state = await page.evaluate(async () => (await fetch('/api/db-state')).json());
    assert.equal(state.authenticatedUser?.role, 'Admin');
    assert.ok(!JSON.stringify(state).match(/"password"\s*:/i));
    assert.equal(state.users.students.length, baseline.students.length);
    await page.reload();
    await page.getByRole('button', { name: 'Change password', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Change password', exact: true }).click();
    await page.getByRole('dialog', { name: 'Change password' }).waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    assert.equal(await page.evaluate(() => Object.keys(localStorage).some(key => key === 'auth_user_session' || key === 'nitte_saved_students')), false);
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.getByRole('button', { name: /Sign In to System Admin Portal/ }).waitFor();
    assert.equal(await page.evaluate(async () => (await fetch('/api/db-state')).status), 401);
    // Verify an existing imported RO without creating or modifying account records.
    const workbook = XLSX.readFile('exports/ro_roster_test_10_issues.xlsx');
    const imported = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
    const officers = (await client.query('SELECT id, password FROM ros')).rows;
    const { verifyPassword } = await import('../server/security/passwords.js');
    let officer;
    for (const row of imported) {
      const candidate = officers.find(item => item.id === row['RO ID']);
      if (candidate && await verifyPassword(row['Initial Password'], candidate.password)) { officer = row; break; }
    }
    if (officer) {
      await page.getByRole('button', { name: 'RO', exact: true }).click();
      await page.getByPlaceholder('e.g. RO-01 or officer@nitte.edu.in').fill(officer['RO ID']);
      await page.locator('input[type="password"]').fill(officer['Initial Password']);
      await page.getByRole('button', { name: /Sign In to Relationship Officer Portal/ }).click();
      await page.getByRole('button', { name: 'Change password', exact: true }).waitFor();
      const roState = await page.evaluate(async () => (await fetch('/api/db-state')).json());
      assert.equal(roState.authenticatedUser?.role, 'RO');
      assert.deepEqual(roState.users.ros.map(row => row.id), [officer['RO ID']]);
      assert.equal(await page.evaluate(async () => (await fetch('/api/admin/analytics')).status), 403);
      await page.getByRole('button', { name: 'Log Out', exact: true }).click();
      await page.getByRole('button', { name: /Sign In to .* Portal/ }).waitFor();
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
  console.log('Verified: existing records preserved, all passwords hashed, anonymous access blocked, roster-only signup, Admin browser login/reload/password dialog/logout, no private browser caches. No email dispatched.');
} finally { await client.end(); }
