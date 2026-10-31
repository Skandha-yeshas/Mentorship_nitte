import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createMeetingScheduleEvent } from '../../shared/meetingReassignments.js';

const appUrl = process.env.MEETING_TEST_APP_URL || 'http://localhost:5173';
const executablePath = process.env.RECORDING_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const available = existsSync(executablePath) && await fetch(appUrl, { signal: AbortSignal.timeout(1500) }).then(response => response.ok).catch(() => false);

test('RO dialog shows one reassignment used, saves once on duplicate submit, then stops at two', {
  skip: !available, timeout: 30000
}, async t => {
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => { window.tailwind = {}; });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const meeting = { id: 'MEET-TEST', issueId: 'ISS-TEST', studentId: 'S-TEST', studentName: 'Test Student', roId: 'RO-TEST', date: '2099-11-01', time: '10:00', mode: 'Online', location: 'Online Portal', status: 'Confirmed' };
  const initial = createMeetingScheduleEvent({ ...meeting, meetingId: meeting.id, id: 'schedule:initial', timestamp: '2026-10-30T10:00:00Z', isReschedule: false });
  const first = createMeetingScheduleEvent({ ...meeting, meetingId: meeting.id, id: 'schedule:first', timestamp: '2026-10-30T11:00:00Z', isReschedule: true });
  const db = {
    users: { ros: [{ id: 'RO-TEST', name: 'Test Officer', region: 'Academic' }], students: [], mentors: [] },
    issues: [{ id: 'ISS-TEST', studentId: 'S-TEST', studentName: 'Test Student', roId: 'RO-TEST', category: 'Academic - Course Enrollment issues', description: 'Counter verification', priority: 'High', status: 'Meeting Scheduled', logs: [initial, first, { ...first, time: '2026-10-30T11:00:04Z' }] }],
    meetings: [{ ...meeting, logs: [initial, first] }], recordings: [], categoryVideos: []
  };
  // Replace only the app entry with a fake provider. No live scheduling, database writes, or emails occur.
  await page.route(/\/src\/main\.jsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import { createMeetingScheduleEvent } from '/shared/meetingReassignments.js';
    const dashboardSource = await (await fetch('/src/views/RODashboard.jsx')).text();
    const contextUrl = dashboardSource.match(/from ["']([^"']*context\\/DatabaseContext\\.jsx[^"']*)["']/)[1];
    const { DatabaseContext } = await import(contextUrl);
    const { RODashboard } = await import('/src/views/RODashboard.jsx');
    let db = ${JSON.stringify(db)};
    window.meetingTestSubmissions = 0;
    const root = ReactDOM.createRoot(document.getElementById('root'));
    const noop = () => {};
    const scheduleRoMeeting = async () => {
      window.meetingTestSubmissions++;
      await new Promise(resolve => setTimeout(resolve, 300));
      const event = createMeetingScheduleEvent({ id: 'schedule:second', timestamp: new Date().toISOString(), isReschedule: true,
        meetingId: 'MEET-TEST', date: '2099-11-01', time: '10:00', mode: 'Online', location: 'Online Portal', roId: 'RO-TEST' });
      db = { ...db, issues: db.issues.map(issue => ({ ...issue, logs: [...issue.logs, event, event] })) };
      render();
    };
    const render = () => root.render(React.createElement(DatabaseContext.Provider,
      { value: { db, scheduleRoMeeting, updateMeetingStatus: noop, resolveIssue: noop, escalateIssue: noop,
        saveMeetingRecording: noop, loadMeetingRecording: noop, updateCategoryVideo: noop, submitRoMeetingFeedback: noop } },
      React.createElement(RODashboard, { roId: 'RO-TEST' })));
    render();
  ` }));
  // Any unexpected service request is contained by the test as well.
  await page.route('**/api/**', route => route.fulfill({ json: {} }));
  await page.route('https://**/*', route => route.abort());
  await page.goto(appUrl);
  await page.getByText('#ISS-TEST', { exact: true }).waitFor().catch(async () => {
    throw new Error(`RO test did not render: ${JSON.stringify({ errors, body: (await page.locator('body').innerText()).slice(0, 1000) })}`);
  });
  await page.getByText('#ISS-TEST', { exact: true }).click();
  const reschedule = page.getByRole('button', { name: /Reschedule \(1\/2\)/ });
  await reschedule.waitFor();
  await reschedule.click();
  await page.getByText('1/2 reassignments used', { exact: false }).waitFor();
  const submit = page.getByRole('button', { name: /Save & Reassign Meeting/ });
  await submit.waitFor();
  await submit.evaluate(button => {
    const form = button.closest('form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  const limit = page.getByRole('button', { name: /Reassign Limit \(2\/2\)/ });
  await limit.waitFor();
  assert.equal(await limit.isDisabled(), true);
  assert.equal(await page.evaluate(() => window.meetingTestSubmissions), 1);
  assert.deepEqual(errors, []);
});
