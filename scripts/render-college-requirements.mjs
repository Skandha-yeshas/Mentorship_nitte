import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const html = new URL('../docs/COLLEGE_PILOT_REQUIREMENTS.html', import.meta.url);
const pdf = fileURLToPath(new URL('../docs/COLLEGE_PILOT_REQUIREMENTS.pdf', import.meta.url));
const preview = fileURLToPath(new URL('../.local/requirements-preview/', import.meta.url));
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executablePath = process.env.REQUIREMENTS_BROWSER || (existsSync(edge) ? edge : undefined);
const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto(html.href);
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts.ready);
  const layout = await page.locator('.page').evaluateAll(pages => pages.map((page, index) => {
    const content = page.querySelector('.content');
    const bottom = content.getBoundingClientRect().bottom;
    const overflow = Math.max(0, ...Array.from(content.children).map(child => child.getBoundingClientRect().bottom - bottom));
    return { page: index + 1, overflow: Math.round(overflow), widthOverflow: page.scrollWidth - page.clientWidth };
  }));
  assert.equal(layout.length, 9);
  assert.ok(layout.every(page => page.overflow <= 1 && page.widthOverflow <= 1), `Content overflows: ${JSON.stringify(layout)}`);
  await page.pdf({ path: pdf, printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
  await mkdir(preview, { recursive: true });
  for (const index of [0, 2, 5, 6, 7, 8]) {
    await page.locator('.page').nth(index).screenshot({ path: `${preview}/page-${String(index + 1).padStart(2, '0')}.png` });
  }
  console.log(JSON.stringify({ pdf, pages: layout.length, layout }));
} finally { await browser.close(); }
