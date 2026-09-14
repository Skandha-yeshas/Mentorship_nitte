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
  constructor({ issueId, role, localStream, onRemoteStream, onPeerStatus, onMeetingEnded }) {
    this.issueId = (issueId || 'default').toUpperCase();
    this.role = role; // 'ro' | 'student'
    this.sessionId = `${this.role}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
    this.remoteSessionId = null;
    this.localStream = localStream;
    this.onRemoteStream = onRemoteStream || (() => {});
    this.onPeerStatus = onPeerStatus || (() => {});
    this.onMeetingEnded = onMeetingEnded || (() => {});

    this.pc = null;
    this.bc = null;
    this.pollTimer = null;
    this.readyTimer = null;
    this.lastSignalTimestamp = Date.now() - 2000; // Ignore stale signals from past sessions
    this.isClosed = false;
    this.isConnected = false;
    this.hasRemoteStream = false;
    this.hasOfferSent = false;
    this.hasNotifiedRemoteStream = false;
    this.remoteMediaStream = new MediaStream();
    this.pendingCandidates = [];
    this.processedSignalIds = new Set();

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
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };

    try {
      this.pc = new RTCPeerConnection(config);

      // Add local tracks if stream is active
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          try {
            this.pc.addTrack(track, this.localStream);
          } catch (e) {
            console.warn('Error adding track to WebRTC:', e);
          }
        });
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

        // Notify React consumer of the stable MediaStream reference
        if (!this.hasNotifiedRemoteStream && this.remoteMediaStream.getTracks().length > 0) {
          this.hasNotifiedRemoteStream = true;
          this.onRemoteStream(this.remoteMediaStream);
        }

        this.onPeerStatus({ connected: true, live: true });
      };

      // Candidate discovery
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal({ type: 'candidate', candidate: event.candidate, sessionId: this.sessionId });
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

          this.onPeerStatus({ connected: true, live: true });

          // Throttle background HTTP polling to reduce socket traffic once connected
          if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = setInterval(() => this.pollSignals(), 6000);
          }
        } else if (state === 'disconnected' || state === 'failed') {
          console.log(`[WebRTC ${this.role}] Peer disconnected or failed. Preparing for reconnect.`);
          this.isConnected = false;
          this.hasRemoteStream = false;
          this.onPeerStatus({ connected: false, live: false });
          this.onRemoteStream(null);

          // Restore fast polling to detect peer return
          if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = setInterval(() => this.pollSignals(), 1200);
          }
        }
      };

      this.pc.oniceconnectionstatechange = () => {
        const iceState = this.pc ? this.pc.iceConnectionState : 'closed';
        if (iceState === 'connected' || iceState === 'completed') {
          this.isConnected = true;
          this.hasRemoteStream = true;
          if (this.readyTimer) {
            clearInterval(this.readyTimer);
            this.readyTimer = null;
          }
        } else if (iceState === 'disconnected' || iceState === 'failed') {
          this.isConnected = false;
          this.hasRemoteStream = false;
          this.onPeerStatus({ connected: false, live: false });
          this.onRemoteStream(null);
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
    } catch (err) {
      console.warn('Error updating local stream tracks:', err);
    }
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

    // Broadcast cross-tab (instant 0ms)
    if (this.bc) {
      try {
        this.bc.postMessage(signalData);
      } catch (e) {}
    }

    // Backend relay
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
      const res = await fetch(`/api/meetings/signals/${this.issueId}?since=${this.lastSignalTimestamp}`);
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
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e) {
        console.warn('Queued candidate apply error:', e);
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

      // Track remote peer session ID; if it changed, peer restarted or rejoined
      if (signal.sessionId) {
        if (this.remoteSessionId && this.remoteSessionId !== signal.sessionId) {
          console.log(`[WebRTC ${this.role}] Peer session changed (${this.remoteSessionId} -> ${signal.sessionId}). Resetting connection.`);
          this.resetPeerConnection();
        }
        this.remoteSessionId = signal.sessionId;
      }

      if (signal.type === 'ready') {
        // If peer is rejoining and we are in disconnected/failed state or without remote stream, reset connection cleanly
        if (!this.isConnected || !this.hasRemoteStream || !this.pc || this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
          this.resetPeerConnection();
        }

        this.onPeerStatus({ connected: true, peerReady: true });
        if (this.role === 'ro') {
          await this.createAndSendOffer();
        } else {
          this.sendSignal({ type: 'ready_ack', role: 'student', sessionId: this.sessionId });
        }
        return;
      }

      if (signal.type === 'ready_ack' && this.role === 'ro') {
        if (!this.isConnected || !this.hasRemoteStream || !this.hasOfferSent) {
          await this.createAndSendOffer();
        }
        return;
      }

      if (signal.type === 'offer' && signal.sdp) {
        console.log(`[WebRTC ${this.role}] Received offer, preparing answer`);
        // If our current PC is in an incompatible state, reset it for the fresh offer
        if (!this.pc || this.pc.signalingState !== 'stable') {
          this.resetPeerConnection();
        }
        await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await this.drainPendingCandidates();

        const answer = await this.pc.createAnswer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        });
        await this.pc.setLocalDescription(answer);
        this.sendSignal({ type: 'answer', sdp: this.pc.localDescription, sessionId: this.sessionId });
        return;
      }

      if (signal.type === 'answer' && signal.sdp && this.pc) {
        console.log(`[WebRTC ${this.role}] Received answer, setting remote description`);
        if (this.pc.signalingState === 'have-local-offer') {
          await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          await this.drainPendingCandidates();
        }
        return;
      }

      if (signal.type === 'candidate' && signal.candidate && this.pc) {
        try {
          if (!this.pc.remoteDescription || !this.pc.remoteDescription.type) {
            this.pendingCandidates.push(signal.candidate);
          } else {
            await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
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
    if (!this.pc || this.isClosed) return;
    try {
      if (this.pc.signalingState !== 'stable') {
        this.resetPeerConnection();
      }

      this.hasOfferSent = true;
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await this.pc.setLocalDescription(offer);
      this.sendSignal({ type: 'offer', sdp: this.pc.localDescription, sessionId: this.sessionId });
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
  }
}
