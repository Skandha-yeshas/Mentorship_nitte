export const MAX_RECORDING_BYTES = 256 * 1024 * 1024;

export function recordingExtension(mimeType) {
  return String(mimeType || '').split(';')[0].trim().toLowerCase() === 'video/mp4' ? 'mp4' : 'webm';
}

export function isStoredRecording(recording) {
  return Boolean(recording?.id && recording?.byteSize > 0 && /^\/api\/recordings\/[^/]+\/media$/.test(recording.videoUrl || ''));
}

export function recordingDuration(seconds) {
  const duration = Math.max(1, Math.round(Number(seconds) || 1));
  return `${Math.floor(duration / 60)}m ${duration % 60}s`;
}

export function mergeRecordingArchive(stored, previous = [], actor) {
  const ids = new Set(stored.map(recording => recording.id));
  const legacy = previous.filter(recording => !isStoredRecording(recording) && !ids.has(recording.id)
    && (!actor || actor.role === 'Admin' || String(recording.roId || recording.ro_id || '').toUpperCase() === String(actor.id).toUpperCase()))
    .map(recording => ({ ...recording, videoUrl: '', storageStatus: 'unavailable', storageError: 'The original video file was not stored. Its old browser or placeholder link cannot be played.' }));
  return [...stored, ...legacy];
}
