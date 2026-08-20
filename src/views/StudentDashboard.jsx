import React, { useContext, useState } from 'react';
import { DatabaseContext, ALL_CATEGORIES } from '../context/DatabaseContext';
import { AlertCircle, Calendar, FileText, CheckCircle2, Clock, Send, Star, ExternalLink, User, RotateCcw } from 'lucide-react';

export const StudentDashboard = ({ studentId }) => {
  const { db, submitIssue, submitFeedback, reopenIssue, isDemoLimitBypassed, toggleDemoLimitBypass } = useContext(DatabaseContext);
  
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

  // Issues raised by this student (handles studentId and student_id safely and deduplicates by ID)
  const rawMyIssues = db.issues.filter(i => (i.studentId || i.student_id || '').toLowerCase() === student.id.toLowerCase());
  const myIssues = Array.from(new Map(rawMyIssues.map(i => [i.id, i])).values());
  const selectedIssue = db.issues.find(i => i.id === selectedIssueId);

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

  const handleSubmitIssue = async (e) => {
    e.preventDefault();
    if (!description.trim()) return;
    setErrorMessage('');

    if (isFormLocked) {
      setErrorMessage(`Weekly Limit Reached (2 / 2 Issues Used): Students can submit up to 2 issues per 7 days. Your next issue slot opens in ${cooldownDays > 0 ? `${cooldownDays}d ${cooldownHours}h` : `${cooldownHours}h ${cooldownMinutes}m`}. (Turn on Demo Mode in header to bypass)`);
      return;
    }

    try {
      const newIssueId = await submitIssue(student.id, category, description, priority);
      setSuccessMessage(`Issue successfully submitted! Ticket ID: ${newIssueId}`);
      setDescription('');
      setCategory(ALL_CATEGORIES[0]);
      setPriority('Medium');
      
      setTimeout(() => {
        setSuccessMessage('');
        setActiveTab('my-issues');
        setSelectedIssueId(newIssueId);
      }, 2000);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to submit issue');
    }
  };

  const handleFeedbackSubmit = (e) => {
    e.preventDefault();
    if (!selectedIssueId) return;
    submitFeedback(selectedIssueId, rating, feedbackComments);
    setFeedbackComments('');
  };

  const handleReopenSubmit = (e) => {
    e.preventDefault();
    if (!selectedIssueId) return;

    reopenIssue(selectedIssueId, student.id, reopenReason);
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
                  const isSelected = selectedIssueId === issue.id;

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

                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>Issue Description:</h4>
                  <p style={{ fontSize: '0.9rem', background: 'rgba(0,0,0,0.15)', padding: '12px', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                    {selectedIssue.description}
                  </p>
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

                    {db.meetings.some(m => m.issueId === selectedIssue.id) ? (
                      <div>
                        {db.meetings.filter(m => m.issueId === selectedIssue.id).map(meet => (
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
    </div>
  );
};
