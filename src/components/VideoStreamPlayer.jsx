import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX, Mic, MicOff } from 'lucide-react';

/**
 * VideoStreamPlayer - Ultra-Smooth WebRTC Video & Audio Player Component
 * 
 * Performance & Low-Jitter Architecture:
 * 1. Zero Re-Render Audio Activity Meter: Updates the live voice equalizer and activity bar directly via DOM references (zero React re-renders during speech), eliminating UI micro-stutters and main-thread CPU spikes.
 * 2. Dedicated Single-Stream Audio Output: Keeps HTMLVideoElement strictly muted to prevent duplicate audio pipelines, while HTMLAudioElement delivers unmuted, crystal-clear, jitter-free remote sound.
 * 3. Hysteresis Debounced VAD: Speaking indicator uses debounced thresholding to prevent rapid UI glow flickering.
 * 4. Hardware-Accelerated Rendering: Container and video elements enforce GPU compositing with translateZ(0) to maximize framerate smoothness.
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
  const audioBarRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const audioContextRef = useRef(null);
  const animFrameRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const quietCounterRef = useRef(0);

  // Playback & Audio Pipeline Attachment
  useEffect(() => {
    const videoEl = videoRef.current;
    const audioEl = audioRef.current;
    if (!videoEl) return;

    if (stream) {
      // 1. Attach to Video Element (ALWAYS muted to prevent dual-audio cancellation)
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
        videoEl.muted = true;
        const videoPromise = videoEl.play();
        if (videoPromise !== undefined) {
          videoPromise.catch(() => {});
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
      const handleTrackAdded = () => {
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
      if (audioBarRef.current) {
        audioBarRef.current.style.width = '5%';
      }
      setIsSpeaking(false);
      isSpeakingRef.current = false;
    }
  }, [stream, muted]);

  // High-Performance Audio Activity Analyzer (Zero-State DOM Updating)
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      if (audioBarRef.current) audioBarRef.current.style.width = '5%';
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      return;
    }

    let isMounted = true;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; // Smaller FFT size = faster computation & less CPU
      analyser.smoothingTimeConstant = 0.5;

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

        // Update DOM audio bar directly WITHOUT triggering React re-renders
        if (audioBarRef.current) {
          const barWidth = Math.max(normalized, normalized > 14 ? 32 : 6);
          audioBarRef.current.style.width = `${barWidth}%`;
          audioBarRef.current.style.background = normalized > 14 ? '#10b981' : '#64748b';
        }

        // Hysteresis Debounced Speaking state change
        if (normalized > 14) {
          quietCounterRef.current = 0;
          if (!isSpeakingRef.current) {
            isSpeakingRef.current = true;
            setIsSpeaking(true);
          }
        } else {
          quietCounterRef.current += 1;
          // Hold speaking indicator for 3 ticks (360ms) before fading out
          if (quietCounterRef.current >= 3 && isSpeakingRef.current) {
            isSpeakingRef.current = false;
            setIsSpeaking(false);
          }
        }

        animFrameRef.current = setTimeout(checkAudioLevel, 120);
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
        transform: 'translateZ(0)',
        willChange: 'transform',
        boxShadow: isSpeaking
          ? '0 0 0 2px #10b981, 0 0 20px rgba(16, 185, 129, 0.4)'
          : '0 4px 20px rgba(0, 0, 0, 0.5)',
        ...style
      }}
      className={className}
    >
      {/* Video Element (ALWAYS muted in player; dedicated audio handles sound) */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={true}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          transform: 'translateZ(0)',
          willChange: 'transform'
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

        {/* Animated Speaking Indicator */}
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
              <span style={{ width: '2px', height: '60%', background: '#10b981', borderRadius: '1px' }} />
              <span style={{ width: '2px', height: '100%', background: '#10b981', borderRadius: '1px' }} />
              <span style={{ width: '2px', height: '75%', background: '#10b981', borderRadius: '1px' }} />
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
              <div
                ref={audioBarRef}
                style={{
                  width: '6%',
                  height: '100%',
                  background: '#64748b',
                  transition: 'width 0.1s ease-out'
                }}
              />
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
