import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import XLSX from 'xlsx';

const origin = process.env.RO_CATALOG_APP_URL || 'http://localhost:5173';
const executablePath = process.env.RECORDING_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const available = existsSync(executablePath) && await fetch(origin, { signal: AbortSignal.timeout(1500) }).then(response => response.ok).catch(() => false);
test('real spreadsheet worker reads 1,000 students and rejects formulas, excessive rows and unsafe headers', { skip: !available, timeout: 30000 }, async t => {
  const browser = await chromium.launch({ executablePath, headless: true }); t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://**/*', route => route.abort());
  await page.route(/\/src\/main\.jsx(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/javascript', body: 'document.getElementById("root").textContent="Roster worker fixture";' }));
  await page.goto(origin);
  const rows = count => Array.from({ length: count }, (_, i) => ({ 'Student ID': `S-${i}`, 'Student Name': `Student ${i}`, 'Official Email': `student${i}@college.edu`, Branch: 'CSE', Semester: 4 }));
  const workbook = sheet => { const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Roster'); return Array.from(new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))); };
  const parse = buffer => page.evaluate(async bytes => {
    const { readRosterFile } = await import('/src/utils/rosterFile.js');
    try { const result = await readRosterFile(new File([new Uint8Array(bytes)], 'roster.xlsx'), 'students'); return { count: result.length }; }
    catch (error) { return { error: error.message }; }
  }, buffer);
  const valid = await parse(workbook(XLSX.utils.json_to_sheet(rows(1000))));
  assert.equal(valid.count, 1000, valid.error);
  const formula = XLSX.utils.json_to_sheet(rows(1)); formula.B2.f = 'WEBSERVICE("https://blocked.example")';
  assert.match((await parse(workbook(formula))).error, /formulas/);
  const oversized = await parse(workbook(XLSX.utils.json_to_sheet(rows(2001))));
  assert.match(oversized.error, /2000/);
  assert.match((await parse(workbook(XLSX.utils.aoa_to_sheet([['constructor'], ['x']])))).error, /headers/);
});
