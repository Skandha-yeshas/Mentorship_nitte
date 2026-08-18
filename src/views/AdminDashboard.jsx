import React, { useContext, useState } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { BarChart, DonutChart } from '../components/CustomChart';
import { Shield, Users, Ticket, CheckCircle2, AlertTriangle, Star, ShieldAlert, Download, RefreshCw, FileText, Search, Bell, HelpCircle, ArrowUpRight, Filter, MoreVertical, TrendingUp, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react';

export const AdminDashboard = () => {
  const { db, adminResolveIssue, reassignIssue } = useContext(DatabaseContext);
  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics', 'escalations', 'audit-logs', 'session-reports'
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [chartTimeframe, setChartTimeframe] = useState('week'); // 'week' or 'month'
  const [searchTerm, setSearchTerm] = useState('');
  
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
  const statusData = [
    { name: 'Resolved', value: db.issues.filter(i => i.status === 'Resolved').length },
    { name: 'Escalated', value: db.issues.filter(i => i.status === 'Escalated').length },
    { name: 'Scheduled', value: db.issues.filter(i => i.status === 'Meeting Scheduled').length },
    { name: 'Assigned/New', value: db.issues.filter(i => i.status === 'Assigned to RO' || i.status === 'Submitted').length }
  ];

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

  // CSV DOWNLOAD REPORT GENERATOR
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
      {/* SideNavBar Panel */}
      <div className="glass-card panel-selector">
        {/* Admin Header */}
        <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-color)', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(225, 29, 72, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-rose)' }}>
              <Shield size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>NITTE Portal</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Academic Authority</p>
            </div>
          </div>
        </div>

        <button 
          className={`panel-btn ${activeTab === 'analytics' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <Ticket size={18} />
          <span>Analytics Overview</span>
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

        <button 
          className={`panel-btn ${activeTab === 'session-reports' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('session-reports')}
        >
          <FileText size={18} />
          <span>Mentor Session Logs ({(db.mentorSessionRecords || []).length})</span>
        </button>

        {/* Action Panel for CSV downloads */}
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
        
        {/* TOP BAR / SEARCH HEADER */}
        <div className="glass-card" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '100%', maxWidth: '420px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              className="form-control" 
              style={{ paddingLeft: '36px', height: '38px', fontSize: '0.85rem' }} 
              placeholder="Search analytics, students, or escalation tickets..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}>
              <Bell size={16} /> Notification Center
            </button>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}>
              <HelpCircle size={16} /> Portal Guide
            </button>
          </div>
        </div>

        {/* TAB 1: BENTO GRID ANALYTICS OVERVIEW */}
        {activeTab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header Title */}
            <div>
              <h2 className="section-title" style={{ fontSize: '1.4rem', margin: 0 }}>Analytics Overview</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Real-time metrics and historical trends for NITTE support operations.
              </p>
            </div>

            {/* Bento Grid 4 KPI Cards */}
            <div className="grid-cols-4" style={{ gap: '16px' }}>
              
              {/* KPI Card 1: System Health */}
              <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '130px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>System Health</span>
                  <CheckCircle2 size={20} style={{ color: 'var(--accent-emerald)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>99.9%</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <TrendingUp size={14} /> PostgreSQL + Express Live
                  </div>
                </div>
              </div>

              {/* KPI Card 2: Resolution Rate */}
              <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '130px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Resolution Rate</span>
                  <CheckCircle2 size={20} style={{ color: 'var(--accent-blue)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{resolutionRate}%</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <ArrowUp size={14} /> +2.4% SLA performance
                  </div>
                </div>
              </div>

              {/* KPI Card 3: Active Users */}
              <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '130px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>Active Accounts</span>
                  <Users size={20} style={{ color: 'var(--accent-purple)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{db.users.students.length + db.users.mentors.length + db.users.ros.length}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    <span>{db.users.students.length} Students | 49 RO Officers</span>
                  </div>
                </div>
              </div>

              {/* KPI Card 4: Pending Escalations */}
              <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '130px', borderLeft: escalatedIssues > 0 ? '4px solid var(--accent-rose)' : '1px solid var(--border-color)', background: escalatedIssues > 0 ? 'rgba(244, 63, 94, 0.06)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: escalatedIssues > 0 ? 'var(--accent-rose)' : 'var(--text-secondary)' }}>Pending Escalations</span>
                  <AlertTriangle size={20} style={{ color: escalatedIssues > 0 ? 'var(--accent-rose)' : 'var(--text-secondary)' }} />
                </div>
                <div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700, color: escalatedIssues > 0 ? 'var(--accent-rose)' : 'inherit' }}>{escalatedIssues}</div>
                  <div style={{ fontSize: '0.75rem', color: escalatedIssues > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                    {escalatedIssues > 0 ? (
                      <><AlertTriangle size={14} /> Action required immediately</>
                    ) : (
                      <><CheckCircle2 size={14} /> All tickets within SLA</>
                    )}
                  </div>
                </div>
              </div>

            </div>

            {/* Middle Grid: Charts & Recent Escalations List */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
              
              {/* Interactive Charts Area */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Issue Volume Trends</h3>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button 
                      onClick={() => setChartTimeframe('week')}
                      className={`btn ${chartTimeframe === 'week' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    >
                      Week
                    </button>
                    <button 
                      onClick={() => setChartTimeframe('month')}
                      className={`btn ${chartTimeframe === 'month' ? 'btn-primary' : 'btn-secondary'}`}
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                    >
                      Month
                    </button>
                  </div>
                </div>

                <div className="charts-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <DonutChart data={statusData} title="Resolution Status Breakdown" />
                  <BarChart data={categoryData} title="Primary Domain Volume" />
                </div>
              </div>

              {/* Recent Escalations Widget */}
              <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', justifySelf: 'space-between', justifyContent: 'space-between' }}>
                  <span>Recent Escalations</span>
                  <span style={{ fontSize: '0.75rem', background: 'rgba(244, 63, 94, 0.15)', color: 'var(--accent-rose)', padding: '2px 8px', borderRadius: '10px' }}>
                    {escalations.length} Active
                  </span>
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '340px' }}>
                  {escalations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                      <CheckCircle2 size={36} style={{ marginBottom: '8px', opacity: 0.5, color: 'var(--accent-emerald)' }} />
                      <p style={{ fontSize: '0.85rem' }}>No pending escalations!</p>
                    </div>
                  ) : (
                    escalations.map(issue => (
                      <div key={issue.id} style={{ padding: '12px', borderRadius: '8px', border: '1px solid rgba(244, 63, 94, 0.3)', background: 'rgba(244, 63, 94, 0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#ffdad6', color: '#dc2626', padding: '2px 6px', borderRadius: '10px' }}>
                            CRITICAL
                          </span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{issue.id}</span>
                        </div>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '4px 0', color: 'var(--text-primary)' }}>{issue.category}</h4>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: 0 }}>
                          {issue.description}
                        </p>
                        <button 
                          onClick={() => { setActiveTab('escalations'); setSelectedIssueId(issue.id); }}
                          style={{ marginTop: '8px', fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
                        >
                          View Details & Override <ArrowUpRight size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* Bottom Section: Cohort Student Monitoring Table */}
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Cohort Student Monitoring</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>Real-time open ticket load per student across all departments.</p>
                </div>
                <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}>
                  <Filter size={14} /> Filter Cohort
                </button>
              </div>

              <div className="custom-table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Student ID</th>
                      <th>Student Name</th>
                      <th>Branch / Sem</th>
                      <th>Open Tickets</th>
                      <th>Status Indicator</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {db.users.students
                      .filter(s => !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map(student => {
                        const studentOpenTickets = db.issues.filter(i => (i.studentId === student.id || i.student_id === student.id) && i.status !== 'Resolved');
                        const hasEscalated = studentOpenTickets.some(i => i.status === 'Escalated');
                        
                        let statusBadge = (
                          <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#047857', fontWeight: 600 }}>
                            Healthy
                          </span>
                        );

                        if (hasEscalated) {
                          statusBadge = (
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#dc2626', fontWeight: 600 }}>
                              Overdue / Escalated
                            </span>
                          );
                        } else if (studentOpenTickets.length > 0) {
                          statusBadge = (
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#b45309', fontWeight: 600 }}>
                              Needs Review ({studentOpenTickets.length})
                            </span>
                          );
                        }

                        return (
                          <tr key={student.id}>
                            <td><code>{student.id}</code></td>
                            <td><strong>{student.name}</strong></td>
                            <td>{student.branch} - Sem {student.sem}</td>
                            <td><strong>{studentOpenTickets.length}</strong></td>
                            <td>{statusBadge}</td>
                            <td>
                              <button 
                                onClick={() => { setActiveTab('escalations'); }}
                                className="btn btn-secondary" 
                                style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                              >
                                View Tickets
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

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

        {/* TAB 4: MENTOR SESSION RECORDS AUDIT */}
        {activeTab === 'session-reports' && (
          <div className="glass-card">
            <h2 className="section-title">Faculty Mentoring Sessions Audit</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              A centralized list of all mentoring sessions and progress reports filed by faculty mentors.
            </p>

            {(!db.mentorSessionRecords || db.mentorSessionRecords.length === 0) ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                <FileText size={48} style={{ marginBottom: '12px', opacity: 0.5 }} />
                <p>No mentoring sessions have been logged by faculty yet.</p>
              </div>
            ) : (
              <div className="custom-table-container">
                <table className="custom-table">
                  <thead>
                    <tr>
                      <th>Mentor Name</th>
                      <th>Session Date</th>
                      <th>Topic / Discussion Title</th>
                      <th>Mentees Attended</th>
                      <th>Progress Summary Notes</th>
                      <th>Logged Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {db.mentorSessionRecords.map((rec, idx) => {
                      const mentorName = db.users.mentors.find(m => m.id === rec.mentorId)?.name || rec.mentorId;
                      return (
                        <tr key={idx}>
                          <td><strong>{mentorName}</strong></td>
                          <td>{new Date(rec.sessionDate).toLocaleDateString()}</td>
                          <td>{rec.topic}</td>
                          <td>
                            <span style={{ 
                              padding: '2px 8px', 
                              borderRadius: '10px', 
                              background: 'rgba(244, 63, 94, 0.15)',
                              color: '#fca5a5',
                              fontSize: '0.8rem',
                              fontWeight: '600'
                            }}>
                              {rec.studentsAttended} Students
                            </span>
                          </td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{rec.notes}</td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {new Date(rec.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
