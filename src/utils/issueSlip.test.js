import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIssueSlipHtml, printIssueSlip } from './issueSlip.js';

const issue = {
  id: 'ISS-SELECTED', studentId: 'S-1', studentName: 'Selected Student', category: 'Course Enrollment',
  status: 'Resolved', priority: 'HIGH', description: 'Selected issue description',
  createdAt: '2026-10-30T03:00:00Z',
  resolutionNotes: 'Enrollment corrected.',
  logs: [{ text: 'Issue submitted by student.', time: '2026-10-30T03:00:00Z' }]
};
const history = {
  issueId: issue.id,
  logs: [{ text: 'Meeting rescheduled by RO.', time: '2026-10-30T04:00:00Z' }, { text: 'Student submitted feedback: 5 Stars.', time: '2026-10-30T06:00:00Z' }],
  emailLogs: [
    { id: 1, issueId: issue.id, subject: 'Selected meeting notice', recipient: 'selected@example.test', status: 'DELIVERED_GMAIL', createdAt: '2026-10-30T04:30:00Z' },
    { id: 2, issueId: 'ISS-OTHER', subject: 'Other issue private email', recipient: 'other@example.test', createdAt: '2026-10-30T05:00:00Z' }
  ]
};

test('slip contains only the clicked issue and its matching actions and emails', () => {
  const html = buildIssueSlipHtml({ issue: { ...issue, otherIssues: [{ id: 'ISS-OTHER', description: 'Other issue details' }] }, history });
  for (const expected of ['ISS-SELECTED', 'Selected Student', 'Selected issue description', 'Action &amp; Procedure Log', 'Meeting rescheduled by RO.', 'Student submitted feedback: 5 Stars.', 'Selected meeting notice', 'selected@example.test']) assert.ok(html.includes(expected), expected);
  for (const excluded of ['ISS-OTHER', 'Other issue details', 'Other issue private email', 'other@example.test', 'Grievance Quota', 'Track My Issues']) assert.ok(!html.includes(excluded), excluded);
  assert.ok(html.indexOf('Meeting rescheduled by RO.') < html.indexOf('Selected meeting notice'));
  assert.ok(html.indexOf('Selected meeting notice') < html.indexOf('Student submitted feedback: 5 Stars.'));
});

test('a mismatched history response is rejected rather than exporting another ticket', () => {
  assert.throws(() => buildIssueSlipHtml({ issue, history: { ...history, issueId: 'ISS-OTHER' } }), /does not belong/);
  assert.throws(() => buildIssueSlipHtml({ issue: null }), /Select an issue/);
});

test('all activity entries are printed without a scroll container or truncated history', () => {
  const logs = Array.from({ length: 150 }, (_, index) => ({ text: `Unique procedure ${index}`, time: new Date(Date.UTC(2026, 9, 30, 6, index)).toISOString() }));
  const html = buildIssueSlipHtml({ issue, history: { issueId: issue.id, logs } });
  assert.ok(html.includes('Unique procedure 0'));
  assert.ok(html.includes('Unique procedure 149'));
  assert.equal((html.match(/Unique procedure \d+/g) || []).length, 150);
  assert.doesNotMatch(html, /max-height|overflow:\s*(auto|scroll|hidden)/);
});

test('slip includes selected minutes, resolution, feedback, and accurate email dispatch status', () => {
  const html = buildIssueSlipHtml({ issue: { ...issue, discussionSummary: 'Reviewed enrollment.', actionItems: 'Submit elective form.', feedback: { rating: 5, comments: 'Resolved successfully.' } }, history });
  for (const expected of ['Reviewed enrollment.', 'Submit elective form.', 'Enrollment corrected.', 'Rating: 5 / 5', 'Resolved successfully.', 'Dispatched via Gmail', 'IST']) assert.ok(html.includes(expected), expected);
});

test('student-supplied text is escaped and cannot become executable print-document markup', () => {
  const html = buildIssueSlipHtml({ issue: { ...issue, description: '<script>private()</script><img src="x" onerror="private()">', studentName: 'A & B' }, history });
  assert.ok(html.includes('&lt;script&gt;private()&lt;/script&gt;'));
  assert.ok(html.includes('A &amp; B'));
  assert.doesNotMatch(html, /<script>|<img src="x"/);
});

function fakeDocument({ printError = null } = {}) {
  let frame;
  let printed = false;
  let removed = false;
  let afterPrint;
  const documentRef = {
    createElement(tag) {
      assert.equal(tag, 'iframe');
      frame = {
        style: {}, setAttribute() {}, remove() { removed = true; },
        contentWindow: {
          addEventListener(name, callback) { if (name === 'afterprint') afterPrint = callback; },
          focus() {}, print() { if (printError) throw printError; printed = true; }
        }
      };
      return frame;
    },
    body: { appendChild(child) { assert.equal(child, frame); queueMicrotask(() => child.onload()); } }
  };
  return { documentRef, get frame() { return frame; }, get printed() { return printed; }, get removed() { return removed; }, finishPrint: () => afterPrint() };
}

test('export prints a separate issue document and cleans it up after printing', async () => {
  const browser = fakeDocument();
  const html = buildIssueSlipHtml({ issue, history });
  await printIssueSlip(html, browser.documentRef);
  assert.equal(browser.printed, true);
  assert.equal(browser.frame.srcdoc, html);
  assert.equal(browser.removed, false);
  browser.finishPrint();
  assert.equal(browser.removed, true);
});

test('print errors clean up the isolated document and are reported to the caller', async () => {
  const browser = fakeDocument({ printError: new Error('Printing unavailable') });
  await assert.rejects(printIssueSlip('<html></html>', browser.documentRef), /Printing unavailable/);
  assert.equal(browser.removed, true);
});
