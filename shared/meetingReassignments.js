import { normalizeActivityLogs, parseActivityTime } from './issueActivity.js';

export const MEETING_REASSIGNMENT_LIMIT = 2;

const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const reassignmentTypes = new Set(['MEETING_RESCHEDULED', 'MEETING_REASSIGNED']);

function isReassignment(log) {
  // An email quoting a reschedule, feedback, or an officer transfer is not another meeting change.
  if (/^(?:gmail response|email\b|reassigned to\b)/i.test(log.text)) return false;
  const type = String(log.eventType || log.event_type || '').toUpperCase();
  if (type) return reassignmentTypes.has(type);
  return /^meeting\s+(?:rescheduled|reassigned|re-assigned)\b/i.test(log.text);
}

function destination(log) {
  const text = log.text.split(/\s*\|\s*\[/)[0];
  const slot = /\bfor\s+(\d{4}-\d{2}-\d{2})\s+at\s+(\d{1,2}:\d{2})/i.exec(text);
  const date = log.meetingDate || slot?.[1];
  const time = log.meetingTime || slot?.[2];
  if (!date || !time) return null;
  const tail = slot ? text.slice(slot.index + slot[0].length).trim() : '';
  const location = log.location || tail.replace(/^at\s+/i, '').replace(/^\(/, '').replace(/\)?\.?$/, '');
  const mode = log.mode || /\((Online|Offline)\)/i.exec(text)?.[1] || '';
  return [date, time, mode, location].map(normalize).join('|');
}

export function getMeetingReassignmentCount(issue, meeting) {
  const changes = [];
  for (const [source, logs] of [issue?.logs, meeting?.logs].entries()) {
    for (const log of normalizeActivityLogs(logs)) {
      if (!isReassignment(log)) continue;
      const change = { ...log, source, destination: destination(log), at: parseActivityTime(log.time), textKey: normalize(log.text) };
      const duplicate = changes.some(previous => {
        if (change.id && previous.id && change.id === previous.id) return true;
        // Separate submitted operations remain separate even if the RO chooses the same slot twice.
        if (change.operationId && previous.operationId) return change.operationId === previous.operationId;
        if (change.id && previous.id) return false;
        if (change.at === previous.at && change.textKey === previous.textKey) return true;
        // Legacy browser and server copies used different punctuation and timestamps.
        // Only reconcile those known copies; repeated actions with the same text still count separately.
        return Boolean(change.destination && change.destination === previous.destination && change.at && previous.at
          && Math.abs(Date.parse(change.at) - Date.parse(previous.at)) <= 60000
          && (change.source !== previous.source || change.textKey !== previous.textKey));
      });
      if (!duplicate) changes.push(change);
    }
  }
  return changes.length;
}

export function createMeetingScheduleEvent({ id, timestamp, isReschedule, meetingId, date, time, mode = 'Offline', location, roId, feedback, discussionMinutes }) {
  let text = `Meeting ${isReschedule ? 'rescheduled / reassigned' : 'scheduled'} by RO (${mode}) for ${date} at ${time} (${location}).`;
  if (feedback) text += ` | [REASSIGN FEEDBACK]: "${feedback}"`;
  else if (discussionMinutes) text += ` | [LOGGED DISCUSSION MINUTES]: "${discussionMinutes}"`;
  return {
    id, operationId: id, time: timestamp, eventType: isReschedule ? 'MEETING_RESCHEDULED' : 'MEETING_SCHEDULED',
    meetingId, meetingDate: date, meetingTime: time, mode, location, actor: roId || 'RO', text
  };
}
