import { tableScope } from './security/dataGateway.js';
import { scopeState } from './security/scopedState.js';
import { recordingMetadata } from './recordings.js';

// Build one statement so all sections describe the same database snapshot.
// Only fixed table/column names below become SQL; account IDs are bound values.
export function createDashboardReader(query, { gmailAddress = '', imapStatus = () => ({}) } = {}) {
  return async user => {
    const params = [];
    const rows = (table, projection, order = '', limit = '') => {
      const scope = tableScope(table, user, params);
      if (scope === 'FALSE') return "'[]'::jsonb";
      return `(SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb) FROM
        (SELECT ${projection} FROM ${table} WHERE ${scope} ${order} ${limit}) row_data)`;
    };
    let recordingScope = 'FALSE';
    if (user.role === 'Admin') recordingScope = 'TRUE';
    if (user.role === 'RO') { params.push(user.id); recordingScope = `UPPER(ro_id) = UPPER($${params.length})`; }
    const recordings = recordingScope === 'FALSE' ? "'[]'::jsonb" : `(SELECT COALESCE(jsonb_agg(r), '[]'::jsonb) FROM
      (SELECT id, meeting_id, issue_id, ro_id, mime_type, byte_size, duration_seconds, transcript_summary, recorded_at
       FROM meeting_recordings WHERE ${recordingScope} ORDER BY recorded_at DESC) r)`;
    const sql = `SELECT jsonb_build_object(
      'users', jsonb_build_object(
        'students', ${rows('students', 'id, name, email, mentor_id AS "mentorId", branch, sem')},
        'mentors', ${rows('mentors', 'id, name, email, dept, class')},
        'ros', ${rows('ros', user.role === 'Student' || user.role === 'Mentor' ? 'id, name, region' : 'id, name, email, region')}),
      'issues', ${rows('issues', `id, ticket_number AS "ticketNumber", student_id AS "studentId", student_name AS "studentName", category, description, priority, status,
        ro_id AS "roId", created_at AT TIME ZONE 'UTC' AS "createdAt", resolved_at AT TIME ZONE 'UTC' AS "resolvedAt", resolution_notes AS "resolutionNotes",
        CASE WHEN feedback_rating IS NULL THEN NULL ELSE jsonb_build_object('rating', feedback_rating, 'comments', COALESCE(feedback_comments, '')) END AS feedback, logs`, 'ORDER BY created_at DESC')},
      'meetings', ${rows('meetings', `id, issue_id AS "issueId", student_id AS "studentId", student_name AS "studentName", ro_id AS "roId",
        date, time, mode, location, notes, status, started_at AS "startedAt", CURRENT_TIMESTAMP AS "serverNow", ended_at AS "endedAt", ended_by_ro AS "endedByRo",
        discussion_summary AS "discussionSummary", action_items AS "actionItems", feedback_submitted_at AS "feedbackSubmittedAt",
        outcome, follow_up_needed AS "followUpNeeded", is_admin_hearing AS "isAdminHearing"`)},
      'groupSessions', ${rows('group_sessions', 'id, mentor_id AS "mentorId", mentor_name AS "mentorName", title, date_time AS "dateTime", description, link', 'ORDER BY date_time')},
      'resources', ${rows('resources', 'id, mentor_id AS "mentorId", title, type, content, date_shared AS "dateShared"', 'ORDER BY date_shared DESC')},
      'mentorSessionRecords', ${rows('mentor_session_records', 'id, mentor_id AS "mentorId", session_date AS "sessionDate", students_attended AS "studentsAttended", topic, notes, which_class AS "whichClass", location, status, created_at AS "createdAt"', 'ORDER BY created_at DESC')},
      'mentorFeedbacks', ${rows('mentor_feedbacks', 'id, student_id AS "studentId", student_name AS "studentName", mentor_id AS "mentorId", mentor_name AS "mentorName", regularity_rating AS "regularityRating", clarity_rating AS "clarityRating", participation_rating AS "participationRating", difficulties, created_at AS "createdAt"', 'ORDER BY created_at DESC')},
      'categoryVideos', ${rows('category_videos', 'category, title, video_url AS "videoUrl", description, updated_by AS "updatedBy", updated_at AS "updatedAt"')},
      'systemLogs', ${rows('system_logs', 'id, text, timestamp, user_role AS "userRole", user_id AS "userId"', 'ORDER BY timestamp DESC', 'LIMIT 100')},
      'gmailLogs', ${rows('email_logs', 'id, direction, sender, recipient, subject, event_type AS "eventType", issue_id AS "issueId", status, delivery_reason AS "deliveryReason", mentor_id AS "mentorId", created_at AS "createdAt"', 'ORDER BY created_at DESC', 'LIMIT 100')},
      'recordings', ${recordings},
      'grievanceResetVersion', (SELECT value FROM app_settings WHERE key = 'grievance_reset_version')
    ) AS state`;
    const state = (await query(sql, params)).rows[0].state;
    const hearings = new Map(state.meetings.filter(meeting => meeting.isAdminHearing).map(meeting => [meeting.issueId, meeting]));
    state.issues = state.issues.map(issue => hearings.has(issue.id)
      ? { ...issue, adminMeetingScheduled: true, adminMeeting: hearings.get(issue.id) } : issue);
    return scopeState({ ...state, recordings: state.recordings.map(recordingMetadata), isPgConnected: true,
      gmailAddress, imapStatus: user.role === 'Admin' ? imapStatus() : undefined }, user);
  };
}

export async function initializeReliabilitySchema(query) {
  await query('ALTER TABLE issues ADD COLUMN IF NOT EXISTS ticket_number BIGINT GENERATED BY DEFAULT AS IDENTITY');
  await query('CREATE UNIQUE INDEX IF NOT EXISTS issues_ticket_number_uidx ON issues (ticket_number)');
  await query(`ALTER TABLE meetings
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS ended_by_ro BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS discussion_summary TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS action_items TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS feedback_submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS outcome TEXT,
    ADD COLUMN IF NOT EXISTS follow_up_needed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS is_admin_hearing BOOLEAN NOT NULL DEFAULT FALSE`);
  // Match the case-insensitive predicates already used by authorization/scoped queries.
  for (const [table, column] of [['issues', 'student_id'], ['issues', 'ro_id'], ['issues', 'id'],
    ['students', 'mentor_id'], ['students', 'id'], ['mentors', 'id'], ['ros', 'id'],
    ['meetings', 'issue_id'], ['meetings', 'id'], ['group_sessions', 'mentor_id'],
    ['resources', 'mentor_id'], ['mentor_session_records', 'mentor_id'],
    ['mentor_feedbacks', 'student_id'], ['mentor_feedbacks', 'mentor_id'], ['email_logs', 'issue_id'],
    ['email_logs', 'mentor_id'], ['meeting_recordings', 'ro_id']]) {
    await query(`CREATE INDEX IF NOT EXISTS ${table}_${column}_upper_idx ON ${table} (UPPER(${column}))`);
  }
  await query('CREATE INDEX IF NOT EXISTS issues_student_created_idx ON issues (UPPER(student_id), created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS meetings_issue_idx ON meetings (issue_id)');
  await query('CREATE INDEX IF NOT EXISTS email_logs_issue_created_idx ON email_logs (issue_id, created_at DESC)');
}
