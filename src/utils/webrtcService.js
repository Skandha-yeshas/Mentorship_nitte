// src/utils/webrtcService.js

/**
 * WebRTC Real-Time Two-Way Video & Audio Meeting Session Manager
 * Optimized for Rock-Solid Stability, Anti-Flicker & Seamless Peer Rejoining.
 * 
 * Reconnection & Lifecycle Protections:
 * 1. Session Instance Tracking: Each participant session generates a unique sessionId. When a student or RO leaves and joins back, session ID changes are detected immediately and trigger a clean PeerConnection reset.
 * 2. Instant Peer-Left Signal: When closing a session, an immediate peer-left signal notifies the remote peer to cleanly teardown the old connection and await rejoining.
 * 3. Fresh RTCPeerConnection Re-init: When a rejoin 'ready' or 'offer' signal arrives, dead or disconnected RTCPeerConnections are cleanly closed and re-initialized with local camera/mic tracks.
 * 4. Persistent single MediaStream container: Aggregates audio and video tracks into one stable MediaStream reference so React never unmounts or resets the video player.
 * 5. Fresh signal windowing: Ignores stale signals from past sessions by starting from Date.now() - 2000ms.
 * 6. Dual-layer cross-tab BroadcastChannel (0ms) and Express REST relay.
 */

export class WebRtcMeetingSession {
  constructor({ issueId, role, localStream, onRemoteStream, onPeerStatus, onMeetingEnded, onRemoteMediaState }) {
    this.issueId = (issueId || 'default').toUpperCase();
    this.role = role; // 'ro' | 'student'
    this.sessionId = `${this.role}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    this.remoteSessionId = null;
    this.localStream = localStream;
    this.onRemoteStream = onRemoteStream || (() => {});
    this.onPeerStatus = onPeerStatus || (() => {});
    this.onMeetingEnded = onMeetingEnded || (() => {});
    this.onRemoteMediaState = onRemoteMediaState || (() => {});

    this.pc = null;
    this.bc = null;
    this.pollTimer = null;
    this.readyTimer = null;
    this.lastSignalTimestamp = Date.now() - 500; // Fresh window so stale past session offers are never processed
    this.isClosed = false;
    this.isConnected = false;
    this.hasRemoteStream = false;
    this.hasOfferSent = false;
    this.hasNotifiedRemoteStream = false;
    this.remoteMediaStream = new MediaStream();
    this.pendingCandidates = [];
    this.processedSignalIds = new Set();
    this.lastOfferTime = 0;
    this.storageListener = null;

    this.init();
  }

  init() {
    // 1. Cross-tab instant communication via BroadcastChannel (0ms latency on same machine)
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        this.bc = new BroadcastChannel(`nitte_webrtc_${this.issueId}`);
        this.bc.onmessage = (event) => {
          if (event.data && event.data.sender !== this.role) {
            this.handleSignal(event.data);
          }
        };
      }
    } catch (e) {
      console.warn('BroadcastChannel not supported:', e);
    }

    // 1b. Redundant cross-window communication via localStorage storage event
    try {
      if (typeof window !== 'undefined' && window.addEventListener) {
        this.storageListener = (e) => {
          if (e.key && e.key.startsWith(`nitte_sig_${this.issueId}_`) && !e.key.endsWith(`_${this.role}`) && e.newValue) {
            try {
              const sig = JSON.parse(e.newValue);
              this.handleSignal(sig);
            } catch (err) {}
          }
        };
        window.addEventListener('storage', this.storageListener);
      }
    } catch (e) {}

    // 2. Setup RTCPeerConnection
    this.setupPeerConnection();

    // 3. Announce arrival to room
    this.sendSignal({ type: 'ready', role: this.role, sessionId: this.sessionId });

    // 4. Poll HTTP signaling relay every 1.2s until connected
    this.pollTimer = setInterval(() => this.pollSignals(), 1200);
    this.pollSignals();

    // 5. Periodic ready pulse until peer connects
    this.readyTimer = setInterval(() => {
      if (this.isClosed || this.isConnected || this.hasRemoteStream) {
        if (this.readyTimer) {
          clearInterval(this.readyTimer);
          this.readyTimer = null;
        }
        return;
      }
      this.sendSignal({ type: 'ready', role: this.role, sessionId: this.sessionId });
    }, 2500);
  }

  cleanupPeerConnection() {
    if (this.pc) {
      try {
        this.pc.ontrack = null;
        this.pc.onicecandidate = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
      } catch (e) {}
      this.pc = null;
    }
    this.isConnected = false;
    this.hasRemoteStream = false;
    this.hasOfferSent = false;
    this.hasNotifiedRemoteStream = false;
    this.remoteMediaStream = new MediaStream();
    this.pendingCandidates = [];
  }

  resetPeerConnection() {
    console.log(`[WebRTC ${this.role}] Resetting peer connection for peer (re)join`);
    this.cleanupPeerConnection();
    this.setupPeerConnection();
    this.onPeerStatus({ connected: false, live: false });
    this.onRemoteStream(null);

    // Restore rapid signaling polling so rejoin is detected instantly
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.pollSignals(), 1200);
    }

    // Restart ready timer pulse if not connected
    if (!this.readyTimer && !this.isClosed) {
      this.readyTimer = setInterval(() => {
        if (this.isClosed || this.isConnected || this.hasRemoteStream) {
          if (this.readyTimer) {
            clearInterval(this.readyTimer);
            this.readyTimer = null;
          }
          return;
        }
        this.sendSignal({ type: 'ready', role: this.role, sessionId: this.sessionId });
      }, 2500);
    }
  }

  setupPeerConnection() {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ],
      iceCandidatePoolSize: 2
    };

    try {
      this.pc = new RTCPeerConnection(config);

      // Add local tracks if stream is active
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          try {
            if (track.kind === 'video' && 'contentHint' in track) {
              track.contentHint = 'motion';
            } else if (track.kind === 'audio' && 'contentHint' in track) {
              track.contentHint = 'speech';
            }
            this.pc.addTrack(track, this.localStream);
          } catch (e) {
            console.warn('Error adding track to WebRTC:', e);
          }
        });
        this.optimizeSenders();
      }

      // When remote audio/video tracks arrive from peer
      this.pc.ontrack = (event) => {
        console.log(`[WebRTC ${this.role}] Received remote track:`, event.track ? event.track.kind : 'stream');
        this.isConnected = true;
        this.hasRemoteStream = true;

        if (this.readyTimer) {
          clearInterval(this.readyTimer);
          this.readyTimer = null;
        }

        // Optimize incoming track jitter buffer and playback smoothness
        if (event.receiver) {
          try {
            // Playout delay hint (0.04s = 40ms) smooths out jitter fluctuations
            if ('playoutDelayHint' in event.receiver) {
              event.receiver.playoutDelayHint = 0.04;
            }
            // Chromium 120+ jitterBufferTarget in milliseconds
            if ('jitterBufferTarget' in event.receiver) {
              event.receiver.jitterBufferTarget = 40;
            }
          } catch (e) {}
        }
        if (event.track) {
          try {
            if (event.track.kind === 'video' && 'contentHint' in event.track) {
              event.track.contentHint = 'motion';
            } else if (event.track.kind === 'audio' && 'contentHint' in event.track) {
              event.track.contentHint = 'speech';
            }
          } catch (e) {}
        }

        // Aggregate incoming tracks into stable persistent container
        if (event.track) {
          if (!this.remoteMediaStream.getTracks().some((t) => t.id === event.track.id)) {
            this.remoteMediaStream.addTrack(event.track);
          }
        }
        if (event.streams && event.streams[0]) {
          event.streams[0].getTracks().forEach((t) => {
            if (!this.remoteMediaStream.getTracks().some((existing) => existing.id === t.id)) {
              this.remoteMediaStream.addTrack(t);
            }
          });
        }

        // Notify React consumer of a new MediaStream instance so state update is ALWAYS triggered
        const streamToDispatch = new MediaStream(this.remoteMediaStream.getTracks());
        this.hasNotifiedRemoteStream = true;
        this.onRemoteStream(streamToDispatch);
        this.onPeerStatus({ connected: true, live: true });
      };

      // Candidate discovery
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          const candJson = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;
          this.sendSignal({ type: 'candidate', candidate: candJson, sessionId: this.sessionId });
        }
      };

      this.pc.onconnectionstatechange = () => {
        const state = this.pc ? this.pc.connectionState : 'closed';
        console.log(`[WebRTC ${this.role}] Connection state:`, state);

        if (state === 'connected') {
          this.isConnected = true;
          this.hasRemoteStream = true;

          if (this.readyTimer) {
            clearInterval(this.readyTimer);
            this.readyTimer = null;
          }

          if (this.remoteMediaStream.getTracks().length > 0) {
            this.onRemoteStream(new MediaStream(this.remoteMediaStream.getTracks()));
          }
          this.onPeerStatus({ connected: true, live: true });

          // Throttle background HTTP polling once connected
          if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = setInterval(() => this.pollSignals(), 3000);
          }
        } else if (state === 'failed') {
          console.log(`[WebRTC ${this.role}] Peer connection failed. Resetting for retry.`);
          this.isConnected = false;
          this.hasRemoteStream = false;
          this.onPeerStatus({ connected: false, live: false });
          this.onRemoteStream(null);
          this.resetPeerConnection();
        } else if (state === 'disconnected') {
          console.log(`[WebRTC ${this.role}] Peer disconnected.`);
          this.isConnected = false;
          this.onPeerStatus({ connected: false, live: false });
        }
      };

      this.pc.oniceconnectionstatechange = () => {
        const iceState = this.pc ? this.pc.iceConnectionState : 'closed';
        console.log(`[WebRTC ${this.role}] ICE state:`, iceState);
        if (iceState === 'connected' || iceState === 'completed') {
          this.isConnected = true;
          this.hasRemoteStream = true;
          if (this.readyTimer) {
            clearInterval(this.readyTimer);
            this.readyTimer = null;
          }
          this.onPeerStatus({ connected: true, live: true });
        } else if (iceState === 'failed') {
          console.log(`[WebRTC ${this.role}] ICE failed.`);
          this.isConnected = false;
          this.hasRemoteStream = false;
          this.onPeerStatus({ connected: false, live: false });
        }
      };
    } catch (err) {
      console.warn('RTCPeerConnection init error:', err);
    }
  }

  updateLocalStream(newStream) {
    this.localStream = newStream;
    if (!this.pc || !newStream) return;

    try {
      const senders = this.pc.getSenders();
      newStream.getTracks().forEach((track) => {
        const sender = senders.find((s) => s.track && s.track.kind === track.kind);
        if (sender) {
          sender.replaceTrack(track).catch(() => {});
        } else {
          try {
            this.pc.addTrack(track, newStream);
          } catch (e) {}
        }
      });
      this.optimizeSenders();
    } catch (err) {
      console.warn('Error updating local stream tracks:', err);
    }
  }

  optimizeSenders() {
    if (!this.pc) return;
    try {
      const senders = this.pc.getSenders ? this.pc.getSenders() : [];
      senders.forEach((sender) => {
        if (!sender.track) return;
        const trackKind = sender.track.kind;

        // Apply content hints to tracks
        if (trackKind === 'video' && 'contentHint' in sender.track) {
          sender.track.contentHint = 'motion';
        } else if (trackKind === 'audio' && 'contentHint' in sender.track) {
          sender.track.contentHint = 'speech';
        }

        // Apply bandwidth & degradation preference to video encoder
        if (trackKind === 'video' && sender.getParameters && sender.setParameters) {
          try {
            const params = sender.getParameters();
            if (params && params.encodings && params.encodings.length > 0) {
              let changed = false;
              // Maintain framerate ensures smooth 30fps motion rather than stuttering down to 10fps
              if (params.degradationPreference !== 'maintain-framerate') {
                params.degradationPreference = 'maintain-framerate';
                changed = true;
              }
              // Cap video bitrate to 1.2 Mbps to avoid packet bursts and network jitter buffer bloat
              if (!params.encodings[0].maxBitrate || params.encodings[0].maxBitrate > 1400000) {
                params.encodings[0].maxBitrate = 1200000;
                params.encodings[0].maxFramerate = 30;
                changed = true;
              }
              if (changed) {
                sender.setParameters(params).catch(() => {});
              }
            }
          } catch (pErr) {}
        }
      });
    } catch (err) {
      console.warn('optimizeSenders err:', err);
    }
  }

  optimizeSdp(sdp) {
    if (!sdp || typeof sdp !== 'string') return sdp;
    // RTCRtpSender.setParameters() in optimizeSenders() enforces bitrate and framerate natively.
    // Return clean standard SDP to guarantee RFC 4566 compliance and prevent line-order parse exceptions in setLocalDescription.
    return sdp;
  }

  setAudioEnabled(enabled) {
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
    if (this.pc) {
      try {
        this.pc.getSenders().forEach(sender => {
          if (sender.track && sender.track.kind === 'audio') {
            sender.track.enabled = enabled;
          }
        });
      } catch (e) {}
    }
    this.sendSignal({ type: 'media_state', audio: enabled, role: this.role });
  }

  setVideoEnabled(enabled) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
    if (this.pc) {
      try {
        this.pc.getSenders().forEach(sender => {
          if (sender.track && sender.track.kind === 'video') {
            sender.track.enabled = enabled;
          }
        });
      } catch (e) {}
    }
    this.sendSignal({ type: 'media_state', video: enabled, role: this.role });
  }

  async sendSignal(payload) {
    if (this.isClosed && payload.type !== 'peer-left' && payload.type !== 'peer_left') return;
    const signalId = `${this.role}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const signalData = {
      ...payload,
      id: signalId,
      issueId: this.issueId,
      sender: this.role,
      sessionId: this.sessionId,
      timestamp: Date.now()
    };

    // 1. Broadcast cross-tab (instant 0ms)
    if (this.bc) {
      try {
        this.bc.postMessage(signalData);
      } catch (e) {}
    }

    // 2. Redundant localStorage signaling for cross-window / cross-tab delivery
    try {
      localStorage.setItem(`nitte_sig_${this.issueId}_${this.role}`, JSON.stringify(signalData));
    } catch (e) {}

    // 3. Backend relay via Vite / Express
    try {
      fetch('/api/meetings/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signalData)
      }).catch(() => {});
    } catch (e) {}
  }

  async pollSignals() {
    if (this.isClosed) return;
    try {
      // Query signals with a 4s lookback overlap so in-flight signals are never skipped
      const querySince = Math.max(0, this.lastSignalTimestamp - 4000);
      const res = await fetch(`/api/meetings/signals/${this.issueId}?since=${querySince}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.now) this.lastSignalTimestamp = data.now;
      if (Array.isArray(data.signals)) {
        for (const sig of data.signals) {
          if (sig.sender !== this.role) {
            this.handleSignal(sig);
          }
        }
      }
    } catch (e) {}
  }

  async drainPendingCandidates() {
    if (!this.pc || !this.pc.remoteDescription) return;
    while (this.pendingCandidates.length > 0) {
      const c = this.pendingCandidates.shift();
      if (!c) continue;
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        try {
          await this.pc.addIceCandidate(c);
        } catch (e2) {
          console.warn('Queued candidate apply error:', e2);
        }
      }
    }
  }

  async handleSignal(signal) {
    if (this.isClosed || !signal) return;
    if (signal.id && this.processedSignalIds.has(signal.id)) return;
    if (signal.id) this.processedSignalIds.add(signal.id);

    try {
      // Automatic meeting ended signal from RO
      if (signal.type === 'meeting-ended' || signal.type === 'meeting_ended') {
        console.log(`[WebRTC ${this.role}] Meeting ended signal received.`);
        this.onMeetingEnded();
        return;
      }

      // Peer left signal (Student or RO closed their meeting modal)
      if (signal.type === 'peer-left' || signal.type === 'peer_left') {
        console.log(`[WebRTC ${this.role}] Peer left meeting. Resetting connection.`);
        this.remoteSessionId = null;
        this.resetPeerConnection();
        return;
      }

      // Remote media mute / camera state signal
      if (signal.type === 'media_state') {
        this.onRemoteMediaState({
          audio: signal.audio,
          video: signal.video,
          role: signal.role || signal.sender
        });
        return;
      }

      // Track remote peer session ID; if it changed, peer restarted or rejoined
      if (signal.sessionId) {
        if (this.remoteSessionId && this.remoteSessionId !== signal.sessionId) {
          console.log(`[WebRTC ${this.role}] Peer session changed (${this.remoteSessionId} -> ${signal.sessionId}). Resetting connection.`);
          this.remoteSessionId = signal.sessionId;
          this.resetPeerConnection();
          if (this.role === 'ro') {
            await this.createAndSendOffer();
            return;
          }
        } else {
          this.remoteSessionId = signal.sessionId;
        }
      }

      if (signal.type === 'ready') {
        // Only reset if connection actually failed or disconnected
        if (this.pc && (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed')) {
          this.resetPeerConnection();
        }

        this.onPeerStatus({ connected: true, peerReady: true });
        if (this.role === 'ro') {
          if (!this.isConnected) {
            if (this.pc && this.pc.signalingState === 'have-local-offer') {
              // If offer was created recently (<6s), re-send existing offer so student gets it, NEVER abort/reset!
              if (Date.now() - this.lastOfferTime < 6000 && this.pc.localDescription) {
                console.log(`[WebRTC ${this.role}] In-flight offer already active. Re-sending offer to peer.`);
                this.sendSignal({
                  type: 'offer',
                  sdp: { type: this.pc.localDescription.type, sdp: this.pc.localDescription.sdp },
                  sessionId: this.sessionId
                });
              } else {
                console.log(`[WebRTC ${this.role}] Offer timed out (>6s). Resetting for fresh offer.`);
                this.resetPeerConnection();
                await this.createAndSendOffer();
              }
            } else if (this.pc && this.pc.signalingState === 'stable') {
              await this.createAndSendOffer();
            }
          }
        } else {
          this.sendSignal({ type: 'ready_ack', role: 'student', sessionId: this.sessionId });
        }
        return;
      }

      if (signal.type === 'ready_ack' && this.role === 'ro') {
        if (!this.isConnected) {
          if (this.pc && this.pc.signalingState === 'have-local-offer') {
            if (Date.now() - this.lastOfferTime < 6000 && this.pc.localDescription) {
              console.log(`[WebRTC ${this.role}] Peer ready_ack arrived. Re-sending active offer.`);
              this.sendSignal({
                type: 'offer',
                sdp: { type: this.pc.localDescription.type, sdp: this.pc.localDescription.sdp },
                sessionId: this.sessionId
              });
            } else {
              this.resetPeerConnection();
              await this.createAndSendOffer();
            }
          } else if (this.pc && this.pc.signalingState === 'stable') {
            await this.createAndSendOffer();
          }
        }
        return;
      }

      if (signal.type === 'offer' && signal.sdp) {
        console.log(`[WebRTC ${this.role}] Received offer, preparing answer`);
        if (!this.pc || this.pc.connectionState === 'closed') {
          this.resetPeerConnection();
        }
        if (this.pc.signalingState !== 'stable') {
          console.warn(`[WebRTC ${this.role}] Offer arrived in signalingState ${this.pc.signalingState}. Rolling back to stable.`);
          try {
            await this.pc.setLocalDescription({ type: 'rollback' });
          } catch (rbErr) {
            this.resetPeerConnection();
          }
        }
        let rawSdp = signal.sdp;
        if (typeof rawSdp === 'string' && rawSdp.startsWith('{')) {
          try { rawSdp = JSON.parse(rawSdp); } catch (e) {}
        }
        const offerDesc = (rawSdp && rawSdp.type && rawSdp.sdp)
          ? rawSdp
          : { type: 'offer', sdp: rawSdp?.sdp || rawSdp };
        await this.pc.setRemoteDescription(new RTCSessionDescription(offerDesc));
        await this.drainPendingCandidates();

        const answer = await this.pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        const optimizedAnswerSdp = this.optimizeSdp(answer.sdp);
        await this.pc.setLocalDescription(new RTCSessionDescription({ type: 'answer', sdp: optimizedAnswerSdp }));
        this.sendSignal({
          type: 'answer',
          sdp: { type: this.pc.localDescription.type, sdp: this.pc.localDescription.sdp },
          sessionId: this.sessionId
        });
        this.optimizeSenders();
        return;
      }

      if (signal.type === 'answer' && signal.sdp && this.pc) {
        console.log(`[WebRTC ${this.role}] Received answer, setting remote description`);
        if (this.pc.signalingState === 'have-local-offer') {
          let rawSdp = signal.sdp;
          if (typeof rawSdp === 'string' && rawSdp.startsWith('{')) {
            try { rawSdp = JSON.parse(rawSdp); } catch (e) {}
          }
          const answerDesc = (rawSdp && rawSdp.type && rawSdp.sdp)
            ? rawSdp
            : { type: 'answer', sdp: rawSdp?.sdp || rawSdp };
          await this.pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
          await this.drainPendingCandidates();
        } else {
          console.log(`[WebRTC ${this.role}] Ignoring answer: signalingState is ${this.pc.signalingState}`);
        }
        return;
      }

      if (signal.type === 'candidate' && signal.candidate && this.pc) {
        try {
          if (!this.pc.remoteDescription || !this.pc.remoteDescription.type) {
            this.pendingCandidates.push(signal.candidate);
          } else {
            try {
              await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
            } catch (candErr) {
              await this.pc.addIceCandidate(signal.candidate);
            }
          }
        } catch (e) {
          console.warn('Candidate error:', e);
        }
        return;
      }
    } catch (err) {
      console.warn(`[WebRTC ${this.role}] Signal processing error:`, err);
    }
  }

  async createAndSendOffer() {
    if (!this.pc || this.isClosed || this.isConnected) return;
    try {
      if (this.pc.signalingState !== 'stable') {
        console.log(`[WebRTC ${this.role}] Cannot create offer: signalingState is ${this.pc.signalingState}`);
        return;
      }

      this.hasOfferSent = true;
      this.lastOfferTime = Date.now();
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      const optimizedOfferSdp = this.optimizeSdp(offer.sdp);
      await this.pc.setLocalDescription(new RTCSessionDescription({ type: 'offer', sdp: optimizedOfferSdp }));
      this.sendSignal({
        type: 'offer',
        sdp: { type: this.pc.localDescription.type, sdp: this.pc.localDescription.sdp },
        sessionId: this.sessionId
      });
      this.optimizeSenders();
    } catch (err) {
      this.hasOfferSent = false;
      console.warn('Error creating WebRTC offer:', err);
    }
  }

  sendMeetingEndedSignal() {
    this.sendSignal({ type: 'meeting-ended', issueId: this.issueId, sessionId: this.sessionId });
  }

  close() {
    // Notify peer immediately before closing
    try {
      this.sendSignal({ type: 'peer-left', role: this.role, sessionId: this.sessionId });
    } catch (e) {}

    // Clean up stale signals from relay so subsequent reconnects start completely fresh
    try {
      fetch(`/api/meetings/signals/${this.issueId}`, { method: 'DELETE' }).catch(() => {});
    } catch (e) {}

    this.isClosed = true;
    this.cleanupPeerConnection();

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.readyTimer) {
      clearInterval(this.readyTimer);
      this.readyTimer = null;
    }
    if (this.bc) {
      try {
        this.bc.close();
      } catch (e) {}
      this.bc = null;
    }
    if (this.storageListener) {
      try {
        window.removeEventListener('storage', this.storageListener);
      } catch (e) {}
      this.storageListener = null;
    }
  }
}
