import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMeetingIceConfiguration } from './meetingIce.js';

test('the browser loads authenticated per-issue relay configuration without persisting provider secrets', async () => {
  let requested;
  const settings = await loadMeetingIceConfiguration('ISS/A', { fetchImpl: async (url, options) => {
    requested = { url, options };
    return { ok:true, json:async () => ({ turnEnabled:true, iceTransportPolicy:'relay',
      iceServers:[{urls:'turns:relay.example:443?transport=tcp',username:'temporary',credential:'temporary-secret'}] }) };
  } });
  assert.equal(requested.url,'/api/meetings/ISS%2FA/ice'); assert.equal(requested.options.cache,'no-store');
  assert.equal(settings.configuration.iceTransportPolicy,'relay');
  assert.equal(settings.configuration.iceServers[0].credential,'temporary-secret');
});

test('invalid provider responses and expired meetings are not silently treated as successful direct calls', async () => {
  for (const data of [{}, {turnEnabled:true,iceServers:[{urls:'stun:host:3478'}]}, {turnEnabled:true,iceServers:[{urls:'turn:host:3478'}]}]) {
    await assert.rejects(loadMeetingIceConfiguration('ISS1',{fetchImpl:async () => ({ok:true,json:async () => data})}),/not configured/);
  }
  await assert.rejects(loadMeetingIceConfiguration('ISS1',{fetchImpl:async () => ({ok:false,json:async () => ({error:'Meeting ended',code:'MEETING_ENDED'})})}),
    error => error.code === 'MEETING_ENDED');
});
