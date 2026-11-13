import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const origin = process.env.MEETING_TEST_APP_URL || 'http://localhost:5173';
const executablePath = process.env.RECORDING_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const available = existsSync(executablePath) && await fetch(origin, { signal: AbortSignal.timeout(1500) }).then(r => r.ok).catch(() => false);

test('RO and student countdowns end calls, save the RO recording, and retain feedback at the limit', {
  skip: !available, timeout: 45000
}, async t => {
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  for (const role of ['RO', 'Student']) {
    const page = await browser.newPage();
    await page.clock.install();
    page.setDefaultTimeout(7000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => { window.tailwind = {}; });
    await page.route('https://**/*', route => route.abort());
    await page.route('**/api/**', route => route.fulfill({ json: {} }));
    // Mock only hardware/WebRTC/recording. Real dashboards and countdown lifecycle
    // run against an in-memory provider; no live records or email are touched.
    await page.route(/\/src\/utils\/webrtcService\.js(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
      export const getCanonicalMeetingRoomId = value => String(value || '').toUpperCase().replace(/^MEET-/, '');
      export class WebRtcMeetingSession {
        close() { window.closedSessions = (window.closedSessions || 0) + 1; }
        sendSignal() {} updateLocalStream() {} setAudioEnabled() {} setVideoEnabled() {}
      }
    ` }));
    await page.route(/\/src\/utils\/compositeRecorder\.js(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
      export class CompositeMeetingRecorder {
        start() {} setRemoteStream() {} setRemoteCamOff() {} setLocalCamOff() {} setLocalMicMuted() {}
        async stop() { window.stoppedRecordings = (window.stoppedRecordings || 0) + 1; return { blob: new Blob(['fixture video'], { type: 'video/webm' }), durationSeconds: 5 }; }
      }
    ` }));
    await page.route(/\/src\/main\.jsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      const viewUrl = '/src/views/${role === 'RO' ? 'RODashboard' : 'StudentDashboard'}.jsx';
      const source = await (await fetch(viewUrl)).text();
      const contextUrl = source.match(/from ["']([^"']*context\\/DatabaseContext\\.jsx[^"']*)["']/)[1];
      const { DatabaseContext } = await import(contextUrl);
      const View = (await import(viewUrl)).${role === 'RO' ? 'RODashboard' : 'StudentDashboard'};
      let db = {
        authenticatedUser: { id: '${role === 'RO' ? 'RO-TEST' : 'S-TEST'}', role: '${role}', name: 'Fixture User' },
        users: { ros: [{ id: 'RO-TEST', name: 'Fixture RO', region: 'Academic' }], students: [{ id: 'S-TEST', name: 'Fixture Student' }], mentors: [] },
        issues: [{ id: 'ISS-TEST', roId: 'RO-TEST', studentId: 'S-TEST', studentName: 'Fixture Student', category: 'Academic', priority: 'HIGH', status: 'Meeting Scheduled', logs: [] }],
        meetings: [{ id: 'MEET-TEST', issueId: 'ISS-TEST', roId: 'RO-TEST', studentId: 'S-TEST', status: '${role === 'RO' ? 'Confirmed' : 'Started'}', mode: 'Online', date: '2099-01-01', time: '10:00',
          startedAt: ${role === 'RO' ? 'null' : 'new Date(Date.now() - 29 * 60000 - 55000).toISOString()'}, serverNow: new Date().toISOString() }],
        categoryVideos: [], recordings: [], gmailLogs: [], groupSessions: [], resources: [], mentorFeedbacks: []
      };
      window.savedRecordings = 0; window.completedMeetings = 0;
      Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
        const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64;
        const stream = canvas.captureStream(1); window.testTracks = stream.getTracks(); return stream;
      }});
      const root = ReactDOM.createRoot(document.getElementById('root'));
      const noop = () => {};
      const value = {
        get db() { return db; },
        updateMeetingStatus: async (id, status) => {
          if (status === 'Completed') window.completedMeetings++;
          db = { ...db, meetings: db.meetings.map(m => ({ ...m, status,
            ...(status === 'Started' ? { startedAt: new Date(Date.now() - 29 * 60000 - 55000).toISOString(), serverNow: new Date().toISOString() } : {}) })) };
          render();
        },
        saveMeetingRecording: async () => { window.savedRecordings++; },
        resolveIssue: noop, escalateIssue: noop, scheduleRoMeeting: noop, loadMeetingRecording: noop,
        updateCategoryVideo: noop, submitRoMeetingFeedback: noop, submitIssue: noop, submitFeedback: noop, reopenIssue: noop
      };
      const render = () => root.render(React.createElement(DatabaseContext.Provider, { value: { ...value } }, React.createElement(View, { ${role === 'RO' ? "roId: 'RO-TEST'" : "studentId: 'S-TEST'"} })));
      render();
    ` }));
    await page.goto(origin);
    if (role === 'RO') {
      await page.getByText('#ISS-TEST', { exact: true }).click();
      await page.getByRole('button', { name: 'Start Meeting', exact: true }).first().click();
    } else {
      await page.getByRole('button', { name: /Join Live Video Call/ }).click();
    }
    await page.getByRole('timer').waitFor();
    assert.match(await page.getByRole('timer').innerText(), /Time left 00:0[1-5]/);
    await page.waitForFunction(() => window.testTracks?.length > 0);
    if (role === 'RO') await page.waitForFunction(() => document.querySelector('#rec-indicator'));
    await page.clock.fastForward(6000);
    await page.getByRole('timer').waitFor({ state: 'detached' });
    await page.waitForFunction(() => window.testTracks.every(track => track.readyState === 'ended'));
    if (role === 'RO') {
      await page.getByText('Post-Meeting Discussion & Feedback Record', { exact: true }).waitFor();
      await page.waitForFunction(() => window.savedRecordings === 1 && window.completedMeetings === 1);
      assert.equal(await page.evaluate(() => window.stoppedRecordings), 1);
    } else {
      await page.getByText('The 30-minute meeting limit has been reached.', { exact: true }).waitFor();
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
});

test('WebRTC uses the server deadline, never extends it on polling, and closes only once', {
  skip: !available, timeout: 15000
}, async t => {
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.clock.install();
  await page.route('https://**/*', route => route.abort());
  let reads = 0;
  const serverTime = Date.parse('2026-11-06T10:00:00Z');
  await page.route('**/api/meetings/signals/**', route => {
    reads++;
    return route.fulfill({ json: { signals: [], now: serverTime,
      meeting: { active: true, endsAt: new Date(serverTime + (reads === 1 ? 5000 : 60000)).toISOString() } } });
  });
  await page.route(/\/src\/main\.jsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    import { WebRtcMeetingSession } from '/src/utils/webrtcService.js';
    window.finished = 0; window.cleaned = 0;
    const session = Object.create(WebRtcMeetingSession.prototype);
    Object.assign(session, { issueId: 'ISS-FIXTURE', isClosed: false, lastSignalTimestamp: 0, expiryDeadline: null,
      sendSignal() {}, cleanupPeerConnection() { window.cleaned++; }, onMeetingEnded(details) { window.finished++; window.endReason = details.reason; } });
    window.session = session;
    await session.pollSignals();
    window.ready = true;
  ` }));
  await page.goto(origin);
  await page.waitForFunction(() => window.ready);
  await page.clock.fastForward(1000);
  await page.evaluate(() => window.session.pollSignals());
  await page.clock.fastForward(4100);
  assert.deepEqual(await page.evaluate(() => ({ closed: window.session.isClosed, finished: window.finished, cleaned: window.cleaned, reason: window.endReason })),
    { closed: true, finished: 1, cleaned: 1, reason: 'time-limit' });
  await page.evaluate(() => window.session.finishMeeting({ reason: 'ended' }));
  assert.equal(await page.evaluate(() => window.finished), 1);
});
