import React, { useContext, useState } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { BarChart, DonutChart } from '../components/CustomChart';
import { 
  Shield, Users, Ticket, CheckCircle2, AlertTriangle, Star, ShieldAlert, 
  Download, RefreshCw, FileText, Search, Bell, HelpCircle, ArrowUpRight, 
  Filter, MoreVertical, TrendingUp, ArrowUp, ArrowDown, ExternalLink,
  GraduationCap, Briefcase, UserCheck, Activity, Eye, Layers, Clock
} from 'lucide-react';

export const AdminDashboard = () => {
  const { db, adminResolveIssue, reassignIssue } = useContext(DatabaseContext);
  const [activeTab, setActiveTab] = useState('students'); // 'students', 'all-tickets', 'ros', 'mentors', 'escalations', 'audit-logs', 'session-reports'
  const [ticketStatusFilter, setTicketStatusFilter] = useState('All');
  const [viewLogIssueId, setViewLogIssueId] = useState(null);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [chartTimeframe, setChartTimeframe] = useState('week'); // 'week' or 'month'
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal state
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Reassign state
  const [targetRoId, setTargetRoId] = useState('');
  const [selectedRoForFilter, setSelectedRoForFilter] = useState('ALL');

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
              <h3 style={{ fontSize: '1rem', fontWeight: '700' }}>Admin Office</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Workflow Control Center</p>
            </div>
          </div>
        </div>

        {/* Division 1: Students */}
        <button 
          className={`panel-btn ${activeTab === 'students' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('students')}
        >
          <GraduationCap size={18} />
          <span>Students Division ({db.users.students.length})</span>
        </button>

        {/* Division 2: All & Closed Tickets */}
        <button 
          className={`panel-btn ${activeTab === 'all-tickets' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('all-tickets')}
        >
          <Ticket size={18} />
          <span>All & Closed Tickets ({db.issues.length})</span>
        </button>

        {/* Division 3: Relationship Officers */}
        <button 
          className={`panel-btn ${activeTab === 'ros' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('ros')}
        >
          <Briefcase size={18} />
          <span>RO Officers ({db.users.ros.length})</span>
        </button>

        {/* Division 4: Faculty Mentors */}
        <button 
          className={`panel-btn ${activeTab === 'mentors' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('mentors')}
        >
          <UserCheck size={18} />
          <span>Faculty Mentors ({db.users.mentors.length})</span>
        </button>

        {/* Division 5: Escalations */}
        <button 
          className={`panel-btn ${activeTab === 'escalations' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('escalations')}
        >
          <ShieldAlert size={18} />
          <span>Escalations Queue ({escalations.length})</span>
        </button>

        {/* Division 6: Audit Logs */}
        <button 
          className={`panel-btn ${activeTab === 'audit-logs' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('audit-logs')}
        >
          <Clock size={18} />
          <span>System Audit Trail ({db.systemLogs.length})</span>
        </button>

        {/* Division 7: Mentor Reports */}
        <button 
          className={`panel-btn ${activeTab === 'session-reports' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('session-reports')}
        >
          <FileText size={18} />
          <span>Faculty Session Logs ({(db.mentorSessionRecords || []).length})</span>
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
          <div style={{ position: 'relative', width: '100%', maxWidth: '440px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input 
              type="text" 
              className="form-control" 
              style={{ paddingLeft: '36px', height: '38px', fontSize: '0.85rem' }} 
              placeholder="Search students, faculty mentors, ROs, or ticket IDs..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}>
              <Bell size={16} /> Notifications
            </button>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', gap: '6px' }}>
              <HelpCircle size={16} /> Portal Guide
            </button>
          </div>
        </div>



        {/* DIVISION 2: STUDENTS WORKFLOW MONITOR */}
        {activeTab === 'students' && (
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>🎓 Students Division Directory & Limit Monitor</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Monitor student accounts, assigned faculty mentors, active ticket load, and 2-issue slot limit statuses.
                </p>
              </div>
              <span style={{ fontSize: '0.8rem', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-blue)', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                {db.users.students.length} Total Enrolled Mentees
              </span>
            </div>

            <div className="custom-table-container" style={{ maxHeight: '520px', overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Student ID / USN</th>
                    <th>Student Name</th>
                    <th>Gmail Address</th>
                    <th>Branch / Sem</th>
                    <th>Assigned Mentor</th>
                    <th>Active Issues</th>
                    <th>Slot Limit Status</th>
                  </tr>
                </thead>
                <tbody>
                  {db.users.students
                    .filter(s => !searchTerm || s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.id.toLowerCase().includes(searchTerm.toLowerCase()) || s.email.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(student => {
                      const studentIssues = db.issues.filter(i => (i.studentId || i.student_id || '').toLowerCase() === student.id.toLowerCase());
                      const activeStudentIssues = studentIssues.filter(i => i.status !== 'Resolved');
                      const mentor = db.users.mentors.find(m => m.id === student.mentorId);

                      // 7-day limit calculation for this student
                      const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
                      const recent7Days = studentIssues.filter(i => {
                        const raw = i.createdAt || i.created_at;
                        return raw && (Date.now() - new Date(raw).getTime()) < SEVEN_DAYS_MS;
                      });

                      const usedSlots = recent7Days.length;

                      return (
                        <tr key={student.id}>
                          <td><code>{student.id}</code></td>
                          <td><strong>{student.name}</strong></td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{student.email}</td>
                          <td>{student.branch || 'CSE'} - Sem {student.sem || 5}</td>
                          <td>{mentor ? mentor.name : 'Unassigned'}</td>
                          <td>
                            <span style={{ 
                              padding: '2px 8px', borderRadius: '10px', 
                              fontWeight: 700, fontSize: '0.75rem',
                              backgroundColor: activeStudentIssues.length > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: activeStudentIssues.length > 0 ? '#b45309' : '#047857'
                            }}>
                              {activeStudentIssues.length} Open
                            </span>
                          </td>
                          <td>
                            <span style={{ 
                              padding: '2px 8px', borderRadius: '10px', 
                              fontWeight: 600, fontSize: '0.75rem',
                              backgroundColor: usedSlots >= 2 ? '#fef3c7' : '#d1fae5',
                              color: usedSlots >= 2 ? '#b45309' : '#047857'
                            }}>
                              {usedSlots >= 2 ? '🔒 Limit Reached (2/2 Used)' : `Weekly Limit: ${2 - usedSlots}/2 Avail`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DIVISION 2: ALL & CLOSED TICKETS MANAGEMENT DIVISION */}
        {activeTab === 'all-tickets' && (
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>📋 All & Closed Tickets Management Division</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Full administrative overview of all submitted, resolved, closed, and escalated issues with audit trails & student feedback.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <span className="badge badge-resolved" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  {resolvedIssues} Resolved / Closed
                </span>
                <span className="badge badge-escalated" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>
                  {escalatedIssues} Escalated
                </span>
              </div>
            </div>

            {/* Quick Status Filter Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              {['All', 'Resolved', 'Assigned to RO', 'Meeting Scheduled', 'Escalated'].map(st => (
                <button
                  key={st}
                  onClick={() => setTicketStatusFilter(st)}
                  className={`btn ${ticketStatusFilter === st ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '4px 12px', fontSize: '0.78rem' }}
                >
                  {st === 'All' ? `All Tickets (${db.issues.length})` : `${st} (${db.issues.filter(i => i.status === st).length})`}
                </button>
              ))}
            </div>

            <div className="custom-table-container" style={{ maxHeight: '550px', overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Ticket ID</th>
                    <th>Student Name & ID</th>
                    <th>Category & Details</th>
                    <th>Assigned RO</th>
                    <th>Status</th>
                    <th>Resolution Summary / Closing Notes</th>
                    <th>Student Rating & Feedback</th>
                    <th>Timeline Logs</th>
                  </tr>
                </thead>
                <tbody>
                  {db.issues
                    .filter(i => {
                      const matchesStatus = ticketStatusFilter === 'All' || i.status === ticketStatusFilter;
                      const matchesSearch = !searchTerm || 
                        i.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        i.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        i.category.toLowerCase().includes(searchTerm.toLowerCase());
                      return matchesStatus && matchesSearch;
                    })
                    .map(issue => {
                      const badgeClass = `badge badge-${issue.status.toLowerCase().replace(' ', '-')}`;
                      const roObj = db.users.ros.find(r => r.id === issue.roId);
                      const feedback = issue.feedback || (issue.feedbackRating ? { rating: issue.feedbackRating, comments: issue.feedbackComments } : null);

                      return (
                        <tr key={issue.id}>
                          <td>
                            <code>{issue.id}</code>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Priority: <strong>{issue.priority}</strong>
                            </div>
                          </td>
                          <td>
                            <strong>{issue.studentName}</strong>
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>ID: {issue.studentId}</div>
                          </td>
                          <td style={{ maxWidth: '220px' }}>
                            <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{issue.category}</strong>
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {issue.description}
                            </p>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{roObj ? roObj.name : issue.roId}</span>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>ID: {issue.roId}</div>
                          </td>
                          <td>
                            <span className={badgeClass}>{issue.status}</span>
                          </td>
                          <td style={{ maxWidth: '240px' }}>
                            {issue.status === 'Resolved' && issue.resolutionNotes ? (
                              <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '6px 10px', borderRadius: '4px', borderLeft: '3px solid var(--accent-emerald)', fontSize: '0.78rem' }}>
                                <strong>Notes:</strong> {issue.resolutionNotes}
                                {issue.resolvedAt && (
                                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                    Closed: {new Date(issue.resolvedAt).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                {issue.status === 'Resolved' ? 'Closed without notes' : 'Pending Resolution'}
                              </span>
                            )}
                          </td>
                          <td>
                            {feedback ? (
                              <div style={{ background: 'rgba(255,255,255,0.03)', padding: '6px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>
                                <div style={{ display: 'flex', gap: '2px', color: 'var(--accent-amber)' }}>
                                  {[1, 2, 3, 4, 5].map(num => (
                                    <Star key={num} size={12} fill={num <= feedback.rating ? 'var(--accent-amber)' : 'none'} />
                                  ))}
                                  <span style={{ marginLeft: '4px', fontWeight: 'bold' }}>{feedback.rating}/5</span>
                                </div>
                                {feedback.comments && (
                                  <p style={{ fontStyle: 'italic', color: 'var(--text-secondary)', margin: '2px 0 0 0', fontSize: '0.72rem' }}>
                                    "{feedback.comments}"
                                  </p>
                                )}
                              </div>
                            ) : issue.status === 'Resolved' ? (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Awaiting Student Feedback</span>
                            ) : (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>N/A</span>
                            )}
                          </td>
                          <td>
                            <button
                              onClick={() => setViewLogIssueId(issue.id)}
                              className="btn btn-secondary"
                              style={{ padding: '3px 8px', fontSize: '0.72rem', gap: '4px' }}
                            >
                              <Eye size={12} /> View ({issue.logs ? issue.logs.length : 0})
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DIVISION 3: RELATIONSHIP OFFICERS (ROs) WORKFLOW MONITOR */}
        {activeTab === 'ros' && (
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>👔 Relationship Officers (ROs) Workflow Control Division</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Monitor domain workloads, resolution counts, and real-time Gmail dispatch status for all 49 dedicated ROs.
                </p>
              </div>
              <span style={{ fontSize: '0.8rem', background: 'rgba(139, 92, 246, 0.15)', color: '#c084fc', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                {db.users.ros.length} Category-Specific RO Officers
              </span>
            </div>

            <div className="custom-table-container" style={{ maxHeight: '520px', overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>RO ID</th>
                    <th>Officer Name</th>
                    <th>Domain / Assigned Region</th>
                    <th>Target Gmail</th>
                    <th>Assigned Tickets</th>
                    <th>Resolved</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {db.users.ros
                    .filter(ro => !searchTerm || ro.name.toLowerCase().includes(searchTerm.toLowerCase()) || ro.region.toLowerCase().includes(searchTerm.toLowerCase()) || ro.id.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(ro => {
                      const roTickets = db.issues.filter(i => i.roId === ro.id);
                      const openRoTickets = roTickets.filter(i => i.status !== 'Resolved');
                      const resolvedRoTickets = roTickets.filter(i => i.status === 'Resolved');
                      const hasEscalated = openRoTickets.some(i => i.status === 'Escalated');

                      return (
                        <tr key={ro.id}>
                          <td><code>{ro.id}</code></td>
                          <td><strong>{ro.name}</strong></td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{ro.region}</td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{ro.email}</td>
                          <td><strong>{roTickets.length}</strong> ({openRoTickets.length} open)</td>
                          <td><strong style={{ color: 'var(--accent-emerald)' }}>{resolvedRoTickets.length}</strong></td>
                          <td>
                            {hasEscalated ? (
                              <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#dc2626', fontWeight: 700 }}>
                                🔴 Escalated Ticket
                              </span>
                            ) : openRoTickets.length > 0 ? (
                              <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#b45309', fontWeight: 600 }}>
                                🟡 In Progress
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.15)', color: '#047857', fontWeight: 600 }}>
                                🟢 Clear Queue
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DIVISION 4: FACULTY MENTORS WORKFLOW MONITOR */}
        {activeTab === 'mentors' && (
          <div className="glass-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>👨‍🏫 Faculty Mentors Division & Session Progress Monitor</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Track faculty mentor assignments, assigned mentee load, scheduled group sessions, and filed session reports.
                </p>
              </div>
              <span style={{ fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.15)', color: '#047857', padding: '4px 10px', borderRadius: '12px', fontWeight: 600 }}>
                {db.users.mentors.length} Faculty Mentors
              </span>
            </div>

            <div className="custom-table-container" style={{ maxHeight: '520px', overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Mentor ID</th>
                    <th>Faculty Name</th>
                    <th>Department</th>
                    <th>Class / Batch</th>
                    <th>Assigned Mentees</th>
                    <th>Group Sessions</th>
                    <th>Filed Reports</th>
                  </tr>
                </thead>
                <tbody>
                  {db.users.mentors
                    .filter(m => !searchTerm || m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.dept.toLowerCase().includes(searchTerm.toLowerCase()) || m.id.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(mentor => {
                      const mentees = db.users.students.filter(s => s.mentorId === mentor.id);
                      const sessions = db.groupSessions.filter(s => s.mentorId === mentor.id);
                      const records = (db.mentorSessionRecords || []).filter(r => r.mentorId === mentor.id);

                      return (
                        <tr key={mentor.id}>
                          <td><code>{mentor.id}</code></td>
                          <td><strong>{mentor.name}</strong></td>
                          <td>{mentor.dept}</td>
                          <td>{mentor.class || 'All Semesters'}</td>
                          <td><strong style={{ color: 'var(--accent-blue)' }}>{mentees.length} Students</strong></td>
                          <td>{sessions.length} Scheduled</td>
                          <td>
                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px', background: records.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)', color: records.length > 0 ? '#047857' : '#b45309', fontWeight: 600 }}>
                              {records.length} Filed
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DIVISION 5: ESCALATIONS QUEUE */}
        {activeTab === 'escalations' && (
          <div style={{ display: 'grid', gridTemplateColumns: escalations.length > 0 ? '1fr 1fr' : '1fr', gap: '20px' }}>
            <div className="glass-card">
              <h2 className="section-title">Critical Escalations Queue ({escalations.length})</h2>

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

                <div style={{ marginBottom: '20px', borderLeft: '3px solid var(--accent-rose)', background: 'rgba(244,63,94,0.05)', padding: '10px', borderRadius: '4px' }}>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: '700', color: 'rgb(253,164,175)', marginBottom: '4px' }}>Reason for Escalation (from RO Logs):</h4>
                  <p style={{ fontSize: '0.8rem', fontStyle: 'italic' }}>
                    {selectedIssue.logs[selectedIssue.logs.length - 1]?.text || 'No logs found'}
                  </p>
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '4px' }}>Administrative Actions:</h4>
                  <button onClick={() => setShowResolveModal(true)} className="btn btn-success" style={{ width: '100%' }}>
                    Override & Mark as Resolved
                  </button>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                    <select className="form-select" style={{ fontSize: '0.8rem', padding: '6px 12px' }} value={targetRoId} onChange={(e) => setTargetRoId(e.target.value)}>
                      <option value="">-- Reassign RO --</option>
                      {db.users.ros.filter(r => r.id !== selectedIssue.roId).map(ro => (
                        <option key={ro.id} value={ro.id}>{ro.name}</option>
                      ))}
                    </select>
                    <button onClick={() => handleReassign(targetRoId)} disabled={!targetRoId} className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      Apply Reassignment
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DIVISION 6: SYSTEM AUDIT TRAIL */}
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
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td>
                        <span style={{
                          fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', fontWeight: '600',
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

        {/* DIVISION 7: MENTOR SESSION REPORTS AUDIT */}
        {activeTab === 'session-reports' && (
          <div className="glass-card">
            <h2 className="section-title">Faculty Mentoring Sessions Audit</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              A centralized audit list of all mentoring sessions and progress reports filed by faculty mentors.
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
                            <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.15)', color: '#fca5a5', fontSize: '0.8rem', fontWeight: '600' }}>
                              {rec.studentsAttended} Students
                            </span>
                          </td>
                          <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{rec.notes}</td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(rec.createdAt).toLocaleString()}</td>
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

      {/* VIEW LOGS MODAL */}
      {viewLogIssueId && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontWeight: '700' }}>Ticket Audit Trail — {viewLogIssueId}</h3>
              <button onClick={() => setViewLogIssueId(null)} className="btn-icon-only">✕</button>
            </div>
            <div className="modal-body">
              {(() => {
                const targetIssue = db.issues.find(i => i.id === viewLogIssueId);
                if (!targetIssue) return <p>Issue not found.</p>;
                return (
                  <div>
                    <div style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
                      <p><strong>Category:</strong> {targetIssue.category}</p>
                      <p><strong>Student:</strong> {targetIssue.studentName} ({targetIssue.studentId})</p>
                      <p><strong>Assigned RO:</strong> {targetIssue.roId}</p>
                      <p><strong>Status:</strong> <span className={`badge badge-${targetIssue.status.toLowerCase().replace(' ', '-')}`}>{targetIssue.status}</span></p>
                    </div>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>Timeline Logs:</h4>
                    <div className="log-timeline">
                      {(targetIssue.logs || []).map((log, idx) => (
                        <div key={idx} className="log-item">
                          <span>{log.text}</span>
                          <span className="log-time">{new Date(log.time).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
            <div className="modal-footer">
              <button onClick={() => setViewLogIssueId(null)} className="btn btn-secondary">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
