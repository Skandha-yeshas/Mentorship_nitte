import test from 'node:test';
import assert from 'node:assert/strict';
import { createIssueActivityStore } from './issueActivity.js';

const event = { id: 'start:1', text: 'Meeting started by RO-01.', time: '2026-10-30T10:00:00Z' };
const initial = { text: 'Issue submitted by student.', time: '2026-10-29T10:00:00Z' };
const store = overrides => createIssueActivityStore({
  query: async () => ({ rows: [] }), readCloudIssue: async () => null,
  writeCloudIssue: async () => {}, getMemoryIssues: () => [], ...overrides
});

test('reads only persisted history for the requested issue', async () => {
  const activity = store({
    query: async (sql, params) => { assert.deepEqual(params, ['ISS-1']); return { rows: [{ id: 'ISS-1', logs: JSON.stringify([initial]) }] }; },
    getMemoryIssues: () => [{ id: 'ISS-1', logs: [initial, event] }]
  });
  const result = await activity.read('ISS-1');
  assert.deepEqual(result.logs.map(log => log.text), [initial.text]);
});

test('database failures propagate rather than accepting unsaved memory/cloud state', async () => {
  const activity = store({
    query: async () => { throw new Error('Database unavailable'); },
    readCloudIssue: async () => { throw new Error('An anonymous fallback must not run'); }
  });
  await assert.rejects(activity.read('ISS-1'), /Database unavailable/);
  await assert.rejects(activity.append('ISS-1', event), /Database unavailable/);
});

test('meeting events append atomically without replacing existing actions', async () => {
  const activity = store({ query: async (sql, params) => {
    assert.match(sql, /COALESCE\(logs, '\[\]'::jsonb\) \|\| \$1::jsonb/);
    assert.deepEqual(params, [JSON.stringify([event]), 'ISS-1', 'Meeting Started']);
    return { rows: [{ id: 'ISS-1', logs: [initial, event], status: 'Meeting Started' }] };
  } });
  assert.equal((await activity.append('ISS-1', event, 'Meeting Started')).logs.length, 2);
});

test('simultaneous meeting-end and RO-feedback appends preserve both events', async () => {
  const row = { id: 'ISS-1', logs: [initial], status: 'Meeting Started' };
  const activity = store({ query: async (sql, params) => {
    row.logs.push(...JSON.parse(params[0]));
    return { rows: [{ ...row, logs: [...row.logs] }] };
  } });
  const ended = { ...event, id: 'ended', text: 'Meeting ended by RO.' };
  const feedback = { ...event, id: 'feedback', text: '[RO POST-MEETING DISCUSSION RECORD] Minutes submitted.' };
  await Promise.all([activity.append('ISS-1', ended, 'In-Progress'), activity.append('ISS-1', feedback)]);
  assert.equal(row.logs.length, 3);
  assert.deepEqual(row.logs.slice(1).map(item => item.id), ['ended', 'feedback']);
});

test('full saved history is returned without truncation and missing tickets are not fabricated', async () => {
  const logs = Array.from({ length: 150 }, (_, id) => ({ id, text: `Action ${id}`, time: event.time }));
  const activity = store({ query: async () => ({ rows: [{ id: 'ISS-1', logs }] }) });
  assert.equal((await activity.read('ISS-1')).logs.length, 150);
  assert.equal(await store({}).read('ISS-MISSING'), null);
  await assert.rejects(store({}).append('ISS-MISSING', event), /Ticket not found/);
});
