import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addAdminAccount } from './add-admin.mjs';
import { verifyPassword, isPasswordHash } from '../server/security/passwords.js';

const input = { id: ' admin-dean ', name: 'Professor Example', email: ' DEAN@example.invalid ' };
async function fixture(t, existing = []) {
  const directory = await mkdtemp(join(tmpdir(), 'mentorship-admin-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  const client = { query: async (sql, values) => {
    calls.push({ sql, values });
    return { rows: sql.startsWith('SELECT id') ? existing : [] };
  } };
  return { directory, calls, client };
}

test('creates an individual Admin with a hashed password and private initial credentials', async t => {
  const { directory, calls, client } = await fixture(t);
  const result = await addAdminAccount(client, input, directory);
  assert.equal(result.id, 'ADMIN-DEAN');
  assert.equal(result.email, 'dean@example.invalid');
  const credentials = JSON.parse(await readFile(result.credentialsPath, 'utf8'));
  const insert = calls.find(call => call.sql.startsWith('INSERT INTO admins'));
  assert.equal(credentials.role, 'Admin');
  assert.ok(isPasswordHash(insert.values[3]));
  assert.equal(await verifyPassword(credentials.password, insert.values[3]), true);
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.equal(JSON.stringify(result).includes(credentials.password), false);
});

test('duplicate ID or email does not overwrite an existing Admin', async t => {
  const { directory, calls, client } = await fixture(t, [{ id: 'EXISTING' }]);
  await assert.rejects(addAdminAccount(client, input, directory), /already exists/);
  assert.equal(calls.some(call => call.sql.startsWith('INSERT')), false);
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
  assert.deepEqual(await readdir(directory), []);
});

test('rejects invalid identifiers, names and emails before accessing the database', async t => {
  const { directory, calls, client } = await fixture(t);
  for (const fields of [{ id: 'invalid/id' }, { email: 'invalid email' }, { name: '' }]) {
    await assert.rejects(addAdminAccount(client, { ...input, ...fields }, directory));
  }
  assert.equal(calls.length, 0);
});

test('a failure saving initial credentials rolls back the account insertion', async t => {
  const { directory, calls, client } = await fixture(t);
  const invalidDirectory = join(directory, 'not-a-directory');
  await writeFile(invalidDirectory, 'fixture');
  await assert.rejects(addAdminAccount(client, input, invalidDirectory), /could not be confirmed/);
  assert.equal(calls.at(-1).sql, 'ROLLBACK');
  assert.equal(calls.some(call => call.sql === 'COMMIT'), false);
});
