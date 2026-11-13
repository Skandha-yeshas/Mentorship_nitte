import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const origin = process.env.RO_CATALOG_APP_URL || 'http://localhost:5173';
const executablePath = process.env.RECORDING_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const available = existsSync(executablePath) && await fetch(origin, { signal: AbortSignal.timeout(1500) }).then(response => response.ok).catch(() => false);
test('roster progress survives a browser reload and retries emails without resubmitting accounts', { skip: !available, timeout: 20000 }, async t => {
  const browser = await chromium.launch({ executablePath, headless: true }); t.after(() => browser.close());
  const page = await browser.newPage(); page.setDefaultTimeout(7000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const jobs = []; const writes = [];
  const id = '01234567-1234-4123-8123-0123456789ab';
  await page.addInitScript(() => { window.tailwind = {}; });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/**', async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    if (request.method() === 'POST') writes.push(path);
    if (path === '/api/auth/session' || path === '/api/recordings/session') return route.fulfill({ json: { user: { id: 'ADMIN', role: 'Admin', name: 'Fixture Admin' } } });
    if (path === '/api/recordings') return route.fulfill({ json: [] });
    if (path === '/api/db-state') return route.fulfill({ json: { users: { students: [], mentors: [], ros: [] }, issues: [], meetings: [], gmailLogs: [] } });
    if (path === '/api/admin/bulk-upload-students') {
      jobs.push({ id, kind: 'students', total: 1, processed: 0, successCount: 0, failureCount: 0, emailsSent: 0, emailsWaiting: 0, emailsUnsent: 0, status: 'QUEUED' });
      return route.fulfill({ status: 202, json: { jobId: id, id, kind: 'students', total: 1, queued: true } });
    }
    if (path === '/api/admin/roster-jobs') return route.fulfill({ json: jobs });
    if (path.endsWith('/retry-emails')) { jobs[0].emailsUnsent = 0; jobs[0].emailsWaiting = 1; return route.fulfill({ json: { queued: 1 } }); }
    if (path === `/api/admin/roster-jobs/${id}`) return route.fulfill({ json: { ...jobs[0], results: [{ index: 1, id: 'S1', name: '=MaliciousFormula', email: 'student@college.edu', status: 'SUCCESS', action: 'CREATED', password: 'Fixture-Password-42!', emailStatus: 'SKIPPED_DISABLED' }] } });
    return route.fulfill({ json: {} });
  });
  await page.route(/\/src\/main\.jsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    const source = await (await fetch('/src/context/DatabaseContext.jsx')).text();
    const reactUrl = source.match(/from ["']([^"']*react\\.js[^"']*)["']/)[1];
    const React = (await import(reactUrl)).default;
    const { DatabaseProvider, DatabaseContext } = await import('/src/context/DatabaseContext.jsx');
    const { RosterImportProgress } = await import('/src/components/RosterImportProgress.jsx');
    function Probe() {
      const context = React.useContext(DatabaseContext);
      window.importFixture = () => context.bulkUploadStudents([{ id: 'S1', name: 'Alice', email: 'student@college.edu', branch: 'CSE', sem: 4 }]);
      return React.createElement(React.Fragment, null,
        React.createElement('div', { id: 'ready' }, String(!!context.authenticatedUser && !context.loading)),
        React.createElement(RosterImportProgress, { jobs: context.rosterImports, kind: 'students', refresh: context.refreshRosterImports }));
    }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(DatabaseProvider, null, React.createElement(Probe)));
  ` }));
  await page.goto(origin); await page.waitForFunction(() => document.getElementById('ready')?.textContent === 'true');
  assert.equal((await page.evaluate(() => window.importFixture())).queued, true);
  await page.getByRole('region', { name: 'Roster import progress' }).waitFor();
  await page.reload(); await page.getByRole('region', { name: 'Roster import progress' }).waitFor();
  jobs[0] = { ...jobs[0], processed: 1, successCount: 1, status: 'COMPLETED', emailsUnsent: 1 };
  await page.getByText('1/1 processed', { exact: false }).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download results and initial passwords' }).click();
  const download = await downloadPromise; const stream = await download.createReadStream(); const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const csv = Buffer.concat(chunks).toString('utf8');
  assert.ok(csv.includes("'=MaliciousFormula")); assert.ok(csv.includes('Fixture-Password-42!'));
  await page.getByRole('button', { name: 'Retry eligible unsent emails' }).click();
  await page.getByRole('status').waitFor();
  assert.equal(writes.filter(path => path === '/api/admin/bulk-upload-students').length, 1);
  assert.equal(writes.filter(path => path.endsWith('/retry-emails')).length, 1);
  assert.equal(await page.evaluate(() => JSON.stringify(localStorage).includes('Fixture-Password-42!')), false);
  assert.deepEqual(errors, []);
});
