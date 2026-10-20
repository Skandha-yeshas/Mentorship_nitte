// src/utils/mediaFallback.js

/**
 * Creates a high-fidelity synthetic fallback MediaStream with an animated 16:9 widescreen video track
 * and an active audio track. Used when hardware webcams are blocked, unavailable, or already
 * locked by another browser tab on the same machine.
 */
export function createFallbackMediaStream({ label = 'Participant', role = 'Student' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;

  // Mount canvas in DOM so Chromium compositor treats it as active viewport element for captureStream
  canvas.style.position = 'fixed';
  canvas.style.bottom = '0px';
  canvas.style.right = '0px';
  canvas.style.width = '1px';
  canvas.style.height = '1px';
  canvas.style.opacity = '0.01';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '99999';
  if (typeof document !== 'undefined' && document.body) {
    try {
      document.body.appendChild(canvas);
    } catch (e) {}
  }

  const ctx = canvas.getContext('2d');
  let frame = 0;

  const canvasStream = canvas.captureStream ? canvas.captureStream(25) : (canvas.mozCaptureStream ? canvas.mozCaptureStream(25) : null);
  const videoTrack = canvasStream ? canvasStream.getVideoTracks()[0] : null;

  const draw = () => {
    if (!ctx) return;
    frame++;

    // Sleek dark gradient background
    const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    bg.addColorStop(0, '#0a0f1d');
    bg.addColorStop(0.5, '#0f172a');
    bg.addColorStop(1, '#1e293b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2 - 30;

    // Glowing outer radar rings
    const pulse = Math.sin(frame * 0.08) * 14;
    ctx.beginPath();
    ctx.arc(cx, cy, 110 + pulse, 0, Math.PI * 2);
    ctx.fillStyle = role === 'RO' ? 'rgba(37, 99, 235, 0.2)' : 'rgba(16, 185, 129, 0.2)';
    ctx.fill();

    // Secondary pulse ring
    const pulse2 = Math.cos(frame * 0.08) * 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 95 + pulse2, 0, Math.PI * 2);
    ctx.fillStyle = role === 'RO' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(52, 211, 153, 0.3)';
    ctx.fill();

    // Central avatar circle
    ctx.beginPath();
    ctx.arc(cx, cy, 80, 0, Math.PI * 2);
    ctx.fillStyle = role === 'RO' ? '#2563eb' : '#10b981';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Initials / Role
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 46px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(role === 'RO' ? 'RO' : 'STU', cx, cy);

    // Name label
    ctx.font = 'bold 26px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, cx, cy + 125);

    // Subtitle
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(role === 'RO' ? 'Relationship Officer (Virtual HD Feed)' : 'Student (Virtual HD Feed)', cx, cy + 160);

    // Live REC indicator badge in top-left corner
    ctx.beginPath();
    ctx.arc(46, 46, 8, 0, Math.PI * 2);
    ctx.fillStyle = Math.sin(frame * 0.1) > 0 ? '#ef4444' : '#7f1d1d';
    ctx.fill();

    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.fillText('LIVE 16:9 HD P2P STREAM', 64, 52);

    // Room encryption badge in top-right corner
    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText('NITTE WebRTC Secure Bridge', canvas.width - 40, 52);

    // Actively dispatch frame to captureStream
    if (canvasStream && typeof canvasStream.requestFrame === 'function') {
      try { canvasStream.requestFrame(); } catch (e) {}
    }
  };

  draw();
  const timer = setInterval(draw, 1000 / 25); // 25 FPS rock-solid

  // Audio track using Web Audio API
  let audioTrack = null;
  let audioCtx = null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      gain.gain.value = 0; // Silent audio pipeline to avoid acoustic feedback
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

  // Clean up interval and DOM canvas when video track stops
  if (videoTrack) {
    const originalStop = videoTrack.stop.bind(videoTrack);
    videoTrack.stop = () => {
      clearInterval(timer);
      if (canvas && canvas.parentNode) {
        try { canvas.parentNode.removeChild(canvas); } catch (e) {}
      }
      if (audioCtx) {
        try { audioCtx.close(); } catch (e) {}
      }
      originalStop();
    };
  }

  return finalStream;
}
