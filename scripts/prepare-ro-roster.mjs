import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
import XLSX from 'xlsx';
import { normalizeRoRosterRow, getRoCategories } from '../shared/roCatalog.js';

dotenv.config({ path: fileURLToPath(new URL('../server/.env', import.meta.url)), quiet: true });
dotenv.config({ quiet: true });
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL is required.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
const exportDir = fileURLToPath(new URL('../exports/', import.meta.url));
await mkdir(exportDir, { recursive: true });
await client.connect();
try {
  const mentors = (await client.query('SELECT id, name, email, dept, class FROM mentors ORDER BY id LIMIT 2')).rows;
  assert.equal(mentors.length, 2, 'Two existing mentors are required.');
  // Spreadsheet test data only; these categories are never seeded into the application.
  const examples = [
    ['Aditi Rao', 'Academic - Course registration assistance'],
    ['Kiran Shetty', 'Academic - Attendance review request'],
    ['Meera Bhat', 'Academic - Internal assessment correction'],
    ['Arjun Pai', 'Exams - Hall ticket access'],
    ['Nandini Rao', 'Exams - Result clarification'],
    ['Vikram Hegde', 'Financial - Fee receipt correction'],
    ['Pooja Naik', 'Hostels - Room maintenance request'],
    ['Deepak Kamath', 'Facilities - Campus Wi-Fi support'],
    ['Ananya Shenoy', 'Personal - Student counselling request'],
    ['Rohan Acharya', 'Placements - Internship approval request']
  ];
  const roster = examples.map(([name, category], index) => ({
    'RO ID': `RO-${String(index + 1).padStart(2, '0')}`,
    'RO Name': `Test RO - ${name}`,
    'Official Email': `ro.test${String(index + 1).padStart(2, '0')}@example.invalid`,
    'Assigned Domain Category': category,
    'Initial Password': `RoTest#2026-${String(index + 1).padStart(2, '0')}`,
    'Reference Mentor ID': mentors[index % 2].id,
    'Reference Mentor Name': mentors[index % 2].name
  }));
  assert.equal(getRoCategories(roster.map(normalizeRoRosterRow)).length, 10);
  const book = XLSX.utils.book_new();
  const addSheet = (name, rows, widths) => {
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = widths.map(wch => ({ wch }));
    if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
    XLSX.utils.book_append_sheet(book, sheet, name);
  };
  addSheet('RO Roster', roster, [14, 30, 35, 54, 24, 22, 28]);
  addSheet('Existing Mentors', mentors.map(mentor => ({ 'Mentor ID': mentor.id, 'Mentor Name': mentor.name,
    'Official Email': mentor.email, Department: mentor.dept, 'Assigned Class': mentor.class })), [18, 30, 38, 18, 40]);
  addSheet('Test Guide', [
    { Step: 1, Instructions: 'Admin > Relationship Officers > Bulk Roster Import. Select this workbook; only the first RO Roster sheet is imported.' },
    { Step: 2, Instructions: 'Import 10 RO records. Each Assigned Domain Category becomes an available student issue topic. No student grievance is created by importing ROs.' },
    { Step: 3, Instructions: 'Existing Mentors contains two real database mentors for reference only. Do not re-import them. Reference Mentor columns do not create a mentor assignment.' },
    { Step: 4, Instructions: 'Test email addresses end in .invalid. Credential emails are intentionally not sent to them. Log in using RO ID and Initial Password from the first sheet.' },
    { Step: 5, Instructions: 'Open the student issue form and verify that only these 10 topics are selectable. Submit a topic and verify that it goes to the matching RO ID.' },
    { Step: 6, Instructions: 'Import RO-01 through RO-10 from the first sheet. Existing student and mentor accounts remain unchanged. Issue topics come from the imported RO category assignments.' }
  ], [10, 145]);
  const filename = fileURLToPath(new URL('../exports/ro_roster_test_10_issues.xlsx', import.meta.url));
  XLSX.writeFile(book, filename);
  const reread = XLSX.readFile(filename);
  assert.equal(XLSX.utils.sheet_to_json(reread.Sheets[reread.SheetNames[0]]).length, 10);
  assert.equal(XLSX.utils.sheet_to_json(reread.Sheets['Existing Mentors']).length, 2);
  const summary = { workbook: filename, roRows: 10, existingMentors: mentors.map(({ id, name }) => ({ id, name })), reset: false };

  if (process.argv.includes('--reset-existing')) {
    // Explicitly requested one-time reset. The app must be stopped so memory cannot restore deleted records.
    await client.query('BEGIN');
    try {
      await client.query('CREATE TABLE IF NOT EXISTS app_settings (key VARCHAR(100) PRIMARY KEY, value TEXT NOT NULL)');
      await client.query('ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY');
      const before = (await client.query(`SELECT (SELECT COUNT(*)::integer FROM issues) AS issues,
        (SELECT COUNT(*)::integer FROM meetings) AS meetings, (SELECT COUNT(*)::integer FROM meeting_recordings) AS recordings,
        (SELECT COUNT(*)::integer FROM students) AS students, (SELECT COUNT(*)::integer FROM mentors) AS mentors,
        (SELECT COUNT(*)::integer FROM ros) AS ros`)).rows[0];
      await client.query(`DELETE FROM system_logs l WHERE EXISTS (SELECT 1 FROM issues i WHERE STRPOS(l.text, i.id) > 0)
        OR (l.user_role = 'RO' AND l.text ~* '^RO .* (scheduled|rescheduled|started|ended|resolved|escalated)')`);
      const emailHistory = await client.query("DELETE FROM email_logs WHERE issue_id IS NOT NULL AND TRIM(issue_id) <> ''");
      await client.query('DELETE FROM meeting_recordings');
      await client.query('DELETE FROM meetings');
      await client.query('DELETE FROM issues');
      await client.query('DELETE FROM category_videos');
      await client.query("UPDATE ros SET region = ''");
      const version = `ro-roster-reset:${randomUUID()}`;
      await client.query("INSERT INTO app_settings (key, value) VALUES ('grievance_reset_version', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [version]);
      const after = (await client.query(`SELECT (SELECT COUNT(*)::integer FROM issues) AS issues,
        (SELECT COUNT(*)::integer FROM meetings) AS meetings, (SELECT COUNT(*)::integer FROM meeting_recordings) AS recordings,
        (SELECT COUNT(*)::integer FROM students) AS students, (SELECT COUNT(*)::integer FROM mentors) AS mentors,
        (SELECT COUNT(*)::integer FROM ros) AS ros,
        (SELECT COUNT(*)::integer FROM ros WHERE NULLIF(TRIM(region), '') IS NOT NULL) AS "assignedCategories"`)).rows[0];
      for (const key of ['issues', 'meetings', 'recordings', 'assignedCategories']) assert.equal(after[key], 0);
      for (const key of ['students', 'mentors', 'ros']) assert.equal(after[key], before[key]);
      await client.query('COMMIT');
      Object.assign(summary, { reset: true, before, after, deletedIssueEmails: emailHistory.rowCount, resetVersion: version });
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  await writeFile(fileURLToPath(new URL('../exports/ro_roster_test_summary.json', import.meta.url)), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
} finally { await client.end(); }
