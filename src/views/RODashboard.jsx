import React, { useContext, useState, useEffect, useRef } from 'react';
import { DatabaseContext, ALL_CATEGORIES, getYoutubeEmbedUrl } from '../context/DatabaseContext';
import { Inbox, CheckCircle2, AlertTriangle, Calendar, User, Search, RefreshCw, Send, RotateCcw, Video, Mic, MicOff, VideoOff, Square, Shield, Play, Camera, AlertCircle, X, Download, PhoneOff, Volume2, VolumeX, FileText, MessageSquare } from 'lucide-react';
import { WebRtcMeetingSession } from '../utils/webrtcService';
import { CompositeMeetingRecorder } from '../utils/compositeRecorder';
import VideoStreamPlayer from '../components/VideoStreamPlayer';

export const RODashboard = ({ roId }) => {
  const { db, updateMeetingStatus, resolveIssue, escalateIssue, scheduleRoMeeting, saveMeetingRecording, updateCategoryVideo, submitRoMeetingFeedback } = useContext(DatabaseContext);

  // RO filters
  const [statusFilter, setStatusFilter] = useState('All'); // 'All', 'Assigned to RO', 'Meeting Scheduled', 'Re-opened by Student', 'Resolved', 'Escalated'
  const [selectedIssueId, setSelectedIssueId] = useState(null);

  // Search query
  const [searchQuery, setSearchQuery] = useState('');

  // Modals visibility
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showVideoManagerModal, setShowVideoManagerModal] = useState(false);

  // Post-Meeting Discussion & Feedback Form State
  const [showMeetingFeedbackModal, setShowMeetingFeedbackModal] = useState(false);
  const [postMeetingData, setPostMeetingData] = useState(null);
  const [discussionSummary, setDiscussionSummary] = useState('');
  const [actionItems, setActionItems] = useState('');
  const [meetingOutcome, setMeetingOutcome] = useState('In-Progress');
  const [followUpNeeded, setFollowUpNeeded] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Video Manager State
  const [managerCategory, setManagerCategory] = useState('Academic');
  const [managerVideoTitle, setManagerVideoTitle] = useState('');
  const [managerVideoUrl, setManagerVideoUrl] = useState('');
  const [managerVideoDesc, setManagerVideoDesc] = useState('');
  const [managerSaveSuccess, setManagerSaveSuccess] = useState(false);
  const [managerTargetIssueId, setManagerTargetIssueId] = useState(null);

  // Online Meeting Video & Auto-Recorder Modal State
  const [showOnlineMeetingModal, setShowOnlineMeetingModal] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [mediaPermissionState, setMediaPermissionState] = useState('idle'); // 'idle' | 'requesting' | 'granted' | 'denied'
  const [mediaPermissionError, setMediaPermissionError] = useState('');
  const [playingRecording, setPlayingRecording] = useState(null);

  // WebRTC Peer Connection States & References
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const localStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const compositeRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const webrtcSessionRef = useRef(null);
  const isEndingMeetingRef = useRef(false);

  // Form states
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [escalationReason, setEscalationReason] = useState('');

  // Schedule meeting form states
  const [meetDate, setMeetDate] = useState('');
  const [meetTime, setMeetTime] = useState('10:00');
  const [meetMode, setMeetMode] = useState('Offline');
  const [meetLocation, setMeetLocation] = useState('RO Office Desk 1 (Admin Block)');
  const [meetNotes, setMeetNotes] = useState('Bring student ID card and relevant documents.');
  const [meetReassignFeedback, setMeetReassignFeedback] = useState('');

  // Online Meeting Not Conducted modal states
  const [showOnlineNotDoneModal, setShowOnlineNotDoneModal] = useState(false);
  const [offlineReassignFeedback, setOfflineReassignFeedback] = useState('');
  const [offlineNotDoneActions, setOfflineNotDoneActions] = useState('');
  const [offlineRescheduleDate, setOfflineRescheduleDate] = useState('');
  const [offlineRescheduleTime, setOfflineRescheduleTime] = useState('10:00');
  const [offlineRescheduleLocation, setOfflineRescheduleLocation] = useState('RO Office Desk 1 (Admin Block)');
  const [offlineRescheduleNotes, setOfflineRescheduleNotes] = useState('Bring student ID card and relevant documents.');
  const [isSubmittingOfflineReschedule, setIsSubmittingOfflineReschedule] = useState(false);

  // Helper to format local date string (YYYY-MM-DD) avoiding UTC shifts
  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Current date & time strings for validation & defaults
  const todayStr = getLocalDateString();
  const now = new Date();
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const requestMediaPermissions = async () => {
    setMediaPermissionState('requesting');
    setMediaPermissionError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support camera/microphone access (WebRTC).');
      }
      let stream;
      try {
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
        console.warn('Advanced audio constraints fallback, requesting standard media:', audioErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true
        });
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaPermissionState('granted');

      // Initialize WebRTC Meeting Session for live peer-to-peer video with student
      if (selectedIssue) {
        if (webrtcSessionRef.current && !webrtcSessionRef.current.isClosed) {
          webrtcSessionRef.current.updateLocalStream(stream);
        } else {
          if (webrtcSessionRef.current) {
            try { webrtcSessionRef.current.close(); } catch (e) {}
          }
          webrtcSessionRef.current = new WebRtcMeetingSession({
            issueId: selectedIssue.id,
            role: 'ro',
            localStream: stream,
            onRemoteStream: (remStream) => {
              setRemoteStream(remStream);
              if (compositeRecorderRef.current) {
                compositeRecorderRef.current.setRemoteStream(remStream);
              }
            },
            onPeerStatus: (status) => {
              setPeerConnected(Boolean(status.connected));
              if (!status.connected) {
                setRemoteStream(null);
                if (compositeRecorderRef.current) {
                  compositeRecorderRef.current.setRemoteStream(null);
                }
              }
            },
            onMeetingEnded: () => {
              console.log('[RO] Remote peer ended session, automatically opening post-meeting feedback modal.');
              handleStopAndSaveRecording();
            }
          });
        }
      }

      // Initialize CompositeMeetingRecorder to capture BOTH RO and Student side-by-side
      try {
        if (compositeRecorderRef.current) {
          try { compositeRecorderRef.current.stop(); } catch (e) {}
        }
        compositeRecorderRef.current = new CompositeMeetingRecorder({
          localStream: stream,
          localLabel: ro.name || 'Relationship Officer',
          remoteLabel: selectedIssue ? (selectedIssue.studentName || 'Student') : 'Student',
          ticketId: selectedIssue ? selectedIssue.id : 'TICKET',
          localRole: 'RO',
          remoteRole: 'Student',
          width: 1280,
          height: 720,
          fps: 25
        });
        compositeRecorderRef.current.start();
      } catch (recErr) {
        console.warn('CompositeMeetingRecorder error:', recErr);
      }
    } catch (err) {
      console.warn('Camera/Mic permission error:', err);
      setMediaPermissionState('denied');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMediaPermissionError('Camera & Microphone permission was blocked by your browser. Please click the lock or camera icon in your address bar and allow Camera and Microphone, then click "Retry Permissions".');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setMediaPermissionError('No webcam or microphone hardware detected on this machine. Running in simulated fallback mode.');
      } else {
        setMediaPermissionError(err.message || 'Unable to access camera or microphone.');
      }
    }
  };

  const toggleMic = () => {
    const nextMuted = !isMicMuted;
    setIsMicMuted(nextMuted);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
    }
    if (compositeRecorderRef.current) {
      compositeRecorderRef.current.setLocalMicMuted(nextMuted);
    }
  };

  const toggleCamera = () => {
    const nextCamOff = !isCameraOff;
    setIsCameraOff(nextCamOff);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !nextCamOff;
      });
    }
    if (compositeRecorderRef.current) {
      compositeRecorderRef.current.setLocalCamOff(nextCamOff);
    }
  };

  // Auto-recording timer & media cleanup effect
  useEffect(() => {
    let timer;
    if (showOnlineMeetingModal) {
      timer = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
      requestMediaPermissions();
    } else {
      setRecordingSeconds(0);
      setMediaPermissionState('idle');
      if (compositeRecorderRef.current) {
        try { compositeRecorderRef.current.stop(); } catch(e) {}
        compositeRecorderRef.current = null;
      }
      if (webrtcSessionRef.current) {
        try { webrtcSessionRef.current.close(); } catch(e) {}
        webrtcSessionRef.current = null;
      }
      setRemoteStream(null);
      setLocalStream(null);
      setPeerConnected(false);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch(e) {}
      }
    }
    return () => {
      clearInterval(timer);
      if (compositeRecorderRef.current) {
        try { compositeRecorderRef.current.stop(); } catch(e) {}
        compositeRecorderRef.current = null;
      }
      if (webrtcSessionRef.current) {
        try { webrtcSessionRef.current.close(); } catch(e) {}
        webrtcSessionRef.current = null;
      }
      setRemoteStream(null);
      setLocalStream(null);
      setPeerConnected(false);
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try { mediaRecorderRef.current.stop(); } catch(e) {}
      }
    };
  }, [showOnlineMeetingModal]);

  const formatTimer = (totalSecs) => {
    const mins = String(Math.floor(totalSecs / 60)).padStart(2, '0');
    const secs = String(totalSecs % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const getNextValidTimeSlot = () => {
    const nextHour = new Date(Date.now() + 60 * 60 * 1000);
    const h = String(nextHour.getHours()).padStart(2, '0');
    return `${h}:00`;
  };

  // Fetch current RO profile
  const ro = db.users.ros.find(r => r.id === roId) || db.users.ros[0];

  // Issues assigned to this RO
  const roIssues = db.issues.filter(i => i.roId === ro.id);

  // Categories belonging strictly to this RO's assigned issues & assigned region
  const myAssignedIssueCategories = Array.from(new Set([
    ...roIssues.map(i => i.category),
    ro?.region,
    (() => {
      const num = parseInt(String(ro?.id || '').replace('RO-', ''), 10);
      return (!isNaN(num) && num > 0 && num <= ALL_CATEGORIES.length) ? ALL_CATEGORIES[num - 1] : null;
    })()
  ].filter(Boolean)));

  // Filtered issues list
  const filteredIssues = roIssues.filter(issue => {
    const matchesStatus = statusFilter === 'All' || issue.status === statusFilter;
    const matchesSearch =
      issue.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const selectedIssue = db.issues.find(i => (i.id || i.issue_id)?.toUpperCase() === selectedIssueId?.toUpperCase());

  // Meetings assigned to this RO (excluding meetings for resolved or escalated tickets)
  const myMeetings = (db.meetings || []).filter(m => (m.roId || m.ro_id) === ro.id);
  const scheduledMeetings = myMeetings.filter(m => {
    if (m.status === 'Cancelled') return false;
    const parentIssue = (db.issues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === (m.issueId || m.issue_id)?.toUpperCase());
    return parentIssue ? (parentIssue.status !== 'Resolved' && parentIssue.status !== 'Escalated') : true;
  });

  const getLogText = (l) => {
    if (!l) return '';
    if (typeof l === 'string') {
      if (l.trim().startsWith('{') && l.includes('"text"')) {
        try { const p = JSON.parse(l); if (p && p.text) return String(p.text); } catch (e) { }
      }
      return l;
    }
    if (typeof l === 'object' && l.text) return String(l.text);
    return String(l);
  };

  // Find if selected issue has a meeting scheduled & count reassignments
  const activeMeeting = selectedIssue ? (db.meetings || []).find(m => (m.issueId || m.issue_id)?.toUpperCase() === (selectedIssue.id || selectedIssue.issue_id)?.toUpperCase()) : null;
  const meetingReassignLogs = selectedIssue ? (selectedIssue.logs || []).filter(l => {
    const txt = getLogText(l).toLowerCase();
    return (txt.includes('rescheduled') || txt.includes('reassigned') || txt.includes('re-assigned')) && !txt.includes('reassigned to');
  }) : [];
  const meetingReassignCount = meetingReassignLogs.length;
  const isReassignLimitReached = Boolean(activeMeeting && meetingReassignCount >= 2);

  // Check if meeting date/time has passed + 15 mins buffer timer (Missed / Expired Meeting)
  const isMeetingExpired = (() => {
    if (!selectedIssue || selectedIssue.status === 'Resolved' || selectedIssue.status === 'Escalated') return false;
    if (!activeMeeting || !activeMeeting.date || !activeMeeting.time) return false;

    // If RO has already marked the meeting as Started or In-Progress, it is not expired
    if (activeMeeting.status === 'Started' || activeMeeting.status === 'In-Progress') return false;

    const timeParts = String(activeMeeting.time).split(':');
    const h = parseInt(timeParts[0], 10) || 0;
    const m = parseInt(timeParts[1], 10) || 0;

    const dateParts = String(activeMeeting.date).split('-').map(Number);
    if (dateParts.length < 3) return false;

    const meetingDateObj = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], h, m);
    // Add 15-minute buffer window timer after scheduled meeting time
    const expiryCutoff = new Date(meetingDateObj.getTime() + 15 * 60 * 1000);

    return now > expiryCutoff;
  })();

  // Institutional Compliance: Check if issue is being handled via an active online meeting
  // If reassigned to Offline, log minutes are NOT required to resolve (log minutes strictly belong to online sessions)
  const isDoneThroughOnline = Boolean(activeMeeting && activeMeeting.mode === 'Online');

  // Check if RO has filed the official discussion minutes for this meeting
  const hasFiledDiscussionMinutes = Boolean(
    activeMeeting && (
      (activeMeeting.discussionSummary && activeMeeting.discussionSummary.trim().length > 0) ||
      (activeMeeting.discussion_summary && activeMeeting.discussion_summary.trim().length > 0)
    )
  );

  // If online, RO MUST file discussion minutes before ticket can be marked as Resolved
  const isOnlineMeetingPendingMinutes = isDoneThroughOnline && !hasFiledDiscussionMinutes;

  const handleModeChange = (newMode) => {
    setMeetMode(newMode);
    if (newMode === 'Online') {
      setMeetLocation('Google Meet / Zoom Online Video Link');
    } else if (newMode === 'Offline' && (meetLocation.includes('Google Meet') || meetLocation.includes('Online Video') || meetLocation.includes('Video Link'))) {
      setMeetLocation('RO Office Desk 1 (Admin Block)');
    }
  };

  const handleOpenScheduleModal = () => {
    if (isReassignLimitReached) {
      alert('🔒 RO Limit Reached: A Relationship Officer can only reschedule/reassign a meeting twice per issue (2/2 Used). If further changes are needed, please escalate the issue to the Admin Office.');
      return;
    }
    if (activeMeeting) {
      const isPastDate = !activeMeeting.date || activeMeeting.date < todayStr;
      const isPastTimeToday = activeMeeting.date === todayStr && activeMeeting.time < currentHHMM;

      const validDate = isPastDate ? todayStr : activeMeeting.date;
      const validTime = (isPastDate || isPastTimeToday) ? getNextValidTimeSlot() : (activeMeeting.time || '10:00');

      setMeetDate(validDate);
      setMeetTime(validTime);
      const initialMode = activeMeeting.mode || 'Offline';
      setMeetMode(initialMode);
      setMeetLocation(initialMode === 'Online' ? 'Google Meet / Zoom Online Video Link' : (activeMeeting.location || 'RO Office Desk 1 (Admin Block)'));
      setMeetNotes(activeMeeting.notes || 'Bring student ID card and relevant documents.');
    } else {
      setMeetDate(todayStr);
      setMeetTime(getNextValidTimeSlot());
      setMeetMode('Offline');
      setMeetLocation('RO Office Desk 1 (Admin Block)');
      setMeetNotes('Bring student ID card and relevant documents.');
    }
    setMeetReassignFeedback('');
    setShowScheduleModal(true);
  };

  const handleLaunchOnlineMeeting = () => {
    if (!activeMeeting || !selectedIssue) return;
    isEndingMeetingRef.current = false;
    updateMeetingStatus(activeMeeting.id || activeMeeting.issueId, 'Started');
    setRecordingSeconds(0);
    setIsCameraOff(false);
    setIsMicMuted(false);
    setShowOnlineMeetingModal(true);
  };

  const handleStopAndSaveRecording = async () => {
    if (isEndingMeetingRef.current) return;
    isEndingMeetingRef.current = true;

    // 1. Resolve issue & meeting references safely
    const currentIssue = selectedIssue || db.issues.find(i => (i.id || i.issue_id)?.toUpperCase() === selectedIssueId?.toUpperCase());
    if (!currentIssue) {
      setShowOnlineMeetingModal(false);
      return;
    }
    const currentMeet = activeMeeting || (db.meetings || []).find(m => (m.issueId || m.issue_id)?.toUpperCase() === (currentIssue.id || currentIssue.issue_id)?.toUpperCase()) || { id: `MEET-${currentIssue.id}`, issueId: currentIssue.id };

    const finalSecs = Math.max(recordingSeconds, 5);
    const formattedDuration = formatTimer(finalSecs);
    let finalVideoUrl = `https://nitte-cloud-storage.edu/recordings/rec_${currentIssue.id}_${Date.now()}.mp4`;

    // 2. Prepare feedback data and IMMEDIATELY popup the Post-Meeting Discussion Form
    setPostMeetingData({
      meetingId: currentMeet.id || currentMeet.issueId,
      issueId: currentIssue.id,
      studentName: currentIssue.studentName || 'Student',
      studentId: currentIssue.studentId || '',
      category: currentIssue.category || 'General',
      durationText: formattedDuration
    });
    setDiscussionSummary('');
    setActionItems('');
    setMeetingOutcome(currentIssue.status === 'Resolved' ? 'Resolved' : 'In-Progress');
    setFollowUpNeeded(false);

    // 3. Immediately close meeting stage & open feedback modal (Zero UI delay)
    setShowOnlineMeetingModal(false);
    setShowMeetingFeedbackModal(true);
    setMediaPermissionState('idle');

    // 4. Finalize CompositeMeetingRecorder in background
    if (compositeRecorderRef.current) {
      try {
        const result = await compositeRecorderRef.current.stop();
        if (result && result.videoUrl) {
          finalVideoUrl = result.videoUrl;
        }
      } catch (e) {
        console.warn('CompositeMeetingRecorder stop error:', e);
      }
      compositeRecorderRef.current = null;
    }

    // 5. Stop MediaRecorder fallback if active
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        if (mediaRecorderRef.current.requestData) mediaRecorderRef.current.requestData();
        mediaRecorderRef.current.stop();
      } catch (e) {}
    }

    // 6. Release camera and mic tracks
    setLocalStream(null);
    setRemoteStream(null);
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    // 7. Send meeting-ended signal to student and close WebRTC session
    if (webrtcSessionRef.current) {
      try {
        webrtcSessionRef.current.sendSignal({ type: 'meeting-ended' });
      } catch (e) {}
      const sessionToClose = webrtcSessionRef.current;
      webrtcSessionRef.current = null;
      setTimeout(() => {
        try { sessionToClose.close(); } catch (e) {}
      }, 800);
    }
    setRemoteStream(null);
    setPeerConnected(false);

    // 8. Commit meeting recording & mark Completed
    saveMeetingRecording(
      currentMeet.id || currentMeet.issueId,
      currentIssue.id,
      finalSecs,
      finalVideoUrl,
      `Dual-Participant Live Session (RO: ${ro.name} & Student: ${currentIssue.studentName}) conducted and auto-archived with side-by-side video and dual-mic audio.`
    );
    updateMeetingStatus(currentMeet.id || currentMeet.issueId, 'Completed');
  };

  // Auto-detect remote meeting termination or external Completed status and pop up feedback modal
  useEffect(() => {
    if (showOnlineMeetingModal && activeMeeting && (activeMeeting.status === 'Completed' || activeMeeting.status === 'Finished') && !isEndingMeetingRef.current) {
      console.log('[RO] Active meeting marked Completed externally, triggering feedback popup automatically.');
      handleStopAndSaveRecording();
    }
  }, [showOnlineMeetingModal, activeMeeting?.status]);

  const handlePostMeetingFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!discussionSummary.trim()) {
      alert('Please enter a brief summary of what was discussed during the online meeting.');
      return;
    }
    if (!postMeetingData) return;

    setIsSubmittingFeedback(true);
    try {
      await submitRoMeetingFeedback(
        postMeetingData.meetingId,
        postMeetingData.issueId,
        ro.id,
        {
          discussionSummary: discussionSummary.trim(),
          actionItems: actionItems.trim(),
          outcome: meetingOutcome,
          followUpNeeded
        }
      );
      setShowMeetingFeedbackModal(false);
      setPostMeetingData(null);
      alert(`📋 Meeting Minutes & Feedback Saved!\n\nDiscussions and agreed action items have been officially recorded to Ticket #${postMeetingData.issueId}.`);
    } catch (err) {
      console.error('Failed to submit post-meeting feedback:', err);
      alert('Could not save meeting feedback. Please try again.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const handleOpenResolveModal = () => {
    if (isOnlineMeetingPendingMinutes) {
      alert(
        '🔒 Official Requirement:\n\n' +
        'This issue involves an online meeting session. You must file the official Log Discussion Minutes before marking this issue as Resolved.\n\n' +
        'Opening the Discussion Minutes form now...'
      );
      setPostMeetingData({
        meetingId: activeMeeting?.id || activeMeeting?.issueId || `MEET-${selectedIssue.id}`,
        issueId: selectedIssue.id,
        studentName: selectedIssue.studentName || 'Student',
        studentId: selectedIssue.studentId || '',
        category: selectedIssue.category || 'General',
        durationText: activeMeeting?.status === 'Completed' ? 'Concluded Session' : 'Online Conference'
      });
      setDiscussionSummary(activeMeeting?.discussionSummary || '');
      setActionItems(activeMeeting?.actionItems || '');
      setMeetingOutcome('Resolved');
      setFollowUpNeeded(Boolean(activeMeeting?.followUpNeeded));
      setShowMeetingFeedbackModal(true);
      return;
    }
    setShowResolveModal(true);
  };

  const handleResolveSubmit = (e) => {
    e.preventDefault();
    if (!resolutionNotes.trim() || !selectedIssueId) return;

    if (isOnlineMeetingPendingMinutes) {
      alert('🔒 Requirement: Please file the Log Discussion Minutes first before marking this issue as Resolved.');
      setShowResolveModal(false);
      handleOpenResolveModal();
      return;
    }

    resolveIssue(selectedIssueId, ro.id, resolutionNotes);
    setResolutionNotes('');
    setShowResolveModal(false);
  };

  const handleEscalateSubmit = (e) => {
    e.preventDefault();
    if (!escalationReason.trim() || !selectedIssueId) return;

    escalateIssue(selectedIssueId, ro.id, escalationReason);
    setEscalationReason('');
    setShowEscalateModal(false);
  };

  const handleScheduleSubmit = (e) => {
    e.preventDefault();
    if (!meetDate || !meetTime || !selectedIssueId) return;

    const currNow = new Date();
    const currTodayStr = getLocalDateString(currNow);
    const currTimeStr = `${String(currNow.getHours()).padStart(2, '0')}:${String(currNow.getMinutes()).padStart(2, '0')}`;

    if (meetDate < currTodayStr) {
      alert('⚠️ Invalid Date: Meeting date cannot be in the past. Please select today or a future date.');
      return;
    }

    if (meetDate === currTodayStr && meetTime < currTimeStr) {
      alert(`⚠️ Invalid Time: Cannot schedule or reassign a meeting for a past time slot (${meetTime}). Current time is ${currTimeStr}. Please choose an upcoming time slot.`);
      return;
    }

    scheduleRoMeeting(
      selectedIssueId,
      selectedIssue.studentId,
      ro.id,
      meetDate,
      meetTime,
      meetMode,
      meetLocation,
      meetNotes,
      '', // No log minutes required when reassigning; log minutes strictly for online meetings
      '', // actionItems
      meetMode === 'Offline' ? meetReassignFeedback.trim() : ''
    );
    setShowScheduleModal(false);
  };

  const handleOpenOnlineNotDoneModal = () => {
    if (isReassignLimitReached) {
      alert('🔒 RO Limit Reached: A Relationship Officer can only reschedule/reassign a meeting twice per issue (2/2 Used). If further changes are needed, please escalate the issue to the Admin Office.');
      return;
    }
    const currNow = new Date();
    const currToday = getLocalDateString(currNow);
    setOfflineRescheduleDate(currToday);
    setOfflineRescheduleTime(getNextValidTimeSlot());
    setOfflineRescheduleLocation('RO Office Desk 1 (Admin Block)');
    setOfflineRescheduleNotes('Bring student ID card and relevant physical documents.');
    setOfflineReassignFeedback('');
    setOfflineNotDoneActions('');
    setShowOnlineNotDoneModal(true);
  };

  const handleOfflineNotDoneSubmit = async (e) => {
    e.preventDefault();
    if (!offlineReassignFeedback.trim()) {
      alert('⚠️ Required: Please provide feedback / reason why the online meeting could not be held.');
      return;
    }
    if (!offlineRescheduleDate || !offlineRescheduleTime || !selectedIssueId) return;

    const currNow = new Date();
    const currTodayStr = getLocalDateString(currNow);
    const currTimeStr = `${String(currNow.getHours()).padStart(2, '0')}:${String(currNow.getMinutes()).padStart(2, '0')}`;

    if (offlineRescheduleDate < currTodayStr) {
      alert('⚠️ Invalid Date: Meeting date cannot be in the past. Please select today or a future date.');
      return;
    }

    if (offlineRescheduleDate === currTodayStr && offlineRescheduleTime < currTimeStr) {
      alert(`⚠️ Invalid Time: Cannot schedule for a past time slot (${offlineRescheduleTime}). Current time is ${currTimeStr}.`);
      return;
    }

    setIsSubmittingOfflineReschedule(true);
    try {
      await scheduleRoMeeting(
        selectedIssueId,
        selectedIssue.studentId,
        ro.id,
        offlineRescheduleDate,
        offlineRescheduleTime,
        'Offline',
        offlineRescheduleLocation,
        offlineRescheduleNotes,
        '', // No log minutes! Log minutes are strictly for online meetings
        offlineNotDoneActions.trim(),
        offlineReassignFeedback.trim() // Feedback for switching to offline
      );
      setShowOnlineNotDoneModal(false);
      alert(`📋 Online Meeting Reassigned to In-Person:\n\nFeedback recorded to Ticket #${selectedIssue.id}. Meeting mode updated to In-Person (Offline on Campus).`);
    } catch (err) {
      console.error('Failed to reschedule offline:', err);
      alert(err.message || 'Could not reschedule meeting.');
    } finally {
      setIsSubmittingOfflineReschedule(false);
    }
  };

  const loadCategoryVideoData = (cat) => {
    const cleanCat = (cat || '').trim();
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
    } catch (e) {}

    // Priority 1: Exact match
    let found = list.find(v => v.category?.toLowerCase()?.trim() === cleanCat.toLowerCase());

    // Priority 2: Match by main prefix
    if (!found && cleanCat.includes(' - ')) {
      const prefix = cleanCat.split(' - ')[0]?.trim();
      found = list.find(v => v.category?.toLowerCase()?.trim() === prefix?.toLowerCase());
    }

    // Priority 3: Match Support Desk or substring
    if (!found) {
      const prefix = cleanCat.split(' - ')[0]?.trim();
      found = list.find(v => {
        const vCat = v.category?.toLowerCase()?.trim() || '';
        return (prefix && vCat.includes(prefix.toLowerCase())) || vCat.includes(cleanCat.toLowerCase()) || cleanCat.toLowerCase().includes(vCat);
      });
    }

    if (found) {
      setManagerVideoTitle(found.title || '');
      setManagerVideoUrl(found.videoUrl || found.video_url || '');
      setManagerVideoDesc(found.description || '');
    } else {
      setManagerVideoTitle(`${cleanCat} Guidance & Solution Video`);
      setManagerVideoUrl('https://www.youtube.com/watch?v=kqtD5dpn9C8');
      setManagerVideoDesc(`1. Check student portal for requirements.\n2. Submit documentation to your department coordinator.\n3. Contact RO office for special cases.`);
    }
  };

  const openVideoManagerForCategory = (cat, issueId = null) => {
    let targetCat = cat;
    let targetIssueId = issueId;

    if (!targetCat && selectedIssue) {
      targetCat = selectedIssue.category;
      targetIssueId = selectedIssue.id;
    }

    if (!targetCat) {
      targetCat = myAssignedIssueCategories[0] || ro?.region || 'Academic';
    }

    // Verify this category belongs to RO's allowed scope
    if (myAssignedIssueCategories.length > 0 && !myAssignedIssueCategories.includes(targetCat)) {
      const matched = myAssignedIssueCategories.find(c => 
        c.toLowerCase().includes(targetCat.toLowerCase()) || targetCat.toLowerCase().includes(c.toLowerCase())
      );
      if (matched) {
        targetCat = matched;
      } else {
        alert(`⛔ Access Restricted: As Relationship Officer (${ro.name}), you can only modify YouTube solution links for your own assigned issues and categories.`);
        targetCat = myAssignedIssueCategories[0];
      }
    }

    targetCat = targetCat.trim();
    setManagerTargetIssueId(targetIssueId);
    setManagerCategory(targetCat);
    loadCategoryVideoData(targetCat);
    setManagerSaveSuccess(false);
    setShowVideoManagerModal(true);
  };

  const handleSaveCategoryVideo = async (e) => {
    e.preventDefault();
    if (!managerVideoUrl.trim()) {
      alert('Please enter a valid YouTube or video link.');
      return;
    }

    if (myAssignedIssueCategories.length > 0 && !myAssignedIssueCategories.includes(managerCategory)) {
      alert(`⛔ Permission Denied: As RO (${ro.name}), you are only authorized to edit YouTube solution videos for your own assigned issues and categories.`);
      return;
    }

    await updateCategoryVideo(managerCategory, managerVideoUrl, managerVideoTitle, managerVideoDesc, ro.id);
    setManagerSaveSuccess(true);
    setTimeout(() => setManagerSaveSuccess(false), 3000);
    alert(`🎥 Solution Video Updated!\n\nCategory: ${managerCategory}\nStudents with issues in this category will now see your updated video guidance immediately.`);
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar Panel */}
      <div className="glass-card panel-selector">
        {/* RO Header */}
        <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(217, 119, 6, 0.1)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: 'var(--accent-amber)' }}>
              <Inbox size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>{ro.name}</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Relationship Officer</p>
            </div>
          </div>
          <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <strong>Region/Scope:</strong> {ro.region}
          </div>
        </div>

        {/* Status Filters */}
        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: '700', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>
            Status Queue
          </span>
          <button className={`panel-btn ${statusFilter === 'All' ? 'active RO' : ''}`} onClick={() => setStatusFilter('All')}>
            <Inbox size={16} />
            <span>All Assigned Issues ({roIssues.length})</span>
          </button>

          <button className={`panel-btn ${statusFilter === 'Assigned to RO' ? 'active RO' : ''}`} onClick={() => setStatusFilter('Assigned to RO')}>
            <Search size={16} />
            <span>New / Incoming ({roIssues.filter(i => i.status === 'Assigned to RO').length})</span>
          </button>

          <button className={`panel-btn ${statusFilter === 'Meeting Scheduled' ? 'active RO' : ''}`} onClick={() => setStatusFilter('Meeting Scheduled')}>
            <Calendar size={16} />
            <span>Scheduled Meetings ({roIssues.filter(i => i.status === 'Meeting Scheduled').length})</span>
          </button>

          <button className={`panel-btn ${statusFilter === 'Re-opened by Student' ? 'active RO' : ''}`} onClick={() => setStatusFilter('Re-opened by Student')}>
            <RotateCcw size={16} />
            <span>Re-opened Tickets ({roIssues.filter(i => i.status === 'Re-opened by Student').length})</span>
          </button>

          <button className={`panel-btn ${statusFilter === 'Resolved' ? 'active RO' : ''}`} onClick={() => setStatusFilter('Resolved')}>
            <CheckCircle2 size={16} />
            <span>Resolved Tickets ({roIssues.filter(i => i.status === 'Resolved').length})</span>
          </button>

          <button className={`panel-btn ${statusFilter === 'Escalated' ? 'active RO' : ''}`} onClick={() => setStatusFilter('Escalated')}>
            <AlertTriangle size={16} />
            <span>Escalated to Admin ({roIssues.filter(i => i.status === 'Escalated').length})</span>
          </button>

          <button
            className="panel-btn"
            onClick={() => openVideoManagerForCategory()}
            style={{ marginTop: '10px', background: 'rgba(239, 68, 68, 0.12)', borderColor: 'rgba(239, 68, 68, 0.4)', color: '#fca5a5' }}
            title="Manage solution video links for issues assigned to you"
          >
            <Video size={16} />
            <span>🎥 Manage My Issue Videos</span>
          </button>
        </div>

        {/* Scheduled Meetings Overview Panel */}
        {scheduledMeetings.length > 0 && (
          <div className="glass-card" style={{ marginTop: 'auto', padding: '14px', background: 'var(--nitte-blue-light)', borderLeft: '3px solid var(--nitte-blue)', fontSize: '0.8rem' }}>
            <h4 style={{ fontWeight: '700', color: 'var(--nitte-blue)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} /> Assigned Meetings ({scheduledMeetings.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {scheduledMeetings.map(meet => (
                <div key={meet.id} style={{ background: '#ffffff', padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{meet.studentName}</p>
                    <span className="badge badge-resolved" style={{ fontSize: '0.65rem', padding: '1px 6px' }}>Confirmed</span>
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.74rem', marginTop: '2px' }}>📅 {meet.date} at ⏰ {meet.time}</p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', marginTop: '1px' }}>📍 {meet.location || 'RO Office Desk'}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main Content Pane */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        <div style={{ display: 'grid', gridTemplateColumns: filteredIssues.length > 0 ? '1fr 1fr' : '1fr', gap: '20px' }}>

          {/* QUEUE LIST */}
          <div className="glass-card">
            <h2 className="section-title">Issue Queue ({filteredIssues.length})</h2>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ paddingLeft: '32px' }}
                  placeholder="Search by student name, ID or category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                <Search size={14} style={{ position: 'absolute', left: '12px', top: '14px', color: 'var(--text-muted)' }} />
              </div>
            </div>

            {filteredIssues.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                <Inbox size={48} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p>No issues found matching your filters.</p>
              </div>
            ) : (
              filteredIssues.map(issue => {
                const badgeClass = `badge badge-${issue.status.toLowerCase().replace(' ', '-')}`;
                const isSelected = selectedIssueId === issue.id;

                return (
                  <div
                    key={issue.id}
                    onClick={() => setSelectedIssueId(issue.id)}
                    className={`glass-card issue-card ${issue.priority}`}
                    style={{
                      background: isSelected ? 'rgba(255,255,255,0.06)' : '',
                      borderColor: isSelected ? 'rgba(245,158,11,0.5)' : ''
                    }}
                  >
                    <div className="issue-card-header">
                      <div>
                        <strong style={{ fontSize: '0.95rem' }}>{issue.category}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          From: <strong>{issue.studentName}</strong> ({issue.studentId})
                        </div>
                      </div>
                      <span className={badgeClass}>{issue.status}</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {issue.description}
                    </p>
                    <div className="issue-meta">
                      <span>Submitted: {new Date(issue.createdAt).toLocaleDateString()}</span>
                      <span>Priority: <strong>{issue.priority}</strong></span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* QUEUE DETAILS PANE */}
          {selectedIssue && (
            <div className="glass-card" style={{ position: 'sticky', top: '90px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Manage Ticket</h3>
                <span className={`badge badge-${selectedIssue.status.toLowerCase().replace(' ', '-')}`}>{selectedIssue.status}</span>
              </div>

              {/* Student Context Card */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '16px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyCenter: 'center', color: 'var(--text-secondary)' }}>
                  <User size={16} style={{ margin: '0 auto' }} />
                </div>
                <div>
                  <p><strong>{selectedIssue.studentName}</strong> (ID: {selectedIssue.studentId})</p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Priority: {selectedIssue.priority} | Contact: {db.users.students.find(s => s.id === selectedIssue.studentId)?.phone || 'N/A'}</p>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Issue description:</h4>
                <p style={{ fontSize: '0.85rem', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                  {selectedIssue.description}
                </p>
              </div>

              {/* Active Meeting Details */}
              {activeMeeting && (
                <div style={{
                  border: isMeetingExpired ? '1px solid var(--accent-rose)' : (activeMeeting.status === 'Started' || activeMeeting.status === 'In-Progress' ? '1px solid #10b981' : '1px solid var(--nitte-blue-soft)'),
                  background: isMeetingExpired ? 'rgba(244,63,94,0.08)' : (activeMeeting.status === 'Started' || activeMeeting.status === 'In-Progress' ? 'rgba(16,185,129,0.08)' : 'var(--nitte-blue-light)'),
                  padding: '14px',
                  borderRadius: '6px',
                  marginBottom: '16px',
                  fontSize: '0.85rem'
                }}>
                  <h4 style={{ fontWeight: '700', color: isMeetingExpired ? 'var(--accent-rose)' : (activeMeeting.status === 'Started' || activeMeeting.status === 'In-Progress' ? '#10b981' : 'var(--nitte-blue)'), marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isMeetingExpired ? <AlertTriangle size={16} /> : <Calendar size={15} />}
                    {isMeetingExpired
                      ? 'Missed / Expired Meeting (Time Elapsed)'
                      : (selectedIssue.status === 'Resolved'
                        ? 'Completed Meeting Session'
                        : (activeMeeting.status === 'Started' || activeMeeting.status === 'In-Progress' ? 'Meeting Session In-Progress' : 'Assigned Meeting Session'))
                    }
                  </h4>
                  <p><strong>Date & Time:</strong> 📅 {activeMeeting.date} at ⏰ {activeMeeting.time}</p>
                  <p style={{ marginTop: '4px' }}><strong>Location / Venue:</strong> 📍 {activeMeeting.location || 'RO Office Desk'}</p>
                  <p style={{ marginTop: '4px' }}>
                    <strong>Mode:</strong> {activeMeeting.mode || 'Offline'} |
                    <strong>Status:</strong> {selectedIssue.status === 'Resolved' ? 'Completed / Resolved' : (isMeetingExpired ? 'Time Elapsed / Needs Reassignment' : (activeMeeting.status || 'Confirmed'))}
                  </p>
                  {isMeetingExpired && selectedIssue.status !== 'Resolved' && (
                    <p style={{ marginTop: '6px', color: '#fca5a5', fontWeight: '500' }}>
                      ⚠️ The scheduled meeting date/time has passed (exceeded 10 min grace period). Click <strong>Reassign Missed Meeting</strong> below to set a new present or future date.
                    </p>
                  )}
                  {activeMeeting.notes && !isMeetingExpired && (
                    <p style={{ marginTop: '6px', fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                      <strong>RO Notes:</strong> "{activeMeeting.notes}"
                    </p>
                  )}

                  {/* LOGGED POST-MEETING DISCUSSION MINUTES */}
                  {activeMeeting.discussionSummary && (
                    <div style={{ marginTop: '10px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '10px 14px', borderRadius: '6px', fontSize: '0.82rem' }}>
                      <div style={{ fontWeight: '700', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                        <FileText size={15} /> 📋 Logged Discussion Minutes:
                      </div>
                      <p style={{ margin: 0, color: 'var(--text-primary)', lineHeight: 1.45 }}>{activeMeeting.discussionSummary}</p>
                      {activeMeeting.actionItems && (
                        <p style={{ marginTop: '6px', marginBottom: 0, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                          <strong>Agreed Action Items:</strong> {activeMeeting.actionItems}
                        </p>
                      )}
                    </div>
                  )}

                  {/* EDIT OR LOG DISCUSSION MINUTES BUTTON */}
                  {activeMeeting.status === 'Completed' && (
                    <div style={{ marginTop: '8px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setPostMeetingData({
                            meetingId: activeMeeting.id || activeMeeting.issueId,
                            issueId: selectedIssue.id,
                            studentName: selectedIssue.studentName,
                            studentId: selectedIssue.studentId,
                            category: selectedIssue.category,
                            durationText: 'Concluded Session'
                          });
                          setDiscussionSummary(activeMeeting.discussionSummary || '');
                          setActionItems(activeMeeting.actionItems || '');
                          setMeetingOutcome(selectedIssue.status === 'Resolved' ? 'Resolved' : 'In-Progress');
                          setFollowUpNeeded(Boolean(activeMeeting.followUpNeeded));
                          setShowMeetingFeedbackModal(true);
                        }}
                        className="btn btn-secondary"
                        style={{ fontSize: '0.74rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                      >
                        <FileText size={13} /> {activeMeeting.discussionSummary ? '✏️ Edit Discussion Minutes' : '📋 Log Discussion Minutes'}
                      </button>
                    </div>
                  )}

                  {/* START / LAUNCH MEETING ACTION BUTTON FOR RO */}
                  {selectedIssue.status !== 'Resolved' && selectedIssue.status !== 'Escalated' && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      {(activeMeeting.status === 'Started' || activeMeeting.status === 'In-Progress') ? (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ color: '#10b981', fontWeight: '700', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <CheckCircle2 size={16} /> 🟢 Meeting Currently In-Progress
                          </div>
                          {activeMeeting.mode === 'Online' && (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                onClick={() => setShowOnlineMeetingModal(true)}
                                className="btn btn-primary"
                                style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#2563eb' }}
                              >
                                <Video size={13} /> Open Recording Room (REC: {formatTimer(recordingSeconds)})
                              </button>
                              <button
                                type="button"
                                onClick={handleOpenOnlineNotDoneModal}
                                style={{
                                  fontSize: '0.75rem',
                                  padding: '4px 10px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#fca5a5',
                                  border: '1px solid rgba(239, 68, 68, 0.4)',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                                title="Declare that the online meeting could not be held, provide feedback, and reassign to offline"
                              >
                                🚫 Online Meeting Not Done
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {activeMeeting.mode === 'Online' ? (
                            <>
                              <button
                                type="button"
                                onClick={handleLaunchOnlineMeeting}
                                className="btn btn-primary"
                                style={{ fontSize: '0.78rem', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '4px', background: '#2563eb' }}
                              >
                                <Video size={14} /> Launch Online Meeting & Auto-Record
                              </button>
                              <button
                                type="button"
                                onClick={handleOpenOnlineNotDoneModal}
                                style={{
                                  fontSize: '0.78rem',
                                  padding: '5px 12px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  borderRadius: '4px',
                                  background: 'rgba(245, 158, 11, 0.12)',
                                  color: '#fbbf24',
                                  border: '1px solid rgba(245, 158, 11, 0.4)',
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                                title="Declare that the online meeting could not be held, provide feedback, and reassign to offline"
                              >
                                🚫 Online Meeting Not Done
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => updateMeetingStatus(activeMeeting.id || activeMeeting.issueId, 'Started')}
                              className="btn btn-success"
                              style={{ fontSize: '0.78rem', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '4px' }}
                            >
                              <CheckCircle2 size={14} /> Mark In-Person Meeting as Started
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* STORED VIDEO RECORDINGS ARCHIVE */}
              {db.recordings && db.recordings.filter(r => (r.issueId || r.issue_id)?.toUpperCase() === selectedIssue.id?.toUpperCase()).length > 0 && (
                <div style={{ border: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.05)', padding: '12px 14px', borderRadius: '6px', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--nitte-blue)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Video size={15} /> Auto-Archived Online Video Recordings ({db.recordings.filter(r => (r.issueId || r.issue_id)?.toUpperCase() === selectedIssue.id?.toUpperCase()).length})
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

              {/* RESOLUTION DETAILS IF ALREADY RESOLVED */}
              {selectedIssue.status === 'Resolved' && (
                <div style={{ borderLeft: '3px solid var(--accent-emerald)', background: 'rgba(16,185,129,0.05)', padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '0.85rem' }}>
                  <h4 style={{ fontWeight: '700', color: 'rgb(110,231,183)', marginBottom: '4px' }}>Logged Resolution Action:</h4>
                  <p>{selectedIssue.resolutionNotes}</p>
                  {selectedIssue.feedback && (
                    <div style={{ marginTop: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '8px' }}>
                      <p><strong>Student Rating:</strong> {selectedIssue.feedback.rating} / 5</p>
                      <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>"{selectedIssue.feedback.comments}"</p>
                    </div>
                  )}
                </div>
              )}

              {/* RE-OPENED BY STUDENT WARNING ALERT */}
              {selectedIssue.status === 'Re-opened by Student' && (
                <div style={{ borderLeft: '4px solid var(--accent-amber)', background: 'rgba(217,119,6,0.08)', padding: '12px 14px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem' }}>
                  <h4 style={{ fontWeight: '800', color: 'var(--accent-amber)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <RotateCcw size={16} /> Re-opened by Student (Unsatisfied Resolution)
                  </h4>
                  <p style={{ color: 'var(--text-primary)' }}>
                    The student indicated that the previous resolution was incomplete or that additional advice is required. Please review their log feedback below and click <strong>Reassign / Reschedule Meeting</strong> to set up a follow-up guidance session.
                  </p>
                </div>
              )}

              {/* ACTION BUTTONS FOR RO */}
              {selectedIssue.status !== 'Resolved' && selectedIssue.status !== 'Escalated' && (
                <div style={{ marginTop: '20px' }}>
                  {activeMeeting && (
                    <div style={{ fontSize: '0.78rem', color: isReassignLimitReached ? '#ef4444' : 'var(--text-secondary)', marginBottom: '10px', background: isReassignLimitReached ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.08)', padding: '8px 12px', borderRadius: '6px', borderLeft: isReassignLimitReached ? '3px solid #ef4444' : '3px solid #3b82f6' }}>
                      <span style={{ fontWeight: '600' }}>📅 Current Meeting:</span> {activeMeeting.date} at {activeMeeting.time} ({activeMeeting.location}) &nbsp;|&nbsp;
                      RO Reassignments Used: <strong style={{ color: isReassignLimitReached ? '#ef4444' : '#3b82f6' }}>{meetingReassignCount} / 2 Max</strong>
                      {isReassignLimitReached && (
                        <div style={{ color: '#fca5a5', marginTop: '2px', fontWeight: 'bold' }}>
                          🔒 Maximum 2 meeting reassignments reached. Escalate ticket to Admin if further changes are required.
                        </div>
                      )}
                    </div>
                  )}

                  {isOnlineMeetingPendingMinutes && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.35)',
                      color: '#fca5a5',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '0.78rem',
                      marginBottom: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <AlertTriangle size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
                      <span>
                        <strong>Log Discussion Minutes Required:</strong> An online session is linked to this ticket. Institutional mentorship policy requires the RO to log the official discussion minutes before this ticket can be resolved.
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={handleOpenScheduleModal}
                      className={`btn ${isReassignLimitReached ? 'btn-secondary' : (isMeetingExpired ? 'btn-danger' : 'btn-primary')}`}
                      disabled={isReassignLimitReached}
                      style={{
                        flex: 1,
                        minWidth: '140px',
                        opacity: isReassignLimitReached ? 0.6 : 1,
                        cursor: isReassignLimitReached ? 'not-allowed' : 'pointer'
                      }}
                      title={isReassignLimitReached ? 'Maximum 2 meeting reassignments reached for this issue' : ''}
                    >
                      <Calendar size={15} /> {
                        isReassignLimitReached
                          ? '🔒 Reassign Limit Reached (2/2)'
                          : isMeetingExpired
                            ? `Reassign Missed Meeting (${meetingReassignCount}/2)`
                            : activeMeeting
                              ? `Reschedule / Reassign Meeting (${meetingReassignCount}/2)`
                              : 'Schedule Meeting'
                      }
                    </button>
                    <button
                      onClick={handleOpenResolveModal}
                      className="btn btn-success"
                      style={{
                        flex: 1,
                        minWidth: '140px',
                        background: isOnlineMeetingPendingMinutes ? 'linear-gradient(135deg, #059669 0%, #047857 100%)' : undefined,
                        border: isOnlineMeetingPendingMinutes ? '1px dashed #34d399' : undefined
                      }}
                      title={isOnlineMeetingPendingMinutes ? 'Filing discussion minutes is required before resolving' : 'Mark ticket as resolved'}
                    >
                      {isOnlineMeetingPendingMinutes ? '📋 Log Minutes & Resolve' : 'Mark as Resolved'}
                    </button>
                    <button
                      onClick={() => setShowEscalateModal(true)}
                      className="btn btn-danger"
                      style={{ flex: 1, minWidth: '140px' }}
                    >
                      Escalate to Admin
                    </button>
                  </div>
                </div>
              )}

              {/* Escalated state visual */}
              {selectedIssue.status === 'Escalated' && (
                <div style={{ borderLeft: '3px solid var(--accent-rose)', background: 'rgba(244,63,94,0.05)', padding: '12px', borderRadius: '4px', marginBottom: '16px', fontSize: '0.85rem' }}>
                  <h4 style={{ fontWeight: '700', color: 'rgb(253,164,175)', marginBottom: '4px' }}>Escalated Ticket Status:</h4>
                  <p>This issue has been routed to the Senior Admin / Principal dashboard for administrative override.</p>
                </div>
              )}

              {/* Solution Video Editor for this Specific Issue */}
              {selectedIssue.roId === ro.id && (
                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <button
                    type="button"
                    onClick={() => openVideoManagerForCategory(selectedIssue.category, selectedIssue.id)}
                    className="btn btn-secondary"
                    style={{
                      width: '100%',
                      fontSize: '0.82rem',
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      borderColor: 'rgba(239, 68, 68, 0.4)',
                      color: '#fca5a5',
                      fontWeight: 600
                    }}
                  >
                    <Video size={15} style={{ color: '#ef4444' }} />
                    <span>🎥 Edit Solution Video for this Issue ({selectedIssue.category})</span>
                  </button>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block', textAlign: 'center', marginTop: '4px' }}>
                    🔒 As the assigned RO ({ro.id}), this YouTube link applies specifically to this issue's category
                  </span>
                </div>
              )}

              {/* Logs */}
              <div style={{ marginTop: '20px' }}>
                <h4 style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>Logs:</h4>
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

      </div>

      {/* POST-MEETING RO DISCUSSION & FEEDBACK FORM MODAL */}
      {showMeetingFeedbackModal && postMeetingData && (
        <div className="modal-overlay" style={{ zIndex: 1250 }}>
          <div className="modal-content" style={{ maxWidth: '680px', width: '92%' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                    Post-Meeting Discussion & Feedback Record
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Official minutes of meeting & deliberations for student ticket archive
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMeetingFeedbackModal(false)}
                className="btn-icon-only"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Top Meeting Metadata Card */}
            <div style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.8rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Student: </span>
                <strong style={{ color: 'var(--text-primary)' }}>{postMeetingData.studentName}</strong> ({postMeetingData.studentId})
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Ticket: </span>
                <strong style={{ color: 'var(--nitte-blue)' }}>#{postMeetingData.issueId}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Category: </span>
                <span style={{ fontWeight: 600 }}>{postMeetingData.category}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontWeight: 700 }}>
                <span>⏱️ {postMeetingData.durationText}</span>
                <span style={{ fontSize: '0.72rem', background: 'rgba(16,185,129,0.15)', padding: '2px 6px', borderRadius: '4px' }}>Recorded</span>
              </div>
            </div>

            <form onSubmit={handlePostMeetingFeedbackSubmit}>
              <div className="modal-body" style={{ padding: '20px', maxHeight: '68vh', overflowY: 'auto' }}>
                {/* Official Compliance Notice */}
                <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '10px 14px', borderRadius: '6px', fontSize: '0.78rem', marginBottom: '18px', color: 'var(--text-secondary)' }}>
                  📌 <strong>Officer Requirement:</strong> Please document the key points discussed, student statements, and decisions taken during this meeting. This record is linked to the ticket audit trail for institutional review and student transparency.
                </div>

                {/* Primary Question: Discussions Taken Place */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.88rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>1. Discussions Taken Place & Key Deliberations <span style={{ color: '#ef4444' }}>*</span></span>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 400 }}>Required</span>
                  </label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 6px 0' }}>
                    What were the main discussions that had taken place with the student during this session?
                  </p>
                  <textarea
                    className="form-textarea"
                    rows={4}
                    required
                    value={discussionSummary}
                    onChange={(e) => setDiscussionSummary(e.target.value)}
                    placeholder="e.g., Reviewed student's attendance shortage and medical discharge certificates. Student explained the circumstances. RO explained the condonation policy and verified university requirements..."
                    style={{ fontSize: '0.84rem', lineHeight: 1.5 }}
                  />
                </div>

                {/* Question 2: Agreed Action Items & Responsibilities */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.88rem' }}>
                    2. Agreed Action Items & Responsibilities (Optional)
                  </label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 6px 0' }}>
                    Specific next steps or submissions agreed during the meeting.
                  </p>
                  <textarea
                    className="form-textarea"
                    rows={2}
                    value={actionItems}
                    onChange={(e) => setActionItems(e.target.value)}
                    placeholder="e.g., Student to submit hard copy to HOD office by Thursday; RO to forward approval note to Dean of Academic Affairs..."
                    style={{ fontSize: '0.84rem', lineHeight: 1.5 }}
                  />
                </div>

                {/* Question 3: Meeting Outcome & Ticket Transition */}
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.88rem', marginBottom: '8px', display: 'block' }}>
                    3. Meeting Outcome & Ticket Status Transition
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                    <div
                      onClick={() => setMeetingOutcome('In-Progress')}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: meetingOutcome === 'In-Progress' ? '2px solid #2563eb' : '1px solid var(--border-color)',
                        background: meetingOutcome === 'In-Progress' ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ fontWeight: '700', fontSize: '0.82rem', color: meetingOutcome === 'In-Progress' ? '#2563eb' : 'var(--text-primary)' }}>
                        ⏳ In-Progress
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        Follow-up action or student submission pending
                      </div>
                    </div>

                    <div
                      onClick={() => setMeetingOutcome('Resolved')}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: meetingOutcome === 'Resolved' ? '2px solid #10b981' : '1px solid var(--border-color)',
                        background: meetingOutcome === 'Resolved' ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ fontWeight: '700', fontSize: '0.82rem', color: meetingOutcome === 'Resolved' ? '#10b981' : 'var(--text-primary)' }}>
                        ✅ Mark Resolved
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        Meeting fully solved the problem; close ticket
                      </div>
                    </div>

                    <div
                      onClick={() => setMeetingOutcome('Escalated')}
                      style={{
                        padding: '12px',
                        borderRadius: '8px',
                        border: meetingOutcome === 'Escalated' ? '2px solid #f59e0b' : '1px solid var(--border-color)',
                        background: meetingOutcome === 'Escalated' ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ fontWeight: '700', fontSize: '0.82rem', color: meetingOutcome === 'Escalated' ? '#f59e0b' : 'var(--text-primary)' }}>
                        ⚠️ Escalate Ticket
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                        Requires intervention from HOD or Principal
                      </div>
                    </div>
                  </div>
                </div>

                {/* Follow-up Required Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <input
                    type="checkbox"
                    id="roFollowUpCheck"
                    checked={followUpNeeded}
                    onChange={(e) => setFollowUpNeeded(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <label htmlFor="roFollowUpCheck" style={{ fontSize: '0.82rem', cursor: 'pointer', color: 'var(--text-primary)' }}>
                    Schedule follow-up conference or review checkpoint needed with student
                  </label>
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowMeetingFeedbackModal(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem' }}
                >
                  Skip for Now
                </button>
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={isSubmittingFeedback || !discussionSummary.trim()}
                  style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', background: '#10b981', borderColor: '#10b981' }}
                >
                  <CheckCircle2 size={16} />
                  {isSubmittingFeedback ? 'Saving Minutes...' : 'Save Discussion Minutes to Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESOLVE MODAL */}
      {showResolveModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontWeight: '700' }}>Confirm Issue Resolution</h3>
              <button onClick={() => setShowResolveModal(false)} className="btn-icon-only">✕</button>
            </div>
            <form onSubmit={handleResolveSubmit}>
              <div className="modal-body">
                {isOnlineMeetingPendingMinutes && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#fca5a5', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem', marginBottom: '14px' }}>
                    ⚠️ <strong>Institutional Policy Notice:</strong> An online session was conducted for this ticket. You must log the official discussion minutes before this ticket can be resolved. Submitting will redirect you to file the minutes.
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Resolution Summary / Actions Taken</label>
                  <textarea
                    className="form-textarea"
                    required
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Detail the steps taken to resolve this student issue (e.g. Updated internal marks sheet, issued hall ticket, verified fee receipt)."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowResolveModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-success">Log Resolution & Close Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ESCALATE MODAL */}
      {showEscalateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontWeight: '700', color: 'var(--accent-rose)' }}>Escalate to Admin/Principal</h3>
              <button onClick={() => setShowEscalateModal(false)} className="btn-icon-only">✕</button>
            </div>
            <form onSubmit={handleEscalateSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Escalate this issue to the Management Dashboard. Use this if the issue requires academic committee overrides, financial policies exemptions, or is delayed past standard SLA.
                </p>
                <div className="form-group">
                  <label className="form-label">Reason for Escalation</label>
                  <textarea
                    className="form-textarea"
                    required
                    value={escalationReason}
                    onChange={(e) => setEscalationReason(e.target.value)}
                    placeholder="e.g. Requires manual approval portal authorization which is only accessible by the Principal/Head office."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowEscalateModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-danger">Escalate Ticket</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCHEDULE / RESCHEDULE MEETING MODAL FOR RO */}
      {showScheduleModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontWeight: '700', color: 'var(--nitte-blue)' }}>
                {activeMeeting ? 'Reschedule / Reassign Meeting with Student' : 'Schedule Meeting with Student'}
              </h3>
              <button onClick={() => setShowScheduleModal(false)} className="btn-icon-only">✕</button>
            </div>
            <form onSubmit={handleScheduleSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  {activeMeeting
                    ? `Update date, time, venue, or instructions for meeting with student ${selectedIssue?.studentName} on ticket ${selectedIssue?.id}.`
                    : `Assign a specific date, time, and location to meet with ${selectedIssue?.studentName} to discuss ticket ${selectedIssue?.id}.`
                  }
                </p>

                <div className="grid-cols-4" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '0' }}>
                  <div className="form-group">
                    <label className="form-label">Meeting Date</label>
                    <input
                      type="date"
                      required
                      min={todayStr}
                      className="form-control"
                      value={meetDate}
                      onChange={(e) => setMeetDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Time Slot</label>
                    <input
                      type="time"
                      required
                      className="form-control"
                      value={meetTime}
                      onChange={(e) => setMeetTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Meeting Mode</label>
                  <select
                    className="form-select"
                    value={meetMode}
                    onChange={(e) => handleModeChange(e.target.value)}
                  >
                    <option value="Offline">In-Person (Offline on Campus)</option>
                    <option value="Online">Online Video Meeting (Google Meet / Zoom)</option>
                  </select>
                </div>

                {meetMode === 'Offline' && activeMeeting?.mode === 'Online' && (
                  <div className="form-group" style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '12px 14px', borderRadius: '8px' }}>
                    <label className="form-label" style={{ fontWeight: '700', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>💬 Feedback / Reason for Switching to Offline</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Optional</span>
                    </label>
                    <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: '3px 0 8px 0' }}>
                      Provide brief feedback or note why this session is being moved to in-person (e.g. connectivity drop, student preference).
                    </p>
                    <textarea
                      className="form-textarea"
                      rows={2}
                      value={meetReassignFeedback}
                      onChange={(e) => setMeetReassignFeedback(e.target.value)}
                      placeholder="e.g. Student requested in-person consultation at RO desk due to network issues."
                    />
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Meeting Location / Venue</label>
                  <input
                    type="text"
                    required
                    className="form-control"
                    placeholder="e.g. RO Office Desk 3, Admin Building 1st Floor"
                    value={meetLocation}
                    onChange={(e) => setMeetLocation(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">RO Instructions / Documents Required</label>
                  <textarea
                    className="form-textarea"
                    style={{ minHeight: '70px' }}
                    placeholder="e.g. Bring original fee receipts, hall ticket copy, or USN ID card."
                    value={meetNotes}
                    onChange={(e) => setMeetNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowScheduleModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {activeMeeting ? 'Save & Reassign Meeting' : 'Confirm & Assign Meeting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ONLINE MEETING NOT DONE & RESCHEDULE TO OFFLINE MODAL */}
      {showOnlineNotDoneModal && selectedIssue && (
        <div className="modal-overlay" style={{ zIndex: 1250 }}>
          <div className="modal-content" style={{ maxWidth: '640px', width: '92%' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
                  <AlertCircle size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                    Online Meeting Not Done - Reassign to In-Person
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Provide feedback & reschedule meeting to In-Person (Offline on Campus)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOnlineNotDoneModal(false)}
                className="btn-icon-only"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* Ticket Info Strip */}
            <div style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-color)', padding: '10px 18px', display: 'flex', flexWrap: 'wrap', gap: '14px', fontSize: '0.8rem' }}>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Student: </span>
                <strong style={{ color: 'var(--text-primary)' }}>{selectedIssue.studentName}</strong> ({selectedIssue.studentId})
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Ticket: </span>
                <strong style={{ color: 'var(--nitte-blue)' }}>#{selectedIssue.id}</strong>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Category: </span>
                <strong style={{ color: '#10b981' }}>{selectedIssue.category}</strong>
              </div>
            </div>

            <form onSubmit={handleOfflineNotDoneSubmit}>
              <div className="modal-body" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '72vh', overflowY: 'auto' }}>
                
                {/* Institutional Note */}
                <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', padding: '10px 14px', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  📌 <strong>Reassign Notice:</strong> When an online conference could not take place, please provide feedback explaining why the session is moving to in-person and set the campus desk schedule.
                </div>

                {/* 1. Feedback / Reason for Switching to Offline (Required) */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '700', fontSize: '0.86rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>1. Feedback / Reason for Switching to Offline <span style={{ color: '#ef4444' }}>*</span></span>
                    <span style={{ fontSize: '0.72rem', color: '#fca5a5', fontWeight: 600 }}>Required</span>
                  </label>
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '2px 0 6px 0' }}>
                    Explain why the online session was not held and student communication held (e.g. connectivity failure, student preference).
                  </p>
                  <textarea
                    className="form-textarea"
                    required
                    rows={3}
                    value={offlineReassignFeedback}
                    onChange={(e) => setOfflineReassignFeedback(e.target.value)}
                    placeholder="e.g. Student reported network connectivity issues during online attempt; spoke on phone and agreed to meet at RO desk for in-person document review."
                  />
                </div>

                {/* 2. Action Items for Offline Meeting (Optional) */}
                <div className="form-group">
                  <label className="form-label" style={{ fontWeight: '600', fontSize: '0.84rem' }}>
                    2. Action Items / Documents Student Must Bring (Optional)
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={offlineNotDoneActions}
                    onChange={(e) => setOfflineNotDoneActions(e.target.value)}
                    placeholder="e.g. Bring college ID, fee challan copy, and USN admission letter"
                  />
                </div>

                {/* 3. New Offline Meeting Schedule Details */}
                <div style={{ background: 'var(--bg-secondary)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.84rem', fontWeight: 700, color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={15} /> Reschedule as In-Person (Offline) Session:
                  </h4>

                  <div className="grid-cols-4" style={{ gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.78rem' }}>Offline Date</label>
                      <input
                        type="date"
                        required
                        min={todayStr}
                        className="form-control"
                        value={offlineRescheduleDate}
                        onChange={(e) => setOfflineRescheduleDate(e.target.value)}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.78rem' }}>Time Slot</label>
                      <input
                        type="time"
                        required
                        className="form-control"
                        value={offlineRescheduleTime}
                        onChange={(e) => setOfflineRescheduleTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginBottom: '10px' }}>
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Campus Venue / Desk</label>
                    <input
                      type="text"
                      required
                      className="form-control"
                      value={offlineRescheduleLocation}
                      onChange={(e) => setOfflineRescheduleLocation(e.target.value)}
                      placeholder="e.g. RO Office Desk 1 (Admin Block)"
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Instructions for Student</label>
                    <input
                      type="text"
                      className="form-control"
                      value={offlineRescheduleNotes}
                      onChange={(e) => setOfflineRescheduleNotes(e.target.value)}
                      placeholder="e.g. Meet in person at RO desk with student USN card."
                    />
                  </div>
                </div>

              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowOnlineNotDoneModal(false)}
                  className="btn btn-secondary"
                  style={{ fontSize: '0.8rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-success"
                  disabled={isSubmittingOfflineReschedule || !offlineReassignFeedback.trim()}
                  style={{ fontSize: '0.84rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', background: '#059669', borderColor: '#059669' }}
                >
                  <CheckCircle2 size={16} />
                  {isSubmittingOfflineReschedule ? 'Reassigning...' : '🤝 Confirm & Reassign to In-Person'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ONLINE VIDEO MEETING ROOM & AUTOMATED RECORDER MODAL FOR RO */}
      {showOnlineMeetingModal && selectedIssue && activeMeeting && (
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
            {/* Modal Header */}
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
                  background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                  padding: '10px',
                  borderRadius: '12px',
                  color: '#ffffff',
                  boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
                }}>
                  <Video size={22} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ fontWeight: '800', color: '#ffffff', fontSize: '1.15rem', margin: 0, letterSpacing: '-0.02em' }}>
                      NITTE Online Conference Room & Auto-Recorder
                    </h3>
                    <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '2px 8px', borderRadius: '12px', fontSize: '0.68rem', fontWeight: 700 }}>
                      Ticket #{selectedIssue.id}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '3px 0 0 0' }}>
                    Student: <strong>{selectedIssue.studentName}</strong> ({selectedIssue.studentId}) &nbsp;|&nbsp; Category: <strong>{selectedIssue.category}</strong>
                  </p>
                </div>
              </div>

              {/* Header Badges */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Pulsing Red Auto-Recording Active Badge */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(220, 38, 38, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  padding: '6px 14px',
                  borderRadius: '30px'
                }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 8px #ef4444' }} />
                  <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#fca5a5', letterSpacing: '0.04em' }}>
                    REC • {formatTimer(recordingSeconds)}
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
                  {peerConnected ? '⚡ 18ms P2P Live' : 'Waiting...'}
                </div>
              </div>
            </div>

            {/* Modal Body - Video Stage */}
            <div style={{ padding: '20px 24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {/* Permission Notice Banner */}
              {mediaPermissionState === 'denied' && (
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', fontSize: '0.8rem', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={16} style={{ color: '#ef4444' }} />
                    <span><strong>Camera/Mic Notice:</strong> {mediaPermissionError || 'Permissions blocked by browser.'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={requestMediaPermissions}
                    className="btn btn-warning"
                    style={{ fontSize: '0.74rem', padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <RotateCcw size={12} /> Retry Permissions
                  </button>
                </div>
              )}

              {/* Large Cinematic Video Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginBottom: '16px', flex: 1 }}>

                {/* RO OFFICER LIVE WEBCAM VIDEO FEED */}
                <div style={{
                  background: '#0a0f1d',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  position: 'relative',
                  height: '380px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)'
                }}>
                  {isCameraOff ? (
                    <div style={{ color: '#64748b', textAlign: 'center', padding: '20px' }}>
                      <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px auto' }}>
                        <VideoOff size={32} />
                      </div>
                      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0', margin: 0 }}>RO Camera Disabled</p>
                      <button
                        type="button"
                        onClick={toggleCamera}
                        style={{ marginTop: '12px', background: '#3b82f6', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Turn Camera Back On
                      </button>
                    </div>
                  ) : mediaPermissionState === 'granted' && localStream ? (
                    <VideoStreamPlayer
                      stream={localStream}
                      muted={true}
                      badge={{ text: 'Live HD WebCam (Host)', color: '#10b981' }}
                      participantName={ro.name}
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
                      <p style={{ marginTop: '14px', fontWeight: '800', fontSize: '1rem', color: '#ffffff', margin: '14px 0 2px 0' }}>{ro.name} (Host)</p>
                      <span style={{ fontSize: '0.75rem', color: '#93c5fd' }}>
                        {mediaPermissionState === 'requesting' ? 'Connecting live camera...' : 'Webcam simulated fallback'}
                      </span>
                    </div>
                  )}

                  <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(11, 15, 25, 0.75)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', color: '#10b981', zIndex: 5, border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)' }}>
                    🟢 Host Feed
                  </div>
                </div>

                {/* STUDENT VIDEO FEED */}
                <div style={{
                  background: '#0a0f1d',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  position: 'relative',
                  height: '380px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)'
                }}>
                  {remoteStream ? (
                    <VideoStreamPlayer
                      stream={remoteStream}
                      muted={false}
                      badge={{ text: '🟢 Student Live WebCam', color: '#10b981' }}
                      participantName={selectedIssue.studentName}
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
                        {selectedIssue.studentName ? selectedIssue.studentName.charAt(0) : 'S'}
                      </div>
                      <p style={{ marginTop: '14px', fontWeight: '800', fontSize: '1rem', color: '#ffffff', margin: '14px 0 2px 0' }}>{selectedIssue.studentName}</p>
                      <span style={{ fontSize: '0.75rem', color: '#a7f3d0' }}>
                        {peerConnected ? 'Connecting student camera feed...' : 'Waiting for Student to join call...'}
                      </span>
                    </div>
                  )}

                  <div style={{ position: 'absolute', top: '12px', right: '12px', background: 'rgba(11, 15, 25, 0.75)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', color: remoteStream ? '#10b981' : '#f59e0b', zIndex: 5, border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(6px)' }}>
                    {remoteStream ? '🟢 Student Live P2P' : (peerConnected ? '🟡 Connecting...' : '⚪ Waiting')}
                  </div>
                </div>

              </div>

              {/* Encrypted Storage Info Bar */}
              <div style={{ background: 'rgba(15, 23, 42, 0.4)', border: '1px solid rgba(255, 255, 255, 0.06)', padding: '10px 16px', borderRadius: '10px', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                  <Shield size={14} style={{ color: '#10b981' }} />
                  <span><strong>256-bit Encrypted Session</strong> &nbsp;|&nbsp; MediaRecorder capturing live camera & audio stream</span>
                </div>
                <div style={{ color: '#fca5a5', fontWeight: 600 }}>
                  📼 Auto-saving video (.webm) to student support ticket
                </div>
              </div>
            </div>

            {/* Controls Bar & Stop Button */}
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
              {/* Mic Button */}
              <button
                type="button"
                onClick={toggleMic}
                style={{
                  background: isMicMuted ? '#ef4444' : 'rgba(16, 185, 129, 0.15)',
                  color: isMicMuted ? '#ffffff' : '#10b981',
                  border: isMicMuted ? '1px solid #dc2626' : '1px solid rgba(16, 185, 129, 0.35)',
                  padding: '10px 20px',
                  borderRadius: '30px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  transition: 'all 0.2s ease',
                  boxShadow: isMicMuted ? '0 4px 14px rgba(239, 68, 68, 0.3)' : '0 4px 14px rgba(16, 185, 129, 0.15)'
                }}
              >
                {isMicMuted ? <MicOff size={16} /> : <Mic size={16} />}
                <span>{isMicMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
              </button>

              {/* Camera Button */}
              <button
                type="button"
                onClick={toggleCamera}
                style={{
                  background: isCameraOff ? '#ef4444' : 'rgba(255, 255, 255, 0.08)',
                  color: isCameraOff ? '#ffffff' : '#f1f5f9',
                  border: isCameraOff ? '1px solid #dc2626' : '1px solid rgba(255, 255, 255, 0.15)',
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
                {isCameraOff ? <VideoOff size={16} /> : <Video size={16} />}
                <span>{isCameraOff ? 'Start Camera' : 'Stop Camera'}</span>
              </button>

              {/* End Meeting Button */}
              <button
                type="button"
                onClick={handleStopAndSaveRecording}
                style={{
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '12px 28px',
                  borderRadius: '30px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  boxShadow: '0 4px 16px rgba(220, 38, 38, 0.4)',
                  transition: 'all 0.2s ease',
                  marginLeft: '8px'
                }}
              >
                <Square size={16} />
                <span>Stop Recording & End Meeting</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* VIDEO PLAYER MODAL FOR ARCHIVED RECORDINGS */}
      {playingRecording && (
        <div className="modal-overlay" style={{ zIndex: 1200, background: 'rgba(0,0,0,0.85)' }}>
          <div className="modal-content" style={{ maxWidth: '750px', width: '92%', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '12px' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #334155', paddingBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Video size={20} style={{ color: '#3b82f6' }} />
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

      {/* CATEGORY GUIDANCE & SOLUTION VIDEO MANAGER MODAL (RO YouTube Editor) */}
      {showVideoManagerModal && (() => {
        const embedUrl = getYoutubeEmbedUrl(managerVideoUrl);
        const isEmbed = embedUrl.includes('/embed/') || embedUrl.includes('youtube');

        return (
          <div className="modal-overlay" style={{ zIndex: 1250, background: 'rgba(0,0,0,0.88)' }}>
            <div className="modal-content" style={{ maxWidth: '780px', width: '95%', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.6)' }}>
              {/* Header */}
              <div className="modal-header" style={{ borderBottom: '1px solid #334155', paddingBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Video size={22} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#ffffff', fontWeight: '700' }}>
                      {managerTargetIssueId ? `Issue Solution Video (Ticket #${managerTargetIssueId})` : 'My Assigned Issue Solution Video'}
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                      Assigned to <strong>{ro.name}</strong> ({ro.id}) &nbsp;|&nbsp; Category: <strong style={{ color: '#6ee7b7' }}>{managerCategory}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVideoManagerModal(false)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px' }}
                >
                  <X size={22} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSaveCategoryVideo}>
                <div className="modal-body" style={{ padding: '18px 0', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  
                  {/* Category Field - Strictly Scoped to this RO's assigned issue */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8' }}>
                        Issue Category:
                      </label>
                      <span style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', padding: '2px 8px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 600 }}>
                        {managerTargetIssueId ? `🔒 Locked to Ticket #${managerTargetIssueId}` : `🔒 Scoped to ${ro.id}`}
                      </span>
                    </div>

                    {managerTargetIssueId || myAssignedIssueCategories.length <= 1 ? (
                      <div style={{
                        background: 'rgba(30, 41, 59, 0.8)',
                        color: '#f8fafc',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}>
                        <span>{managerCategory}</span>
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Authorized RO Category</span>
                      </div>
                    ) : (
                      <select
                        value={managerCategory}
                        onChange={(e) => {
                          const newCat = e.target.value;
                          setManagerCategory(newCat);
                          loadCategoryVideoData(newCat);
                        }}
                        className="form-control"
                        style={{ background: '#1e293b', color: '#fff', border: '1px solid #334155' }}
                      >
                        {myAssignedIssueCategories.map(c => (
                          <option key={c} value={c}>
                            {c} (Assigned to {ro.id})
                          </option>
                        ))}
                      </select>
                    )}
                    <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                      Security Policy: Each RO can only change the YouTube link for their respective assigned issues.
                    </span>
                  </div>

                  {/* Video Title */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Video Title / Headline:
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={managerVideoTitle}
                      onChange={(e) => setManagerVideoTitle(e.target.value)}
                      placeholder="e.g. NITTE Academic Guide: Course Enrollment & Attendance Policy"
                      required
                      style={{ background: '#1e293b', color: '#fff', border: '1px solid #334155' }}
                    />
                  </div>

                  {/* YouTube Video Link */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      YouTube Video URL / Link:
                    </label>
                    <input
                      type="url"
                      className="form-control"
                      value={managerVideoUrl}
                      onChange={(e) => setManagerVideoUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=... or https://youtu.be/..."
                      required
                      style={{ background: '#1e293b', color: '#fff', border: '1px solid #334155' }}
                    />
                    <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                      Paste any YouTube link (watch URL, share shortlink, or embed link).
                    </span>
                  </div>

                  {/* Live Video Preview */}
                  {managerVideoUrl && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                        Live Video Preview:
                      </label>
                      <div style={{ position: 'relative', width: '100%', paddingBottom: '45%', height: 0, overflow: 'hidden', borderRadius: '8px', background: '#000' }}>
                        {isEmbed ? (
                          <iframe
                            src={embedUrl}
                            title="Live Video Preview"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                          />
                        ) : (
                          <video
                            src={managerVideoUrl}
                            controls
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Guidance Checklist / Steps */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                      Key Troubleshooting Steps / FAQ Notes:
                    </label>
                    <textarea
                      rows={4}
                      className="form-control"
                      value={managerVideoDesc}
                      onChange={(e) => setManagerVideoDesc(e.target.value)}
                      placeholder="Enter numbered points or instructions for students to resolve this issue..."
                      style={{ background: '#1e293b', color: '#fff', border: '1px solid #334155', resize: 'vertical' }}
                    />
                  </div>

                  {managerSaveSuccess && (
                    <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#6ee7b7', padding: '10px 14px', borderRadius: '6px', fontSize: '0.82rem' }}>
                      ✅ Guidance video successfully updated and saved to system database!
                    </div>
                  )}

                </div>

                {/* Footer */}
                <div className="modal-footer" style={{ borderTop: '1px solid #334155', paddingTop: '14px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setShowVideoManagerModal(false)}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ background: '#2563eb', padding: '8px 20px', fontWeight: 600 }}
                  >
                    💾 Save & Publish Guidance Video
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
