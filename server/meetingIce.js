import express from 'express';
import { DIRECT_ICE_SERVERS, hasTurnServer, sanitizeIceServers } from '../shared/meetingIce.js';
import { getOnlineMeetingDeadline } from '../shared/meetingDuration.js';

const fail = (message, status = 503, code = 'TURN_UNAVAILABLE') => Object.assign(new Error(message), { status, code });
const same = (a, b) => String(a || '').toUpperCase() === String(b || '').toUpperCase();

export async function mintCloudflareTurnCredentials({ keyId, token, ttl, fetchImpl = globalThis.fetch }) {
  try {
    const response = await fetchImpl(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl }), signal: AbortSignal.timeout(8000), redirect: 'error'
    });
    if (!response.ok) throw new Error('Provider rejected credential request');
    const iceServers = sanitizeIceServers((await response.json()).iceServers);
    if (!hasTurnServer(iceServers)) throw new Error('Provider returned no usable relay');
    return iceServers;
  } catch {
    throw fail('The call relay is temporarily unavailable. Please retry the connection.');
  }
}

export function createMeetingIceService({ query, env = process.env, fetchImpl = globalThis.fetch, now = Date.now }) {
  const cache = new Map();
  const pending = new Map();

  async function liveMeeting(actor, issueId) {
    if (!actor) throw fail('Please sign in.', 401, 'SIGN_IN_REQUIRED');
    if (!['Student', 'RO', 'Admin'].includes(actor.role)) throw fail('Only meeting participants can request a call connection.', 403, 'FORBIDDEN');
    const row = (await query(`SELECT m.id, m.started_at, m.mode, m.is_admin_hearing,
      i.student_id, i.ro_id, i.status AS issue_status, CURRENT_TIMESTAMP AS server_now
      FROM meetings m JOIN issues i ON i.id = m.issue_id
      WHERE UPPER(i.id) = UPPER($1) AND m.status = 'Started'
        AND LOWER(COALESCE(m.mode, 'Online')) = 'online' AND m.ended_at IS NULL AND NOT m.ended_by_ro
      ORDER BY m.started_at DESC NULLS LAST, m.id LIMIT 1`, [issueId])).rows[0];
    if (!row) throw fail('This meeting is not live.', 409, 'MEETING_ENDED');
    if (actor.role === 'Student' && !same(actor.id, row.student_id) ||
      actor.role === 'RO' && (!same(actor.id, row.ro_id) || row.is_admin_hearing)) {
      throw fail('This meeting is not assigned to you.', 403, 'FORBIDDEN');
    }
    const serverNow = new Date(row.server_now).getTime();
    const deadline = getOnlineMeetingDeadline(row);
    if (deadline === null || !Number.isFinite(serverNow) || serverNow >= deadline || ['Resolved', 'Closed'].includes(row.issue_status) ||
      (actor.role !== 'Admin' && ['Escalated', 'Re-escalated'].includes(row.issue_status) && !row.is_admin_hearing)) {
      throw fail('This meeting has ended.', 409, 'MEETING_ENDED');
    }
    return { ...row, deadline, serverNow };
  }

  async function configuration(actor, issueId) {
    const meeting = await liveMeeting(actor, issueId);
    const provider = String(env.TURN_PROVIDER || 'none').trim().toLowerCase();
    if (provider === 'none' || provider === 'stun') {
      // STUN-only operation is an explicit choice until TURN is activated at handover.
      if (provider === 'none' && env.NODE_ENV === 'production' || env.TURN_FORCE_RELAY === '1') throw fail('Online call connectivity is not configured. Please contact your administrator.');
      return { iceServers: DIRECT_ICE_SERVERS, iceTransportPolicy: 'all', turnEnabled: false,
        warning: 'Calls may not connect on some networks until relay setup is completed.',
        meeting: { endsAt: new Date(meeting.deadline).toISOString() }, now: meeting.serverNow };
    }
    const keyId = String(env.CLOUDFLARE_TURN_KEY_ID || '').trim();
    const token = String(env.CLOUDFLARE_TURN_API_TOKEN || '').trim();
    if (provider !== 'cloudflare' || !keyId || !token) throw fail('Online call connectivity is not configured. Please contact your administrator.');
    const cacheKey = `${actor.role}:${actor.id}:${meeting.id}:${new Date(meeting.started_at).toISOString()}`;
    for (const [key, value] of cache) if (value.expiresAt <= now() + 60000) cache.delete(key);
    let result = cache.get(cacheKey);
    if (!result) {
      if (!pending.has(cacheKey)) {
        const ttl = Math.max(1, Math.min(1920, Math.ceil((meeting.deadline - meeting.serverNow) / 1000) + 120));
        const mintedAt = now();
        const work = (async () => {
          try {
            const iceServers = await mintCloudflareTurnCredentials({ keyId, token, ttl, fetchImpl });
            const value = { iceServers, expiresAt: mintedAt + ttl * 1000 };
            if (cache.size >= 500) cache.delete(cache.keys().next().value);
            cache.set(cacheKey, value);
            return value;
          } catch {
            // Provider responses can contain credentials: return only a safe error.
            throw fail('The call relay is temporarily unavailable. Please retry the connection.');
          }
        })();
        pending.set(cacheKey, work);
      }
      const work = pending.get(cacheKey);
      try { result = await work; }
      finally { if (pending.get(cacheKey) === work) pending.delete(cacheKey); }
    }
    // Do not release newly minted credentials if the RO ended/rescheduled the call
    // while the provider request was in flight.
    const current = await liveMeeting(actor, issueId);
    if (current.id !== meeting.id || new Date(current.started_at).getTime() !== new Date(meeting.started_at).getTime()) {
      throw fail('The meeting changed. Please rejoin the current meeting.', 409, 'MEETING_ENDED');
    }
    return { iceServers: result.iceServers, iceTransportPolicy: env.TURN_FORCE_RELAY === '1' ? 'relay' : 'all', turnEnabled: true,
      expiresAt: new Date(result.expiresAt).toISOString(),
      meeting: { endsAt: new Date(current.deadline).toISOString() }, now: current.serverNow };
  }
  return { configuration };
}

export function createMeetingIceRouter(dependencies) {
  const service = createMeetingIceService(dependencies);
  const router = express.Router();
  router.get('/meetings/:issueId/ice', async (req, res) => {
    res.set('Cache-Control', 'private, no-store');
    const started = performance.now();
    try {
      const result = await service.configuration(req.user, req.params.issueId);
      res.json({ ...result, serverProcessingMs: performance.now() - started });
    }
    catch (error) { res.status(error.status || 503).json({ error: error.status ? error.message : 'The call connection is temporarily unavailable.', code: error.code || 'TURN_UNAVAILABLE' }); }
  });
  return router;
}
