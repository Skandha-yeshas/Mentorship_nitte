import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCategoryGuidance, getCategoryVideoUpdate } from './categoryGuidance.js';

const category = 'Academic - Course Enrollment issues';
const otherCategory = 'Academic - Attendance shortage clarification';
const parent = { category: 'Academic', videoUrl: 'https://www.youtube.com/watch?v=parentvideo' };
const specific = { category, videoUrl: 'https://www.youtube.com/watch?v=specificvid' };

test('a specific no-video setting suppresses both old and department fallback videos', () => {
  const unavailable = { category, video_url: '' };
  const result = resolveCategoryGuidance(category, [parent, unavailable]);
  assert.equal(result.record, unavailable);
  assert.equal(result.available, false);
  assert.equal(result.videoUrl, '');
});

test('No Video Available is persisted as an explicit empty category URL and survives reload', () => {
  const update = getCategoryVideoUpdate({ videoUrl: specific.videoUrl, noVideo: true });
  assert.deepEqual(update, { videoUrl: '', noVideo: true });
  // Database records store the URL; availability must survive even without the client flags.
  const reloaded = JSON.parse(JSON.stringify({ category, video_url: update.videoUrl }));
  assert.equal(resolveCategoryGuidance(category, [parent, reloaded]).available, false);
});

test('disabling one issue category does not affect sibling categories', () => {
  const videos = [parent, { category, video_url: '' }, { category: otherCategory, videoUrl: 'https://youtu.be/other-video' }];
  assert.equal(resolveCategoryGuidance(category, videos).available, false);
  assert.equal(resolveCategoryGuidance(otherCategory, videos).videoUrl, 'https://youtu.be/other-video');
});

test('an available category uses its configured video rather than a fixed sample', () => {
  const result = resolveCategoryGuidance(category, [parent, specific]);
  assert.equal(result.videoUrl, specific.videoUrl);
  assert.equal(result.available, true);
});

test('a URL can be added later to restore video playback for the disabled category', () => {
  const restored = getCategoryVideoUpdate({ videoUrl: ' https://youtu.be/new-video ', noVideo: false });
  assert.equal(resolveCategoryGuidance(category, [{ category, video_url: restored.videoUrl }]).videoUrl, 'https://youtu.be/new-video');
  assert.equal(restored.noVideo, false);
});

test('no-video flags override a stale URL in an open or cached UI', () => {
  assert.equal(resolveCategoryGuidance(category, [{ ...specific, noVideo: true }]).available, false);
  assert.equal(resolveCategoryGuidance(category, [{ ...specific, videoAvailable: false }]).available, false);
});

test('an explicit camelCase empty URL takes precedence over a stale database alias', () => {
  assert.equal(resolveCategoryGuidance(category, [{ category, videoUrl: '', video_url: specific.videoUrl }, parent]).available, false);
});

test('an unconfigured category may inherit its department guidance but never a sibling issue video', () => {
  assert.equal(resolveCategoryGuidance(category, [parent]).videoUrl, parent.videoUrl);
  assert.equal(resolveCategoryGuidance(category, [{ category: otherCategory, videoUrl: specific.videoUrl }]).available, false);
});

test('support-desk fallback respects an exact no-video override', () => {
  const videos = [{ category: 'Academic Support Desk', video_url: parent.videoUrl }];
  assert.equal(resolveCategoryGuidance(category, videos).available, true);
  assert.equal(resolveCategoryGuidance(category, [...videos, { category, video_url: '' }]).available, false);
});

test('lookup handles case and whitespace consistently between RO and student dashboards', () => {
  const record = { category: ' academic - course enrollment issues ', video_url: '' };
  assert.equal(resolveCategoryGuidance(' ACADEMIC - COURSE ENROLLMENT ISSUES ', [parent, record]).available, false);
});

test('no setting or missing video means no playback, without manufacturing a URL', () => {
  assert.deepEqual(resolveCategoryGuidance(category, []), { record: null, videoUrl: '', available: false });
  assert.equal(resolveCategoryGuidance('', [parent]).available, false);
  assert.equal(resolveCategoryGuidance(category, [{ category, title: 'No video' }]).available, false);
});

test('saving an empty video requires an explicit No Video Available choice', () => {
  assert.throws(() => getCategoryVideoUpdate({ videoUrl: ' ' }), /select No Video Available/);
  assert.deepEqual(getCategoryVideoUpdate({ noVideo: true }), { videoUrl: '', noVideo: true });
  assert.deepEqual(getCategoryVideoUpdate({ video_url: specific.videoUrl }), { videoUrl: specific.videoUrl, noVideo: false });
});
