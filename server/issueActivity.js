import { mergeActivityLogs } from '../shared/issueActivity.js';

const normalize = value => String(value || '').trim().toUpperCase();
const locked = status => ['RESOLVED', 'CLOSED', 'ESCALATED', 'RE-ESCALATED'].includes(normalize(status));
const nextStatus = (previous, requested) => locked(previous) ? previous :
  ['Meeting Started', 'Meeting Scheduled'].includes(requested) ? requested :
  requested === 'In-Progress' && previous === 'Meeting Started' ? requested : previous;

export function createIssueActivityStore({ query, readCloudIssue, writeCloudIssue, getMemoryIssues }) {
  const memoryIssue = issueId => getMemoryIssues().find(issue => normalize(issue.id || issue.issue_id) === normalize(issueId));
  return {
    async read(issueId) {
      const memory = memoryIssue(issueId);
      let stored;
      try {
        const result = await query('SELECT id, logs FROM issues WHERE UPPER(id) = UPPER($1)', [issueId]);
        stored = result.rows[0];
      } catch { /* Read the cloud copy below if Postgres is unavailable. */ }
      if (!stored) {
        try { stored = await readCloudIssue(issueId); } catch (error) { if (!memory) throw error; }
      }
      if (!stored && !memory) return null;
      return { issueId: stored?.id || memory.id, logs: mergeActivityLogs(stored?.logs, memory?.logs) };
    },

    async append(issueId, event, state = null) {
      const memory = memoryIssue(issueId);
      let stored;
      try {
        // Append atomically so simultaneous email/meeting actions do not replace history.
        const result = await query(`
          UPDATE issues SET logs = COALESCE(logs, '[]'::jsonb) || $1::jsonb,
            status = CASE
              WHEN status IN ('Resolved', 'Closed', 'Escalated', 'Re-escalated') THEN status
              WHEN $3 IN ('Meeting Started', 'Meeting Scheduled') THEN $3
              WHEN $3 = 'In-Progress' AND status = 'Meeting Started' THEN $3
              ELSE status END
          WHERE UPPER(id) = UPPER($2) RETURNING id, logs, status
        `, [JSON.stringify([event]), issueId, state]);
        stored = result.rows[0];
      } catch { /* Fall back to the cloud copy without replacing existing logs. */ }
      if (!stored) {
        const cloud = await readCloudIssue(issueId);
        if (cloud) {
          stored = { ...cloud, logs: mergeActivityLogs(cloud.logs, memory?.logs, [event]), status: nextStatus(cloud.status, state) };
          await writeCloudIssue(issueId, { logs: stored.logs, status: stored.status });
        }
      }
      if (memory) {
        memory.logs = mergeActivityLogs(stored?.logs, memory.logs, [event]);
        memory.status = stored?.status || nextStatus(memory.status, state);
      }
      if (!stored && !memory) throw new Error('Ticket not found for activity logging');
      return stored || memory;
    }
  };
}
