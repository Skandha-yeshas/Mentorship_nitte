import test from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch } from './apiFetch.js';
import { clearPrivateCaches, safeCacheSetItem, initializePrivateCaches } from './sessionCache.js';

test('legacy database requests stay on the authenticated API and include CSRF protection', async t => {
  t.mock.method(globalThis, 'fetch', async (url, options) => ({ url, options }));
  const old = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { cookie: 'other=x; nitte_csrf=csrf-value' } });
  t.after(() => { if (old) Object.defineProperty(globalThis, 'document', old); else delete globalThis.document; });
  const result = await apiFetch('https://example.supabase.co/rest/v1/students?id=eq.S1', {
    method: 'PATCH', headers: { apikey: 'public-key', Authorization: 'Bearer public-key', 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(result.url, '/api/data/students?id=eq.S1');
  assert.equal(result.options.credentials, 'same-origin');
  assert.equal(result.options.headers.has('apikey'), false);
  assert.equal(result.options.headers.has('Authorization'), false);
  assert.equal(result.options.headers.get('X-CSRF-Token'), 'csrf-value');
});

test('private browser caches are removed and cannot persist dashboard records or credentials', t => {
  const storage = { nitte_saved_students: 'old records', auth_user_session: 'forged Admin', nitte_managed_branches: 'CSE',
    getItem(key) { return this[key] ?? null; }, setItem(key, value) { this[key] = value; }, removeItem(key) { delete this[key]; } };
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => { if (old) Object.defineProperty(globalThis, 'localStorage', old); else delete globalThis.localStorage; });
  initializePrivateCaches();
  assert.equal(storage.nitte_saved_students, undefined);
  assert.equal(storage.auth_user_session, undefined);
  assert.equal(storage.nitte_managed_branches, 'CSE');
  safeCacheSetItem('nitte_saved_issues', 'private');
  safeCacheSetItem('auth_user_session', 'Admin');
  assert.equal(storage.nitte_saved_issues, undefined);
  assert.equal(storage.auth_user_session, undefined);
  clearPrivateCaches();
});
