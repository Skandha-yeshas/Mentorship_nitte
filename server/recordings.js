import express from 'express';
import { randomUUID } from 'node:crypto';
import { MAX_RECORDING_BYTES, recordingDuration, recordingExtension } from '../shared/meetingRecordings.js';

const normalized = value => String(value || '').trim().toUpperCase();
const columns = 'id, meeting_id, issue_id, ro_id, mime_type, byte_size, duration_seconds, transcript_summary, recorded_at';
const errorWithStatus = (message, status) => Object.assign(new Error(message), { status });

export function recordingMetadata(row) {
  return {
    id: row.id, meetingId: row.meeting_id, issueId: row.issue_id, roId: row.ro_id,
    mimeType: row.mime_type, byteSize: Number(row.byte_size), duration: row.duration_seconds,
    durationText: recordingDuration(row.duration_seconds), transcriptSummary: row.transcript_summary || '',
    recordedAt: new Date(row.recorded_at).toISOString(), mode: 'Online Video Call',
    videoUrl: `/api/recordings/${encodeURIComponent(row.id)}/media`, storageStatus: 'stored'
  };
}

export function validateRecordingBytes(bytes, mimeType) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) throw errorWithStatus('The recording is empty or incomplete. Please retry using the original recording file.', 400);
  if (bytes.length > MAX_RECORDING_BYTES) throw errorWithStatus('Recording exceeds the 256 MB upload limit.', 413);
  const type = String(mimeType || '').split(';')[0].trim().toLowerCase();
  const webm = bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  const mp4 = bytes.toString('ascii', 4, 8) === 'ftyp';
  if (!((type === 'video/webm' && webm) || (type === 'video/mp4' && mp4))) throw errorWithStatus('Recording format does not match its video data.', 415);
  return type;
}

export function parseRecordingRange(value, size) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) throw errorWithStatus('Invalid recording byte range.', 416);
  let start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  let end = match[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) throw errorWithStatus('Recording byte range is outside the file.', 416);
  return { start, end, length: end - start + 1 };
}

export function createRecordingRepository(query) {
  async function find(id, actor) {
    const result = await query(`SELECT ${columns} FROM meeting_recordings WHERE id = $1 AND ($2 = 'Admin' OR UPPER(ro_id) = UPPER($3))`, [id, actor.role, actor.id]);
    return result.rows[0] || null;
  }
  return {
    find,
    async list(actor) {
      const result = await query(`SELECT ${columns} FROM meeting_recordings WHERE $1 = 'Admin' OR UPPER(ro_id) = UPPER($2) ORDER BY recorded_at DESC`, [actor.role, actor.id]);
      return result.rows;
    },
    async save({ id, meetingId, issueId, durationSeconds, transcriptSummary, bytes, mimeType }, actor) {
      const type = validateRecordingBytes(bytes, mimeType);
      if (!issueId || !meetingId || String(issueId).length > 50 || String(meetingId).length > 100) throw errorWithStatus('A valid issue and meeting are required for the recording.', 400);
      const duration = Math.max(1, Math.round(Number(durationSeconds) || 1));
      if (!Number.isSafeInteger(duration) || duration > 24 * 60 * 60) throw errorWithStatus('Invalid recording duration.', 400);
      const issue = await query('SELECT id, ro_id FROM issues WHERE UPPER(id) = UPPER($1)', [issueId]);
      const owner = issue.rows[0];
      if (!owner || (actor.role !== 'Admin' && normalized(owner.ro_id) !== normalized(actor.id))) throw errorWithStatus('This issue is not assigned to you.', 403);
      const meeting = await query('SELECT issue_id FROM meetings WHERE id = $1', [meetingId]);
      if (meeting.rows[0] && normalized(meeting.rows[0].issue_id) !== normalized(owner.id)) throw errorWithStatus('The recording meeting belongs to a different issue.', 400);
      const recordingId = id || `REC-${randomUUID()}`;
      if (!/^REC-[a-f0-9-]{36}$/i.test(recordingId)) throw errorWithStatus('Invalid recording ID.', 400);
      const result = await query(`INSERT INTO meeting_recordings
        (id, meeting_id, issue_id, ro_id, mime_type, byte_size, duration_seconds, transcript_summary, media_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING RETURNING ${columns}`,
      [recordingId, meetingId, owner.id, owner.ro_id || actor.id, type, bytes.length, duration, String(transcriptSummary || '').slice(0, 10000), bytes]);
      if (result.rows[0]) return { row: result.rows[0], created: true };
      const existing = await find(recordingId, actor);
      if (!existing || normalized(existing.issue_id) !== normalized(owner.id) || Number(existing.byte_size) !== bytes.length) throw errorWithStatus('This recording ID is already in use.', 409);
      return { row: existing, created: false };
    },
    async readBytes(id, range) {
      const result = range
        ? await query('SELECT substring(media_data FROM $2::integer FOR $3::integer) AS data FROM meeting_recordings WHERE id = $1', [id, range.start + 1, range.length])
        : await query('SELECT media_data AS data FROM meeting_recordings WHERE id = $1', [id]);
      return result.rows[0]?.data;
    }
  };
}

export function createRecordingsRouter({ repository, auth, onSaved = async () => {} }) {
  const router = express.Router();
  router.delete('/session', (req, res) => auth.revoke(req, res));
  router.use((req, res, next) => auth.require(req, res, next));
  router.get('/session', (req, res) => res.set('Cache-Control', 'no-store').json({ user: req.recordingUser }));
  router.get('/', async (req, res, next) => {
    try { res.set('Cache-Control', 'private, no-store').json((await repository.list(req.recordingUser)).map(recordingMetadata)); }
    catch (error) { next(error); }
  });
  router.post('/', express.raw({ type: '*/*', limit: MAX_RECORDING_BYTES }), async (req, res, next) => {
    try {
      const result = await repository.save({
        id: req.get('X-Recording-ID'), issueId: req.query.issueId, meetingId: req.query.meetingId,
        durationSeconds: req.query.durationSeconds, transcriptSummary: req.query.summary,
        bytes: req.body, mimeType: req.get('Content-Type')
      }, req.recordingUser);
      if (result.created) await onSaved(result.row).catch(error => console.warn('[Recordings] Activity log update:', error.message));
      res.status(result.created ? 201 : 200).json(recordingMetadata(result.row));
    } catch (error) { next(error); }
  });
  router.get('/:id/media', async (req, res, next) => {
    try {
      const row = await repository.find(req.params.id, req.recordingUser);
      if (!row) return res.status(404).json({ error: 'Recording not found.' });
      const size = Number(row.byte_size);
      let range;
      try { range = parseRecordingRange(req.get('Range'), size); }
      catch (error) { res.set('Content-Range', `bytes */${size}`); throw error; }
      const safeIssueId = String(row.issue_id).replace(/[^a-z0-9_-]/gi, '');
      res.set({
        'Content-Type': row.mime_type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store',
        'Content-Length': String(range ? range.length : size), 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="recording-${safeIssueId}.${recordingExtension(row.mime_type)}"`
      });
      if (range) res.status(206).set('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
      if (req.method === 'HEAD') return res.end();
      const bytes = await repository.readBytes(row.id, range);
      if (!bytes) return res.status(404).end();
      res.end(bytes);
    } catch (error) { next(error); }
  });
  router.get('/:id', async (req, res, next) => {
    try {
      const row = await repository.find(req.params.id, req.recordingUser);
      if (!row) return res.status(404).json({ error: 'Recording not found.' });
      res.set('Cache-Control', 'private, no-store').json(recordingMetadata(row));
    } catch (error) { next(error); }
  });
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.type === 'entity.too.large' ? 413 : error.status || 500;
    if (status >= 500) console.error('[Recordings]', error.message);
    res.status(status).json({ error: status >= 500 ? 'Recording storage is temporarily unavailable. Keep the recording and retry the upload.' : error.message });
  });
  return router;
}
