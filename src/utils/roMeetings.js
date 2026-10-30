const normalize = value => String(value || '').trim().toUpperCase();

export const getMeetingIssueId = meeting => normalize(meeting.issueId || meeting.issue_id);

export function hasRoMeetingFeedback(meeting) {
  return Boolean(
    meeting.feedbackSubmittedAt || meeting.feedback_submitted_at ||
    String(meeting.discussionSummary || meeting.discussion_summary || '').trim() ||
    /Discussions:\s*\S/i.test(String(meeting.notes || ''))
  );
}

export function isRoMeetingAwaitingFeedback(meeting) {
  const ended = meeting.endedByRo || meeting.endedAt || meeting.ended_at ||
    ['COMPLETED', 'FINISHED', 'CONCLUDED'].includes(normalize(meeting.status));
  return Boolean(ended && !hasRoMeetingFeedback(meeting));
}

export function getRoMeetingState(meeting, issue) {
  if (!issue || ['RESOLVED', 'CLOSED', 'ESCALATED', 'RE-ESCALATED'].includes(normalize(issue.status)) || issue.isReEscalated) return 'locked';
  if (!meeting) return 'unscheduled';
  if (normalize(meeting.status) === 'CANCELLED') return 'cancelled';
  if (hasRoMeetingFeedback(meeting)) return 'completed';
  if (isRoMeetingAwaitingFeedback(meeting)) return 'feedback-pending';
  if (['STARTED', 'IN-PROGRESS'].includes(normalize(meeting.status))) return 'live';
  if (['SCHEDULED', 'CONFIRMED', 'PENDING'].includes(normalize(meeting.status))) return 'scheduled';
  return 'unavailable';
}

export function mergeMeetingRecord(server, cached) {
  // A newly assigned slot must not inherit the previous call's end or feedback.
  if ((server.date && cached.date && server.date !== cached.date) ||
      (server.time && cached.time && server.time !== cached.time)) return server;
  const serverEnded = isRoMeetingAwaitingFeedback(server) || hasRoMeetingFeedback(server) || normalize(server.status) === 'CANCELLED';
  const cachedEnded = isRoMeetingAwaitingFeedback(cached) || hasRoMeetingFeedback(cached) || normalize(cached.status) === 'CANCELLED';
  const cachedLive = ['STARTED', 'IN-PROGRESS'].includes(normalize(cached.status));
  const serverScheduled = ['SCHEDULED', 'CONFIRMED', 'PENDING'].includes(normalize(server.status));
  const pendingFeedbackSave = hasRoMeetingFeedback(cached) && !hasRoMeetingFeedback(server);
  const lifecycle = pendingFeedbackSave ? cached : (serverEnded ? server : ((cachedEnded || (cachedLive && serverScheduled)) ? cached : server));
  return {
    ...cached,
    ...server,
    status: lifecycle.status,
    startedAt: lifecycle.startedAt,
    endedAt: lifecycle.endedAt || lifecycle.ended_at || null,
    endedByRo: Boolean(lifecycle.endedByRo),
    discussionSummary: lifecycle.discussionSummary || lifecycle.discussion_summary || '',
    actionItems: lifecycle.actionItems || '',
    feedbackSubmittedAt: lifecycle.feedbackSubmittedAt || lifecycle.feedback_submitted_at || null,
    notes: lifecycle.notes || server.notes || ''
  };
}

// Inputs are ordered by authority: server records precede cached copies.
export function getUniqueMeetings(meetings) {
  const seen = new Set();
  return meetings.filter(meeting => {
    const key = getMeetingIssueId(meeting) || normalize(meeting.id);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getRoMeetingQueue({ meetings = [], issues = [], roId }) {
  const assignedIssues = new Map(issues
    .filter(issue => normalize(issue.roId || issue.ro_id) === normalize(roId))
    .map(issue => [normalize(issue.id || issue.issue_id), issue]));

  return getUniqueMeetings(meetings).filter(meeting => {
    const issue = assignedIssues.get(getMeetingIssueId(meeting));
    if (!issue || normalize(meeting.roId || meeting.ro_id) !== normalize(roId)) return false;
    if (['RESOLVED', 'CLOSED', 'ESCALATED', 'RE-ESCALATED'].includes(normalize(issue.status)) || issue.isReEscalated) return false;
    if (hasRoMeetingFeedback(meeting)) return false;
    return ['SCHEDULED', 'CONFIRMED', 'PENDING', 'STARTED', 'IN-PROGRESS', 'COMPLETED', 'FINISHED', 'CONCLUDED'].includes(normalize(meeting.status));
  });
}
