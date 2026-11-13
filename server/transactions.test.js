import test from 'node:test';
import assert from 'node:assert/strict';
import { withTransaction } from './transactions.js';

test('an aborted transaction reported as ROLLBACK is never returned as a successful save', async () => {
  let released = false;
  await assert.rejects(withTransaction(async () => ({ query: async sql => ({ command: sql === 'COMMIT' ? 'ROLLBACK' : sql }), release: () => { released = true; } }), async () => ({ success: true })), /did not commit/);
  assert.equal(released, true);
});

test('a lost commit response does not replay the action', async () => {
  let writes = 0; let released = false;
  const client = { query: async sql => { if (sql === 'COMMIT') throw new Error('Connection reset'); return { command: sql }; }, release: () => { released = true; } };
  await assert.rejects(withTransaction(async () => client, async () => { writes++; }), /Connection reset/);
  assert.equal(writes, 1); assert.equal(released, true);
});
