import React, { useContext, useState, useEffect, useRef, useMemo } from 'react';
import { DatabaseContext, ALL_CATEGORIES, getYoutubeEmbedUrl, isMatchingMentorId } from '../context/DatabaseContext';
import { WebRtcMeetingSession, getCanonicalMeetingRoomId } from '../utils/webrtcService';
import { CompositeMeetingRecorder } from '../utils/compositeRecorder';
import { createFallbackMediaStream } from '../utils/mediaFallback';
import VideoStreamPlayer from '../components/VideoStreamPlayer';

// 7 Domain models mapping the 49/50 specialized categories
const DOMAIN_MODELS = [
  { id: 'Academic', name: 'Academics', icon: 'school', count: 8 },
  { id: 'Hostels', name: 'Hostel & Infra', icon: 'apartment', count: 8 },
  { id: 'Facilities', name: 'Lab & Systems', icon: 'memory', count: 5 },
  { id: 'Financial', name: 'Fee & Grants', icon: 'payments', count: 8 },
  { id: 'Exams', name: 'Examinations', icon: 'assignment', count: 8 },
  { id: 'Personal', name: 'Student Welfare', icon: 'shield', count: 4 },
  { id: 'Placements', name: 'Placement & Career', icon: 'work', count: 8 }
];

export const StudentDashboard = ({ studentId }) => {
  const {
    db,
    submitIssue,
    submitFeedback,
    reopenIssue,
    resolveIssue,
    submitMentorFeedback,
    isDemoLimitBypassed,
    toggleDemoLimitBypass,
    updateMeetingStatus,
    saveMeetingRecording,
    authenticatedUser
  } = useContext(DatabaseContext);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState('report'); // 'report', 'track', 'mentorship', 'feedback'
  const [selectedIssueId, setSelectedIssueId] = useState(null);

  // Form states
  const [selectedDomain, setSelectedDomain] = useState('Academic');
  const [categorySearchQuery, setCategorySearchQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES[0] || 'Academic - Internal marks discrepancy');
  const [subjectTitle, setSubjectTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('high'); // 'low', 'medium', 'high'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Rating & Reopen states
  const [rating, setRating] = useState(5);
  const [feedbackComments, setFeedbackComments] = useState('');
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  // Mentor Feedback states
  const [mfRegularity, setMfRegularity] = useState(5);
  const [mfClarity, setMfClarity] = useState(4);
  const [mfParticipation, setMfParticipation] = useState(5);
  const [mfDifficulties, setMfDifficulties] = useState('');
  const [mfSuccess, setMfSuccess] = useState('');

  // Modals
  const [submissionVideoModal, setSubmissionVideoModal] = useState(null);
  const [showStudentVideoModal, setShowStudentVideoModal] = useState(false);
  const [activeMeetingIssueId, setActiveMeetingIssueId] = useState(null);
  const [meetingEndedPopup, setMeetingEndedPopup] = useState(null);
  const [playingRecording, setPlayingRecording] = useState(null);

  // WebRTC States & Refs
  const [isStudentMicMuted, setIsStudentMicMuted] = useState(false);
  const [isStudentCamOff, setIsStudentCamOff] = useState(false);
  const [studentMediaPermissionState, setStudentMediaPermissionState] = useState('idle');
  const isMediaRequestingRef = useRef(false);
  const [studentMediaPermissionError, setStudentMediaPermissionError] = useState('');
  const [roRemoteStream, setRoRemoteStream] = useState(null);
  const [studentStream, setStudentStream] = useState(null);
  const [peerConnected, setPeerConnected] = useState(false);
  const [isRoCameraOff, setIsRoCameraOff] = useState(false);
  const [isRoMicMuted, setIsRoMicMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const studentStreamRef = useRef(null);
  const webrtcSessionRef = useRef(null);
  const studentCompositeRecorderRef = useRef(null);
  const submittedIssueIdsRef = useRef(new Set());

  // Resolve current student profile (Authenticated student takes precedence over generic props)
  const isAuthUserStudent = authenticatedUser && (authenticatedUser.role === 'Student' || !authenticatedUser.role);
  const rawTargetStudentId = String((isAuthUserStudent ? authenticatedUser?.id : null) || studentId || authenticatedUser?.id || '').trim();
  const targetStudentIdLower = rawTargetStudentId.toLowerCase();

  const student = (isAuthUserStudent ? authenticatedUser : null) ||
    (db.users?.students || []).find(s => s.id && String(s.id).trim().toLowerCase() === targetStudentIdLower) ||
    (db.users?.students || []).find(s => s.email && String(s.email).trim().toLowerCase() === targetStudentIdLower) ||
    authenticatedUser ||
    (rawTargetStudentId ? {
      id: rawTargetStudentId,
      name: 'Student',
      sem: '6',
      branch: 'CSE',
      email: `${rawTargetStudentId.toLowerCase()}@nitte.edu.in`
    } : null) ||
    (db.users?.students || [])[0] || {
      id: '4NM21CS089',
      name: 'Ananya Rao',
      sem: '6',
      branch: 'CSE',
      email: 'ananya.rao@nitte.edu.in'
    };

  const matchMentorHelper = typeof isMatchingMentorId === 'function'
    ? isMatchingMentorId
    : (a, b) => String(a || '').replace(/[^A-Z0-9]/gi, '').toLowerCase() === String(b || '').replace(/[^A-Z0-9]/gi, '').toLowerCase();

  const myMentor = (db.users?.mentors || []).find(m => matchMentorHelper(m.id, student?.mentorId)) || {
    id: 'M-101',
    name: 'Prof. Suresh Nayak, M.Tech',
    designation: 'Associate Professor • Dept of CSE',
    department: 'Computer Science & Engineering',
    cabin: 'CS-204',
    email: 'suresh.nayak@nitte.edu.in',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAmDrI739sJPBfOMRmOMhlZdFtsRSqN-YNeSOXDEtaoOAl_EgYUXoyB-CvGV4v0eUlXJmO14uuZ_Kgl3KtABptFbpzB1K8f-2aRABQr_x-pZvBOgBid4fI94bAWSm66vCp2EY1Kr2XV74Nu1SsFKHBzK2OONG6fF3x20CgMpLLHsP0efCWo8n6QV5-H_H0DKCPlUzHx7AWX7AzaUQR6fu8TQMI5ui2RN-Zvb7NujM0'
  };

  // Determine active RO dynamically based on category selection
  const activeCategoryIdx = ALL_CATEGORIES.indexOf(category);
  const activeFormRoId = activeCategoryIdx !== -1 ? `RO-${String(activeCategoryIdx + 1).padStart(2, '0')}` : 'RO-01';
  const activeFormRO = (db.users?.ros || []).find(r => r.id === activeFormRoId) || {
    id: activeFormRoId,
    name: 'Prof. Suresh Nayak (RO)',
    category: category.split(' - ')[0] || 'Academic',
    avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAmDrI739sJPBfOMRmOMhlZdFtsRSqN-YNeSOXDEtaoOAl_EgYUXoyB-CvGV4v0eUlXJmO14uuZ_Kgl3KtABptFbpzB1K8f-2aRABQr_x-pZvBOgBid4fI94bAWSm66vCp2EY1Kr2XV74Nu1SsFKHBzK2OONG6fF3x20CgMpLLHsP0efCWo8n6QV5-H_H0DKCPlUzHx7AWX7AzaUQR6fu8TQMI5ui2RN-Zvb7NujM0'
  };

  // Student issues with strict deduplication
  const validStudentIds = new Set([
    targetStudentIdLower,
    String(student?.id || '').trim().toLowerCase(),
    String(authenticatedUser?.id || '').trim().toLowerCase(),
    String(student?.email || '').trim().toLowerCase(),
    String(authenticatedUser?.email || '').trim().toLowerCase(),
    String(studentId || '').trim().toLowerCase()
  ].filter(Boolean));

  const validStudentNames = new Set([
    String(student?.name || '').trim().toLowerCase(),
    String(authenticatedUser?.name || '').trim().toLowerCase()
  ].filter(n => n && n !== 'student' && n !== 'student user'));

  const rawMyIssues = (db.issues || []).filter(i => {
    const sId = String(i.studentId || i.student_id || '').trim().toLowerCase();
    const sName = String(i.studentName || i.student_name || '').trim().toLowerCase();
    const isIdMatch = sId && validStudentIds.has(sId);
    const isNameMatch = sName && validStudentNames.has(sName);
    const cleanIssueId = String(i.id || i.issue_id || '').toUpperCase();
    const isRecentlySelected = selectedIssueId && cleanIssueId === String(selectedIssueId).toUpperCase();
    const isSubmittedInSession = submittedIssueIdsRef.current.has(cleanIssueId);
    return isIdMatch || isNameMatch || isRecentlySelected || isSubmittedInSession;
  });

  const blacklistedIds = new Set(['ISS-887', 'ISS-593', 'ISS-755']);
  const issueDedupeMap = new Map();
  for (const iss of rawMyIssues) {
    const cleanId = (iss.id || iss.issue_id || '').toUpperCase();
    if (!cleanId || blacklistedIds.has(cleanId)) continue;
    if (!issueDedupeMap.has(cleanId)) {
      issueDedupeMap.set(cleanId, { ...iss, id: iss.id || iss.issue_id });
    }
  }
  const myIssues = Array.from(issueDedupeMap.values());
  const activeSelectedIssueId = selectedIssueId || (myIssues.length > 0 ? myIssues[0].id : null);
  const selectedIssue = (db.issues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === activeSelectedIssueId?.toUpperCase()) || myIssues[0] || null;

  const sanitizeMeetingIssueId = (raw) => {
    if (!raw) return 'TICK-1002';
    return String(raw).replace(/^MEET-/i, '').trim().toUpperCase();
  };

  // Active online meeting detection
  const activeStudentOnlineMeeting = (() => {
    const myIssueIds = new Set((myIssues || []).map(i => (i.id || i.issue_id || '').toUpperCase()));
    const myStudentMeetings = (db.meetings || []).filter(m => {
      const isCompleted = m.status === 'Completed' || m.status === 'Finished' || m.status === 'Cancelled' || m.status === 'Concluded';
      if (isCompleted) return false;
      const mIssueId = (m.issueId || m.issue_id || '').toUpperCase();
      const mStudentId = (m.studentId || m.student_id || '').toUpperCase();
      const mStudentName = (m.studentName || m.student_name || '').toLowerCase();
      return (
        myIssueIds.has(mIssueId) ||
        (student?.id && mStudentId === String(student.id).toUpperCase()) ||
        (student?.name && mStudentName === String(student.name).toLowerCase())
      );
    });
    const liveMeet = myStudentMeetings.find(m => m.status === 'Started' || m.status === 'In-Progress');
    if (liveMeet) return liveMeet;
    if (myStudentMeetings.length > 0) return myStudentMeetings[0];

    // Fallback: If any online meeting was started by the RO, ensure the student can see and join it
    const anyLive = (db.meetings || []).find(m => (m.status === 'Started' || m.status === 'In-Progress') && (m.mode === 'Online' || !m.mode));
    if (anyLive) return anyLive;

    return null;
  })();

  // Quota & Lock calculation (Institutional rule: up to 2 active issues)
  const activeUnresolvedIssues = myIssues.filter(i => i.status !== 'Resolved' && i.status !== 'Closed');
  const usedCount = activeUnresolvedIssues.length;
  const maxWeeklyLimit = 2;
  const isLimitReached = usedCount >= maxWeeklyLimit;
  const isFormLocked = isLimitReached && !isDemoLimitBypassed;

  const pendingFeedbackIssues = myIssues.filter(i => {
    const isResolvedOrClosed = i.status === 'Resolved' || i.status === 'Closed';
    const hasFeedback = Boolean(i.feedback && (i.feedback.rating || i.feedbackRating));
    return isResolvedOrClosed && !hasFeedback;
  });

  // Filter sub-issues based on domain or search query
  const availableCategories = useMemo(() => {
    if (categorySearchQuery.trim()) {
      const q = categorySearchQuery.toLowerCase().trim();
      return ALL_CATEGORIES.filter(c => c.toLowerCase().includes(q));
    }
    return ALL_CATEGORIES.filter(c => c.startsWith(`${selectedDomain} - `));
  }, [selectedDomain, categorySearchQuery]);

  // Sync title with category selection
  useEffect(() => {
    if (category) {
      const parts = category.split(' - ');
      const sub = parts[1] || category;
      setSubjectTitle(sub);
    }
  }, [category]);

  // WebRTC Media Stream Request
  const requestStudentMedia = async (targetIssueIdParam = null) => {
    if (isMediaRequestingRef.current) return;
    isMediaRequestingRef.current = true;
    setStudentMediaPermissionState('requesting');
    setStudentMediaPermissionError('');
    try {
      let stream = null;
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error('WebRTC not supported in this browser.');
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
      } catch (e) {
        try {
          console.warn('[Student] Advanced constraints fallback, requesting standard widescreen media:', e);
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280, max: 1920 },
              height: { ideal: 720, max: 1080 },
              aspectRatio: { ideal: 1.7777777778 }
            },
            audio: true
          });
        } catch (fallbackErr) {
          console.warn('[Student] Hardware webcam unavailable or in use by another tab, using virtual HD feed:', fallbackErr);
          stream = createFallbackMediaStream({ label: student?.name || 'Student', role: 'Student' });
        }
      }
      studentStreamRef.current = stream;
      setStudentStream(stream);
      setStudentMediaPermissionState('granted');

      const rawTarget =
        targetIssueIdParam ||
        activeMeetingIssueId ||
        activeStudentOnlineMeeting?.issueId ||
        activeStudentOnlineMeeting?.issue_id ||
        activeStudentOnlineMeeting?.id ||
        (selectedIssue ? (selectedIssue.id || selectedIssue.issue_id) : activeSelectedIssueId) ||
        'TICK-1002';
      const targetIssueId = getCanonicalMeetingRoomId(rawTarget);

      if (targetIssueId) {
        if (webrtcSessionRef.current) {
          try { webrtcSessionRef.current.close(); } catch (e) { }
        }
        webrtcSessionRef.current = new WebRtcMeetingSession({
          issueId: targetIssueId,
          role: 'student',
          localStream: stream,
          onRemoteStream: (remStream) => setRoRemoteStream(remStream),
          onPeerStatus: (status) => setPeerConnected(Boolean(status.connected)),
          onRemoteMediaState: (state) => {
            if (typeof state.video === 'boolean') setIsRoCameraOff(!state.video);
            if (typeof state.audio === 'boolean') setIsRoMicMuted(!state.audio);
          },
          onMeetingEnded: () => {
            handleCloseStudentVideo();
            setMeetingEndedPopup({
              show: true,
              issueId: targetIssueId,
              roName: activeFormRO?.name || 'Relationship Officer',
              endedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
          }
        });
      }
    } catch (err) {
      console.warn('Media setup error:', err);
    } finally {
      isMediaRequestingRef.current = false;
    }
  };

  const handleStudentJoinMeeting = (targetIssueId) => {
    const rawTarget =
      targetIssueId ||
      activeMeetingIssueId ||
      activeStudentOnlineMeeting?.issueId ||
      activeStudentOnlineMeeting?.issue_id ||
      activeStudentOnlineMeeting?.id ||
      selectedIssue?.id ||
      selectedIssueId ||
      'TICK-1002';
    const cleanId = getCanonicalMeetingRoomId(rawTarget);
    setActiveMeetingIssueId(cleanId);
    setShowStudentVideoModal(true);
    requestStudentMedia(cleanId);
  };

  const handleCloseStudentVideo = () => {
    setShowStudentVideoModal(false);
    setActiveMeetingIssueId(null);
    if (webrtcSessionRef.current) {
      try { webrtcSessionRef.current.close(); } catch (e) { }
      webrtcSessionRef.current = null;
    }
    if (studentStreamRef.current) {
      studentStreamRef.current.getTracks().forEach(t => t.stop());
      studentStreamRef.current = null;
    }
    setStudentStream(null);
    setRoRemoteStream(null);
    setPeerConnected(false);
  };

  const toggleStudentMic = () => {
    const next = !isStudentMicMuted;
    setIsStudentMicMuted(next);
    if (studentStreamRef.current) {
      studentStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !next; });
    }
    if (webrtcSessionRef.current) webrtcSessionRef.current.setAudioEnabled(!next);
  };

  const toggleStudentCamera = () => {
    const next = !isStudentCamOff;
    setIsStudentCamOff(next);
    if (studentStreamRef.current) {
      studentStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !next; });
    }
    if (webrtcSessionRef.current) webrtcSessionRef.current.setVideoEnabled(!next);
  };

  // Form Submission
  const handleSubmitIssue = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!description.trim() || isSubmitting) return;
    setErrorMessage('');

    if (pendingFeedbackIssues.length > 0) {
      setSelectedIssueId(pendingFeedbackIssues[0].id);
      setActiveTab('track');
      setErrorMessage(`Action Required: Please submit your feedback and rating for resolved Ticket #${pendingFeedbackIssues[0].id} first.`);
      return;
    }

    if (isFormLocked) {
      setErrorMessage('Quota Limit Reached: Maximum 2 active issues permitted simultaneously.');
      return;
    }

    setIsSubmitting(true);
    try {
      const finalDesc = subjectTitle ? `[${subjectTitle}] ${description}` : description;
      const newIssueId = await submitIssue(student.id, category, finalDesc, priority.toUpperCase());
      setDescription('');
      setSubjectTitle('');
      setSelectedIssueId(newIssueId);
      if (newIssueId) {
        submittedIssueIdsRef.current.add(String(newIssueId).toUpperCase());
      }
      // Show self-help protocol video popup immediately after submission
      setSubmissionVideoModal({ issueId: newIssueId, category, roName: activeFormRO.name });
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit issue');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFeedbackSubmit = (e) => {
    e.preventDefault();
    const targetId = selectedIssueId || activeSelectedIssueId;
    if (!targetId) return;
    submitFeedback(targetId, rating, feedbackComments);
    setFeedbackComments('');
    setSuccessMessage('Thank you! Your rating & feedback has been submitted.');
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const handleReopenSubmit = (e) => {
    e.preventDefault();
    const targetId = selectedIssueId || activeSelectedIssueId;
    if (!targetId) return;
    reopenIssue(targetId, student.id, reopenReason);
    setReopenReason('');
    setShowReopenForm(false);
    setSuccessMessage('Ticket reopened for RO follow-up.');
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  const handleMentorFeedbackSubmit = (e) => {
    e.preventDefault();
    if (!myMentor) return;
    submitMentorFeedback(student.id, student.name, myMentor.id, myMentor.name, mfRegularity, mfClarity, mfParticipation, mfDifficulties);
    setMfSuccess('Confidential mentor feedback submitted successfully! Thank you.');
    setTimeout(() => setMfSuccess(''), 4000);
  };

  return (
    <div className="text-slate-800 font-sans antialiased w-full selection:bg-nitte-800 selection:text-white space-y-6">
      {/* ================= MAIN CONTENT WRAPPER ================= */}
      <div className="max-w-7xl w-full mx-auto space-y-6">

        {/* ================= 1. WEBRTC LIVE SESSION ALERT BANNER ================= */}
        {activeStudentOnlineMeeting && (
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-nitte-950 via-nitte-800 to-indigo-900 text-white shadow-card-hover border border-nitte-700/40 p-5 sm:p-6 transition-all">
            <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-blue-500/10 blur-3xl pointer-events-none"></div>
            <div className="absolute left-1/3 -bottom-12 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none"></div>
            <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="relative flex-shrink-0">
                  <img
                    alt={activeFormRO?.name || 'Relationship Officer'}
                    className="w-14 h-14 rounded-2xl object-cover ring-2 ring-emerald-400 shadow-md"
                    src={activeFormRO?.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDLel99doHvbxmjryAfLBN2VNfpzynyvztUhQKhSNRExE89T18FYlvcmYM4tfaI_vM-172N9v2yX-Wld2Ntk59R4GxGXx7RABEII48GwhkCWqpuVBraR42HJWaKusfr93_AqXCXzXlrp9ejOk8nCkU5_qQ_UiN-glmZbFW-tIcIkJF3cTSY0S2B_q68gOQ-wDAWqktdFkdV_gkrZIVaMDWFM5iPNVJ7xKSySssioXk'}
                  />
                  <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-nitte-950"></span>
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wide bg-rose-500/20 text-rose-300 border border-rose-400/30">
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
                      {(activeStudentOnlineMeeting.status === 'Started' || activeStudentOnlineMeeting.status === 'In-Progress') ? 'LIVE NOW' : 'WAITING FOR RO'}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/10 text-slate-200">
                      <span className="material-symbols-outlined text-[13px] text-emerald-400">lock</span>
                      Room: #{activeStudentOnlineMeeting.issueId || activeStudentOnlineMeeting.id}
                    </span>
                    <span className="text-xs text-slate-300">
                      Scheduled: {activeStudentOnlineMeeting.date} at {activeStudentOnlineMeeting.time}
                    </span>
                  </div>
                  <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                    {activeFormRO?.name || 'Dr. Rajeshwari Kamath'}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-200 max-w-2xl">
                    Online consultation deliberation session for Ticket #{activeStudentOnlineMeeting.issueId || activeStudentOnlineMeeting.id}.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto">
                <button
                  type="button"
                  onClick={() => handleStudentJoinMeeting(activeStudentOnlineMeeting.issueId || activeStudentOnlineMeeting.id)}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-all transform active:scale-95 group"
                >
                  <span className="material-symbols-outlined text-[20px] transition-transform group-hover:scale-110">videocam</span>
                  <span>Join Live Video Call</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Feedback & Error Banners */}
        {errorMessage && (
          <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-800 text-xs font-semibold flex items-center gap-2 shadow-sm">
            <span className="material-symbols-outlined text-[18px] text-rose-600">error</span>
            <span>{errorMessage}</span>
          </div>
        )}
        {successMessage && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-sm">
            <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
            <span>{successMessage}</span>
          </div>
        )}

        {/* ================= 2. SEGMENTED NAVIGATION TAB BAR ================= */}
        <div className="bg-white rounded-2xl p-1.5 border border-slate-200 shadow-card">
          <nav aria-label="Tabs" className="grid grid-cols-2 lg:grid-cols-4 gap-1.5">
            <button
              onClick={() => setActiveTab('report')}
              className={`tab-btn flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${activeTab === 'report' ? 'bg-nitte-800 text-white shadow-pill-glow' : 'hover:text-nitte-800 hover:bg-slate-50 text-slate-600'}`}
            >
              <span className="material-symbols-outlined text-[18px]">add_comment</span>
              <span>Report a Support Issue</span>
            </button>

            <button
              onClick={() => setActiveTab('track')}
              className={`tab-btn flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${activeTab === 'track' ? 'bg-nitte-800 text-white shadow-pill-glow' : 'hover:text-nitte-800 hover:bg-slate-50 text-slate-600'}`}
            >
              <span className="material-symbols-outlined text-[18px]">rule_folder</span>
              <span>Track My Issues</span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-100 text-blue-700">
                {activeUnresolvedIssues.length} Active
              </span>
            </button>

            <button
              onClick={() => setActiveTab('mentorship')}
              className={`tab-btn flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${activeTab === 'mentorship' ? 'bg-nitte-800 text-white shadow-pill-glow' : 'hover:text-nitte-800 hover:bg-slate-50 text-slate-600'}`}
            >
              <span className="material-symbols-outlined text-[18px]">person_celebrate</span>
              <span>Mentorship Hub</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            </button>

            <button
              onClick={() => setActiveTab('feedback')}
              className={`tab-btn flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${activeTab === 'feedback' ? 'bg-nitte-800 text-white shadow-pill-glow' : 'hover:text-nitte-800 hover:bg-slate-50 text-slate-600'}`}
            >
              <span className="material-symbols-outlined text-[18px]">hotel_class</span>
              <span>Mentor Feedback</span>
              <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                Term 2024
              </span>
            </button>
          </nav>
        </div>

        {/* ================= TAB 1: REPORT A SUPPORT ISSUE ================= */}
        {activeTab === 'report' && (
          <div className="tab-panel space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Main Form Column (8 cols) */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 sm:p-7 shadow-card space-y-6">
                <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                      <span className="p-1.5 rounded-lg bg-nitte-50 text-nitte-800 text-[18px] material-symbols-outlined">edit_note</span>
                      Lodge Grievance or Mentorship Request
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">Submit your academic or campus inquiry to your mentor.</p>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Authenticated: {student?.id || '4NM21CS089'}
                  </span>
                </div>

                {/* Grievance Category Selection (NO DROPDOWN - Stitch 2-Tier Selection) */}
                <div className="space-y-3.5 bg-slate-50/50 p-4 rounded-2xl border border-slate-200/80">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                      <span>1. Select Issue Category &amp; Specific Problem</span>
                      <span className="text-rose-500">*</span>
                    </label>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-nitte-50 text-nitte-800 border border-nitte-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-nitte-800"></span>
                      49 Specialized Domains across 7 Models
                    </span>
                  </div>

                  {/* Fast Filter Search */}
                  <div className="relative">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                    <input
                      type="text"
                      placeholder="Search across all 49 issue topics (e.g., IA Marks, Hall Ticket, Wi-Fi, Caution Deposit)..."
                      value={categorySearchQuery}
                      onChange={(e) => setCategorySearchQuery(e.target.value)}
                      className="w-full text-xs pl-9 pr-4 py-2 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-nitte-800/20 focus:border-nitte-800 transition text-slate-800 shadow-sm"
                    />
                  </div>

                  {/* Tier 1: 7 Core Domain Model Pills Carousel */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-xs">
                    {DOMAIN_MODELS.map(domain => (
                      <button
                        key={domain.id}
                        type="button"
                        onClick={() => {
                          setSelectedDomain(domain.id);
                          setCategorySearchQuery('');
                        }}
                        className={`flex-shrink-0 px-3 py-1.5 rounded-lg font-bold border transition flex items-center gap-1.5 text-[11px] ${selectedDomain === domain.id && !categorySearchQuery ? 'bg-nitte-800 text-white border-nitte-800 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:text-nitte-800 hover:bg-slate-50'}`}
                      >
                        <span className="material-symbols-outlined text-[14px]">{domain.icon}</span>
                        <span>{domain.name} ({domain.count})</span>
                      </button>
                    ))}
                  </div>

                  {/* Tier 2: Sub-Issue Selection Grid */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        {categorySearchQuery ? `Search Results (${availableCategories.length})` : `Select Specific ${selectedDomain} Sub-Issue:`}
                      </span>
                      <span className="text-[10px] text-slate-400">Showing {availableCategories.length} items</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                      {availableCategories.map(catStr => {
                        const isSelected = category === catStr;
                        const subName = catStr.includes(' - ') ? catStr.split(' - ')[1] : catStr;
                        const domainName = catStr.includes(' - ') ? catStr.split(' - ')[0] : 'General';

                        return (
                          <button
                            key={catStr}
                            type="button"
                            onClick={() => setCategory(catStr)}
                            className={`p-2.5 rounded-xl border text-left transition-all flex items-start justify-between gap-2 ${isSelected ? 'border-2 border-nitte-800 bg-white shadow-sm' : 'border-slate-200 hover:border-nitte-200 bg-white hover:bg-nitte-50/30'}`}
                          >
                            <div>
                              <p className={`text-xs font-bold leading-snug ${isSelected ? 'text-nitte-900' : 'text-slate-800'}`}>
                                {subName}
                              </p>
                              <p className="text-[10px] text-slate-500 mt-0.5">Domain: {domainName}</p>
                            </div>
                            {isSelected ? (
                              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-nitte-800 text-white flex-shrink-0 mt-0.5">
                                <span className="material-symbols-outlined text-[11px]">check</span>
                              </span>
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-full border border-slate-300 flex-shrink-0 mt-0.5"></span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Dynamic Auto-Routing Tag */}
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-nitte-50 border border-nitte-200/80 text-[11px]">
                    <div className="flex items-center gap-1.5 text-nitte-900 font-medium">
                      <span className="material-symbols-outlined text-[15px] text-nitte-800">alt_route</span>
                      <span>Auto-assigned to: <strong className="font-bold text-nitte-800">{activeFormRO?.name || 'Academic Dean Office'}</strong> ({activeFormRO?.category || category.split(' - ')[0]})</span>
                    </div>
                    <span className="hidden sm:inline-flex items-center gap-1 font-mono text-[10px] text-slate-500">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> SLA: 24h
                    </span>
                  </div>
                </div>

                {/* Priority Selector Pills */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <span>2. Escalation Priority</span>
                      <span className="text-rose-500">*</span>
                    </span>
                    <span className="text-[11px] font-normal text-slate-400">Response SLA: High &lt;24h, Med &lt;48h</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex-1 cursor-pointer">
                      <input
                        className="sr-only"
                        type="radio"
                        name="priority"
                        value="low"
                        checked={priority === 'low'}
                        onChange={() => setPriority('low')}
                      />
                      <div className={`px-3.5 py-2.5 rounded-xl border text-center text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${priority === 'low' ? 'border-slate-600 bg-slate-100 text-slate-900' : 'border-slate-200 text-slate-600'}`}>
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                        Low Priority
                      </div>
                    </label>

                    <label className="flex-1 cursor-pointer">
                      <input
                        className="sr-only"
                        type="radio"
                        name="priority"
                        value="medium"
                        checked={priority === 'medium'}
                        onChange={() => setPriority('medium')}
                      />
                      <div className={`px-3.5 py-2.5 rounded-xl border text-center text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${priority === 'medium' ? 'border-amber-500 bg-amber-50 text-amber-900' : 'border-slate-200 text-slate-600'}`}>
                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                        Medium Priority
                      </div>
                    </label>

                    <label className="flex-1 cursor-pointer">
                      <input
                        className="sr-only"
                        type="radio"
                        name="priority"
                        value="high"
                        checked={priority === 'high'}
                        onChange={() => setPriority('high')}
                      />
                      <div className={`px-3.5 py-2.5 rounded-xl border-2 text-center text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm ${priority === 'high' ? 'border-rose-600 bg-rose-50 text-rose-900' : 'border-slate-200 text-slate-600'}`}>
                        <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                        High (Urgent Redressal)
                      </div>
                    </label>
                  </div>
                </div>

                {/* Subject & Description */}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700 block mb-1">
                      Subject / Brief Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      className="w-full text-sm font-semibold px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-nitte-800/20 focus:border-nitte-800 transition"
                      type="text"
                      required
                      value={subjectTitle}
                      onChange={(e) => setSubjectTitle(e.target.value)}
                      placeholder="e.g. Internal Assessment CIE Score Discrepancy"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Comprehensive Description <span className="text-rose-500">*</span>
                      </label>
                      <span className="text-[11px] font-mono text-slate-400">{description.length} / 600 chars</span>
                    </div>
                    <textarea
                      className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-nitte-800/20 focus:border-nitte-800 transition custom-scrollbar leading-relaxed"
                      rows={4}
                      required
                      maxLength={600}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Provide specific details, dates, course codes, or semester lab batch information..."
                    />
                  </div>
                </div>

                {/* Submission Actions */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setSubmissionVideoModal({ issueId: 'PREVIEW', category, roName: activeFormRO?.name || 'Relationship Officer' })}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition"
                  >
                    <span className="material-symbols-outlined text-[18px]">play_circle</span>
                    Watch Self-Help Guidance Video
                  </button>

                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      disabled={isFormLocked || !description.trim() || isSubmitting}
                      onClick={handleSubmitIssue}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-nitte-800 hover:bg-nitte-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-md shadow-nitte-800/20 transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[16px]">{isSubmitting ? 'sync' : 'send'}</span>
                      {isSubmitting ? 'Submitting Grievance...' : (isFormLocked ? '2/2 Quota Limit Reached' : 'Submit Grievance to RO')}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Side Quota & Active Slots Card (4 cols) */}
              <div className="lg:col-span-4 space-y-5">
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-card space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px] text-nitte-800">hourglass_top</span>
                        Grievance Quota &amp; Active Slots
                      </h4>
                      <span className="text-[11px] text-slate-400">Institutional Redressal Ceiling</span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${isLimitReached ? 'bg-rose-100 text-rose-800 border border-rose-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isLimitReached ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}></span>
                      {usedCount} / 2 {isLimitReached ? 'Filled (Limit Reached)' : 'Used'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 leading-relaxed space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-amber-800">
                      <span className="material-symbols-outlined text-[15px]">info</span>
                      <span>Quota &amp; 7-Day Lock Policy</span>
                    </div>
                    <p className="text-slate-600">
                      Students can maintain a maximum of <strong>2 active issues</strong> simultaneously. Once resolved, mandatory feedback completes the cycle and unlocks the issue slot.
                    </p>
                  </div>

                  {/* Active Slots Breakdown */}
                  <div className="space-y-3">
                    {activeUnresolvedIssues.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
                        No active issues currently open. Both issue slots are available!
                      </div>
                    ) : (
                      activeUnresolvedIssues.slice(0, 2).map((item, idx) => (
                        <div
                          key={item.id}
                          onClick={() => {
                            setSelectedIssueId(item.id);
                            setActiveTab('track');
                          }}
                          className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5 cursor-pointer hover:border-nitte-800 transition"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">Slot {idx + 1}</span>
                              <span className="font-mono text-xs font-bold text-nitte-800">#{item.id}</span>
                            </div>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> {item.status}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-900 leading-snug">
                            {item.category}
                          </p>
                          <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-200/60 text-slate-500">
                            <div className="flex items-center gap-1.5">
                              <img
                                alt="RO Avatar"
                                className="w-5 h-5 rounded-full object-cover ring-1 ring-slate-300"
                                src={
                                  (db.users?.ros || []).find(r => r.id === (item.roId || item.ro_id))?.avatar ||
                                  activeFormRO?.avatar ||
                                  'https://images.unsplash.com/photo-1537368910025-700350fe46c7?w=150'
                                }
                              />
                              <span className="font-medium text-slate-700">
                                {item.roName || (db.users?.ros || []).find(r => r.id === (item.roId || item.ro_id))?.name || 'Assigned RO'}
                              </span>
                            </div>
                            <span className="font-mono text-[10px] text-nitte-800 font-semibold">View Details →</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Self-Help Video Callout */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50/60 rounded-2xl border border-blue-200/80 p-5 space-y-3">
                  <div className="flex items-center gap-2 text-nitte-800">
                    <span className="material-symbols-outlined text-[20px]">smart_display</span>
                    <span className="text-xs font-bold uppercase tracking-wide">Self-Help Protocol Video</span>
                  </div>
                  <h5 className="text-sm font-bold text-slate-900">
                    {category.split(' - ')[1] || category} Walkthrough
                  </h5>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Watch the official department guidelines before escalating to the Relationship Officer.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubmissionVideoModal({ issueId: 'WALKTHROUGH', category, roName: activeFormRO?.name || 'RO' })}
                    className="inline-flex items-center gap-2 text-xs font-bold text-nitte-800 hover:text-nitte-900 hover:underline"
                  >
                    <span>Watch Guidance Walkthrough</span>
                    <span className="material-symbols-outlined text-[16px]">play_circle</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: TRACK MY ISSUES (MASTER-DETAIL) ================= */}
        {activeTab === 'track' && (
          <div className="tab-panel space-y-6">
            {/* Metrics Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-slate-500 uppercase">Total Logged</span>
                  <p className="text-xl font-extrabold text-slate-900">{myIssues.length}</p>
                </div>
                <span className="p-2.5 rounded-xl bg-slate-100 text-slate-600 material-symbols-outlined text-[20px]">receipt_long</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-amber-600 uppercase">In Progress</span>
                  <p className="text-xl font-extrabold text-amber-600">{activeUnresolvedIssues.length} Active</p>
                </div>
                <span className="p-2.5 rounded-xl bg-amber-50 text-amber-600 material-symbols-outlined text-[20px]">pending_actions</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-emerald-600 uppercase">Live WebRTC</span>
                  <p className="text-xl font-extrabold text-emerald-600">{activeStudentOnlineMeeting?.status === 'Started' ? '1 Ready' : '0 Active'}</p>
                </div>
                <span className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 material-symbols-outlined text-[20px]">video_camera_front</span>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-nitte-800 uppercase">Resolved</span>
                  <p className="text-xl font-extrabold text-nitte-800">{myIssues.filter(i => i.status === 'Resolved').length} Closed</p>
                </div>
                <span className="p-2.5 rounded-xl bg-nitte-50 text-nitte-800 material-symbols-outlined text-[20px]">task_alt</span>
              </div>
            </div>

            {/* Master-Detail Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column: Ticket Cards List (5 cols) */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 shadow-card space-y-3">
                <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">My Grievances ({myIssues.length})</span>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Sort:</span>
                    <span className="font-bold text-nitte-800 cursor-pointer">Newest</span>
                  </div>
                </div>

                <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1 custom-scrollbar">
                  {myIssues.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No tickets submitted yet. Click "Report a Support Issue" to create one.
                    </div>
                  ) : (
                    myIssues.map(issue => {
                      const isSelected = (selectedIssue?.id || '').toUpperCase() === (issue.id || '').toUpperCase();
                      const statusColor = issue.status === 'Resolved' ? 'bg-teal-100 text-teal-800' :
                        (issue.status === 'Escalated' || issue.status === 'Re-escalated') ? 'bg-rose-100 text-rose-800' :
                        issue.status === 'Meeting Started' ? 'bg-emerald-100 text-emerald-800' :
                        'bg-amber-100 text-amber-800';

                      return (
                        <div
                          key={issue.id}
                          onClick={() => setSelectedIssueId(issue.id)}
                          className={`p-4 rounded-xl border cursor-pointer transition-all ${isSelected ? 'border-2 border-nitte-800 bg-nitte-50/40 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/70'}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-xs font-bold text-nitte-800">#{issue.id}</span>
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${statusColor}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                              {issue.status}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 mt-2 leading-snug line-clamp-1">{issue.category}</h4>
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{issue.description}</p>
                          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-3 pt-2 border-t border-slate-200/60">
                            <span className="flex items-center gap-1">
                              <span className="material-symbols-outlined text-[13px]">person</span>
                              {issue.roName || 'Relationship Officer'}
                            </span>
                            <span>{issue.submittedAt ? new Date(issue.submittedAt).toLocaleDateString() : 'Active'}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Right Column: Selected Ticket Detail & Audit Trail (7 cols) */}
              <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-card space-y-6">
                {selectedIssue ? (
                  <>
                    {/* Detail Header */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-extrabold text-nitte-800 bg-nitte-50 px-2.5 py-1 rounded-md border border-nitte-200">
                            #{selectedIssue.id}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">
                            {selectedIssue.priority || 'Medium Priority'}
                          </span>
                          <span className="text-xs text-slate-400">{selectedIssue.category?.split(' - ')[0] || 'General'}</span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900">{selectedIssue.category}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => window.print()}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold flex items-center gap-1 transition"
                      >
                        <span className="material-symbols-outlined text-[16px]">print</span>
                        Export Slip
                      </button>
                    </div>

                    {/* Assigned Officer Card */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img
                          alt="Assigned Officer"
                          className="w-11 h-11 rounded-full object-cover ring-2 ring-white shadow-sm"
                          src={activeFormRO?.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAmDrI739sJPBfOMRmOMhlZdFtsRSqN-YNeSOXDEtaoOAl_EgYUXoyB-CvGV4v0eUlXJmO14uuZ_Kgl3KtABptFbpzB1K8f-2aRABQr_x-pZvBOgBid4fI94bAWSm66vCp2EY1Kr2XV74Nu1SsFKHBzK2OONG6fF3x20CgMpLLHsP0efCWo8n6QV5-H_H0DKCPlUzHx7AWX7AzaUQR6fu8TQMI5ui2RN-Zvb7NujM0'}
                        />
                        <div>
                          <p className="text-xs font-bold text-slate-900">{selectedIssue.roName || activeFormRO?.name || 'Prof. Suresh Nayak'} (Assigned Officer)</p>
                          <p className="text-[11px] text-slate-500">Relationship Officer • {selectedIssue.category?.split(' - ')[0] || 'Academic Cell'}</p>
                        </div>
                      </div>

                      {activeStudentOnlineMeeting && (
                        <button
                          type="button"
                          onClick={() => handleStudentJoinMeeting(activeStudentOnlineMeeting.issueId || activeStudentOnlineMeeting.issue_id || selectedIssue.id)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-nitte-800 font-bold text-xs shadow-sm hover:bg-nitte-50 transition"
                        >
                          <span className="material-symbols-outlined text-[16px]">videocam</span> Join WebRTC Sync
                        </button>
                      )}
                    </div>

                    {/* Full Description */}
                    <div className="p-3.5 rounded-xl bg-white border border-slate-200 text-xs space-y-1">
                      <span className="font-bold text-slate-700 block text-[11px] uppercase tracking-wide">Reported Grievance Details:</span>
                      <p className="text-slate-600 leading-relaxed">{selectedIssue.description}</p>
                    </div>

                    {/* Stepper Lifecycle Audit Trail */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Deliberation &amp; Lifecycle Audit Trail</h4>
                      <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                        {/* Step 1: Registered */}
                        <div className="relative">
                          <span className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-4 ring-white">
                            <span className="material-symbols-outlined text-[12px]">check</span>
                          </span>
                          <div className="text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">Ticket Submitted by Student</span>
                              <span className="font-mono text-[10px] text-slate-400">
                                {selectedIssue.submittedAt ? new Date(selectedIssue.submittedAt).toLocaleDateString() : 'Registered'}
                              </span>
                            </div>
                            <p className="text-slate-500 text-[11px] mt-0.5">Automated registration on Central Redressal Portal under USN {student?.id || '4NM21CS089'}.</p>
                          </div>
                        </div>

                        {/* Step 2: RO Assignment */}
                        <div className="relative">
                          <span className="absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white ring-4 ring-white">
                            <span className="material-symbols-outlined text-[12px]">check</span>
                          </span>
                          <div className="text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">Assigned to Officer</span>
                              <span className="font-mono text-[10px] text-slate-400">RO Allocated</span>
                            </div>
                            <p className="text-slate-500 text-[11px] mt-0.5">{selectedIssue.roName || 'Relationship Officer'} designated for jurisdiction review.</p>
                          </div>
                        </div>

                        {/* Step 3: Meeting / Deliberation */}
                        <div className="relative">
                          <span className={`absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white ${selectedIssue.status === 'Resolved' ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'}`}>
                            <span className="material-symbols-outlined text-[12px]">
                              {selectedIssue.status === 'Resolved' ? 'check' : 'refresh'}
                            </span>
                          </span>
                          <div className="text-xs">
                            <div className="flex items-center justify-between">
                              <span className={`font-bold ${selectedIssue.status === 'Resolved' ? 'text-slate-900' : 'text-amber-700'}`}>
                                Consultation &amp; Inquiry Status
                              </span>
                              <span className="font-mono text-[10px] text-slate-400">{selectedIssue.status}</span>
                            </div>
                            <p className="text-slate-600 text-[11px] mt-0.5">
                              {selectedIssue.status === 'Resolved' ? 'Investigation and hearing concluded.' : 'Deliberation active with assigned officer.'}
                            </p>
                          </div>
                        </div>

                        {/* Step 4: Resolution */}
                        <div className={`relative ${selectedIssue.status === 'Resolved' ? '' : 'opacity-60'}`}>
                          <span className={`absolute -left-6 top-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-4 ring-white ${selectedIssue.status === 'Resolved' ? 'bg-teal-500 text-white' : 'bg-slate-200 text-slate-400'}`}>
                            <span className="material-symbols-outlined text-[12px]">
                              {selectedIssue.status === 'Resolved' ? 'check' : 'hourglass_empty'}
                            </span>
                          </span>
                          <div className="text-xs">
                            <span className="font-bold text-slate-700">Official Closure &amp; Sign-off</span>
                            <p className="text-slate-400 text-[11px] mt-0.5">
                              {selectedIssue.status === 'Resolved' ? (selectedIssue.resolutionNotes || 'Marked resolved by officer.') : 'Pending completion of agreed action items.'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Post-Meeting Discussion Minutes Display */}
                    {(selectedIssue.discussionSummary || selectedIssue.discussionMinutes) && (
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1">
                        <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">assignment</span>
                          Official Logged Discussion Minutes &amp; Deliberations:
                        </span>
                        <p className="text-slate-700 leading-relaxed mt-1">
                          {selectedIssue.discussionSummary || selectedIssue.discussionMinutes}
                        </p>
                        {selectedIssue.actionItems && (
                          <div className="pt-2 border-t border-emerald-200/60 mt-2 text-slate-600">
                            <strong>Agreed Next Steps:</strong> {selectedIssue.actionItems}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Stored Video Recording Archive */}
                    {db.recordings && db.recordings.filter(r => (r.issueId || r.issue_id)?.toUpperCase() === selectedIssue.id?.toUpperCase()).length > 0 && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                        <span className="font-bold text-nitte-800 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px]">videocam</span>
                          Auto-Archived Online Video Recordings
                        </span>
                        {db.recordings.filter(r => (r.issueId || r.issue_id)?.toUpperCase() === selectedIssue.id?.toUpperCase()).map(rec => (
                          <div key={rec.id} className="p-2.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                            <div>
                              <p className="font-bold text-slate-800">{rec.mode || 'Online Call'} ({rec.durationText || '10 min'})</p>
                              <p className="text-[10px] text-slate-500">{new Date(rec.recordedAt).toLocaleString()}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setPlayingRecording(rec)}
                              className="px-3 py-1 rounded bg-nitte-800 text-white font-bold text-[11px]"
                            >
                              Play Recording
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Satisfaction Feedback (When Resolved) */}
                    {selectedIssue.status === 'Resolved' && (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800">Rate Redressal Progress</span>
                          <span className="text-[10px] text-slate-400">Required to free issue quota</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-amber-400">
                          {[1, 2, 3, 4, 5].map(st => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setRating(st)}
                              className={`material-symbols-outlined text-[24px] ${st <= rating ? 'text-amber-400' : 'text-slate-300'}`}
                            >
                              star
                            </button>
                          ))}
                          <span className="text-xs font-bold text-slate-700 ml-2">{rating}.0 / 5.0</span>
                        </div>

                        <textarea
                          className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-200 focus:outline-none"
                          placeholder="Provide optional satisfaction remarks..."
                          rows={2}
                          value={feedbackComments}
                          onChange={(e) => setFeedbackComments(e.target.value)}
                        />

                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={() => setShowReopenForm(!showReopenForm)}
                            className="text-xs text-rose-600 hover:text-rose-700 font-semibold hover:underline"
                          >
                            Dissatisfied? Re-open Ticket
                          </button>
                          <button
                            type="button"
                            onClick={handleFeedbackSubmit}
                            className="px-3.5 py-1.5 rounded-lg bg-nitte-800 text-white text-xs font-bold hover:bg-nitte-900 transition"
                          >
                            Submit Feedback &amp; Unlock Slot
                          </button>
                        </div>

                        {showReopenForm && (
                          <div className="pt-3 border-t border-slate-200 space-y-2">
                            <span className="text-xs font-bold text-rose-800">Explain reason for re-opening:</span>
                            <textarea
                              className="w-full text-xs p-2.5 rounded-lg bg-white border border-slate-200"
                              rows={2}
                              required
                              value={reopenReason}
                              onChange={(e) => setReopenReason(e.target.value)}
                              placeholder="Describe why resolution was incomplete or additional support required..."
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setShowReopenForm(false)}
                                className="px-3 py-1 rounded bg-slate-200 text-slate-700 text-xs font-bold"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleReopenSubmit}
                                className="px-3 py-1 rounded bg-rose-600 text-white text-xs font-bold"
                              >
                                Confirm Re-open
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400">
                    Select a ticket from the left column to view audit trail and details.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 3: FACULTY MENTORSHIP HUB ================= */}
        {activeTab === 'mentorship' && (
          <div className="tab-panel space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Mentor Profile Card (5 cols) */}
              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-card space-y-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Permanent Faculty Mentor</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Assigned 2023-25</span>
                </div>

                <div className="flex flex-col items-center text-center p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-3">
                  <img
                    alt={myMentor?.name || 'Faculty Mentor'}
                    className="w-24 h-24 rounded-2xl object-cover ring-4 ring-nitte-100 shadow-md"
                    src={myMentor?.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAmDrI739sJPBfOMRmOMhlZdFtsRSqN-YNeSOXDEtaoOAl_EgYUXoyB-CvGV4v0eUlXJmO14uuZ_Kgl3KtABptFbpzB1K8f-2aRABQr_x-pZvBOgBid4fI94bAWSm66vCp2EY1Kr2XV74Nu1SsFKHBzK2OONG6fF3x20CgMpLLHsP0efCWo8n6QV5-H_H0DKCPlUzHx7AWX7AzaUQR6fu8TQMI5ui2RN-Zvb7NujM0'}
                  />
                  <div>
                    <h3 className="text-base font-bold text-slate-900">{myMentor?.name || 'Prof. Suresh Nayak, M.Tech'}</h3>
                    <p className="text-xs text-nitte-800 font-semibold">{myMentor?.designation || 'Associate Professor • Dept of CSE'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Faculty In-Charge • Cloud &amp; Distributed Labs</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 pt-1">
                    <span className="text-[11px] font-mono bg-white px-2.5 py-1 rounded-md border border-slate-200 text-slate-600">
                      Office: {myMentor?.cabin || 'CS-204'}
                    </span>
                    <span className="text-[11px] font-mono bg-white px-2.5 py-1 rounded-md border border-slate-200 text-slate-600">
                      Hours: Mon-Thu 3-5 PM
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Mentorship Batch</span>
                    <span className="font-bold text-slate-800">2021-25 CSE Batch B</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Total 1-on-1 Sessions</span>
                    <span className="font-bold text-slate-800">8 Completed</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Next Scheduled Evaluation</span>
                    <span className="font-bold text-nitte-800">Nov 04, 2024</span>
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <a
                    href={`mailto:${myMentor?.email || 'suresh.nayak@nitte.edu.in'}`}
                    className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-nitte-50 hover:bg-nitte-100 text-nitte-800 border border-nitte-200 text-xs font-bold transition shadow-sm group"
                  >
                    <span className="material-symbols-outlined text-[18px] text-nitte-800">mail</span>
                    <span>Email Mentor</span>
                    <span className="text-[11px] font-mono font-normal text-slate-500 group-hover:text-nitte-900">
                      ({myMentor?.email || 'suresh.nayak@nitte.edu.in'})
                    </span>
                  </a>
                </div>
              </div>

              {/* Mentorship Logs & Milestones (7 cols) */}
              <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-card space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Mentorship Logs &amp; Academic Recommendations</h3>
                    <p className="text-xs text-slate-500">Continuous Evaluation records entered by your faculty mentor.</p>
                  </div>
                  <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                    Good Standing (8.6 CGPA)
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Semester 5 Mid-Term Review &amp; Internship Search</span>
                      <span className="text-[11px] font-mono text-slate-400">Sep 12, 2024</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      "Student is advised to focus on distributed system algorithms and apply for summer research internships through the university innovation lab. Lab attendances verified at 94%."
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] font-bold bg-white text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                        Signed: {myMentor?.name || 'Prof. Suresh Nayak'}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-medium">Action Item Completed</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">Semester 4 Capstone Phase 0 Evaluation</span>
                      <span className="text-[11px] font-mono text-slate-400">May 19, 2024</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      "Synopsis approved for decentralized attendance tracker. Co-guide assigned from Electronics dept for hardware integration."
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] font-bold bg-white text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                        Signed: {myMentor?.name || 'Prof. Suresh Nayak'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-nitte-50 border border-nitte-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-nitte-800 text-[24px]">ondemand_video</span>
                    <div>
                      <p className="text-xs font-bold text-nitte-900">Recommended Guidance Video for Capstone</p>
                      <p className="text-[11px] text-slate-500">IEEE Paper Publication standards and ethical AI usage guidelines.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSubmissionVideoModal({ issueId: 'CAPSTONE', category: 'Academic Guidance', roName: myMentor?.name || 'Mentor' })}
                    className="text-xs font-bold text-nitte-800 hover:underline"
                  >
                    Watch →
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: MENTOR FEEDBACK & RATING ================= */}
        {activeTab === 'feedback' && (
          <div className="tab-panel space-y-6">
            <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-card space-y-6">
              <div className="border-b border-slate-100 pb-4 text-center sm:text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Student Feedback on Mentorship Experience</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Your ratings are 100% anonymized to internal NAAC/NIRF audit standards.</p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-nitte-50 text-nitte-800 border border-nitte-200 self-start sm:self-auto">
                  Semester 6 • Cycle 2
                </span>
              </div>

              {mfSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-800 text-xs font-semibold">
                  {mfSuccess}
                </div>
              )}

              {/* Mentor Banner */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <img
                  alt={myMentor?.name || 'Mentor'}
                  className="w-12 h-12 rounded-xl object-cover ring-2 ring-white"
                  src={myMentor?.avatar || 'https://lh3.googleusercontent.com/aida-public/AB6AXuAmDrI739sJPBfOMRmOMhlZdFtsRSqN-YNeSOXDEtaoOAl_EgYUXoyB-CvGV4v0eUlXJmO14uuZ_Kgl3KtABptFbpzB1K8f-2aRABQr_x-pZvBOgBid4fI94bAWSm66vCp2EY1Kr2XV74Nu1SsFKHBzK2OONG6fF3x20CgMpLLHsP0efCWo8n6QV5-H_H0DKCPlUzHx7AWX7AzaUQR6fu8TQMI5ui2RN-Zvb7NujM0'}
                />
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Evaluating: {myMentor?.name || 'Prof. Suresh Nayak'}</h4>
                  <p className="text-xs text-slate-500">Department of Computer Science &amp; Engineering • Term 2024</p>
                </div>
              </div>

              {/* 3-Criteria Rating Grid */}
              <div className="space-y-5">
                {/* Criterion 1 */}
                <div className="p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-nitte-200 transition">
                  <div className="space-y-0.5">
                    <h5 className="text-xs font-bold text-slate-800">1. Regularity &amp; Punctuality of Mentorship Meetings</h5>
                    <p className="text-[11px] text-slate-500">Adherence to scheduled appointment calendar &amp; responsiveness to emergency pings.</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-400">
                    {[1, 2, 3, 4, 5].map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setMfRegularity(st)}
                        className={`material-symbols-outlined text-[24px] ${st <= mfRegularity ? 'text-amber-400' : 'text-slate-300'}`}
                      >
                        star
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-800 ml-2">{mfRegularity}/5</span>
                  </div>
                </div>

                {/* Criterion 2 */}
                <div className="p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-nitte-200 transition">
                  <div className="space-y-0.5">
                    <h5 className="text-xs font-bold text-slate-800">2. Clarity of Guidance &amp; Redressal Escalation</h5>
                    <p className="text-[11px] text-slate-500">Ability to resolve departmental grievances and provide actionable career counseling.</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-400">
                    {[1, 2, 3, 4, 5].map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setMfClarity(st)}
                        className={`material-symbols-outlined text-[24px] ${st <= mfClarity ? 'text-amber-400' : 'text-slate-300'}`}
                      >
                        star
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-800 ml-2">{mfClarity}/5</span>
                  </div>
                </div>

                {/* Criterion 3 */}
                <div className="p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-nitte-200 transition">
                  <div className="space-y-0.5">
                    <h5 className="text-xs font-bold text-slate-800">3. Empathy, Inclusivity &amp; Student Encouragement</h5>
                    <p className="text-[11px] text-slate-500">Active listening, confidentiality assurance, and positive mental health support.</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-amber-400">
                    {[1, 2, 3, 4, 5].map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setMfParticipation(st)}
                        className={`material-symbols-outlined text-[24px] ${st <= mfParticipation ? 'text-amber-400' : 'text-slate-300'}`}
                      >
                        star
                      </button>
                    ))}
                    <span className="text-xs font-bold text-slate-800 ml-2">{mfParticipation}/5</span>
                  </div>
                </div>
              </div>

              {/* Constructive Comments */}
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Constructive Remarks &amp; Suggestions for Improvement
                </label>
                <textarea
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-nitte-800/20 focus:border-nitte-800 transition custom-scrollbar"
                  placeholder="Mention any specific support you received or areas where mentorship sessions can be made more helpful..."
                  rows={3}
                  value={mfDifficulties}
                  onChange={(e) => setMfDifficulties(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleMentorFeedbackSubmit}
                  className="px-6 py-2.5 rounded-xl bg-nitte-800 hover:bg-nitte-900 text-white font-bold text-xs shadow-md transition-all active:scale-95"
                >
                  Submit Confidential Feedback
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ================= WEBRTC VIDEO MODAL (STITCH CINEMATIC DESIGN) ================= */}
      {showStudentVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-slate-900 text-white rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl border border-slate-800 flex flex-col">
            {/* Header */}
            <div className="px-5 py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                </span>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white tracking-wide">
                    WebRTC Encrypted Session • Ticket #{activeMeetingIssueId || 'TICKET'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {activeFormRO?.name || 'Relationship Officer'} &amp; {student?.name || 'Student'} ({student?.id})
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                  {peerConnected ? 'Bitrate: 2.4 Mbps (HD 1080p)' : 'Connecting P2P...'}
                </span>
                <button
                  onClick={handleCloseStudentVideo}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
            </div>

            {/* Stage: Remote Video Stream + PiP Student Stream */}
            <div className="relative bg-black aspect-video flex items-center justify-center overflow-hidden">
              {roRemoteStream ? (
                <div className="absolute inset-0 w-full h-full flex items-center justify-center">
                  <VideoStreamPlayer
                    stream={roRemoteStream}
                    muted={false}
                    objectFit="contain"
                    isMicMuted={isRoMicMuted}
                    isCameraOff={isRoCameraOff}
                    participantName={activeFormRO?.name || 'Relationship Officer'}
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 text-slate-400 p-6 text-center">
                  <div className="relative w-16 h-16 rounded-full border-2 border-slate-700 border-t-emerald-400 animate-spin flex items-center justify-center">
                    <span className="material-symbols-outlined text-emerald-400 text-2xl animate-none">videocam</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Connecting Secure WebRTC Link...</p>
                    <p className="text-xs text-slate-400 mt-0.5">Waiting for {activeFormRO?.name || 'Relationship Officer'} video stream</p>
                  </div>
                </div>
              )}

              {/* PiP Local Video Stream */}
              <div className="absolute bottom-4 right-4 w-44 sm:w-48 aspect-video rounded-xl bg-slate-800 border-2 border-nitte-500 overflow-hidden shadow-2xl z-20">
                {studentStream ? (
                  <VideoStreamPlayer
                    stream={studentStream}
                    muted={true}
                    objectFit="contain"
                    isMicMuted={isStudentMicMuted}
                    isCameraOff={isStudentCamOff}
                    participantName="You"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-500">Camera Off</div>
                )}
                <span className="absolute bottom-1.5 left-2 text-[10px] font-mono bg-black/70 px-1.5 py-0.5 rounded text-white z-10 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> You
                </span>
              </div>

              {/* Subtitles / Recording active indicator */}
              <div className="absolute bottom-4 left-4 max-w-md bg-slate-950/80 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 text-xs text-slate-200 z-10">
                <span className="text-emerald-400 font-bold">Encrypted Session:</span> Institutional audio &amp; video streams protected under university guidelines.
              </div>
            </div>

            {/* Video Control Dock Bar */}
            <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <div className="text-xs text-slate-400 font-mono">
                Status: <span className="text-white font-bold">{peerConnected ? 'Connected' : 'Syncing'}</span>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={toggleStudentMic}
                  className={`p-3 rounded-full transition shadow-sm ${isStudentMicMuted ? 'bg-rose-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
                  title={isStudentMicMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                >
                  <span className="material-symbols-outlined text-[20px]">{isStudentMicMuted ? 'mic_off' : 'mic'}</span>
                </button>

                <button
                  type="button"
                  onClick={toggleStudentCamera}
                  className={`p-3 rounded-full transition shadow-sm ${isStudentCamOff ? 'bg-rose-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white'}`}
                  title={isStudentCamOff ? 'Turn On Camera' : 'Turn Off Camera'}
                >
                  <span className="material-symbols-outlined text-[20px]">{isStudentCamOff ? 'videocam_off' : 'videocam'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCloseStudentVideo}
                  className="px-5 py-3 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition"
                >
                  <span className="material-symbols-outlined text-[18px]">call_end</span>
                  <span>Leave Call</span>
                </button>
              </div>

              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-emerald-400">lock</span>
                <span>WebRTC P2P Active</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= SELF-HELP GUIDANCE VIDEO MODAL ================= */}
      {submissionVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-nitte-800">smart_display</span>
                Self-Help Protocol — {submissionVideoModal.category}
              </span>
              <button
                onClick={() => { setSubmissionVideoModal(null); setActiveTab('track'); }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 transition"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Ticket badge */}
            {submissionVideoModal.issueId && submissionVideoModal.issueId !== 'PREVIEW' && submissionVideoModal.issueId !== 'WALKTHROUGH' && submissionVideoModal.issueId !== 'CAPSTONE' && (
              <div className="px-5 py-2 bg-nitte-50 border-b border-slate-100 flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-nitte-700">confirmation_number</span>
                <span className="text-xs text-slate-600">
                  Ticket <strong className="text-nitte-800">#{submissionVideoModal.issueId}</strong> submitted successfully — please watch the self-help video below before deciding next steps.
                </span>
              </div>
            )}

            <div className="p-4 space-y-4">
              {/* Video player */}
              <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
                <iframe
                  className="w-full h-full"
                  src="https://www.youtube.com/embed/kqtD5dpn9C8?autoplay=1"
                  title="Self-Help Protocol Video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>

              {/* Guidance label */}
              <p className="text-[11px] text-slate-500 text-center leading-relaxed">
                Watch the guidance above. If your issue is resolved, click <strong>Issue Resolved</strong>. Otherwise, click <strong>Escalate to RO</strong> to route it to {submissionVideoModal.roName || 'your Relationship Officer'}.
              </p>

              {/* Action buttons — only show for real tickets */}
              {submissionVideoModal.issueId && submissionVideoModal.issueId !== 'PREVIEW' && submissionVideoModal.issueId !== 'WALKTHROUGH' && submissionVideoModal.issueId !== 'CAPSTONE' ? (
                <div className="grid grid-cols-2 gap-3">
                  {/* Resolved button — white → green */}
                  <button
                    onClick={async () => {
                      try {
                        await resolveIssue(submissionVideoModal.issueId, student.id, 'Self-resolved by student after watching self-help protocol video.');
                        setSubmissionVideoModal(null);
                        setSuccessMessage(`Ticket #${submissionVideoModal.issueId} marked as resolved. Well done!`);
                        setTimeout(() => setSuccessMessage(''), 5000);
                        setActiveTab('track');
                      } catch (err) {
                        // If resolveIssue throws (e.g. requires RO), just close and track
                        setSubmissionVideoModal(null);
                        setActiveTab('track');
                      }
                    }}
                    className="group flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-emerald-400 bg-white text-emerald-700 text-xs font-bold transition-all duration-200 hover:bg-emerald-500 hover:border-emerald-500 hover:text-white hover:shadow-lg hover:shadow-emerald-100 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[18px] transition-transform duration-200 group-hover:scale-110">check_circle</span>
                    Issue Resolved
                  </button>

                  {/* Escalate to RO button — white → red */}
                  <button
                    onClick={() => {
                      setSubmissionVideoModal(null);
                      setSuccessMessage(`Ticket #${submissionVideoModal.issueId} routed to ${submissionVideoModal.roName || 'RO'} for review.`);
                      setTimeout(() => setSuccessMessage(''), 5000);
                      setActiveTab('track');
                    }}
                    className="group flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-rose-400 bg-white text-rose-600 text-xs font-bold transition-all duration-200 hover:bg-rose-500 hover:border-rose-500 hover:text-white hover:shadow-lg hover:shadow-rose-100 active:scale-95"
                  >
                    <span className="material-symbols-outlined text-[18px] transition-transform duration-200 group-hover:scale-110">escalator_warning</span>
                    Escalate to RO
                  </button>
                </div>
              ) : (
                /* Fallback close button for preview/walkthrough/capstone modes */
                <div className="flex justify-end">
                  <button
                    onClick={() => setSubmissionVideoModal(null)}
                    className="px-4 py-2 rounded-xl bg-nitte-800 text-white text-xs font-bold"
                  >
                    Close &amp; Continue
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================= RECORDING PLAYBACK MODAL ================= */}
      {playingRecording && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-slate-900 text-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl border border-slate-800">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold">Auto-Archived Recording: Ticket #{playingRecording.issueId}</span>
              <button onClick={() => setPlayingRecording(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-4">
              <video src={playingRecording.videoUrl} controls autoPlay className="w-full aspect-video rounded-xl bg-black" />
            </div>
          </div>
        </div>
      )}

      {/* ================= MEETING CONCLUDED ALERT POPUP ================= */}
      {meetingEndedPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 text-center space-y-4">
            <span className="material-symbols-outlined text-[48px] text-emerald-500">task_alt</span>
            <h3 className="text-base font-bold text-slate-900">Meeting Session Concluded</h3>
            <p className="text-xs text-slate-600">
              Your consultation session with <strong>{meetingEndedPopup.roName}</strong> for Ticket #{meetingEndedPopup.issueId} ended at {meetingEndedPopup.endedAt}.
            </p>
            <button
              onClick={() => setMeetingEndedPopup(null)}
              className="w-full py-2.5 rounded-xl bg-nitte-800 text-white text-xs font-bold shadow-md"
            >
              Acknowledge &amp; Return to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* ================= INSTITUTIONAL FOOTER ================= */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6 rounded-2xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-nitte-800">NITTE (Deemed to be University)</span>
            <span>•</span>
            <span>Student Grievance Redressal Committee (SGRC)</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <a className="hover:text-nitte-800 transition" href="#regulations">University Regulations</a>
            <a className="hover:text-nitte-800 transition" href="#anti-ragging">Anti-Ragging Squad</a>
            <a className="hover:text-nitte-800 transition" href="#ombudsperson">Ombudsperson Contact</a>
            <span className="font-mono text-slate-400">Build v3.2.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
