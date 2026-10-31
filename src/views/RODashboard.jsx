import React, { useContext, useState, useEffect, useRef } from 'react';
import { DatabaseContext, getYoutubeEmbedUrl } from '../context/DatabaseContext';
import { Inbox, CheckCircle2, AlertTriangle, Calendar, User, Search, RefreshCw, Send, RotateCcw, Video, Mic, MicOff, VideoOff, Square, Shield, Play, Camera, AlertCircle, X, Download, PhoneOff, Volume2, VolumeX, FileText, MessageSquare } from 'lucide-react';
import { WebRtcMeetingSession, getCanonicalMeetingRoomId } from '../utils/webrtcService';
import { CompositeMeetingRecorder } from '../utils/compositeRecorder';
import { createFallbackMediaStream } from '../utils/mediaFallback';
import VideoStreamPlayer from '../components/VideoStreamPlayer';
import SelfHelpManagerModal from '../components/SelfHelpManagerModal';
import RecordingSaveStatus from '../components/RecordingSaveStatus';
import { isStoredRecording, recordingExtension } from '../../shared/meetingRecordings.js';
import { getMeetingReassignmentCount, MEETING_REASSIGNMENT_LIMIT } from '../../shared/meetingReassignments.js';
import { resolveCategoryGuidance } from '../../shared/categoryGuidance.js';
import { getRoPriorityRank, sortRoIssuesByPriority, getRoIssueReadKey, getRoMeetingReadKey, RO_SEEN_STORAGE_KEY, getRoBrowserStorage, readRoSeenEntries, markRoItemsSeen } from '../utils/roInbox';
import { getUniqueMeetings, getRoMeetingQueue, getMeetingIssueId, getRoMeetingState, hasRoMeetingFeedback, isRoMeetingAwaitingFeedback } from '../utils/roMeetings';

export const RODashboard = ({ roId }) => {
  const { db, updateMeetingStatus, resolveIssue, escalateIssue, scheduleRoMeeting, saveMeetingRecording, loadMeetingRecording, updateCategoryVideo, submitRoMeetingFeedback } = useContext(DatabaseContext);

  // RO filters
  const [statusFilter, setStatusFilter] = useState('All'); // 'All', 'Assigned to RO', 'Meeting Scheduled', 'Re-opened by Student', 'Resolved', 'Escalated'
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [seenItems, setSeenItems] = useState(() => readRoSeenEntries(getRoBrowserStorage()));

  useEffect(() => {
    const syncSeenItems = event => {
      if (event.key !== RO_SEEN_STORAGE_KEY) return;
      setSeenItems(previous => ({ ...previous, ...readRoSeenEntries(getRoBrowserStorage()) }));
    };
    window.addEventListener('storage', syncSeenItems);
    return () => window.removeEventListener('storage', syncSeenItems);
  }, []);

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
  const [managerNoVideo, setManagerNoVideo] = useState(false);
  const [managerSaveSuccess, setManagerSaveSuccess] = useState(false);
  const [managerTargetIssueId, setManagerTargetIssueId] = useState(null);

  // Online Meeting Video & Auto-Recorder Modal State
  const [showOnlineMeetingModal, setShowOnlineMeetingModal] = useState(false);
  const [activeMeetingIssueId, setActiveMeetingIssueId] = useState(null);
  const activeMeetingIssueRef = useRef(null);
  activeMeetingIssueRef.current = activeMeetingIssueId;
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [mediaPermissionState, setMediaPermissionState] = useState('idle'); // 'idle' | 'requesting' | 'granted' | 'denied'
  const [mediaPermissionError, setMediaPermissionError] = useState('');
  const [playingRecording, setPlayingRecording] = useState(null);
  const [recordingPlaybackError, setRecordingPlaybackError] = useState('');
  const [playbackRevision, setPlaybackRevision] = useState(0);
  const [recordingUploads, setRecordingUploads] = useState([]);
  const pendingRecordingsRef = useRef(new Map());

  // WebRTC Peer Connection States & References
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [isStudentMicMuted, setIsStudentMicMuted] = useState(false);
  const [isStudentCameraOff, setIsStudentCameraOff] = useState(false);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const compositeRecorderRef = useRef(null);
  const webrtcSessionRef = useRef(null);
  const isEndingMeetingRef = useRef(false);

  // In-Meeting Cinematic Console States
  const [showInMeetingSidebar, setShowInMeetingSidebar] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecActive, setIsRecActive] = useState(true);
  const [inMeetingDirectives, setInMeetingDirectives] = useState([
    '1. Network Admin AP-09 replacement (Oct 25 11:00 AM)',
    '2. Library Cubicle #14 temp pass (Immediate)'
  ]);
  const [newDirectiveInput, setNewDirectiveInput] = useState('');
  const [inMeetingConsent, setInMeetingConsent] = useState(true);

  // Form states
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [escalateSuccessMsg, setEscalateSuccessMsg] = useState('');
  const [isSubmittingEscalate, setIsSubmittingEscalate] = useState(false);

  // Schedule meeting form states
  const meetingScheduleSubmittingRef = useRef(false);
  const [isSchedulingMeeting, setIsSchedulingMeeting] = useState(false);
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
    const requestedRoom = activeMeetingIssueRef.current;
    if (!requestedRoom) return;
    setMediaPermissionState('requesting');
    setMediaPermissionError('');
    try {
      let stream = null;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('Your browser does not support camera/microphone access (WebRTC).');
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            aspectRatio: { ideal: 1.7777777778 },
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
          console.warn('[RO] Advanced audio constraints fallback, requesting standard widescreen media:', audioErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              aspectRatio: { ideal: 1.7777777778 }
            },
            audio: true
          });
        } catch (camErr) {
          console.warn('[RO] Hardware webcam unavailable or locked by another tab, falling back to simulated stream:', camErr);
          stream = createFallbackMediaStream({
            label: ro?.name || 'Relationship Officer',
            role: 'RO'
          });
          setMediaPermissionError('Hardware camera unavailable or in use by another tab. Using active simulated video feed.');
        }
      }

      if (!stream) {
        stream = createFallbackMediaStream({
          label: ro?.name || 'Relationship Officer',
          role: 'RO'
        });
      }

      if (activeMeetingIssueRef.current !== requestedRoom || isEndingMeetingRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMediaPermissionState('granted');

      const rawTarget =
        activeMeetingIssueId || 
        activeMeeting?.issueId || 
        activeMeeting?.issue_id || 
        activeMeeting?.id ||
        (selectedIssue ? (selectedIssue.id || selectedIssue.issue_id) : selectedIssueId) ||
        'TICK-1002';
      const targetIssueId = getCanonicalMeetingRoomId(rawTarget);

      // Initialize WebRTC Meeting Session for live peer-to-peer video with student
      if (targetIssueId) {
        if (webrtcSessionRef.current && !webrtcSessionRef.current.isClosed) {
          webrtcSessionRef.current.updateLocalStream(stream);
        } else {
          if (webrtcSessionRef.current) {
            try { webrtcSessionRef.current.close(); } catch (e) {}
          }
          webrtcSessionRef.current = new WebRtcMeetingSession({
            issueId: targetIssueId,
            role: 'ro',
            localStream: stream,
            onRemoteStream: (remStream) => {
              remoteStreamRef.current = remStream;
              setRemoteStream(remStream);
              if (compositeRecorderRef.current) {
                compositeRecorderRef.current.setRemoteStream(remStream);
              }
            },
            onPeerStatus: (status) => {
              setPeerConnected(Boolean(status.connected));
            },
            onRemoteMediaState: (state) => {
              if (typeof state.video === 'boolean') {
                setIsStudentCameraOff(!state.video);
                compositeRecorderRef.current?.setRemoteCamOff(!state.video);
              }
              if (typeof state.audio === 'boolean') setIsStudentMicMuted(!state.audio);
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
        if (compositeRecorderRef.current?.isRecording) {
          compositeRecorderRef.current.setLocalStream(stream);
        } else {
          compositeRecorderRef.current = new CompositeMeetingRecorder({
          localStream: stream,
          localLabel: ro?.name || 'Relationship Officer',
          remoteLabel: selectedIssue ? (selectedIssue.studentName || 'Student') : 'Student',
          ticketId: targetIssueId || 'TICKET',
          localRole: 'RO',
          remoteRole: 'Student',
          width: 960,
          height: 540,
          fps: 20
        });
          compositeRecorderRef.current.setRemoteStream(remoteStreamRef.current);
          compositeRecorderRef.current.start();
        }
      } catch (recErr) {
        console.warn('CompositeMeetingRecorder error:', recErr);
      }
    } catch (err) {
      if (activeMeetingIssueRef.current !== requestedRoom || isEndingMeetingRef.current) return;
      console.warn('RO camera/mic permission error fallback:', err);
      const fallbackStream = createFallbackMediaStream({
        label: ro?.name || 'Relationship Officer',
        role: 'RO'
      });
      localStreamRef.current = fallbackStream;
      setLocalStream(fallbackStream);
      setMediaPermissionState('granted');
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
    if (webrtcSessionRef.current) {
      webrtcSessionRef.current.setAudioEnabled(!nextMuted);
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
    if (webrtcSessionRef.current) {
      webrtcSessionRef.current.setVideoEnabled(!nextCamOff);
    }
    if (compositeRecorderRef.current) {
      compositeRecorderRef.current.setLocalCamOff(nextCamOff);
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
          const screenTrack = screenStream.getVideoTracks()[0];
          if (screenTrack && localStreamRef.current) {
            const currentVideoTrack = localStreamRef.current.getVideoTracks()[0];
            if (currentVideoTrack) {
              localStreamRef.current.removeTrack(currentVideoTrack);
              currentVideoTrack.stop();
            }
            localStreamRef.current.addTrack(screenTrack);
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
            if (webrtcSessionRef.current) {
              webrtcSessionRef.current.updateLocalStream(localStreamRef.current);
            }
            screenTrack.onended = () => {
              setIsScreenSharing(false);
              requestMediaPermissions();
            };
            setIsScreenSharing(true);
          }
        }
      } catch (err) {
        console.warn('Screen share cancelled or failed:', err);
      }
    } else {
      setIsScreenSharing(false);
      requestMediaPermissions();
    }
  };

  // Auto-recording timer & media cleanup effect
  useEffect(() => {
    let timer;
    if (activeMeetingIssueId) {
      timer = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
      requestMediaPermissions();
    } else {
      setRecordingSeconds(0);
      setMediaPermissionState('idle');
      if (compositeRecorderRef.current) {
        compositeRecorderRef.current.stop().catch(() => {});
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
    }
    return () => {
      clearInterval(timer);
      if (compositeRecorderRef.current) {
        compositeRecorderRef.current.stop().catch(() => {});
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
    };
  }, [activeMeetingIssueId]);

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
  const ro = (db.users?.ros || []).find(r => r.id === roId) || db.users?.ros?.[0] || { id: 'RO-01', name: 'Relationship Officer' };

  // Issues assigned to this RO
  const roIssues = sortRoIssuesByPriority((db.issues || []).filter(i => (i.roId === ro.id || i.ro_id === ro.id)));
  const activeRoIssues = roIssues.filter(i => i.status !== 'Resolved' && i.status !== 'Closed');

  // Categories belonging strictly to this RO's assigned issues & assigned region
  const myAssignedIssueCategories = Array.from(new Set([
    ...roIssues.map(i => i.category),
    ro?.region,
    ro?.category
  ].filter(Boolean)));

  const trimmedQuery = searchQuery.trim().toLowerCase();

  // One queue drives the cards, count, and filter until RO feedback is submitted.
  const uniqueMeetings = getUniqueMeetings(db.meetings || []);
  const scheduledMeetings = getRoMeetingQueue({ meetings: uniqueMeetings, issues: roIssues, roId: ro.id });
  const scheduledIssueIds = new Set(scheduledMeetings.map(getMeetingIssueId));

  // Helper to check if search query matches ticket ID
  const isTicketIdMatch = (issue) => {
    if (!trimmedQuery) return false;
    const tId = (issue.id || issue.issue_id || '').toLowerCase();
    return tId.includes(trimmedQuery);
  };

  // Filtered issues list:
  // Rule: When an issue is resolved, do NOT show it in the RO assigned issues list by default.
  // Show the resolved issue ONLY when searched by its Ticket ID.
  const filteredIssues = roIssues.filter(issue => {
    const isResolved = issue.status === 'Resolved';

    if (isResolved) {
      // Resolved issues are completely hidden from the assigned queue by default
      // They ONLY show up when specifically searched by Ticket ID
      if (!trimmedQuery || !isTicketIdMatch(issue)) {
        return false;
      }
      if (statusFilter !== 'All' && statusFilter !== 'Resolved') {
        return false;
      }
      return true;
    }

    // Active non-resolved issues
    const matchesStatus = statusFilter === 'All'
      || (statusFilter === 'Meeting Scheduled'
        ? scheduledIssueIds.has(String(issue.id || issue.issue_id || '').trim().toUpperCase())
        : issue.status === statusFilter)
      || (statusFilter === 'Escalated' && (issue.status === 'Re-escalated' || Boolean(issue.isReEscalated)));
    if (!matchesStatus) return false;

    if (!trimmedQuery) return true;

    const matchesSearch =
      issue.studentName?.toLowerCase().includes(trimmedQuery) ||
      isTicketIdMatch(issue) ||
      issue.category?.toLowerCase().includes(trimmedQuery);
    return matchesSearch;
  });

  const selectedIssue = roIssues.find(i => (i.id || i.issue_id)?.toUpperCase() === selectedIssueId?.toUpperCase());
  const selectedIssueReadKey = getRoIssueReadKey(ro.id, selectedIssue);
  const selectedMeetingReadKeys = uniqueMeetings
    .filter(meeting => String(meeting.roId || meeting.ro_id || '').trim().toUpperCase() === String(ro.id).trim().toUpperCase() &&
      getMeetingIssueId(meeting) === String(selectedIssue?.id || selectedIssue?.issue_id || '').trim().toUpperCase())
    .map(meeting => getRoMeetingReadKey(ro.id, meeting)).join('\n');

  // Only opening the issue detail marks it read; polling and hovering do not.
  useEffect(() => {
    if (!selectedIssueReadKey) return;
    setSeenItems(previous => markRoItemsSeen(previous, [selectedIssueReadKey, ...selectedMeetingReadKeys.split('\n')], getRoBrowserStorage()));
  }, [selectedIssueReadKey, selectedMeetingReadKeys]);

  // Find if selected issue has a meeting scheduled & count reassignments
  const rawActiveMeeting = selectedIssue ? uniqueMeetings.find(m => (m.issueId || m.issue_id)?.trim().toUpperCase() === (selectedIssue.id || selectedIssue.issue_id)?.trim().toUpperCase()) : null;
  const activeMeeting = rawActiveMeeting || (selectedIssue && (selectedIssue.status === 'Meeting Scheduled' || selectedIssue.status === 'Meeting Started') ? {
    id: `MEET-${selectedIssue.id}`,
    issueId: selectedIssue.id,
    issue_id: selectedIssue.id,
    studentId: selectedIssue.studentId,
    student_id: selectedIssue.studentId,
    studentName: selectedIssue.studentName,
    student_name: selectedIssue.studentName,
    roId: selectedIssue.roId || ro?.id,
    ro_id: selectedIssue.roId || ro?.id,
    date: todayStr,
    time: '11:00',
    mode: 'Online',
    location: 'In-App Online Video Call Portal',
    notes: 'Scheduled meeting session with Relationship Officer.',
    status: 'Confirmed',
    endedByRo: false
  } : null);
  const meetingState = getRoMeetingState(activeMeeting, selectedIssue);
  const meetingReassignCount = getMeetingReassignmentCount(selectedIssue, activeMeeting);
  const isReassignLimitReached = Boolean(activeMeeting && meetingReassignCount >= MEETING_REASSIGNMENT_LIMIT);

  // Check if meeting date has passed without being conducted (Missed / Expired Meeting)
  const isMeetingExpired = (() => {
    if (meetingState !== 'scheduled') return false;
    if (!selectedIssue || selectedIssue.status === 'Resolved' || selectedIssue.status === 'Escalated') return false;
    if (!activeMeeting || !activeMeeting.date) return false;

    // If RO has already marked the meeting as Started, In-Progress, or Completed, it is not expired
    if (activeMeeting.status === 'Started' || activeMeeting.status === 'In-Progress' || activeMeeting.status === 'Completed') return false;

    // Any meeting on today's date or in the future is active and can be started - not expired!
    if (activeMeeting.date >= todayStr) return false;

    // Only past dates (yesterday or older) that were never started count as expired
    return true;
  })();

  // Institutional Compliance: Check if issue is being handled via an active online meeting
  // If reassigned to Offline, log minutes are NOT required to resolve (log minutes strictly belong to online sessions)
  const isDoneThroughOnline = Boolean(activeMeeting && activeMeeting.mode === 'Online');

  // Check if RO has filed the official discussion minutes for this meeting or issue
  const hasFiledDiscussionMinutes = activeMeeting ? hasRoMeetingFeedback(activeMeeting) : false;

  // If online, RO MUST file discussion minutes before ticket can be marked as Resolved
  const isOnlineMeetingPendingMinutes = isDoneThroughOnline && !hasFiledDiscussionMinutes;

  const handleModeChange = (newMode) => {
    setMeetMode(newMode);
    if (newMode === 'Online') {
      setMeetLocation('In-App Online Video Call Portal');
    } else if (newMode === 'Offline' && (meetLocation.includes('In-App') || meetLocation.includes('Online Video') || meetLocation.includes('Video Link') || meetLocation.includes('Portal'))) {
      setMeetLocation('RO Office Desk 1 (Admin Block)');
    }
  };

  const handleOpenScheduleModal = () => {
    if (!selectedIssue) return;
    if (selectedIssue.status === 'Resolved' || selectedIssue.status === 'Escalated' || selectedIssue.status === 'Re-escalated' || selectedIssue.isReEscalated) {
      alert('🔒 Ticket Locked: You cannot schedule or reassign meetings for a resolved or escalated ticket.');
      return;
    }
    if (isReassignLimitReached) {
      alert('RO Limit Reached: A Relationship Officer can only reschedule/reassign a meeting twice per issue (2/2 Used). If further changes are needed, please escalate the issue to the Admin Office.');
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
      setMeetLocation(initialMode === 'Online' ? 'In-App Online Video Call Portal' : (activeMeeting.location || 'RO Office Desk 1 (Admin Block)'));
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

  const handleLaunchOnlineMeeting = (directMeet = null, directIssue = null) => {
    if (activeMeetingIssueId) {
      alert('End the current meeting before starting another meeting.');
      return;
    }
    const meetToUse = directMeet || activeMeeting;
    const issueToUse = directIssue || selectedIssue || (meetToUse ? (db.issues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === (meetToUse.issueId || meetToUse.issue_id)?.toUpperCase()) : null);
    if (getRoMeetingState(meetToUse, issueToUse) !== 'scheduled') return;
    if (issueToUse && (issueToUse.status === 'Resolved' || issueToUse.status === 'Escalated' || issueToUse.status === 'Re-escalated' || issueToUse.isReEscalated)) {
      alert('🔒 Ticket Locked: Meeting cannot be launched because this ticket is resolved or escalated.');
      return;
    }
    if (issueToUse && issueToUse.id) {
      setSelectedIssueId(issueToUse.id);
    }
    const rawTarget = (meetToUse && (meetToUse.issueId || meetToUse.issue_id)) || (issueToUse && issueToUse.id) || (meetToUse && meetToUse.id) || 'TICK-1002';
    const targetId = getCanonicalMeetingRoomId(rawTarget);
    setActiveMeetingIssueId(targetId);
    isEndingMeetingRef.current = false;
    if (meetToUse && (meetToUse.id || meetToUse.issueId)) {
      updateMeetingStatus(meetToUse.id || meetToUse.issueId || targetId, 'Started');
    }
    setRecordingSeconds(0);
    setIsCameraOff(false);
    setIsMicMuted(false);
    setShowOnlineMeetingModal(true);
  };

  const handleConcludeOfflineMeeting = () => {
    if (!activeMeeting || !selectedIssue) return;
    if (selectedIssue.status === 'Resolved' || selectedIssue.status === 'Escalated' || selectedIssue.status === 'Re-escalated' || selectedIssue.isReEscalated) {
      alert('🔒 Ticket Locked: Meeting cannot be concluded because this ticket is resolved or escalated.');
      return;
    }
    const currentMeetId = activeMeeting.id || activeMeeting.issueId;
    updateMeetingStatus(currentMeetId, 'Completed');
    setPostMeetingData({
      meetingId: currentMeetId,
      issueId: selectedIssue.id,
      studentName: selectedIssue.studentName || 'Student',
      studentId: selectedIssue.studentId || '',
      category: selectedIssue.category || 'General',
      durationText: 'In-Person Session'
    });
    setDiscussionSummary(activeMeeting.discussionSummary || '');
    setActionItems(activeMeeting.actionItems || '');
    setMeetingOutcome('In-Progress');
    setFollowUpNeeded(false);
    setShowMeetingFeedbackModal(true);
  };

  const updateRecordingUpload = (id, details) => setRecordingUploads(previous => {
    const current = previous.find(upload => upload.id === id) || { id };
    return [{ ...current, ...details }, ...previous.filter(upload => upload.id !== id)];
  });

  const uploadPendingRecording = async id => {
    const pending = pendingRecordingsRef.current.get(id);
    if (!pending || pending.uploading) return;
    pending.uploading = true;
    updateRecordingUpload(id, { issueId: pending.issueId, status: 'saving', hasBlob: true, message: 'Keep this page open until the upload finishes.' });
    try {
      await saveMeetingRecording(pending.meetingId, pending.issueId, pending.durationSeconds, pending.blob, pending.summary, { recordingId: id });
      pendingRecordingsRef.current.delete(id);
      updateRecordingUpload(id, { status: 'saved', hasBlob: false, message: 'The video is available in the recording archive and will remain after refresh.' });
      setTimeout(() => setRecordingUploads(previous => previous.filter(upload => upload.id !== id)), 8000);
    } catch (error) {
      updateRecordingUpload(id, { status: 'error', hasBlob: true, message: error.message || 'Upload failed. Retry or download the recording before leaving this page.' });
    } finally { pending.uploading = false; }
  };

  const downloadPendingRecording = id => {
    const pending = pendingRecordingsRef.current.get(id);
    if (!pending?.blob) return;
    const url = URL.createObjectURL(pending.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recording-${pending.issueId}.${recordingExtension(pending.blob.type)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const openRecording = async recording => {
    setRecordingPlaybackError('');
    setPlayingRecording(recording);
    try {
      const saved = await loadMeetingRecording(recording.id);
      setRecordingPlaybackError('');
      setPlayingRecording(current => current?.id === recording.id ? saved : current);
      setPlaybackRevision(previous => previous + 1);
    } catch (error) {
      setRecordingPlaybackError(error.message || 'Could not open the saved recording.');
    }
  };

  const handleStopAndSaveRecording = async () => {
    if (isEndingMeetingRef.current) return;
    isEndingMeetingRef.current = true;
    const targetIssueId = activeMeetingIssueId || selectedIssue?.id;
    const currentIssue = roIssues.find(issue => getCanonicalMeetingRoomId(issue.id || issue.issue_id) === getCanonicalMeetingRoomId(targetIssueId));
    if (!currentIssue) { setShowOnlineMeetingModal(false); setActiveMeetingIssueId(null); return; }
    const currentMeet = uniqueMeetings.find(meeting => getMeetingIssueId(meeting) === String(currentIssue.id || currentIssue.issue_id).trim().toUpperCase()) || activeMeeting;
    const meetingId = currentMeet?.id || currentMeet?.issueId || `MEET-${currentIssue.id}`;
    const recordingId = `REC-${crypto.randomUUID()}`;

    // Detach and stop the recorder before hiding the stage triggers React cleanup.
    const recorder = compositeRecorderRef.current;
    compositeRecorderRef.current = null;
    const completion = recorder ? recorder.stop() : Promise.reject(new Error('No video was captured for this meeting. The recording was not saved.'));
    updateRecordingUpload(recordingId, { issueId: currentIssue.id, status: 'saving', hasBlob: false, message: 'Finalizing the video file…' });
    if (webrtcSessionRef.current) {
      try { webrtcSessionRef.current.sendSignal({ type: 'meeting-ended' }); } catch { }
    }
    updateMeetingStatus(meetingId, 'Completed');
    setPostMeetingData({ meetingId, issueId: currentIssue.id, studentName: currentIssue.studentName || 'Student', studentId: currentIssue.studentId || '', category: currentIssue.category || 'General', durationText: formatTimer(recordingSeconds) });
    setDiscussionSummary('');
    setActionItems('');
    setMeetingOutcome(currentIssue.status === 'Resolved' ? 'Resolved' : 'In-Progress');
    setFollowUpNeeded(false);
    setShowOnlineMeetingModal(false);
    setActiveMeetingIssueId(null);
    setShowMeetingFeedbackModal(true);
    remoteStreamRef.current = null;
    try {
      const result = await completion;
      pendingRecordingsRef.current.set(recordingId, {
        meetingId, issueId: currentIssue.id, durationSeconds: result.durationSeconds, blob: result.blob,
        summary: `Meeting between RO ${ro.name} and ${currentIssue.studentName || 'Student'}; includes both video feeds and microphones.`
      });
      await uploadPendingRecording(recordingId);
    } catch (error) {
      updateRecordingUpload(recordingId, { status: 'error', hasBlob: false, message: error.message || 'The browser could not finish the recording.' });
    }
  };

  const handleOpenMeetingFeedback = (meeting, issue) => {
    setSelectedIssueId(issue.id || issue.issue_id);
    setPostMeetingData({
      meetingId: meeting.id || meeting.issueId || meeting.issue_id,
      issueId: issue.id || issue.issue_id,
      studentName: issue.studentName || issue.student_name || 'Student',
      studentId: issue.studentId || issue.student_id || '',
      category: issue.category || 'General',
      durationText: 'Concluded Session'
    });
    setDiscussionSummary(meeting.discussionSummary || meeting.discussion_summary || '');
    setActionItems(meeting.actionItems || '');
    setMeetingOutcome('In-Progress');
    setFollowUpNeeded(Boolean(meeting.followUpNeeded));
    setShowMeetingFeedbackModal(true);
  };

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
    if (!selectedIssue) return;
    if (selectedIssue.status === 'Resolved') {
      alert('🔒 Ticket Locked: This ticket is already marked as Resolved.');
      return;
    }
    if (selectedIssue.status === 'Escalated' || selectedIssue.status === 'Re-escalated' || selectedIssue.isReEscalated) {
      alert('🔒 Ticket Locked: This ticket is currently escalated to Administration. The RO cannot resolve an escalated ticket.');
      return;
    }
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

    if (selectedIssue && (selectedIssue.status === 'Resolved' || selectedIssue.status === 'Escalated' || selectedIssue.status === 'Re-escalated' || selectedIssue.isReEscalated)) {
      alert('🔒 Ticket Locked: Ticket is already resolved or escalated.');
      setShowResolveModal(false);
      return;
    }

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

  const handleOpenEscalateModal = () => {
    if (!selectedIssue) return;

    if (selectedIssue.status === 'Resolved') {
      alert('🔒 Ticket Locked: You cannot escalate an already resolved ticket. The student may re-open the issue if further assistance is needed.');
      return;
    }

    if (!hasFiledDiscussionMinutes) {
      alert(
        '🔒 Mandatory Institutional Requirement:\n\n' +
        'Before escalating this issue to the Administration/Principal, the Relationship Officer MUST log the official Discussion Minutes.\n\n' +
        'Please document your meeting deliberations, student interaction details, and action items first.\n\n' +
        'Opening the Log Discussion Minutes form now...'
      );
      setPostMeetingData({
        meetingId: activeMeeting?.id || activeMeeting?.issueId || `MEET-${selectedIssue.id}`,
        issueId: selectedIssue.id,
        studentName: selectedIssue.studentName || 'Student',
        studentId: selectedIssue.studentId || '',
        category: selectedIssue.category || 'General',
        durationText: activeMeeting?.status === 'Completed' ? 'Concluded Session' : 'Preliminary Hearing / Assessment'
      });
      setDiscussionSummary(activeMeeting?.discussionSummary || selectedIssue?.discussionSummary || '');
      setActionItems(activeMeeting?.actionItems || selectedIssue?.actionItems || '');
      setMeetingOutcome('In-Progress');
      setFollowUpNeeded(Boolean(activeMeeting?.followUpNeeded));
      setShowMeetingFeedbackModal(true);
      return;
    }

    setShowEscalateModal(true);
  };

  const handleEscalateSubmit = async (e) => {
    e.preventDefault();
    if (!escalationReason.trim() || !selectedIssueId) return;

    if (selectedIssue && selectedIssue.status === 'Resolved') {
      alert('🔒 Ticket Locked: You cannot escalate an already resolved ticket. The student may re-open the issue if further assistance is needed.');
      setShowEscalateModal(false);
      return;
    }

    if (!hasFiledDiscussionMinutes) {
      alert(
        '🔒 Mandatory Institutional Requirement:\n\n' +
        'Official Discussion Minutes must be logged before this issue can be escalated to Administration.\n\n' +
        'Opening the Discussion Minutes form now...'
      );
      setShowEscalateModal(false);
      setPostMeetingData({
        meetingId: activeMeeting?.id || activeMeeting?.issueId || `MEET-${selectedIssue.id}`,
        issueId: selectedIssue.id,
        studentName: selectedIssue.studentName || 'Student',
        studentId: selectedIssue.studentId || '',
        category: selectedIssue.category || 'General',
        durationText: activeMeeting?.status === 'Completed' ? 'Concluded Session' : 'Preliminary Hearing / Assessment'
      });
      setDiscussionSummary(activeMeeting?.discussionSummary || selectedIssue?.discussionSummary || '');
      setActionItems(activeMeeting?.actionItems || selectedIssue?.actionItems || '');
      setMeetingOutcome('In-Progress');
      setFollowUpNeeded(Boolean(activeMeeting?.followUpNeeded));
      setShowMeetingFeedbackModal(true);
      return;
    }

    const isReEscalate = selectedIssue?.status === 'Escalated' || selectedIssue?.status === 'Re-escalated' || Boolean(selectedIssue?.isReEscalated);
    setIsSubmittingEscalate(true);
    try {
      await escalateIssue(selectedIssueId, ro.id, escalationReason, isReEscalate);
      setEscalateSuccessMsg(`✅ Ticket #${selectedIssueId} ${isReEscalate ? 're-escalation directive & urgency remarks' : 'escalation'} successfully dispatched to Admin Office!`);
      setEscalationReason('');
      setShowEscalateModal(false);
      setTimeout(() => setEscalateSuccessMsg(''), 6000);
    } catch (err) {
      alert('Error updating escalation: ' + (err.message || err));
    } finally {
      setIsSubmittingEscalate(false);
    }
  };

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    if (meetingScheduleSubmittingRef.current) return;
    if (!meetDate || !meetTime || !selectedIssueId) return;

    if (selectedIssue && (selectedIssue.status === 'Resolved' || selectedIssue.status === 'Escalated' || selectedIssue.status === 'Re-escalated' || selectedIssue.isReEscalated)) {
      alert('🔒 Ticket Locked: You cannot schedule or modify meetings for a resolved or escalated ticket.');
      setShowScheduleModal(false);
      return;
    }

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

    meetingScheduleSubmittingRef.current = true;
    setIsSchedulingMeeting(true);
    try {
      await scheduleRoMeeting(
        selectedIssueId,
        selectedIssue?.studentId || selectedIssue?.student_id,
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
    } catch (err) {
      console.error('Schedule error:', err);
    } finally {
      meetingScheduleSubmittingRef.current = false;
      setIsSchedulingMeeting(false);
    }
  };

  const handleOpenOnlineNotDoneModal = () => {
    if (!selectedIssue) return;
    if (selectedIssue.status === 'Resolved' || selectedIssue.status === 'Escalated' || selectedIssue.status === 'Re-escalated' || selectedIssue.isReEscalated) {
      alert('🔒 Ticket Locked: You cannot modify meetings for a resolved or escalated ticket.');
      return;
    }
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
    if (meetingScheduleSubmittingRef.current) return;
    if (selectedIssue && (selectedIssue.status === 'Resolved' || selectedIssue.status === 'Escalated' || selectedIssue.status === 'Re-escalated' || selectedIssue.isReEscalated)) {
      alert('🔒 Ticket Locked: You cannot reschedule or modify meetings for a resolved or escalated ticket.');
      setShowOnlineNotDoneModal(false);
      return;
    }
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

    meetingScheduleSubmittingRef.current = true;
    setIsSubmittingOfflineReschedule(true);
    try {
      await scheduleRoMeeting(
        selectedIssueId,
        selectedIssue?.studentId || selectedIssue?.student_id,
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
      meetingScheduleSubmittingRef.current = false;
      setIsSubmittingOfflineReschedule(false);
    }
  };

  const loadCategoryVideoData = (cat) => {
    setManagerSaveSuccess(false);
    const guidance = resolveCategoryGuidance(cat, db.categoryVideos || []);
    setManagerNoVideo(!guidance.available);
    setManagerVideoTitle(guidance.record?.title || `${cat} Guidance & Solution Video`);
    setManagerVideoUrl(guidance.videoUrl);
    setManagerVideoDesc(guidance.record?.description || '');
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
    if (!managerNoVideo && !managerVideoUrl.trim()) {
      alert('Please enter a valid YouTube or video link.');
      return;
    }

    if (myAssignedIssueCategories.length > 0 && !myAssignedIssueCategories.includes(managerCategory)) {
      alert(`⛔ Permission Denied: As RO (${ro.name}), you are only authorized to edit YouTube solution videos for your own assigned issues and categories.`);
      return;
    }

    await updateCategoryVideo(managerCategory, managerVideoUrl, managerVideoTitle, managerVideoDesc, ro.id, { noVideo: managerNoVideo });
    setManagerSaveSuccess(true);
    setTimeout(() => setManagerSaveSuccess(false), 3000);
    alert(managerNoVideo
      ? `No Video Available saved for ${managerCategory}. Students will skip video playback for this issue.`
      : `Solution video updated for ${managerCategory}. Students will see the configured video.`);
  };

  return (
    <div className="text-slate-800 font-sans antialiased w-full selection:bg-blue-700 selection:text-white space-y-6">
      {!showMeetingFeedbackModal && <RecordingSaveStatus uploads={recordingUploads} onRetry={uploadPendingRecording} onDownload={downloadPendingRecording} />}
      {/* Top Command & Officer Identity Banner */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-slate-200 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-500"></div>
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6">
          {/* Officer Profile & Accreditation Pill */}
          <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-4 min-w-0">
            <div className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-2xl border border-blue-100 bg-blue-50 text-blue-700">
              <span className="material-symbols-outlined text-3xl">account_circle</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true"></span>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  {ro.name}
                </h2>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-semibold text-xs tracking-tight shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  Senior Relationship Officer (RO)
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-xs shadow-2xs">
                  <span className="material-symbols-outlined text-xs text-emerald-600">verified</span>
                  Authorized Officer
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-2 font-medium flex items-center flex-wrap gap-x-2">
                <span className="text-slate-800 font-semibold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-blue-600">domain</span>
                  {ro.region || 'Student Affairs & Support'}
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-slate-600">Cabin 302, Academic Block IV</span>
                <span className="text-slate-300">•</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded-md text-slate-700 font-mono text-xs border border-slate-200 font-semibold">RO ID: {ro.id}</span>
              </p>
            </div>
          </div>
          {/* Quick Action Utilities */}
          <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
            {/* Global Search Bar with Shortcut */}
            <div className="relative flex-1 sm:w-72 xl:w-80">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-blue-600 text-lg pointer-events-none">search</span>
              <input
                className="w-full h-10 pl-9 pr-12 bg-slate-50/80 hover:bg-slate-100/80 focus:bg-white text-slate-900 placeholder-slate-400 border border-slate-200 focus:border-blue-600 rounded-xl text-xs sm:text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-100 shadow-2xs"
                placeholder="Search USN, Student, Ticket ID..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
            {/* Video Management Quick Action */}
            <button
              onClick={() => openVideoManagerForCategory()}
              className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs sm:text-sm transition-all shadow-sm hover:shadow active:scale-95 cursor-pointer"
              type="button"
              title="Manage solution video links for your assigned category"
            >
              <span className="material-symbols-outlined text-lg">videocam</span>
              <span className="whitespace-nowrap">Self-Help Hub</span>
            </button>
          </div>
        </div>

        {/* Telemetry KPI Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-6 pt-5 border-t border-slate-100">
          {/* Metric 1: Assigned */}
          <div
            onClick={() => setStatusFilter('All')}
            className={`bg-white hover:bg-blue-50/30 border ${statusFilter === 'All' ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'} rounded-xl p-3.5 flex items-center justify-between shadow-2xs hover:shadow-xs transition-all duration-200 cursor-pointer group`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-xl">folder_shared</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-500">Total Assigned</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl font-extrabold text-slate-900 tracking-tight">{activeRoIssues.length}</span>
                  <span className="text-[11px] text-blue-700 font-semibold bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-full">Active Cycle</span>
                </div>
              </div>
            </div>
          </div>
          {/* Metric 2: Pending Action */}
          <div
            onClick={() => setStatusFilter('Assigned to RO')}
            className={`bg-white hover:bg-rose-50/30 border ${statusFilter === 'Assigned to RO' ? 'border-rose-500 ring-2 ring-rose-100' : 'border-slate-200 hover:border-rose-300'} rounded-xl p-3.5 flex items-center justify-between shadow-2xs hover:shadow-xs transition-all duration-200 cursor-pointer group`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-xl">priority_high</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-500">Pending Action</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl font-extrabold text-slate-900 tracking-tight">{roIssues.filter(i => i.status === 'Assigned to RO').length}</span>
                  <span className="text-[11px] text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">SLA &lt; 24h</span>
                </div>
              </div>
            </div>
          </div>
          {/* Metric 3: Scheduled Meetings */}
          <div
            onClick={() => setStatusFilter('Meeting Scheduled')}
            className={`bg-white hover:bg-emerald-50/30 border ${statusFilter === 'Meeting Scheduled' ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-emerald-300'} rounded-xl p-3.5 flex items-center justify-between shadow-2xs hover:shadow-xs transition-all duration-200 cursor-pointer group`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-xl">sensors</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-500">Scheduled Meetings</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl font-extrabold text-slate-900 tracking-tight">{scheduledMeetings.length}</span>
                  <span className="text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Until Feedback Submitted</span>
                </div>
              </div>
            </div>
          </div>
          {/* Metric 4: Resolved */}
          <div
            onClick={() => setStatusFilter('Resolved')}
            className={`bg-white hover:bg-indigo-50/30 border ${statusFilter === 'Resolved' ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200 hover:border-indigo-300'} rounded-xl p-3.5 flex items-center justify-between shadow-2xs hover:shadow-xs transition-all duration-200 cursor-pointer group`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform">
                <span className="material-symbols-outlined text-xl">task_alt</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-slate-500">Resolved Archive</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="text-2xl font-extrabold text-slate-900 tracking-tight">{roIssues.filter(i => i.status === 'Resolved').length}</span>
                  <span className="text-[11px] text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">Storage</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Workspace: Navigation & Master-Detail Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: Queue Rails & High-Density Ticket Feed (xl:col-span-4) */}
        <div className="xl:col-span-4 space-y-4">
          {/* Queue Pipeline Filters */}
          <div className="bg-white rounded-xl p-4 shadow-card border border-slate-200">
            <div className="flex items-center justify-between pb-3 mb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-700"></span>
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Queue Pipeline</span>
              </div>
              <span className="text-[11px] text-slate-500 font-semibold bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Real-Time Sync
              </span>
            </div>

            <div className="flex flex-col gap-1" role="tablist">
              <button
                type="button"
                onClick={() => setStatusFilter('All')}
                className={`flex items-center justify-between px-3 py-2 rounded-lg font-semibold text-xs sm:text-sm transition-all text-left ${statusFilter === 'All' ? 'bg-blue-50/80 text-blue-900 border border-blue-200' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-base text-blue-700">inbox</span> All Assigned Issues
                </span>
                <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-xs">{activeRoIssues.length}</span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('Assigned to RO')}
                className={`flex items-center justify-between px-3 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all text-left ${statusFilter === 'Assigned to RO' ? 'bg-rose-50 text-rose-900 border border-rose-200 font-bold' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-base text-rose-600">mark_email_unread</span> New / Incoming
                </span>
                <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 font-bold text-xs">
                  {roIssues.filter(i => i.status === 'Assigned to RO').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('Meeting Scheduled')}
                className={`flex items-center justify-between px-3 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all text-left ${statusFilter === 'Meeting Scheduled' ? 'bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-base text-emerald-600">videocam</span> Scheduled Meetings
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs">
                  {scheduledMeetings.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('Re-opened by Student')}
                className={`flex items-center justify-between px-3 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all text-left ${statusFilter === 'Re-opened by Student' ? 'bg-amber-50 text-amber-900 border border-amber-200 font-bold' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-base text-amber-600">replay</span> Re-opened by Student
                </span>
                <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold text-xs">
                  {roIssues.filter(i => i.status === 'Re-opened by Student').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('Resolved')}
                className={`flex items-center justify-between px-3 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all text-left ${statusFilter === 'Resolved' ? 'bg-slate-100 text-slate-900 border border-slate-300 font-bold' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-base text-slate-500">check_circle</span> Resolved in Storage
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold text-xs">
                  {roIssues.filter(i => i.status === 'Resolved').length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('Escalated')}
                className={`flex items-center justify-between px-3 py-2 rounded-lg font-medium text-xs sm:text-sm transition-all text-left ${statusFilter === 'Escalated' ? 'bg-rose-50 text-rose-900 border border-rose-200 font-bold' : 'hover:bg-slate-50 text-slate-700'}`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-base text-rose-500">move_up</span> Escalated to Admin
                </span>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-semibold text-xs">
                  {roIssues.filter(i => i.status === 'Escalated' || i.status === 'Re-escalated' || Boolean(i.isReEscalated)).length}
                </span>
              </button>
            </div>
          </div>

          {/* Upcoming Brief Meetings Widget */}
          {scheduledMeetings.length > 0 && (
            <div className="bg-white rounded-xl p-3.5 shadow-card border border-slate-200">
              <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base text-blue-700">calendar_today</span>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Scheduled Meetings</h4>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> {scheduledMeetings.length} Scheduled
                </span>
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2 pr-1 text-xs">
                <p className="text-[10px] font-medium text-slate-500">Priority: High → Medium → Low</p>
                {scheduledMeetings.map(meet => {
                  const isOnline = meet.mode === 'Online';
                  const targetIssue = roIssues.find(issue => String(issue.id || issue.issue_id).trim().toUpperCase() === getMeetingIssueId(meet));
                  const entryState = getRoMeetingState(meet, targetIssue);
                  const awaitingFeedback = isRoMeetingAwaitingFeedback(meet);
                  const priorityRank = getRoPriorityRank(targetIssue?.priority);
                  const isNewMeeting = !seenItems[getRoMeetingReadKey(ro.id, meet)];
                  return (
                    <div
                      key={meet.id}
                      onClick={() => {
                        const targetIssue = db.issues.find(i => (i.id || i.issue_id)?.toUpperCase() === (meet.issueId || meet.issue_id)?.toUpperCase());
                        if (targetIssue) setSelectedIssueId(targetIssue.id);
                      }}
                      className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-blue-300 transition flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold ${isOnline ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'}`}>
                            {meet.time}
                          </span>
                          <span className="font-bold text-slate-900 truncate">{meet.studentName}</span>
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${priorityRank === 0 ? 'border-rose-200 bg-rose-50 text-rose-700' : priorityRank === 1 ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>{['High', 'Medium', 'Low'][priorityRank]}</span>
                          {isNewMeeting && <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">New</span>}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">
                          📅 {meet.date} • {isOnline ? 'WebRTC Online Call' : (meet.location || 'Cabin 302')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${isOnline ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                          {awaitingFeedback ? 'Feedback Pending' : (isOnline ? 'WebRTC' : 'In-Person')}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const targetIssue = db.issues.find(i => (i.id || i.issue_id)?.toUpperCase() === (meet.issueId || meet.issue_id)?.toUpperCase());
                            if (targetIssue) {
                              setSelectedIssueId(targetIssue.id);
                              if (awaitingFeedback) {
                                handleOpenMeetingFeedback(meet, targetIssue);
                              } else if (isOnline && getRoMeetingState(meet, targetIssue) === 'scheduled') {
                                handleLaunchOnlineMeeting(meet, targetIssue);
                              }
                            }
                          }}
                          className={`px-2 py-1 font-bold text-[11px] rounded transition shadow-2xs ${isOnline ? 'bg-blue-700 hover:bg-blue-800 text-white' : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700'}`}
                        >
                          {awaitingFeedback ? 'Fill Feedback' : (isOnline && entryState === 'scheduled' ? 'Start Meeting' : 'View')}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* High-Capacity Live Ticket Feed */}
          <div className="bg-white rounded-xl p-3.5 shadow-card border border-slate-200">
            <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-blue-700">ballot</span>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Active Assigned Queue</h4>
              </div>
              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                {filteredIssues.length} Tickets
              </span>
            </div>

            <div className="max-h-[520px] overflow-y-auto space-y-2 pr-1">
              {filteredIssues.length === 0 ? (
                <div className="text-center py-10 px-4 text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-2 opacity-40">inbox</span>
                  {statusFilter === 'Resolved' && !trimmedQuery ? (
                    <div>
                      <h5 className="text-xs font-bold text-slate-600 mb-1">Resolved Tickets Archived</h5>
                      <p className="text-[11px] max-w-xs mx-auto leading-relaxed">
                        Resolved issues are safely stored. Search by <strong>Ticket ID</strong> above to inspect documentation.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs">No grievances found matching this filter.</p>
                  )}
                </div>
              ) : (
                filteredIssues.map(issue => {
                  const isSelected = selectedIssueId === issue.id;
                  const isResolved = issue.status === 'Resolved';
                  const isNewIssue = !isResolved && issue.status !== 'Closed' && !seenItems[getRoIssueReadKey(ro.id, issue)];
                  const priorityRank = getRoPriorityRank(issue.priority);
                  const priorityClass = priorityRank === 0
                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                    : priorityRank === 1
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200';

                  return (
                    <div
                      key={issue.id}
                      onClick={() => setSelectedIssueId(issue.id)}
                      className={`rounded-xl p-3 shadow-xs border transition-all cursor-pointer group ${
                        isSelected
                          ? 'border-2 border-blue-600 bg-blue-50/40 shadow-sm'
                          : isResolved
                            ? 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/60 opacity-80'
                            : 'bg-white hover:bg-slate-50/90 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-mono font-bold text-blue-900 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                            #{issue.id}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border flex items-center gap-1 ${priorityClass}`}>
                            {priorityRank === 0 && (
                              <span className="w-1 h-1 rounded-full bg-rose-600 animate-pulse"></span>
                            )}
                            {['High', 'Medium', 'Low'][priorityRank]}
                          </span>
                          {isNewIssue && <span className="rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">New</span>}
                        </div>
                        {isSelected ? (
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active
                          </span>
                        ) : (
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full truncate max-w-[120px]">
                            {issue.status}
                          </span>
                        )}
                      </div>

                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 mt-1.5 line-clamp-1 group-hover:text-blue-700 transition-colors">
                        {issue.category}
                      </h3>

                      <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                        {issue.description}
                      </p>

                      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100 text-[11px]">
                        <div className="flex items-center gap-1.5 text-slate-700 font-semibold truncate">
                          <span className="material-symbols-outlined text-[13px] text-blue-600">person</span>
                          <span className="truncate">{issue.studentName}</span>
                          <span className="text-slate-400 font-mono text-[10px]">({issue.studentId})</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(issue.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Grievance Resolution Workspace & WebRTC Console (xl:col-span-8) */}
        <div className="xl:col-span-8 space-y-4">
          {!selectedIssue ? (
            <div className="bg-white rounded-xl p-12 shadow-card border border-slate-200 text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center mx-auto ring-4 ring-blue-50/50">
                <span className="material-symbols-outlined text-3xl">task</span>
              </div>
              <h3 className="text-base font-bold text-slate-800">Select a Grievance Ticket</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Choose a ticket from the active queue pipeline on the left to inspect student diagnostics, launch encrypted WebRTC sessions, or file deliberation minutes.
              </p>
            </div>
          ) : (
            <>
              {/* Ticket Context Banner */}
              <div className="bg-white rounded-xl p-5 sm:p-6 shadow-card border border-slate-200">
                {escalateSuccessMsg && (
                  <div className="p-3 mb-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-emerald-600">check_circle</span>
                    <span>{escalateSuccessMsg}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200 font-mono">
                        CASE #{selectedIssue.id}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs text-slate-600">verified_user</span>
                        Redressal Procedure Verified
                      </span>
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded border flex items-center gap-1 ${
                        selectedIssue.priority === 'high' || selectedIssue.priority === 'High'
                          ? 'text-rose-700 bg-rose-50 border-rose-200'
                          : 'text-amber-700 bg-amber-50 border-amber-200'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
                        Priority: {selectedIssue.priority || 'Normal'}
                      </span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
                      {selectedIssue.category}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-md bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm text-amber-600">timer</span>
                      Status: {selectedIssue.status}
                    </span>
                  </div>
                </div>

                {/* Complainant Academic & Residence Dossier */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-sm ring-1 ring-blue-200 flex-shrink-0">
                      {selectedIssue.studentName ? selectedIssue.studentName.substring(0, 2).toUpperCase() : 'ST'}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 leading-tight truncate">{selectedIssue.studentName}</p>
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5">USN: {selectedIssue.studentId}</p>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-slate-500 text-[11px] font-semibold uppercase">Academic Record</p>
                    <p className="text-slate-800 font-medium">Department Verified Student</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-slate-500 text-[11px] font-semibold uppercase">Submission Details</p>
                    <p className="text-slate-800 font-medium">Logged: {new Date(selectedIssue.createdAt).toLocaleDateString()}</p>
                    <p className="text-[11px] text-slate-500 font-mono">Assigned RO: {ro.name}</p>
                  </div>
                </div>

                {/* Problem Statement Narrative */}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-blue-700">subject</span>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Complainant Narrative &amp; Statement</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs whitespace-pre-wrap">
                    {selectedIssue.description}
                  </p>
                </div>
              </div>

              {/* WebRTC Virtual Consultation Ready Card */}
              <div className="bg-white rounded-xl p-5 shadow-card border border-slate-200 transition-all space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-blue-700">video_camera_front</span>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Online Consultation Channel &amp; Virtual Room
                    </h4>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-xs text-blue-700">info</span>
                      {activeMeeting ? `Mode: ${activeMeeting.mode || 'Online'}` : 'Standby Mode'}
                    </span>
                  </div>
                </div>

                {activeMeeting ? (
                  <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border ${
                    isMeetingExpired
                      ? 'bg-rose-50/50 border-rose-300'
                      : meetingState === 'live'
                        ? 'bg-emerald-50/50 border-emerald-300'
                        : 'bg-blue-50/20 border-blue-200/80'
                  }`}>
                    <div className="flex items-center gap-3.5">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center relative flex-shrink-0 border ${
                        meetingState === 'live'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        <span className="material-symbols-outlined text-2xl">
                          {activeMeeting.mode === 'Online' ? 'videocam' : 'meeting_room'}
                        </span>
                        <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${
                          meetingState === 'live'
                            ? 'bg-emerald-500 animate-ping'
                            : 'bg-blue-500'
                        }`}></span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h5 className="text-sm font-bold text-slate-900">
                            {activeMeeting.mode === 'Online' ? 'WebRTC Encrypted Video Bridge' : 'Campus In-Person Deliberation'}
                          </h5>
                          <span className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] border flex items-center gap-1 ${
                            isMeetingExpired
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : meetingState === 'live'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                : 'bg-blue-100 text-blue-800 border-blue-200'
                          }`}>
                            {isMeetingExpired
                              ? '⚠️ Time Elapsed'
                              : ({ scheduled: 'Scheduled', live: 'Meeting In Progress', 'feedback-pending': 'Feedback Pending', completed: 'Feedback Submitted', locked: 'Meeting Closed', cancelled: 'Cancelled' }[meetingState] || 'Unavailable')}
                          </span>
                          <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            {activeMeeting.date} @ {activeMeeting.time}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Location: <strong className="text-slate-700 font-semibold">{activeMeeting.location || 'Cabin 302'}</strong>
                          {activeMeeting.notes && ` • Notes: "${activeMeeting.notes}"`}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {meetingState === 'scheduled' && (
                        <button
                          type="button"
                          onClick={() => activeMeeting.mode === 'Online'
                            ? handleLaunchOnlineMeeting(activeMeeting, selectedIssue)
                            : updateMeetingStatus(activeMeeting.id || activeMeeting.issueId, 'Started')}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs sm:text-sm transition shadow-sm"
                        >
                          <span className="material-symbols-outlined text-base">play_arrow</span>
                          <span>Start Meeting</span>
                        </button>
                      )}
                      {meetingState === 'live' && (
                        <button
                          type="button"
                          onClick={activeMeeting.mode === 'Online' ? handleStopAndSaveRecording : handleConcludeOfflineMeeting}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm transition shadow-sm"
                        >
                          <span className="material-symbols-outlined text-base">call_end</span>
                          <span>End Meeting &amp; Log Minutes</span>
                        </button>
                      )}
                      {meetingState === 'feedback-pending' && (
                        <button
                          type="button"
                          onClick={() => handleOpenMeetingFeedback(activeMeeting, selectedIssue)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm transition shadow-sm"
                        >
                          <span className="material-symbols-outlined text-base">edit_note</span>
                          <span>Log Minutes / Fill Feedback</span>
                        </button>
                      )}
                      {meetingState === 'completed' && <span className="text-xs font-semibold text-emerald-700">Meeting Completed · Feedback Submitted</span>}
                      {meetingState === 'locked' && <span className="text-xs font-semibold text-slate-600">Meeting Closed</span>}
                      {meetingState === 'cancelled' && <span className="text-xs font-semibold text-slate-600">Meeting Cancelled</span>}
                      {meetingState === 'scheduled' && activeMeeting.mode === 'Online' && (
                        <button type="button" onClick={handleOpenOnlineNotDoneModal} className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                          Not Held (Reassign)
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-slate-50/80 border border-dashed border-slate-300 text-left">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-400 border border-slate-200 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-2xl">videocam_off</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="text-sm font-bold text-slate-700">No Consultation Scheduled Yet</h5>
                          <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-600 font-semibold text-[10px]">Standby Mode</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Online WebRTC room activates automatically after a deliberation slot is assigned by the RO.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenScheduleModal}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs sm:text-sm transition-all shadow-2xs active:scale-95 cursor-pointer whitespace-nowrap"
                    >
                      <span className="material-symbols-outlined text-base">event_upcoming</span>
                      <span>Assign / Schedule Meeting</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Action Command Hierarchy Toolbar */}
              {selectedIssue.status !== 'Resolved' && selectedIssue.status !== 'Escalated' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Schedule Meeting Button */}
                  <button
                    type="button"
                    onClick={handleOpenScheduleModal}
                    disabled={isReassignLimitReached}
                    className={`flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-bold text-xs sm:text-sm shadow-sm transition-all active:scale-95 cursor-pointer ${
                      isReassignLimitReached
                        ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                        : 'bg-blue-700 hover:bg-blue-800 text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">event_upcoming</span>
                    <span className="whitespace-nowrap">
                      {isReassignLimitReached
                        ? 'Reassign Limit (2/2)'
                        : activeMeeting
                          ? `Reschedule (${meetingReassignCount}/2)`
                          : 'Assign / Schedule Meeting'}
                    </span>
                  </button>

                  {/* Resolve Grievance Button */}
                  <button
                    type="button"
                    onClick={handleOpenResolveModal}
                    className={`flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-bold text-xs sm:text-sm border transition-all shadow-2xs active:scale-95 cursor-pointer ${
                      isOnlineMeetingPendingMinutes
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 border-emerald-300'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base text-emerald-700">verified</span>
                    <span>{isOnlineMeetingPendingMinutes ? 'Log Minutes & Resolve' : 'Resolve Grievance'}</span>
                  </button>

                  {/* Escalate to Ombudsman / Admin */}
                  <button
                    type="button"
                    onClick={handleOpenEscalateModal}
                    className={`flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-semibold text-xs sm:text-sm shadow-card border transition-all active:scale-95 cursor-pointer ${
                      !hasFiledDiscussionMinutes
                        ? 'bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100'
                        : 'bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border-slate-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-rose-600 text-base">escalator_warning</span>
                    <span>{!hasFiledDiscussionMinutes ? 'Log Minutes to Escalate' : 'Escalate to Admin'}</span>
                  </button>
                </div>
              )}

              {/* Offline / In-Person Deliberation Minutes (Permanent Record Card) */}
              {activeMeeting && (activeMeeting.discussionSummary || activeMeeting.actionItems) && (
                <div className="bg-white rounded-xl p-5 sm:p-6 shadow-card border border-slate-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold ring-1 ring-emerald-200">
                        <span className="material-symbols-outlined text-lg text-emerald-700">person_pin_circle</span>
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                          Consultation &amp; Resolution Minutes
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Official deliberation audit record</p>
                      </div>
                    </div>
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
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                    >
                      Edit Minutes
                    </button>
                  </div>
                  <div className="space-y-3 text-xs sm:text-sm">
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Summary of Deliberations:</span>
                      <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{activeMeeting.discussionSummary}</p>
                    </div>
                    {activeMeeting.actionItems && (
                      <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Agreed Action Items:</span>
                        <p className="text-slate-800 leading-relaxed whitespace-pre-wrap">{activeMeeting.actionItems}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}


              {/* Deliberation Audit Stepper & Action Log */}
              <div className="bg-white rounded-xl p-5 sm:p-6 shadow-card border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold ring-1 ring-blue-200">
                      <span className="material-symbols-outlined text-lg">history_edu</span>
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                        Action &amp; Procedure Log
                      </h3>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        Audit trail of student communications, status transitions, and hearings
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 self-start sm:self-auto">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Audit Logged
                  </span>
                </div>

                {/* Audit Timeline */}
                <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                  {selectedIssue.logs && selectedIssue.logs.map((log, idx) => (
                    <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-slate-50/70 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <span className="text-slate-700 font-medium">{log.text}</span>
                      <span className="text-[11px] font-mono text-slate-400 flex-shrink-0">
                        {new Date(log.time).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Stored Video Recordings Archive */}
                {db.recordings && db.recordings.filter(r => (r.issueId || r.issue_id)?.toUpperCase() === selectedIssue.id?.toUpperCase()).length > 0 && (
                  <div className="pt-4 border-t border-slate-100 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-base text-rose-600">videocam</span>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Recorded Video Deliberation Archive
                      </h4>
                    </div>
                    {db.recordings.filter(r => (r.issueId || r.issue_id)?.toUpperCase() === selectedIssue.id?.toUpperCase()).map(rec => (
                      <div key={rec.id} className="p-3.5 rounded-xl bg-slate-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-emerald-400">🎥 {rec.mode} Session</span>
                            <span className="text-[10px] font-mono text-slate-400">({rec.durationText})</span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">{rec.transcriptSummary || 'Automated dual-feed conference recording'}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => openRecording(rec)}
                            disabled={!isStoredRecording(rec)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold transition shadow-xs"
                          >
                            <span className="material-symbols-outlined text-sm">play_arrow</span>
                            <span>{isStoredRecording(rec) ? 'Play Recording' : 'Original File Unavailable'}</span>
                          </button>
                          {isStoredRecording(rec) && (
                            <a
                              href={`${rec.videoUrl}?download=1`}
                              download={`recording_${selectedIssue.id}.${recordingExtension(rec.mimeType)}`}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition"
                            >
                              <span className="material-symbols-outlined text-sm">download</span>
                              <span>Download</span>
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
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

            <RecordingSaveStatus uploads={recordingUploads} onRetry={uploadPendingRecording} onDownload={downloadPendingRecording} />
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-xl">verified</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">Confirm Issue Resolution</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Formal Grievance Closure &amp; Redressal Record</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResolveModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
                title="Close Dialog"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleResolveSubmit}>
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs sm:text-sm">
                {isOnlineMeetingPendingMinutes && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
                    <span className="material-symbols-outlined text-base text-rose-600 mt-0.5">warning</span>
                    <div>
                      <strong className="block font-bold">Institutional Policy Notice</strong>
                      An online session was conducted for this ticket. You must log the official discussion minutes before this ticket can be resolved. Submitting will redirect you to file the minutes.
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Resolution Summary / Actions Taken <span className="text-rose-500">*</span>
                  </label>
                  <p className="text-xs text-slate-500">
                    Detail the tangible steps taken to resolve this student issue (e.g., updated marks sheet, replaced hardware, approved fee challan).
                  </p>
                  <textarea
                    className="w-full p-3 bg-slate-50 hover:bg-slate-100/60 focus:bg-white rounded-xl text-slate-900 text-xs sm:text-sm transition-all border border-slate-200 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-100 placeholder:text-slate-400 leading-relaxed"
                    rows={4}
                    required
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Detail the steps taken to resolve this student issue..."
                  />
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all active:scale-95"
                >
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  <span>Log Resolution &amp; Close Ticket</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ESCALATE / RE-ESCALATE MODAL */}
      {showEscalateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-xl">priority_high</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    {selectedIssue?.status === 'Escalated' ? 'Re-escalate / Update Escalation to Admin' : 'Escalate to Admin / Principal'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Management Committee Review Dispatch</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEscalateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
                title="Close Dialog"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <form onSubmit={handleEscalateSubmit}>
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto text-xs sm:text-sm">
                <p className="text-xs text-slate-600 leading-relaxed">
                  {selectedIssue?.status === 'Escalated'
                    ? 'Submit updated escalation details, new developments, or increased urgency for this issue to the Management Dashboard.'
                    : 'Escalate this issue to the Management Dashboard. Use this if the issue requires academic committee overrides, financial policies exemptions, or is delayed past standard SLA.'}
                </p>
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Reason for Escalation / Urgent Remarks <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    className="w-full p-3 bg-slate-50 hover:bg-slate-100/60 focus:bg-white rounded-xl text-slate-900 text-xs sm:text-sm transition-all border border-slate-200 focus:border-rose-600 focus:outline-none focus:ring-2 focus:ring-rose-100 placeholder:text-slate-400 leading-relaxed"
                    rows={4}
                    required
                    value={escalationReason}
                    onChange={(e) => setEscalationReason(e.target.value)}
                    placeholder="e.g. Requires manual approval portal authorization which is only accessible by the Principal/Head office."
                  />
                </div>
              </div>
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowEscalateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition"
                  disabled={isSubmittingEscalate}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEscalate}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all active:scale-95 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">forward</span>
                  <span>
                    {isSubmittingEscalate
                      ? 'Transmitting to Admin...'
                      : selectedIssue?.status === 'Escalated'
                        ? 'Confirm Re-escalation to Admin'
                        : 'Escalate Ticket'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SCHEDULE / RESCHEDULE MEETING MODAL FOR RO */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-xl">calendar_month</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    {activeMeeting ? 'Reschedule / Reassign Meeting' : 'Assign & Schedule Redressal Meeting'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Consultation &amp; Redressal Session</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowScheduleModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                title="Close Dialog"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleScheduleSubmit}>
              <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto text-xs sm:text-sm">
                {/* Target Student Dossier Pill */}
                {selectedIssue && (
                  <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-700 text-white flex items-center justify-center font-bold text-xs ring-2 ring-blue-100">
                        {selectedIssue.studentName ? selectedIssue.studentName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'ST'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{selectedIssue.studentName}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold border border-blue-200">
                            {selectedIssue.studentId}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          {selectedIssue.category} • Case: #{selectedIssue.id} ({selectedIssue.title})
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 self-start sm:self-auto flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {meetingReassignCount}/{MEETING_REASSIGNMENT_LIMIT} reassignments used
                    </span>
                  </div>
                )}

                {/* Date & Time Slot Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Meeting Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      min={todayStr}
                      value={meetDate}
                      onChange={(e) => setMeetDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs sm:text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Time Slot <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="time"
                      required
                      value={meetTime}
                      onChange={(e) => setMeetTime(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs sm:text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 transition"
                    />
                  </div>
                </div>

                {/* Mode of Meeting Toggle */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Consultation Mode <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleModeChange('Online')}
                      className={`p-3 rounded-xl border-2 transition flex items-start gap-3 shadow-xs cursor-pointer ${
                        meetMode === 'Online'
                          ? 'border-blue-700 bg-blue-50/70 text-blue-900'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-xl mt-0.5 ${meetMode === 'Online' ? 'text-blue-700' : 'text-slate-400'}`}>videocam</span>
                      <div>
                        <p className="text-xs font-bold">Online WebRTC Video Call</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Encrypted Virtual Room • In-App</p>
                      </div>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => handleModeChange('Offline')}
                      className={`p-3 rounded-xl border-2 transition flex items-start gap-3 shadow-xs cursor-pointer ${
                        meetMode === 'Offline'
                          ? 'border-blue-700 bg-blue-50/70 text-blue-900'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-xl mt-0.5 ${meetMode === 'Offline' ? 'text-blue-700' : 'text-slate-400'}`}>person_pin_circle</span>
                      <div>
                        <p className="text-xs font-bold">In-Person Deliberation</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">Physical Campus Consultation</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Switching from Online to Offline Feedback */}
                {meetMode === 'Offline' && activeMeeting?.mode === 'Online' && (
                  <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 space-y-1.5">
                    <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Feedback / Reason for Switching to Offline
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Provide brief note on why this session is being moved to in-person (e.g. connectivity failure, student request).
                    </p>
                    <textarea
                      rows={2}
                      className="w-full p-2.5 bg-white rounded-lg border border-slate-200 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-700"
                      value={meetReassignFeedback}
                      onChange={(e) => setMeetReassignFeedback(e.target.value)}
                      placeholder="e.g. Student requested in-person consultation at RO desk due to network issues."
                    />
                  </div>
                )}

                {/* Meeting Location / Venue */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Meeting Location / Venue <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={meetLocation}
                    onChange={(e) => setMeetLocation(e.target.value)}
                    placeholder="e.g. Cabin 302, Academic Block IV, NITTE Campus"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-xs sm:text-sm font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-700 transition"
                  />
                </div>

                {/* RO Instructions / Documents Required */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                    RO Instructions / Documents Required
                  </label>
                  <textarea
                    rows={3}
                    value={meetNotes}
                    onChange={(e) => setMeetNotes(e.target.value)}
                    placeholder="e.g. Bring Physical Student ID, diagnostic speed test log, VTU Hall Ticket."
                    className="w-full p-3 bg-slate-50 hover:bg-slate-100/60 focus:bg-white rounded-xl text-slate-900 text-xs sm:text-sm transition-all border border-slate-200 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 leading-relaxed"
                  />
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-emerald-600">mark_email_read</span>
                  Dispatches calendar ICS + SMS alert
                </span>
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSchedulingMeeting}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs shadow-md shadow-blue-700/20 transition-all active:scale-95 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">send</span>
                    <span>{isSchedulingMeeting ? 'Saving Meeting...' : activeMeeting ? 'Save & Reassign Meeting' : 'Confirm & Dispatch Meeting Invite'}</span>
                  </button>
                </div>
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
                    placeholder="e.g. Student reported network connectivity issues during the online attempt and requested an in-person document review at the RO desk."
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

      {/* ================= WEBRTC LIVE CONSULTATION MEETING MODAL (PREMIUM CINEMATIC) ================= */}
      {showOnlineMeetingModal && selectedIssue && activeMeeting && (
        <div
          aria-modal="true"
          role="dialog"
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-[#040711]/85 backdrop-blur-md transition-opacity duration-300"
          id="webrtc-meeting-modal"
        >
          <div className="relative w-full max-w-[96vw] h-[95vh] max-h-[960px] bg-[#090d16] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100 select-none">
            {/* Top Bar Header */}
            <div className="px-4 py-3 bg-[#0d1322]/90 border-b border-slate-800/80 flex items-center justify-between gap-3 flex-shrink-0 z-20">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-xs text-xs tracking-wider flex-shrink-0">
                  NITTE
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs sm:text-sm font-bold text-white truncate tracking-tight">
                      NITTE Encrypted WebRTC Session{' '}
                      <span className="text-slate-400 font-normal font-mono">
                        • Room #{activeMeeting.room || activeMeeting.id || 'NITTE-ROOM-402'}
                      </span>
                    </h3>
                    <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Live Deliberation
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate flex items-center gap-2 mt-0.5">
                    <span>Case #{selectedIssue.id}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-300">Student: {selectedIssue.studentName}</span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-400">Officer: {ro.name}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-blue-600/20 hover:bg-blue-600/30 border border-blue-400/30 text-blue-300 text-xs font-semibold transition cursor-pointer"
                  onClick={() => setShowInMeetingSidebar(prev => !prev)}
                  title="Toggle In-Meeting Minutes Drawer"
                >
                  <span className="material-symbols-outlined text-sm text-blue-400">edit_note</span>
                  <span className="hidden sm:inline">In-Meeting Minutes</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-500/30 text-[10px] font-mono text-blue-200">
                    {showInMeetingSidebar ? 'Active' : 'Hidden'}
                  </span>
                </button>

                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-mono font-semibold ${
                    isRecActive
                      ? 'bg-rose-500/15 border-rose-500/30 text-rose-400'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                  id="rec-indicator"
                >
                  <span className={`w-2 h-2 rounded-full ${isRecActive ? 'bg-rose-500 animate-pulse' : 'bg-slate-500'}`}></span>
                  <span>REC {formatTimer(recordingSeconds)}</span>
                </div>

                <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-md bg-slate-800/80 border border-slate-700/60 text-slate-300 text-[11px] font-mono">
                  <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                    <span className="material-symbols-outlined text-[13px]">lock</span> E2E Encrypted
                  </span>
                  <span className="text-slate-600">|</span>
                  <span>1080p 60fps</span>
                  <span className="text-slate-600">|</span>
                  <span className="text-emerald-400">{peerConnected ? '18ms RTT' : '24ms RTT'}</span>
                </div>

                <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
                  <button
                    type="button"
                    className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition"
                    onClick={() => setShowOnlineMeetingModal(false)}
                    title="Minimize Window"
                  >
                    <span className="material-symbols-outlined text-base">minimize</span>
                  </button>
                  <button
                    type="button"
                    className="w-8 h-8 rounded-lg text-rose-400 hover:text-white hover:bg-rose-600/80 flex items-center justify-center transition"
                    onClick={() => {
                      if (window.confirm('Conclude active consultation session and commit WebRTC discussion notes to official Deliberation Minutes?')) {
                        handleStopAndSaveRecording();
                      }
                    }}
                    title="Exit Meeting"
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Video Viewport & In-Meeting Drawer */}
            <div className="flex-1 flex overflow-hidden relative">
              <div className="flex-1 p-3 sm:p-4 flex flex-col gap-3 overflow-y-auto">
                {/* Media Permissions Warning Banner */}
                {mediaPermissionState === 'denied' && (
                  <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-base text-rose-400">warning</span>
                      <span><strong>Camera/Mic Alert:</strong> {mediaPermissionError || 'Permissions blocked by browser.'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={requestMediaPermissions}
                      className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs"
                    >
                      Retry Permissions
                    </button>
                  </div>
                )}

                <div className="relative flex-1 min-h-[460px] h-full rounded-xl overflow-hidden">
                  {/* Primary Full-Width Feed: Student Complainant */}
                  {(() => {
                    const currentMeetingIssue = (db.issues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === (activeMeetingIssueId || selectedIssueId)?.toUpperCase()) || selectedIssue || {};
                    const sName = currentMeetingIssue.studentName || selectedIssue?.studentName || 'Student';
                    const sId = currentMeetingIssue.studentId || selectedIssue?.studentId || 'NITTE-STU';
                    const sCategory = currentMeetingIssue.category || selectedIssue?.category || 'General';
                    const sTicket = currentMeetingIssue.id || selectedIssue?.id || 'TICK-1002';
                    const sInitials = sName ? sName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'ST';

                    return (
                      <div className="w-full h-full bg-[#0d1424] rounded-xl border-2 border-emerald-500/50 active-speaker-ring relative overflow-hidden flex flex-col justify-between group shadow-2xl min-h-[440px]">
                        <div className="absolute inset-0 bg-gradient-to-b from-[#111c33]/40 via-transparent to-[#080d19]/90 pointer-events-none"></div>

                        {/* Center Visual: Student Video Stream or Avatar */}
                        <div className="absolute inset-0 flex items-center justify-center">
                          {remoteStream ? (
                            <VideoStreamPlayer
                              stream={remoteStream}
                              muted={false}
                              objectFit="contain"
                              isMicMuted={isStudentMicMuted}
                              isCameraOff={isStudentCameraOff}
                              participantName={sName}
                            />
                          ) : (
                            <div className="relative flex flex-col items-center">
                              <div className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-full bg-gradient-to-tr from-indigo-700 via-blue-600 to-teal-400 flex items-center justify-center text-white shadow-2xl ring-4 ring-emerald-500/40 transition-transform">
                                <span className="font-extrabold text-4xl sm:text-6xl tracking-tight">
                                  {sInitials}
                                </span>
                                <span className="absolute bottom-2 right-2 sm:right-3 w-7 h-7 rounded-full bg-emerald-500 border-2 border-[#0d1424] flex items-center justify-center shadow-md">
                                  <span className="material-symbols-outlined text-white text-base">mic</span>
                                </span>
                              </div>
                              <div className="mt-4 text-center">
                                <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs sm:text-sm font-semibold border border-emerald-500/40 shadow-xs">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                                  {sCategory} (Active Complainant)
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Top Header Overlay */}
                        <div className="relative z-10 p-3 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-slate-100 font-semibold">
                              <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Student Complainant Feed
                            </span>
                            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-400/20 font-mono text-[11px]">
                              {sCategory} • Cisco-AP-09
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-white/10 text-xs font-mono text-emerald-400 flex items-center gap-1">
                              <span className="material-symbols-outlined text-sm">wifi</span> {remoteStream ? '1080p HD • 60 FPS' : 'Connected (STUN/TURN)'}
                            </span>
                          </div>
                        </div>

                        {/* Bottom Meta Overlay */}
                        <div className="relative z-10 p-3.5 flex items-center justify-between bg-gradient-to-t from-black/85 via-black/40 to-transparent pr-72 sm:pr-80">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="w-9 h-9 rounded-xl bg-emerald-600/80 text-white flex items-center justify-center font-bold text-xs shadow-sm flex-shrink-0">
                              {sInitials}
                            </span>
                            <div className="min-w-0 truncate">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs sm:text-sm font-bold text-white leading-none truncate">{sName}</p>
                                <span className="text-[10px] font-mono text-blue-300 bg-blue-500/20 px-1.5 py-0.5 rounded border border-blue-400/20 flex-shrink-0">
                                  {sId}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-300 mt-1 truncate">
                                {sCategory} • Case #{sTicket}
                              </p>
                            </div>
                          </div>
                          <div className="hidden sm:flex items-center gap-1.5 bg-black/70 px-2.5 py-1 rounded-lg border border-white/10 flex-shrink-0">
                            <span className="w-1 h-3 bg-emerald-400 rounded-full animate-pulse"></span>
                            <span className="w-1.5 h-4 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-1 h-2.5 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></span>
                            <span className="material-symbols-outlined text-emerald-400 text-sm ml-0.5">mic</span>
                            <span className="text-[10px] text-emerald-400 font-mono">-14dB</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Compact Floating Picture-in-Picture (PiP) Feed: RO Host */}
                  <div className="absolute bottom-3 right-3 z-30 w-64 sm:w-72 bg-[#0a0f1d] rounded-xl border-2 border-blue-500/40 shadow-2xl overflow-hidden backdrop-blur-md flex flex-col transition-all hover:scale-105 duration-200 group">
                    <div className="absolute inset-0 bg-gradient-to-b from-[#111c33]/40 via-transparent to-[#080d19]/90 pointer-events-none"></div>

                    {/* PiP Top Header */}
                    <div className="relative z-10 px-2.5 py-1.5 flex items-center justify-between text-[11px] bg-black/60 border-b border-white/10">
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        <span className="font-bold text-slate-100 truncate">RO Host Feed</span>
                      </div>
                      <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 text-[10px] font-mono border border-blue-400/20">Cabin 302</span>
                    </div>

                    {/* PiP Visual Content */}
                    <div className="relative py-3 flex flex-col items-center justify-center min-h-[120px]">
                      {isCameraOff ? (
                        <div className="flex flex-col items-center justify-center text-slate-400 text-xs py-4">
                          <span className="material-symbols-outlined text-2xl text-rose-500">videocam_off</span>
                          <span className="mt-1 text-[11px]">Camera Disabled</span>
                        </div>
                      ) : mediaPermissionState === 'granted' && localStream ? (
                        <div className="w-full h-28 overflow-hidden rounded-lg bg-black flex items-center justify-center">
                          <VideoStreamPlayer
                            stream={localStream}
                            muted={true}
                            objectFit="contain"
                            isMicMuted={isMicMuted}
                            isCameraOff={isCameraOff}
                            participantName={ro.name || 'Relationship Officer'}
                          />
                        </div>
                      ) : (
                        <div className="relative flex flex-col items-center">
                          <div className="relative w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-gradient-to-tr from-blue-700 via-indigo-600 to-blue-500 flex items-center justify-center text-white shadow-lg ring-2 ring-blue-400/40">
                            <span className="font-bold text-xl sm:text-2xl tracking-tight">
                              {ro.name ? ro.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'SN'}
                            </span>
                            <span className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#0a0f1d] flex items-center justify-center shadow">
                              <span className="material-symbols-outlined text-white text-xs">{isMicMuted ? 'mic_off' : 'mic'}</span>
                            </span>
                          </div>
                          <span className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-semibold border border-blue-400/30">
                            <span className={`w-1.5 h-1.5 rounded-full ${isMicMuted ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse'}`}></span> {isMicMuted ? 'Mic Muted' : 'Mic Active'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* PiP Bottom Meta Bar */}
                    <div className="relative z-10 px-2.5 py-2 bg-black/80 flex items-center justify-between border-t border-white/10 text-xs">
                      <div className="truncate">
                        <p className="font-bold text-white text-[11px] leading-tight truncate">{ro.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">Senior RO • Dept. of CSE</p>
                      </div>
                      <div className="flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded border border-white/10 flex-shrink-0">
                        <span className={`w-1 h-2 rounded-full ${isMicMuted ? 'bg-slate-500' : 'bg-emerald-400 animate-pulse'}`}></span>
                        <span className={`w-1 h-3 rounded-full ${isMicMuted ? 'bg-slate-500' : 'bg-emerald-400 animate-pulse'}`} style={{ animationDelay: '150ms' }}></span>
                        <span className={`material-symbols-outlined text-xs ${isMicMuted ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {isMicMuted ? 'mic_off' : 'mic'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* In-Meeting Minutes Drawer */}
              {showInMeetingSidebar && (
                <div className="w-80 lg:w-96 bg-[#0a0f1d] border-l border-slate-800 flex flex-col flex-shrink-0" id="in-meeting-sidebar">
                  <div className="px-4 py-3 bg-[#0e1424] border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-base text-blue-400">edit_note</span>
                      <h4 className="text-xs sm:text-sm font-bold text-white">In-Meeting Minutes</h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                        Auto-Saving
                      </span>
                      <button
                        type="button"
                        className="text-slate-400 hover:text-white p-0.5 rounded transition"
                        onClick={() => setShowInMeetingSidebar(false)}
                        title="Close Panel"
                      >
                        <span className="material-symbols-outlined text-base">chevron_right</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 p-3.5 space-y-3.5 overflow-y-auto text-xs">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Live Deliberation Findings</label>
                        <span className="text-[10px] text-slate-500">Official Record</span>
                      </div>
                      <div className="bg-[#0f172a] rounded-lg p-2.5 border border-slate-700/80 space-y-2">
                        <div className="flex items-start gap-2 text-slate-200 text-xs">
                          <span className="material-symbols-outlined text-emerald-400 text-sm mt-0.5 flex-shrink-0">check_circle</span>
                          <p>Student verified disruption occurs only during 18:00 - 22:00 in Netravati Block C 4th floor study hall.</p>
                        </div>
                        <div className="flex items-start gap-2 text-slate-200 text-xs">
                          <span className="material-symbols-outlined text-emerald-400 text-sm mt-0.5 flex-shrink-0">check_circle</span>
                          <p>Room ethernet port tested functional; issue is hardware AP-09 overload.</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Agreed Action Directives</label>
                      <div className="space-y-1.5" id="meeting-action-items">
                        {inMeetingDirectives.map((directive, idx) => (
                          <div key={idx} className="p-2 rounded bg-slate-900/90 border border-slate-800 text-slate-300 flex items-center justify-between text-xs">
                            <span className="truncate">{directive}</span>
                            <span className="text-[10px] font-mono text-emerald-400 flex-shrink-0 ml-1">Added</span>
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-1.5 pt-1">
                        <input
                          className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-[#070b14] border border-slate-700 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                          id="new-action-input"
                          placeholder="+ Add agreed directive..."
                          type="text"
                          value={newDirectiveInput}
                          onChange={(e) => setNewDirectiveInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (newDirectiveInput.trim()) {
                                setInMeetingDirectives(prev => [...prev, newDirectiveInput.trim()]);
                                setNewDirectiveInput('');
                              }
                            }
                          }}
                        />
                        <button
                          className="px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs"
                          onClick={() => {
                            if (newDirectiveInput.trim()) {
                              setInMeetingDirectives(prev => [...prev, newDirectiveInput.trim()]);
                              setNewDirectiveInput('');
                            }
                          }}
                          type="button"
                        >
                          Add
                        </button>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/40 flex items-start gap-2.5">
                      <input
                        checked={inMeetingConsent}
                        onChange={(e) => setInMeetingConsent(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded bg-slate-900 text-emerald-600 border-slate-700 focus:ring-emerald-500"
                        id="in-meeting-consent"
                        type="checkbox"
                      />
                      <div>
                        <label className="font-bold text-emerald-300 text-xs block cursor-pointer" htmlFor="in-meeting-consent">
                          Complainant Verbal Acceptance Confirmed
                        </label>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {selectedIssue.studentName} agreed on video stream to the interim arrangement.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">Session Chat &amp; System Events</label>
                      <div className="h-28 bg-[#070b14] rounded-lg p-2 border border-slate-800 overflow-y-auto space-y-1 text-[11px]">
                        <p className="text-slate-400"><span className="text-emerald-400 font-mono">[15:30]</span> WebRTC Peer Connection Established (STUN/TURN)</p>
                        <p className="text-slate-300"><strong className="text-blue-400">{ro.name}:</strong> "We've reviewed your speedtest telemetry log."</p>
                        <p className="text-slate-300"><strong className="text-teal-400">{selectedIssue.studentName}:</strong> "Thank you sir, Friday morning is my VTU exam."</p>
                        <p className="text-slate-400"><span className="text-emerald-400 font-mono">[15:33]</span> Live composite recording active</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-[#0e1424] border-t border-slate-800 space-y-2">
                    <button
                      className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
                      onClick={handleStopAndSaveRecording}
                      type="button"
                    >
                      <span className="material-symbols-outlined text-base">check_circle</span>
                      <span>Commit Minutes &amp; Proceed</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Control Bar */}
            <div className="p-3 bg-[#0a0f1c]/95 border-t border-slate-800 flex items-center justify-between gap-3 flex-shrink-0 z-30">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  onClick={() => alert(`Active Session Participants:\n1. ${ro.name} (Senior RO - Host)\n2. ${selectedIssue.studentName} (Student Complainant)`)}
                >
                  <span className="material-symbols-outlined text-base text-blue-400">group</span>
                  <span className="hidden sm:inline">Participants (2)</span>
                </button>

                <button
                  type="button"
                  className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition cursor-pointer"
                  onClick={() => setIsRecActive(prev => !prev)}
                >
                  <span className={`w-2 h-2 rounded-full ${isRecActive ? 'bg-rose-500 animate-pulse' : 'bg-slate-500'}`}></span>
                  <span className="hidden sm:inline">{isRecActive ? 'Composite Rec Active' : 'Rec Paused'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  className={`w-11 h-11 rounded-xl text-white flex items-center justify-center transition border shadow-sm cursor-pointer ${
                    isMicMuted ? 'bg-rose-600 border-rose-500' : 'bg-slate-800 hover:bg-slate-700 border-slate-700'
                  }`}
                  onClick={toggleMic}
                  title="Toggle Microphone"
                >
                  <span className="material-symbols-outlined text-xl">{isMicMuted ? 'mic_off' : 'mic'}</span>
                </button>

                <button
                  type="button"
                  className={`w-11 h-11 rounded-xl text-white flex items-center justify-center transition border shadow-sm cursor-pointer ${
                    isCameraOff ? 'bg-rose-600 border-rose-500' : 'bg-slate-800 hover:bg-slate-700 border-slate-700'
                  }`}
                  onClick={toggleCamera}
                  title="Toggle Camera"
                >
                  <span className="material-symbols-outlined text-xl">{isCameraOff ? 'videocam_off' : 'videocam'}</span>
                </button>

                <button
                  type="button"
                  className={`w-11 h-11 rounded-xl text-white flex items-center justify-center transition border shadow-sm cursor-pointer ${
                    isScreenSharing ? 'bg-blue-600 border-blue-400' : 'bg-slate-800 hover:bg-slate-700 border-slate-700'
                  }`}
                  onClick={toggleScreenShare}
                  title="Screen Share"
                >
                  <span className="material-symbols-outlined text-xl">screen_share</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-3.5 py-2 rounded-xl bg-blue-600/30 hover:bg-blue-600/40 text-blue-200 hover:text-white text-xs font-bold flex items-center gap-2 border border-blue-500/40 shadow-sm transition active:scale-95 cursor-pointer"
                  onClick={() => setShowInMeetingSidebar(prev => !prev)}
                  title="Toggle In-Meeting Minutes Drawer"
                >
                  <span className="material-symbols-outlined text-base text-blue-300">sticky_note_2</span>
                  <span className="hidden sm:inline">In-Meeting Minutes</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                </button>

                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all active:scale-95 cursor-pointer"
                  onClick={() => {
                    if (window.confirm('Conclude active consultation session and commit WebRTC discussion notes to official Deliberation Minutes?')) {
                      handleStopAndSaveRecording();
                    }
                  }}
                >
                  <span className="material-symbols-outlined text-base sm:text-lg">call_end</span>
                  <span>End Consultation</span>
                </button>
              </div>
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
                  key={`${playingRecording.id}:${playbackRevision}`}
                  src={playingRecording.videoUrl}
                  controls
                  autoPlay
                  playsInline
                  preload="metadata"
                  onError={() => setRecordingPlaybackError('The video could not be loaded. Retry playback to renew recording access.')}
                  style={{ width: '100%', maxHeight: '420px', display: 'block' }}
                >
                  Your browser does not support HTML5 video playback.
                </video>
              </div>
              {recordingPlaybackError && <div role="alert" className="p-3 mb-3 rounded bg-amber-950 text-amber-100 text-sm">
                <p>{recordingPlaybackError}</p>
                <button type="button" className="underline font-bold mt-2" onClick={() => openRecording(playingRecording)}>Retry Playback</button>
              </div>}
              <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '12px 14px', borderRadius: '6px', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ color: '#10b981', fontWeight: '700' }}>Mode: {playingRecording.mode}</span>
                  <span style={{ color: '#94a3b8' }}>Recorded: {new Date(playingRecording.recordedAt).toLocaleString()}</span>
                </div>
                <p style={{ margin: 0, color: '#cbd5e1' }}>{playingRecording.transcriptSummary}</p>
              </div>
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid #334155', paddingTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {isStoredRecording(playingRecording) && (
                <a
                  href={`${playingRecording.videoUrl}?download=1`}
                  download={`recording_${playingRecording.issueId || 'session'}.${recordingExtension(playingRecording.mimeType)}`}
                  className="btn btn-secondary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                >
                  <Download size={14} /> Download Recording
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

      {/* CATEGORY GUIDANCE & SOLUTION VIDEO MANAGER MODAL (Self-Help Hub) */}
      <SelfHelpManagerModal
        isOpen={showVideoManagerModal}
        onClose={() => setShowVideoManagerModal(false)}
        ro={ro}
        category={managerCategory}
        onCategoryChange={(newCat) => {
          setManagerCategory(newCat);
          loadCategoryVideoData(newCat);
        }}
        categories={myAssignedIssueCategories}
        targetIssueId={managerTargetIssueId}
        videoTitle={managerVideoTitle}
        setVideoTitle={setManagerVideoTitle}
        videoUrl={managerVideoUrl}
        setVideoUrl={setManagerVideoUrl}
        videoDesc={managerVideoDesc}
        setVideoDesc={setManagerVideoDesc}
        noVideo={managerNoVideo}
        setNoVideo={(value) => { setManagerNoVideo(value); setManagerSaveSuccess(false); }}
        onSave={handleSaveCategoryVideo}
        saveSuccess={managerSaveSuccess}
        getYoutubeEmbedUrl={getYoutubeEmbedUrl}
      />

    </div>
  );
};
