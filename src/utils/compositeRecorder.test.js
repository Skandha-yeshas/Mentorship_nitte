import test from 'node:test';
import assert from 'node:assert/strict';
import { CompositeMeetingRecorder } from './compositeRecorder.js';

test('recorder waits beyond the former 400ms timeout for the last video chunk and then releases resources', async () => {
  const recorder = new CompositeMeetingRecorder({});
  let trackStopped = false;
  recorder.captureStream = { getTracks: () => [{ stop() { trackStopped = true; } }] };
  recorder.recordedChunks = [new Blob(['first-frame-data'])];
  recorder.mediaRecorder = {
    state: 'recording', mimeType: 'video/webm;codecs=vp8,opus',
    stop() {
      setTimeout(() => {
        assert.equal(trackStopped, false);
        recorder.recordedChunks.push(new Blob(['last-frame-data']));
        this.state = 'inactive';
        this.onstop();
      }, 650);
    }
  };
  const completion = recorder.stop();
  assert.equal(recorder.stop(), completion);
  const result = await completion;
  assert.equal(await result.blob.text(), 'first-frame-datalast-frame-data');
  assert.equal(result.blob.type, 'video/webm;codecs=vp8,opus');
  assert.equal(trackStopped, true);
});

test('recorder rejects an empty capture instead of producing a placeholder link', async () => {
  const recorder = new CompositeMeetingRecorder({});
  recorder.mediaRecorder = { state: 'inactive', mimeType: 'video/webm' };
  await assert.rejects(recorder.stop(), /recording is empty/);
});
