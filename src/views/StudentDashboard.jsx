import React, { useContext, useState, useEffect, useRef } from 'react';
import { DatabaseContext, ALL_CATEGORIES, getYoutubeEmbedUrl } from '../context/DatabaseContext';
import { AlertCircle, Calendar, FileText, CheckCircle2, Clock, Send, Star, ExternalLink, User, RotateCcw, Video, Mic, MicOff, VideoOff, Play, Shield, Camera, X, Download, HelpCircle, ThumbsUp, PhoneOff, Volume2, VolumeX, MessageSquare } from 'lucide-react';
import { WebRtcMeetingSession } from '../utils/webrtcService';
import { CompositeMeetingRecorder } from '../utils/compositeRecorder';
import { createFallbackMediaStream } from '../utils/mediaFallback';
import VideoStreamPlayer from '../components/VideoStreamPlayer';

export const StudentDashboard = ({ studentId }) => {
  const { db, submitIssue, submitFeedback, reopenIssue, resolveIssue, submitMentorFeedback, isDemoLimitBypassed, toggleDemoLimitBypass, saveMeetingRecording } = useContext(DatabaseContext);

  // Submission Self-Help Video Modal State
  const [submissionVideoModal, setSubmissionVideoModal] = useState(null);

  // Tabs within Student Dashboard
  const [activeTab, setActiveTab] = useState('raise-issue'); // 'raise-issue', 'my-issues', 'mentor-hub'
  const [selectedIssueId, setSelectedIssueId] = useState(null);

  // Form states (Clean Single Issue Form)
  const [category, setCategory] = useState(ALL_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [successMessage, setSuccessMessage] = useState('');

  // Rating & Re-open form states
  const [rating, setRating] = useState(5);
  const [feedbackComments, setFeedbackComments] = useState('');
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  // Mentor feedback form states
  const [mfRegularity, setMfRegularity] = useState(0);
  const [mfClarity, setMfClarity] = useState(0);
  const [mfParticipation, setMfParticipation] = useState(0);
  const [mfDifficulties, setMfDifficulties] = useState('');
  const [mfSuccess, setMfSuccess] = useState('');

  // Fetch current student profile & assigned RO
  const student = db.users.students.find(s => s.id === studentId) || db.users.students[0];
  const myMentor = db.users.mentors.find(m => m.id === student.mentorId);

  // Determine active RO dynamically based on category selection
  const activeCategoryIdx = ALL_CATEGORIES.indexOf(category);
  const activeFormRoId = activeCategoryIdx !== -1 ? `RO-${String(activeCategoryIdx + 1).padStart(2, '0')}` : 'RO-01';
  const activeFormRO = db.users.ros.find(r => r.id === activeFormRoId);

  // Issues raised by this student (handles studentId, student_id, USN, or studentName safely and deduplicates by ID)
  const studentIdLower = (student?.id || '').toLowerCase();
  const studentNameLower = (student?.name || '').toLowerCase();

  const rawMyIssues = (db.issues || []).filter(i => {
    const sId = (i.studentId || i.student_id || '').toLowerCase();
    const sName = (i.studentName || i.student_name || '').toLowerCase();

    const isIdMatch = sId && (
      sId === studentIdLower ||
      (sId === 'u18cm24s0058' || sId === '1nt21cs001' || sId === 's101') && (studentIdLower === 'u18cm24s0058' || studentIdLower === 's101' || studentIdLower === '1nt21cs001') ||
      (sId === 'u18cm24s0056' || sId === '1nt21ec015' || sId === 's102') && (studentIdLower === 'u18cm24s0056' || studentIdLower === 's102' || studentIdLower === '1nt21ec015') ||
      (sId === 'u18cm24s0053' || sId === '1nt22is042' || sId === 's103') && (studentIdLower === 'u18cm24s0053' || studentIdLower === 's103' || studentIdLower === '1nt22is042')
    );
    const isNameMatch = studentNameLower && sName === studentNameLower;

    return isIdMatch || isNameMatch;
  });
  const myIssues = Array.from(new Map(rawMyIssues.map(i => [i.id, i])).values());
  const activeSelectedIssueId = selectedIssueId || (myIssues.length > 0 ? myIssues[0].id : null);
  const selectedIssue = (db.issues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === activeSelectedIssueId?.toUpperCase());

  // Student Video Modal State
  const [showStudentVideoModal, setShowStudentVideoModal] = useState(false);
  const [activeMeetingIssueId, setActiveMeetingIssueId] = useState(null);

  // Pop-up states for meeting ended by RO
  const [meetingEndedPopup, setMeetingEndedPopup] = useState(null);

  // Any active or scheduled online meeting strictly belonging to this student's raised issues
  const activeStudentOnlineMeeting = (() => {
    const myIssueIds = new Set((myIssues || []).map(i => (i.id || i.issue_id || '').toUpperCase()));
    if (myIssueIds.size === 0) return null;

    // Filter meetings strictly belonging to this student's tickets
    const myStudentMeetings = (db.meetings || []).filter(m => {
      const isCompleted = m.status === 'Completed' || m.status === 'Finished' || m.status === 'Cancelled' || m.status === 'Concluded';
      if (isCompleted) return false;

      const mIssueId = (m.issueId || m.issue_id || '').toUpperCase();
      if (!myIssueIds.has(mIssueId)) return false;

      const modeLower = (m.mode || '').toLowerCase();
      const locLower = (m.location || '').toLowerCase();
      const isOnline = !m.mode ||
        modeLower.includes('online') ||
        modeLower.includes('video') ||
        locLower.includes('meet') ||
        locLower.includes('zoom') ||
        locLower.includes('http');

      return isOnline;
    });

    // 1. Highest priority: if an online meeting for this student's ticket is Live ('Started' or 'In-Progress')
    const liveMeet = myStudentMeetings.find(m => m.status === 'Started' || m.status === 'In-Progress');
    if (liveMeet) return liveMeet;

    // 2. Next: any scheduled online meeting for this student's tickets
    if (myStudentMeetings.length > 0) return myStudentMeetings[0];

    return null;
  })();
  const [isStudentMicMuted, setIsStudentMicMuted] = useState(false);
  const [isStudentCamOff, setIsStudentCamOff] = useState(false);
  const [studentMediaPermissionState, setStudentMediaPermissionState] = useState('idle'); // 'idle' | 'requesting' | 'granted' | 'denied'
  const isMediaRequestingRef = useRef(false);
  const [studentMediaPermissionError, setStudentMediaPermissionError] = useState('');
  const [playingRecording, setPlayingRecording] = useState(null);

  // WebRTC Peer Video Stream States for RO & Student
  const [roRemoteStream, setRoRemoteStream] = useState(null);
  const [studentStream, setStudentStream] = useState(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [isRoCameraOff, setIsRoCameraOff] = useState(false);
  const [isRoMicMuted, setIsRoMicMuted] = useState(false);

  const studentStreamRef = useRef(null);
  const webrtcSessionRef = useRef(null);
  const studentCompositeRecorderRef = useRef(null);

  const requestStudentMedia = async (targetIssueIdParam = null) => {
    if (isMediaRequestingRef.current) return;
    isMediaRequestingRef.current = true;
    setStudentMediaPermissionState('requesting');
    setStudentMediaPermissionError('');
    try {
      let stream = null;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Your browser does not support camera/microphone access (WebRTC).');
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30, max: 30 },
            facingMode: 'user'
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (audioErr) {
        try {
          console.warn('[Student] Advanced audio constraints fallback, requesting standard media:', audioErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
            audio: true
          });
        } catch (camErr) {
          console.warn('[Student] Hardware webcam unavailable or locked by another tab, falling back to simulated stream:', camErr);
          stream = createFallbackMediaStream({
            label: student?.name || 'Student',
            role: 'Student'
          });
          setStudentMediaPermissionError('Hardware camera unavailable or in use by another tab. Using active simulated video feed.');
        }
      }

      if (!stream) {
        stream = createFallbackMediaStream({
          label: student?.name || 'Student',
          role: 'Student'
        });
      }

      studentStreamRef.current = stream;
      setStudentStream(stream);
      setStudentMediaPermissionState('granted');

      const targetIssueId = String(
        targetIssueIdParam ||
        activeMeetingIssueId ||
        activeStudentOnlineMeeting?.issueId ||
        activeStudentOnlineMeeting?.issue_id ||
        (selectedIssue ? (selectedIssue.id || selectedIssue.issue_id) : activeSelectedIssueId) ||
        'TICK-1002'
      ).trim().toUpperCase();

      // Initialize CompositeMeetingRecorder on student side for dual-participant recording
      try {
        if (studentCompositeRecorderRef.current) {
          try { studentCompositeRecorderRef.current.stop(); } catch (e) { }
        }
        studentCompositeRecorderRef.current = new CompositeMeetingRecorder({
          localStream: stream,
          localLabel: student?.name || 'Student',
          remoteLabel: 'Relationship Officer',
          ticketId: targetIssueId || 'TICKET',
          localRole: 'Student',
          remoteRole: 'RO',
          width: 960,
          height: 540,
          fps: 20
        });
        studentCompositeRecorderRef.current.start();
      } catch (compErr) {
        console.warn('Student CompositeMeetingRecorder init error:', compErr);
      }

      // Initialize WebRTC Meeting Session for live peer video with RO
      if (targetIssueId) {
        if (webrtcSessionRef.current && !webrtcSessionRef.current.isClosed) {
          webrtcSessionRef.current.updateLocalStream(stream);
        } else {
          if (webrtcSessionRef.current) {
            try { webrtcSessionRef.current.close(); } catch (e) { }
          }
          webrtcSessionRef.current = new WebRtcMeetingSession({
            issueId: targetIssueId,
            role: 'student',
            localStream: stream,
            onRemoteStream: (remStream) => {
              console.log('[Student] Remote RO stream received:', remStream);
              setRoRemoteStream(remStream);
              if (studentCompositeRecorderRef.current) {
                studentCompositeRecorderRef.current.setRemoteStream(remStream);
              }
            },
            onPeerStatus: (status) => {
              setPeerConnected(Boolean(status.connected));
              if (!status.connected) {
                setRoRemoteStream(null);
                if (studentCompositeRecorderRef.current) {
                  studentCompositeRecorderRef.current.setRemoteStream(null);
                }
              }
            },
            onRemoteMediaState: (state) => {
              if (typeof state.video === 'boolean') {
                setIsRoCameraOff(!state.video);
              }
              if (typeof state.audio === 'boolean') {
                setIsRoMicMuted(!state.audio);
              }
            },
            onMeetingEnded: () => {
              console.log('[Student] Meeting ended signal received from RO.');
              handleCloseStudentVideo();
              setMeetingEndedPopup({
                show: true,
                issueId: targetIssueId,
                roName: selectedIssue?.roName || activeFormRO?.name || 'Relationship Officer',
                endedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              });
            }
          });
        }
      }
    } catch (err) {
      console.warn('Student camera/mic permission error fallback:', err);
      const fallbackStream = createFallbackMediaStream({
        label: student?.name || 'Student',
        role: 'Student'
      });
      studentStreamRef.current = fallbackStream;
      setStudentStream(fallbackStream);
      setStudentMediaPermissionState('granted');
    } finally {
      isMediaRequestingRef.current = false;
    }
  };

  const handleStudentJoinMeeting = (targetIssueId) => {
    const cleanId = String(
      targetIssueId ||
      activeMeetingIssueId ||
      activeStudentOnlineMeeting?.issueId ||
      activeStudentOnlineMeeting?.issue_id ||
      selectedIssueId ||
      activeSelectedIssueId ||
      'TICK-1002'
    ).trim().toUpperCase();
    setMeetingEndedPopup(null);
    setSelectedIssueId(cleanId);
    setActiveMeetingIssueId(cleanId);
    setShowStudentVideoModal(true);
  };

  const toggleStudentMic = () => {
    const nextMuted = !isStudentMicMuted;
    setIsStudentMicMuted(nextMuted);
    if (studentStreamRef.current) {
      studentStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
    }
    if (webrtcSessionRef.current) {
      webrtcSessionRef.current.setAudioEnabled(!nextMuted);
    }
    if (studentCompositeRecorderRef.current) {
      studentCompositeRecorderRef.current.setLocalMicMuted(nextMuted);
    }
  };

  const toggleStudentCamera = () => {
    const nextCamOff = !isStudentCamOff;
    setIsStudentCamOff(nextCamOff);
    if (studentStreamRef.current) {
      studentStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !nextCamOff;
      });
    }
    if (webrtcSessionRef.current) {
      webrtcSessionRef.current.setVideoEnabled(!nextCamOff);
    }
    if (studentCompositeRecorderRef.current) {
      studentCompositeRecorderRef.current.setLocalCamOff(nextCamOff);
    }
  };

  const handleCloseStudentVideo = async () => {
    isMediaRequestingRef.current = false;
    // If student has active recorder, finalize composite recording
    if (studentCompositeRecorderRef.current) {
      try {
        const { videoUrl, durationSeconds } = await studentCompositeRecorderRef.current.stop();
        const currentMeet = selectedIssue ? (db.meetings || []).find(m =>
          (m.issueId || m.issue_id)?.toUpperCase() === (selectedIssue.id || selectedIssue.issue_id)?.toUpperCase()
        ) : null;
        if (currentMeet && currentMeet.status !== 'Completed' && videoUrl) {
          saveMeetingRecording(
            currentMeet.id || currentMeet.issueId,
            selectedIssue.id,
            durationSeconds || 10,
            videoUrl,
            `Dual-Participant Live Session (Student: ${student.name} & RO) concluded and auto-archived with side-by-side video and dual-mic audio.`
          );
        }
      } catch (e) {
        console.warn('Student composite recorder finalize error:', e);
      }
      studentCompositeRecorderRef.current = null;
    }

    setShowStudentVideoModal(false);
    setActiveMeetingIssueId(null);
    setStudentMediaPermissionState('idle');
    if (webrtcSessionRef.current) {
      try { webrtcSessionRef.current.close(); } catch (e) { }
      webrtcSessionRef.current = null;
    }
    setRoRemoteStream(null);
    setStudentStream(null);
    setPeerConnected(false);
    if (studentStreamRef.current) {
      studentStreamRef.current.getTracks().forEach(track => track.stop());
      studentStreamRef.current = null;
    }
  };

  // Auto-exit online meeting when RO ends or marks meeting completed in DB
  useEffect(() => {
    if (showStudentVideoModal) {
      const activeTargetId = String(activeMeetingIssueId || activeStudentOnlineMeeting?.issueId || selectedIssue?.id || '').trim().toUpperCase();
      if (!activeTargetId) return;

      const currentMeet = (db.meetings || []).find(m =>
        (m.issueId || m.issue_id)?.toUpperCase() === activeTargetId ||
        (m.id && String(m.id).toUpperCase() === activeTargetId)
      );

      // ONLY auto-exit if the meeting was explicitly marked endedByRo === true AND is not currently Started / In-Progress
      if (currentMeet && currentMeet.endedByRo === true && currentMeet.status !== 'Started' && currentMeet.status !== 'In-Progress') {
        handleCloseStudentVideo();
        setMeetingEndedPopup({
          show: true,
          issueId: activeTargetId,
          roName: currentMeet.roName || selectedIssue?.roName || activeFormRO?.name || 'Relationship Officer',
          endedAt: currentMeet.endedAt ? new Date(currentMeet.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        });
      }
    }
  }, [db.meetings, showStudentVideoModal, activeMeetingIssueId, activeStudentOnlineMeeting, selectedIssue, activeFormRO]);

  // Real-time broadcast listener for instant meeting status changes from RO tab
  useEffect(() => {
    let bc;
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        bc = new BroadcastChannel('nitte_meeting_sync');
        bc.onmessage = (event) => {
          if (event.data && event.data.type === 'meeting_status') {
            if (event.data.status === 'Completed' || event.data.status === 'Finished') {
              const endedId = event.data.meetId;
              if (showStudentVideoModal) {
                handleCloseStudentVideo();
                setMeetingEndedPopup({
                  show: true,
                  issueId: endedId,
                  roName: activeFormRO?.name || 'Relationship Officer',
                  endedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
              }
            } else if (event.data.status === 'Started') {
              setMeetingEndedPopup(null);
              if (event.data.meetId) {
                setActiveMeetingIssueId(String(event.data.meetId).trim().toUpperCase());
              }
            }
          }
        };
      }
    } catch (e) { }
    return () => {
      if (bc) try { bc.close(); } catch (e) { }
    };
  }, [myIssues, showStudentVideoModal, activeFormRO]);

  useEffect(() => {
    if (showStudentVideoModal) {
      const targetId = String(
        activeMeetingIssueId ||
        activeStudentOnlineMeeting?.issueId ||
        activeStudentOnlineMeeting?.issue_id ||
        selectedIssueId ||
        activeSelectedIssueId ||
        'TICK-1002'
      ).trim().toUpperCase();
      requestStudentMedia(targetId);
    } else {
      isMediaRequestingRef.current = false;
      setStudentMediaPermissionState('idle');
      if (studentCompositeRecorderRef.current) {
        try { studentCompositeRecorderRef.current.stop(); } catch (e) { }
        studentCompositeRecorderRef.current = null;
      }
      if (webrtcSessionRef.current) {
        try { webrtcSessionRef.current.close(); } catch (e) { }
        webrtcSessionRef.current = null;
      }
      setRoRemoteStream(null);
      setStudentStream(null);
      setPeerConnected(false);
      if (studentStreamRef.current) {
        studentStreamRef.current.getTracks().forEach(t => t.stop());
        studentStreamRef.current = null;
      }
    }
  }, [showStudentVideoModal]);

  // Resources and sessions from their mentor
  const myResources = db.resources.filter(r => r.mentorId === student.mentorId);
  const mySessions = db.groupSessions.filter(s => s.mentorId === student.mentorId);

  // 7-Day Limit + Feedback & Rating Unlock Rule:
  // 1. Students can only have 2 issues open / occupied at a time.
  // 2. Each issue has a 7-day cooldown from creation.
  // 3. When an issue is resolved, student MUST submit feedback & rating to unlock the slot.
  //    Until feedback & rating is submitted, the issue/slot stays locked!
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const getIssueLockDetails = (issue) => {
    if (!issue) return { isLocked: false };

    const isResolvedOrClosed = issue.status === 'Resolved' || issue.status === 'Closed';
    const hasFeedback = Boolean(issue.feedback && (issue.feedback.rating || issue.feedbackRating));

    const rawDate = issue.createdAt || issue.created_at;
    const t = rawDate ? new Date(rawDate).getTime() : 0;
    const openDate = t > 0 ? new Date(t + SEVEN_DAYS_MS) : null;
    const msLeft = t > 0 ? Math.max(0, (t + SEVEN_DAYS_MS) - Date.now()) : 0;

    let cooldownDays = 0, cooldownHours = 0, cooldownMinutes = 0, unlockTimeStr = '';
    let openAtStr = '';
    if (openDate && !isNaN(openDate.getTime())) {
      openAtStr = openDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + ' at ' + openDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    if (msLeft > 0) {
      cooldownDays = Math.floor(msLeft / (1000 * 60 * 60 * 24));
      cooldownHours = Math.floor((msLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      cooldownMinutes = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
      unlockTimeStr = cooldownDays > 0 ? `${cooldownDays}d ${cooldownHours}h` : `${cooldownHours}h ${cooldownMinutes}m`;
    }

    // Condition A: If ticket is still Open / In-Progress / Escalated -> Locks slot
    if (!isResolvedOrClosed) {
      return {
        isLocked: true,
        reason: 'open',
        badge: '🔴 Active Open Issue',
        badgeColor: '#ef4444',
        badgeBg: '#fef2f2',
        title: `Ticket #${issue.id}`,
        category: issue.category,
        msg: `Currently active with ${issue.roName || 'Relationship Officer'}. Maximum 2 open issues allowed.`,
        msLeft,
        unlockTimeStr,
        openAtStr,
        needsFeedback: false
      };
    }

    // Condition B: If ticket is Resolved/Closed BUT student has NOT submitted feedback & rating -> Stays locked!
    if (!hasFeedback) {
      return {
        isLocked: true,
        reason: 'pending_feedback',
        badge: '⭐ Feedback & Rating Required',
        badgeColor: '#d97706',
        badgeBg: '#fffbeb',
        title: `Ticket #${issue.id}`,
        category: issue.category,
        msg: `Ticket is resolved by RO! You must submit your rating & feedback to unlock this slot.`,
        msLeft,
        unlockTimeStr,
        openAtStr,
        needsFeedback: true
      };
    }

    // Condition C: If feedback was submitted, but 7-day cooldown is still active -> Locks slot until 7 days elapse
    if (msLeft > 0) {
      return {
        isLocked: true,
        reason: 'cooldown',
        badge: '⏳ 7-Day Limit Active',
        badgeColor: '#f59e0b',
        badgeBg: '#fef3c7',
        title: `Ticket #${issue.id}`,
        category: issue.category,
        msg: `Feedback submitted (${issue.feedback?.rating || issue.feedbackRating}★). 7-Day cooldown in progress.`,
        msLeft,
        unlockTimeStr,
        openAtStr,
        needsFeedback: false
      };
    }

    // Condition D: Resolved + Feedback submitted + 7 days completed -> Unlocked!
    return {
      isLocked: false,
      reason: 'unlocked',
      openAtStr,
      needsFeedback: false
    };
  };

  // Find all issues locking a slot
  const lockingIssueItems = myIssues
    .map(issue => ({ issue, lock: getIssueLockDetails(issue) }))
    .filter(item => item.lock.isLocked)
    .sort((a, b) => {
      // 1. Pending feedback first (actionable by student right now)
      if (a.lock.reason === 'pending_feedback' && b.lock.reason !== 'pending_feedback') return -1;
      if (b.lock.reason === 'pending_feedback' && a.lock.reason !== 'pending_feedback') return 1;
      // 2. Open issues next
      if (a.lock.reason === 'open' && b.lock.reason !== 'open') return -1;
      if (b.lock.reason === 'open' && a.lock.reason !== 'open') return 1;
      // 3. Shortest cooldown remaining
      return (a.lock.msLeft || 0) - (b.lock.msLeft || 0);
    });

  const slot1Item = lockingIssueItems[0] || null;
  const slot2Item = lockingIssueItems[1] || null;
  const slot1Issue = slot1Item?.issue || null;
  const slot2Issue = slot2Item?.issue || null;
  const usedCount = lockingIssueItems.length;
  const maxWeeklyLimit = 2;
  const availableCount = Math.max(0, maxWeeklyLimit - usedCount);
  const isLimitReached = usedCount >= maxWeeklyLimit;
  const isFormLocked = isLimitReached && !isDemoLimitBypassed;

  // Has any resolved ticket pending feedback
  const pendingFeedbackIssues = myIssues.filter(i => {
    const isResolvedOrClosed = i.status === 'Resolved' || i.status === 'Closed';
    const hasFeedback = Boolean(i.feedback && (i.feedback.rating || i.feedbackRating));
    return isResolvedOrClosed && !hasFeedback;
  });

  let formButtonLockText = 'Limit Reached (2 / 2 Slots Occupied)';
  if (pendingFeedbackIssues.length > 0) {
    formButtonLockText = 'Feedback not submitted (Click to complete)';
  } else if (slot1Item?.lock.openAtStr || slot2Item?.lock.openAtStr) {
    const nextOpen = slot1Item?.lock.openAtStr || slot2Item?.lock.openAtStr;
    formButtonLockText = `7-Day Limit Active (Opens: ${nextOpen})`;
  } else if (lockingIssueItems.some(i => i.lock.reason === 'open')) {
    formButtonLockText = '2 Open Issues Active';
  }

  const [errorMessage, setErrorMessage] = useState('');

  const getCategoryVideo = (cat) => {
    if (!cat) return null;
    const cleanCat = String(cat).trim();

    // 1. Fetch freshest video list from state or localStorage
    let list = db.categoryVideos || [];
    try {
      const saved = localStorage.getItem('nitte_saved_category_videos');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const parsedMap = new Map(parsed.map(v => [v.category?.toLowerCase()?.trim(), v]));
          list.forEach(v => {
            const k = v.category?.toLowerCase()?.trim();
            if (!parsedMap.has(k)) parsedMap.set(k, v);
          });
          list = Array.from(parsedMap.values());
        }
      }
    } catch (e) { }

    // Priority 1: Exact match on full category name (e.g. 'Academic - Course Enrollment issues')
    let match = list.find(v => v.category?.toLowerCase()?.trim() === cleanCat.toLowerCase());
    if (match) return match;

    // Priority 2: Match by main category prefix (e.g. 'Academic' from 'Academic - Course Enrollment issues')
    const prefix = cleanCat.split(' - ')[0]?.trim();
    if (prefix) {
      match = list.find(v => v.category?.toLowerCase()?.trim() === prefix.toLowerCase());
      if (match) return match;
    }

    // Priority 3: Video category starts with or contains prefix (e.g. 'Academic Support Desk' contains 'Academic')
    if (prefix) {
      match = list.find(v => {
        const vCat = v.category?.toLowerCase()?.trim() || '';
        return vCat.startsWith(prefix.toLowerCase()) || vCat.includes(prefix.toLowerCase());
      });
      if (match) return match;
    }

    // Priority 4: Category contains video category or vice versa
    match = list.find(v => {
      const vCat = v.category?.toLowerCase()?.trim();
      return vCat && (cleanCat.toLowerCase().includes(vCat) || vCat.includes(cleanCat.toLowerCase()));
    });
    if (match) return match;

    return list[0] || {
      category: 'General',
      title: 'NITTE Student Guidance & Support Walkthrough',
      videoUrl: 'https://www.youtube.com/watch?v=kqtD5dpn9C8',
      description: 'Follow the steps outlined in this guidance video to resolve common university queries.'
    };
  };

  const handleSelfResolveIssue = async () => {
    if (!submissionVideoModal) return;
    const { issueId } = submissionVideoModal;
    await resolveIssue(issueId, 'Student (Self-Resolved via Guidance Video)', 'Resolved by student after watching self-help guidance video.');
    setSubmissionVideoModal(null);
    setActiveTab('my-issues');
    setSelectedIssueId(issueId);
    alert('🎉 Issue Resolved!\n\nYour ticket has been marked as Closed/Resolved. Thank you for using the NITTE self-help solution center!');
  };

  const handleProceedToRO = () => {
    if (!submissionVideoModal) return;
    const { issueId, roName } = submissionVideoModal;
    setSubmissionVideoModal(null);
    setActiveTab('my-issues');
    setSelectedIssueId(issueId);
    alert(`📢 Ticket Forwarded to Relationship Officer:\n\nYour ticket (${issueId}) remains open and assigned to ${roName}. They will review your ticket and schedule a session if needed.`);
  };

  const handleSubmitIssue = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;
    setErrorMessage('');

    // Rule: Feedback must be submitted before registering any new issue
    if (pendingFeedbackIssues.length > 0) {
      setSelectedIssueId(pendingFeedbackIssues[0].id);
      setActiveTab('my-issues');
      setErrorMessage(`Action Required: Please submit your feedback and rating for resolved Ticket #${pendingFeedbackIssues[0].id} first. You can only register a new issue after feedback is submitted.`);
      return;
    }

    if (isFormLocked) {
      const nextTime = slot1Item?.lock.openAtStr || slot2Item?.lock.openAtStr || '7-day limit completion';
      setErrorMessage(`Weekly Limit Reached (2 / 2 Issues Used): Students can submit up to 2 issues per 7 days. Your next issue slot opens on ${nextTime}. (Turn on Demo Mode in header to bypass)`);
      return;
    }

    try {
      const submittedCategory = category;
      const newIssueId = await submitIssue(student.id, category, description, priority);

      setDescription('');
      setCategory(ALL_CATEGORIES[0]);
      setPriority('Medium');
      setSelectedIssueId(newIssueId);

      // Open Instant Solution Video Modal
      setSubmissionVideoModal({
        issueId: newIssueId,
        category: submittedCategory,
        roName: activeFormRO ? activeFormRO.name : 'Relationship Officer'
      });
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit issue');
    }
  };

  const handleFeedbackSubmit = (e) => {
    e.preventDefault();
    const targetId = selectedIssueId || activeSelectedIssueId;
    if (!targetId) return;
    submitFeedback(targetId, rating, feedbackComments);
    setFeedbackComments('');
    setSuccessMessage('Thank you! Your rating & feedback has been submitted. You can now register a new support issue!');
    setTimeout(() => setSuccessMessage(''), 6000);
  };

  const handleReopenSubmit = (e) => {
    e.preventDefault();
    const targetId = selectedIssueId || activeSelectedIssueId;
    if (!targetId) return;

    reopenIssue(targetId, student.id, reopenReason);
    setReopenReason('');
    setShowReopenForm(false);
  };

  const handleMentorFeedbackSubmit = (e) => {
    e.preventDefault();
    if (mfRegularity === 0 || mfClarity === 0 || mfParticipation === 0) return;
    if (!myMentor) return;

    submitMentorFeedback(
      student.id, student.name, myMentor.id, myMentor.name,
      mfRegularity, mfClarity, mfParticipation, mfDifficulties
    );
    setMfRegularity(0);
    setMfClarity(0);
    setMfParticipation(0);
    setMfDifficulties('');
    setMfSuccess('Mentor feedback submitted successfully! Thank you.');
    setTimeout(() => setMfSuccess(''), 3000);
  };

  // Get feedbacks submitted by this student
  const myMentorFeedbacks = (db.mentorFeedbacks || []).filter(f =>
    (f.studentId || '').toLowerCase() === student.id.toLowerCase()
  );

  return (
    <div className="dashboard-layout">
      {/* Sidebar Panel */}
      <div className="glass-card panel-selector">
        {/* Student Profile Card */}
        <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--nitte-blue-light)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: 'var(--nitte-blue)' }}>
              <User size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>{student.name}</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>ID: {student.id} | Sem {student.sem} {student.branch}</p>
            </div>
          </div>
        </div>

        <button
          className={`panel-btn ${activeTab === 'raise-issue' ? 'active Student' : ''}`}
          onClick={() => setActiveTab('raise-issue')}
        >
          <AlertCircle size={18} />
          <span>Report a Support Issue</span>
        </button>

        <button
          className={`panel-btn ${activeTab === 'my-issues' ? 'active Student' : ''}`}
          onClick={() => setActiveTab('my-issues')}
        >
          <Clock size={18} />
          <span>Track My Issues ({myIssues.length})</span>
        </button>

        <button
          className={`panel-btn ${activeTab === 'mentor-hub' ? 'active Student' : ''}`}
          onClick={() => setActiveTab('mentor-hub')}
        >
          <Calendar size={18} />
          <span>Mentorship Hub</span>
        </button>

        <button
          className={`panel-btn ${activeTab === 'mentor-feedback' ? 'active Student' : ''}`}
          onClick={() => setActiveTab('mentor-feedback')}
        >
          <MessageSquare size={18} />
          <span>Mentor Feedback</span>
        </button>

        {/* Routing Explanation Card */}
        <div className="glass-card" style={{ marginTop: 'auto', padding: '16px', fontSize: '0.8rem', background: 'rgba(59,130,246,0.02)', borderLeft: '3px solid var(--accent-blue)' }}>
          <h4 style={{ color: 'var(--accent-blue)', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            ℹ️ Problem-Based Routing
          </h4>
          <p style={{ color: 'var(--text-secondary)' }}>
            Your issues are routed dynamically to one of our 49 specialized Relationship Officers (RO) depending on the problem category you choose.
          </p>
        </div>
      </div>

      {/* Main Content Pane */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>



        {/* ACTIVE ONLINE MEETING CALL-TO-ACTION BANNER */}
        {activeStudentOnlineMeeting && (
          <div className="glass-card" style={{
            borderLeft: (activeStudentOnlineMeeting.status === 'Started' || activeStudentOnlineMeeting.status === 'In-Progress') ? '4px solid #10b981' : '4px solid #64748b',
            background: (activeStudentOnlineMeeting.status === 'Started' || activeStudentOnlineMeeting.status === 'In-Progress') ? 'rgba(16, 185, 129, 0.12)' : 'rgba(100, 116, 139, 0.08)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            borderRadius: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: (activeStudentOnlineMeeting.status === 'Started' || activeStudentOnlineMeeting.status === 'In-Progress') ? '#10b981' : '#64748b',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: (activeStudentOnlineMeeting.status === 'Started' || activeStudentOnlineMeeting.status === 'In-Progress') ? '0 0 16px rgba(16,185,129,0.5)' : 'none'
              }}>
                <Video size={22} />
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: (activeStudentOnlineMeeting.status === 'Started' || activeStudentOnlineMeeting.status === 'In-Progress') ? '#059669' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {(activeStudentOnlineMeeting.status === 'Started' || activeStudentOnlineMeeting.status === 'In-Progress') ? (
                    <>Live RO Video Meeting In-Progress</>
                  ) : (
                    <>Online Video Meeting Scheduled</>
                  )}
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: (activeStudentOnlineMeeting.status === 'Started' || activeStudentOnlineMeeting.status === 'In-Progress') ? '#10b981' : '#64748b', color: '#fff', fontWeight: 700 }}>
                    {(activeStudentOnlineMeeting.status === 'Started' || activeStudentOnlineMeeting.status === 'In-Progress') ? 'LIVE NOW' : 'WAITING FOR RO'}
                  </span>
                </h4>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Ticket: <strong>{activeStudentOnlineMeeting.issueId || activeStudentOnlineMeeting.issue_id}</strong> &nbsp;|&nbsp;
                  Date: <strong>{activeStudentOnlineMeeting.date}</strong> at <strong>{activeStudentOnlineMeeting.time}</strong>
                  {(activeStudentOnlineMeeting.status !== 'Started' && activeStudentOnlineMeeting.status !== 'In-Progress') && (
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>• (Meeting portal unlocks automatically when RO starts session)</span>
                  )}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {(activeStudentOnlineMeeting.status === 'Started' || activeStudentOnlineMeeting.status === 'In-Progress') ? (
                <button
                  type="button"
                  onClick={() => {
                    const meetId = activeStudentOnlineMeeting.issueId || activeStudentOnlineMeeting.issue_id;
                    handleStudentJoinMeeting(meetId);
                  }}
                  className="btn btn-primary"
                  style={{
                    fontSize: '0.86rem',
                    padding: '9px 20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: '#10b981',
                    border: 'none',
                    fontWeight: 800,
                    cursor: 'pointer',
                    borderRadius: '8px',
                    boxShadow: '0 4px 14px rgba(16,185,129,0.45)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Video size={16} />
                  Join Live Video Meeting Now
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  style={{
                    fontSize: '0.84rem',
                    padding: '8px 16px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(255,255,255,0.08)',
                    color: 'var(--text-secondary)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    fontWeight: 600,
                    cursor: 'not-allowed',
                    borderRadius: '8px',
                    opacity: 0.85
                  }}
                >
                  <Clock size={15} />
                  Waiting for RO to Start Meeting...
                </button>
              )}
            </div>
          </div>
        )}

        {/* DEMO MODE ACTIVE BANNER */}
        {isDemoLimitBypassed && (
          <div className="glass-card" style={{ borderLeft: '4px solid #10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'space-between', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#047857' }}>
                <span style={{ fontSize: '1.25rem' }}>🔓</span>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  <strong>Demo Mode Active:</strong> 7-Day Rate Limit is Bypassed. Unlimited issue submissions allowed for testing.
                </span>
              </div>
              <button
                onClick={toggleDemoLimitBypass}
                style={{ backgroundColor: '#ffffff', color: '#047857', border: '1px solid #a7f3d0', padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Turn Limit ON
              </button>
            </div>
          </div>
        )}



        {/* SUCCESS MESSAGE */}
        {successMessage && (
          <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-emerald)', background: 'rgba(16,185,129,0.1)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgb(110,231,183)' }}>
              <CheckCircle2 size={20} />
              <span>{successMessage}</span>
            </div>
          </div>
        )}

        {/* TAB 1: RAISE ISSUE */}
        {activeTab === 'raise-issue' && (
          <div className="glass-card">
            <h2 className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Raise an Issue / Support Request</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.8rem', color: isFormLocked ? '#b45309' : '#047857', backgroundColor: isFormLocked ? '#fef3c7' : '#d1fae5', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                  {isFormLocked ? '🔒 Limit Reached (2/2 Used)' : `Weekly Limit: ${availableCount} / 2 Available`}
                </span>
                {isDemoLimitBypassed && (
                  <span style={{ fontSize: '0.75rem', color: '#047857', backgroundColor: '#ecfdf5', padding: '4px 8px', borderRadius: '12px', fontWeight: 700, border: '1px solid #a7f3d0' }}>
                    ⚡ Demo Mode ON
                  </span>
                )}
              </div>
            </h2>

            {/* VISUAL 2-SLOT LIMIT TRACKER WIDGET */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>

              {/* SLOT #1 */}
              <div style={{
                padding: '14px 16px',
                borderRadius: '12px',
                border: slot1Item ? '1px solid #fde68a' : '1px solid #a7f3d0',
                background: slot1Item ? '#fffbeb' : '#f0fdf4',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '85px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: slot1Item ? '#92400e' : '#166534' }}>
                    Slot 1
                  </h4>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: slot1Item ? '#fef3c7' : '#dcfce7',
                    color: slot1Item ? '#92400e' : '#15803d',
                    border: '1px solid currentColor'
                  }}>
                    {slot1Item ? 'Occupied' : 'Available'}
                  </span>
                </div>

                <div style={{ marginTop: '8px' }}>
                  {slot1Item ? (
                    <div>
                      {slot1Item.lock.openAtStr && (
                        <div style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>
                          Opens on: {slot1Item.lock.openAtStr}
                        </div>
                      )}
                      {slot1Item.lock.needsFeedback && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIssueId(slot1Item.issue.id);
                            setActiveTab('my-issues');
                          }}
                          style={{
                            marginTop: '8px',
                            padding: '4px 10px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background: '#d97706',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'inline-block'
                          }}
                        >
                          Feedback not submitted
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 500 }}>
                      Available for new issue
                    </div>
                  )}
                </div>
              </div>

              {/* SLOT #2 */}
              <div style={{
                padding: '14px 16px',
                borderRadius: '12px',
                border: slot2Item ? '1px solid #fde68a' : '1px solid #a7f3d0',
                background: slot2Item ? '#fffbeb' : '#f0fdf4',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                minHeight: '85px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: slot2Item ? '#92400e' : '#166534' }}>
                    Slot 2
                  </h4>
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: slot2Item ? '#fef3c7' : '#dcfce7',
                    color: slot2Item ? '#92400e' : '#15803d',
                    border: '1px solid currentColor'
                  }}>
                    {slot2Item ? 'Occupied' : 'Available'}
                  </span>
                </div>

                <div style={{ marginTop: '8px' }}>
                  {slot2Item ? (
                    <div>
                      {slot2Item.lock.openAtStr && (
                        <div style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>
                          Opens on: {slot2Item.lock.openAtStr}
                        </div>
                      )}
                      {slot2Item.lock.needsFeedback && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIssueId(slot2Item.issue.id);
                            setActiveTab('my-issues');
                          }}
                          style={{
                            marginTop: '8px',
                            padding: '4px 10px',
                            fontSize: '0.74rem',
                            fontWeight: 700,
                            background: '#d97706',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'inline-block'
                          }}
                        >
                          Feedback not submitted
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#166534', fontWeight: 500 }}>
                      Available for new issue
                    </div>
                  )}
                </div>
              </div>

            </div>

            <form onSubmit={handleSubmitIssue}>
              <fieldset disabled={isFormLocked} style={{ border: 'none', padding: 0, margin: 0 }}>
                <div className="form-group">
                  <label className="form-label">Issue Category (from 50 support domains)</label>
                  <select
                    className="form-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {ALL_CATEGORIES.map((cat, idx) => (
                      <option key={idx} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="grid-cols-4" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '0' }}>
                  <div className="form-group">
                    <label className="form-label">Priority Level</label>
                    <select
                      className="form-select"
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      <option value="Low">🟢 Low (General queries)</option>
                      <option value="Medium">🟡 Medium (Academic details, forms)</option>
                      <option value="High">🔴 High (Urgent food, health, exam issues)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Assigned Relationship Officer (RO)</label>
                    <input
                      type="text"
                      className="form-control"
                      readOnly
                      disabled
                      value={activeFormRO ? `${activeFormRO.name} (${activeFormRO.region})` : 'System Auto-routing'}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Describe your issue in detail</label>
                  <textarea
                    className="form-textarea"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={isFormLocked ? "Weekly limit reached (2 / 2 used). Turn on Demo Mode in header to bypass." : "Provide registration numbers, courses, hostel block room numbers, or any administrative detail to help resolve this quickly..."}
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isFormLocked || pendingFeedbackIssues.length > 0}
                  onClick={(e) => {
                    if (pendingFeedbackIssues.length > 0) {
                      e.preventDefault();
                      setSelectedIssueId(pendingFeedbackIssues[0].id);
                      setActiveTab('my-issues');
                    }
                  }}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    opacity: (isFormLocked || pendingFeedbackIssues.length > 0) ? 0.6 : 1,
                    cursor: (isFormLocked || pendingFeedbackIssues.length > 0) ? 'not-allowed' : 'pointer'
                  }}
                >
                  {pendingFeedbackIssues.length > 0 ? (
                    <>Feedback not submitted (Click to complete)</>
                  ) : isFormLocked ? (
                    <>{formButtonLockText}</>
                  ) : (
                    <><Send size={16} /> Submit Support Request ({availableCount} / 2 Available)</>
                  )}
                </button>
              </fieldset>
            </form>
          </div>
        )}

        {/* TAB 2: MY ISSUES */}
        {activeTab === 'my-issues' && (
          <div style={{ display: 'grid', gridTemplateColumns: myIssues.length > 0 ? '1fr 1fr' : '1fr', gap: '20px' }}>

            {/* List Section */}
            <div className="glass-card">
              <h2 className="section-title">Support History</h2>

              {myIssues.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <FileText size={48} style={{ marginBottom: '12px', opacity: 0.5 }} />
                  <p>You have not submitted any issues yet.</p>
                </div>
              ) : (
                myIssues.map(issue => {
                  const badgeClass = `badge badge-${issue.status.toLowerCase().replace(' ', '-')}`;
                  const isSelected = activeSelectedIssueId === issue.id;

                  return (
                    <div
                      key={issue.id}
                      onClick={() => setSelectedIssueId(issue.id)}
                      className={`glass-card issue-card ${issue.priority}`}
                      style={{
                        background: isSelected ? 'rgba(255,255,255,0.06)' : '',
                        borderColor: isSelected ? 'rgba(99,102,241,0.5)' : ''
                      }}
                    >
                      <div className="issue-card-header">
                        <div>
                          <strong style={{ fontSize: '0.95rem' }}>{issue.category}</strong>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Ticket: {issue.id}</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span className={badgeClass}>{issue.status}</span>
                          {(issue.status === 'Resolved' || issue.status === 'Closed') && (!issue.feedback || !issue.feedback.rating) && (
                            <span style={{ fontSize: '0.66rem', fontWeight: 700, padding: '2px 6px', borderRadius: '8px', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' }}>
                              ⭐ Rating Required
                            </span>
                          )}
                        </div>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {issue.description}
                      </p>
                      <div className="issue-meta">
                        <span>Submitted: {new Date(issue.createdAt).toLocaleDateString()}</span>
                        <span>Priority: <strong>{issue.priority}</strong></span>
                      </div>

                      {/* INLINE MEETING BUTTON FOR TICKET SLOT */}
                      {(() => {
                        if (issue.status === 'Resolved' || issue.status === 'Closed') return null;
                        const m = (db.meetings || []).find(meet => (meet.issueId || meet.issue_id)?.toUpperCase() === issue.id?.toUpperCase());
                        if (!m && issue.status !== 'Meeting Scheduled' && issue.status !== 'Meeting Started') return null;

                        const isCompleted = m && (m.status === 'Completed' || m.status === 'Finished' || m.status === 'Cancelled' || m.status === 'Concluded');
                        if (isCompleted) return null;

                        const modeLower = (m?.mode || '').toLowerCase();
                        const isOffline = modeLower.includes('offline') || modeLower.includes('in-person');
                        if (isOffline) return null;

                        const isLive = (m && (m.status === 'Started' || m.status === 'In-Progress')) || issue.status === 'Meeting Started';
                        const isScheduled = (m && !isCompleted) || issue.status === 'Meeting Scheduled' || issue.status === 'Meeting Started';
                        if (!isScheduled && !isLive) return null;
                        return (
                          <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.73rem', color: isLive ? '#10b981' : 'var(--text-secondary)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Video size={13} /> {isLive ? 'Session Live Now' : 'Meeting Scheduled'}
                            </span>
                            {isLive ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStudentJoinMeeting(issue.id);
                                }}
                                className="btn btn-primary"
                                style={{
                                  fontSize: '0.74rem',
                                  padding: '4px 10px',
                                  background: '#10b981',
                                  border: 'none',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  borderRadius: '6px',
                                  boxShadow: '0 2px 8px rgba(16,185,129,0.4)'
                                }}
                              >
                                <Video size={12} /> Join Live Now
                              </button>
                            ) : (
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                Awaiting RO Launch
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })
              )}
            </div>

            {/* Details Section */}
            {selectedIssue && (
              <div className="glass-card" style={{ position: 'sticky', top: '90px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Ticket Details</h3>
                  <span className={`badge badge-${selectedIssue.status.toLowerCase().replace(' ', '-')}`}>{selectedIssue.status}</span>
                </div>

                <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '0.85rem' }}>
                  <p style={{ color: 'var(--text-secondary)' }}><strong>Category:</strong> {selectedIssue.category}</p>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '6px' }}><strong>Priority:</strong> {selectedIssue.priority}</p>
                  <p style={{ color: 'var(--text-secondary)', marginTop: '6px' }}><strong>Created:</strong> {new Date(selectedIssue.createdAt).toLocaleString()}</p>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>Issue Description:</h4>
                  <p style={{ fontSize: '0.9rem', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                    {selectedIssue.description}
                  </p>
                </div>

                {/* Instant Guidance & Solution Video Button */}
                <div style={{ marginBottom: '20px' }}>
                  <button
                    type="button"
                    onClick={() => setSubmissionVideoModal({
                      issueId: selectedIssue.id,
                      category: selectedIssue.category,
                      roName: selectedIssue.roName || 'Relationship Officer'
                    })}
                    className="btn btn-secondary"
                    style={{ width: '100%', fontSize: '0.82rem', padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
                  >
                    <Play size={15} fill="#ef4444" style={{ color: '#ef4444' }} />
                    <span>🎥 Watch Solution Video for this Issue ({selectedIssue.category})</span>
                  </button>
                </div>

                {/* RESOLUTION DETAILS */}
                {selectedIssue.status === 'Resolved' && (
                  <div style={{ borderLeft: '3px solid var(--accent-emerald)', background: 'rgba(16,185,129,0.05)', padding: '12px', borderRadius: '4px', marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'rgb(110,231,183)', marginBottom: '4px' }}>Resolution Action Note:</h4>
                    <p style={{ fontSize: '0.85rem' }}>{selectedIssue.resolutionNotes}</p>
                    {selectedIssue.resolvedAt && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Closed at: {new Date(selectedIssue.resolvedAt).toLocaleString()}</span>
                    )}
                  </div>
                )}

                {/* RO ASSIGNED MEETING DETAILS */}
                {selectedIssue.status !== 'Resolved' && (
                  <div style={{ border: '1px solid var(--border-color)', background: 'var(--bg-tertiary)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--nitte-blue)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={16} /> Meeting Scheduled by Relationship Officer
                    </h4>

                    {(() => {
                      const rawMatches = (db.meetings || []).filter(m =>
                        (m.issueId || m.issue_id)?.toUpperCase() === (selectedIssue.id || selectedIssue.issue_id)?.toUpperCase()
                      );
                      const matchingMeetings = rawMatches.length > 0 ? rawMatches : (
                        (selectedIssue.status === 'Meeting Scheduled' || selectedIssue.status === 'Meeting Started') ? [{
                          id: `MEET-${selectedIssue.id}`,
                          issueId: selectedIssue.id,
                          issue_id: selectedIssue.id,
                          date: new Date().toISOString().split('T')[0],
                          time: '11:00',
                          mode: 'Online',
                          location: 'In-App Online Video Call Portal',
                          notes: 'Scheduled meeting session with Relationship Officer.',
                          status: selectedIssue.status === 'Meeting Started' ? 'Started' : 'Confirmed'
                        }] : []
                      );
                      if (matchingMeetings.length === 0) {
                        return (
                          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px dashed var(--border-color)' }}>
                            <p>No meeting has been scheduled by your Relationship Officer yet.</p>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                              Your assigned RO will review your ticket and schedule a date, time, and meeting location here if an in-person or online session is required.
                            </p>
                          </div>
                        );
                      }

                      // Render latest meeting record for this issue
                      const meet = matchingMeetings[matchingMeetings.length - 1];
                      const modeLower = (meet.mode || '').toLowerCase();
                      const locLower = (meet.location || '').toLowerCase();
                      const isOnline = !meet.mode || modeLower.includes('online') || locLower.includes('meet') || locLower.includes('zoom') || locLower.includes('video') || locLower.includes('portal');
                      const isLive = meet.status === 'Started' || meet.status === 'In-Progress';
                      const isCompleted = (meet.status === 'Completed' || meet.status === 'Finished' || meet.status === 'Cancelled') && !isLive;

                      return (
                        <div key={meet.id} style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                              {meet.date} at {meet.time}
                            </span>
                            <span
                              className={`badge ${isLive ? 'badge-in-progress' : (isCompleted ? 'badge-resolved' : 'badge-scheduled')}`}
                              style={isLive ? { background: '#10b981', color: '#ffffff' } : {}}
                            >
                              {isLive ? 'In Progress' : (meet.status || 'Scheduled')}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            <strong>Location / Venue:</strong> {meet.location || (isOnline ? 'In-App Online Video Call Portal' : 'RO Office Desk (Admin Block)')}
                          </p>
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                            <strong>Mode:</strong> {meet.mode || 'Online Video Meeting'}
                          </p>
                          {meet.notes && (
                            <p style={{ fontSize: '0.82rem', color: 'var(--nitte-blue)', marginTop: '8px', background: 'var(--nitte-blue-light)', border: '1px solid var(--nitte-blue-soft)', padding: '8px 12px', borderRadius: '6px' }}>
                              <strong>RO Instructions for Student:</strong> {meet.notes}
                            </p>
                          )}

                          {/* LOGGED POST-MEETING DISCUSSION MINUTES */}
                          {meet.discussionSummary && (
                            <div style={{ marginTop: '10px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '10px 14px', borderRadius: '6px', fontSize: '0.82rem' }}>
                              <div style={{ fontWeight: '700', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                <FileText size={15} /> Official Meeting Deliberations & Discussion Record:
                              </div>
                              <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.45 }}>{meet.discussionSummary}</p>
                              {meet.actionItems && (
                                <p style={{ marginTop: '6px', marginBottom: 0, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                                  <strong>Agreed Action Items:</strong> {meet.actionItems}
                                </p>
                              )}
                            </div>
                          )}

                          {/* ONLINE MEETING AUTO-RECORDING NOTICE & STUDENT JOIN BUTTON */}
                          {isOnline && (
                            <div style={{ marginTop: '10px', padding: '10px 12px', background: isLive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.08)', border: isLive ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px', fontSize: '0.8rem' }}>
                              <div style={{ fontWeight: '700', color: isLive ? '#10b981' : 'var(--nitte-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Video size={15} /> {isLive ? 'Live Online Video Call Session (In-Progress)' : 'Online Video Call Session Scheduled'}
                              </div>
                              <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', marginTop: '4px' }}>
                                Your Relationship Officer conducts this session via encrypted online video call. As per university compliance, this session is <strong>automatically recorded and archived</strong> to your ticket record for official reference.
                              </p>
                              {!isCompleted && (
                                <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                  {isLive ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const meetIssueId = meet.issueId || meet.issue_id || (selectedIssue ? selectedIssue.id : null);
                                        handleStudentJoinMeeting(meetIssueId);
                                      }}
                                      className="btn btn-primary"
                                      style={{
                                        fontSize: '0.82rem',
                                        padding: '8px 18px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: '#10b981',
                                        border: 'none',
                                        fontWeight: 700,
                                        boxShadow: '0 2px 10px rgba(16,185,129,0.4)',
                                        cursor: 'pointer',
                                        borderRadius: '6px'
                                      }}
                                    >
                                      <Video size={14} /> Join Live RO Session (Dual Recording Active)
                                    </button>
                                  ) : (
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                      <Clock size={14} style={{ color: 'var(--text-secondary)' }} />
                                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                        Scheduled for {meet.date} at {meet.time}. Meeting link will unlock automatically when RO starts the session.
                                      </span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* STORED VIDEO RECORDINGS ARCHIVE FOR STUDENT */}
                {db.recordings && db.recordings.filter(r => (r.issueId || r.issue_id)?.toUpperCase() === selectedIssue.id?.toUpperCase()).length > 0 && (
                  <div style={{ border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.05)', padding: '12px 14px', borderRadius: '6px', marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#10b981', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Video size={15} /> Auto-Archived Dual-Participant Video Recordings ({db.recordings.filter(r => (r.issueId || r.issue_id)?.toUpperCase() === selectedIssue.id?.toUpperCase()).length})
                    </h4>
                    {db.recordings.filter(r => (r.issueId || r.issue_id)?.toUpperCase() === selectedIssue.id?.toUpperCase()).map(rec => (
                      <div key={rec.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: '4px', marginTop: '6px', fontSize: '0.78rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: '700', color: '#10b981' }}>🎥 {rec.mode} ({rec.durationText})</span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Recorded: {new Date(rec.recordedAt).toLocaleString()}</span>
                        </div>
                        <p style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>{rec.transcriptSummary}</p>
                        <div style={{ marginTop: '6px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={() => setPlayingRecording(rec)}
                            className="btn btn-primary"
                            style={{ fontSize: '0.75rem', padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          >
                            <Play size={12} /> Play Stored Video Recording
                          </button>
                          {rec.videoUrl && rec.videoUrl.startsWith('blob:') && (
                            <a
                              href={rec.videoUrl}
                              download={`recording_${selectedIssue.id}.webm`}
                              style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Download size={12} /> Download .webm
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* FEEDBACK & RATING (WHEN RESOLVED) */}
                {selectedIssue.status === 'Resolved' && (
                  <div style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '8px' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Star size={15} style={{ color: 'var(--accent-amber)' }} /> Resolution Feedback & Rating
                    </h4>

                    {selectedIssue.feedback ? (
                      <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '12px', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {[1, 2, 3, 4, 5].map(num => (
                              <Star key={num} size={14} fill={num <= selectedIssue.feedback.rating ? 'var(--accent-amber)' : 'none'} stroke="var(--accent-amber)" />
                            ))}
                          </div>
                          <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 700 }}>
                            ✅ Feedback Submitted — Slot Unlocked!
                          </span>
                        </div>
                        <p style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-secondary)', margin: 0 }}>"{selectedIssue.feedback.comments}"</p>
                      </div>
                    ) : (
                      <form onSubmit={handleFeedbackSubmit}>
                        <div style={{
                          background: 'rgba(245, 158, 11, 0.1)',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          padding: '10px 14px',
                          borderRadius: '8px',
                          marginBottom: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px'
                        }}>
                          <span style={{ fontSize: '1.2rem' }}>⭐</span>
                          <div style={{ fontSize: '0.8rem', color: '#b45309' }}>
                            <strong>Unlock Your Issue Submission Slot:</strong> Please rate your resolution experience and submit feedback. Your issue slot stays locked until this feedback is submitted.
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Rate your experience:</span>
                          <div className="star-rating">
                            {[1, 2, 3, 4, 5].map((num) => (
                              <button
                                key={num}
                                type="button"
                                className={`star-btn ${rating >= num ? 'active' : ''}`}
                                onClick={() => setRating(num)}
                              >
                                <Star size={18} fill={rating >= num ? 'var(--accent-amber)' : 'none'} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="form-group" style={{ marginBottom: '10px' }}>
                          <input
                            type="text"
                            className="form-control"
                            style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                            placeholder="Add comments on quality of resolution..."
                            value={feedbackComments}
                            onChange={(e) => setFeedbackComments(e.target.value)}
                            required
                          />
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.82rem', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700 }}>
                          <Star size={15} /> Submit Rating & Unlock Issue Slot
                        </button>
                      </form>
                    )}

                    {/* RE-OPEN TICKET OPTION IF DISSATISFIED */}
                    <div style={{ marginTop: '14px', borderTop: '1px dashed var(--border-color)', paddingTop: '12px' }}>
                      {!showReopenForm ? (
                        <button
                          onClick={() => setShowReopenForm(true)}
                          className="btn btn-secondary"
                          style={{ width: '100%', fontSize: '0.8rem', color: 'var(--accent-amber)', borderColor: 'rgba(217, 119, 6, 0.3)' }}
                        >
                          <RotateCcw size={14} /> Not Satisfied? Re-open Ticket with RO
                        </button>
                      ) : (
                        <form onSubmit={handleReopenSubmit} style={{ background: '#ffffff', border: '1px solid #fde68a', padding: '12px', borderRadius: '6px' }}>
                          <h5 style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--accent-amber)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <RotateCcw size={14} /> Re-open Ticket for RO Attention
                          </h5>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            Explain why you are dissatisfied or what advice/help you still need. Your RO will be notified to schedule a meeting again.
                          </p>
                          <div className="form-group" style={{ marginBottom: '8px' }}>
                            <textarea
                              className="form-textarea"
                              style={{ minHeight: '65px', fontSize: '0.8rem' }}
                              placeholder="e.g., The internal marks calculation issue is still pending on my portal. I need an in-person meeting to show my marksheet."
                              required
                              value={reopenReason}
                              onChange={(e) => setReopenReason(e.target.value)}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button type="button" onClick={() => setShowReopenForm(false)} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>Cancel</button>
                            <button type="submit" className="btn btn-warning" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>Confirm & Re-open Ticket</button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                )}

                {/* Audit trail / logs */}
                <div style={{ marginTop: '20px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '8px' }}>Timeline Logs:</h4>
                  <div className="log-timeline">
                    {selectedIssue.logs.map((log, idx) => (
                      <div key={idx} className="log-item">
                        <span>{log.text}</span>
                        <span className="log-time">{new Date(log.time).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {/* TAB 3: MENTORSHIP HUB */}
        {activeTab === 'mentor-hub' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

            {/* Scheduled Mentoring Period Card for Student */}
            {myMentor && (
              <div style={{
                gridColumn: '1 / -1',
                background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 50%, #f0fdf4 100%)',
                border: '1px solid #bfdbfe',
                borderRadius: '12px',
                padding: '14px 18px',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.06)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: '#dbeafe',
                      color: '#1d4ed8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Clock size={18} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '800', color: '#1e3a8a' }}>
                          Official Weekly Mentoring Hour & Period
                        </h4>
                        <span style={{
                          fontSize: '0.68rem',
                          fontWeight: '700',
                          padding: '1px 7px',
                          borderRadius: '999px',
                          background: '#dcfce7',
                          color: '#15803d',
                          border: '1px solid #bbf7d0'
                        }}>
                          ● Timetable Period
                        </span>
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                        Conducted by Mentor <strong>{myMentor.name}</strong> for {myMentor.class || 'your class'}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#1e3a8a' }}>
                      🕒 {db.mentoringSchedules?.[myMentor.id]?.periodSlot || 'Period 1 (09:00 AM - 10:00 AM)'}
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#059669' }}>
                      📅 {db.mentoringSchedules?.[myMentor.id]?.day || 'Friday'}, {db.mentoringSchedules?.[myMentor.id]?.date || '2026-09-25'}
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#d97706' }}>
                      📍 {db.mentoringSchedules?.[myMentor.id]?.venue || 'Seminar Hall 1 (Admin Block)'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Group Mentoring Sessions */}
            <div className="glass-card">
              <h2 className="section-title">Group Sessions ({mySessions.length})</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Your Mentor, <strong>{myMentor ? myMentor.name : 'Faculty'}</strong>, conducts class-level checkins. Individual issues are handled by the RO.
              </p>

              {mySessions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <p>No upcoming group sessions scheduled.</p>
                </div>
              ) : (
                mySessions.map(session => (
                  <div key={session.id} className="glass-card" style={{ marginBottom: '12px', background: 'rgba(255,255,255,0.01)', padding: '16px' }}>
                    <h3 style={{ fontSize: '0.95rem', fontWeight: '700' }}>{session.title}</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', marginTop: '4px' }}>
                      📆 {new Date(session.dateTime).toLocaleString()}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '8px', marginBottom: '12px' }}>
                      {session.description}
                    </p>
                    <a
                      href={session.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                    >
                      Join Meeting Link <ExternalLink size={12} />
                    </a>
                  </div>
                ))
              )}
            </div>

            {/* Shared Academic Resources */}
            <div className="glass-card">
              <h2 className="section-title">Mentor's Resource Center</h2>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Academics guidance notes, reference portals, and registration files.
              </p>

              {myResources.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <p>No shared materials available yet.</p>
                </div>
              ) : (
                myResources.map(res => (
                  <div key={res.id} className="resource-list-item">
                    <div className="resource-info">
                      <span className="resource-type-tag">{res.type}</span>
                      <div>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: '600' }}>{res.title}</h4>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Shared: {res.dateShared}</span>
                      </div>
                    </div>
                    {res.type === 'Link' ? (
                      <a
                        href={res.content}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-icon-only"
                        style={{ padding: '6px' }}
                      >
                        <ExternalLink size={14} />
                      </a>
                    ) : (
                      <button
                        onClick={() => alert(`Content: ${res.content}`)}
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: '0.7rem' }}
                      >
                        View Info
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

          </div>
        )}

        {/* TAB 4: MENTOR / MENTORING CLASS FEEDBACK */}
        {(activeTab === 'mentor-feedback' || activeTab === 'mentor-hub') && (
          <div className="glass-card" style={{ gridColumn: '1 / -1' }}>
            <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={20} style={{ color: 'var(--accent-amber)' }} />
              Mentor / Mentoring Class Feedback
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Share your feedback about your mentor <strong>{myMentor ? myMentor.name : 'Faculty'}</strong> and mentoring classes. Your honest feedback helps improve the mentorship experience.
            </p>

            {mfSuccess && (
              <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#34d399' }}>
                <CheckCircle2 size={16} />
                <span>{mfSuccess}</span>
              </div>
            )}

            <form onSubmit={handleMentorFeedbackSubmit}>
              {/* Mentor Name (Read-only) */}
              <div className="form-group">
                <label className="form-label">Mentor Name</label>
                <input
                  type="text"
                  className="form-control"
                  readOnly
                  disabled
                  value={myMentor ? `${myMentor.name} (${myMentor.dept} — ${myMentor.class || 'All'})` : 'Not Assigned'}
                />
              </div>

              {/* Star Rating Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '16px' }}>
                {/* Regularity */}
                <div>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>Regularity of Mentoring Classes</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3, 4, 5].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setMfRegularity(num)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                      >
                        <Star size={22} fill={mfRegularity >= num ? '#f59e0b' : 'none'} stroke="#f59e0b" />
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    {mfRegularity > 0 ? `${mfRegularity} / 5` : 'Click to rate'}
                  </span>
                </div>

                {/* Clarity */}
                <div>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>Clarity of Explanation</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3, 4, 5].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setMfClarity(num)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                      >
                        <Star size={22} fill={mfClarity >= num ? '#3b82f6' : 'none'} stroke="#3b82f6" />
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    {mfClarity > 0 ? `${mfClarity} / 5` : 'Click to rate'}
                  </span>
                </div>

                {/* Participation */}
                <div>
                  <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>Opportunity to Participate & Express Opinions</label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 2, 3, 4, 5].map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setMfParticipation(num)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px' }}
                      >
                        <Star size={22} fill={mfParticipation >= num ? '#10b981' : 'none'} stroke="#10b981" />
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                    {mfParticipation > 0 ? `${mfParticipation} / 5` : 'Click to rate'}
                  </span>
                </div>
              </div>

              {/* Difficulties Textarea */}
              <div className="form-group">
                <label className="form-label">What difficulties or issues do you face with the mentoring classes or the way they are conducted?</label>
                <textarea
                  className="form-textarea"
                  style={{ minHeight: '100px' }}
                  placeholder="Describe any challenges, suggestions, or concerns about the mentoring sessions..."
                  value={mfDifficulties}
                  onChange={(e) => setMfDifficulties(e.target.value)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={mfRegularity === 0 || mfClarity === 0 || mfParticipation === 0}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  opacity: (mfRegularity === 0 || mfClarity === 0 || mfParticipation === 0) ? 0.5 : 1
                }}
              >
                <Send size={16} /> Submit Mentor Feedback
              </button>
            </form>

            {/* Previously submitted feedbacks */}
            {myMentorFeedbacks.length > 0 && (
              <div style={{ marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                  Your Previous Feedback ({myMentorFeedbacks.length})
                </h4>
                {myMentorFeedbacks.map((fb, idx) => (
                  <div key={fb.id || idx} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', padding: '12px 14px', borderRadius: '8px', marginBottom: '10px', fontSize: '0.82rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>Feedback for {fb.mentorName}</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{new Date(fb.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span>Regularity: <strong style={{ color: '#f59e0b' }}>{fb.regularityRating}/5</strong></span>
                      <span>Clarity: <strong style={{ color: '#3b82f6' }}>{fb.clarityRating}/5</strong></span>
                      <span>Participation: <strong style={{ color: '#10b981' }}>{fb.participationRating}/5</strong></span>
                    </div>
                    {fb.difficulties && (
                      <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', margin: '4px 0 0 0' }}>
                        "{fb.difficulties}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>

      {/* STUDENT ONLINE VIDEO MEETING ROOM MODAL */}
      {showStudentVideoModal && (
        <div className="modal-overlay" style={{ zIndex: 1100, background: 'rgba(3, 7, 18, 0.88)', backdropFilter: 'blur(10px)' }}>
          <div
            className="modal-content"
            style={{
              maxWidth: '1120px',
              width: '95vw',
              maxHeight: '94vh',
              background: 'linear-gradient(180deg, #0b1120 0%, #060911 100%)',
              color: '#f8fafc',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '20px',
              boxShadow: '0 30px 70px -15px rgba(0, 0, 0, 0.9)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Ultra-Sleek Conference Header */}
            <div style={{
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '16px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'rgba(15, 23, 42, 0.5)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  padding: '10px',
                  borderRadius: '12px',
                  color: '#ffffff',
                  boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)'
                }}>
                  <Video size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontWeight: '800', color: '#ffffff', fontSize: '1.15rem', margin: 0, letterSpacing: '-0.02em' }}>
                      NITTE Student Live Mentorship Session
                    </h3>
                    <span style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.68rem', fontWeight: 700 }}>
                      Ticket #{selectedIssue?.id}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '3px 0 0 0' }}>
                    Officer: <strong>{selectedIssue?.roName || 'Relationship Officer (Host)'}</strong> &nbsp;|&nbsp; Category: <strong>{selectedIssue?.category}</strong>
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  padding: '6px 14px',
                  borderRadius: '30px'
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 8px #ef4444' }} />
                  <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#fca5a5', letterSpacing: '0.04em' }}>
                    REC • AUDIO & VIDEO
                  </span>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  padding: '6px 12px',
                  borderRadius: '30px',
                  fontSize: '0.74rem',
                  color: '#6ee7b7',
                  fontWeight: 600
                }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                  {peerConnected ? '⚡ 18ms P2P Live' : 'Connecting...'}
                </div>
              </div>
            </div>

            {/* Modal Body - Video Stage */}
            <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Permission & Notice Banner */}
              {studentMediaPermissionState === 'denied' && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', fontSize: '0.8rem', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={16} style={{ color: '#ef4444' }} />
                    <span><strong>Camera/Mic Notice:</strong> {studentMediaPermissionError || 'Permissions blocked by browser.'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={requestStudentMedia}
                    className="btn btn-warning"
                    style={{ fontSize: '0.74rem', padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <RotateCcw size={12} /> Retry Permissions
                  </button>
                </div>
              )}

              {/* Large Cinematic Video Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '16px', flex: 1 }}>

                {/* RO OFFICER (HOST) LIVE VIDEO FEED */}
                <div style={{
                  background: '#0a0f1d',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  height: '380px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  position: 'relative',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)'
                }}>
                  {roRemoteStream && !isRoCameraOff ? (
                    <VideoStreamPlayer
                      stream={roRemoteStream}
                      muted={false}
                      badge={{ text: isRoMicMuted ? '🔇 RO Host (Mic Muted)' : '🟢 RO Host Live WebCam', color: isRoMicMuted ? '#f59e0b' : '#3b82f6' }}
                      participantName={selectedIssue?.roName || 'Relationship Officer'}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      background: 'radial-gradient(circle at center, #1e293b 0%, #090d16 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative'
                    }}>
                      <div style={{
                        width: '84px',
                        height: '84px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2rem',
                        fontWeight: '800',
                        boxShadow: '0 0 25px rgba(37, 99, 235, 0.5)',
                        border: '2px solid rgba(255, 255, 255, 0.2)'
                      }}>
                        RO
                      </div>
                      <p style={{ marginTop: '14px', fontWeight: '800', fontSize: '1rem', color: '#ffffff', margin: '14px 0 2px 0' }}>
                        {selectedIssue?.roName || 'Relationship Officer'} (Host)
                      </p>
                      <span style={{ fontSize: '0.75rem', color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isRoCameraOff ? '#f59e0b' : (peerConnected ? '#10b981' : '#60a5fa'), display: 'inline-block' }} />
                        {isRoCameraOff ? 'Officer has paused video camera' : (peerConnected ? 'Live Connection Active' : 'Waiting for RO Host to join...')}
                      </span>
                    </div>
                  )}

                  <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(11, 15, 25, 0.75)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', color: roRemoteStream ? '#10b981' : '#94a3b8', zIndex: 5, border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)' }}>
                    {roRemoteStream ? '🟢 Host Live P2P' : (peerConnected ? '🟡 Connecting...' : '⚪ Waiting')}
                  </div>
                </div>

                {/* STUDENT (YOU) LIVE WEBCAM VIDEO FEED */}
                <div style={{
                  background: '#0a0f1d',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  height: '380px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  position: 'relative',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)'
                }}>
                  {isStudentCamOff ? (
                    <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
                      <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
                        <VideoOff size={32} />
                      </div>
                      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>Your Camera is Disabled</p>
                      <button
                        type="button"
                        onClick={toggleStudentCamera}
                        style={{ marginTop: '12px', background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Turn Camera Back On
                      </button>
                    </div>
                  ) : studentMediaPermissionState === 'granted' && studentStream ? (
                    <VideoStreamPlayer
                      stream={studentStream}
                      muted={true}
                      badge={{ text: 'Live HD WebCam (You)', color: '#10b981' }}
                      participantName={student.name}
                    />
                  ) : (
                    <div style={{
                      width: '100%',
                      height: '100%',
                      background: 'radial-gradient(circle at center, #064e3b 0%, #090d16 100%)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative'
                    }}>
                      <div style={{
                        width: '84px',
                        height: '84px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '2rem',
                        fontWeight: '800',
                        boxShadow: '0 0 25px rgba(16, 185, 129, 0.4)',
                        border: '2px solid rgba(255, 255, 255, 0.2)'
                      }}>
                        {student.name ? student.name.charAt(0) : 'S'}
                      </div>
                      <p style={{ marginTop: '14px', fontWeight: '800', fontSize: '1rem', color: '#ffffff', margin: '14px 0 2px 0' }}>
                        {student.name} (You)
                      </p>
                      <span style={{ fontSize: '0.75rem', color: '#a7f3d0' }}>
                        {studentMediaPermissionState === 'requesting' ? 'Connecting webcam...' : 'Student Participant — Live'}
                      </span>
                    </div>
                  )}

                  <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(11, 15, 25, 0.75)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', color: '#10b981', zIndex: 5, border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)' }}>
                    📶 HD Audio/Video
                  </div>
                </div>
              </div>

              {/* Bottom Security Info */}
              <div style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255, 255, 255, 0.06)', padding: '10px 16px', borderRadius: '10px', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                  <Shield size={14} style={{ color: '#10b981' }} />
                  <span><strong>256-bit Encrypted Session</strong> &nbsp;|&nbsp; Live session audio & video recording archived to support ticket</span>
                </div>
                <div style={{ color: '#10b981', fontWeight: 600 }}>
                  Active Mentorship Channel
                </div>
              </div>
            </div>

            {/* Ultra-Modern Floating Controls Dock */}
            <div style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '16px 24px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '16px',
              background: 'rgba(11, 15, 25, 0.85)',
              backdropFilter: 'blur(16px)'
            }}>
              {/* Mic Toggle */}
              <button
                type="button"
                onClick={toggleStudentMic}
                style={{
                  background: isStudentMicMuted ? '#ef4444' : 'rgba(16, 185, 129, 0.15)',
                  color: isStudentMicMuted ? '#ffffff' : '#10b981',
                  border: isStudentMicMuted ? '1px solid #dc2626' : '1px solid rgba(16, 185, 129, 0.35)',
                  padding: '10px 20px',
                  borderRadius: '30px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  transition: 'all 0.2s ease',
                  boxShadow: isStudentMicMuted ? '0 4px 14px rgba(239, 68, 68, 0.3)' : '0 4px 14px rgba(16, 185, 129, 0.15)'
                }}
              >
                {isStudentMicMuted ? <MicOff size={16} /> : <Mic size={16} />}
                <span>{isStudentMicMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
              </button>

              {/* Camera Toggle */}
              <button
                type="button"
                onClick={toggleStudentCamera}
                style={{
                  background: isStudentCamOff ? '#ef4444' : 'rgba(255, 255, 255, 0.08)',
                  color: isStudentCamOff ? '#ffffff' : '#f1f5f9',
                  border: isStudentCamOff ? '1px solid #dc2626' : '1px solid rgba(255, 255, 255, 0.15)',
                  padding: '10px 20px',
                  borderRadius: '30px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  transition: 'all 0.2s ease'
                }}
              >
                {isStudentCamOff ? <VideoOff size={16} /> : <Video size={16} />}
                <span>{isStudentCamOff ? 'Turn Camera On' : 'Turn Camera Off'}</span>
              </button>

              {studentMediaPermissionState !== 'granted' && (
                <button
                  type="button"
                  onClick={requestStudentMedia}
                  style={{
                    background: '#2563eb',
                    color: '#ffffff',
                    border: 'none',
                    padding: '10px 20px',
                    borderRadius: '30px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.82rem',
                    fontWeight: 700
                  }}
                >
                  <Camera size={16} /> Request Cam/Mic Access
                </button>
              )}

              {/* Leave Call Button */}
              <button
                type="button"
                onClick={handleCloseStudentVideo}
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  padding: '10px 22px',
                  borderRadius: '30px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  transition: 'all 0.2s ease',
                  marginLeft: '12px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#ef4444';
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)';
                  e.currentTarget.style.color = '#f87171';
                }}
              >
                <PhoneOff size={16} />
                <span>Leave Call</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIDEO PLAYER MODAL FOR ARCHIVED RECORDINGS FOR STUDENT */}
      {playingRecording && (
        <div className="modal-overlay" style={{ zIndex: 1200, background: 'rgba(0,0,0,0.85)' }}>
          <div className="modal-content" style={{ maxWidth: '750px', width: '92%', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '12px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #334155', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Video size={20} style={{ color: '#10b981' }} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#fff' }}>
                  Archived Online Video Recording ({playingRecording.durationText})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPlayingRecording(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ padding: '20px 0' }}>
              <div style={{ borderRadius: '8px', overflow: 'hidden', background: '#000', marginBottom: '14px' }}>
                <video
                  src={playingRecording.videoUrl}
                  controls
                  autoPlay
                  style={{ width: '100%', maxHeight: '420px', display: 'block' }}
                >
                  Your browser does not support HTML5 video playback.
                </video>
              </div>
              <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '12px 14px', borderRadius: '6px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#10b981', fontWeight: '700' }}>Mode: {playingRecording.mode}</span>
                  <span style={{ color: '#94a3b8' }}>Recorded: {new Date(playingRecording.recordedAt).toLocaleString()}</span>
                </div>
                <p style={{ margin: 0, color: '#cbd5e1' }}>{playingRecording.transcriptSummary}</p>
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid #334155', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {playingRecording.videoUrl && playingRecording.videoUrl.startsWith('blob:') && (
                <a
                  href={playingRecording.videoUrl}
                  download={`recording_${playingRecording.issueId || 'session'}.webm`}
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                >
                  <Download size={14} /> Download Recording (.webm)
                </a>
              )}
              <button
                type="button"
                onClick={() => setPlayingRecording(null)}
                className="btn btn-primary"
                style={{ marginLeft: 'auto' }}
              >
                Close Video Player
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SELF-HELP GUIDANCE & SOLUTION VIDEO MODAL (SHOWN UPON ISSUE SUBMISSION) */}
      {submissionVideoModal && (() => {
        const catVideo = getCategoryVideo(submissionVideoModal.category);
        const rawUrl = catVideo ? (catVideo.videoUrl || catVideo.video_url || '') : '';
        const embedUrl = catVideo ? getYoutubeEmbedUrl(rawUrl) : '';
        const isEmbed = embedUrl.includes('/embed/') || embedUrl.includes('youtube') || embedUrl.includes('youtu.be');

        return (
          <div className="modal-overlay" style={{ zIndex: 1250, background: 'rgba(0,0,0,0.88)' }}>
            <div className="modal-content" style={{ maxWidth: '820px', width: '95%', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }}>
              {/* Header */}
              <div className="modal-header" style={{ borderBottom: '1px solid #334155', paddingBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Play size={22} fill="#ef4444" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#ffffff', fontWeight: '700' }}>
                      Instant Solution & Guidance Video
                    </h3>
                    <p style={{ margin: '3px 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                      Ticket <strong>#{submissionVideoModal.issueId}</strong> &nbsp;|&nbsp; Category: <strong>{submissionVideoModal.category}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleProceedToRO}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px' }}
                  title="Close and keep ticket assigned to RO"
                >
                  <X size={22} />
                </button>
              </div>

              {/* Body */}
              <div className="modal-body" style={{ padding: '16px 0' }}>
                {/* Helpful notice */}
                <div style={{ background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '10px', color: '#93c5fd' }}>
                  <HelpCircle size={18} style={{ color: '#3b82f6', flexShrink: 0 }} />
                  <span>
                    <strong>Self-Help Resolution:</strong> Please review this official solution tutorial. Many routine procedures, portal instructions, and fee/exam requests can be resolved immediately with these steps!
                  </span>
                </div>

                {/* Embedded Video Player */}
                <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '10px', background: '#000', marginBottom: '14px' }}>
                  {isEmbed ? (
                    <iframe
                      src={embedUrl}
                      title={catVideo ? catVideo.title : 'Guidance Video'}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                    />
                  ) : (
                    <video
                      src={rawUrl}
                      controls
                      autoPlay
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                    />
                  )}
                </div>

                {/* Guidance Title & Step-by-Step Notes */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '14px 16px', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', color: '#f8fafc' }}>
                      {catVideo ? catVideo.title : 'Official Guidance Walkthrough'}
                    </h4>
                    <span style={{ fontSize: '0.72rem', background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: '12px' }}>
                      Curated by {catVideo?.updatedBy || 'RO Office'}
                    </span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', color: '#cbd5e1', fontSize: '0.82rem', lineHeight: '1.55' }}>
                    {catVideo?.description}
                  </div>
                </div>
              </div>

              {/* Decision Action Buttons */}
              <div className="modal-footer" style={{ borderTop: '1px solid #334155', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                  Did this video resolve your question?
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {/* OPTION 1: Self-Resolve and Close Ticket */}
                  <button
                    type="button"
                    onClick={handleSelfResolveIssue}
                    className="btn btn-success"
                    style={{ background: '#10b981', borderColor: '#10b981', color: '#ffffff', fontWeight: '700', padding: '9px 18px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem' }}
                  >
                    <CheckCircle2 size={16} /> ✅ Video Solved My Issue - Close Ticket
                  </button>

                  {/* OPTION 2: Escalate / Forward to RO */}
                  <button
                    type="button"
                    onClick={handleProceedToRO}
                    className="btn btn-primary"
                    style={{ background: '#2563eb', borderColor: '#2563eb', color: '#ffffff', fontWeight: '600', padding: '9px 18px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.84rem' }}
                  >
                    <Send size={15} /> 🚀 Need More Help - Proceed with RO
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}



      {/* ONLINE MEETING ENDED BY RO POP-UP MODAL */}
      {meetingEndedPopup && (
        <div className="modal-overlay" style={{ zIndex: 1300, background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(6px)' }}>
          <div className="modal-content" style={{
            maxWidth: '520px',
            width: '92%',
            background: '#ffffff',
            color: '#1e293b',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle2 size={28} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                  Online Meeting Ended by RO
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Concluded at {meetingEndedPopup.endedAt || 'Just now'} {meetingEndedPopup.issueId ? `• Ticket #${meetingEndedPopup.issueId}` : ''}
                </p>
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', marginBottom: '18px', fontSize: '0.84rem', color: '#334155', lineHeight: 1.5 }}>
              <p style={{ margin: 0 }}>
                Your <strong>Relationship Officer ({meetingEndedPopup.roName})</strong> has officially concluded this online meeting session.
              </p>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                The full dual-participant audio/video recording, discussion summary, and agreed action items have been securely saved to your ticket records.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => {
                  if (meetingEndedPopup.issueId) {
                    setSelectedIssueId(meetingEndedPopup.issueId);
                    setActiveTab('my-issues');
                  }
                  setMeetingEndedPopup(null);
                }}
                className="btn btn-secondary"
                style={{ fontSize: '0.82rem', padding: '8px 16px' }}
              >
                View Ticket & Recordings
              </button>
              <button
                type="button"
                onClick={() => setMeetingEndedPopup(null)}
                className="btn btn-primary"
                style={{ fontSize: '0.82rem', padding: '8px 18px', background: '#2563eb', border: 'none', fontWeight: 700 }}
              >
                Okay, Got It
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
