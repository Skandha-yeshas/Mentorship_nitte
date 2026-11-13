import { getGrievanceQuota } from '../shared/grievanceQuota.js';

export function createIssueQuotaReader({ query, now = Date.now }) {
  return async studentId => {
    try {
      const records = (await query("SELECT id, student_id, created_at AT TIME ZONE 'UTC' AS created_at, status FROM issues WHERE UPPER(student_id) = UPPER($1)", [studentId])).rows;
      return getGrievanceQuota({ issues: records, studentId, now: now() });
    } catch { throw new Error('Cannot verify the 7-day grievance quota. Please try again when the database is available.'); }
  };
}

export function createStudentSubmissionLock() {
  const queues = new Map();
  return async studentId => {
    const key = String(studentId).trim().toLowerCase();
    const previous = queues.get(key) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    queues.set(key, current);
    await previous;
    return () => {
      release();
      if (queues.get(key) === current) queues.delete(key);
    };
  };
}
