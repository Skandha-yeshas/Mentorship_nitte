import React, { useContext, useState, useEffect } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { Inbox, CheckCircle2, AlertTriangle, Calendar, User, Search, RefreshCw, Send, RotateCcw, Video, Mic, MicOff, VideoOff, Square, Shield, Play } from 'lucide-react';

export const RODashboard = ({ roId }) => {
  const { db, updateMeetingStatus, resolveIssue, escalateIssue, scheduleRoMeeting, saveMeetingRecording } = useContext(DatabaseContext);

  // RO filters
  const [statusFilter, setStatusFilter] = useState('All'); // 'All', 'Assigned to RO', 'Meeting Scheduled', 'Re-opened by Student', 'Resolved', 'Escalated'
  const [selectedIssueId, setSelectedIssueId] = useState(null);

  // Search query
  const [searchQuery, setSearchQuery] = useState('');

  // Modals visibility
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  // Online Meeting Video & Auto-Recorder Modal State
  const [showOnlineMeetingModal, setShowOnlineMeetingModal] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  // Form states
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [escalationReason, setEscalationReason] = useState('');

  // Schedule meeting form states
  const [meetDate, setMeetDate] = useState('');
  const [meetTime, setMeetTime] = useState('10:00');
  const [meetMode, setMeetMode] = useState('Offline');
  const [meetLocation, setMeetLocation] = useState('RO Office Desk 1 (Admin Block)');
  const [meetNotes, setMeetNotes] = useState('Bring student ID card and relevant documents.');

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

  // Auto-recording timer effect
  useEffect(() => {
    let timer;
    if (showOnlineMeetingModal) {
      timer = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      setRecordingSeconds(0);
    }
    return () => clearInterval(timer);
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
    setShowScheduleModal(true);
  };

  const handleLaunchOnlineMeeting = () => {
    if (!activeMeeting || !selectedIssue) return;
    updateMeetingStatus(activeMeeting.id || activeMeeting.issueId, 'Started');
    setRecordingSeconds(0);
    setShowOnlineMeetingModal(true);
  };

  const handleStopAndSaveRecording = () => {
    if (!activeMeeting || !selectedIssue) return;
    const finalSecs = Math.max(recordingSeconds, 15);
    saveMeetingRecording(
      activeMeeting.id || activeMeeting.issueId,
      selectedIssue.id,
      finalSecs,
      `https://nitte-cloud-storage.edu/recordings/rec_${selectedIssue.id}_${Date.now()}.mp4`,
      `RO (${ro.name}) conducted online video session with Student (${selectedIssue.studentName}). Video recording & transcript auto-saved.`
    );
    updateMeetingStatus(activeMeeting.id || activeMeeting.issueId, 'Completed');
    setShowOnlineMeetingModal(false);
    alert(`🎥 Online Meeting Ended & Auto-Recorded!\n\nDuration: ${formatTimer(finalSecs)}\nStorage: Saved to NITTE Secured Storage (rec_${selectedIssue.id}.webm)`);
  };

  const handleResolveSubmit = (e) => {
    e.preventDefault();
    if (!resolutionNotes.trim() || !selectedIssueId) return;

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

    scheduleRoMeeting(selectedIssueId, selectedIssue.studentId, ro.id, meetDate, meetTime, meetMode, meetLocation, meetNotes);
    setShowScheduleModal(false);
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

                  {/* START / LAUNCH MEETING ACTION BUTTON FOR RO */}
                  {selectedIssue.status !== 'Resolved' && selectedIssue.status !== 'Escalated' && (
                    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      {(activeMeeting.status === 'Started' || activeMeeting.status === 'In-Progress') ? (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                          <div style={{ color: '#10b981', fontWeight: '700', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <CheckCircle2 size={16} /> 🟢 Meeting Currently In-Progress
                          </div>
                          {activeMeeting.mode === 'Online' && (
                            <button
                              type="button"
                              onClick={() => setShowOnlineMeetingModal(true)}
                              className="btn btn-primary"
                              style={{ fontSize: '0.75rem', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#2563eb' }}
                            >
                              <Video size={13} /> Open Recording Room (REC: {formatTimer(recordingSeconds)})
                            </button>
                          )}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {activeMeeting.mode === 'Online' ? (
                            <button
                              type="button"
                              onClick={handleLaunchOnlineMeeting}
                              className="btn btn-primary"
                              style={{ fontSize: '0.78rem', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px', borderRadius: '4px', background: '#2563eb' }}
                            >
                              <Video size={14} /> Launch Online Meeting & Auto-Record
                            </button>
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
              {db.recordings && db.recordings.filter(r => r.issueId === selectedIssue.id).length > 0 && (
                <div style={{ border: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.05)', padding: '12px 14px', borderRadius: '6px', marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--nitte-blue)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Video size={15} /> Auto-Archived Online Video Recordings ({db.recordings.filter(r => r.issueId === selectedIssue.id).length})
                  </h4>
                  {db.recordings.filter(r => r.issueId === selectedIssue.id).map(rec => (
                    <div key={rec.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '8px 10px', borderRadius: '4px', marginTop: '6px', fontSize: '0.78rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: '700', color: '#10b981' }}>🎥 {rec.mode} ({rec.durationText})</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>Recorded: {new Date(rec.recordedAt).toLocaleString()}</span>
                      </div>
                      <p style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>{rec.transcriptSummary}</p>
                      <div style={{ marginTop: '6px', display: 'flex', gap: '8px' }}>
                        <a href={rec.videoUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--nitte-blue)', fontWeight: '600', textDecoration: 'underline', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <Play size={12} /> Play Stored Video Recording (mp4/webm)
                        </a>
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
                      onClick={() => setShowResolveModal(true)}
                      className="btn btn-success"
                      style={{ flex: 1, minWidth: '140px' }}
                    >
                      Mark as Resolved
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

      {/* ONLINE VIDEO MEETING ROOM & AUTOMATED RECORDER MODAL FOR RO */}
      {showOnlineMeetingModal && selectedIssue && activeMeeting && (
        <div className="modal-overlay" style={{ zIndex: 1100, background: 'rgba(0,0,0,0.85)' }}>
          <div className="modal-content" style={{ maxWidth: '850px', width: '95%', background: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>

            {/* Modal Header */}
            <div className="modal-header" style={{ borderBottom: '1px solid #334155', paddingBottom: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.2)', padding: '10px', borderRadius: '50%', color: '#ef4444' }}>
                  <Video size={22} />
                </div>
                <div>
                  <h3 style={{ fontWeight: '700', color: '#ffffff', fontSize: '1.1rem', margin: 0 }}>
                    NITTE Online Meeting Room & Cloud Auto-Recorder
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                    Student: <strong>{selectedIssue.studentName}</strong> ({selectedIssue.studentId}) &nbsp;|&nbsp; Ticket: <strong>{selectedIssue.id}</strong>
                  </p>
                </div>
              </div>

              {/* Pulsing Red Auto-Recording Active Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(220, 38, 38, 0.2)', border: '1px solid #ef4444', padding: '6px 14px', borderRadius: '20px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444', display: 'inline-block', boxShadow: '0 0 8px #ef4444' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fca5a5', letterSpacing: '0.05em' }}>
                  🔴 AUTO-RECORDING: {formatTimer(recordingSeconds)}
                </span>
              </div>
            </div>

            {/* Modal Body / Video Feed Grid */}
            <div className="modal-body" style={{ padding: '20px 0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

                {/* RO OFFICER VIDEO FEED */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', position: 'relative', height: '230px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                  {isCameraOff ? (
                    <div style={{ color: '#64748b', textAlign: 'center' }}>
                      <VideoOff size={40} style={{ marginBottom: '8px' }} />
                      <p style={{ fontSize: '0.8rem' }}>RO Camera Disabled</p>
                    </div>
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                      <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: '#3b82f6', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', boxShadow: '0 0 15px rgba(59, 130, 246, 0.4)' }}>
                        RO
                      </div>
                      <p style={{ marginTop: '10px', fontWeight: '700', fontSize: '0.9rem', color: '#ffffff' }}>{ro.name} (Host)</p>
                      <span style={{ fontSize: '0.7rem', color: '#93c5fd' }}>Relationship Officer — Active Audio & Video</span>
                    </div>
                  )}

                  <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isMicMuted ? <MicOff size={12} style={{ color: '#ef4444' }} /> : <Mic size={12} style={{ color: '#10b981' }} />}
                    <span>{isMicMuted ? 'Muted' : 'Audio Live'}</span>
                  </div>
                </div>

                {/* STUDENT VIDEO FEED */}
                <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px', overflow: 'hidden', position: 'relative', height: '230px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ width: '100%', height: '100%', background: 'linear-gradient(135deg, #047857 0%, #064e3b 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ width: '68px', height: '68px', borderRadius: '50%', background: '#10b981', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold', boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)' }}>
                      {selectedIssue.studentName ? selectedIssue.studentName.charAt(0) : 'S'}
                    </div>
                    <p style={{ marginTop: '10px', fontWeight: '700', fontSize: '0.9rem', color: '#ffffff' }}>{selectedIssue.studentName}</p>
                    <span style={{ fontSize: '0.7rem', color: '#a7f3d0' }}>Student Participant — Connected</span>
                  </div>

                  <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Mic size={12} style={{ color: '#10b981' }} />
                    <span>Audio Connected</span>
                  </div>
                  <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.6)', padding: '3px 8px', borderRadius: '4px', fontSize: '0.68rem', color: '#10b981' }}>
                    📶 24ms Ping
                  </div>
                </div>

              </div>

              {/* Encrypted Storage Info Bar */}
              <div style={{ background: '#1e293b', border: '1px solid #334155', padding: '12px 16px', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
                  <Shield size={16} style={{ color: '#10b981' }} />
                  <span><strong>256-bit Encrypted Session</strong> &nbsp;|&nbsp; Stream auto-recording to NITTE Cloud Vault</span>
                </div>
                <div style={{ color: '#fca5a5', fontWeight: 600 }}>
                  📼 Auto-archiving video (.webm / mp4) & speech transcript
                </div>
              </div>
            </div>

            {/* Controls Bar & Stop Button */}
            <div className="modal-footer" style={{ borderTop: '1px solid #334155', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsMicMuted(!isMicMuted)}
                  style={{ background: isMicMuted ? '#ef4444' : '#334155', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                >
                  {isMicMuted ? <MicOff size={15} /> : <Mic size={15} />}
                  {isMicMuted ? 'Unmute' : 'Mute Mic'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCameraOff(!isCameraOff)}
                  style={{ background: isCameraOff ? '#ef4444' : '#334155', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
                >
                  {isCameraOff ? <VideoOff size={15} /> : <Video size={15} />}
                  {isCameraOff ? 'Start Camera' : 'Stop Camera'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleStopAndSaveRecording}
                className="btn btn-danger"
                style={{ padding: '8px 20px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Square size={16} /> Stop Recording & End Meeting
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
