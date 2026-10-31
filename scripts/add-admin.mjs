import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import dotenv from 'dotenv';
import { hashPassword } from '../server/security/passwords.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

export async function addAdminAccount(client, input, credentialsDirectory = join(projectRoot, '.local')) {
  const id = String(input.id || '').trim().toUpperCase();
  const name = String(input.name || '').trim();
  const email = String(input.email || '').trim().toLowerCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,49}$/.test(id)) throw new Error('Admin ID must contain 1–50 letters, numbers, hyphens or underscores.');
  if (!name || name.length > 100) throw new Error('Enter the professor’s name (up to 100 characters).');
  if (email.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid institutional email address.');
  const password = randomBytes(24).toString('base64url');
  const passwordHash = await hashPassword(password);
  const path = join(credentialsDirectory, `admin-${id.toLowerCase()}-${randomUUID()}-credentials.json`);
  await client.query('BEGIN');
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('mentorship-admin-account-setup'))");
    const existing = await client.query('SELECT id FROM admins WHERE UPPER(id) = $1 OR LOWER(email) = $2', [id, email]);
    if (existing.rows.length) throw new Error('An Admin with this ID or email already exists. No existing account was changed.');
    await client.query('INSERT INTO admins (id, name, email, password) VALUES ($1, $2, $3, $4)', [id, name, email, passwordHash]);
    await mkdir(credentialsDirectory, { recursive: true });
    // Save before COMMIT so a disk failure cannot leave an account with an unknown password.
    await writeFile(path, JSON.stringify({ id, name, email, role: 'Admin', password,
      note: 'Initial password only. Share privately with this professor, then use Change password after signing in. Never commit or email this file.' }, null, 2), { flag: 'wx', mode: 0o600 });
    await client.query('COMMIT');
    return { id, name, email, credentialsPath: path };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    // Retain any credential file because a lost connection during COMMIT has an uncertain outcome.
    if (error.code === '42P01') throw new Error('Start the app once with npm run dev to initialize the Admin table, then try again.');
    if (error.code === '23505') throw new Error('An Admin with this ID already exists. No existing account was changed.');
    if (error.code) throw new Error('Account setup could not be confirmed. Check the database connection and private credential folder before retrying.');
    throw error;
  }
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Run npm run admin:add, then enter a unique Admin ID, professor name, and institutional email. The initial password is saved in a private .local file. No email is sent.');
    return;
  }
  dotenv.config({ path: join(projectRoot, 'server/.env'), quiet: true });
  dotenv.config({ path: join(projectRoot, '.env'), quiet: true });
  if (!process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL in server/.env first.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let input;
  try {
    input = { id: await prompt.question('New Admin ID (e.g. ADMIN-PRINCIPAL): '),
      name: await prompt.question('Professor’s full name: '),
      email: await prompt.question('Institutional email: ') };
  } finally { prompt.close(); }
  // Use the same database connection settings as the existing application.
  const { getPool, shutdown } = await import('../server/db.js');
  let client;
  try {
    client = await getPool().connect();
    const result = await addAdminAccount(client, input);
    console.log(`Created Admin account ${result.id}. Initial credentials saved privately at:\n${result.credentialsPath}\nSelect Admin on the existing login page and use this ID or email. Ask the professor to change their password after signing in.`);
  } finally { client?.release(); await shutdown(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(error.code ? 'Could not connect to the database. Check the app’s private server/.env settings.' : error.message);
    process.exitCode = 1;
  });
}
