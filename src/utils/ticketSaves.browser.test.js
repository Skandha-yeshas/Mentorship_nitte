import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const origin = process.env.RO_CATALOG_APP_URL || 'http://localhost:5173';
const executablePath = process.env.RECORDING_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const available = existsSync(executablePath) && await fetch(origin, { signal: AbortSignal.timeout(1500) }).then(response => response.ok).catch(() => false);
test('ticket saves retain confirmed state on failure and submit minutes/outcome once; hidden dashboards pause polling', {
  skip: !available, timeout: 25000
}, async t => {
  const browser = await chromium.launch({ executablePath, headless: true }); t.after(() => browser.close());
  const page = await browser.newPage();
  const actor = { id: 'R1', role: 'RO', name: 'Fixture RO' };
  const state = { authenticatedUser: actor, users: { students: [{ id: 'S1', name: 'Alice' }], mentors: [], ros: [{ id: 'R1' }] },
    issues: [{ id: 'ISS-1', studentId: 'S1', roId: 'R1', status: 'Meeting Scheduled', logs: [] }],
    meetings: [{ id: 'MEET-1', issueId: 'ISS-1', roId: 'R1', status: 'Confirmed', mode: 'Online' }], recordings: [], gmailLogs: [] };
  let fail = true; let readFails = false; let reads = 0; const writes = []; let recordingReads = 0;
  let holdNextRead = false; let releaseRead;
  await page.addInitScript(() => { window.tailwind = {}; });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path === '/api/auth/session') return route.fulfill({ json: { user: actor } });
    if (path === '/api/db-state') {
      reads++;
      if (readFails) return route.fulfill({ status: 503, json: { error: 'Fixture outage' } });
      const snapshot = structuredClone(state);
      if (holdNextRead) { holdNextRead = false; await new Promise(resolve => { releaseRead = resolve; }); }
      return route.fulfill({ json: snapshot });
    }
    if (path === '/api/recordings') { recordingReads++; return route.fulfill({ json: [] }); }
    if (request.method() !== 'GET') {
      writes.push({ path, body: request.postDataJSON() });
      if (fail) return route.fulfill({ status: 503, json: { error: 'Fixture: database save failed' } });
      const body = request.postDataJSON();
      state.meetings[0].status = body.status;
      if (body.discussionSummary) { state.meetings[0].discussionSummary = body.discussionSummary; state.issues[0].status = body.outcome; }
      return route.fulfill({ json: { success: true } });
    }
    return route.fulfill({ json: {} });
  });
  await page.route(/\/src\/main\.jsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    const source = await (await fetch('/src/context/DatabaseContext.jsx')).text();
    const reactUrl = source.match(/from ["']([^"']*react\\.js[^"']*)["']/)[1];
    const React = (await import(reactUrl)).default;
    const { DatabaseProvider, DatabaseContext } = await import('/src/context/DatabaseContext.jsx');
    function Probe() {
      const context = React.useContext(DatabaseContext); window.context = context;
      return React.createElement('pre', { id: 'state' }, JSON.stringify({ loading: context.loading, db: context.db }));
    }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(DatabaseProvider, null, React.createElement(Probe)));
  ` }));
  await page.goto(origin);
  await page.waitForFunction(() => window.context && !window.context.loading && window.context.db.meetings.length === 1);
  for (const expression of [
    "window.context.updateMeetingStatus('MEET-1','Started')",
    "window.context.submitFeedback('ISS-1',5,'Helpful')",
    "window.context.reopenIssue('ISS-1','S1','Still need help')",
    "window.context.resolveIssue('ISS-1','R1','Resolved')",
    "window.context.escalateIssue('ISS-1','R1','Need help')",
    "window.context.reassignIssue('ISS-1','R2')",
    "window.context.scheduleRoMeeting('ISS-1','S1','R1','2026-11-02','10:00','Online')"
  ]) {
    const message = await page.evaluate(async expression => { try { await (0, eval)(expression); return 'Unexpected success'; } catch (error) { return error.message; } }, expression);
    assert.match(message, /database save failed/);
    assert.equal(await page.evaluate(() => window.context.db.meetings[0].status), 'Confirmed');
    assert.equal(await page.evaluate(() => window.context.db.issues[0].status), 'Meeting Scheduled');
  }
  assert.ok(writes.every(write => !write.path.startsWith('/api/data/')));
  // A poll begun before the save must not replace the post-save snapshot.
  fail = false; holdNextRead = true;
  await page.evaluate(() => { window.pendingRefresh = window.context.fetchDbState(); });
  while (!releaseRead) await new Promise(resolve => setTimeout(resolve, 10));
  const saving = page.evaluate(() => window.context.updateMeetingStatus('MEET-1', 'Started'));
  while (state.meetings[0].status !== 'Started') await new Promise(resolve => setTimeout(resolve, 10));
  releaseRead(); await saving;
  assert.equal(await page.evaluate(() => window.context.db.meetings[0].status), 'Started');
  const before = writes.length;
  await page.evaluate(() => window.context.submitRoMeetingFeedback('MEET-1','ISS-1','R1', {
    discussionSummary: 'Deliberations', actionItems: 'Action', outcome: 'Resolved', followUpNeeded: false
  }));
  assert.equal(writes.length, before + 1);
  assert.equal(writes.at(-1).path, '/api/meetings/MEET-1');
  assert.equal(writes.at(-1).body.outcome, 'Resolved');
  assert.equal(await page.evaluate(() => window.context.db.issues[0].status), 'Resolved');
  assert.equal(recordingReads, 0);
  readFails = true; await page.evaluate(() => window.context.fetchDbState());
  await page.waitForFunction(() => Boolean(window.context.error));
  assert.ok(await page.evaluate(() => window.context.error));
  assert.equal(await page.evaluate(() => window.context.db.issues[0].status), 'Resolved');
  readFails = false; await page.evaluate(() => window.context.fetchDbState());
  await page.waitForFunction(() => window.context.error === null);
  assert.equal(await page.evaluate(() => window.context.error), null);
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }));
  const hiddenReads = reads;
  await page.waitForTimeout(5400);
  assert.equal(reads, hiddenReads);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(count => window.context && count < performance.getEntriesByType('resource').filter(row => row.name.includes('/api/db-state')).length, hiddenReads);
});
