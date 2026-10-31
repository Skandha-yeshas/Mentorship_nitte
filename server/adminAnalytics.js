import express from 'express';
import { parseActivityTime } from '../shared/issueActivity.js';

const normalize = value => String(value || '').trim().toUpperCase();
const terminal = status => ['RESOLVED', 'CLOSED'].includes(normalize(status));
const domains = ['Academic', 'Hostels', 'Facilities', 'Financial', 'Exams', 'Personal', 'Placements'];
const unknownBranch = '__UNASSIGNED__';

function domainFor(category) {
  const prefix = String(category || '').trim().split(/\s+-\s+/)[0].replace(/\s+support\s+desk$/i, '');
  return domains.find(domain => normalize(domain) === normalize(prefix))
    || ({ HOSTEL: 'Hostels', EXAM: 'Exams' })[normalize(prefix)] || 'Other / Unclassified';
}

function resolutionHours(issue) {
  if (!terminal(issue.status)) return null;
  const created = parseActivityTime(issue.createdAt ?? issue.created_at);
  const resolved = parseActivityTime(issue.resolvedAt ?? issue.resolved_at);
  if (!created || !resolved) return null;
  const hours = (Date.parse(resolved) - Date.parse(created)) / 3600000;
  return hours >= 0 ? hours : null;
}

export function buildAdminAnalytics({ issues = [], students = [], mentors = [] }, now = new Date()) {
  const domainCounts = new Map(domains.map(domain => [domain, 0]));
  const branches = new Map();
  const studentBranches = new Map();
  const ensureBranch = rawCode => {
    const code = normalize(rawCode) || unknownBranch;
    if (!branches.has(code)) branches.set(code, { code, enrolled: 0, mentorCount: 0, totalTickets: 0, activeTickets: 0, resolvedCount: 0, durations: [] });
    return branches.get(code);
  };
  for (const student of students) {
    const branch = ensureBranch(student.branch);
    branch.enrolled++;
    if (student.id || student.student_id) studentBranches.set(normalize(student.id || student.student_id), branch.code);
  }
  for (const mentor of mentors) ensureBranch(mentor.dept).mentorCount++;

  let activeIssues = 0;
  let resolvedIssues = 0;
  const durations = [];
  for (const issue of issues) {
    const branch = ensureBranch(studentBranches.get(normalize(issue.studentId || issue.student_id)));
    branch.totalTickets++;
    if (terminal(issue.status)) { branch.resolvedCount++; resolvedIssues++; }
    else {
      branch.activeTickets++; activeIssues++;
      const domain = domainFor(issue.category);
      domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
    }
    const hours = resolutionHours(issue);
    if (hours !== null) { branch.durations.push(hours); durations.push(hours); }
  }
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return {
    source: 'database', generatedAt: now.toISOString(),
    totals: { totalIssues: issues.length, activeIssues, resolvedIssues, averageResolutionHours: average(durations), timedResolutionCount: durations.length },
    domains: [...domainCounts].map(([domain, count]) => ({ domain, count, percentage: activeIssues ? count / activeIssues * 100 : 0 })),
    branches: [...branches.values()].sort((a, b) => a.code.localeCompare(b.code)).map(({ durations: samples, ...branch }) => ({
      ...branch, averageResolutionHours: average(samples), timedResolutionCount: samples.length,
      resolutionRate: branch.totalTickets ? branch.resolvedCount / branch.totalTickets * 100 : null
    }))
  };
}

export function createAdminAnalyticsReader(query, now = () => new Date()) {
  return async () => {
    // Read only the persisted records required for these metrics. No browser cache or sample fallback.
    const [issues, students, mentors] = await Promise.all([
      query('SELECT id, student_id, category, status, created_at, resolved_at FROM issues'),
      query('SELECT id, branch FROM students'),
      query('SELECT id, dept FROM mentors')
    ]);
    return buildAdminAnalytics({ issues: issues.rows, students: students.rows, mentors: mentors.rows }, now());
  };
}

export function createAdminAnalyticsRouter({ read }) {
  const router = express.Router();
  router.get('/', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await read()); }
    catch (error) {
      console.warn('[Admin analytics] Database query failed:', error.message);
      res.status(503).json({ error: 'Database analytics are temporarily unavailable. Please retry.' });
    }
  });
  return router;
}
