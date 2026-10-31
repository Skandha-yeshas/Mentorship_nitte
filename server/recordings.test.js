import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createRecordingAuth } from './recordingAuth.js';
import { createRecordingRepository, createRecordingsRouter, parseRecordingRange, validateRecordingBytes } from './recordings.js';

const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...Array(32).fill(7)]);
const actor = { id: 'RO-TEST', role: 'RO' };

// A SQL-shaped adapter exercises the production repository and HTTP handlers without live student data.
function memoryDatabase() {
  const rows = new Map();
  return async (sql, values) => {
    if (sql.startsWith('SELECT id, ro_id FROM issues')) return { rows: [{ id: 'ISSUE-TEST', ro_id: actor.id }] };
    if (sql.startsWith('SELECT issue_id FROM meetings')) return { rows: [{ issue_id: 'ISSUE-TEST' }] };
    if (sql.startsWith('INSERT')) {
      if (rows.has(values[0])) return { rows: [] };
      const [id, meeting_id, issue_id, ro_id, mime_type, byte_size, duration_seconds, transcript_summary, media_data] = values;
      const row = { id, meeting_id, issue_id, ro_id, mime_type, byte_size, duration_seconds, transcript_summary, media_data, recorded_at: new Date() };
      rows.set(id, row);
      return { rows: [row] };
    }
    if (sql.includes(' AS data FROM meeting_recordings')) {
      const row = rows.get(values[0]);
      return { rows: row ? [{ data: values.length > 1 ? row.media_data.subarray(values[1] - 1, values[1] - 1 + values[2]) : row.media_data }] : [] };
    }
    const idQuery = sql.includes('WHERE id = $1');
    const role = values[idQuery ? 1 : 0];
    const userId = values[idQuery ? 2 : 1];
    return { rows: [...rows.values()].filter(row => (!idQuery || row.id === values[0]) && (role === 'Admin' || row.ro_id.toUpperCase() === userId.toUpperCase())) };
  };
}

async function fixture(t) {
  let clock = Date.now();
  const auth = createRecordingAuth({ now: () => clock });
  const repository = createRecordingRepository(memoryDatabase());
  const app = express();
  app.use(express.json());
  app.post('/api/auth/login', (req, res) => {
    const user = { id: req.body.id, role: req.body.role };
    auth.issue(user, res);
    res.json({ user });
  });
  app.use('/api/recordings', createRecordingsRouter({ repository, auth }));
  app.get('/', (req, res) => res.type('html').send('<!doctype html><title>Recording playback test</title>'));
  for (const path of ['/src/utils/compositeRecorder.js', '/src/utils/recordingApi.js', '/src/utils/apiFetch.js', '/shared/meetingRecordings.js']) {
    app.get(path, async (req, res) => res.type('js').send(await readFile(new URL(`..${path}`, import.meta.url), 'utf8')));
  }
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (user = actor) => {
    const result = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(user) });
    return result.headers.get('set-cookie')?.split(';')[0] || '';
  };
  return { base, login, repository, expire: () => { clock += 9 * 60 * 60 * 1000; } };
}

test('recording ranges support seeking, suffixes, open ranges and reject invalid ranges', () => {
  assert.equal(parseRecordingRange(undefined, 100), null);
  assert.deepEqual(parseRecordingRange('bytes=2-9', 100), { start: 2, end: 9, length: 8 });
  assert.deepEqual(parseRecordingRange('bytes=95-', 100), { start: 95, end: 99, length: 5 });
  assert.deepEqual(parseRecordingRange('bytes=-8', 100), { start: 92, end: 99, length: 8 });
  assert.deepEqual(parseRecordingRange('bytes=90-200', 100), { start: 90, end: 99, length: 10 });
  for (const header of ['bytes=100-', 'bytes=5-2', 'bytes=-0', 'bytes=-', 'bytes=1-2,4-5', 'items=1-4']) {
    assert.throws(() => parseRecordingRange(header, 100), { status: 416 });
  }
});

test('storage rejects empty files, fake links and mismatched containers', () => {
  assert.equal(validateRecordingBytes(webm, 'video/webm;codecs=vp8,opus'), 'video/webm');
  assert.throws(() => validateRecordingBytes(Buffer.alloc(0), 'video/webm'), { status: 400 });
  assert.throws(() => validateRecordingBytes('blob:temporary-link', 'video/webm'), { status: 400 });
  assert.throws(() => validateRecordingBytes(Buffer.from('https://fake.invalid/recording.mp4'), 'video/mp4'), { status: 415 });
  assert.throws(() => validateRecordingBytes(webm, 'video/mp4'), { status: 415 });
});

test('recording upload persists exact bytes, retry is idempotent and media supports range/HEAD/download', async t => {
  const { base, login } = await fixture(t);
  const cookie = await login();
  const id = `REC-${randomUUID()}`;
  const url = `${base}/api/recordings?meetingId=MEET-TEST&issueId=ISSUE-TEST&durationSeconds=5`;
  const options = { method: 'POST', headers: { cookie, 'Content-Type': 'video/webm', 'X-Recording-ID': id }, body: webm };
  const saved = await fetch(url, options);
  assert.equal(saved.status, 201);
  const metadata = await saved.json();
  assert.equal(metadata.byteSize, webm.length);
  assert.equal(metadata.roId, actor.id);
  assert.equal(metadata.storageStatus, 'stored');
  assert.equal((await fetch(url, options)).status, 200);
  assert.equal((await (await fetch(`${base}/api/recordings`, { headers: { cookie } })).json()).length, 1);
  const media = `${base}${metadata.videoUrl}`;
  const full = await fetch(media, { headers: { cookie } });
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), webm);
  const range = await fetch(media, { headers: { cookie, Range: 'bytes=4-11' } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get('content-range'), `bytes 4-11/${webm.length}`);
  assert.deepEqual(Buffer.from(await range.arrayBuffer()), webm.subarray(4, 12));
  const head = await fetch(media, { method: 'HEAD', headers: { cookie } });
  assert.equal(Number(head.headers.get('content-length')), webm.length);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  const invalid = await fetch(media, { headers: { cookie, Range: 'bytes=9000-' } });
  assert.equal(invalid.status, 416);
  assert.equal(invalid.headers.get('content-range'), `bytes */${webm.length}`);
  const download = await fetch(`${media}?download=1`, { headers: { cookie } });
  assert.match(download.headers.get('content-disposition'), /attachment;.*\.webm/);
});

test('students, expired sessions and other ROs cannot read or upload another RO recording', async t => {
  const { base, login, repository, expire } = await fixture(t);
  const { row } = await repository.save({ meetingId: 'MEET-TEST', issueId: 'ISSUE-TEST', bytes: webm, mimeType: 'video/webm', durationSeconds: 1 }, actor);
  const media = `${base}/api/recordings/${row.id}/media`;
  assert.equal((await fetch(media)).status, 401);
  const student = await login({ id: 'STUDENT-TEST', role: 'Student' });
  assert.equal(student, '');
  assert.equal((await fetch(media, { headers: { cookie: student } })).status, 401);
  const other = await login({ id: 'OTHER-RO', role: 'RO' });
  assert.equal((await fetch(media, { headers: { cookie: other } })).status, 404);
  assert.deepEqual(await (await fetch(`${base}/api/recordings`, { headers: { cookie: other } })).json(), []);
  await assert.rejects(repository.save({ meetingId: 'MEET-TEST', issueId: 'ISSUE-TEST', bytes: webm, mimeType: 'video/webm' }, { id: 'OTHER-RO', role: 'RO' }), { status: 403 });
  const admin = await login({ id: 'ADMIN', role: 'Admin' });
  assert.equal((await fetch(media, { headers: { cookie: admin } })).status, 200);
  const own = await login();
  const logout = await fetch(`${base}/api/recordings/session`, { method: 'DELETE', headers: { cookie: own } });
  assert.equal(logout.status, 204);
  assert.equal((await fetch(media, { headers: { cookie: own } })).status, 401);
  const expired = await login();
  expire();
  assert.equal((await fetch(media, { headers: { cookie: expired } })).status, 401);
});

const browserExecutable = process.env.RECORDING_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
test('actual dual-feed recording saves, survives reload and decodes both video feeds with audio', { skip: !existsSync(browserExecutable), timeout: 45000 }, async t => {
  const { base } = await fixture(t);
  const browser = await chromium.launch({ executablePath: browserExecutable, headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(base);
  const saved = await page.evaluate(async () => {
    const { CompositeMeetingRecorder } = await import('/src/utils/compositeRecorder.js');
    const { createRecordingApi } = await import('/src/utils/recordingApi.js');
    const makeStream = color => {
      const canvas = document.createElement('canvas');
      canvas.width = 640; canvas.height = 480;
      const ctx = canvas.getContext('2d');
      const paint = () => { ctx.fillStyle = color; ctx.fillRect(0, 0, 640, 480); };
      paint();
      const interval = setInterval(paint, 40);
      return { stream: canvas.captureStream(25), interval };
    };
    const local = makeStream('#ff0000');
    const remote = makeStream('#0000ff');
    const recorder = new CompositeMeetingRecorder({ localStream: local.stream, ticketId: 'ISSUE-TEST' });
    recorder.setRemoteStream(remote.stream);
    await Promise.all([recorder.localVideo.play(), recorder.remoteVideo.play()]);
    recorder.start();
    await new Promise(resolve => setTimeout(resolve, 1600));
    const first = recorder.stop();
    if (first !== recorder.stop()) throw new Error('Stop did not reuse finalization');
    const { blob, durationSeconds } = await first;
    clearInterval(local.interval); clearInterval(remote.interval);
    [...local.stream.getTracks(), ...remote.stream.getTracks()].forEach(track => track.stop());
    const api = createRecordingApi({ getActor: () => ({ id: 'RO-TEST', role: 'RO', password: 'test-only' }) });
    await api.signIn({ id: 'RO-TEST', role: 'RO', password: 'test-only' });
    const stored = await api.save({ recordingId: `REC-${crypto.randomUUID()}`, meetingId: 'MEET-TEST', issueId: 'ISSUE-TEST', durationSeconds, blob });
    return { ...stored, originalSize: blob.size };
  });
  assert.ok(saved.byteSize > 1000);
  assert.equal(saved.byteSize, saved.originalSize);
  await page.reload();
  const pixels = await page.evaluate(async () => {
    const list = await (await fetch('/api/recordings')).json();
    if (list.length !== 1) throw new Error('Saved recording missing after refresh');
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true;
    document.body.appendChild(video);
    video.src = list[0].videoUrl;
    await video.play();
    await new Promise(resolve => setTimeout(resolve, 400));
    video.pause();
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0);
    return {
      width: video.videoWidth, height: video.videoHeight,
      left: [...ctx.getImageData(240, 250, 1, 1).data],
      right: [...ctx.getImageData(720, 250, 1, 1).data],
      decodedAudioBytes: video.webkitAudioDecodedByteCount,
      error: video.error?.message
    };
  });
  assert.equal(pixels.error, undefined);
  assert.equal(pixels.width, 960); assert.equal(pixels.height, 540);
  assert.ok(pixels.left[0] > 180 && pixels.left[2] < 60, `RO frame not decoded: ${pixels.left}`);
  assert.ok(pixels.right[2] > 180 && pixels.right[0] < 60, `Student frame not decoded: ${pixels.right}`);
  assert.ok(pixels.decodedAudioBytes > 0, 'Mixed audio track did not decode');
});
