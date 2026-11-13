export const ONLINE_MEETING_LIMIT_MINUTES = 30;
export const ONLINE_MEETING_LIMIT_MS = ONLINE_MEETING_LIMIT_MINUTES * 60 * 1000;

export function getOnlineMeetingDeadline(meeting) {
  if (!meeting || String(meeting.mode || 'Online').toLowerCase() !== 'online') return null;
  const startedAt = meeting.startedAt || meeting.started_at;
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  return Number.isFinite(start) ? start + ONLINE_MEETING_LIMIT_MS : null;
}

export function isOnlineMeetingExpired(meeting, now = Date.now()) {
  const deadline = getOnlineMeetingDeadline(meeting);
  return deadline !== null && Number(now) >= deadline;
}

export function formatMeetingRemaining(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
