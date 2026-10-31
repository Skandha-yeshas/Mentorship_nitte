const normalize = value => String(value || '').trim().toUpperCase();
export const RO_SEEN_STORAGE_KEY = 'nitte_ro_opened_items_v1';

export function getRoPriorityRank(priority) {
  return ({ HIGH: 0, MEDIUM: 1, NORMAL: 1, LOW: 2 })[normalize(priority)] ?? 1;
}

export function sortRoIssuesByPriority(issues) {
  return [...issues].sort((a, b) => getRoPriorityRank(a.priority) - getRoPriorityRank(b.priority) ||
    (Date.parse(b.createdAt || b.created_at || '') || 0) - (Date.parse(a.createdAt || a.created_at || '') || 0));
}

export function getRoIssueReadKey(roId, issue) {
  const id = normalize(issue?.id || issue?.issue_id);
  const rawDate = issue?.createdAt || issue?.created_at || '';
  const createdAt = rawDate && Number.isFinite(Date.parse(rawDate)) ? new Date(rawDate).toISOString() : String(rawDate);
  return roId && id ? JSON.stringify(['RO', normalize(roId), 'issue', id, createdAt]) : '';
}

export function getRoMeetingReadKey(roId, meeting) {
  const issueId = normalize(meeting?.issueId || meeting?.issue_id);
  const rawTime = String(meeting?.time || '').trim();
  const parts = rawTime.match(/^(\d{1,2}):(\d{2})/);
  const time = parts ? `${parts[1].padStart(2, '0')}:${parts[2]}` : rawTime;
  return roId && issueId ? JSON.stringify([
    'RO', normalize(roId), 'meeting', issueId, normalize(meeting.id || issueId),
    String(meeting.date || '').trim().slice(0, 10), time
  ]) : '';
}

export function getRoBrowserStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export function readRoSeenEntries(storage) {
  try {
    const data = JSON.parse(storage?.getItem(RO_SEEN_STORAGE_KEY) || '{}');
    return data && typeof data === 'object' && !Array.isArray(data)
      ? Object.fromEntries(Object.entries(data).filter(([, value]) => typeof value === 'string' && value)) : {};
  } catch { return {}; }
}

export function markRoItemsSeen(entries, keys, storage, now = new Date().toISOString()) {
  const validKeys = keys.filter(Boolean);
  if (!validKeys.length || validKeys.every(key => entries[key])) return entries;
  // Merge with the latest storage value to preserve items opened in another tab.
  const updated = { ...readRoSeenEntries(storage), ...entries };
  for (const key of validKeys) updated[key] ||= now;
  try { storage?.setItem(RO_SEEN_STORAGE_KEY, JSON.stringify(updated)); } catch { /* Keep this session's read state even if storage is unavailable. */ }
  return updated;
}
