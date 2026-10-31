import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import XLSX from 'xlsx';
import { normalizeRoRosterRow } from '../../shared/roCatalog.js';

const appUrl = process.env.RO_CATALOG_APP_URL || 'http://localhost:5173';
const executablePath = process.env.RECORDING_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const workbookPath = new URL('../../exports/ro_roster_test_10_issues.xlsx', import.meta.url);
const available = existsSync(executablePath) && existsSync(workbookPath) && await fetch(appUrl, { signal: AbortSignal.timeout(1500) }).then(response => response.ok).catch(() => false);

test('database reset clears stale browser grievances and the workbook imports only 10 RO/category rows', {
  skip: !available, timeout: 30000
}, async t => {
  const book = XLSX.readFile(workbookPath);
  const rawRows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
  assert.equal(rawRows.length, 10);
  assert.equal(XLSX.utils.sheet_to_json(book.Sheets['Existing Mentors']).length, 2);
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(5000);
  const state = {
    grievanceResetVersion: 'browser-test-reset', users: { students: [], mentors: [{ id: 'M-101' }, { id: 'M-102' }], ros: [] },
    issues: [], meetings: [], recordings: [], categoryVideos: [], gmailLogs: [], systemLogs: [],
    resources: [], groupSessions: [], mentorSessionRecords: [], mentorFeedbacks: []
  };
  const requests = [];
  await page.addInitScript(() => {
    window.tailwind = {};
    localStorage.setItem('nitte_saved_issues', JSON.stringify([{ id: 'OLD-ISSUE', createdAt: new Date().toISOString(), status: 'Assigned to RO' }]));
    localStorage.setItem('nitte_saved_meetings', JSON.stringify([{ id: 'OLD-MEETING', issueId: 'OLD-ISSUE' }]));
    localStorage.setItem('nitte_saved_ros', JSON.stringify([{ id: 'OLD-RO', region: 'Old hardcoded topic' }]));
    localStorage.removeItem('nitte_grievance_reset_version');
  });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('**/api/auth/session', route => route.fulfill({ json: { user: { id: 'ADMIN', name: 'Admin', role: 'Admin' } } }));
  await page.route('**/api/db-state', route => route.fulfill({ json: state }));
  await page.route('**/api/admin/bulk-upload-ros', async route => {
    const { ros } = route.request().postDataJSON();
    requests.push(ros);
    state.users.ros = ros.map(normalizeRoRosterRow);
    await route.fulfill({ json: { success: true, successCount: ros.length, failureCount: 0, results: state.users.ros.map(row => ({ ...row, status: 'SUCCESS', emailStatus: 'NOT_SENT_TEST_ADDRESS' })) } });
  });
  await page.route(/\/src\/main\.jsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import { getRoCategories } from '/shared/roCatalog.js';
    const source = await (await fetch('/src/context/DatabaseContext.jsx')).text();
    const reactUrl = source.match(/from ["']([^"']*react\\.js[^"']*)["']/)[1];
    const React = (await import(reactUrl)).default;
    const { DatabaseProvider, DatabaseContext } = await import('/src/context/DatabaseContext.jsx');
    const rawRows = ${JSON.stringify(rawRows)};
    function Probe() {
      const context = React.useContext(DatabaseContext);
      window.importWorkbook = () => context.bulkUploadRos(rawRows);
      return React.createElement('pre', { id: 'catalog-result' }, JSON.stringify({
        loading: context.loading, issues: context.db.issues.length, meetings: context.db.meetings.length,
        categories: getRoCategories(context.db.users.ros), mentors: context.db.users.mentors.map(row => row.id)
      }));
    }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(DatabaseProvider, null, React.createElement(Probe)));
  ` }));
  await page.goto(appUrl);
  await page.waitForFunction(() => {
    const value = JSON.parse(document.getElementById('catalog-result')?.textContent || '{}');
    return value.loading === false && value.issues === 0 && value.meetings === 0 && value.categories.length === 0;
  }).catch(async () => { throw new Error(JSON.stringify({ errors, body: await page.locator('body').innerText() })); });
  const result = await page.evaluate(async () => {
    const result = await window.importWorkbook();
    return { count: result.count, state: JSON.parse(document.getElementById('catalog-result').textContent) };
  });
  assert.equal(result.count, 10);
  assert.equal(requests.length, 1);
  assert.equal(requests[0][0].region, rawRows[0]['Assigned Domain Category']);
  assert.equal(requests[0][0].email, rawRows[0]['Official Email']);
  assert.equal(requests[0][0].password, rawRows[0]['Initial Password']);
  await page.waitForFunction(() => JSON.parse(document.getElementById('catalog-result').textContent).categories.length === 10);
  const final = await page.locator('#catalog-result').textContent().then(JSON.parse);
  assert.deepEqual(final.mentors, ['M-101', 'M-102']);
  assert.equal(final.issues, 0);
  assert.ok(!final.categories.includes('Old hardcoded topic'));
});
