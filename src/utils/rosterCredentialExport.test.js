import test from 'node:test';
import assert from 'node:assert/strict';
import { exportRosterPasswords } from './rosterCredentialExport.js';

const id = '01234567-1234-4123-8123-0123456789ab';
const created = { index: 1, id: 'NEW', name: '=Quoted Name', email: 'new@college.edu', action: 'CREATED', status: 'SUCCESS', password: 'Initial-Password-42!', passwordStatus: 'GENERATED' };
const updated = { index: 2, id: 'OLD', name: 'Existing', action: 'UPDATED', status: 'SUCCESS', password: '', passwordStatus: 'UNCHANGED' };

for (const kind of ['students', 'mentors', 'ros']) {
  test(`${kind} password export reads the completed private import rather than account state`, async () => {
    const paths = []; const downloads = [];
    const fetchImpl = async path => {
      paths.push(path);
      return { ok: true, json: async () => path.endsWith('/roster-jobs')
        ? [{ id, kind, status: 'COMPLETED' }]
        : { kind, status: 'COMPLETED', results: [created, updated, { index: 3, status: 'FAILED', reason: 'Invalid account' }] } };
    };
    const count = await exportRosterPasswords(kind, { fetchImpl, downloadImpl: (...args) => downloads.push(args) });
    assert.equal(count, 1);
    assert.deepEqual(paths, ['/api/admin/roster-jobs', `/api/admin/roster-jobs/${id}?results=1`]);
    assert.match(downloads[0][0], new RegExp(`smart_mentorship_${kind}_initial_passwords_`));
    assert.deepEqual(downloads[0][2], [created]);
  });
}

test('password export waits for completion and never invents passwords for existing accounts', async () => {
  let downloaded = false;
  const fetchImpl = status => async () => ({ ok: true, json: async () => ({ kind: 'students', status, results: [updated] }) });
  await assert.rejects(exportRosterPasswords('students', { jobId: id, fetchImpl: fetchImpl('PROCESSING'), downloadImpl: () => { downloaded = true; } }), /still processing/);
  await assert.rejects(exportRosterPasswords('students', { jobId: id, fetchImpl: fetchImpl('COMPLETED'), downloadImpl: () => { downloaded = true; } }), /no new accounts/);
  assert.equal(downloaded, false);
});
