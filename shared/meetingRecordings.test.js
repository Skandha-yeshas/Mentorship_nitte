import test from 'node:test';
import assert from 'node:assert/strict';
import { isStoredRecording, mergeRecordingArchive, recordingExtension } from './meetingRecordings.js';

test('archive retains real stored files and disables old temporary/placeholder links', () => {
  const stored = { id: 'REC-real', byteSize: 1500, videoUrl: '/api/recordings/REC-real/media' };
  const records = mergeRecordingArchive([stored], [stored, { id: 'REC-old', videoUrl: 'blob:expired' }, { id: 'REC-fake', videoUrl: 'https://fake.invalid/file.mp4' }]);
  assert.equal(records.length, 3);
  assert.equal(isStoredRecording(records[0]), true);
  for (const item of records.slice(1)) {
    assert.equal(item.videoUrl, '');
    assert.equal(item.storageStatus, 'unavailable');
    assert.equal(isStoredRecording(item), false);
  }
  assert.equal(recordingExtension('video/mp4;codecs=avc1'), 'mp4');
  assert.equal(recordingExtension('video/webm;codecs=vp8,opus'), 'webm');
});

test('legacy browser metadata from a different RO does not appear in the current archive', () => {
  const previous = [{ id: 'one', roId: 'RO-1', videoUrl: 'blob:old' }, { id: 'two', roId: 'RO-2', videoUrl: 'blob:old' }, { id: 'unknown', videoUrl: 'blob:old' }];
  assert.deepEqual(mergeRecordingArchive([], previous, { id: 'RO-1', role: 'RO' }).map(recording => recording.id), ['one']);
});
