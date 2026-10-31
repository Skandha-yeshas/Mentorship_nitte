import { stripSecrets } from '../../shared/sanitization.js';
export { stripSecrets } from '../../shared/sanitization.js';
const norm = value => String(value || '').trim().toUpperCase();
const same = (a, b) => Boolean(norm(a) && norm(a) === norm(b));
const studentOf = row => row.studentId || row.student_id;
const mentorOf = row => row.mentorId || row.mentor_id;
const roOf = row => row.roId || row.ro_id;
const issueOf = row => row.issueId || row.issue_id;
export function scopeState(raw, user) {
  const state = stripSecrets(raw);
  const users = state.users || {};
  const allStudents = users.students || [];
  let students = allStudents;
  let issues = state.issues || [];
  if (user.role === 'Student') {
    students = allStudents.filter(row => same(row.id, user.id));
    issues = issues.filter(row => same(studentOf(row), user.id));
  } else if (user.role === 'Mentor') {
    students = allStudents.filter(row => same(mentorOf(row), user.id));
    issues = issues.filter(row => students.some(student => same(student.id, studentOf(row))));
  } else if (user.role === 'RO') {
    issues = issues.filter(row => same(roOf(row), user.id));
    students = allStudents.filter(row => issues.some(issue => same(studentOf(issue), row.id)));
  }
  const visibleStudent = id => students.some(row => same(row.id, id));
  const visibleIssue = id => issues.some(row => same(row.id || row.issue_id, id));
  const myMentorIds = students.map(mentorOf).filter(Boolean);
  const mentors = user.role === 'Admin' ? users.mentors || [] : (users.mentors || []).filter(row => user.role === 'Mentor' ? same(row.id, user.id) : myMentorIds.some(id => same(id, row.id)));
  const visibleMentor = id => mentors.some(row => same(row.id, id));
  const roCatalog = user.role === 'Admin' || user.role === 'RO' ? (users.ros || []).filter(row => user.role === 'Admin' || same(row.id, user.id))
    : (users.ros || []).map(({ id, name, region, category }) => ({ id, name, region, category }));
  return { ...state, authenticatedUser: user, users: { students, mentors, ros: roCatalog }, issues,
    meetings: (state.meetings || []).filter(row => user.role === 'Admin' || visibleIssue(issueOf(row))),
    mentorFeedbacks: (state.mentorFeedbacks || []).filter(row => user.role === 'Admin' || (user.role === 'Student' ? same(studentOf(row), user.id) : user.role === 'Mentor' && same(mentorOf(row), user.id))),
    mentorSessionRecords: (state.mentorSessionRecords || []).filter(row => user.role === 'Admin' || user.role === 'Mentor' && same(mentorOf(row), user.id)),
    resources: (state.resources || []).filter(row => user.role === 'Admin' || visibleMentor(mentorOf(row))),
    groupSessions: (state.groupSessions || []).filter(row => user.role === 'Admin' || visibleMentor(mentorOf(row))),
    systemLogs: user.role === 'Admin' ? state.systemLogs || [] : [],
    gmailLogs: (state.gmailLogs || []).filter(row => user.role === 'Admin' || visibleIssue(issueOf(row))).map(({ body, html, text, ...row }) => row),
    recordings: ['Admin', 'RO'].includes(user.role) ? (state.recordings || []).filter(row => user.role === 'Admin' || visibleIssue(issueOf(row))) : [],
    gmailAddress: user.role === 'Admin' ? state.gmailAddress : undefined,
    imapStatus: user.role === 'Admin' ? state.imapStatus : undefined,
    mentoringSchedules: user.role === 'Admin' ? state.mentoringSchedules || {} : Object.fromEntries(Object.entries(state.mentoringSchedules || {}).filter(([id]) => visibleStudent(id) || visibleMentor(id)))
  };
}
