import express from 'express';
import { randomUUID } from 'node:crypto';
import { withTransaction } from './transactions.js';
import { createIssueActivityStore } from './issueActivity.js';
import { createEmailNotifications } from './emailNotifications.js';
import { getGrievanceQuota, getQuotaLockMessage } from '../shared/grievanceQuota.js';
import { normalizeActivityLogs } from '../shared/issueActivity.js';
import { createMeetingScheduleEvent, getMeetingReassignmentCount, MEETING_REASSIGNMENT_LIMIT } from '../shared/meetingReassignments.js';
import { getOnlineMeetingDeadline, isOnlineMeetingExpired } from '../shared/meetingDuration.js';

const same = (a, b) => String(a || '').toUpperCase() === String(b || '').toUpperCase();
const fail = (message, status = 400, extra = {}) => Object.assign(new Error(message), { status, ...extra });
const closed = status => ['Resolved', 'Closed'].includes(status);
const escalated = status => ['Escalated', 'Re-escalated'].includes(status);
const text = (value, max = 12000) => String(value || '').trim().slice(0, max);
const complete = status => ['Completed', 'Finished', 'Concluded'].includes(status);

export function createTicketActions({ getClient, createMailSender, portalUrl = '', allowLegacy = false }) {
  async function transaction(actor, work) {
    return withTransaction(getClient, async query => {
      const notifications = createEmailNotifications({ query, send: createMailSender(query), portalUrl, allowLegacy });
      const notify = async (id, type, details = {}) => {
        const records = await notifications.issue(id, type, details);
        // Queue failure rolls the business change back too. SMTP itself runs later.
        if (records.some(row => !row.id || row.status === 'FAILED')) throw new Error('The notification could not be saved.');
        return records.map(({ status, deliveryReason }) => ({ status, deliveryReason }));
      };
      const audit = message => query('INSERT INTO system_logs (text, user_role, user_id) VALUES ($1, $2, $3)', [message, actor.role, actor.id]);
      const activity = createIssueActivityStore({ query });
      const issue = async id => {
        const row = (await query('SELECT * FROM issues WHERE UPPER(id) = UPPER($1) FOR UPDATE', [id])).rows[0];
        if (!row) throw fail('Issue not found.', 404);
        if (!(actor.role === 'Admin' || actor.role === 'Student' && same(row.student_id, actor.id) || actor.role === 'RO' && same(row.ro_id, actor.id))) throw fail('You do not have permission for this issue.', 403);
        return row;
      };
      const endMeetings = id => query(`UPDATE meetings SET status = 'Completed', ended_by_ro = TRUE,
        ended_at = COALESCE(ended_at, NOW()) WHERE issue_id = $1 AND status NOT IN ('Completed', 'Finished', 'Concluded', 'Cancelled')`, [id]);
      return work({ query, notify, audit, activity, issue, endMeetings });
    });
  }

  async function submit(actor, body) {
    if (actor.role !== 'Student') throw fail('Only students can submit issues.', 403);
    const category = text(body.category, 200); const description = text(body.description);
    const priority = text(body.priority, 20).toUpperCase();
    if (!category || !description || !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'URGENT'].includes(priority)) throw fail('Choose a category, description and valid priority.');
    return transaction(actor, async ({ query, notify, audit }) => {
      // Database lock serializes the quota check and insert across server processes.
      await query("SELECT pg_advisory_xact_lock(hashtextextended('issue-quota:' || UPPER($1), 0))", [actor.id]);
      const records = (await query("SELECT id, student_id, created_at AT TIME ZONE 'UTC' AS created_at, status FROM issues WHERE UPPER(student_id) = UPPER($1)", [actor.id])).rows;
      const quota = getGrievanceQuota({ issues: records, studentId: actor.id });
      if (quota.isLocked) throw fail(getQuotaLockMessage(quota), 429, { code: 'GRIEVANCE_QUOTA_LOCKED', quota });
      const assigned = (await query('SELECT id FROM ros WHERE LOWER(TRIM(region)) = LOWER(TRIM($1)) ORDER BY id', [category])).rows;
      if (assigned.length !== 1) throw fail('This category must have exactly one imported Relationship Officer.');
      const id = `ISS-${randomUUID()}`; const timestamp = new Date().toISOString(); const status = 'Assigned to RO';
      const event = { id: `submitted:${id}`, text: `Issue submitted by ${actor.name} and assigned to ${assigned[0].id}.`, time: timestamp };
      const inserted = await query(`INSERT INTO issues (id, student_id, student_name, category, description, priority, status, ro_id, created_at, logs)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ticket_number`,
      [id, actor.id, actor.name, category, description, priority, status, assigned[0].id, timestamp, JSON.stringify([event])]);
      const ticketNumber = Number(inserted.rows[0]?.ticket_number) || null;
      await audit(`Student ${actor.name} submitted issue: ${category} (${status})`);
      const notifications = [...await notify(id, 'ISSUE_SUBMITTED_TO_RO', { notificationKey: `issue:${id}:submitted:ro` }),
        ...await notify(id, 'ISSUE_SUBMITTED_STUDENT_CONFIRM', { notificationKey: `issue:${id}:submitted:student` })];
      return { id, ticketNumber, status, createdAt: timestamp, notifications };
    });
  }

  async function schedule(actor, body) {
    if (!['RO', 'Admin'].includes(actor.role)) throw fail('Only an RO or Admin can schedule meetings.', 403);
    const date = text(body.date, 20); const time = text(body.time, 20); const mode = body.mode || 'Offline';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !['Online', 'Offline'].includes(mode)) throw fail('Choose a valid date, time and meeting mode.');
    const eventId = /^schedule:[a-f0-9-]{36}$/i.test(body.scheduleEventId || '') ? body.scheduleEventId : `schedule:${randomUUID()}`;
    return transaction(actor, async ({ query, issue, activity, audit, notify }) => {
      const row = await issue(body.issueId);
      const logs = normalizeActivityLogs(row.logs);
      const previous = (await query('SELECT * FROM meetings WHERE issue_id = $1 ORDER BY id FOR UPDATE', [row.id])).rows;
      const already = logs.find(log => log.id === eventId);
      if (already) return { id: already.meetingId, isReschedule: already.eventType === 'MEETING_RESCHEDULED', duplicate: true };
      if (closed(row.status)) throw fail('This issue is resolved. Reopen it before scheduling a meeting.', 409);
      if (actor.role === 'RO' && escalated(row.status)) throw fail('This issue is under Administration.', 409);
      const admin = actor.role === 'Admin';
      if (admin && (previous.some(meeting => meeting.is_admin_hearing) || logs.some(log => log.eventType === 'ADMIN_MEETING_SCHEDULED'))) throw fail('Only one administrative hearing is allowed per issue.', 409);
      const isReschedule = !admin && previous.length > 0;
      if (isReschedule && getMeetingReassignmentCount(row, previous[0]) >= MEETING_REASSIGNMENT_LIMIT) throw fail('Maximum two meeting reassignments allowed per issue.', 409);
      const id = admin ? `MEET-${randomUUID()}` : previous[0]?.id || `MEET-${randomUUID()}`;
      const location = text(body.location, 200) || (mode === 'Online' ? 'In-App Online Video Call Portal' : 'RO Office Desk');
      const feedback = text(body.reassignFeedback); const summary = text(body.discussionSummary);
      let notes = text(body.notes);
      if (feedback && !notes.includes(feedback)) notes += `${notes ? ' | ' : ''}[Feedback / Switch Reason]: ${feedback}`;
      // Deletion, replacement, history and notification commit together.
      await query('DELETE FROM meetings WHERE issue_id = $1', [row.id]);
      await query(`INSERT INTO meetings (id, issue_id, student_id, student_name, ro_id, date, time, mode, location, notes, status, is_admin_hearing)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Confirmed',$11)`,
      [id, row.id, row.student_id, row.student_name, row.ro_id, date, time, mode, location, notes, admin]);
      const event = createMeetingScheduleEvent({ id: eventId, timestamp: new Date().toISOString(), isReschedule, meetingId: id, date, time, mode, location, roId: actor.id, feedback, discussionMinutes: summary });
      if (admin) { event.eventType = 'ADMIN_MEETING_SCHEDULED'; event.text = `Administrative hearing scheduled by ${actor.name || actor.id} for ${date} at ${time} (${location}).`; }
      await activity.append(row.id, event, admin ? null : 'Meeting Scheduled');
      await audit(`${actor.role} ${actor.id} ${isReschedule ? 'rescheduled' : 'scheduled'} meeting ${id} for ${row.id}`);
      const notifications = await notify(row.id, admin ? 'ADMIN_MEETING_SCHEDULED' : isReschedule ? 'MEETING_RESCHEDULED' : 'MEETING_SCHEDULED',
        { date, time, mode, location, notes, notificationKey: `meeting:${eventId}` });
      return { id, isReschedule, notifications };
    });
  }

  async function updateMeeting(actor, id, body) {
    if (!['RO', 'Admin'].includes(actor.role)) throw fail('Only an RO or Admin can update meetings.', 403);
    const status = body.status === 'Finished' || body.status === 'Concluded' ? 'Completed' : body.status;
    if (status && !['Confirmed', 'Started', 'Completed', 'Cancelled'].includes(status)) throw fail('Invalid meeting status.');
    const summary = text(body.discussionSummary); const actions = text(body.actionItems);
    if (body.discussionSummary !== undefined && !summary) throw fail('Enter the meeting discussion summary.');
    if (body.outcome && !['Resolved', 'Escalated', 'In-Progress', 'Follow-up Required', 'Session Concluded'].includes(body.outcome)) throw fail('Invalid meeting outcome.');
    return transaction(actor, async ({ query, issue, activity, audit, notify, endMeetings }) => {
      const lookup = (await query('SELECT issue_id FROM meetings WHERE UPPER(id) = UPPER($1) OR UPPER(issue_id) = UPPER($1) LIMIT 1', [id])).rows[0];
      if (!lookup) throw fail('Meeting not found. Schedule a meeting first.', 404);
      // All ticket actions lock the issue before its meetings: consistent lock order.
      const row = await issue(lookup.issue_id);
      const meeting = (await query('SELECT * FROM meetings WHERE issue_id = $1 AND (UPPER(id) = UPPER($2) OR UPPER(issue_id) = UPPER($2)) ORDER BY id LIMIT 1 FOR UPDATE', [row.id, id])).rows[0];
      if (!meeting) throw fail('The meeting changed. Refresh before continuing.', 409);
      if (actor.role === 'RO' && (escalated(row.status) || meeting.is_admin_hearing)) throw fail('This meeting is under Administration.', 403);
      if (closed(row.status)) throw fail('This issue is already resolved.', 409);
      if (status === 'Started' && meeting.feedback_submitted_at) throw fail('The meeting feedback is already submitted. Schedule a new meeting to continue.', 409);
      if (['Started', 'Confirmed'].includes(status) && getOnlineMeetingDeadline(meeting) !== null &&
        (status === 'Confirmed' || meeting.status !== 'Started' || isOnlineMeetingExpired(meeting))) {
        throw fail('This online session has ended. Reschedule the meeting to start a new 30-minute session.', 409);
      }
      const targetStatus = summary ? 'Completed' : status || meeting.status;
      const timestamp = new Date().toISOString();
      const notes = body.notes !== undefined ? text(body.notes) : summary ? `Discussions: ${summary}${actions ? ` | Action Items: ${actions}` : ''}` : meeting.notes;
      const starting = targetStatus === 'Started' && meeting.status !== 'Started';
      const ending = (complete(targetStatus) || targetStatus === 'Cancelled') && !complete(meeting.status) && meeting.status !== 'Cancelled';
      const timedOut = ending && targetStatus !== 'Cancelled' && isOnlineMeetingExpired(meeting);
      const endedAt = timedOut ? new Date(getOnlineMeetingDeadline(meeting)).toISOString() : timestamp;
      await query(`UPDATE meetings SET status=$1, notes=$2,
        started_at=CASE WHEN $3 THEN $4::timestamptz ELSE started_at END,
        ended_at=CASE WHEN $3 THEN NULL WHEN $5 THEN $12::timestamptz ELSE ended_at END,
        ended_by_ro=CASE WHEN $3 THEN FALSE WHEN $5 THEN NOT $13 ELSE ended_by_ro END,
        discussion_summary=CASE WHEN $6 THEN $7 ELSE discussion_summary END,
        action_items=CASE WHEN $6 THEN $8 ELSE action_items END,
        feedback_submitted_at=CASE WHEN $6 THEN $4::timestamptz ELSE feedback_submitted_at END,
        outcome=CASE WHEN $6 THEN $9 ELSE outcome END,
        follow_up_needed=CASE WHEN $6 THEN $10 ELSE follow_up_needed END WHERE id=$11`,
      [targetStatus, notes, starting, timestamp, ending, Boolean(summary), summary, actions, body.outcome || 'In-Progress', Boolean(body.followUpNeeded), meeting.id, endedAt, timedOut]);
      if (starting || ending) await activity.append(row.id, {
        id: `meeting:${meeting.id}:${timestamp}`, eventType: starting ? 'MEETING_STARTED' : targetStatus === 'Cancelled' ? 'MEETING_CANCELLED' : 'MEETING_ENDED',
        actor: timedOut ? 'System' : actor.id, time: timedOut ? endedAt : timestamp,
        text: timedOut ? 'Online meeting ended automatically after the 30-minute time limit. Awaiting RO minutes / feedback.' : `Meeting ${starting ? 'started' : targetStatus === 'Cancelled' ? 'cancelled' : 'ended'} by ${actor.id}.${ending && targetStatus !== 'Cancelled' ? ' Awaiting RO minutes / feedback.' : ''}`
      }, starting ? 'Meeting Started' : 'In-Progress');
      let notifications = [];
      if (summary) {
        await activity.append(row.id, { id: `ro-feedback:${meeting.id}:${timestamp}`, eventType: 'RO_FEEDBACK_SUBMITTED', actor: actor.id, time: timestamp,
          text: `[RO POST-MEETING DISCUSSION RECORD] Deliberations: "${summary}"${actions ? ` | Action Items: "${actions}"` : ''} | Outcome: ${body.outcome || 'In-Progress'}${body.followUpNeeded ? ' | Follow-up required.' : ''}` });
        if (body.outcome === 'Resolved' || body.outcome === 'Escalated') {
          const resolved = body.outcome === 'Resolved';
          const reason = `${resolved ? 'Resolved' : 'Escalated'} post-meeting deliberation: ${summary}`;
          await query(`UPDATE issues SET status=$1, resolved_at=CASE WHEN $2 THEN $3::timestamp ELSE resolved_at END,
            resolution_notes=CASE WHEN $2 THEN $4 ELSE resolution_notes END WHERE id=$5`, [body.outcome, resolved, timestamp, reason, row.id]);
          await endMeetings(row.id);
          await activity.append(row.id, { id: `outcome:${meeting.id}:${timestamp}`, eventType: resolved ? 'ISSUE_RESOLVED' : 'ISSUE_ESCALATED', time: timestamp, actor: actor.id, text: reason });
          notifications = await notify(row.id, resolved ? actor.role === 'Admin' ? 'ADMIN_ISSUE_RESOLVED' : 'ISSUE_RESOLVED' : 'ISSUE_ESCALATED', { reason, resolutionNotes: reason, notificationKey: `meeting-outcome:${meeting.id}:${timestamp}` });
        }
      }
      await audit(`Meeting ${meeting.id} updated (${targetStatus})${summary ? ' with discussion minutes' : ''}`);
      return { success: true, id: meeting.id, status: targetStatus, notifications };
    });
  }

  async function changeIssue(actor, id, action, body) {
    const permitted = actor.role === 'Admin' || actor.role === 'RO' && ['resolve', 'escalate'].includes(action) || actor.role === 'Student' && ['resolve', 'reopen', 'feedback'].includes(action);
    if (!permitted) throw fail('You do not have permission for this action.', 403);
    return transaction(actor, async ({ query, issue, activity, audit, notify, endMeetings }) => {
      const row = await issue(id); const timestamp = new Date().toISOString();
      let eventType; let message; let details = {}; let status = row.status;
      if (action === 'resolve') {
        if (closed(row.status)) return { success: true, status: row.status, duplicate: true };
        if (escalated(row.status) && actor.role !== 'Admin') throw fail('Only Administration can resolve escalated tickets.', 403);
        const notes = text(body.resolutionNotes); if (!notes) throw fail('Enter resolution notes.');
        status = 'Resolved'; eventType = actor.role === 'Admin' ? 'ADMIN_ISSUE_RESOLVED' : 'ISSUE_RESOLVED';
        message = `Issue resolved by ${actor.role} (${actor.id}): ${notes}`; details = { resolutionNotes: notes };
        await query("UPDATE issues SET status='Resolved', resolved_at=$1, resolution_notes=$2 WHERE id=$3", [timestamp, notes, row.id]);
        await endMeetings(row.id);
      } else if (action === 'reopen') {
        if (!closed(row.status)) throw fail('Only resolved tickets can be reopened.', 409);
        status = 'Re-opened by Student'; eventType = 'ISSUE_REOPENED'; details = { reason: text(body.reason) };
        message = `Ticket re-opened by student due to unsatisfied resolution: ${details.reason}`;
        await query('UPDATE issues SET status=$1, resolved_at=NULL WHERE id=$2', [status, row.id]);
      } else if (action === 'feedback') {
        const rating = Number(body.rating); if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw fail('Choose a rating from 1 to 5.');
        if (!closed(row.status)) throw fail('Feedback can be submitted after the issue is resolved.', 409);
        details = { rating, comments: text(body.comments) }; eventType = 'FEEDBACK_SUBMITTED';
        if (row.feedback_rating === rating && (row.feedback_comments || '') === details.comments) return { success: true, duplicate: true };
        message = `Student submitted feedback: ${rating} Stars - "${details.comments}"`;
        await query('UPDATE issues SET feedback_rating=$1, feedback_comments=$2 WHERE id=$3', [rating, details.comments, row.id]);
      } else if (action === 'escalate') {
        if (closed(row.status)) throw fail('Resolved tickets must be reopened before escalation.', 409);
        const minutes = (await query("SELECT id FROM meetings WHERE issue_id=$1 AND (discussion_summary <> '' OR notes LIKE '%Discussions:%') LIMIT 1", [row.id])).rows;
        if (actor.role === 'RO' && !minutes.length && !normalizeActivityLogs(row.logs).some(log => log.eventType === 'RO_FEEDBACK_SUBMITTED' || /\[RO POST-MEETING DISCUSSION RECORD\]/.test(log.text))) throw fail('Log discussion minutes before escalating to Administration.', 409);
        const again = escalated(row.status); status = again ? 'Re-escalated' : 'Escalated';
        details = { reason: text(body.reason) }; if (!details.reason) throw fail('Enter the escalation reason.');
        eventType = again ? 'ISSUE_RE_ESCALATED' : 'ISSUE_ESCALATED'; message = `Issue ${again ? 'RE-ESCALATED' : 'ESCALATED'} to Admin by ${actor.id}. Reason: ${details.reason}`;
        await query('UPDATE issues SET status=$1 WHERE id=$2', [status, row.id]); await endMeetings(row.id);
      } else if (action === 'reassign') {
        const ro = (await query('SELECT id, name FROM ros WHERE UPPER(id)=UPPER($1)', [body.newRoId])).rows[0];
        if (!ro) throw fail('Choose an existing Relationship Officer.');
        if (same(row.ro_id, ro.id)) return { success: true, duplicate: true };
        await query('UPDATE issues SET ro_id=$1 WHERE id=$2', [ro.id, row.id]);
        // A room started by the previous officer cannot remain joinable after transfer.
        await endMeetings(row.id);
        await query('UPDATE meetings SET ro_id=$1 WHERE issue_id=$2', [ro.id, row.id]);
        if (row.status === 'Meeting Started') { status = 'In-Progress'; await query('UPDATE issues SET status=$1 WHERE id=$2', [status, row.id]); }
        eventType = 'ISSUE_REASSIGNED'; message = `Issue reassigned to ${ro.name} (${ro.id}) by Admin`;
      } else throw fail('Unknown issue action.');
      await activity.append(row.id, { id: `${action}:${randomUUID()}`, eventType, actor: actor.id, time: timestamp, text: message });
      await audit(message);
      const notifications = await notify(row.id, eventType, { ...details, notificationKey: `issue:${row.id}:${action}:${timestamp}` });
      return { success: true, status, isReEscalated: status === 'Re-escalated', issueId: row.id, notifications };
    });
  }
  return { submit, schedule, updateMeeting, changeIssue };
}

export function createTicketRouter(dependencies) {
  const router = express.Router(); const actions = createTicketActions(dependencies);
  const handle = (operation, created = false) => async (req, res) => {
    try { res.status(created ? 201 : 200).json(await operation(req)); }
    catch (error) {
      if (!error.status) console.error('[Ticket transaction]', error.code || error.message);
      res.status(error.status || 503).json({ error: error.status ? error.message : 'The database save could not be confirmed. Refresh the ticket before retrying.',
        ...(error.code === 'GRIEVANCE_QUOTA_LOCKED' ? { code: error.code, quota: error.quota } : {}) });
    }
  };
  router.post('/issues', handle(req => actions.submit(req.user, req.body), true));
  router.post('/meetings', handle(req => actions.schedule(req.user, req.body), true));
  router.put('/meetings/:id', handle(req => actions.updateMeeting(req.user, req.params.id, req.body)));
  for (const action of ['resolve', 'reopen', 'escalate', 'feedback', 'reassign']) router.put(`/issues/:id/${action}`, handle(req => actions.changeIssue(req.user, req.params.id, action, req.body)));
  return router;
}
