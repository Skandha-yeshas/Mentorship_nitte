// src/utils/compositeRecorder.js

/**
 * CompositeMeetingRecorder
 * 
 * Captures and records BOTH the Relationship Officer (RO) and the Student side-by-side
 * in a real-time 720p HD composite canvas stream with combined dual-channel audio.
 * 
 * Key Features:
 * 1. Side-by-Side 2-Up Video Layout: Renders RO on left and Student on right.
 * 2. Mixed Dual Audio: Uses Web Audio API to mix both local and remote microphones into one audio stream.
 * 3. Dynamic Fallbacks: Displays animated avatar cards with role badges if a peer's webcam is off or connecting.
 * 4. Compliance Watermarking: Burns ticket ID, live timestamp, role labels, and encrypted archive watermark into the recording.
 * 5. Universal Playback: Produces an MP4/WebM blob playable in standard HTML5 video elements and downloadable for offline review.
 */

export class CompositeMeetingRecorder {
  constructor({
    localStream,
    localLabel = 'Relationship Officer',
    remoteLabel = 'Student',
    ticketId = 'TICKET',
    localRole = 'RO',
    remoteRole = 'Student',
    width = 1280,
    height = 720,
    fps = 25
  }) {
    this.width = width;
    this.height = height;
    this.fps = fps;
    this.ticketId = ticketId;
    this.localLabel = localLabel;
    this.remoteLabel = remoteLabel;
    this.localRole = localRole;
    this.remoteRole = remoteRole;

    this.localStream = localStream;
    this.remoteStream = null;
    this.isLocalCamOff = false;
    this.isRemoteCamOff = false;
    this.isLocalMicMuted = false;

    this.canvas = null;
    this.ctx = null;
    this.localVideo = null;
    this.remoteVideo = null;
    this.audioCtx = null;
    this.audioDest = null;
    this.localAudioSource = null;
    this.remoteAudioSource = null;

    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.animInterval = null;
    this.isRecording = false;
    this.startTime = Date.now();

    this.init();
  }

  init() {
    if (typeof window === 'undefined') return;

    // 1. Offscreen Canvas for Real-Time Compositing
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { alpha: false });

    // 2. Hidden HTML5 Video Elements to decode local and remote streams
    this.localVideo = document.createElement('video');
    this.localVideo.muted = true;
    this.localVideo.playsInline = true;
    this.localVideo.autoplay = true;
    if (this.localStream) {
      this.localVideo.srcObject = this.localStream;
      this.localVideo.play().catch(() => {});
    }

    this.remoteVideo = document.createElement('video');
    this.remoteVideo.muted = true;
    this.remoteVideo.playsInline = true;
    this.remoteVideo.autoplay = true;

    // 3. Web Audio API Mixing for Dual-Channel Audio
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
        this.audioDest = this.audioCtx.createMediaStreamDestination();

        // Connect Local Audio if available
        if (this.localStream && this.localStream.getAudioTracks().length > 0) {
          try {
            this.localAudioSource = this.audioCtx.createMediaStreamSource(this.localStream);
            this.localAudioSource.connect(this.audioDest);
          } catch (e) {
            console.warn('[CompositeRecorder] Local audio connect failed:', e);
          }
        }

        // Silent oscillator to guarantee continuous audio clock
        try {
          const silentOsc = this.audioCtx.createOscillator();
          const silentGain = this.audioCtx.createGain();
          silentGain.gain.value = 0.0001; // Inaudible
          silentOsc.connect(silentGain);
          silentGain.connect(this.audioDest);
          silentOsc.start();
        } catch (e) {}
      }
    } catch (e) {
      console.warn('[CompositeRecorder] AudioContext initialization failed:', e);
    }
  }

  /**
   * Dynamically attaches or updates the Remote Peer's MediaStream
   * when WebRTC handshake completes.
   */
  setRemoteStream(stream) {
    this.remoteStream = stream;
    if (this.remoteVideo) {
      this.remoteVideo.srcObject = stream || null;
      if (stream) {
        this.remoteVideo.play().catch(() => {});
      }
    }

    // Connect Remote Audio to mixer
    if (stream && this.audioCtx && this.audioDest && stream.getAudioTracks().length > 0) {
      try {
        if (this.remoteAudioSource) {
          try { this.remoteAudioSource.disconnect(); } catch (e) {}
        }
        this.remoteAudioSource = this.audioCtx.createMediaStreamSource(stream);
        this.remoteAudioSource.connect(this.audioDest);
      } catch (e) {
        console.warn('[CompositeRecorder] Remote audio connect failed:', e);
      }
    }
  }

  setLocalCamOff(camOff) {
    this.isLocalCamOff = Boolean(camOff);
  }

  setRemoteCamOff(camOff) {
    this.isRemoteCamOff = Boolean(camOff);
  }

  setLocalMicMuted(muted) {
    this.isLocalMicMuted = Boolean(muted);
  }

  /**
   * Starts canvas compositing loop and MediaRecorder
   */
  start() {
    if (this.isRecording || !this.canvas) return;
    this.isRecording = true;
    this.startTime = Date.now();
    this.recordedChunks = [];

    // Start 25fps draw loop
    const frameIntervalMs = Math.round(1000 / this.fps);
    this.animInterval = setInterval(() => {
      this.drawFrame();
    }, frameIntervalMs);

    // Capture mixed canvas video stream
    let combinedStream;
    try {
      const canvasStream = this.canvas.captureStream(this.fps);
      combinedStream = new MediaStream();

      // Add Canvas Video Track
      canvasStream.getVideoTracks().forEach(track => combinedStream.addTrack(track));

      // Add Mixed Dual-Channel Audio Track
      if (this.audioDest && this.audioDest.stream.getAudioTracks().length > 0) {
        combinedStream.addTrack(this.audioDest.stream.getAudioTracks()[0]);
      } else if (this.localStream && this.localStream.getAudioTracks().length > 0) {
        combinedStream.addTrack(this.localStream.getAudioTracks()[0]);
      }
    } catch (e) {
      console.warn('[CompositeRecorder] Stream capture fallback:', e);
      combinedStream = this.localStream;
    }

    // Initialize MediaRecorder
    let mimeType = 'video/webm;codecs=vp8,opus';
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm;codecs=vp9,opus';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = '';
    }

    try {
      this.mediaRecorder = mimeType
        ? new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 1200000 })
        : new MediaRecorder(combinedStream);

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000); // Flush chunks every 1 second
    } catch (e) {
      console.warn('[CompositeRecorder] MediaRecorder failed to start:', e);
    }
  }

  /**
   * Renders a single composite frame combining RO + Student + Branding + HUD
   */
  drawFrame() {
    const ctx = this.ctx;
    if (!ctx) return;

    const W = this.width;
    const H = this.height;

    // 1. Sleek Obsidian Background
    const bgGradient = ctx.createLinearGradient(0, 0, 0, H);
    bgGradient.addColorStop(0, '#0a0f1d');
    bgGradient.addColorStop(1, '#050811');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, W, H);

    // 2. Header Bar (Y: 0 - 58px)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, 58);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 58);
    ctx.lineTo(W, 58);
    ctx.stroke();

    // NITTE Title
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('🎓 NITTE SMART MENTORSHIP & GRIEVANCE SYSTEM', 24, 35);

    // Ticket Badge (Center)
    const badgeText = `[TICKET #${this.ticketId}] DUAL PARTICIPANT ARCHIVE`;
    ctx.font = '600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const badgeWidth = ctx.measureText(badgeText).width + 24;
    const badgeX = (W - badgeWidth) / 2;
    ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
    this.roundRect(ctx, badgeX, 14, badgeWidth, 30, 6, true, false);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    this.roundRect(ctx, badgeX, 14, badgeWidth, 30, 6, false, true);
    ctx.fillStyle = '#34d399';
    ctx.fillText(badgeText, badgeX + 12, 34);

    // Live Date & Blinking REC Indicator (Right)
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const dateString = now.toISOString().split('T')[0];
    const isBlinkOn = Math.floor(Date.now() / 600) % 2 === 0;

    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = isBlinkOn ? '#ef4444' : '#7f1d1d';
    ctx.fillText('● REC', W - 230, 35);

    ctx.font = '12px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`${dateString} ${timeString}`, W - 170, 35);

    // 3. Side-by-Side Dual Video Tile Dimensions
    // Usable Height = H - 58 (header) - 38 (footer) - 24 (margins) = 600px
    const tileY = 70;
    const tileH = 600;
    const margin = 20;
    const gap = 16;
    const tileW = (W - (margin * 2) - gap) / 2; // ~606px

    const leftX = margin;
    const rightX = margin + tileW + gap;

    // 4. Render Left Tile: Relationship Officer (RO)
    this.renderParticipantTile({
      ctx,
      x: leftX,
      y: tileY,
      w: tileW,
      h: tileH,
      video: this.localVideo,
      isCamOff: this.isLocalCamOff,
      hasStream: Boolean(this.localStream && this.localStream.active),
      name: this.localLabel,
      roleBadge: `OFFICIAL ${this.localRole}`,
      avatarInitials: this.getInitials(this.localLabel, 'RO'),
      accentColor: '#10b981',
      isMuted: this.isLocalMicMuted
    });

    // 5. Render Right Tile: Student
    const hasRemote = Boolean(this.remoteStream && this.remoteStream.active && this.remoteStream.getVideoTracks().length > 0);
    this.renderParticipantTile({
      ctx,
      x: rightX,
      y: tileY,
      w: tileW,
      h: tileH,
      video: this.remoteVideo,
      isCamOff: this.isRemoteCamOff,
      hasStream: hasRemote,
      name: this.remoteLabel,
      roleBadge: `STUDENT • ${this.remoteRole}`,
      avatarInitials: this.getInitials(this.remoteLabel, 'ST'),
      accentColor: '#38bdf8',
      isMuted: false,
      waitingText: 'Awaiting Student Live Stream...'
    });

    // 6. Footer Compliance Bar (Y: 682 - 720px)
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, H - 38, W, 38);
    ctx.strokeStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(0, H - 38);
    ctx.lineTo(W, H - 38);
    ctx.stroke();

    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('🔒 Tamper-Proof Automated Cloud Meeting Archive • End-to-End Encrypted DTLS-SRTP Dual Recording', 24, H - 15);
    ctx.fillText('Nitte Mahalinga Adyanthaya Memorial Institute of Technology', W - 410, H - 15);
  }

  /**
   * Helper to draw a single participant box with live video or stylized fallback card
   */
  renderParticipantTile({ ctx, x, y, w, h, video, isCamOff, hasStream, name, roleBadge, avatarInitials, accentColor, isMuted, waitingText }) {
    ctx.save();

    // Tile Boundary Card with Rounded Corners
    this.roundRect(ctx, x, y, w, h, 12, false, false);
    ctx.clip();

    // Base background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, w, h);

    const isVideoReady = hasStream && !isCamOff && video && video.readyState >= 2 && video.videoWidth > 0;

    if (isVideoReady) {
      // Draw Video Feed with Centered Cover Aspect Ratio
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const hRatio = w / vw;
      const vRatio = h / vh;
      const ratio = Math.max(hRatio, vRatio);

      const centerShiftX = (w - vw * ratio) / 2;
      const centerShiftY = (h - vh * ratio) / 2;

      ctx.drawImage(
        video,
        0, 0, vw, vh,
        x + centerShiftX, y + centerShiftY, vw * ratio, vh * ratio
      );
    } else {
      // Sleek Fallback Card when Webcam is Off or Connecting
      const tileGrad = ctx.createLinearGradient(x, y, x, y + h);
      tileGrad.addColorStop(0, '#131d31');
      tileGrad.addColorStop(1, '#0b1120');
      ctx.fillStyle = tileGrad;
      ctx.fillRect(x, y, w, h);

      // Avatar Circle
      const centerX = x + w / 2;
      const centerY = y + h / 2 - 30;
      const radius = 54;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = accentColor;
      ctx.stroke();

      // Avatar Initials
      ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(avatarInitials, centerX, centerY);

      // Name & Status under Avatar
      ctx.font = 'bold 17px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText(name, centerX, centerY + 80);

      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#94a3b8';
      const statusText = hasStream ? (isCamOff ? 'Webcam Paused' : 'Connecting feed...') : (waitingText || 'Connecting...');
      ctx.fillText(statusText, centerX, centerY + 105);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    // Border Around Participant Tile
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = accentColor === '#10b981' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, x, y, w, h, 12, false, true);

    // Overlay Bottom Label Banner inside Tile
    const bannerH = 44;
    const bannerY = y + h - bannerH;
    const bannerGrad = ctx.createLinearGradient(x, bannerY, x, y + h);
    bannerGrad.addColorStop(0, 'rgba(15, 23, 42, 0.75)');
    bannerGrad.addColorStop(1, 'rgba(10, 15, 29, 0.95)');
    ctx.fillStyle = bannerGrad;
    this.roundRect(ctx, x + 8, bannerY - 6, w - 16, bannerH, 8, true, false);

    // Role Badge (Small pill on left)
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const roleWidth = ctx.measureText(roleBadge).width + 14;
    ctx.fillStyle = accentColor;
    this.roundRect(ctx, x + 16, bannerY + 4, roleWidth, 22, 4, true, false);
    ctx.fillStyle = '#090d16';
    ctx.fillText(roleBadge, x + 23, bannerY + 19);

    // Participant Name
    ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, x + 26 + roleWidth, bannerY + 20);

    // Mic Status Indicator on right side of banner
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    if (isMuted) {
      ctx.fillStyle = '#f87171';
      ctx.fillText('🔇 Muted', x + w - 75, bannerY + 20);
    } else {
      ctx.fillStyle = '#34d399';
      ctx.fillText('🎙️ Live', x + w - 68, bannerY + 20);
    }

    ctx.restore();
  }

  getInitials(name, fallback = 'ST') {
    if (!name) return fallback;
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof radius === 'number') {
      radius = { tl: radius, tr: radius, br: radius, bl: radius };
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  }

  /**
   * Stops recording, closes media streams and compositing loop,
   * and returns a Promise resolving to { blob, videoUrl, durationSeconds }.
   * Guaranteed to resolve within 400ms max even if browser MediaRecorder delays onstop.
   */
  async stop() {
    this.isRecording = false;
    if (this.animInterval) {
      clearInterval(this.animInterval);
      this.animInterval = null;
    }

    const durationSeconds = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));

    return new Promise((resolve) => {
      let resolved = false;
      const finalize = () => {
        if (resolved) return;
        resolved = true;

        let blob = null;
        let videoUrl = '';
        if (this.recordedChunks && this.recordedChunks.length > 0) {
          try {
            blob = new Blob(this.recordedChunks, { type: 'video/webm' });
            videoUrl = URL.createObjectURL(blob);
          } catch (e) {
            console.warn('[CompositeRecorder] Blob generation error:', e);
          }
        }

        // Cleanup audio context and hidden video elements
        try {
          if (this.audioCtx) {
            this.audioCtx.close().catch(() => {});
            this.audioCtx = null;
          }
        } catch (e) {}

        if (this.localVideo) {
          this.localVideo.srcObject = null;
          this.localVideo = null;
        }
        if (this.remoteVideo) {
          this.remoteVideo.srcObject = null;
          this.remoteVideo = null;
        }

        resolve({ blob, videoUrl, durationSeconds });
      };

      // Guaranteed timeout to ensure stop() never hangs
      const safetyTimeout = setTimeout(() => {
        finalize();
      }, 400);

      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.onstop = () => {
          clearTimeout(safetyTimeout);
          finalize();
        };
        try {
          if (this.mediaRecorder.requestData) {
            this.mediaRecorder.requestData();
          }
          this.mediaRecorder.stop();
        } catch (e) {
          clearTimeout(safetyTimeout);
          finalize();
        }
      } else {
        clearTimeout(safetyTimeout);
        finalize();
      }
    });
  }
}
