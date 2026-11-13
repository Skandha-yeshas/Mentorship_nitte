import test from 'node:test';
import assert from 'node:assert/strict';
import { getOnlineMeetingDeadline, isOnlineMeetingExpired, formatMeetingRemaining, ONLINE_MEETING_LIMIT_MS } from './meetingDuration.js';

const started = Date.parse('2026-11-06T10:00:00Z');
const online = { mode: 'Online', startedAt: new Date(started).toISOString() };

test('online calls expire at exactly 30 minutes after the persisted start', () => {
  assert.equal(getOnlineMeetingDeadline(online), started + 1800000);
  assert.equal(isOnlineMeetingExpired(online, started + ONLINE_MEETING_LIMIT_MS - 1), false);
  assert.equal(isOnlineMeetingExpired(online, started + ONLINE_MEETING_LIMIT_MS), true);
  assert.equal(isOnlineMeetingExpired(online, started + ONLINE_MEETING_LIMIT_MS + 60000), true);
});

test('refreshing or joining late cannot move the deadline; supplied end times are ignored', () => {
  assert.equal(getOnlineMeetingDeadline({ ...online, endsAt: '2099-01-01T00:00:00Z' }), getOnlineMeetingDeadline(online));
  assert.equal(getOnlineMeetingDeadline({ mode: 'Online', started_at: online.startedAt }), getOnlineMeetingDeadline(online));
  assert.equal(formatMeetingRemaining(getOnlineMeetingDeadline(online) - (started + 25 * 60000)), '05:00');
  assert.equal(formatMeetingRemaining(-1000), '00:00');
});

test('the online time limit does not apply to offline or unstarted meetings', () => {
  for (const meeting of [{ ...online, mode: 'Offline' }, {}, { startedAt: 'invalid' }]) {
    assert.equal(getOnlineMeetingDeadline(meeting), null);
    assert.equal(isOnlineMeetingExpired(meeting, started + 3600000), false);
  }
});
