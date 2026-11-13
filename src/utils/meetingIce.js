import { apiFetch } from './apiFetch.js';
import { hasTurnServer, sanitizeIceServers } from '../../shared/meetingIce.js';

export async function loadMeetingIceConfiguration(issueId, { signal, fetchImpl = apiFetch } = {}) {
  const response = await fetchImpl(`/api/meetings/${encodeURIComponent(issueId)}/ice`, { cache: 'no-store', signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'The call connection could not be prepared. Please retry.'), { code: data.code });
  const iceServers = sanitizeIceServers(data.iceServers);
  if (!iceServers.length || data.turnEnabled && !hasTurnServer(iceServers) || data.iceTransportPolicy === 'relay' && !hasTurnServer(iceServers)) {
    throw new Error('The call connection is not configured correctly. Please contact your administrator.');
  }
  return { ...data, configuration: { iceServers, iceTransportPolicy: data.iceTransportPolicy === 'relay' ? 'relay' : 'all', iceCandidatePoolSize: 2 } };
}
