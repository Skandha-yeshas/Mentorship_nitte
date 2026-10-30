import test from 'node:test';
import assert from 'node:assert/strict';
import { getRoMeetingQueue, getUniqueMeetings, isRoMeetingAwaitingFeedback, hasRoMeetingFeedback, getRoMeetingState, mergeMeetingRecord } from './roMeetings.js';

const issue = { id: 'ISS-592', roId: 'RO-01', studentId: 'S-1', category: 'Academic - Course Enrollment issues', status: 'Meeting Started' };
const current = { id: 'MEET-SERVER', issueId: issue.id, roId: issue.roId, studentId: issue.studentId, status: 'Started' };
const queue = (meetings, issues = [issue], roId = issue.roId) => getRoMeetingQueue({ meetings, issues, roId });

test('course enrollment shows one join entry for server and cached copies with different meeting IDs', () => {
  const cached = { ...current, id: 'MEET-CLIENT' };
  assert.deepEqual(queue([current, cached]), [current]);
  assert.deepEqual(getUniqueMeetings([current, cached]), [current]);
});

test('completed orphan record from a meeting ID mistaken for an issue ID is hidden', () => {
  const orphan = { ...current, id: 'MEET-OLD', issueId: 'MEET-OLD', status: 'Completed' };
  assert.deepEqual(queue([current, orphan]), [current]);
  assert.deepEqual(queue([{ ...orphan, status: 'Started' }]), []);
});

test('ended meetings remain scheduled until feedback and offer feedback instead of joining', () => {
  for (const status of ['Completed', 'Finished', 'Concluded']) {
    const ended = { ...current, status };
    assert.deepEqual(queue([ended]), [ended], status);
    assert.equal(isRoMeetingAwaitingFeedback(ended), true);
  }
  for (const endState of [{ endedAt: '2026-10-30T10:00:00Z' }, { endedByRo: true }]) {
    const ended = { ...current, ...endState };
    assert.deepEqual(queue([ended]), [ended]);
    assert.equal(isRoMeetingAwaitingFeedback(ended), true);
  }
  assert.deepEqual(queue([{ ...current, status: 'Cancelled' }]), []);
});

test('an authoritative feedback record suppresses a stale started cache copy', () => {
  assert.deepEqual(queue([{ ...current, status: 'Completed', discussionSummary: 'Course enrollment reviewed.' }, { ...current, id: 'MEET-CACHED' }]), []);
});

test('separate issues in the same category remain separate entries', () => {
  const secondIssue = { ...issue, id: 'ISS-993', studentId: 'S-2' };
  const secondMeeting = { ...current, id: 'MEET-SECOND', issueId: secondIssue.id, studentId: 'S-2' };
  assert.deepEqual(queue([current, secondMeeting], [issue, secondIssue]), [current, secondMeeting]);
});

test('resolved, closed, and escalated issues are excluded', () => {
  for (const status of ['Resolved', 'Closed', 'Escalated', 'Re-escalated']) {
    assert.deepEqual(queue([current], [{ ...issue, status }]), [], status);
  }
});

test('only meetings linked to this RO\'s issues appear', () => {
  assert.deepEqual(queue([current], [issue], 'RO-02'), []);
  assert.deepEqual(queue([{ ...current, roId: 'RO-02' }]), []);
  assert.deepEqual(queue([current], [{ ...issue, roId: 'RO-02' }]), []);
});

test('normalizes whitespace, case, and database column names when deduplicating', () => {
  const cached = { id: 'MEET-CACHE', issue_id: ' iss-592 ', ro_id: ' ro-01 ', status: 'Confirmed' };
  assert.deepEqual(queue([current, cached]), [current]);
  assert.deepEqual(queue([cached]), [cached]);
});

test('scheduled meetings remain available and empty data renders no entries', () => {
  const scheduled = { ...current, status: 'Confirmed' };
  assert.deepEqual(queue([scheduled]), [scheduled]);
  assert.deepEqual(getRoMeetingQueue({}), []);
});

test('scheduled count stays one throughout scheduling, the call, and feedback drafting, then becomes zero on submission', () => {
  for (const status of ['Confirmed', 'Started', 'Completed']) {
    const staged = { ...current, status };
    assert.equal(queue([staged]).length, 1);
  }
  const submitted = { ...current, status: 'Completed', feedbackSubmittedAt: '2026-10-30T10:00:00Z', discussionSummary: 'Reviewed enrollment.' };
  assert.equal(queue([submitted]).length, 0);
  assert.equal(isRoMeetingAwaitingFeedback(submitted), false);
});

test('persisted feedback in meeting notes keeps it out of the queue after refresh', () => {
  const submitted = { ...current, status: 'Completed', notes: 'Discussions: Reviewed course enrollment. | Action Items: Submit form.' };
  assert.equal(hasRoMeetingFeedback(submitted), true);
  assert.deepEqual(queue([submitted]), []);
});

test('blank feedback and a student rating do not clear the RO meeting queue', () => {
  const pending = { ...current, status: 'Completed', discussionSummary: ' ', notes: 'Discussions:   ', feedback: { rating: 5 } };
  assert.equal(hasRoMeetingFeedback(pending), false);
  assert.deepEqual(queue([pending]), [pending]);
});

test('rescheduled meeting without its own feedback counts even when the issue has older minutes', () => {
  const rescheduled = { ...current, status: 'Confirmed', discussionSummary: '', feedbackSubmittedAt: null, notes: 'New appointment' };
  assert.deepEqual(queue([rescheduled], [{ ...issue, discussionSummary: 'Old session minutes' }]), [rescheduled]);
});

test('Start Meeting is available only for a scheduled meeting, never for a live or ended room', () => {
  assert.equal(getRoMeetingState({ ...current, status: 'Confirmed' }, issue), 'scheduled');
  assert.equal(getRoMeetingState(current, issue), 'live');
  assert.equal(getRoMeetingState({ ...current, status: 'Completed' }, issue), 'feedback-pending');
  assert.equal(getRoMeetingState({ ...current, endedByRo: true }, issue), 'feedback-pending');
  assert.equal(getRoMeetingState({ ...current, endedAt: '2026-10-30T10:00:00Z' }, issue), 'feedback-pending');
  assert.equal(getRoMeetingState({ ...current, status: 'Completed', discussionSummary: 'Minutes filed.' }, issue), 'completed');
});

test('a rescheduled meeting can start again while resolved and cancelled meetings stay closed', () => {
  const rescheduled = { ...current, status: 'Confirmed', endedAt: null, endedByRo: false, discussionSummary: '', notes: '' };
  assert.equal(getRoMeetingState(rescheduled, issue), 'scheduled');
  for (const status of ['Resolved', 'Closed', 'Escalated', 'Re-escalated']) {
    assert.equal(getRoMeetingState(rescheduled, { ...issue, status }), 'locked');
  }
  assert.equal(getRoMeetingState({ ...rescheduled, status: 'Cancelled' }, issue), 'cancelled');
  assert.equal(getRoMeetingState(null, issue), 'unscheduled');
});

test('stale cached Started status cannot revive a server-completed meeting', () => {
  const merged = mergeMeetingRecord({ ...current, status: 'Completed' }, current);
  assert.equal(merged.status, 'Completed');
  assert.equal(getRoMeetingState(merged, issue), 'feedback-pending');
});

test('ending locally stays ended while a stale server response still says Started', () => {
  const ended = { ...current, status: 'Completed', endedAt: '2026-10-30T10:00:00Z', endedByRo: true };
  const merged = mergeMeetingRecord(current, ended);
  assert.equal(merged.status, 'Completed');
  assert.equal(merged.endedByRo, true);
  assert.equal(getRoMeetingState(merged, issue), 'feedback-pending');
});

test('submitted feedback survives a completed response that has not received the minutes yet', () => {
  const submitted = { ...current, status: 'Completed', discussionSummary: 'Minutes filed.', feedbackSubmittedAt: '2026-10-30T10:00:00Z' };
  const merged = mergeMeetingRecord({ ...current, status: 'Completed' }, submitted);
  assert.equal(getRoMeetingState(merged, issue), 'completed');
  assert.deepEqual(queue([merged]), []);
});

test('a different rescheduled slot does not inherit the old meeting end or feedback', () => {
  const old = { ...current, date: '2026-10-30', time: '10:00', status: 'Completed', endedAt: '2026-10-30T10:30:00Z', discussionSummary: 'Old minutes.' };
  const rescheduled = { ...current, date: '2026-10-31', time: '11:00', status: 'Confirmed' };
  const merged = mergeMeetingRecord(rescheduled, old);
  assert.equal(getRoMeetingState(merged, issue), 'scheduled');
  assert.deepEqual(queue([merged]), [rescheduled]);
});

test('a local start survives a server response that is still confirming the same slot', () => {
  const merged = mergeMeetingRecord({ ...current, status: 'Confirmed' }, current);
  assert.equal(getRoMeetingState(merged, issue), 'live');
});
