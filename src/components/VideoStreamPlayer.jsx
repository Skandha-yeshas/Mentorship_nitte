import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Mic, MicOff } from 'lucide-react';

/**
 * VideoStreamPlayer - Professional WebRTC Video & Audio Player Component
 * 
 * Features:
 * 1. Dedicated dual-pipeline audio playback: Employs both HTMLVideoElement and a dedicated HTMLAudioElement to ensure unmuted remote audio is crystal clear and never dropped when tracks arrive asynchronously.
 * 2. Dynamic track detection: Automatically attaches audio tracks if they arrive after video playback has started (resolves Chromium track attachment delays).
 * 3. Live Voice Activity Detection (VAD): Web Audio API AnalyserNode powers a real-time glowing border and animated equalizer soundwave when the participant is speaking.
 * 4. Autoplay Policy Resolution: Provides a sleek floating "Click to Unmute" pill if the browser's autoplay policy temporarily restricts unmuted sound.
 * 5. React.memo isolation: Zero re-renders from parent recording timers or background database polling.
 */
const VideoStreamPlayer = React.memo(({
  stream,
  muted = false,
  style = {},
  className = '',
  badge = null,
  participantName = ''
}) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 100
  const audioContextRef = useRef(null);
  const animFrameRef = useRef(null);

  // Playback & Audio Pipeline Attachment
  useEffect(() => {
    const videoEl = videoRef.current;
    const audioEl = audioRef.current;
    if (!videoEl) return;

    if (stream) {
      // 1. Attach to Video Element
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }

      // 2. Attach to Dedicated Audio Element if unmuted remote stream
      if (!muted && audioEl) {
        if (audioEl.srcObject !== stream) {
          audioEl.srcObject = stream;
        }
      }

      const attemptPlay = () => {
        // Video element playback
        const videoPromise = videoEl.play();
        if (videoPromise !== undefined) {
          videoPromise.catch((err) => {
            if (err.name === 'NotAllowedError') {
              if (!muted) {
                // Video continues muted, while audio element or unmute banner allows audio
                videoEl.muted = true;
                videoEl.play().catch(() => {});
                setAudioBlocked(true);
              }
            }
          });
        }

        // Dedicated audio element playback for remote stream
        if (!muted && audioEl) {
          const audioPromise = audioEl.play();
          if (audioPromise !== undefined) {
            audioPromise.then(() => {
              setAudioBlocked(false);
            }).catch((err) => {
              if (err.name === 'NotAllowedError') {
                setAudioBlocked(true);
              }
            });
          }
        }
      };

      attemptPlay();

      // Listen for dynamically added tracks (e.g., audio arriving after video)
      const handleTrackAdded = (e) => {
        console.log('[VideoStreamPlayer] New track added to stream:', e.track ? e.track.kind : 'unknown');
        if (videoEl && videoEl.srcObject) {
          videoEl.play().catch(() => {});
        }
        if (!muted && audioEl && audioEl.srcObject) {
          audioEl.play().catch(() => {});
        }
      };

      stream.addEventListener('addtrack', handleTrackAdded);

      // Listen for un-mute on tracks
      const tracks = stream.getTracks();
      tracks.forEach((track) => {
        track.addEventListener('unmute', attemptPlay);
      });

      return () => {
        stream.removeEventListener('addtrack', handleTrackAdded);
        tracks.forEach((track) => {
          track.removeEventListener('unmute', attemptPlay);
        });
      };
    } else {
      videoEl.srcObject = null;
      if (audioEl) audioEl.srcObject = null;
      setAudioLevel(0);
      setIsSpeaking(false);
    }
  }, [stream, muted]);

  // Live Audio Activity Analyzer (Voice Meter & Equalizer)
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setAudioLevel(0);
      setIsSpeaking(false);
      return;
    }

    let isMounted = true;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.4;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkAudioLevel = () => {
        if (!isMounted) return;
        analyser.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength;
        const normalized = Math.min(Math.round((avg / 128) * 100), 100);

        setAudioLevel(normalized);
        setIsSpeaking(normalized > 12);

        animFrameRef.current = setTimeout(checkAudioLevel, 90);
      };

      checkAudioLevel();

      return () => {
        isMounted = false;
        if (animFrameRef.current) clearTimeout(animFrameRef.current);
        try {
          source.disconnect();
          analyser.disconnect();
          audioCtx.close();
        } catch (e) {}
      };
    } catch (e) {
      console.warn('Audio analyzer init error:', e);
    }
  }, [stream]);

  const handleManualUnmute = () => {
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        setAudioBlocked(false);
      }).catch(() => {});
    }
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().then(() => {
        setAudioBlocked(false);
      }).catch(() => {});
    }
  };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: '#090d16',
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'all 0.25s ease',
        boxShadow: isSpeaking
          ? '0 0 0 2px #10b981, 0 0 24px rgba(16, 185, 129, 0.45)'
          : '0 4px 20px rgba(0, 0, 0, 0.5)',
        ...style
      }}
      className={className}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block'
        }}
      />

      {/* Dedicated Remote Audio Output Pipeline */}
      {!muted && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          style={{ display: 'none' }}
        />
      )}

      {/* Autoplay Policy Restriction Overlay */}
      {audioBlocked && !muted && (
        <div
          onClick={handleManualUnmute}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(245, 158, 11, 0.5)',
            padding: '10px 18px',
            borderRadius: '30px',
            color: '#fbbf24',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.8rem',
            fontWeight: 600,
            boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
            backdropFilter: 'blur(10px)',
            zIndex: 10
          }}
        >
          <VolumeX size={16} style={{ color: '#f59e0b' }} />
          <span>Click to Unmute Audio</span>
        </div>
      )}

      {/* Top Left Live Badge & Speaker Status */}
      <div style={{
        position: 'absolute',
        top: '12px',
        left: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        zIndex: 4
      }}>
        {badge && (
          <div style={{
            background: 'rgba(11, 15, 25, 0.75)',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '0.72rem',
            fontWeight: 600,
            color: badge.color || '#10b981',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: badge.color || '#10b981',
              boxShadow: isSpeaking ? `0 0 8px ${badge.color || '#10b981'}` : 'none'
            }} />
            {badge.text}
          </div>
        )}

        {/* Animated Speaking Equalizer */}
        {isSpeaking && (
          <div style={{
            background: 'rgba(16, 185, 129, 0.2)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            padding: '4px 8px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            backdropFilter: 'blur(8px)'
          }}>
            <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 700 }}>Speaking</span>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '12px' }}>
              <span style={{ width: '2px', height: '60%', background: '#10b981', borderRadius: '1px', animation: 'eqPulse 0.6s infinite ease-in-out' }} />
              <span style={{ width: '2px', height: '100%', background: '#10b981', borderRadius: '1px', animation: 'eqPulse 0.4s infinite ease-in-out 0.1s' }} />
              <span style={{ width: '2px', height: '75%', background: '#10b981', borderRadius: '1px', animation: 'eqPulse 0.5s infinite ease-in-out 0.2s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Audio Activity Bar */}
      <div style={{
        position: 'absolute',
        bottom: '12px',
        left: '12px',
        background: 'rgba(11, 15, 25, 0.75)',
        padding: '4px 10px',
        borderRadius: '6px',
        fontSize: '0.7rem',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: '#fff',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        zIndex: 4
      }}>
        {muted ? (
          <>
            <MicOff size={13} style={{ color: '#ef4444' }} />
            <span style={{ color: '#fca5a5' }}>Mic Muted</span>
          </>
        ) : (
          <>
            <Mic size={13} style={{ color: isSpeaking ? '#10b981' : '#94a3b8' }} />
            <div style={{
              width: '36px',
              height: '4px',
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.max(audioLevel, isSpeaking ? 30 : 5)}%`,
                height: '100%',
                background: isSpeaking ? '#10b981' : '#64748b',
                transition: 'width 0.1s ease'
              }} />
            </div>
            <span style={{ color: isSpeaking ? '#10b981' : '#cbd5e1' }}>
              {isSpeaking ? 'Live Voice' : 'Mic Active'}
            </span>
          </>
        )}
      </div>
    </div>
  );
});

export default VideoStreamPlayer;
