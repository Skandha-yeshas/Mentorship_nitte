import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeetingScheduleEvent, getMeetingReassignmentCount, MEETING_REASSIGNMENT_LIMIT } from './meetingReassignments.js';

const event = (id, overrides = {}) => createMeetingScheduleEvent({
  id, timestamp: '2026-10-30T11:56:40.000Z', isReschedule: true,
  meetingId: 'MEET-TEST', date: '2026-10-31', time: '10:00', mode: 'Online',
  location: 'In-App Online Video Call Portal', roId: 'RO-TEST', ...overrides
});

test('initial meeting uses zero reassignments; first change uses one, second uses two', () => {
  const initial = event('schedule:initial', { isReschedule: false });
  const first = event('schedule:first');
  const second = event('schedule:second', { date: '2026-11-01', timestamp: '2026-10-30T12:05:00.000Z' });
  assert.equal(getMeetingReassignmentCount({ logs: [initial] }), 0);
  assert.equal(getMeetingReassignmentCount({ logs: [initial, first] }), 1);
  assert.equal(getMeetingReassignmentCount({ logs: [initial, first, second] }), MEETING_REASSIGNMENT_LIMIT);
});

test('one operation appearing in browser, server, meeting history and broadcast counts once', () => {
  const local = event('schedule:same-action');
  const server = { ...local, time: '2026-10-30T11:56:48.000Z' };
  assert.equal(getMeetingReassignmentCount({ logs: [local, server, local] }, { logs: [server] }), 1);
});

test('two genuine reassignments to exactly the same slot count separately', () => {
  const first = event('schedule:first');
  const second = event('schedule:second');
  assert.equal(getMeetingReassignmentCount({ logs: [first, second, first, second] }, { logs: [first, second] }), 2);
});

test('legacy browser/server punctuation and timestamp differences do not double count', () => {
  const local = {
    time: '2026-10-30T11:56:40.000Z',
    text: 'Meeting rescheduled / reassigned by RO (Online) for 2026-10-31 at 10:00 (In-App Online Video Call Portal).'
  };
  const server = {
    id: 'schedule:MEET-TEST:2026-10-30T11:56:48.000Z', eventType: 'MEETING_RESCHEDULED', time: '2026-10-30T11:56:48.000Z',
    text: 'Meeting rescheduled / reassigned by RO (Online) for 2026-10-31 at 10:00 at In-App Online Video Call Portal'
  };
  assert.equal(getMeetingReassignmentCount({ logs: [local, server] }, { logs: [local, server] }), 1);
  const next = { ...local, time: '2026-10-30T12:05:00.000Z' };
  assert.equal(getMeetingReassignmentCount({ logs: [local, server, next] }), 2);
});

test('initial schedule copies, email quotes, feedback and RO transfers do not consume reassignment slots', () => {
  const initial = event('schedule:initial', { isReschedule: false, feedback: 'Meeting rescheduled at student request' });
  const first = event('schedule:first');
  const unrelated = [
    { text: 'Reassigned to RO Another Officer by Admin' },
    { text: 'Gmail Response received: "Meeting rescheduled / reassigned by RO (Online) for 2026-10-31 at 10:00 at Online Portal"' },
    { text: 'RO post-meeting feedback submitted. Outcome: rescheduled.' },
    { text: 'Email dispatched: Meeting reassigned to a new time.' },
    { eventType: 'RO_FEEDBACK_SUBMITTED', text: 'Meeting rescheduled after discussion.' }
  ];
  assert.equal(getMeetingReassignmentCount({ logs: [initial, ...unrelated, first] }, { logs: [initial, first] }), 1);
});

test('legacy serialized logs and database event names are supported', () => {
  const first = { text: 'Meeting reassigned by RO (Offline) for 2026-10-31 at 11:00 at RO Office', time: '2026-10-30T11:00:00Z' };
  const second = { text: 'Meeting re-assigned by RO (Offline) for 2026-11-01 at 11:00 at RO Office', time: '2026-10-30T12:00:00Z' };
  assert.equal(getMeetingReassignmentCount({ logs: JSON.stringify([JSON.stringify(first), second]) }), 2);
  assert.equal(getMeetingReassignmentCount({ logs: [{ event_type: 'MEETING_REASSIGNED', text: 'Slot updated', id: 'one' }] }), 1);
  assert.equal(getMeetingReassignmentCount(null, null), 0);
});

test('structured schedule identity and destination survive server serialization', () => {
  const local = event('schedule:one');
  const server = event(local.id, { timestamp: '2026-10-30T11:56:49.000Z' });
  assert.equal(local.eventType, 'MEETING_RESCHEDULED');
  assert.equal(server.operationId, local.operationId);
  assert.equal(getMeetingReassignmentCount({ logs: [local, JSON.parse(JSON.stringify(server))] }), 1);
  assert.equal(getMeetingReassignmentCount({ logs: [event('schedule:initial', { isReschedule: false })] }), 0);
});
