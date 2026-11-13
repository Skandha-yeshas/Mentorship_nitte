import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const origin = process.env.RO_CATALOG_APP_URL || 'http://localhost:5173';
const executablePath = process.env.RECORDING_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const available = existsSync(executablePath) && await fetch(origin, { signal: AbortSignal.timeout(1500) }).then(response => response.ok).catch(() => false);

test('Admin download buttons export initial passwords from completed student, mentor, and RO imports', { skip: !available, timeout: 30000 }, async t => {
  const browser = await chromium.launch({ executablePath, headless: true }); t.after(() => browser.close());
  const page = await browser.newPage({ acceptDownloads: true }); page.setDefaultTimeout(7000);
  const errors = []; const paths = [];
  page.on('pageerror', error => errors.push(error.message));
  const jobs = ['students', 'mentors', 'ros'].map((kind, index) => ({
    id: `01234567-1234-4123-8123-0123456789a${index}`, kind, total: 2, processed: 2,
    successCount: 2, failureCount: 0, emailsSent: 0, emailsWaiting: 0, emailsUnsent: 0, status: 'COMPLETED'
  }));
  await page.addInitScript(() => { window.tailwind = {}; });
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    paths.push(path);
    if (path === '/api/admin/roster-jobs') return route.fulfill({ json: jobs });
    const job = jobs.find(item => path === `/api/admin/roster-jobs/${item.id}`);
    if (job) return route.fulfill({ json: { ...job, results: [
      { index: 1, id: `NEW-${job.kind}`, name: '=Fixture Name', email: 'fixture@college.edu', action: 'CREATED', status: 'SUCCESS', password: `Fixture-${job.kind}-Password-42!`, passwordStatus: 'GENERATED' },
      { index: 2, id: `OLD-${job.kind}`, name: 'Existing', email: 'existing@college.edu', action: 'UPDATED', status: 'SUCCESS', password: '', passwordStatus: 'UNCHANGED' }
    ] } });
    return route.fulfill({ json: {} });
  });
  await page.route(/\/src\/main\.jsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: `
    import React from '/node_modules/.vite/deps/react.js';
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import { AdminDashboard } from '/src/views/AdminDashboard.jsx';
    import { DatabaseContext } from '/src/context/DatabaseContext.jsx';
    const jobs = ${JSON.stringify(jobs)};
    const db = {users:{students:[{id:'S1',name:'Student',email:'student@college.edu',branch:'CSE',sem:4}],
      mentors:[{id:'M1',name:'Mentor',email:'mentor@college.edu',dept:'CSE'}],
      ros:[{id:'R1',name:'Officer',email:'ro@college.edu',region:'Academic'}]},
      issues:[],meetings:[],resources:[],groupSessions:[],mentorSessionRecords:[],mentorFeedbacks:[],gmailLogs:[],recordings:[]};
    const value = {db,authenticatedUser:{id:'ADMIN',role:'Admin',name:'Fixture Admin'},rosterImports:jobs,refreshRosterImports:async()=>{},branches:[],isMatchingMentorId:()=>false};
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(DatabaseContext.Provider,{value},React.createElement(AdminDashboard)));
  ` }));
  await page.goto(origin);
  for (const [tab, kind] of [['Student Directory', 'students'], ['Faculty Mentors', 'mentors']]) {
    await page.getByRole('button', { name: new RegExp(tab) }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Initial Passwords CSV' }).first().click();
    const download = await downloadPromise.catch(async error => { throw new Error(`${error.message}; page: ${(await page.locator('body').innerText()).slice(0, 1600)}; requests: ${paths.join(',')}; errors: ${errors.join(',')}`); });
    const stream = await download.createReadStream(); const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const csv = Buffer.concat(chunks).toString('utf8');
    assert.ok(csv.includes(`Fixture-${kind}-Password-42!`));
    assert.ok(csv.includes("'=Fixture Name"));
    assert.ok(!csv.includes(`OLD-${kind}`));
    assert.ok(!csv.includes('N/A'));
  }
  await page.getByRole('button', { name: /Relationship Officers/ }).click();
  const roDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Initial Passwords CSV' }).first().click();
  const roDownload = await roDownloadPromise;
  const roStream = await roDownload.createReadStream(); const roChunks = [];
  for await (const chunk of roStream) roChunks.push(chunk);
  assert.ok(Buffer.concat(roChunks).toString('utf8').includes('Fixture-ros-Password-42!'));
  assert.deepEqual(errors, []);
  assert.ok(paths.includes(`/api/admin/roster-jobs/${jobs[0].id}`));
  assert.ok(paths.includes(`/api/admin/roster-jobs/${jobs[1].id}`));
  assert.ok(paths.includes(`/api/admin/roster-jobs/${jobs[2].id}`));
});
