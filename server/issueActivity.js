import { normalizeActivityLogs } from '../shared/issueActivity.js';

export function createIssueActivityStore({ query }) {
  return {
    async read(issueId) {
      const row = (await query('SELECT id, logs FROM issues WHERE UPPER(id) = UPPER($1)', [issueId])).rows[0];
      return row ? { issueId: row.id, logs: normalizeActivityLogs(row.logs) } : null;
    },
    async append(issueId, event, state = null) {
      const result = await query(`
        UPDATE issues SET logs = COALESCE(logs, '[]'::jsonb) || $1::jsonb,
          status = CASE
            WHEN status IN ('Resolved', 'Closed', 'Escalated', 'Re-escalated') THEN status
            WHEN $3 IN ('Meeting Started', 'Meeting Scheduled') THEN $3
            WHEN $3 = 'In-Progress' AND status IN ('Meeting Started', 'Meeting Scheduled') THEN $3
            ELSE status END
        WHERE UPPER(id) = UPPER($2) RETURNING id, logs, status
      `, [JSON.stringify([event]), issueId, state]);
      if (!result.rows[0]) throw new Error('Ticket not found for activity logging');
      return result.rows[0];
    }
  };
}
