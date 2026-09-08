// src/utils/webrtcService.js

/**
 * WebRTC Real-Time Two-Way Video & Audio Meeting Session Manager
 * Connects RO (Host) and Student so both participants see and hear each other live.
 * Uses BroadcastChannel for instant cross-tab communication and HTTP polling signaling
 * for cross-browser / multi-device connectivity.
 */

export class WebRtcMeetingSession {
  constructor({ issueId, role, localStream, onRemoteStream, onPeerStatus, onMeetingEnded }) {
    this.issueId = (issueId || 'default').toUpperCase();
    this.role = role; // 'ro' | 'student'
    this.localStream = localStream;
    this.onRemoteStream = onRemoteStream || (() => {});
    this.onPeerStatus = onPeerStatus || (() => {});
    this.onMeetingEnded = onMeetingEnded || (() => {});

    this.pc = null;
    this.bc = null;
    this.pollTimer = null;
    this.readyTimer = null;
    this.lastSignalTimestamp = 0;
    this.isClosed = false;
    this.isConnected = false;
    this.pendingCandidates = [];
    this.processedSignalIds = new Set();

    this.init();
  }

  init() {
    // 1. Cross-tab instant communication via BroadcastChannel
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
    this.sendSignal({ type: 'ready', role: this.role });

    // 4. Poll HTTP signaling relay every 1.0s for cross-browser support
    this.pollTimer = setInterval(() => this.pollSignals(), 1000);
    this.pollSignals();

    // 5. Periodic ready pulse until peer connects
    this.readyTimer = setInterval(() => {
      if (this.isClosed) return;
      if (!this.isConnected) {
        this.sendSignal({ type: 'ready', role: this.role });
      }
    }, 2500);
  }

  setupPeerConnection() {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
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

      // When remote audio/video tracks arrive from the peer
      this.pc.ontrack = (event) => {
        console.log(`[WebRTC ${this.role}] Received remote track/stream:`, event);
        this.isConnected = true;
        if (event.streams && event.streams[0]) {
          this.onRemoteStream(event.streams[0]);
          this.onPeerStatus({ connected: true, live: true });
        } else if (event.track) {
          const fallbackStream = new MediaStream([event.track]);
          this.onRemoteStream(fallbackStream);
          this.onPeerStatus({ connected: true, live: true });
        }
      };

      // Candidate discovery
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.sendSignal({ type: 'candidate', candidate: event.candidate });
        }
      };

      this.pc.onconnectionstatechange = () => {
        console.log(`[WebRTC ${this.role}] Connection state:`, this.pc.connectionState);
        if (this.pc.connectionState === 'connected') {
          this.isConnected = true;
          this.onPeerStatus({ connected: true, live: true });
        } else if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
          this.isConnected = false;
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
    } catch (err) {
      console.warn('Error updating local stream tracks:', err);
    }
  }

  async sendSignal(payload) {
    if (this.isClosed) return;
    const signalId = `${this.role}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const signalData = {
      ...payload,
      id: signalId,
      issueId: this.issueId,
      sender: this.role,
      timestamp: Date.now()
    };

    // Broadcast cross-tab
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
      if (signal.type === 'meeting-ended') {
        console.log(`[WebRTC ${this.role}] Meeting ended signal received.`);
        this.onMeetingEnded();
        return;
      }

      if (signal.type === 'ready') {
        this.onPeerStatus({ connected: true, peerReady: true });
        // The host (RO) initiates the WebRTC offer
        if (this.role === 'ro') {
          await this.createAndSendOffer();
        } else {
          // Student sends ready ack
          this.sendSignal({ type: 'ready_ack', role: 'student' });
        }
        return;
      }

      if (signal.type === 'ready_ack' && this.role === 'ro') {
        await this.createAndSendOffer();
        return;
      }

      if (signal.type === 'offer' && signal.sdp && this.pc) {
        console.log(`[WebRTC ${this.role}] Received offer, setting remote description`);
        await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await this.drainPendingCandidates();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.sendSignal({ type: 'answer', sdp: this.pc.localDescription });
        return;
      }

      if (signal.type === 'answer' && signal.sdp && this.pc) {
        console.log(`[WebRTC ${this.role}] Received answer, setting remote description`);
        if (this.pc.signalingState !== 'stable') {
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
    if (!this.pc) return;
    try {
      if (this.pc.signalingState !== 'stable') {
        return;
      }
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await this.pc.setLocalDescription(offer);
      this.sendSignal({ type: 'offer', sdp: this.pc.localDescription });
    } catch (err) {
      console.warn('Error creating WebRTC offer:', err);
    }
  }

  close() {
    this.isClosed = true;
    this.isConnected = false;
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
    if (this.pc) {
      try {
        this.pc.close();
      } catch (e) {}
      this.pc = null;
    }
  }
}
