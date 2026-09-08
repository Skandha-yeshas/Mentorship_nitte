import React, { useContext, useState, useEffect, useRef } from 'react';
import { DatabaseContext, ALL_CATEGORIES, getYoutubeEmbedUrl } from '../context/DatabaseContext';
import { AlertCircle, Calendar, FileText, CheckCircle2, Clock, Send, Star, ExternalLink, User, RotateCcw, Video, Mic, MicOff, VideoOff, Play, Shield, Camera, X, Download, HelpCircle, ThumbsUp } from 'lucide-react';
import { WebRtcMeetingSession } from '../utils/webrtcService';

export const StudentDashboard = ({ studentId }) => {
  const { db, submitIssue, submitFeedback, reopenIssue, resolveIssue, isDemoLimitBypassed, toggleDemoLimitBypass } = useContext(DatabaseContext);
  
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
  const selectedIssue = (db.issues || []).find(i => i.id === activeSelectedIssueId);

  // Student Video Modal State
  const [showStudentVideoModal, setShowStudentVideoModal] = useState(false);
  const [isStudentMicMuted, setIsStudentMicMuted] = useState(false);
  const [isStudentCamOff, setIsStudentCamOff] = useState(false);
  const [studentMediaPermissionState, setStudentMediaPermissionState] = useState('idle'); // 'idle' | 'requesting' | 'granted' | 'denied'
  const [studentMediaPermissionError, setStudentMediaPermissionError] = useState('');
  const [playingRecording, setPlayingRecording] = useState(null);

  // WebRTC Peer Video Stream States for RO & Student
  const [roRemoteStream, setRoRemoteStream] = useState(null);
  const [peerConnected, setPeerConnected] = useState(false);

  const studentVideoRef = useRef(null);
  const studentStreamRef = useRef(null);
  const roRemoteVideoRef = useRef(null);
  const webrtcSessionRef = useRef(null);

  const requestStudentMedia = async () => {
    setStudentMediaPermissionState('requesting');
    setStudentMediaPermissionError('');
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support camera/microphone access (WebRTC).');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true
      });
      studentStreamRef.current = stream;
      if (studentVideoRef.current) {
        studentVideoRef.current.srcObject = stream;
      }
      setStudentMediaPermissionState('granted');

      // Initialize WebRTC Meeting Session for live peer video with RO
      if (selectedIssue) {
        if (webrtcSessionRef.current) {
          webrtcSessionRef.current.updateLocalStream(stream);
        } else {
          webrtcSessionRef.current = new WebRtcMeetingSession({
            issueId: selectedIssue.id,
            role: 'student',
            localStream: stream,
            onRemoteStream: (remStream) => {
              console.log('[Student] Remote RO stream received:', remStream);
              setRoRemoteStream(remStream);
              if (roRemoteVideoRef.current) {
                roRemoteVideoRef.current.srcObject = remStream;
              }
            },
            onPeerStatus: (status) => {
              setPeerConnected(Boolean(status.connected));
            },
            onMeetingEnded: () => {
              console.log('[Student] Meeting ended signal received from RO.');
              handleCloseStudentVideo();
              alert('📢 Meeting Ended by Relationship Officer:\n\nThe RO has concluded this online session. Your session video recording has been saved to your ticket records.');
            }
          });
        }
      }
    } catch (err) {
      console.warn('Student camera/mic permission error:', err);
      setStudentMediaPermissionState('denied');
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setStudentMediaPermissionError('Camera & Microphone permission was blocked by your browser. Please click the lock or camera icon in your address bar and allow Camera and Microphone, then click "Retry Permissions".');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setStudentMediaPermissionError('No webcam or microphone hardware detected on this device. Running in simulated fallback mode.');
      } else {
        setStudentMediaPermissionError(err.message || 'Unable to access camera or microphone.');
      }
    }
  };

  const toggleStudentMic = () => {
    const nextMuted = !isStudentMicMuted;
    setIsStudentMicMuted(nextMuted);
    if (studentStreamRef.current) {
      studentStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
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
  };

  const handleCloseStudentVideo = () => {
    setShowStudentVideoModal(false);
    setStudentMediaPermissionState('idle');
    if (webrtcSessionRef.current) {
      try { webrtcSessionRef.current.close(); } catch (e) {}
      webrtcSessionRef.current = null;
    }
    setRoRemoteStream(null);
    setPeerConnected(false);
    if (studentStreamRef.current) {
      studentStreamRef.current.getTracks().forEach(track => track.stop());
      studentStreamRef.current = null;
    }
  };

  // Auto-exit online meeting when RO ends or marks meeting completed in DB
  useEffect(() => {
    if (showStudentVideoModal && selectedIssue) {
      const currentMeet = (db.meetings || []).find(m => 
        (m.issueId || m.issue_id)?.toUpperCase() === (selectedIssue.id || selectedIssue.issue_id)?.toUpperCase()
      );
      if (currentMeet && (currentMeet.status === 'Completed' || currentMeet.status === 'Finished' || currentMeet.status === 'Cancelled')) {
        handleCloseStudentVideo();
        alert('📢 Meeting Ended by Relationship Officer:\n\nThe RO has concluded this online session. Your session video recording has been saved to your ticket records.');
      }
    }
  }, [db.meetings, showStudentVideoModal, selectedIssue]);

  useEffect(() => {
    if (showStudentVideoModal) {
      requestStudentMedia();
    } else {
      setStudentMediaPermissionState('idle');
      if (webrtcSessionRef.current) {
        try { webrtcSessionRef.current.close(); } catch (e) {}
        webrtcSessionRef.current = null;
      }
      setRoRemoteStream(null);
      setPeerConnected(false);
      if (studentStreamRef.current) {
        studentStreamRef.current.getTracks().forEach(t => t.stop());
        studentStreamRef.current = null;
      }
    }
    return () => {
      if (webrtcSessionRef.current) {
        try { webrtcSessionRef.current.close(); } catch (e) {}
        webrtcSessionRef.current = null;
      }
      setRoRemoteStream(null);
      setPeerConnected(false);
      if (studentStreamRef.current) {
        studentStreamRef.current.getTracks().forEach(t => t.stop());
        studentStreamRef.current = null;
      }
    };
  }, [showStudentVideoModal]);

  // Resources and sessions from their mentor
  const myResources = db.resources.filter(r => r.mentorId === student.mentorId);
  const mySessions = db.groupSessions.filter(s => s.mentorId === student.mentorId);

  // 7-Day Weekly Issue Limit Calculation (Allows up to 2 Issues per 7 days)
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const recentIssues7Days = myIssues
    .filter(i => {
      const rawDate = i.createdAt || i.created_at;
      if (!rawDate) return false;
      const t = new Date(rawDate).getTime();
      return !isNaN(t) && (Date.now() - t) < SEVEN_DAYS_MS;
    })
    .sort((a, b) => {
      const tA = new Date(a.createdAt || a.created_at).getTime();
      const tB = new Date(b.createdAt || b.created_at).getTime();
      return tA - tB; // oldest submitted first
    });

  // Slot 1 & Slot 2 independent tracking
  const slot1Issue = recentIssues7Days[0] || null;
  const slot2Issue = recentIssues7Days[1] || null;

  const usedCount = recentIssues7Days.length;
  const maxWeeklyLimit = 2;
  const availableCount = Math.max(0, maxWeeklyLimit - usedCount);
  const isLimitReached = usedCount >= maxWeeklyLimit;
  
  // Active lock state is true ONLY IF 2 issues used AND demo limit bypass is OFF
  const isFormLocked = isLimitReached && !isDemoLimitBypassed;

  // Calculate Slot 1 Cooldown
  let slot1UnlockTimeStr = '';
  let cooldownDays = 0;
  let cooldownHours = 0;
  let cooldownMinutes = 0;

  if (slot1Issue) {
    const t1 = new Date(slot1Issue.createdAt || slot1Issue.created_at).getTime();
    const msLeft1 = Math.max(0, (t1 + SEVEN_DAYS_MS) - Date.now());
    cooldownDays = Math.floor(msLeft1 / (1000 * 60 * 60 * 24));
    cooldownHours = Math.floor((msLeft1 % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    cooldownMinutes = Math.floor((msLeft1 % (1000 * 60 * 60)) / (1000 * 60));
    slot1UnlockTimeStr = cooldownDays > 0 ? `${cooldownDays}d ${cooldownHours}h` : `${cooldownHours}h ${cooldownMinutes}m`;
  }

  // Calculate Slot 2 Cooldown
  let slot2UnlockTimeStr = '';
  if (slot2Issue) {
    const t2 = new Date(slot2Issue.createdAt || slot2Issue.created_at).getTime();
    const msLeft2 = Math.max(0, (t2 + SEVEN_DAYS_MS) - Date.now());
    const days2 = Math.floor(msLeft2 / (1000 * 60 * 60 * 24));
    const hrs2 = Math.floor((msLeft2 % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins2 = Math.floor((msLeft2 % (1000 * 60 * 60)) / (1000 * 60));
    slot2UnlockTimeStr = days2 > 0 ? `${days2}d ${hrs2}h` : `${hrs2}h ${mins2}m`;
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
    } catch (e) {}

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

    if (isFormLocked) {
      setErrorMessage(`Weekly Limit Reached (2 / 2 Issues Used): Students can submit up to 2 issues per 7 days. Your next issue slot opens in ${cooldownDays > 0 ? `${cooldownDays}d ${cooldownHours}h` : `${cooldownHours}h ${cooldownMinutes}m`}. (Turn on Demo Mode in header to bypass)`);
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
  };

  const handleReopenSubmit = (e) => {
    e.preventDefault();
    const targetId = selectedIssueId || activeSelectedIssueId;
    if (!targetId) return;

    reopenIssue(targetId, student.id, reopenReason);
    setReopenReason('');
    setShowReopenForm(false);
  };

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
        
        {/* ERROR / RATE LIMIT MESSAGE */}
        {errorMessage && (
          <div className="glass-card" style={{ borderLeft: '4px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#dc2626' }}>
              <AlertCircle size={20} />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{errorMessage}</span>
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

        {/* 7-DAY WEEKLY LIMIT BANNER */}
        {!isDemoLimitBypassed && isLimitReached && (
          <div className="glass-card" style={{ borderLeft: '4px solid #f59e0b', background: 'rgba(245, 158, 11, 0.12)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '1.5rem' }}>⏳</div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#b45309' }}>
                    Weekly Limit Reached (2 / 2 Issues Used)
                  </h4>
                  <button
                    onClick={toggleDemoLimitBypass}
                    style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '3px 10px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ⚡ Enable Demo Mode (Bypass Limit)
                  </button>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#92400e' }}>
                  You have used your 2 issue submissions for this 7-day period. Your next issue slot opens in <strong>{cooldownDays > 0 ? `${cooldownDays} days and ${cooldownHours} hours` : `${cooldownHours} hours and ${cooldownMinutes} minutes`}</strong>.
                </p>
              </div>
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
              
              {/* SLOT #1 CARD */}
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                border: slot1Issue ? '1px solid #f59e0b' : '1px solid #10b981',
                background: slot1Issue ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: slot1Issue ? '#b45309' : '#047857' }}>
                    1️⃣ Slot #1: {slot1Issue ? '🔴 USED' : '🟢 AVAILABLE'}
                  </h4>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', backgroundColor: slot1Issue ? '#fef3c7' : '#d1fae5', color: slot1Issue ? '#b45309' : '#047857' }}>
                    {slot1Issue ? 'Occupied' : 'Ready'}
                  </span>
                </div>
                {slot1Issue ? (
                  <div style={{ fontSize: '0.8rem', color: '#92400e' }}>
                    <div>Ticket: <strong>{slot1Issue.id}</strong> ({slot1Issue.category})</div>
                    <div style={{ marginTop: '4px', fontWeight: 700 }}>⏳ Unlocks in: {slot1UnlockTimeStr} (7-Day Limit)</div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: '#065f46' }}>
                    Available for your 1st support request.
                  </div>
                )}
              </div>

              {/* SLOT #2 CARD */}
              <div style={{
                padding: '16px',
                borderRadius: '12px',
                border: slot2Issue ? '1px solid #f59e0b' : '1px solid #10b981',
                background: slot2Issue ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                justify: 'space-between'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: slot2Issue ? '#b45309' : '#047857' }}>
                    2️⃣ Slot #2: {slot2Issue ? '🔴 USED' : '🟢 AVAILABLE'}
                  </h4>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', backgroundColor: slot2Issue ? '#fef3c7' : '#d1fae5', color: slot2Issue ? '#b45309' : '#047857' }}>
                    {slot2Issue ? 'Occupied' : 'Ready'}
                  </span>
                </div>
                {slot2Issue ? (
                  <div style={{ fontSize: '0.8rem', color: '#92400e' }}>
                    <div>Ticket: <strong>{slot2Issue.id}</strong> ({slot2Issue.category})</div>
                    <div style={{ marginTop: '4px', fontWeight: 700 }}>⏳ Unlocks in: {slot2UnlockTimeStr} (7-Day Limit)</div>
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: '#065f46' }}>
                    Available for your 2nd support request.
                  </div>
                )}
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
                  disabled={isFormLocked}
                  style={{
                    width: '100%',
                    justifyContent: 'center',
                    opacity: isFormLocked ? 0.6 : 1,
                    cursor: isFormLocked ? 'not-allowed' : 'pointer'
                  }}
                >
                  {isFormLocked ? (
                    <>🔒 Weekly Limit Reached (Unlocks in {cooldownDays > 0 ? `${cooldownDays}d ${cooldownHours}h` : `${cooldownHours}h ${cooldownMinutes}m`})</>
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
                        <span className={badgeClass}>{issue.status}</span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
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
                    <span>🎥 Watch Solution & Guidance Video for "{selectedIssue.category.split(' - ')[0]}"</span>
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

                    {(db.meetings || []).some(m => (m.issueId || m.issue_id)?.toUpperCase() === selectedIssue.id?.toUpperCase()) ? (
                      <div>
                        {(db.meetings || []).filter(m => (m.issueId || m.issue_id)?.toUpperCase() === selectedIssue.id?.toUpperCase()).map(meet => (
                          <div key={meet.id} style={{ background: '#ffffff', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                                📅 {meet.date} at ⏰ {meet.time}
                              </span>
                              <span className="badge badge-scheduled">{meet.status || 'Scheduled'}</span>
                            </div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                              <strong>Location / Venue:</strong> 📍 {meet.location || 'RO Office Desk (Admin Block)'}
                            </p>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                              <strong>Mode:</strong> {meet.mode || 'Offline (In-Person)'}
                            </p>
                            {meet.notes && (
                              <p style={{ fontSize: '0.82rem', color: 'var(--nitte-blue)', marginTop: '8px', background: 'var(--nitte-blue-light)', border: '1px solid var(--nitte-blue-soft)', padding: '8px 12px', borderRadius: '6px' }}>
                                📌 <strong>RO Instructions for Student:</strong> {meet.notes}
                              </p>
                            )}

                            {/* ONLINE MEETING AUTO-RECORDING NOTICE & STUDENT JOIN BUTTON */}
                            {meet.mode === 'Online' && (
                              <div style={{ marginTop: '10px', padding: '10px 12px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '6px', fontSize: '0.8rem' }}>
                                <div style={{ fontWeight: '700', color: 'var(--nitte-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <Video size={15} /> 🎥 Online Video Call Session (Cloud Auto-Recording Active)
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.76rem', marginTop: '4px' }}>
                                  Your Relationship Officer conducts this session via encrypted online video call. As per university compliance, this session is <strong>automatically recorded and archived</strong> to your ticket record for official reference.
                                </p>
                                {meet.status === 'Started' && (
                                  <button
                                    type="button"
                                    onClick={() => setShowStudentVideoModal(true)}
                                    className="btn btn-primary"
                                    style={{ marginTop: '8px', fontSize: '0.76rem', padding: '4px 12px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#2563eb' }}
                                  >
                                    <Video size={13} /> 🔴 Join Live Session (Recording Active)
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', background: '#ffffff', padding: '12px', borderRadius: '6px', border: '1px dashed var(--border-color)' }}>
                        <p>No meeting has been scheduled by your Relationship Officer yet.</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Your assigned RO will review your ticket and schedule a date, time, and meeting location here if an in-person or online session is required.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* STORED VIDEO RECORDINGS ARCHIVE FOR STUDENT */}
                {db.recordings && db.recordings.filter(r => (r.issueId || r.issue_id)?.toUpperCase() === selectedIssue.id?.toUpperCase()).length > 0 && (
                  <div style={{ border: '1px solid rgba(16, 185, 129, 0.3)', background: 'rgba(16, 185, 129, 0.05)', padding: '12px 14px', borderRadius: '6px', marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: '#10b981', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
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

                {/* FEEDBACK & RATING (WHEN RESOLVED) */}
                {selectedIssue.status === 'Resolved' && (
                  <div style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '8px' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Star size={15} style={{ color: 'var(--accent-amber)' }} /> Resolution Feedback & Rating
                    </h4>
                    
                    {selectedIssue.feedback ? (
                      <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                          {[1, 2, 3, 4, 5].map(num => (
                            <Star key={num} size={14} fill={num <= selectedIssue.feedback.rating ? 'var(--accent-amber)' : 'none'} stroke="var(--accent-amber)" />
                          ))}
                        </div>
                        <p style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-secondary)' }}>"{selectedIssue.feedback.comments}"</p>
                      </div>
                    ) : (
                      <form onSubmit={handleFeedbackSubmit}>
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
                        <button type="submit" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', width: '100%' }}>
                          Submit Rating
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            
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

      </div>

      {/* STUDENT ONLINE VIDEO MEETING ROOM MODAL */}
      {showStudentVideoModal && (
        <div className="modal-overlay" style={{ zIndex: 1100, background: 'rgba(0,0,0,0.85)' }}>
          <div className="modal-content" style={{ maxWidth: '850px', width: '95%', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid #334155', paddingBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(37, 99, 235, 0.2)', padding: '10px', borderRadius: '50%', color: '#3b82f6' }}>
                  <Video size={22} />
                </div>
                <div>
                  <h3 style={{ fontWeight: '700', color: '#ffffff', fontSize: '1.1rem', margin: 0 }}>
                    NITTE Student Online Guidance Session
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    Connected with Relationship Officer &nbsp;|&nbsp; <strong>Auto-Recording Active</strong>
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(220, 38, 38, 0.2)', border: '1px solid #ef4444', padding: '6px 14px', borderRadius: '20px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fca5a5' }}>
                  🔴 AUTO-RECORDING ACTIVE
                </span>
              </div>
            </div>

            <div className="modal-body" style={{ padding: '20px 0' }}>
              {/* Permission & Device Status Banners */}
              {studentMediaPermissionState === 'requesting' && (
                <div style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid #3b82f6', color: '#93c5fd', padding: '10px 14px', borderRadius: '8px', fontSize: '0.82rem', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Camera size={16} />
                  <span><strong>Requesting Camera & Microphone Access:</strong> Please click <em>"Allow"</em> on your browser's prompt to enable your live video and audio feed.</span>
                </div>
              )}

              {studentMediaPermissionState === 'granted' && (
                <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid #10b981', color: '#6ee7b7', padding: '8px 14px', borderRadius: '8px', fontSize: '0.8rem', marginBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={16} />
                    <span><strong>Live Camera & Microphone Active:</strong> Browser permissions granted. Your webcam video and audio are streaming.</span>
                  </div>
                  <span style={{ fontSize: '0.72rem', background: '#065f46', color: '#a7f3d0', padding: '2px 8px', borderRadius: '12px' }}>🔒 Live Stream</span>
                </div>
              )}

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
                    style={{ fontSize: '0.74rem', padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <RotateCcw size={12} /> Retry Permissions
                  </button>
                </div>
              )}

              {/* Video Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                
                {/* RO OFFICER (HOST) LIVE VIDEO FEED */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', height: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                  {roRemoteStream ? (
                    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
                      <video
                        ref={(el) => {
                          roRemoteVideoRef.current = el;
                          if (el && roRemoteStream) {
                            el.srcObject = roRemoteStream;
                          }
                        }}
                        autoPlay
                        playsInline
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,0,0,0.6)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} /> 🟢 RO Host Live WebCam
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#3b82f6', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                        RO
                      </div>
                      <p style={{ marginTop: '10px', fontWeight: '700', fontSize: '0.9rem', color: '#ffffff' }}>Relationship Officer (Host)</p>
                      <span style={{ fontSize: '0.7rem', color: '#93c5fd' }}>
                        {peerConnected ? 'Live Connection Active' : 'Waiting for RO Host to start camera...'}
                      </span>
                    </div>
                  )}
                  <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(0,0,0,0.7)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#fff' }}>
                    <Mic size={12} style={{ color: roRemoteStream ? '#10b981' : (peerConnected ? '#f59e0b' : '#94a3b8') }} />
                    <span>{roRemoteStream ? 'Host Audio & Video Live' : (peerConnected ? 'Connecting Audio...' : 'Waiting for Host')}</span>
                  </div>
                  <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.68rem', color: roRemoteStream ? '#10b981' : '#94a3b8' }}>
                    {roRemoteStream ? '🟢 Live P2P' : (peerConnected ? '🟡 Connecting...' : '⚪ Waiting')}
                  </div>
                </div>

                {/* STUDENT (YOU) LIVE WEBCAM VIDEO FEED */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', height: '220px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
                  {isStudentCamOff ? (
                    <div style={{ color: '#64748b', textAlign: 'center' }}>
                      <VideoOff size={36} style={{ marginBottom: '6px' }} />
                      <p style={{ fontSize: '0.8rem', margin: 0 }}>Camera Off</p>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Click 'Turn Camera On' below</span>
                    </div>
                  ) : studentMediaPermissionState === 'granted' ? (
                    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#000' }}>
                      <video
                        ref={(el) => {
                          studentVideoRef.current = el;
                          if (el && studentStreamRef.current) {
                            el.srcObject = studentStreamRef.current;
                          }
                        }}
                        autoPlay
                        playsInline
                        muted
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,0,0,0.6)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.7rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} /> Live HD WebCam (You)
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #047857 0%, #064e3b 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#10b981', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                        {student.name ? student.name.charAt(0) : 'S'}
                      </div>
                      <p style={{ marginTop: '10px', fontWeight: '700', fontSize: '0.9rem', color: '#ffffff' }}>{student.name} (You)</p>
                      <span style={{ fontSize: '0.7rem', color: '#a7f3d0' }}>
                        {studentMediaPermissionState === 'requesting' ? 'Connecting webcam...' : 'Student Participant — Live'}
                      </span>
                    </div>
                  )}

                  <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(0,0,0,0.7)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px', color: '#fff' }}>
                    {isStudentMicMuted ? <MicOff size={12} style={{ color: '#ef4444' }} /> : <Mic size={12} style={{ color: '#10b981' }} />}
                    <span>{isStudentMicMuted ? 'Muted' : 'Audio Live'}</span>
                  </div>
                  <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.68rem', color: '#10b981' }}>
                    📶 24ms Ping
                  </div>
                </div>
              </div>

              <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '12px 16px', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                  <Shield size={16} style={{ color: '#10b981' }} />
                  <span><strong>256-bit Encrypted Session</strong> &nbsp;|&nbsp; Recording stored to your support ticket file</span>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ borderTop: '1px solid #334155', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={toggleStudentMic}
                  style={{ background: isStudentMicMuted ? '#ef4444' : '#334155', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                >
                  {isStudentMicMuted ? <MicOff size={15} /> : <Mic size={15} />}
                  {isStudentMicMuted ? 'Unmute Mic' : 'Mute Mic'}
                </button>
                <button
                  type="button"
                  onClick={toggleStudentCamera}
                  style={{ background: isStudentCamOff ? '#ef4444' : '#334155', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                >
                  {isStudentCamOff ? <VideoOff size={15} /> : <Video size={15} />}
                  {isStudentCamOff ? 'Turn Camera On' : 'Turn Camera Off'}
                </button>
                {studentMediaPermissionState !== 'granted' && (
                  <button
                    type="button"
                    onClick={requestStudentMedia}
                    style={{ background: '#2563eb', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                  >
                    <Camera size={15} /> Request Cam/Mic Access
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleCloseStudentVideo}
                className="btn btn-secondary"
              >
                Leave Session Window
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

    </div>
  );
};
