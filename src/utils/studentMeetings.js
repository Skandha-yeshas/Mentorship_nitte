const normalize = value => String(value || '').trim().toLowerCase();
const issueIdOf = issue => normalize(issue.id || issue.issue_id);
const meetingIssueIdOf = meeting => normalize(meeting.issueId || meeting.issue_id);
const studentIdOf = record => normalize(record.studentId || record.student_id);
const isOnline = meeting => !meeting.mode || normalize(meeting.mode) === 'online';
const isLive = meeting => normalize(meeting.status) === 'started' && !meeting.endedByRo && !meeting.endedAt && !meeting.ended_at;
const isIssueClosed = issue => ['resolved', 'closed', 'escalated', 're-escalated'].includes(normalize(issue.status));

export function getStudentIssues(issues, student) {
  const identifiers = new Set([normalize(student?.id), normalize(student?.email)].filter(Boolean));
  return issues.filter(issue => identifiers.has(studentIdOf(issue)));
}

// A meeting must belong to this student and have a room tied to their issue.
// Names and other students' live meetings never establish ownership.
export function getLiveStudentMeetings({ meetings = [], issues = [], student }) {
  const identifiers = new Set([normalize(student?.id), normalize(student?.email)].filter(Boolean));
  const ownedIssues = getStudentIssues(issues, student);
  const ownedIssueIds = new Set(ownedIssues.filter(issue => !isIssueClosed(issue)).map(issueIdOf));

  return meetings.filter(meeting => {
    const issueId = meetingIssueIdOf(meeting);
    if (!issueId || !isOnline(meeting) || !isLive(meeting)) return false;

    const ownerId = studentIdOf(meeting);
    if (ownerId && !identifiers.has(ownerId)) return false;

    const linkedIssue = issues.find(issue => issueIdOf(issue) === issueId);
    if (linkedIssue) return ownedIssueIds.has(issueId);
    return identifiers.has(ownerId);
  });

}
