import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoRosterRow, getRoCategories, findRoForCategory, clearResetGrievanceCaches } from './roCatalog.js';

test('Excel template headers preserve the imported issue, officer, email, and password', () => {
  const row = normalizeRoRosterRow({ 'RO ID': 'custom-ro-9', 'RO Name': 'Test Officer', 'Official Email': 'OFFICER@example.invalid', 'Assigned Domain Category': 'Custom - Imported issue', 'Initial Password': 'Test#1234', 'Reference Mentor ID': 'M-101' });
  assert.equal(row.id, 'CUSTOM-RO-9');
  assert.equal(row.email, 'officer@example.invalid');
  assert.equal(row.region, 'Custom - Imported issue');
  assert.equal(row.password, 'Test#1234');
  assert.equal(row.phone, undefined);
});
test('missing category never silently creates a default topic', () => {
  assert.throws(() => normalizeRoRosterRow({ id: 'RO-X', name: 'Officer', email: 'a@example.invalid' }), /Assigned Domain Category/);
  assert.deepEqual(getRoCategories([]), []);
  assert.deepEqual(getRoCategories([{ id: 'RO-01', region: '', category: 'stale legacy category' }]), []);
});
test('categories and ownership follow actual imported assignments, never numeric RO positions', () => {
  const ros = [{ id: 'CUSTOM-Z', region: 'Academic - Imported topic' }, { id: 'RO-01', region: 'Hostels - Another topic' }];
  assert.equal(findRoForCategory(ros, ' academic - imported topic ').id, 'CUSTOM-Z');
  assert.equal(findRoForCategory(ros, 'Unknown topic'), null);
  assert.equal(getRoCategories([...ros, { id: 'duplicate', region: 'academic - imported topic' }]).length, 2);
});
test('a database reset clears old grievance caches once while preserving students, mentors, and login', () => {
  const values = new Map([['nitte_saved_issues', '["old"]'], ['nitte_saved_meetings', '["old"]'], ['nitte_saved_ros', '["old"]'], ['nitte_saved_students', '["student"]'], ['nitte_saved_mentors', '["mentor"]'], ['auth_user_session', 'login']]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  assert.equal(clearResetGrievanceCaches(storage, 'reset-1'), true);
  assert.equal(values.has('nitte_saved_issues'), false);
  assert.equal(values.has('nitte_saved_ros'), false);
  assert.equal(values.has('nitte_saved_students'), true);
  assert.equal(values.has('nitte_saved_mentors'), true);
  assert.equal(values.get('auth_user_session'), 'login');
  values.set('nitte_saved_issues', '["new"]');
  assert.equal(clearResetGrievanceCaches(storage, 'reset-1'), false);
  assert.equal(values.get('nitte_saved_issues'), '["new"]');
});
