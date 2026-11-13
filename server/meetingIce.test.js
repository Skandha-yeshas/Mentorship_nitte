import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createMeetingIceRouter, createMeetingIceService } from './meetingIce.js';
import { createAccessPolicy } from './security/access.js';

const clock = Date.parse('2026-11-10T10:10:00Z');
const student = { id: 'S1', role: 'Student' };
const ro = { id: 'R1', role: 'RO' };
const env = { TURN_PROVIDER: 'cloudflare', CLOUDFLARE_TURN_KEY_ID: 'fixture-key', CLOUDFLARE_TURN_API_TOKEN: 'fixture-secret', NODE_ENV: 'production' };
const live = () => ({ id: 'M1', started_at: '2026-11-10T10:00:00Z', mode: 'Online', server_now: new Date(clock),
  student_id: 'S1', ro_id: 'R1', issue_status: 'Meeting Started', is_admin_hearing: false });
const providerResponse = () => ({ ok: true, json: async () => ({
  providerToken: 'must-not-reach-browser',
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp', 'turn:turn.cloudflare.com:53?transport=udp'],
    username: 'temporary-user', credential: 'temporary-password', apiToken: 'must-not-reach-browser' }]
}) });
const fixtureQuery = row => async (_sql, params) => ({ rows: params[0] === 'ISS1' ? [typeof row === 'function' ? row() : row] : [] });

test('only the correct live participants receive short-lived relay configuration; duplicate requests share a mint', async () => {
  let calls = 0; let sent;
  const service = createMeetingIceService({ query: fixtureQuery(live), env, now: () => clock, fetchImpl: async (url, options) => {
    calls++; sent = { url, options }; return providerResponse();
  } });
  const [a,b] = await Promise.all([service.configuration(student, 'ISS1'), service.configuration(student, 'ISS1')]);
  assert.equal(calls, 1); assert.deepEqual(a,b);
  assert.equal(sent.url, 'https://rtc.live.cloudflare.com/v1/turn/keys/fixture-key/credentials/generate-ice-servers');
  assert.equal(sent.options.headers.Authorization, 'Bearer fixture-secret');
  assert.equal(JSON.parse(sent.options.body).ttl, 1320); // Remaining 20 minutes + 2-minute allowance.
  assert.equal(a.iceTransportPolicy, 'all'); assert.equal(a.turnEnabled, true);
  assert.equal(a.iceServers[1].urls.length, 2);
  assert.ok(!JSON.stringify(a).includes('must-not-reach-browser'));
  assert.ok(!JSON.stringify(a).includes('fixture-secret'));
  await service.configuration(ro, 'ISS1'); assert.equal(calls, 2); // Separate credentials for each participant.
  for (const actor of [null, { id:'S2', role:'Student' }, { id:'R2', role:'RO' }, { id:'M1', role:'Mentor' }]) {
    await assert.rejects(service.configuration(actor, 'ISS1'), error => [401,403].includes(error.status));
  }
  assert.equal(calls, 2);
});

test('closed, expired, unstarted and changed meetings never release relay credentials', async () => {
  for (const row of [{ ...live(), server_now: new Date('2026-11-10T10:30:00Z') }, { ...live(), started_at: null }, { ...live(), issue_status: 'Resolved' }, { ...live(), issue_status: 'Escalated' }]) {
    const service = createMeetingIceService({ query: fixtureQuery(row), env, now: () => clock, fetchImpl: () => { throw new Error('Provider must not be called'); } });
    await assert.rejects(service.configuration(student,'ISS1'), error => error.code === 'MEETING_ENDED');
  }
  let reads = 0;
  const service = createMeetingIceService({ query: fixtureQuery(() => ++reads === 1 ? live() : { ...live(), id: 'M2' }), env,
    now: () => clock, fetchImpl: async () => providerResponse() });
  await assert.rejects(service.configuration(student,'ISS1'), error => error.code === 'MEETING_ENDED');
});

test('production, incomplete credentials and force-relay tests fail clearly; development direct mode is explicit', async () => {
  for (const settings of [{ NODE_ENV:'production' }, { TURN_PROVIDER:'cloudflare' }, { TURN_PROVIDER:'unknown' }, { TURN_FORCE_RELAY:'1' }]) {
    const service = createMeetingIceService({ query: fixtureQuery(live), env: settings });
    await assert.rejects(service.configuration(student, 'ISS1'), error => error.status === 503);
  }
  const direct = await createMeetingIceService({ query: fixtureQuery(live), env: {} }).configuration(student, 'ISS1');
  assert.equal(direct.turnEnabled, false); assert.ok(direct.warning);
  const relay = await createMeetingIceService({ query: fixtureQuery(live), env: { ...env, TURN_FORCE_RELAY:'1' }, now: () => clock,
    fetchImpl: async () => providerResponse() }).configuration(student, 'ISS1');
  assert.equal(relay.iceTransportPolicy, 'relay');
});

test('provider errors expose no tokens and can be retried', async () => {
  let succeed = false;
  const service = createMeetingIceService({ query: fixtureQuery(live), env, now: () => clock, fetchImpl: async () => {
    if (!succeed) throw new Error('fixture-secret must not be exposed');
    return providerResponse();
  } });
  await assert.rejects(service.configuration(student,'ISS1'), error => error.status === 503 && !error.message.includes('fixture-secret'));
  succeed = true;
  assert.equal((await service.configuration(student,'ISS1')).turnEnabled, true);
});

test('explicit STUN-only mode works without provider access and preserves meeting restrictions', async () => {
  for (const NODE_ENV of ['development', 'production']) {
    const service = createMeetingIceService({ query: fixtureQuery(live), env: { ...env, TURN_PROVIDER: 'stun', NODE_ENV },
      fetchImpl: () => { throw new Error('STUN-only mode must not contact a TURN provider'); } });
    const settings = await service.configuration(student, 'ISS1');
    assert.equal(settings.turnEnabled, false);
    assert.equal(settings.iceTransportPolicy, 'all');
    assert.ok(settings.iceServers.every(server => server.urls.startsWith('stun:')));
    assert.match(settings.warning, /some networks/);
    assert.equal(settings.meeting.endsAt, '2026-11-10T10:30:00.000Z');
    await assert.rejects(service.configuration({ id: 'S2', role: 'Student' }, 'ISS1'), error => error.status === 403);
    await assert.rejects(service.configuration(student, 'NOT-LIVE'), error => error.code === 'MEETING_ENDED');
  }
  const expired = createMeetingIceService({ query: fixtureQuery({ ...live(), server_now: new Date('2026-11-10T10:30:00Z') }),
    env: { TURN_PROVIDER: 'stun' } });
  await assert.rejects(expired.configuration(student, 'ISS1'), error => error.code === 'MEETING_ENDED');
  const forced = createMeetingIceService({ query: fixtureQuery(live), env: { TURN_PROVIDER: 'stun', TURN_FORCE_RELAY: '1' } });
  await assert.rejects(forced.configuration(student, 'ISS1'), error => error.status === 503);
});

test('the authenticated ICE endpoint enforces ownership/roles and returns non-cacheable responses', async t => {
  const query = fixtureQuery(live);
  const app = express();
  // Fixture identity only. Production uses the existing verified session middleware.
  app.use((req,_res,next) => { const id=req.get('X-Fixture-Id'); req.user=id ? { id, role:req.get('X-Fixture-Role') } : null; next(); });
  app.use('/api',createAccessPolicy(query).middleware);
  app.use('/api',createMeetingIceRouter({ query, env, now: () => clock, fetchImpl: async () => providerResponse() }));
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/api/meetings/ISS1/ice`;
  for (const [actor,status] of [[null,401],[{id:'S2',role:'Student'},403],[{id:'M1',role:'Mentor'},403],[student,200],[ro,200]]) {
    const response = await fetch(url,{ headers: actor ? {'X-Fixture-Id':actor.id,'X-Fixture-Role':actor.role} : {} });
    assert.equal(response.status,status);
    if (status === 200) { assert.match(response.headers.get('Cache-Control'),/no-store/); assert.equal((await response.json()).turnEnabled,true); }
  }
});
