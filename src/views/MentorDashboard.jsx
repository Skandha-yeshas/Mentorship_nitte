import React, { useContext, useState } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { Users, BookOpen, Presentation, Calendar, Plus, ExternalLink, Send, CheckCircle2, UserCheck } from 'lucide-react';

export const MentorDashboard = ({ mentorId }) => {
  const { db, addResource, addGroupSession } = useContext(DatabaseContext);
  const [activeTab, setActiveTab] = useState('roster'); // 'roster', 'schedule-session', 'add-resource'
  
  // Mentor form states
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDateTime, setSessionDateTime] = useState('');
  const [sessionDesc, setSessionDesc] = useState('');
  const [sessionLink, setSessionLink] = useState('');

  const [resTitle, setResTitle] = useState('');
  const [resType, setResType] = useState('PDF');
  const [resContent, setResContent] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch current mentor details
  const mentor = db.users.mentors.find(m => m.id === mentorId) || db.users.mentors[0];

  // Assigned students (mentees)
  const mentees = db.users.students.filter(s => s.mentorId === mentor.id);

  // Mentor's shared sessions & resources
  const mySessions = db.groupSessions.filter(s => s.mentorId === mentor.id);
  const myResources = db.resources.filter(r => r.mentorId === mentor.id);

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
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(var(--role-mentor-rgb), 0.15)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: 'rgb(110, 231, 183)' }}>
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

        {/* TAB 1: MENTEE ROSTER */}
        {activeTab === 'roster' && (
          <div className="glass-card">
            <h2 className="section-title">Assigned Mentees & Issue Status</h2>
            
            <div className="custom-table-container">
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>ID</th>
                    <th>Email Address</th>
                    <th>Active Issues</th>
                    <th>Last Issue Category</th>
                    <th>Status Badge</th>
                  </tr>
                </thead>
                <tbody>
                  {mentees.map(student => {
                    // Check if this student has active issues
                    const studentIssues = db.issues.filter(i => i.studentId === student.id);
                    const activeIssues = studentIssues.filter(i => i.status !== 'Resolved');
                    const lastIssue = studentIssues[0]; // issues are sorted newest first

                    return (
                      <tr key={student.id}>
                        <td>
                          <strong>{student.name}</strong>
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Sem {student.sem} | {student.branch}</div>
                        </td>
                        <td><code>{student.id}</code></td>
                        <td>{student.email}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ 
                            padding: '2px 8px', 
                            borderRadius: '10px', 
                            fontSize: '0.8rem',
                            fontWeight: '700',
                            background: activeIssues.length > 0 ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)',
                            color: activeIssues.length > 0 ? '#f43f5e' : '#10b981'
                          }}>
                            {activeIssues.length}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {lastIssue ? lastIssue.category.split(' - ')[1] : 'No issues reported'}
                        </td>
                        <td>
                          {lastIssue ? (
                            <span className={`badge badge-${lastIssue.status.toLowerCase().replace(' ', '-')}`}>
                              {lastIssue.status}
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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

      </div>
    </div>
  );
};
