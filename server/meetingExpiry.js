import { withTransaction } from './transactions.js';
import { createIssueActivityStore } from './issueActivity.js';
import { getOnlineMeetingDeadline, ONLINE_MEETING_LIMIT_MS } from '../shared/meetingDuration.js';

export function createMeetingExpiry({ query, getClient }) {
  // Room access uses database time, independently of background-worker/browser timers.
  async function roomState(issueId) {
    const row = (await query(`SELECT started_at, mode, CURRENT_TIMESTAMP AS server_now FROM meetings
      WHERE UPPER(issue_id) = UPPER($1) AND status = 'Started'
        AND LOWER(COALESCE(mode, 'Online')) = 'online' AND ended_at IS NULL AND NOT ended_by_ro
      ORDER BY started_at DESC NULLS LAST, id LIMIT 1`, [issueId])).rows[0];
    const now = row ? new Date(row.server_now).getTime() : Date.now();
    const deadline = getOnlineMeetingDeadline(row);
    return { active: deadline !== null && now < deadline, now,
      startedAt: row?.started_at || null, endsAt: deadline === null ? null : new Date(deadline).toISOString() };
  }

  async function tick() {
    const candidates = (await query(`SELECT id, issue_id FROM meetings WHERE status = 'Started'
      AND LOWER(COALESCE(mode, 'Online')) = 'online' AND started_at IS NOT NULL
      AND started_at + ($1 * INTERVAL '1 millisecond') <= CURRENT_TIMESTAMP
      ORDER BY started_at LIMIT 20`, [ONLINE_MEETING_LIMIT_MS])).rows;
    for (const candidate of candidates) {
      await withTransaction(getClient, async q => {
        // Follow ticket actions' issue-before-meeting lock order. Recheck after waiting:
        // the RO may have ended, rescheduled or resolved the meeting in the meantime.
        const issue = (await q('SELECT id FROM issues WHERE id = $1 FOR UPDATE', [candidate.issue_id])).rows[0];
        if (!issue) return;
        const meeting = (await q(`UPDATE meetings SET status = 'Completed',
          ended_at = started_at + ($2 * INTERVAL '1 millisecond'), ended_by_ro = FALSE
          WHERE id = $1 AND status = 'Started' AND LOWER(COALESCE(mode, 'Online')) = 'online'
            AND started_at + ($2 * INTERVAL '1 millisecond') <= CURRENT_TIMESTAMP
          RETURNING id, issue_id, started_at, ended_at`, [candidate.id, ONLINE_MEETING_LIMIT_MS])).rows[0];
        if (!meeting) return;
        await createIssueActivityStore({ query: q }).append(meeting.issue_id, {
          id: `meeting-time-limit:${meeting.id}:${new Date(meeting.started_at).toISOString()}`,
          eventType: 'MEETING_ENDED', actor: 'System', time: new Date(meeting.ended_at).toISOString(),
          text: 'Online meeting ended automatically after the 30-minute time limit. Awaiting RO minutes / feedback.'
        }, 'In-Progress');
        await q('INSERT INTO system_logs (text, user_role, user_id) VALUES ($1, $2, $3)',
          [`Meeting ${meeting.id} ended automatically after 30 minutes.`, 'System', 'SYSTEM']);
      });
    }
    return candidates.length > 0;
  }
  return { tick, roomState };
}
