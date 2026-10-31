import { MAX_RECORDING_BYTES } from '../../shared/meetingRecordings.js';
import { apiFetch as fetch } from './apiFetch.js';

export function createRecordingApi({ getActor, fetchImpl = (...args) => fetch(...args) }) {
  let authenticatedKey = '';
  const actorKey = actor => `${actor?.role}:${actor?.id}`;
  async function signIn(actor) {
    if (!['RO', 'Admin'].includes(actor?.role) || !actor?.id || !actor?.password) throw new Error('Sign in again as an RO or Admin to access meeting recordings.');
    const response = await fetchImpl('/api/auth/login', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: actor.id, password: actor.password, role: actor.role })
    });
    if (!response.ok) throw new Error('Could not authenticate recording access. Please sign in again.');
    const result = await response.json();
    if (result.user?.role !== actor.role || String(result.user?.id).toUpperCase() !== String(actor.id).toUpperCase()) throw new Error('Recording access did not match the signed-in account.');
    authenticatedKey = actorKey(actor);
  }
  async function ensureAccess() {
    const actor = getActor();
    if (!['RO', 'Admin'].includes(actor?.role) || !actor?.id) throw new Error('Only an RO or Admin can access meeting recordings.');
    if (authenticatedKey === actorKey(actor)) return;
    const response = await fetchImpl('/api/recordings/session', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Your session expired. Sign in again to access recordings.');
    const session = await response.json();
    if (actorKey(session.user) !== actorKey(actor)) throw new Error('Recording access did not match the signed-in account.');
    authenticatedKey = actorKey(actor);
  }
  async function request(path, options = {}) {
    await ensureAccess();
    const response = await fetchImpl(path, { credentials: 'same-origin', ...options });
    if (response.status === 401) {
      authenticatedKey = '';
      throw new Error('Your session expired. Sign in again to access recordings.');
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Recording request failed (${response.status}).`);
    }
    return response.json();
  }
  return {
    signIn,
    list: () => request('/api/recordings'),
    get: id => request(`/api/recordings/${encodeURIComponent(id)}`),
    async save({ recordingId, meetingId, issueId, durationSeconds, blob, transcriptSummary }) {
      if (!(blob instanceof Blob) || !blob.size) throw new Error('The recorder did not produce a video file. No placeholder recording was saved.');
      if (blob.size > MAX_RECORDING_BYTES) throw new Error('The recording exceeds 256 MB. Download the original file before closing this page.');
      const query = new URLSearchParams({ meetingId, issueId, durationSeconds: String(durationSeconds), summary: transcriptSummary || '' });
      return request(`/api/recordings?${query}`, {
        method: 'POST', headers: { 'Content-Type': blob.type.split(';')[0].trim() || 'video/webm', 'X-Recording-ID': recordingId }, body: blob
      });
    },
    async revoke() {
      authenticatedKey = '';
      await fetchImpl('/api/recordings/session', { method: 'DELETE', credentials: 'same-origin' });
    }
  };
}
