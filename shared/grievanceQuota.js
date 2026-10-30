export const GRIEVANCE_LIMIT = 2;
export const GRIEVANCE_LOCK_MS = 7 * 24 * 60 * 60 * 1000;
const normalize = value => String(value || '').trim().toLowerCase();

export function getGrievanceQuota({ issues = [], studentId, now = Date.now() }) {
  const targetId = normalize(studentId);
  const currentTime = new Date(now).getTime();
  const unique = new Map();
  for (const issue of issues) {
    if (!targetId || normalize(issue.studentId || issue.student_id) !== targetId) continue;
    const id = normalize(issue.id || issue.issue_id);
    if (!id) continue;
    const submittedAt = issue.createdAt || issue.created_at || issue.submittedAt || issue.submitted_at;
    const submittedTime = submittedAt ? new Date(submittedAt).getTime() : NaN;
    const previous = unique.get(id);
    // Keep the original submission time when multiple stores return the same ticket.
    if (!previous || (Number.isFinite(submittedTime) && (!Number.isFinite(previous.submittedTime) || submittedTime < previous.submittedTime))) {
      unique.set(id, { issue, submittedTime });
    }
  }

  const slots = Array.from(unique.values()).map(({ issue, submittedTime }) => ({
    ...issue,
    unlocksAt: Number.isFinite(submittedTime) ? new Date(submittedTime + GRIEVANCE_LOCK_MS).toISOString() : null
  })).filter(issue => !issue.unlocksAt || new Date(issue.unlocksAt).getTime() > currentTime)
    .sort((a, b) => (a.unlocksAt ? new Date(a.unlocksAt).getTime() : Infinity) - (b.unlocksAt ? new Date(b.unlocksAt).getTime() : Infinity));

  const usedCount = slots.length;
  const remainingQuota = Math.max(0, GRIEVANCE_LIMIT - usedCount);
  // If legacy data already exceeds the limit, enough locks must expire to get below two.
  const nextSlotAvailableAt = remainingQuota ? null : slots[usedCount - GRIEVANCE_LIMIT]?.unlocksAt || null;
  return {
    slots, usedCount, activeCount: usedCount, recentCount: usedCount,
    maxLimit: GRIEVANCE_LIMIT, maxQuota: GRIEVANCE_LIMIT,
    remainingQuota, remainingLimit: remainingQuota,
    isEligible: remainingQuota > 0, isLocked: remainingQuota === 0,
    nextSlotAvailableAt, lockDays: 7
  };
}

export function formatQuotaDate(value) {
  return value ? new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
  }) + ' IST' : 'Awaiting the original submission date';
}

export function getQuotaLockMessage(quota) {
  return `Grievance quota locked (${Math.min(quota.usedCount, GRIEVANCE_LIMIT)}/2 slots used). Each submission locks a slot for 7 days. Resolution and feedback do not unlock it early. Next slot available: ${formatQuotaDate(quota.nextSlotAvailableAt)}.`;
}
