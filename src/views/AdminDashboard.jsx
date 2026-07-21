import React, { useContext, useState } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { BarChart, DonutChart } from '../components/CustomChart';
import { Shield, Users, Ticket, CheckCircle2, AlertTriangle, Star, ShieldAlert, Download, RefreshCw } from 'lucide-react';

export const AdminDashboard = () => {
  const { db, adminResolveIssue, reassignIssue } = useContext(DatabaseContext);
  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics', 'escalations', 'audit-logs'
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  
  // Modal state
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Reassign state
  const [targetRoId, setTargetRoId] = useState('');

  // 1. STATS CALCULATION
  const totalIssues = db.issues.length;
  const resolvedIssues = db.issues.filter(i => i.status === 'Resolved').length;
  const escalatedIssues = db.issues.filter(i => i.status === 'Escalated').length;
  const activeIssues = totalIssues - resolvedIssues;
  
  const resolutionRate = totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 0;

  // Calculate Average Student Satisfaction
  const ratedIssues = db.issues.filter(i => i.feedback && i.feedback.rating);
  const averageSatisfaction = ratedIssues.length > 0 
    ? (ratedIssues.reduce((sum, i) => sum + i.feedback.rating, 0) / ratedIssues.length).toFixed(1)
    : 'N/A';

  // 2. CHART DATA PREPARATION
  // Status Distribution
  const statusData = [
    { name: 'Resolved', value: db.issues.filter(i => i.status === 'Resolved').length },
    { name: 'Escalated', value: db.issues.filter(i => i.status === 'Escalated').length },
    { name: 'Scheduled', value: db.issues.filter(i => i.status === 'Meeting Scheduled').length },
    { name: 'Assigned/New', value: db.issues.filter(i => i.status === 'Assigned to RO' || i.status === 'Submitted').length }
  ];

  // Category Distribution
  const categories = ['Academic', 'Hostels', 'Financial', 'Exams', 'Facilities', 'Personal'];
  const categoryData = categories.map(cat => ({
    name: cat,
    value: db.issues.filter(i => i.category.startsWith(cat)).length
  }));

  // Escalated Issues list
  const escalations = db.issues.filter(i => i.status === 'Escalated');
  const selectedIssue = db.issues.find(i => i.id === selectedIssueId);

  const handleResolveSubmit = (e) => {
    e.preventDefault();
    if (!resolutionNotes.trim() || !selectedIssueId) return;

    adminResolveIssue(selectedIssueId, resolutionNotes);
    setResolutionNotes('');
    setShowResolveModal(false);
    setSelectedIssueId(null);
  };

  const handleReassign = (roId) => {
    if (!roId || !selectedIssueId) return;
    reassignIssue(selectedIssueId, roId);
    setTargetRoId('');
  };

  // MOCK CSV DOWNLOAD GENERATOR (Wow factor!)
  const handleDownloadReport = (reportType) => {
    let csvContent = 'data:text/csv;charset=utf-8,';
    
    if (reportType === 'daily') {
      csvContent += 'Date,Total Issues Raised,Resolved Issues,Escalated Issues,Avg Satisfaction\n';
      csvContent += `${new Date().toLocaleDateString()},${totalIssues},${resolvedIssues},${escalatedIssues},${averageSatisfaction}\n`;
    } else {
      csvContent += 'Ticket ID,Student Name,Category,Priority,Status,Created At,Resolved At,Satisfaction\n';
      db.issues.forEach(i => {
        const satisfaction = i.feedback ? i.feedback.rating : 'N/A';
        const resolved = i.resolvedAt ? new Date(i.resolvedAt).toLocaleDateString() : 'N/A';
        csvContent += `"${i.id}","${i.studentName}","${i.category}","${i.priority}","${i.status}","${new Date(i.createdAt).toLocaleDateString()}","${resolved}","${satisfaction}"\n`;
      });
    }

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nitte_support_report_${reportType}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="dashboard-layout">
      {/* Sidebar Panel */}
      <div className="glass-card panel-selector">
        {/* Admin Header */}
        <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(var(--role-admin-rgb), 0.15)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: 'rgb(253, 164, 175)' }}>
              <Shield size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>Admin Office</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Principal Dashboard</p>
            </div>
          </div>
        </div>

        <button 
          className={`panel-btn ${activeTab === 'analytics' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <Ticket size={18} />
          <span>Real-time Analytics</span>
        </button>

        <button 
          className={`panel-btn ${activeTab === 'escalations' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('escalations')}
        >
          <ShieldAlert size={18} />
          <span>Escalations Queue ({escalations.length})</span>
        </button>

        <button 
          className={`panel-btn ${activeTab === 'audit-logs' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('audit-logs')}
        >
          <Users size={18} />
          <span>System Audit Trail ({db.systemLogs.length})</span>
        </button>

        {/* Action Panel for PDF/CSV downloads */}
        <div className="glass-card" style={{ marginTop: 'auto', padding: '16px', background: 'rgba(255,255,255,0.01)' }}>
          <h4 style={{ fontSize: '0.8rem', fontWeight: '600', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={14} /> Export Report Summary
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button onClick={() => handleDownloadReport('daily')} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem', justifyContent: 'flex-start' }}>
              Download Daily Metrics CSV
            </button>
            <button onClick={() => handleDownloadReport('full')} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem', justifyContent: 'flex-start' }}>
              Export Full Tickets CSV
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Pane */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* STATS RIBBON CARDS */}
        <div className="grid-cols-4">
          <div className="glass-card stat-card Admin">
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Total Registered Issues</span>
              <div className="stat-value">{totalIssues}</div>
            </div>
            <div className="stat-icon"><Ticket size={24} /></div>
          </div>
          
          <div className="glass-card stat-card Admin">
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>SLA Resolution Rate</span>
              <div className="stat-value">{resolutionRate}%</div>
            </div>
            <div className="stat-icon"><CheckCircle2 size={24} style={{ color: 'var(--accent-emerald)' }} /></div>
          </div>

          <div className="glass-card stat-card Admin">
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Active Escalations</span>
              <div className="stat-value" style={{ color: escalatedIssues > 0 ? 'var(--accent-rose)' : 'inherit' }}>{escalatedIssues}</div>
            </div>
            <div className="stat-icon"><AlertTriangle size={24} style={{ color: escalatedIssues > 0 ? 'var(--accent-rose)' : 'inherit' }} /></div>
          </div>

          <div className="glass-card stat-card Admin">
            <div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Avg Student Satisfaction</span>
              <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {averageSatisfaction} <Star size={20} fill={averageSatisfaction !== 'N/A' ? 'var(--accent-amber)' : 'none'} stroke="var(--accent-amber)" />
              </div>
            </div>
            <div className="stat-icon"><Star size={24} style={{ color: 'var(--accent-amber)' }} /></div>
          </div>
        </div>

        {/* TAB 1: ANALYTICS */}
        {activeTab === 'analytics' && (
          <div className="charts-grid">
            {/* Status Distribution */}
            <DonutChart data={statusData} title="Issue Resolution Status Distribution" />
            {/* Category Distribution */}
            <BarChart data={categoryData} title="Registered Issues by Primary Domain" />
          </div>
        )}

        {/* TAB 2: ESCALATIONS QUEUE */}
        {activeTab === 'escalations' && (
          <div style={{ display: 'grid', gridTemplateColumns: escalations.length > 0 ? '1fr 1fr' : '1fr', gap: '20px' }}>
            
            {/* Escalations List */}
            <div className="glass-card">
              <h2 className="section-title">Critical Escalations ({escalations.length})</h2>

              {escalations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <CheckCircle2 size={48} style={{ marginBottom: '12px', opacity: 0.5, color: 'var(--accent-emerald)' }} />
                  <p>Hooray! No pending escalations. All issues resolved within SLA.</p>
                </div>
              ) : (
                escalations.map(issue => (
                  <div
                    key={issue.id}
                    onClick={() => setSelectedIssueId(issue.id)}
                    className="glass-card issue-card High"
                    style={{
                      background: selectedIssueId === issue.id ? 'rgba(255,255,255,0.06)' : '',
                      borderColor: selectedIssueId === issue.id ? 'var(--accent-rose)' : ''
                    }}
                  >
                    <div className="issue-card-header">
                      <div>
                        <strong style={{ fontSize: '0.95rem' }}>{issue.category}</strong>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Escalated from RO: <strong>{db.users.ros.find(r => r.id === issue.roId)?.name || 'RO'}</strong>
                        </div>
                      </div>
                      <span className="badge badge-escalated">Escalated</span>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {issue.description}
                    </p>
                    <div className="issue-meta">
                      <span>Student: <strong>{issue.studentName}</strong> ({issue.studentId})</span>
                      <span>Level: {issue.priority}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Escalation Control Details */}
            {selectedIssue && (
              <div className="glass-card" style={{ position: 'sticky', top: '90px' }}>
                <h3 className="section-title" style={{ color: 'var(--accent-rose)' }}>Escalation Control</h3>
                
                <div style={{ marginBottom: '16px', fontSize: '0.85rem' }}>
                  <p><strong>Ticket ID:</strong> {selectedIssue.id}</p>
                  <p><strong>Category:</strong> {selectedIssue.category}</p>
                  <p><strong>Student:</strong> {selectedIssue.studentName} ({selectedIssue.studentId})</p>
                  <p><strong>Created On:</strong> {new Date(selectedIssue.createdAt).toLocaleString()}</p>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '4px' }}>Issue description:</h4>
                  <p style={{ fontSize: '0.85rem', background: 'rgba(0,0,0,0.15)', padding: '10px', borderRadius: '6px' }}>
                    {selectedIssue.description}
                  </p>
                </div>

                {/* Last action log detailing why it was escalated */}
                <div style={{ marginBottom: '20px', borderLeft: '3px solid var(--accent-rose)', background: 'rgba(244,63,94,0.05)', padding: '10px', borderRadius: '4px' }}>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: '700', color: 'rgb(253,164,175)', marginBottom: '4px' }}>Reason for Escalation (from RO Logs):</h4>
                  <p style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
                    {selectedIssue.logs[selectedIssue.logs.length - 1]?.text || 'No logs found'}
                  </p>
                </div>

                {/* Overriding Administrative Actions */}
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '4px' }}>Administrative Override Actions:</h4>
                  
                  {/* Action 1: Override and Resolve */}
                  <button onClick={() => setShowResolveModal(true)} className="btn btn-success" style={{ width: '100%' }}>
                    Override & Mark as Resolved
                  </button>
                  
                  {/* Action 2: Reassign to another RO */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                    <select
                      className="form-select"
                      style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                      value={targetRoId}
                      onChange={(e) => setTargetRoId(e.target.value)}
                    >
                      <option value="">-- Reassign RO --</option>
                      {db.users.ros.filter(r => r.id !== selectedIssue.roId).map(ro => (
                        <option key={ro.id} value={ro.id}>{ro.name}</option>
                      ))}
                    </select>
                    <button 
                      onClick={() => handleReassign(targetRoId)}
                      disabled={!targetRoId}
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                    >
                      Apply Reassignment
                    </button>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

        {/* TAB 3: SYSTEM AUDIT TRAIL */}
        {activeTab === 'audit-logs' && (
          <div className="glass-card">
            <h2 className="section-title">Central Activity & Audit Log</h2>
            
            <div className="custom-table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User Role</th>
                    <th>User ID</th>
                    <th>Activity Log Message</th>
                  </tr>
                </thead>
                <tbody>
                  {db.systemLogs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td>
                        <span style={{
                          fontSize: '0.7rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: '600',
                          background: log.userRole === 'Admin' ? 'rgba(244,63,94,0.15)' : log.userRole === 'RO' ? 'rgba(245,158,11,0.15)' : 'rgba(139,92,246,0.15)',
                          color: log.userRole === 'Admin' ? '#fca5a5' : log.userRole === 'RO' ? '#fbbf24' : '#c084fc'
                        }}>
                          {log.userRole}
                        </span>
                      </td>
                      <td><code>{log.userId}</code></td>
                      <td style={{ fontSize: '0.85rem' }}>{log.text}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* ADMIN RESOLVE DIRECT OVERRIDE MODAL */}
      {showResolveModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontWeight: '700' }}>Administrative Override Resolution</h3>
              <button onClick={() => setShowResolveModal(false)} className="btn-icon-only">✕</button>
            </div>
            <form onSubmit={handleResolveSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  You are performing an administrative resolution override on ticket <strong>{selectedIssue?.id}</strong>. This forces the issue closed and logs your action.
                </p>
                <div className="form-group">
                  <label className="form-label">Resolution Override Notes</label>
                  <textarea 
                    className="form-textarea"
                    required
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="e.g. Principal approved attendance waiver for Aarav Mehta due to representing college in national robotics championship."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowResolveModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-success">Force Resolve & Close</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
