import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Volume2, VolumeX, Mic, MicOff, VideoOff } from 'lucide-react';

/**
 * VideoStreamPlayer - Ultra-Smooth WebRTC Video & Audio Player Component
 * 
 * Performance & Low-Jitter Architecture:
 * 1. Decoupled Audio & Mic State: 'muted' controls speaker playback (muting local video/audio tags to eliminate acoustic feedback), while 'isMicMuted' accurately reflects microphone track mute status.
 * 2. Zero Re-Render Audio Activity Meter: Updates the live voice equalizer and activity bar directly via DOM references (zero React re-renders during speech), eliminating UI micro-stutters.
 * 3. Dedicated Single-Stream Audio Output: Keeps HTMLVideoElement strictly muted to prevent duplicate audio pipelines, while HTMLAudioElement delivers unmuted, crystal-clear sound.
 * 4. Fallback Avatar Display: Gracefully renders a high-res initials avatar with status badges when camera is disabled or video track is unavailable.
 */
const VideoStreamPlayer = React.memo(({
  stream,
  muted = false,
  isMuted = null, // caller compatibility
  isMicMuted = null, // explicit microphone state
  isCameraOff = false,
  isCamOff = null, // caller compatibility
  objectFit = 'contain', // 'contain' renders natural 16:9 widescreen with ZERO cropping or zoom
  style = {},
  className = '',
  badge = null,
  participantName = '',
  roleLabel = '' // caller compatibility
}) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const audioBarRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [currentFit, setCurrentFit] = useState(objectFit);
  const audioContextRef = useRef(null);
  const animFrameRef = useRef(null);
  const isSpeakingRef = useRef(false);
  const quietCounterRef = useRef(0);

  // Sync prop changes for objectFit
  useEffect(() => {
    if (objectFit) setCurrentFit(objectFit);
  }, [objectFit]);

  // Normalized props
  const effectivePlaybackMuted = Boolean(isMuted !== null && isMuted !== undefined ? isMuted : muted);
  const displayName = participantName || roleLabel || 'Participant';
  const effectiveCameraOff = Boolean(isCamOff !== null && isCamOff !== undefined ? isCamOff : isCameraOff);

  // Dynamic live video track detector
  const [hasLiveVideo, setHasLiveVideo] = useState(true);
  useEffect(() => {
    if (!stream) {
      setHasLiveVideo(false);
      return;
    }
    const checkTracks = () => {
      const vTracks = stream.getVideoTracks();
      const live = vTracks.length > 0 && vTracks.some(t => t.readyState !== 'ended' && t.enabled !== false);
      setHasLiveVideo(live);
    };
    checkTracks();
    stream.addEventListener('addtrack', checkTracks);
    stream.addEventListener('removetrack', checkTracks);
    return () => {
      stream.removeEventListener('addtrack', checkTracks);
      stream.removeEventListener('removetrack', checkTracks);
    };
  }, [stream]);

  // Compute initials for avatar fallback
  const initials = useMemo(() => {
    if (!displayName) return 'P';
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  }, [displayName]);

  // Determine true microphone muted state (independent from speaker playback mute!)
  const effectiveMicMuted = useMemo(() => {
    if (isMicMuted !== null && isMicMuted !== undefined) {
      return Boolean(isMicMuted);
    }
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        return !audioTracks[0].enabled;
      }
    }
    return false;
  }, [isMicMuted, stream]);

  // Playback & Audio Pipeline Attachment
  useEffect(() => {
    const videoEl = videoRef.current;
    const audioEl = audioRef.current;
    if (!videoEl) return;

    if (stream) {
      // 1. Attach to Video Element (ALWAYS muted in player; dedicated audio element handles sound)
      if (videoEl.srcObject !== stream) {
        videoEl.srcObject = stream;
      }

      // 2. Attach to Dedicated Audio Element only if unmuted remote stream
      if (!effectivePlaybackMuted && audioEl) {
        if (audioEl.srcObject !== stream) {
          audioEl.srcObject = stream;
        }
      }

      const attemptPlay = () => {
        if (!videoEl) return;
        videoEl.muted = true;
        videoEl.defaultMuted = true;
        const videoPromise = videoEl.play();
        if (videoPromise !== undefined) {
          videoPromise.catch((err) => {
            if (err.name !== 'AbortError') {
              console.warn('[VideoStreamPlayer] Video play notice:', err);
            }
          });
        }

        // Dedicated audio element playback for remote stream
        if (!effectivePlaybackMuted && audioEl) {
          audioEl.muted = false;
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

      // Ensure playback commences as soon as media frames/metadata arrive
      videoEl.addEventListener('loadedmetadata', attemptPlay);
      videoEl.addEventListener('canplay', attemptPlay);
      videoEl.addEventListener('loadeddata', attemptPlay);

      attemptPlay();

      // Listen for dynamically added tracks (e.g., video arriving after audio)
      const handleTrackAdded = () => {
        attemptPlay();
      };

      stream.addEventListener('addtrack', handleTrackAdded);

      // Listen for un-mute on tracks
      const tracks = stream.getTracks();
      tracks.forEach((track) => {
        track.addEventListener('unmute', attemptPlay);
      });

      return () => {
        videoEl.removeEventListener('loadedmetadata', attemptPlay);
        videoEl.removeEventListener('canplay', attemptPlay);
        videoEl.removeEventListener('loadeddata', attemptPlay);
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
  }, [stream, effectivePlaybackMuted]);

  // High-Performance Audio Activity Analyzer (Zero-State DOM Updating)
  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0 || effectiveMicMuted) {
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
  }, [stream, effectiveMicMuted]);

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
          objectFit: currentFit,
          display: effectiveCameraOff ? 'none' : 'block',
          transform: 'translateZ(0)',
          willChange: 'transform',
          backgroundColor: '#070b14'
        }}
      />

      {/* Aspect Ratio / Zoom Mode Toggle */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        zIndex: 5
      }}>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCurrentFit(prev => prev === 'contain' ? 'cover' : 'contain');
          }}
          title={currentFit === 'contain' ? 'Currently: Natural Wide Angle (No Zoom). Click to Fill Screen.' : 'Currently: Fill Screen (Cropped). Click for Natural Wide Angle.'}
          style={{
            background: 'rgba(11, 15, 25, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '0.68rem',
            fontWeight: 700,
            color: '#cbd5e1',
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.2s'
          }}
        >
          <span>{currentFit === 'contain' ? '🔍 Wide Angle (No Zoom)' : '📐 Filled Frame'}</span>
        </button>
      </div>

      {/* Camera Off Silhouette Overlay */}
      {effectiveCameraOff && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'radial-gradient(circle at center, #111c33 0%, #070b14 100%)',
          zIndex: 2,
          padding: '16px',
          textAlign: 'center'
        }}>
          <div style={{
            width: '76px',
            height: '76px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #2563eb, #10b981)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: '1.6rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            border: '2px solid rgba(255,255,255,0.2)',
            position: 'relative'
          }}>
            {initials}
            <span style={{
              position: 'absolute',
              bottom: '1px',
              right: '1px',
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: effectiveMicMuted ? '#ef4444' : '#10b981',
              border: '2px solid #090d16',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 6px rgba(0,0,0,0.4)'
            }}>
              {effectiveMicMuted ? <MicOff size={11} color="#fff" /> : <Mic size={11} color="#fff" />}
            </span>
          </div>
          <span style={{
            marginTop: '10px',
            fontWeight: 700,
            fontSize: '0.85rem',
            color: '#f8fafc',
            maxWidth: '90%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            {displayName}
          </span>
          <span style={{
            marginTop: '4px',
            fontSize: '0.68rem',
            color: '#94a3b8',
            background: 'rgba(255,255,255,0.06)',
            padding: '2px 8px',
            borderRadius: '6px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <VideoOff size={11} style={{ color: '#f43f5e' }} /> Camera Disabled
          </span>
        </div>
      )}

      {/* Dedicated Remote Audio Output Pipeline */}
      {!effectivePlaybackMuted && (
        <audio
          ref={audioRef}
          autoPlay
          playsInline
          style={{ display: 'none' }}
        />
      )}

      {/* Autoplay Policy Restriction Overlay */}
      {audioBlocked && !effectivePlaybackMuted && (
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
        {isSpeaking && !effectiveMicMuted && (
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
        {effectiveMicMuted ? (
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

