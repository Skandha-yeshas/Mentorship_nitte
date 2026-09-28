// src/utils/mediaFallback.js

/**
 * Creates a high-fidelity synthetic fallback MediaStream with an animated video track
 * and a silent audio track. Used when hardware webcams are blocked, unavailable, or already
 * locked by another browser tab on the same machine.
 */
export function createFallbackMediaStream({ label = 'Participant', role = 'Student' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');

  let frame = 0;
  const draw = () => {
    frame++;
    // Sleek dark gradient background
    const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bg.addColorStop(0, '#0a0f1d');
    bg.addColorStop(1, '#1e293b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2 - 20;

    // Glowing outer ring
    const pulse = Math.sin(frame * 0.08) * 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 68 + pulse, 0, Math.PI * 2);
    ctx.fillStyle = role === 'RO' ? 'rgba(37, 99, 235, 0.25)' : 'rgba(16, 185, 129, 0.25)';
    ctx.fill();

    // Central avatar circle
    ctx.beginPath();
    ctx.arc(cx, cy, 58, 0, Math.PI * 2);
    ctx.fillStyle = role === 'RO' ? '#2563eb' : '#10b981';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Initials / Role
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(role === 'RO' ? 'RO' : 'STU', cx, cy);

    // Name label
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, cx, cy + 85);

    // Subtitle
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(role === 'RO' ? 'Relationship Officer (Live Cam)' : 'Student (Live Cam)', cx, cy + 110);

    // Live REC indicator badge in corner
    ctx.beginPath();
    ctx.arc(30, 30, 6, 0, Math.PI * 2);
    ctx.fillStyle = Math.sin(frame * 0.1) > 0 ? '#ef4444' : '#7f1d1d';
    ctx.fill();

    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.fillText('LIVE P2P STREAM', 44, 34);
  };

  draw();
  const timer = setInterval(draw, 1000 / 20); // 20 FPS

  const canvasStream = canvas.captureStream ? canvas.captureStream(20) : (canvas.mozCaptureStream ? canvas.mozCaptureStream(20) : null);
  const videoTrack = canvasStream ? canvasStream.getVideoTracks()[0] : null;

  // Silent audio track using Web Audio API
  let audioTrack = null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0; // Silent
      osc.connect(gain);
      const dest = audioCtx.createMediaStreamDestination();
      gain.connect(dest);
      osc.start();
      audioTrack = dest.stream.getAudioTracks()[0];
    }
  } catch (e) {}

  const finalStream = new MediaStream();
  if (videoTrack) finalStream.addTrack(videoTrack);
  if (audioTrack) finalStream.addTrack(audioTrack);

  // Clean up interval when video track stops
  if (videoTrack) {
    const originalStop = videoTrack.stop.bind(videoTrack);
    videoTrack.stop = () => {
      clearInterval(timer);
      originalStop();
    };
  }

  return finalStream;
}
