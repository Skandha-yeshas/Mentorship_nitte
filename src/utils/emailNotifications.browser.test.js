import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const origin = process.env.RO_CATALOG_APP_URL || 'http://localhost:5173';
const executablePath = process.env.RECORDING_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const available = existsSync(executablePath) && await fetch(origin, { signal: AbortSignal.timeout(1500) }).then(response => response.ok).catch(() => false);

for (const role of ['RO', 'Admin']) test(`${role} meeting actions use the backend once and do not send a duplicate browser email`, { skip: !available, timeout: 20000 }, async t => {
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage(); page.setDefaultTimeout(7000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const user = { role, id: role === 'RO' ? 'RO-A' : 'ADMIN', name: 'Fixture account' };
  const state = { users: { students: [{ id: 'S-A', name: 'Alice', email: 'alice@college.edu' }], ros: [{ id: 'RO-A', name: 'Officer A', region: 'Enrollment', email: 'officer-a@college.edu' }], mentors: [] },
    issues: [{ id: 'ISS-A', studentId: 'S-A', studentName: 'Alice', roId: 'RO-A', category: 'Enrollment', status: 'Assigned to RO', logs: [] }], meetings: [], recordings: [], gmailLogs: [], categoryVideos: [] };
  const writes = [];
  await page.addInitScript(() => { window.tailwind = {}; localStorage.clear(); });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path === '/api/auth/session') return route.fulfill({ json: { user } });
    if (path === '/api/db-state') return route.fulfill({ json: state });
    if (path === '/api/recordings/session') return route.fulfill({ json: { user } });
    if (path === '/api/recordings') return route.fulfill({ json: [] });
    if (request.method() !== 'GET') writes.push({ path, body: request.postDataJSON() });
    if (path === '/api/meetings') {
      const meeting = request.postDataJSON(); state.meetings = [{ ...meeting, status: 'Confirmed' }];
      return route.fulfill({ json: { id: meeting.id, isReschedule: false, notifications: [{ status: 'SKIPPED_DISABLED' }] } });
    }
    if (path === '/api/issues/ISS-A/resolve') { state.issues[0].status = 'Resolved'; return route.fulfill({ json: { success: true } }); }
    await route.fulfill({ json: {} });
  });
  await page.route(/\/src\/main\.jsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    const source = await (await fetch('/src/context/DatabaseContext.jsx')).text();
    const reactUrl = source.match(/from ["']([^"']*react\\.js[^"']*)["']/)[1];
    const React = (await import(reactUrl)).default;
    const { DatabaseProvider, DatabaseContext } = await import('/src/context/DatabaseContext.jsx');
    function Probe() {
      const context = React.useContext(DatabaseContext);
      window.scheduleFixture = () => ${role === 'RO' ? "context.scheduleRoMeeting('ISS-A', 'S-A', 'RO-A', '2026-11-02', '10:00', 'Online', 'Portal', 'Fixture meeting')" : "context.scheduleAdminMeeting('ISS-A', 'S-A', '2026-11-02', '10:00', 'Online', 'Portal', 'Fixture hearing')"};
      window.resolveFixture = () => context.adminResolveIssue('ISS-A', 'Resolved in fixture');
      return React.createElement('pre', { id: 'fixture' }, JSON.stringify({ ready: !!context.authenticatedUser && !context.loading }));
    }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(DatabaseProvider, null, React.createElement(Probe)));
  ` }));
  await page.goto(origin);
  await page.waitForFunction(() => JSON.parse(document.getElementById('fixture')?.textContent || '{}').ready);
  await page.evaluate(() => window.scheduleFixture());
  assert.equal(writes.filter(row => row.path === '/api/meetings').length, 1);
  assert.equal(writes.filter(row => row.path === '/api/gmail/send').length, 0);
  assert.equal(writes.some(row => row.path.startsWith('/api/data/')), false);
  if (role === 'Admin') {
    await page.evaluate(() => window.resolveFixture());
    assert.equal(writes.filter(row => row.path === '/api/issues/ISS-A/resolve').length, 1);
    assert.equal(writes.some(row => row.path === '/api/gmail/send' || row.path.startsWith('/api/data/')), false);
  }
  assert.deepEqual(errors, []);
});
