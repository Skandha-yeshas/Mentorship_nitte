import React, { useContext, useState } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { Users, BookOpen, Presentation, Calendar, Plus, ExternalLink, Send, CheckCircle2, UserCheck, FileText, Clock, MapPin, Mail, Edit3, Sparkles, X, AlertCircle, AlertTriangle, SkipForward, RotateCcw, Info } from 'lucide-react';

export const MentorDashboard = ({ mentorId }) => {
  const { 
    db, 
    addResource, 
    addGroupSession, 
    submitMentorSessionRecord, 
    updateMentorSchedule, 
    passMentorSession, 
    unpassMentorSession, 
    shootMentorDeadlineAlert 
  } = useContext(DatabaseContext);
  const [activeTab, setActiveTab] = useState('roster'); // 'roster', 'schedule-session', 'add-resource', 'session-records'
  
  // Mentor form states
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDateTime, setSessionDateTime] = useState('');
  const [sessionDesc, setSessionDesc] = useState('');
  const [sessionLink, setSessionLink] = useState('');

  const [resTitle, setResTitle] = useState('');
  const [resType, setResType] = useState('PDF');
  const [resContent, setResContent] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Mentor session record form states
  const [recordTopic, setRecordTopic] = useState('');
  const [recordDate, setRecordDate] = useState(new Date().toISOString().split('T')[0]);
  const [recordNotes, setRecordNotes] = useState('');
  const [recordCount, setRecordCount] = useState(25);
  const [whichClass, setWhichClass] = useState('6th Sem CSE-A');
  const [recordLocation, setRecordLocation] = useState('Seminar Hall 1 (Admin Block)');

  // Fetch current mentor details
  const mentor = db.users.mentors.find(m => m.id === mentorId) || db.users.mentors[0];

  // Scheduled Mentoring Hour details
  const mentoringSchedule = (db.mentoringSchedules && db.mentoringSchedules[mentor.id]) || {
    mentorId: mentor.id,
    date: '2026-09-25',
    day: 'Friday',
    time: '09:00 AM',
    endTime: '10:00 AM',
    periodSlot: 'Period 1 (09:00 AM - 10:00 AM)',
    whichClass: mentor.class || '6th Sem CSE-A',
    autoEmailAt9: true,
    lastEmailSentAt: null,
    passedSessions: []
  };

  const sessionDate = mentoringSchedule.date || '2026-09-25';
  const isSessionPassed = Boolean(
    mentoringSchedule.isPassed || 
    (mentoringSchedule.passedSessions || []).some(p => p.sessionDate === sessionDate)
  );
  const currentPassedRecord = (mentoringSchedule.passedSessions || []).find(p => p.sessionDate === sessionDate);
  const isReportFiled = (db.mentorSessionRecords || []).some(
    r => r.mentorId === mentor.id && r.sessionDate === sessionDate
  );
  const filedRecord = (db.mentorSessionRecords || []).find(
    r => r.mentorId === mentor.id && r.sessionDate === sessionDate
  );

  // Reschedule Modal state (Only Date & Time)
  const [showEditScheduleModal, setShowEditScheduleModal] = useState(false);
  const [editDate, setEditDate] = useState(mentoringSchedule.date || '2026-09-25');
  const [editPeriodSlot, setEditPeriodSlot] = useState(mentoringSchedule.periodSlot || 'Period 1 (09:00 AM - 10:00 AM)');
  const [editCustomStart, setEditCustomStart] = useState(mentoringSchedule.time || '09:00 AM');
  const [editCustomEnd, setEditCustomEnd] = useState(mentoringSchedule.endTime || '10:00 AM');
  const [isUpdating, setIsUpdating] = useState(false);

  // Pass Session (Holiday / Not Conducted) Modal state
  const [showPassModal, setShowPassModal] = useState(false);
  const [passReason, setPassReason] = useState('Public / Government Holiday');
  const [passRemarks, setPassRemarks] = useState('');

  // Assigned students (mentees)
  const mentees = db.users.students.filter(s => s.mentorId === mentor.id);

  // Mentor's shared sessions & resources
  const mySessions = db.groupSessions.filter(s => s.mentorId === mentor.id);
  const myResources = db.resources.filter(r => r.mentorId === mentor.id);
  const myRecords = (db.mentorSessionRecords || []).filter(r => r.mentorId === mentor.id);

  // Auto-initialize recordCount and whichClass when mentor/mentees load
  React.useEffect(() => {
    if (mentees.length > 0) {
      setRecordCount(mentees.length);
    }
    if (mentor && mentor.class) {
      setWhichClass(mentor.class);
    }
  }, [mentees.length, mentor]);

  // Save rescheduled mentoring period (Date and Time only, mandatory 9:00 AM email)
  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    const periodSlotText = editPeriodSlot === 'Custom' 
      ? `Custom (${editCustomStart} - ${editCustomEnd})`
      : editPeriodSlot;

    const timeText = editPeriodSlot === 'Custom' 
      ? editCustomStart 
      : (editPeriodSlot.match(/\((.*?)\s*-/)?.[1] || '09:00 AM');

    const dayName = new Date(editDate).toLocaleDateString('en-US', { weekday: 'long' });

    const updated = {
      date: editDate,
      day: dayName,
      time: timeText,
      endTime: editCustomEnd,
      periodSlot: periodSlotText,
      whichClass: mentor.class || '6th Sem CSE-A',
      autoEmailAt9: true
    };

    setIsUpdating(true);
    await updateMentorSchedule(mentor.id, updated, true);
    setIsUpdating(false);
    setShowEditScheduleModal(false);
    setSuccessMessage(`Mentoring period rescheduled to ${dayName}, ${editDate} (${periodSlotText})! Mandatory 9:00 AM Gmail alert scheduled.`);
    setTimeout(() => setSuccessMessage(''), 4500);
  };

  // Pass / Waive Session handler
  const handleConfirmPassSession = async (e) => {
    e.preventDefault();
    await passMentorSession(mentor.id, sessionDate, passReason, passRemarks);
    setShowPassModal(false);
    setSuccessMessage(`Session on ${sessionDate} marked as Not Conducted (${passReason}). Next morning 9:00 AM deadline notice waived.`);
    setTimeout(() => setSuccessMessage(''), 4500);
  };

  // Re-activate session if previously passed
  const handleUnpassSession = async () => {
    await unpassMentorSession(mentor.id, sessionDate);
    setSuccessMessage(`Session on ${sessionDate} re-activated. Session report submission is active.`);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  // Test next-morning 9:00 AM deadline reminder
  const handleTestDeadlineNotice = async () => {
    setIsUpdating(true);
    try {
      const res = await shootMentorDeadlineAlert(mentor.id, sessionDate);
      if (res) {
        setSuccessMessage(`Next-morning 9:00 AM deadline alert dispatched in background to ${mentor.email} for unfiled session report (${sessionDate})!`);
      } else {
        setSuccessMessage(`Session report is either already submitted or marked as passed/holiday. No deadline alert needed.`);
      }
      setTimeout(() => setSuccessMessage(''), 4500);
    } catch (e) {
      console.warn('Test deadline alert error:', e);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAddSessionRecord = (e) => {
    e.preventDefault();
    if (!recordTopic || !recordDate || !recordCount) return;

    submitMentorSessionRecord(
      mentor.id, 
      recordTopic, 
      recordDate, 
      parseInt(recordCount), 
      recordNotes,
      whichClass || mentor.class,
      recordLocation
    );
    setSuccessMessage('Weekly mentor session report filed successfully!');
    setRecordTopic('');
    setRecordNotes('');
    setRecordDate(new Date().toISOString().split('T')[0]);
    setRecordCount(mentees.length || 25);
    setRecordLocation('Seminar Hall 1 (Admin Block)');

    setTimeout(() => {
      setSuccessMessage('');
    }, 2500);
  };

  const handleAddSession = (e) => {
    e.preventDefault();
    if (!sessionTitle || !sessionDateTime || !sessionLink) return;

    addGroupSession(mentor.id, sessionTitle, sessionDateTime, sessionDesc, sessionLink);
    setSuccessMessage('Group session scheduled successfully!');
    setSessionTitle('');
    setSessionDateTime('');
    setSessionDesc('');
    setSessionLink('');

    setTimeout(() => {
      setSuccessMessage('');
      setActiveTab('roster');
    }, 2000);
  };

  const handleAddResource = (e) => {
    e.preventDefault();
    if (!resTitle || !resContent) return;

    addResource(mentor.id, resTitle, resType, resContent);
    setSuccessMessage('Educational resource shared with students!');
    setResTitle('');
    setResContent('');

    setTimeout(() => {
      setSuccessMessage('');
      setActiveTab('roster');
    }, 2000);
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar Panel */}
      <div className="glass-card panel-selector">
        {/* Mentor Profile Header */}
        <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(5, 150, 105, 0.1)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: 'var(--accent-emerald)' }}>
              <UserCheck size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>{mentor.name}</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{mentor.dept} Department</p>
            </div>
          </div>
          <div style={{ marginTop: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <strong>Assigned:</strong> {mentor.class}
          </div>
        </div>

        <button 
          className={`panel-btn ${activeTab === 'roster' ? 'active Mentor' : ''}`}
          onClick={() => setActiveTab('roster')}
        >
          <Users size={18} />
          <span>My Mentee Roster ({mentees.length})</span>
        </button>

        <button 
          className={`panel-btn ${activeTab === 'schedule-session' ? 'active Mentor' : ''}`}
          onClick={() => setActiveTab('schedule-session')}
        >
          <Presentation size={18} />
          <span>Schedule Group Session ({mySessions.length})</span>
        </button>

        <button 
          className={`panel-btn ${activeTab === 'add-resource' ? 'active Mentor' : ''}`}
          onClick={() => setActiveTab('add-resource')}
        >
          <BookOpen size={18} />
          <span>Share Resource ({myResources.length})</span>
        </button>

        <button 
          className={`panel-btn ${activeTab === 'session-records' ? 'active Mentor' : ''}`}
          onClick={() => setActiveTab('session-records')}
        >
          <FileText size={18} />
          <span>File Session Report ({myRecords.length})</span>
        </button>

        {/* Informative Alert for Mentors */}
        <div className="glass-card" style={{ marginTop: 'auto', padding: '16px', fontSize: '0.75rem', background: 'rgba(59,130,246,0.02)', borderLeft: '3px solid var(--accent-blue)' }}>
          <p style={{ fontWeight: '600', color: 'rgb(96, 165, 250)', marginBottom: '4px' }}>Role Responsibility Note</p>
          <p style={{ color: 'var(--text-secondary)' }}>
            Mentors provide class-level academic support. Student-specific administrative issues are auto-routed directly to the **Relationship Officer (RO)**.
          </p>
        </div>
      </div>

      {/* Main Content Pane */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* SUCCESS MESSAGE */}
        {successMessage && (
          <div className="glass-card" style={{ borderLeft: '4px solid var(--accent-emerald)', background: 'rgba(16,185,129,0.1)', padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgb(110,231,183)' }}>
              <CheckCircle2 size={20} />
              <span>{successMessage}</span>
            </div>
          </div>
        )}

        {/* SCHEDULED MENTORING HOUR & PERIOD WIDGET */}
        <div style={{
          background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 50%, #f0fdf4 100%)',
          border: '1px solid #bfdbfe',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 4px 15px -3px rgba(37, 99, 235, 0.08), 0 2px 6px -2px rgba(0, 0, 0, 0.04)',
          position: 'relative'
        }}>
          {/* Header Row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: '#dbeafe',
                color: '#1d4ed8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.8)'
              }}>
                <Clock size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800', color: '#1e3a8a', letterSpacing: '-0.01em' }}>
                    Scheduled Mentoring Hour & Period
                  </h3>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: '700',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: '#dcfce7',
                    color: '#15803d',
                    border: '1px solid #bbf7d0',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }}></span>
                    Active Timetable Slot
                  </span>
                </div>
                <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                  Weekly official guidance period for {mentoringSchedule.whichClass || mentor.class} • NAAC Audit compliant
                </p>
              </div>
            </div>

            {/* Action Buttons: Only Change Date & Time */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setEditDate(mentoringSchedule.date || '2026-09-25');
                  setEditPeriodSlot(mentoringSchedule.periodSlot || 'Period 1 (09:00 AM - 10:00 AM)');
                  setShowEditScheduleModal(true);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 14px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: '700',
                  color: '#1e3a8a',
                  background: '#ffffff',
                  border: '1px solid #bfdbfe',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                <Edit3 size={14} />
                <span>Change Date & Time</span>
              </button>
            </div>
          </div>

          {/* Details Grid: Strictly Date, Time, Class, Automated 9 AM status */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            background: '#ffffff',
            borderRadius: '10px',
            padding: '12px 16px',
            border: '1px solid #e2e8f0'
          }}>
            {/* Period Slot */}
            <div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Period / Time
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Clock size={14} color="#2563eb" />
                <span>{mentoringSchedule.periodSlot || mentoringSchedule.time}</span>
              </div>
            </div>

            {/* Date & Day */}
            <div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Day & Date
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Calendar size={14} color="#059669" />
                <span>{mentoringSchedule.day || 'Friday'}, {mentoringSchedule.date}</span>
              </div>
            </div>

            {/* Assigned Class / Student Group */}
            <div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Assigned Class
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: '800', color: '#0f172a', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Users size={14} color="#7c3aed" />
                <span>{mentoringSchedule.whichClass || mentor.class || '6th Sem CSE-A'}</span>
              </div>
            </div>

            {/* Automated Gmail Status */}
            <div>
              <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Gmail 9:00 AM Alert
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#15803d', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Sparkles size={14} color="#16a34a" />
                <span>Mandatory at 9:00 AM ({mentor.email})</span>
              </div>
            </div>
          </div>

          {/* Session Feedback & Holiday / Pass Status Section */}
          <div style={{ marginTop: '12px' }}>
            {isReportFiled ? (
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} color="#16a34a" />
                  <span style={{ fontSize: '0.8rem', color: '#14532d', fontWeight: '600' }}>
                    <strong>Session Report Submitted for {sessionDate}:</strong> Recorded {filedRecord?.studentsAttended || mentees.length} mentees present. Feedback report is verified for institutional audit.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('session-records')}
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    color: '#15803d',
                    background: '#ffffff',
                    border: '1px solid #86efac',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    cursor: 'pointer'
                  }}
                >
                  View Reports Tab
                </button>
              </div>
            ) : isSessionPassed ? (
              <div style={{
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <SkipForward size={16} color="#64748b" />
                  <span style={{ fontSize: '0.8rem', color: '#334155', fontWeight: '600' }}>
                    <strong>Session Marked as Passed / Not Conducted ({currentPassedRecord?.reason || 'Holiday Waiver'}):</strong> Next-morning 9:00 AM feedback deadline notice is waived.
                    {currentPassedRecord?.remarks && <span style={{ fontWeight: '400', color: '#64748b' }}> — Note: {currentPassedRecord.remarks}</span>}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleUnpassSession}
                  title="Re-activate this session to submit the report"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    color: '#475569',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '4px 10px',
                    cursor: 'pointer'
                  }}
                >
                  <RotateCcw size={12} />
                  <span>Re-activate Session</span>
                </button>
              </div>
            ) : (
              <div style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', maxWidth: '780px' }}>
                    <AlertTriangle size={17} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: '800', color: '#92400e' }}>
                        Mentoring Session Feedback Report Pending for {sessionDate}
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#b45309', lineHeight: 1.4 }}>
                        If this session was conducted, please submit the feedback report. Unfilled sessions trigger an automated compliance notice to <strong>{mentor.email}</strong> tomorrow morning at <strong>9:00 AM</strong> with <strong>Deadline: Today!</strong>.
                        If the session was not conducted or was a holiday, you can pass it below to waive the notice.
                      </p>
                    </div>
                  </div>
                  
                  {/* Actions for Pending Session */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setActiveTab('session-records')}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: '700',
                        color: '#ffffff',
                        background: '#d97706',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <FileText size={12} />
                      <span>Submit Report Now</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowPassModal(true)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 10px',
                        borderRadius: '6px',
                        fontSize: '0.74rem',
                        fontWeight: '700',
                        color: '#78350f',
                        background: '#fef3c7',
                        border: '1px solid #fcd34d',
                        cursor: 'pointer'
                      }}
                    >
                      <SkipForward size={12} />
                      <span>Pass (Holiday / Not Conducted)</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleTestDeadlineNotice}
                      disabled={isUpdating}
                      title="Test shooting the next-morning 9:00 AM deadline notice right now"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 9px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        color: '#6b7280',
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        cursor: isUpdating ? 'wait' : 'pointer'
                      }}
                    >
                      <Mail size={11} />
                      <span>Test 9 AM Deadline Notice</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TAB 1: MENTEE ROSTER */}
        {activeTab === 'roster' && (
          <div className="glass-card">
            <h2 className="section-title">Assigned Mentees</h2>
            
            <div className="custom-table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Student ID</th>
                    <th>Email Address</th>
                    <th>Academic Program</th>
                  </tr>
                </thead>
                <tbody>
                  {mentees.map(student => (
                    <tr key={student.id}>
                      <td><strong>{student.name}</strong></td>
                      <td><code>{student.id}</code></td>
                      <td>{student.email}</td>
                      <td>
                        <span style={{ 
                          padding: '4px 10px', 
                          borderRadius: '6px', 
                          background: 'rgba(255, 255, 255, 0.03)',
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)'
                        }}>
                          Semester {student.sem} — {student.branch}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Quick list of upcoming sessions mentor has scheduled */}
            <div style={{ marginTop: '30px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '12px' }}>Your Scheduled Sessions ({mySessions.length})</h3>
              <div className="grid-cols-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                {mySessions.map(session => (
                  <div key={session.id} className="glass-card" style={{ padding: '16px', background: 'rgba(255,255,255,0.01)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: '700' }}>{session.title}</h4>
                      <span className="badge badge-scheduled" style={{ fontSize: '0.65rem' }}>Upcoming</span>
                    </div>
                    <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>📆 {new Date(session.dateTime).toLocaleString()}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', minHeight: '36px' }}>{session.description}</p>
                    <a 
                      href={session.link} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="btn btn-secondary" 
                      style={{ padding: '4px 8px', fontSize: '0.7rem', width: '100%', marginTop: '10px' }}
                    >
                      Launch Session <ExternalLink size={10} />
                    </a>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* TAB 2: SCHEDULE SESSION */}
        {activeTab === 'schedule-session' && (
          <div className="glass-card">
            <h2 className="section-title">Schedule a Class Support Session</h2>
            <form onSubmit={handleAddSession}>
              <div className="form-group">
                <label className="form-label">Session Topic / Title</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Final Year Project Guidelines & Industry Alignment"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid-cols-4" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '0' }}>
                <div className="form-group">
                  <label className="form-label">Date & Time</label>
                  <input 
                    type="datetime-local" 
                    className="form-control" 
                    value={sessionDateTime}
                    onChange={(e) => setSessionDateTime(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Meeting URL (Google Meet, Teams, etc.)</label>
                  <input 
                    type="url" 
                    className="form-control" 
                    placeholder="https://meet.google.com/..."
                    value={sessionLink}
                    onChange={(e) => setSessionLink(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Session Agenda / Focus Details</label>
                <textarea 
                  className="form-textarea"
                  value={sessionDesc}
                  onChange={(e) => setSessionDesc(e.target.value)}
                  placeholder="Outline the topics to be covered and any preparation students need..."
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary">
                <Plus size={16} /> Publish Session Notification
              </button>
            </form>
          </div>
        )}

        {/* TAB 3: ADD RESOURCE */}
        {activeTab === 'add-resource' && (
          <div className="glass-card">
            <h2 className="section-title">Share Reference Resource</h2>
            <form onSubmit={handleAddResource}>
              <div className="grid-cols-4" style={{ gridTemplateColumns: '3fr 1fr', gap: '16px', marginBottom: '0' }}>
                <div className="form-group">
                  <label className="form-label">Resource Title</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g., Software Engineering Course Guidelines & Notes"
                    value={resTitle}
                    onChange={(e) => setResTitle(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select 
                    className="form-select"
                    value={resType}
                    onChange={(e) => setResType(e.target.value)}
                  >
                    <option value="PDF">📄 PDF Document</option>
                    <option value="Link">🔗 Web URL / Portal</option>
                    <option value="Note">📝 Text Note / Tip</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Resource Content (URL or Notes text)</label>
                {resType === 'Note' ? (
                  <textarea 
                    className="form-textarea" 
                    value={resContent}
                    onChange={(e) => setResContent(e.target.value)}
                    placeholder="Enter the textual note or tips here..."
                    required
                  />
                ) : (
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder={resType === 'Link' ? "https://..." : "Document description or download url..."}
                    value={resContent}
                    onChange={(e) => setResContent(e.target.value)}
                    required
                  />
                )}
              </div>

              <button type="submit" className="btn btn-primary">
                <Send size={16} /> Share Resource with Mentees
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: FILE SESSION REPORT */}
        {activeTab === 'session-records' && (
          <div className="glass-card">
            <h2 className="section-title">Log Mentoring Session Report</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              File your weekly mentoring report capturing all 6 required flowchart parameters for institutional audit compliance.
            </p>

            {/* EXPLICIT FRIDAY SUBMISSION DEADLINE NOTICE */}
            <div style={{ borderLeft: '4px solid var(--accent-amber)', background: 'rgba(217, 119, 6, 0.08)', padding: '14px 16px', borderRadius: '8px', marginBottom: '24px' }}>
              <h4 style={{ fontWeight: '800', color: 'var(--accent-amber)', marginBottom: '4px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                🗓️ Friday Weekly Report Submission Deadline Notice
              </h4>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                Faculty Mentors are required to file this Session Report by <strong>Every Friday before 5:00 PM</strong> to comply with institutional NAAC & Academic Audit standards. Submitted reports are synchronized live and instantly accessible on the <strong>Management / Admin Dashboard</strong>.
              </p>
            </div>
            
            <form onSubmit={handleAddSessionRecord} style={{ marginBottom: '36px' }}>
              {/* FLOWCHART FIELD 1 & FIELD 2 */}
              <div className="grid-cols-4" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
                <div className="form-group">
                  <label className="form-label">1) Which Class / Cohort</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. 6th Sem CSE-A"
                    value={whichClass}
                    onChange={(e) => setWhichClass(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">2) Date Conducted</label>
                  <input 
                    type="date" 
                    className="form-control" 
                    value={recordDate}
                    onChange={(e) => setRecordDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* FLOWCHART FIELD 3 & FIELD 4 */}
              <div className="grid-cols-4" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '14px' }}>
                <div className="form-group">
                  <label className="form-label">3) Where / Venue Location</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Seminar Hall 1, Classroom 304, or Online (Google Meet)"
                    value={recordLocation}
                    onChange={(e) => setRecordLocation(e.target.value)}
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">4) Attendance Count (Mentees Attended)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    min="1"
                    max="100"
                    value={recordCount}
                    onChange={(e) => setRecordCount(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* FLOWCHART FIELD 5 */}
              <div className="form-group">
                <label className="form-label">5) Topic Covered</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="e.g. Supplementary exam prep, attendance recovery, and career guidance"
                  value={recordTopic}
                  onChange={(e) => setRecordTopic(e.target.value)}
                  required
                />
              </div>

              {/* FLOWCHART FIELD 6 */}
              <div className="form-group">
                <label className="form-label">6) Summary Notes & Action Plan</label>
                <textarea 
                  className="form-textarea"
                  style={{ minHeight: '85px' }}
                  value={recordNotes}
                  onChange={(e) => setRecordNotes(e.target.value)}
                  placeholder="Detail the discussion points, key student concerns, action items assigned, and follow-up plan..."
                  required
                />
              </div>

              <button type="submit" className="btn btn-success" style={{ width: '100%', padding: '10px' }}>
                <Send size={16} /> File Official Session Report
              </button>
            </form>

            <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '14px' }}>Historical Session Report Logs ({myRecords.length})</h3>
            
            {myRecords.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                <p>No session reports filed yet.</p>
              </div>
            ) : (
              <div className="custom-table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Date Conducted</th>
                      <th>Which Class</th>
                      <th>Where / Location</th>
                      <th>Attendance</th>
                      <th>Topic Covered</th>
                      <th>Summary Notes & Action Plan</th>
                      <th>Filed Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRecords.map((rec, idx) => (
                      <tr key={idx}>
                        <td><strong>{new Date(rec.sessionDate).toLocaleDateString()}</strong></td>
                        <td><span className="badge badge-scheduled" style={{ fontSize: '0.72rem' }}>{rec.whichClass || mentor.class || '6th Sem CSE'}</span></td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>📍 {rec.location || 'Seminar Hall 1'}</td>
                        <td>
                          <span style={{ 
                            padding: '2px 8px', 
                            borderRadius: '10px', 
                            background: 'rgba(99, 102, 241, 0.15)',
                            color: 'rgb(129, 140, 248)',
                            fontSize: '0.8rem',
                            fontWeight: '600'
                          }}>
                            {rec.studentsAttended} Students
                          </span>
                        </td>
                        <td style={{ fontWeight: '600', fontSize: '0.82rem' }}>{rec.topic}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '250px' }}>
                          {rec.notes}
                        </td>
                        <td style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {new Date(rec.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* RESCHEDULE MENTORING PERIOD MODAL */}
      {showEditScheduleModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '540px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #bfdbfe',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Clock size={20} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800' }}>
                  Reschedule Mentoring Hour Period
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEditScheduleModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveSchedule} style={{ padding: '20px' }}>
              {/* Mandatory 9:00 AM Dispatch notice banner */}
              <div style={{
                background: '#eff6ff',
                border: '1px solid #bfdbfe',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}>
                <Mail size={18} color="#2563eb" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.8rem', color: '#1e3a8a', lineHeight: 1.5 }}>
                  <strong>Mandatory 9:00 AM Gmail Dispatch:</strong> On the scheduled date at 9:00 AM, the system automatically dispatches an official notification email to your faculty inbox (<code>{mentor.email}</code>) and your assigned mentees. This dispatch is mandatory under mentoring protocol.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
                {/* Date Picker */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Mentoring Date
                  </label>
                  <input
                    type="date"
                    className="form-control"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                    style={{ fontSize: '0.85rem' }}
                  />
                </div>

                {/* Period Slot Selector */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                    Period / Time Slot
                  </label>
                  <select
                    className="form-select"
                    value={editPeriodSlot}
                    onChange={(e) => setEditPeriodSlot(e.target.value)}
                    style={{ fontSize: '0.85rem' }}
                  >
                    <option value="Period 1 (09:00 AM - 10:00 AM)">Period 1 (09:00 AM - 10:00 AM)</option>
                    <option value="Period 2 (10:15 AM - 11:15 AM)">Period 2 (10:15 AM - 11:15 AM)</option>
                    <option value="Period 3 (11:30 AM - 12:30 PM)">Period 3 (11:30 AM - 12:30 PM)</option>
                    <option value="Period 4 (02:00 PM - 03:00 PM)">Period 4 (02:00 PM - 03:00 PM)</option>
                    <option value="Period 5 (03:15 PM - 04:15 PM)">Period 5 (03:15 PM - 04:15 PM)</option>
                    <option value="Custom">Custom Time Slot</option>
                  </select>
                </div>
              </div>

              {/* Custom Time inputs if custom selected */}
              {editPeriodSlot === 'Custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                      Start Time
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. 09:30 AM"
                      value={editCustomStart}
                      onChange={(e) => setEditCustomStart(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#334155', marginBottom: '4px' }}>
                      End Time
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. 10:30 AM"
                      value={editCustomEnd}
                      onChange={(e) => setEditCustomEnd(e.target.value)}
                      required
                    />
                  </div>
                </div>
              )}

              {/* Modal Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowEditScheduleModal(false)}
                  style={{ padding: '8px 16px', fontSize: '0.82rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="btn btn-primary"
                  style={{
                    padding: '8px 18px',
                    fontSize: '0.82rem',
                    background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)',
                    border: 'none',
                    fontWeight: '700'
                  }}
                >
                  {isUpdating ? 'Saving Schedule...' : 'Save & Update Period'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PASS SESSION (HOLIDAY / NOT CONDUCTED) MODAL */}
      {showPassModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <SkipForward size={20} />
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '800' }}>
                  Pass Mentoring Session (Holiday / Not Conducted)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPassModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ffffff',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleConfirmPassSession} style={{ padding: '20px' }}>
              <div style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px'
              }}>
                <Info size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.8rem', color: '#92400e', lineHeight: 1.45 }}>
                  Passing this session marks it as officially not conducted for <strong>{sessionDate}</strong>. The automated next-morning 9:00 AM compliance notice will be waived for this date.
                </div>
              </div>

              {/* Scheduled Date (Display Only) */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Session Date to Pass
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={`${sessionDate} (${mentoringSchedule.periodSlot || mentoringSchedule.time})`}
                  disabled
                  style={{ fontSize: '0.85rem', background: '#f8fafc', color: '#64748b' }}
                />
              </div>

              {/* Pass Reason Selector */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Reason for Passing Session <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <select
                  className="form-select"
                  value={passReason}
                  onChange={(e) => setPassReason(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                  required
                >
                  <option value="Public / Government Holiday">Public / Government Holiday</option>
                  <option value="University / Internal Examination Day">University / Internal Examination Day</option>
                  <option value="College Fest / Institutional Event">College Fest / Institutional Event</option>
                  <option value="Faculty On-Duty Leave">Faculty On-Duty Leave</option>
                  <option value="Academic Timetable Adjustment">Academic Timetable Adjustment</option>
                  <option value="Other Institutional Reason">Other Institutional Reason</option>
                </select>
              </div>

              {/* Optional Remarks */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: '#334155', marginBottom: '6px' }}>
                  Remarks / Justification (Optional)
                </label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="e.g. Gandhi Jayanti public holiday observed; classes suspended."
                  value={passRemarks}
                  onChange={(e) => setPassRemarks(e.target.value)}
                  style={{ fontSize: '0.85rem' }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowPassModal(false)}
                  style={{ padding: '8px 16px', fontSize: '0.82rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{
                    padding: '8px 18px',
                    fontSize: '0.82rem',
                    background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)',
                    border: 'none',
                    fontWeight: '700'
                  }}
                >
                  Confirm Pass / Waive Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
