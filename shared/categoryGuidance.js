const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

export function resolveCategoryGuidance(category, videos = []) {
  const target = normalize(category);
  const list = Array.isArray(videos) ? videos : [];
  let record = target ? list.find(video => normalize(video.category) === target) : null;
  if (!record && target) {
    const department = target.split(' - ')[0].replace(/ support desk$/, '');
    record = list.find(video => normalize(video.category) === department) ||
      list.find(video => normalize(video.category) === `${department} support desk`);
  }
  // An exact empty record is an explicit choice, so never replace it with a generic video.
  const url = record?.noVideo === true || record?.videoAvailable === false
    ? '' : String(record?.videoUrl ?? record?.video_url ?? '').trim();
  return { record: record || null, videoUrl: url, available: Boolean(url) };
}

export function getCategoryVideoUpdate({ videoUrl, video_url, noVideo = false }) {
  const unavailable = noVideo === true;
  const url = unavailable ? '' : String(videoUrl ?? video_url ?? '').trim();
  if (!unavailable && !url) throw new Error('Enter a video URL or select No Video Available.');
  return { videoUrl: url, noVideo: unavailable };
}
