import React, { useContext, useState } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { Inbox, CheckCircle2, AlertTriangle, Calendar, User, Search, RefreshCw, Send } from 'lucide-react';

export const RODashboard = ({ roId }) => {
  const { db, updateMeetingStatus, resolveIssue, escalateIssue } = useContext(DatabaseContext);
  
  // RO filters
  const [statusFilter, setStatusFilter] = useState('All'); // 'All', 'Assigned to RO', 'Meeting Scheduled', 'Resolved', 'Escalated'
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  
  // Search query
  const [searchQuery, setSearchQuery] = useState('');

  // Modals visibility
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showEscalateModal, setShowEscalateModal] = useState(false);

  // Form states
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [escalationReason, setEscalationReason] = useState('');

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

  const selectedIssue = db.issues.find(i => i.id === selectedIssueId);

  // Meetings assigned to this RO
  const myMeetings = db.meetings.filter(m => m.roId === ro.id);
  const pendingMeetings = myMeetings.filter(m => m.status === 'Pending');

  // Find if selected issue has a meeting scheduled
  const activeMeeting = selectedIssue ? db.meetings.find(m => m.issueId === selectedIssue.id) : null;

  const handleConfirmMeeting = (meetId) => {
    updateMeetingStatus(meetId, 'Confirmed');
  };

  const handleCancelMeeting = (meetId) => {
    updateMeetingStatus(meetId, 'Cancelled');
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

  return (
    <div className="dashboard-layout">
      {/* Sidebar Panel */}
      <div className="glass-card panel-selector">
        {/* RO Header */}
        <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(var(--role-ro-rgb), 0.15)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: 'rgb(252, 211, 77)' }}>
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

          <button className={`panel-btn ${statusFilter === 'Resolved' ? 'active RO' : ''}`} onClick={() => setStatusFilter('Resolved')}>
            <CheckCircle2 size={16} />
            <span>Resolved Tickets ({roIssues.filter(i => i.status === 'Resolved').length})</span>
          </button>

          <button className={`panel-btn ${statusFilter === 'Escalated' ? 'active RO' : ''}`} onClick={() => setStatusFilter('Escalated')}>
            <AlertTriangle size={16} />
            <span>Escalated to Admin ({roIssues.filter(i => i.status === 'Escalated').length})</span>
          </button>
        </div>

        {/* Quick Meetings Panel */}
        {pendingMeetings.length > 0 && (
          <div className="glass-card" style={{ marginTop: 'auto', padding: '16px', background: 'rgba(245,158,11,0.02)', borderLeft: '3px solid var(--accent-amber)', fontSize: '0.8rem' }}>
            <h4 style={{ fontWeight: '600', color: 'var(--accent-amber)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Calendar size={14} /> Pending Bookings ({pendingMeetings.length})
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {pendingMeetings.map(meet => (
                <div key={meet.id} style={{ background: 'rgba(255,255,255,0.03)', padding: '8px', borderRadius: '4px' }}>
                  <p><strong>{meet.studentName}</strong></p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>{meet.date} at {meet.time} ({meet.mode})</p>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <button 
                      onClick={() => handleConfirmMeeting(meet.id)}
                      className="btn btn-success" 
                      style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                    >
                      Confirm
                    </button>
                    <button 
                      onClick={() => handleCancelMeeting(meet.id)}
                      className="btn btn-secondary" 
                      style={{ padding: '2px 8px', fontSize: '0.7rem' }}
                    >
                      Decline
                    </button>
                  </div>
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

              {/* Active Meeting Slot approval */}
              {activeMeeting && (
                <div style={{ border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.02)', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem' }}>
                  <h4 style={{ fontWeight: '600', color: 'var(--accent-amber)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Calendar size={14} /> Scheduled Session Details
                  </h4>
                  <p><strong>Date:</strong> {activeMeeting.date} | <strong>Time:</strong> {activeMeeting.time}</p>
                  <p><strong>Mode:</strong> {activeMeeting.mode} | <strong>Status:</strong> {activeMeeting.status}</p>
                  
                  {activeMeeting.status === 'Pending' && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <button 
                        onClick={() => handleConfirmMeeting(activeMeeting.id)}
                        className="btn btn-success" 
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      >
                        Approve Booking
                      </button>
                      <button 
                        onClick={() => handleCancelMeeting(activeMeeting.id)}
                        className="btn btn-secondary" 
                        style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      >
                        Reschedule / Cancel
                      </button>
                    </div>
                  )}
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

              {/* ACTION BUTTONS IF ACTIVE */}
              {selectedIssue.status !== 'Resolved' && selectedIssue.status !== 'Escalated' && (
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <button 
                    onClick={() => setShowResolveModal(true)}
                    className="btn btn-success" 
                    style={{ flex: 1 }}
                  >
                    Mark as Resolved
                  </button>
                  <button 
                    onClick={() => setShowEscalateModal(true)}
                    className="btn btn-danger" 
                    style={{ flex: 1 }}
                  >
                    Escalate to Admin
                  </button>
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
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Please detail the actions taken to resolve <strong>{selectedIssue?.studentName}'s</strong> issue. This will log in the student history and invite them to rate the support quality.
                </p>
                <div className="form-group">
                  <label className="form-label">Resolution Details / Actions Taken</label>
                  <textarea 
                    className="form-textarea"
                    required
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="e.g. Contacted the finance office, processed the caution deposit refund which will reflect in 3 working days."
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

    </div>
  );
};
