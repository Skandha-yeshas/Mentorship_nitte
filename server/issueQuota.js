import { getGrievanceQuota } from '../shared/grievanceQuota.js';

export function createIssueQuotaReader({ query, isDbConnected, fetchCloudIssues, getMemoryIssues, now = Date.now }) {
  return async studentId => {
    const records = [...getMemoryIssues()];
    let persistentSourceAvailable = false;
    const sources = await Promise.allSettled([
      fetchCloudIssues(studentId),
      isDbConnected()
        ? query('SELECT id, student_id, created_at, status FROM issues WHERE LOWER(student_id) = LOWER($1)', [studentId]).then(result => result.rows)
        : Promise.reject(new Error('Database unavailable'))
    ]);
    for (const result of sources) {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        persistentSourceAvailable = true;
        records.push(...result.value);
      }
    }
    if (!persistentSourceAvailable) throw new Error('Cannot verify the 7-day grievance quota. Please try again when the database is available.');
    return getGrievanceQuota({ issues: records, studentId, now: now() });
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
