import React, { useContext, useState } from 'react';
import { DatabaseContext, ALL_CATEGORIES } from '../context/DatabaseContext';
import { AlertCircle, Calendar, FileText, CheckCircle2, Clock, Send, Star, ExternalLink, User } from 'lucide-react';

export const StudentDashboard = ({ studentId }) => {
  const { db, submitIssue, bookMeeting, submitFeedback } = useContext(DatabaseContext);
  
  // Tabs within Student Dashboard
  const [activeTab, setActiveTab] = useState('raise-issue'); // 'raise-issue', 'my-issues', 'mentor-hub'
  const [selectedIssueId, setSelectedIssueId] = useState(null);

  // Form states
  const [category, setCategory] = useState(ALL_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [successMessage, setSuccessMessage] = useState('');

  // Meeting form states
  const [meetDate, setMeetDate] = useState('');
  const [meetTime, setMeetTime] = useState('');
  const [meetMode, setMeetMode] = useState('Offline');

  // Rating state
  const [rating, setRating] = useState(5);
  const [feedbackComments, setFeedbackComments] = useState('');

  // Fetch current student profile & assigned RO
  const student = db.users.students.find(s => s.id === studentId) || db.users.students[0];
  const myRO = db.users.ros.find(r => r.id === student.roId);
  const myMentor = db.users.mentors.find(m => m.id === student.mentorId);

  // Issues raised by this student
  const myIssues = db.issues.filter(i => i.studentId === student.id);
  const selectedIssue = db.issues.find(i => i.id === selectedIssueId);

  // Resources and sessions from their mentor
  const myResources = db.resources.filter(r => r.mentorId === student.mentorId);
  const mySessions = db.groupSessions.filter(s => s.mentorId === student.mentorId);

  const handleSubmitIssue = (e) => {
    e.preventDefault();
    if (!description.trim()) return;

    const newIssueId = submitIssue(student.id, category, description, priority);
    setSuccessMessage(`Issue successfully submitted! Ticket ID: ${newIssueId}`);
    setDescription('');
    setCategory(ALL_CATEGORIES[0]);
    setPriority('Medium');
    
    // Switch to view list
    setTimeout(() => {
      setSuccessMessage('');
      setActiveTab('my-issues');
      setSelectedIssueId(newIssueId);
    }, 2000);
  };

  const handleBookMeeting = (e) => {
    e.preventDefault();
    if (!meetDate || !meetTime || !selectedIssueId) return;

    bookMeeting(selectedIssueId, student.id, meetDate, meetTime, meetMode);
    setMeetDate('');
    setMeetTime('');
  };

  const handleFeedbackSubmit = (e) => {
    e.preventDefault();
    if (!selectedIssueId) return;
    submitFeedback(selectedIssueId, rating, feedbackComments);
    setFeedbackComments('');
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar Panel */}
      <div className="glass-card panel-selector">
        {/* Student Profile Card */}
        <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(var(--role-student-rgb), 0.15)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: 'rgb(167, 139, 250)' }}>
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

        {/* RO assigned details card */}
        {myRO && (
          <div className="glass-card" style={{ marginTop: 'auto', padding: '16px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.01)' }}>
            <h4 style={{ color: 'var(--accent-amber)', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={14} /> Assigned support officer (RO)
            </h4>
            <p style={{ fontWeight: '600' }}>{myRO.name}</p>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{myRO.email}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '4px' }}>Scope: {myRO.region}</p>
          </div>
        )}
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

        {/* TAB 1: RAISE ISSUE */}
        {activeTab === 'raise-issue' && (
          <div className="glass-card">
            <h2 className="section-title">Raise an Issue / Support Request</h2>
            <form onSubmit={handleSubmitIssue}>
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
                    value={myRO ? `${myRO.name} (${myRO.region})` : 'System Auto-routing'} 
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Describe your issue in detail</label>
                <textarea 
                  className="form-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Provide registration numbers, courses, hostel block room numbers, or any administrative detail to help resolve this quickly..."
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary">
                <Send size={16} /> Submit Support Request
              </button>
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

                {/* MEETING BOOKING FORM OR CONFIRMED DETAILS */}
                {selectedIssue.status !== 'Resolved' && (
                  <div style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '8px', marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '0.9rem', fontWeight: '600', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={15} /> Book a Session with your RO
                    </h4>

                    {/* Find if a meeting already exists for this issue */}
                    {db.meetings.some(m => m.issueId === selectedIssue.id) ? (
                      <div>
                        {db.meetings.filter(m => m.issueId === selectedIssue.id).map(meet => (
                          <div key={meet.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                            <div>
                              <p style={{ fontSize: '0.85rem', fontWeight: '600' }}>Slot: {meet.date} at {meet.time}</p>
                              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Mode: {meet.mode}</p>
                            </div>
                            <span style={{ 
                              fontSize: '0.75rem', 
                              padding: '2px 8px', 
                              borderRadius: '4px', 
                              background: meet.status === 'Confirmed' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                              color: meet.status === 'Confirmed' ? '#34d399' : '#fbbf24'
                            }}>{meet.status}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <form onSubmit={handleBookMeeting}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                          <div>
                            <label className="form-label">Date</label>
                            <input 
                              type="date" 
                              required 
                              className="form-control" 
                              style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                              value={meetDate}
                              onChange={(e) => setMeetDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="form-label">Time Slot</label>
                            <input 
                              type="time" 
                              required 
                              className="form-control" 
                              style={{ padding: '6px 10px', fontSize: '0.8rem' }}
                              value={meetTime}
                              onChange={(e) => setMeetTime(e.target.value)}
                            />
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', gap: '12px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                              <input type="radio" name="mode" value="Offline" checked={meetMode === 'Offline'} onChange={() => setMeetMode('Offline')} /> Offline
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                              <input type="radio" name="mode" value="Online" checked={meetMode === 'Online'} onChange={() => setMeetMode('Online')} /> Online (Meet)
                            </label>
                          </div>
                          <button type="submit" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                            Submit Slot Request
                          </button>
                        </div>
                      </form>
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
