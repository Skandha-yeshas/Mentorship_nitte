import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { buildAdminAnalytics } from '../../server/adminAnalytics.js';

const appUrl = process.env.ADMIN_ANALYTICS_APP_URL || 'http://localhost:5173';
const executablePath = process.env.RECORDING_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const available = existsSync(executablePath) && await fetch(appUrl, { signal: AbortSignal.timeout(1500) }).then(response => response.ok).catch(() => false);

test('Admin charts display database metrics, real zeroes, N/A, refresh failures, and retry without sample data', {
  skip: !available, timeout: 30000
}, async t => {
  const students = [{ id: 'A', branch: 'BCA' }, { id: 'B', branch: 'BCA' }, { id: 'C', branch: 'MBA' }];
  let payload = buildAdminAnalytics({ students,
    mentors: [{ id: 'M1', dept: 'BCA' }, { id: 'M2', dept: 'MBA' }, { id: 'M3', dept: 'MBA' }],
    issues: [
      { id: '1', student_id: 'A', category: 'Academic - Lab equipment issues', status: 'Assigned to RO' },
      { id: '2', student_id: 'B', category: 'Academic - Course Enrollment issues', status: 'Meeting Scheduled' },
      { id: '3', student_id: 'C', category: 'Financial - Hostel fee payment extension', status: 'Escalated' },
      { id: '4', student_id: 'A', category: 'Exams', status: 'Resolved', created_at: '2026-10-28T00:00:00Z', resolved_at: '2026-10-29T00:00:00Z' },
      { id: '5', student_id: 'C', category: 'Personal', status: 'Closed', created_at: '2026-10-28T00:00:00Z', resolved_at: '2026-10-30T00:00:00Z' }
    ]
  });
  let status = 200;
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => { window.tailwind = {}; });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ status: 404, json: {} }));
  await page.route('**/api/admin/analytics', route => route.fulfill({ status, json: status === 200 ? payload : { error: 'Database unavailable' } }));
  await page.route('https://**/*', route => route.abort());
  await page.route(/\/src\/main\.jsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import AdminGrievanceAnalytics from '/src/components/AdminGrievanceAnalytics.jsx';
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(AdminGrievanceAnalytics,
      { branches: [{ code: 'BCA', name: 'Computer Applications' }] }));
  ` }));
  await page.goto(appUrl);
  await page.getByText('3 active grievances across all domains.').waitFor();
  await page.getByRole('img', { name: 'Academic: 2 active grievances, 66.7%' }).waitFor({ state: 'attached' });
  await page.getByRole('img', { name: 'Financial: 1 active grievances, 33.3%' }).waitFor({ state: 'attached' });
  const bca = page.getByRole('row').filter({ hasText: 'BCA (Computer Applications)' });
  assert.deepEqual(await bca.locator('td').allTextContents(), ['BCA (Computer Applications)', '2', '1', '2 Open', '24.0 hrs', '33.3%']);
  const mba = page.getByRole('row').filter({ hasText: 'MBA' });
  assert.deepEqual(await mba.locator('td').allTextContents(), ['MBA', '1', '2', '1 Open', '48.0 hrs', '50.0%']);
  assert.equal(await page.getByText('Health Score', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Updated 5m ago', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Zero Anti-Ragging Violations Reported').count(), 0);

  payload = buildAdminAnalytics({ students: [{ id: 'A', branch: 'BCA' }] });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByText('No active grievances in the database.').waitFor();
  assert.deepEqual(await bca.locator('td').allTextContents(), ['BCA (Computer Applications)', '1', '0', '0 Open', 'N/A', 'N/A']);

  status = 503;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.getByRole('alert').filter({ hasText: 'Showing the last successful database update.' }).waitFor();
  assert.equal(await bca.locator('td').nth(1).textContent(), '1');
  status = 200; payload = buildAdminAnalytics({});
  await page.getByRole('button', { name: 'Retry analytics' }).click();
  await page.getByText('No branch records in the database.').waitFor();
  assert.equal(await page.getByRole('alert').count(), 0);
  assert.equal(await page.getByRole('row').count(), 0);

  status = 503;
  await page.reload();
  await page.getByRole('alert').filter({ hasText: 'No analytics have been loaded.' }).waitFor();
  assert.equal(await page.getByRole('row').count(), 0);
  assert.equal(await page.getByRole('img').count(), 0);
  assert.deepEqual(errors, []);
});
