const normalize = value => String(value || '').trim().toUpperCase();

export function parseActivityTime(value) {
  if (!value) return null;
  if (value instanceof Date || typeof value === 'number') {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }
  const text = String(value).trim();
  const local = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (local) {
    const [, first, second, year, rawHour, minute, seconds = '00', period] = local;
    const monthFirst = Number(second) > 12 || Boolean(period && Number(first) <= 12);
    const month = monthFirst ? first : second;
    const day = monthFirst ? second : first;
    const hour = period ? Number(rawHour) % 12 + (period.toUpperCase() === 'PM' ? 12 : 0) : Number(rawHour);
    return parseActivityTime(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${String(hour).padStart(2, '0')}:${minute}:${seconds}+05:30`);
  }
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

export function normalizeActivityLogs(value) {
  if (typeof value === 'string') {
    try { return normalizeActivityLogs(JSON.parse(value)); } catch { return value.trim() ? [{ text: value }] : []; }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) value = [value];
  if (!Array.isArray(value)) return [];
  return value.flatMap(log => {
    if (typeof log === 'string') return normalizeActivityLogs(log);
    if (!log || typeof log !== 'object') return [];
    const text = String(log.text || log.message || log.description || '').trim();
    return text ? [{ ...log, text, time: parseActivityTime(log.time || log.timestamp || log.createdAt || log.created_at) }] : [];
  });
}

export function mergeActivityLogs(...sources) {
  const result = [];
  const seen = new Set();
  for (const log of sources.flatMap(normalizeActivityLogs)) {
    const key = log.id ? `id:${log.id}` : `${parseActivityTime(log.time) || ''}|${log.text.trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(log);
  }
  return result;
}

const classify = text => {
  if (/student.*feedback|feedback rating/i.test(text)) return ['Student Feedback Submitted', 'feedback'];
  if (/rescheduled|reassigned.*meeting|meeting.*reassigned/i.test(text)) return ['Meeting Rescheduled', 'meeting'];
  if (/meeting.*scheduled|hearing.*scheduled/i.test(text)) return ['Meeting Scheduled', 'meeting'];
  if (/meeting.*started/i.test(text)) return ['Meeting Started', 'meeting'];
  if (/meeting.*ended|meeting.*completed|meeting.*concluded/i.test(text)) return ['Meeting Ended', 'meeting'];
  if (/meeting.*cancelled/i.test(text)) return ['Meeting Cancelled', 'meeting'];
  if (/post-meeting discussion|RO.*feedback|minutes.*submitted|discussion.*record/i.test(text)) return ['RO Minutes / Feedback', 'feedback'];
  if (/re-opened|reopened/i.test(text)) return ['Issue Reopened', 'issue'];
  if (/escalat/i.test(text)) return ['Issue Escalated', 'issue'];
  if (/resolved|resolution/i.test(text)) return ['Issue Resolved', 'issue'];
  if (/submitted|ticket raised|issue raised/i.test(text)) return ['Issue Submitted', 'issue'];
  if (/assigned|reassigned/i.test(text)) return ['Officer Assignment', 'issue'];
  return ['Ticket Action', 'issue'];
};

export function buildIssueActivity({ issue, logs = [], emailLogs = [] }) {
  if (!issue) return [];
  const issueId = normalize(issue.id || issue.issue_id);
  const mergedLogs = mergeActivityLogs(issue.logs, logs);
  const createdAt = parseActivityTime(issue.createdAt || issue.created_at || issue.submittedAt);
  if (createdAt && !mergedLogs.some(log => /issue submitted|ticket raised|issue raised|submitted by/i.test(log.text))) {
    mergedLogs.unshift({ id: `submission:${issueId}`, text: `Issue ${issueId} submitted by the student.`, time: createdAt });
  }
  const activity = mergedLogs.map((log, index) => {
    const [title, kind] = classify(log.text);
    return { id: `action:${log.id || index}`, title, kind, text: log.text, time: parseActivityTime(log.time), actor: log.actor || log.actorRole || '' };
  });
  const seenEmails = new Set();
  for (const email of emailLogs) {
    if (!issueId || normalize(email.issueId || email.issue_id) !== issueId) continue;
    const time = parseActivityTime(email.createdAt || email.created_at);
    const key = email.id ? String(email.id) : `${time}|${email.subject}|${email.recipient}|${email.status}`;
    if (seenEmails.has(key)) continue;
    seenEmails.add(key);
    const inbound = normalize(email.direction) === 'INBOUND';
    const status = normalize(email.status);
    const delivery = inbound ? 'Received' :
      status === 'DELIVERED_GMAIL' ? 'Dispatched via Gmail' :
      ['SENT', 'DELIVERED'].includes(status) ? 'Sent' :
      ['FAILED', 'ERROR', 'BOUNCED'].includes(status) ? 'Dispatch failed' : 'Logged locally — delivery not confirmed';
    activity.push({
      id: `email:${key}`, kind: 'email', title: inbound ? 'Email Received' : 'Email Dispatch',
      text: email.subject || 'Ticket notification', time, delivery, status,
      sender: email.sender || '', recipient: email.recipient || email.recipient_email || '',
      eventType: String(email.eventType || email.event_type || '').replaceAll('_', ' ')
    });
  }
  return activity.map((entry, index) => ({ ...entry, order: index }))
    .sort((a, b) => (a.time ? Date.parse(a.time) : Infinity) - (b.time ? Date.parse(b.time) : Infinity) || a.order - b.order);
}

export function formatActivityTime(value) {
  return value ? new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
  }) + ' IST' : 'Time not recorded';
}
