import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecordingApi } from './recordingApi.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const actor = { id: 'RO-1', role: 'RO', password: 'test-only' };
test('recording API uses the signed-in session and sends the original video bytes', async () => {
  const calls = [];
  const api = createRecordingApi({ getActor: () => ({ id: actor.id, role: actor.role }), fetchImpl: async (path, options = {}) => {
    calls.push({ path, options });
    if (path.endsWith('/session')) return json({ user: { id: actor.id, role: actor.role } });
    return json({ id: 'REC-test', byteSize: options.body.size });
  } });
  const blob = new Blob(['actual-video-data'], { type: 'video/webm;codecs=vp8,opus' });
  const result = await api.save({ recordingId: 'REC-test', meetingId: 'MEET-1', issueId: 'ISSUE-1', durationSeconds: 2, blob });
  assert.equal(result.byteSize, blob.size);
  const uploads = calls.filter(call => call.options.method === 'POST');
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].options.body, blob);
  assert.equal(uploads[0].options.headers['X-Recording-ID'], 'REC-test');
  assert.equal(uploads[0].options.headers['Content-Type'], 'video/webm');
  assert.equal(calls.some(call => call.path.endsWith('/login')), false);
});

test('expired recording sessions require sign in without resending any profile password', async () => {
  const calls = [];
  const api = createRecordingApi({ getActor: () => actor, fetchImpl: async path => {
    calls.push(path); return json({}, 401);
  } });
  await assert.rejects(api.list(), /session expired/);
  assert.deepEqual(calls, ['/api/recordings/session']);
});

test('failed recording uploads report errors without consuming the retained blob', async () => {
  const blob = new Blob(['video-data'], { type: 'video/webm' });
  const api = createRecordingApi({ getActor: () => actor, fetchImpl: async path => path.endsWith('/session') ? json({ user: actor }) : json({ error: 'Database offline' }, 503) });
  await assert.rejects(api.save({ recordingId: 'REC-test', meetingId: 'M', issueId: 'I', durationSeconds: 1, blob }), /Database offline/);
  assert.equal(await blob.text(), 'video-data');
  await assert.rejects(api.save({ blob: 'blob:temporary-link' }), /did not produce a video/);
});

test('student recording requests are rejected before accessing storage', async () => {
  let fetched = false;
  const api = createRecordingApi({ getActor: () => ({ id: 'S', role: 'Student' }), fetchImpl: async () => { fetched = true; } });
  await assert.rejects(api.list(), /Only an RO or Admin/);
  assert.equal(fetched, false);
});
