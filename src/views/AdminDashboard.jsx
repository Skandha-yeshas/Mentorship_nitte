import React, { useContext, useState } from 'react';
import * as XLSX from 'xlsx';
import { DatabaseContext } from '../context/DatabaseContext';
import { BarChart, DonutChart } from '../components/CustomChart';
import { 
  Shield, Users, Ticket, CheckCircle2, AlertTriangle, Star, ShieldAlert, 
  Download, RefreshCw, FileText, Search, Bell, HelpCircle, ArrowUpRight, 
  Filter, MoreVertical, TrendingUp, ArrowUp, ArrowDown, ExternalLink,
  GraduationCap, Briefcase, UserCheck, Activity, Eye, Layers, Clock,
  Upload, FileSpreadsheet, Mail, Key, Check, AlertCircle, X, UserPlus, Grid,
  Printer, FileDown
} from 'lucide-react';

export const AdminDashboard = () => {
  const { db, adminResolveIssue, reassignIssue, bulkUploadStudents } = useContext(DatabaseContext);
  
  // Navigation State
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'students', 'mentors', 'ros', 'all-tickets'
  const [studentSubTab, setStudentSubTab] = useState('directory'); // 'directory', 'excel-import'
  const [mentorSubTab, setMentorSubTab] = useState('directory'); // 'directory', 'session-reports'
  const [ticketSubTab, setTicketSubTab] = useState('tickets'); // 'tickets', 'audit-logs'

  // Filter & Search State
  const [ticketStatusFilter, setTicketStatusFilter] = useState('All');
  const [viewLogIssueId, setViewLogIssueId] = useState(null);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [escalationModalIssueId, setEscalationModalIssueId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Roster Bulk Upload State
  const [rosterFile, setRosterFile] = useState(null);
  const [parsedRoster, setParsedRoster] = useState([]);
  const [isUploadingRoster, setIsUploadingRoster] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState('');
  
  // Modal State
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Reassign State
  const [targetRoId, setTargetRoId] = useState('');
  const [selectedRoForFilter, setSelectedRoForFilter] = useState('ALL');

  // Excel / CSV Parsing Handlers
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setRosterFile(file);
    setUploadError('');
    setUploadResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data || data.length === 0) {
          setUploadError('The uploaded Excel/CSV file is empty or formatted incorrectly.');
          setParsedRoster([]);
          return;
        }

        setParsedRoster(data);
      } catch (err) {
        setUploadError('Failed to parse file: ' + err.message);
        setParsedRoster([]);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadTemplate = () => {
    const sampleData = [
      { 'Student ID': 'S109', 'Student Name': 'Rohan Sharma', 'Student Gmail': 'rohan.sharma@gmail.com', 'Branch': 'CSE', 'Semester': 5 },
      { 'Student ID': 'S110', 'Student Name': 'Ananya Verma', 'Student Gmail': 'ananya.verma@gmail.com', 'Branch': 'ISE', 'Semester': 3 },
      { 'Student ID': 'S111', 'Student Name': 'Vikram Hegde', 'Student Gmail': 'vikram.hegde@gmail.com', 'Branch': 'ECE', 'Semester': 6 }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Student Roster');
    XLSX.writeFile(wb, 'nitte_student_roster_template.xlsx');
  };

  const handleRosterSubmit = async () => {
    if (!parsedRoster || parsedRoster.length === 0) {
      setUploadError('Please select a valid Excel or CSV file with student rows first.');
      return;
    }

    setIsUploadingRoster(true);
    setUploadError('');
    setUploadResult(null);

    try {
      const res = await bulkUploadStudents(parsedRoster);
      setUploadResult(res);
      setParsedRoster([]);
      setRosterFile(null);
    } catch (err) {
      setUploadError(err.message || 'Failed to process bulk student upload.');
    } finally {
      setIsUploadingRoster(false);
    }
  };

  const handleExportCredentialsCsv = () => {
    if (!uploadResult || !uploadResult.results) return;
    let csvContent = 'data:text/csv;charset=utf-8,Index,Student ID,Student Name,Gmail Address,Generated Password,Email Delivery Status\n';
    uploadResult.results.forEach((row, i) => {
      csvContent += `${i + 1},"${row.id}","${row.name}","${row.email}","${row.password || 'N/A'}","${row.status === 'SUCCESS' ? 'DELIVERED_GMAIL' : 'FAILED'}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nitte_student_credentials_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // MS WORD (.doc) AUDIT REPORT GENERATOR
  const handleDownloadWordReport = (issue) => {
    if (!issue) return;
    
    const ro = db.users.ros.find(r => r.id === issue.roId);
    const roName = ro ? ro.name : issue.roId;
    const logsHtml = (issue.logs || []).map((l, i) => `
      <tr style="background-color: ${i % 2 === 0 ? '#f8fafc' : '#ffffff'};">
        <td style="padding: 8px 12px; border: 1px solid #cbd5e1; font-size: 10pt; font-family: monospace;">${new Date(l.time).toLocaleString()}</td>
        <td style="padding: 8px 12px; border: 1px solid #cbd5e1; font-size: 10pt;">${l.text}</td>
      </tr>
    `).join('');

    const wordContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>NITTE Official Escalation Audit Report - ${issue.id}</title>
        <style>
          @page { size: letter; margin: 1in; }
          body { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; margin: 20px; color: #0f172a; line-height: 1.5; }
          .header { text-align: center; border-bottom: 3pt double #1e3a8a; padding-bottom: 12px; margin-bottom: 20px; }
          .header h1 { color: #1e3a8a; margin: 0; font-size: 18pt; text-transform: uppercase; font-weight: bold; }
          .header h3 { color: #475569; margin: 4px 0 0 0; font-size: 11pt; font-weight: normal; }
          .meta-grid { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .meta-grid td { padding: 8px 12px; border: 1px solid #cbd5e1; font-size: 10.5pt; }
          .meta-grid td.label { font-weight: bold; background-color: #f1f5f9; width: 25%; color: #1e3a8a; }
          .section-title { font-size: 12pt; font-weight: bold; color: #1e3a8a; border-bottom: 1.5pt solid #1e3a8a; padding-bottom: 4px; margin-top: 22px; margin-bottom: 10px; }
          .content-box { background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 4pt solid #1e3a8a; padding: 12px 16px; margin-bottom: 20px; font-size: 10.5pt; }
          .logs-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          .logs-table th { background-color: #1e3a8a; color: #ffffff; padding: 8px 12px; border: 1px solid #1e3a8a; font-size: 10.5pt; text-align: left; }
          .seal-table { width: 100%; margin-top: 50px; }
          .seal-table td { width: 50%; text-align: center; font-size: 10pt; color: #475569; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>NITTE (Deemed to be University)</h1>
          <h3>Smart Mentorship & Student Support System — Official Escalation Audit Report</h3>
        </div>

        <div style="text-align: right; margin-bottom: 15px; font-size: 9.5pt; color: #64748b;">
          <strong>Report Generated:</strong> ${new Date().toLocaleString()}
        </div>

        <div class="section-title">1. TICKET & ESCALATION METADATA</div>
        <table class="meta-grid">
          <tr>
            <td class="label">Ticket Reference ID</td>
            <td><strong>${issue.id}</strong></td>
            <td class="label">Escalation Status</td>
            <td><strong style="color: #dc2626;">${issue.status}</strong></td>
          </tr>
          <tr>
            <td class="label">Issue Category</td>
            <td>${issue.category}</td>
            <td class="label">Priority Level</td>
            <td><strong>${issue.priority}</strong></td>
          </tr>
          <tr>
            <td class="label">Student Name</td>
            <td><strong>${issue.studentName}</strong></td>
            <td class="label">Student USN / ID</td>
            <td><code>${issue.studentId}</code></td>
          </tr>
          <tr>
            <td class="label">Jurisdiction RO</td>
            <td>${roName} (${issue.roId})</td>
            <td class="label">Submission Date</td>
            <td>${new Date(issue.createdAt).toLocaleString()}</td>
          </tr>
        </table>

        <div class="section-title">2. INITIAL STUDENT ISSUE STATEMENT</div>
        <div class="content-box">
          ${issue.description}
        </div>

        <div class="section-title">3. COMPLETE STUDENT & RO CHRONOLOGICAL LOG TIMELINE</div>
        <table class="logs-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Activity / Interaction Log Details</th>
            </tr>
          </thead>
          <tbody>
            ${logsHtml}
          </tbody>
        </table>

        <div class="section-title">4. ADMINISTRATIVE ACTION & AUDIT APPROVAL</div>
        <div class="content-box" style="border-left-color: #059669;">
          <strong>Current Status:</strong> ${issue.status}<br/>
          ${issue.resolutionNotes ? `<strong>Administrative Resolution Notes:</strong> ${issue.resolutionNotes}` : '<em>Pending Administrative Override or Reassignment.</em>'}
        </div>

        <table class="seal-table">
          <tr>
            <td>
              <p>_____________________________________</p>
              <p><strong>Relationship Officer Signature</strong><br/>(${roName})</p>
            </td>
            <td>
              <p>_____________________________________</p>
              <p><strong>System Administrator Stamp & Seal</strong><br/>NITTE Student Support Cell</p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + wordContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nitte_escalation_report_${issue.id}_${Date.now()}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // PRINTABLE OFFICIAL REPORT GENERATOR
  const handlePrintReport = (issue) => {
    if (!issue) return;
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    const ro = db.users.ros.find(r => r.id === issue.roId);
    const roName = ro ? ro.name : issue.roId;
    const logsHtml = (issue.logs || []).map((l, i) => `
      <tr style="background-color: ${i % 2 === 0 ? '#f8fafc' : '#ffffff'};">
        <td style="padding: 8px 12px; border: 1px solid #cbd5e1; font-size: 10pt; font-family: monospace;">${new Date(l.time).toLocaleString()}</td>
        <td style="padding: 8px 12px; border: 1px solid #cbd5e1; font-size: 10pt;">${l.text}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <html>
      <head>
        <title>Print Official Escalation Report - ${issue.id}</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #0f172a; }
          .header { text-align: center; border-bottom: 3px double #1e3a8a; padding-bottom: 12px; margin-bottom: 20px; }
          .header h1 { color: #1e3a8a; margin: 0; font-size: 18pt; text-transform: uppercase; font-weight: bold; }
          .header h3 { color: #475569; margin: 4px 0 0 0; font-size: 11pt; font-weight: normal; }
          .meta-grid { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .meta-grid td { padding: 8px 12px; border: 1px solid #cbd5e1; font-size: 10.5pt; }
          .meta-grid td.label { font-weight: bold; background-color: #f1f5f9; width: 25%; color: #1e3a8a; }
          .section-title { font-size: 12pt; font-weight: bold; color: #1e3a8a; border-bottom: 1.5pt solid #1e3a8a; padding-bottom: 4px; margin-top: 22px; margin-bottom: 10px; }
          .content-box { background-color: #f8fafc; border: 1px solid #cbd5e1; border-left: 4pt solid #1e3a8a; padding: 12px 16px; margin-bottom: 20px; font-size: 10.5pt; }
          .logs-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          .logs-table th { background-color: #1e3a8a; color: #ffffff; padding: 8px 12px; border: 1px solid #1e3a8a; font-size: 10.5pt; text-align: left; }
          .seal-table { width: 100%; margin-top: 50px; }
          .seal-table td { width: 50%; text-align: center; font-size: 10pt; color: #475569; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>NITTE (Deemed to be University)</h1>
          <h3>Smart Mentorship & Student Support System — Official Escalation Audit Report</h3>
        </div>
        <div style="text-align: right; margin-bottom: 15px; font-size: 9.5pt; color: #64748b;">
          <strong>Report Generated:</strong> ${new Date().toLocaleString()}
        </div>
        <div class="section-title">1. TICKET & ESCALATION METADATA</div>
        <table class="meta-grid">
          <tr>
            <td class="label">Ticket Reference ID</td>
            <td><strong>${issue.id}</strong></td>
            <td class="label">Escalation Status</td>
            <td><strong style="color: #dc2626;">${issue.status}</strong></td>
          </tr>
          <tr>
            <td class="label">Issue Category</td>
            <td>${issue.category}</td>
            <td class="label">Priority Level</td>
            <td><strong>${issue.priority}</strong></td>
          </tr>
          <tr>
            <td class="label">Student Name</td>
            <td><strong>${issue.studentName}</strong></td>
            <td class="label">Student USN / ID</td>
            <td><code>${issue.studentId}</code></td>
          </tr>
          <tr>
            <td class="label">Jurisdiction RO</td>
            <td>${roName} (${issue.roId})</td>
            <td class="label">Submission Date</td>
            <td>${new Date(issue.createdAt).toLocaleString()}</td>
          </tr>
        </table>
        <div class="section-title">2. INITIAL STUDENT ISSUE STATEMENT</div>
        <div class="content-box">
          ${issue.description}
        </div>
        <div class="section-title">3. COMPLETE STUDENT & RO CHRONOLOGICAL LOG TIMELINE</div>
        <table class="logs-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Activity / Interaction Log Details</th>
            </tr>
          </thead>
          <tbody>
            ${logsHtml}
          </tbody>
        </table>
        <div class="section-title">4. ADMINISTRATIVE ACTION & AUDIT APPROVAL</div>
        <div class="content-box" style="border-left-color: #059669;">
          <strong>Current Status:</strong> ${issue.status}<br/>
          ${issue.resolutionNotes ? `<strong>Administrative Resolution Notes:</strong> ${issue.resolutionNotes}` : '<em>Pending Administrative Override or Reassignment.</em>'}
        </div>
        <table class="seal-table">
          <tr>
            <td>
              <p>_____________________________________</p>
              <p><strong>Relationship Officer Signature</strong><br/>(${roName})</p>
            </td>
            <td>
              <p>_____________________________________</p>
              <p><strong>System Administrator Stamp & Seal</strong><br/>NITTE Student Support Cell</p>
            </td>
          </tr>
        </table>
        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  };


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

        {/* Tab 1: Overview & Escalations (Landing View) */}
        <button 
          className={`panel-btn ${activeTab === 'overview' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Activity size={18} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>Overview & Escalations</span>
            {escalations.length > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                {escalations.length}
              </span>
            )}
          </div>
        </button>

        {/* Tab 2: Students Division */}
        <button 
          className={`panel-btn ${activeTab === 'students' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('students')}
        >
          <GraduationCap size={18} />
          <span>Students ({db.users.students.length})</span>
        </button>

        {/* Tab 3: Faculty Mentors */}
        <button 
          className={`panel-btn ${activeTab === 'mentors' && mentorSubTab === 'directory' ? 'active Admin' : ''}`}
          onClick={() => { setActiveTab('mentors'); setMentorSubTab('directory'); }}
        >
          <UserCheck size={18} />
          <span>Faculty Mentors ({db.users.mentors.length})</span>
        </button>

        {/* Tab 3.5: Faculty Session Logs (6-Field Audit Reports) */}
        <button 
          className={`panel-btn ${activeTab === 'mentors' && mentorSubTab === 'session-reports' ? 'active Admin' : ''}`}
          onClick={() => { setActiveTab('mentors'); setMentorSubTab('session-reports'); }}
        >
          <FileText size={18} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>Faculty Session Logs</span>
            <span style={{ background: 'rgba(99, 102, 241, 0.2)', color: '#a5b4fc', fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
              {(db.mentorSessionRecords || []).length}
            </span>
          </div>
        </button>

        {/* Tab 4: Relationship Officers */}
        <button 
          className={`panel-btn ${activeTab === 'ros' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('ros')}
        >
          <Briefcase size={18} />
          <span>Relationship Officers ({db.users.ros.length})</span>
        </button>

        {/* Tab 5: All Tickets & Audit Logs */}
        <button 
          className={`panel-btn ${activeTab === 'all-tickets' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('all-tickets')}
        >
          <Ticket size={18} />
          <span>All Tickets & Audit Logs ({db.issues.length})</span>
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

        {/* ============================================================== */}
        {/* TAB 1: OVERVIEW & ESCALATIONS LANDING DASHBOARD */}
        {/* ============================================================== */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* 1. ESCALATED ISSUES CONTROL CENTER BANNER */}
            <div className="glass-card" style={{ borderLeft: escalations.length > 0 ? '4px solid #ef4444' : '4px solid #10b981' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldAlert size={22} style={{ color: escalations.length > 0 ? '#ef4444' : '#10b981' }} />
                    Critical Escalations Queue ({escalations.length})
                  </h2>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Issues requiring direct Administrative Resolution Override or RO Reassignment.
                  </p>
                </div>
                {escalations.length > 0 ? (
                  <span style={{ fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '4px 12px', borderRadius: '12px', fontWeight: '700' }}>
                    Action Required
                  </span>
                ) : (
                  <span style={{ fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '4px 12px', borderRadius: '12px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={14} /> All Escalations Clear
                  </span>
                )}
              </div>

              {escalations.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                  <CheckCircle2 size={40} style={{ marginBottom: '8px', opacity: 0.7, color: '#10b981' }} />
                  <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>All student issues are currently being handled within SLA by designated ROs.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '520px', overflowY: 'auto', paddingRight: '6px' }}>
                  {escalations.map(issue => (
                    <div
                      key={issue.id}
                      onClick={() => { setSelectedIssueId(issue.id); setEscalationModalIssueId(issue.id); }}
                      className="glass-card issue-card High"
                      style={{
                        cursor: 'pointer',
                        background: 'rgba(255,255,255,0.02)',
                        borderColor: 'var(--border-color)',
                        padding: '16px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      <div className="issue-card-header" style={{ marginBottom: '8px' }}>
                        <div>
                          <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{issue.category}</strong>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Ticket ID: <code>{issue.id}</code> &nbsp;|&nbsp; Escalated from: <strong>{db.users.ros.find(r => r.id === issue.roId)?.name || issue.roId}</strong>
                          </div>
                        </div>
                        <span className="badge badge-escalated" style={{ fontSize: '0.75rem' }}>Escalated</span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 10px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {issue.description}
                      </p>
                      <div className="issue-meta" style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Student: <strong>{issue.studentName}</strong> (<code>{issue.studentId}</code>) &nbsp;|&nbsp; Priority: <span style={{ color: '#fca5a5', fontWeight: '600' }}>{issue.priority}</span></span>
                        <span style={{ color: '#60a5fa', fontWeight: '600', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Eye size={14} /> Open Audit Detail & Download MS Word Report →
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* VISUAL CHARTS GRID */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="glass-card">
                <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: '16px' }}>
                  📊 Ticket Status Breakdown (Solved vs Escalated)
                </h3>
                <DonutChart data={statusData} />
              </div>

              <div className="glass-card">
                <h3 className="section-title" style={{ fontSize: '1rem', marginBottom: '16px' }}>
                  📈 Category Volume Distribution
                </h3>
                <BarChart data={categoryData} />
              </div>
            </div>

            {/* 3. FACULTY MENTOR SESSION LOGS AUDIT */}
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <h2 className="section-title" style={{ fontSize: '1.1rem', margin: 0 }}>Faculty Mentoring Sessions Audit</h2>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Audit of session reports submitted by faculty. Reports due <strong style={{ color: '#f59e0b' }}>every Friday before 5:00 PM</strong>.
                  </p>
                </div>
                <button onClick={() => { setActiveTab('mentors'); setMentorSubTab('session-reports'); }} className="btn btn-secondary" style={{ fontSize: '0.8rem' }}>
                  View Full Audit Log ({db.mentorSessionRecords?.length || 0})
                </button>
              </div>

              {(!db.mentorSessionRecords || db.mentorSessionRecords.length === 0) ? (
                <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)' }}>
                  <FileText size={40} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>No mentoring sessions have been logged by faculty yet.</p>
                </div>
              ) : (
                <div className="custom-table-container" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Mentor Name</th>
                        <th>Which Class</th>
                        <th>Session Date</th>
                        <th>Location</th>
                        <th>Attendance</th>
                        <th>Topic Covered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {db.mentorSessionRecords.slice(0, 5).map((rec, idx) => {
                        const mentorName = db.users.mentors.find(m => m.id === rec.mentorId)?.name || rec.mentorId;
                        return (
                          <tr key={idx}>
                            <td><strong>{mentorName}</strong></td>
                            <td>
                              <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', fontSize: '0.8rem', fontWeight: '600' }}>
                                {rec.whichClass || '—'}
                              </span>
                            </td>
                            <td>{rec.sessionDate ? new Date(rec.sessionDate).toLocaleDateString() : '—'}</td>
                            <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{rec.location || '—'}</td>
                            <td>
                              <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.15)', color: '#fca5a5', fontSize: '0.8rem', fontWeight: '600' }}>
                                {rec.studentsAttended ?? '—'} Mentees
                              </span>
                            </td>
                            <td style={{ fontSize: '0.82rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rec.topic}>{rec.topic || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: STUDENTS DIVISION & EXCEL IMPORT */}
        {/* ============================================================== */}
        {activeTab === 'students' && (
          <div className="glass-card">
            {/* Sub-tab pills */}
            <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '20px' }}>
              <button 
                className={`btn ${studentSubTab === 'directory' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStudentSubTab('directory')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                <GraduationCap size={16} />
                Mentees Directory & Slot Limits ({db.users.students.length})
              </button>
              <button 
                className={`btn ${studentSubTab === 'excel-import' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStudentSubTab('excel-import')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                <FileSpreadsheet size={16} />
                Import Excel Roster & Credential Mailer
              </button>
            </div>

            {/* Sub-tab 1: Directory */}
            {studentSubTab === 'directory' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div>
                    <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>🎓 Students Division Directory & Limit Monitor</h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                      Monitor student accounts, assigned faculty mentors, active ticket load, and 2-issue slot limit statuses.
                    </p>
                  </div>
                  <button 
                    onClick={() => setStudentSubTab('excel-import')}
                    className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 14px' }}
                  >
                    <FileSpreadsheet size={16} />
                    Import Excel Roster
                  </button>
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
                        .filter(s => 
                          s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          s.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          s.email.toLowerCase().includes(searchTerm.toLowerCase())
                        )
                        .map(student => {
                          const mentor = db.users.mentors.find(m => m.id === student.mentorId);
                          const activeCount = db.issues.filter(i => i.studentId === student.id && i.status !== 'Resolved').length;
                          const recentWeeklyIssuesCount = db.issues.filter(i => {
                            if (i.studentId !== student.id) return false;
                            const created = new Date(i.createdAt).getTime();
                            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                            return created >= sevenDaysAgo;
                          }).length;

                          const isLimitReached = recentWeeklyIssuesCount >= 2;

                          return (
                            <tr key={student.id}>
                              <td><code>{student.id}</code></td>
                              <td><strong>{student.name}</strong></td>
                              <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{student.email}</td>
                              <td><span className="badge badge-assigned">{student.branch} - Sem {student.sem}</span></td>
                              <td>{mentor ? mentor.name : <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}</td>
                              <td>
                                <span style={{ fontWeight: '700', color: activeCount > 0 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
                                  {activeCount} active
                                </span>
                              </td>
                              <td>
                                {isLimitReached ? (
                                  <span style={{ fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '3px 8px', borderRadius: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <AlertTriangle size={12} /> Limit Reached (2/2)
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '3px 8px', borderRadius: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <CheckCircle2 size={12} /> {recentWeeklyIssuesCount}/2 Slots Available
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

            {/* Sub-tab 2: Excel Import */}
            {studentSubTab === 'excel-import' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div>
                    <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileSpreadsheet size={22} style={{ color: '#3b82f6' }} />
                      Admin Excel Roster Import & Automated Credential Dispatch
                    </h2>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                      Upload student rosters in Excel (<code>.xlsx</code>, <code>.xls</code>) or <code>.csv</code> format. The system automatically generates passwords, registers accounts in PostgreSQL, and emails credentials directly to students.
                    </p>
                  </div>
                  <button onClick={handleDownloadTemplate} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    <FileSpreadsheet size={16} />
                    Download Sample Excel Template
                  </button>
                </div>

                {/* Instruction Banner */}
                <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#60a5fa', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Shield size={16} /> How Bulk Student Onboarding Works:
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Your uploaded spreadsheet must include headers for <strong>Student ID</strong> (or USN), <strong>Student Name</strong>, and <strong>Student Gmail</strong> (Branch and Semester are optional).</li>
                    <li>The system will automatically generate a secure password (e.g. <code>Nit#A9k2</code>) for each student.</li>
                    <li>Accounts are saved into PostgreSQL. An automated onboarding email with login credentials & URL is sent via <code>skandhayashu2906@gmail.com</code>.</li>
                    <li>Admin receives a full audit table and can download an Excel/CSV copy of all generated credentials.</li>
                  </ul>
                </div>

                {/* Upload Drag & Drop Area */}
                <div style={{ 
                  border: '2px dashed var(--border-color)', 
                  borderRadius: '12px', 
                  padding: '36px 20px', 
                  textAlign: 'center', 
                  background: 'rgba(255, 255, 255, 0.02)',
                  marginBottom: '24px'
                }}>
                  <Upload size={40} style={{ color: '#3b82f6', marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '6px' }}>Choose Excel (.xlsx, .xls) or CSV File</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Drag and drop your file here or click below to browse from your computer
                  </p>
                  
                  <input 
                    type="file" 
                    id="rosterFileInput"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <label 
                    htmlFor="rosterFileInput" 
                    className="btn btn-primary"
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  >
                    <FileSpreadsheet size={16} />
                    Select Excel Roster File
                  </label>

                  {rosterFile && (
                    <div style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'rgba(37, 99, 235, 0.15)', border: '1px solid rgba(37, 99, 235, 0.3)', padding: '8px 16px', borderRadius: '20px' }}>
                      <FileSpreadsheet size={16} style={{ color: '#60a5fa' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#93c5fd' }}>{rosterFile.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({(rosterFile.size / 1024).toFixed(1)} KB — {parsedRoster.length} rows detected)</span>
                      <button onClick={() => { setRosterFile(null); setParsedRoster([]); }} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {uploadError && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    <AlertCircle size={18} />
                    <span>{uploadError}</span>
                  </div>
                )}

                {/* Parsed Preview Table */}
                {parsedRoster.length > 0 && !uploadResult && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                        Previewing {parsedRoster.length} Student Record{parsedRoster.length > 1 ? 's' : ''} Ready for Onboarding
                      </h3>
                      <button 
                        onClick={handleRosterSubmit} 
                        disabled={isUploadingRoster}
                        className="btn btn-success"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', fontSize: '0.9rem', fontWeight: '600' }}
                      >
                        {isUploadingRoster ? (
                          <>
                            <RefreshCw size={16} className="spin" />
                            Generating Passwords & Sending Emails...
                          </>
                        ) : (
                          <>
                            <Mail size={16} />
                            Register & Dispatch Credentials ({parsedRoster.length})
                          </>
                        )}
                      </button>
                    </div>

                    <div className="custom-table-container" style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: '20px' }}>
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Student ID / USN</th>
                            <th>Student Name</th>
                            <th>Gmail Address</th>
                            <th>Branch</th>
                            <th>Sem</th>
                            <th>Auto Password Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedRoster.map((row, idx) => {
                            const idVal = row['Student ID'] || row['USN'] || row['studentId'] || row['id'] || row['Student USN'] || '—';
                            const nameVal = row['Student Name'] || row['Name'] || row['studentName'] || row['Full Name'] || '—';
                            const emailVal = row['Student Gmail'] || row['Gmail'] || row['Email'] || row['studentEmail'] || row['Email Address'] || '—';
                            const branchVal = row['Branch'] || row['branch'] || row['Dept'] || 'CSE';
                            const semVal = row['Semester'] || row['sem'] || row['Sem'] || 5;

                            return (
                              <tr key={idx}>
                                <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{idx + 1}</td>
                                <td><code>{idVal}</code></td>
                                <td><strong>{nameVal}</strong></td>
                                <td style={{ color: '#60a5fa' }}>{emailVal}</td>
                                <td><span style={{ fontSize: '0.75rem', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', padding: '2px 8px', borderRadius: '4px' }}>{branchVal}</span></td>
                                <td>{semVal}</td>
                                <td>
                                  <span style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Key size={12} /> Auto-Generate & Mail
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

                {/* Upload Results Summary Card */}
                {uploadResult && (
                  <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '10px', padding: '20px', marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CheckCircle2 size={20} /> Bulk Student Registration & Credential Mailer Complete!
                        </h3>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                          Successfully registered <strong>{uploadResult.successCount}</strong> out of <strong>{uploadResult.totalProcessed}</strong> students into PostgreSQL and dispatched onboarding emails.
                        </p>
                      </div>
                      <button onClick={handleExportCredentialsCsv} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                        <Download size={16} /> Export Credentials CSV
                      </button>
                    </div>

                    <div className="custom-table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Student ID</th>
                            <th>Student Name</th>
                            <th>Gmail Address</th>
                            <th>Generated Password</th>
                            <th>Email Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {uploadResult.results.map((res, idx) => (
                            <tr key={idx}>
                              <td>{idx + 1}</td>
                              <td><code>{res.id}</code></td>
                              <td><strong>{res.name}</strong></td>
                              <td>{res.email}</td>
                              <td>
                                {res.status === 'SUCCESS' ? (
                                  <code style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold' }}>
                                    {res.password}
                                  </code>
                                ) : (
                                  <span style={{ color: '#f87171' }}>Failed</span>
                                )}
                              </td>
                              <td>
                                {res.status === 'SUCCESS' ? (
                                  <span style={{ fontSize: '0.75rem', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '2px 8px', borderRadius: '12px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Check size={12} /> DELIVERED GMAIL
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '2px 8px', borderRadius: '12px', fontWeight: '600' }}>
                                    {res.reason}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: FACULTY MENTORS & SESSION REPORTS */}
        {/* ============================================================== */}
        {activeTab === 'mentors' && (
          <div className="glass-card">
            {/* Sub-tab pills */}
            <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '20px' }}>
              <button 
                className={`btn ${mentorSubTab === 'directory' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMentorSubTab('directory')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                <UserCheck size={16} />
                Faculty Mentors Directory ({db.users.mentors.length})
              </button>
              <button 
                className={`btn ${mentorSubTab === 'session-reports' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMentorSubTab('session-reports')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                <FileText size={16} />
                Faculty Mentoring Session Audit ({(db.mentorSessionRecords || []).length})
              </button>
            </div>

            {/* Sub-tab 1: Faculty Directory */}
            {mentorSubTab === 'directory' && (
              <div>
                <h2 className="section-title" style={{ fontSize: '1.2rem', marginBottom: '16px' }}>👨‍🏫 Faculty Mentors Directory</h2>
                <div className="custom-table-container" style={{ maxHeight: '520px', overflowY: 'auto' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Mentor ID</th>
                        <th>Faculty Name</th>
                        <th>Email Address</th>
                        <th>Department</th>
                        <th>Assigned Class & Mentees</th>
                        <th>Password Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {db.users.mentors
                        .filter(m => 
                          m.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          m.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          m.email.toLowerCase().includes(searchTerm.toLowerCase())
                        )
                        .map(mentor => (
                          <tr key={mentor.id}>
                            <td><code>{mentor.id}</code></td>
                            <td><strong>{mentor.name}</strong></td>
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{mentor.email}</td>
                            <td><span className="badge badge-assigned">{mentor.dept || 'CSE'}</span></td>
                            <td>{mentor.class || '5th Sem CSE - Section A (28 Mentees)'}</td>
                            <td><span className="badge badge-resolved">Nit#Mnt2026</span></td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-tab 2: Faculty Session Reports Audit */}
            {mentorSubTab === 'session-reports' && (
              <div>
                <h2 className="section-title" style={{ fontSize: '1.2rem', marginBottom: '4px' }}>Faculty Mentoring Sessions Audit</h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Central audit of all mentoring sessions filed by faculty. Submissions are due <strong style={{ color: '#f59e0b' }}>every Friday before 5:00 PM</strong>. Total filed: <strong>{db.mentorSessionRecords?.length || 0}</strong>
                </p>

                {(!db.mentorSessionRecords || db.mentorSessionRecords.length === 0) ? (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                    <FileText size={48} style={{ marginBottom: '12px', opacity: 0.5 }} />
                    <p>No mentoring sessions have been logged by faculty yet.</p>
                  </div>
                ) : (
                  <div className="custom-table-container" style={{ maxHeight: '480px', overflowY: 'auto' }}>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Mentor Name</th>
                          <th>Which Class</th>
                          <th>Session Date</th>
                          <th>Location</th>
                          <th>Attendance</th>
                          <th>Topic Covered</th>
                          <th>Summary / Action Plan</th>
                          <th>Logged At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {db.mentorSessionRecords.slice().reverse().map((rec, idx) => {
                          const mentorName = db.users.mentors.find(m => m.id === rec.mentorId)?.name || rec.mentorId;
                          return (
                            <tr key={idx}>
                              <td><strong>{mentorName}</strong></td>
                              <td>
                                <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', fontSize: '0.8rem', fontWeight: '600' }}>
                                  {rec.whichClass || '—'}
                                </span>
                              </td>
                              <td>{rec.sessionDate ? new Date(rec.sessionDate).toLocaleDateString() : '—'}</td>
                              <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{rec.location || '—'}</td>
                              <td>
                                <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.15)', color: '#fca5a5', fontSize: '0.8rem', fontWeight: '600' }}>
                                  {rec.studentsAttended ?? '—'} Mentees
                                </span>
                              </td>
                              <td style={{ fontSize: '0.85rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rec.topic}>{rec.topic || '—'}</td>
                              <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={rec.notes}>{rec.notes || '—'}</td>
                              <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{rec.createdAt ? new Date(rec.createdAt).toLocaleString() : '—'}</td>
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
        )}

        {/* ============================================================== */}
        {/* TAB 4: RELATIONSHIP OFFICERS */}
        {/* ============================================================== */}
        {activeTab === 'ros' && (
          <div className="glass-card">
            <h2 className="section-title">👔 Dedicated Relationship Officers Directory (49 Categories)</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Showing category-specific Relationship Officers handling student support tickets. All dispatches route via <code>skandhayashu2906@gmail.com</code>.
            </p>

            <div className="custom-table-container" style={{ maxHeight: '520px', overflowY: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>RO ID</th>
                    <th>Officer Name / Department</th>
                    <th>Category Jurisdiction</th>
                    <th>Gmail Address</th>
                    <th>Assigned Tickets</th>
                    <th>Password Status</th>
                  </tr>
                </thead>
                <tbody>
                  {db.users.ros
                    .filter(r => 
                      r.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                      r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      r.region.toLowerCase().includes(searchTerm.toLowerCase())
                    )
                    .map(ro => {
                      const assignedCount = db.issues.filter(i => i.roId === ro.id && i.status !== 'Resolved').length;
                      return (
                        <tr key={ro.id}>
                          <td><code>{ro.id}</code></td>
                          <td><strong>{ro.name}</strong></td>
                          <td><span className="badge badge-assigned">{ro.region}</span></td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{ro.email}</td>
                          <td>
                            <span style={{ fontWeight: '700', color: assignedCount > 0 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
                              {assignedCount} tickets
                            </span>
                          </td>
                          <td><span className="badge badge-resolved">Nit#Ro2026</span></td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 5: ALL TICKETS & SYSTEM AUDIT LOGS */}
        {/* ============================================================== */}
        {activeTab === 'all-tickets' && (
          <div className="glass-card">
            {/* Sub-tab pills */}
            <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '20px' }}>
              <button 
                className={`btn ${ticketSubTab === 'tickets' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTicketSubTab('tickets')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                <Ticket size={16} />
                All & Closed Tickets Directory ({db.issues.length})
              </button>
              <button 
                className={`btn ${ticketSubTab === 'audit-logs' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setTicketSubTab('audit-logs')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                <Clock size={16} />
                Central System Audit Trail ({db.systemLogs.length})
              </button>
            </div>

            {/* Sub-tab 1: Tickets Directory */}
            {ticketSubTab === 'tickets' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0 }}>🎫 All Support Tickets</h2>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <select 
                      className="form-select" 
                      style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                      value={ticketStatusFilter}
                      onChange={(e) => setTicketStatusFilter(e.target.value)}
                    >
                      <option value="All">All Statuses</option>
                      <option value="Submitted">Submitted</option>
                      <option value="Assigned to RO">Assigned to RO</option>
                      <option value="Meeting Scheduled">Meeting Scheduled</option>
                      <option value="Escalated">Escalated</option>
                      <option value="Resolved">Resolved</option>
                    </select>

                    <select 
                      className="form-select" 
                      style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                      value={selectedRoForFilter}
                      onChange={(e) => setSelectedRoForFilter(e.target.value)}
                    >
                      <option value="ALL">All RO Officers</option>
                      {db.users.ros.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="custom-table-container" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  <table className="custom-table">
                    <thead>
                      <tr>
                        <th>Ticket ID</th>
                        <th>Student Name</th>
                        <th>Category</th>
                        <th>Priority</th>
                        <th>Assigned RO</th>
                        <th>Status</th>
                        <th>Feedback</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {db.issues
                        .filter(i => ticketStatusFilter === 'All' || i.status === ticketStatusFilter)
                        .filter(i => selectedRoForFilter === 'ALL' || i.roId === selectedRoForFilter)
                        .filter(i => 
                          i.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          i.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          i.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          i.description.toLowerCase().includes(searchTerm.toLowerCase())
                        )
                        .map(issue => (
                          <tr key={issue.id}>
                            <td><code>{issue.id}</code></td>
                            <td><strong>{issue.studentName}</strong></td>
                            <td style={{ fontSize: '0.8rem' }}>{issue.category}</td>
                            <td><span className={`badge badge-${issue.priority.toLowerCase()}`}>{issue.priority}</span></td>
                            <td>{db.users.ros.find(r => r.id === issue.roId)?.name || issue.roId}</td>
                            <td><span className={`badge badge-${issue.status.toLowerCase().replace(' ', '-')}`}>{issue.status}</span></td>
                            <td>
                              {issue.feedback ? (
                                <span style={{ color: 'var(--accent-amber)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                  ★ {issue.feedback.rating}/5
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>N/A</span>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button 
                                  onClick={() => setViewLogIssueId(issue.id)}
                                  className="btn btn-secondary" 
                                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                >
                                  Logs
                                </button>
                                {issue.status !== 'Resolved' && (
                                  <button 
                                    onClick={() => { setSelectedIssueId(issue.id); setShowResolveModal(true); }}
                                    className="btn btn-success" 
                                    style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                                  >
                                    Override Resolve
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-tab 2: System Audit Trail */}
            {ticketSubTab === 'audit-logs' && (
              <div>
                <h2 className="section-title" style={{ fontSize: '1.2rem', marginBottom: '16px' }}>Central Activity & Audit Log</h2>
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
      {/* POP-UP WINDOW MODAL FOR ESCALATED ISSUE DETAIL & REPORT GENERATION */}
      {escalationModalIssueId && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '850px', width: '92%' }}>
            {(() => {
              const modalIssue = db.issues.find(i => i.id === escalationModalIssueId);
              if (!modalIssue) return <p>Issue details not available.</p>;
              const ro = db.users.ros.find(r => r.id === modalIssue.roId);
              const roName = ro ? ro.name : modalIssue.roId;

              return (
                <div>
                  <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <ShieldAlert size={24} style={{ color: '#ef4444' }} />
                      <div>
                        <h3 style={{ fontWeight: '700', margin: 0, fontSize: '1.1rem' }}>
                          Official Escalation Audit & Report — <code>{modalIssue.id}</code>
                        </h3>
                        <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          NITTE Smart Mentorship & Student Support System (Admin Audit Cell)
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <button 
                        onClick={() => handleDownloadWordReport(modalIssue)} 
                        className="btn btn-primary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 14px' }}
                      >
                        <FileDown size={16} /> MS Word (.doc)
                      </button>
                      <button 
                        onClick={() => handlePrintReport(modalIssue)} 
                        className="btn btn-secondary"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}
                      >
                        <Printer size={16} /> Print
                      </button>
                      <button onClick={() => setEscalationModalIssueId(null)} className="btn-icon-only">✕</button>
                    </div>
                  </div>

                  <div className="modal-body" style={{ maxHeight: '68vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* Metadata Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)', padding: '14px', borderRadius: '8px', fontSize: '0.85rem' }}>
                      <div><strong>Ticket ID:</strong> <code>{modalIssue.id}</code></div>
                      <div><strong>Escalation Status:</strong> <span className="badge badge-escalated">{modalIssue.status}</span></div>
                      <div><strong>Category:</strong> {modalIssue.category}</div>
                      <div><strong>Priority Level:</strong> <span className={`badge badge-${modalIssue.priority.toLowerCase()}`}>{modalIssue.priority}</span></div>
                      <div><strong>Student Name:</strong> <strong>{modalIssue.studentName}</strong></div>
                      <div><strong>Student USN / ID:</strong> <code>{modalIssue.studentId}</code></div>
                      <div><strong>Assigned Relationship Officer:</strong> <strong>{roName}</strong> (<code>{modalIssue.roId}</code>)</div>
                      <div><strong>Submission Date:</strong> {new Date(modalIssue.createdAt).toLocaleString()}</div>
                    </div>

                    {/* Initial Description */}
                    <div>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        Initial Student Issue Statement:
                      </h4>
                      <div style={{ background: 'rgba(0,0,0,0.2)', borderLeft: '4px solid #3b82f6', padding: '12px 16px', borderRadius: '6px', fontSize: '0.85rem', lineHeight: '1.5' }}>
                        {modalIssue.description}
                      </div>
                    </div>

                    {/* Complete Student & RO Timeline Logs */}
                    <div>
                      <h4 style={{ fontSize: '0.88rem', fontWeight: '700', color: '#60a5fa', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={16} /> Complete Chronological Log History ({modalIssue.logs?.length || 0} interaction events):
                      </h4>
                      <div className="log-timeline" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px', maxHeight: '220px', overflowY: 'auto' }}>
                        {(modalIssue.logs || []).map((log, idx) => (
                          <div key={idx} className="log-item" style={{ padding: '8px 0', borderBottom: idx < modalIssue.logs.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', display: 'block', lineHeight: '1.4' }}>{log.text}</span>
                            <span className="log-time" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px', display: 'block' }}>{new Date(log.time).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Administrative Action Controls */}
                    <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: '700', margin: 0, color: 'var(--text-primary)' }}>Administrative Action Controls:</h4>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button 
                          onClick={() => { setSelectedIssueId(modalIssue.id); setShowResolveModal(true); setEscalationModalIssueId(null); }} 
                          className="btn btn-success" 
                          style={{ flex: 1, padding: '10px', fontSize: '0.85rem', fontWeight: '600' }}
                        >
                          Administrative Force Resolve & Close Ticket
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <select 
                          className="form-select" 
                          style={{ fontSize: '0.82rem', padding: '8px 12px' }} 
                          value={targetRoId} 
                          onChange={(e) => setTargetRoId(e.target.value)}
                        >
                          <option value="">-- Reassign RO Officer --</option>
                          {db.users.ros.filter(r => r.id !== modalIssue.roId).map(ro => (
                            <option key={ro.id} value={ro.id}>{ro.name}</option>
                          ))}
                        </select>
                        <button 
                          onClick={() => { setSelectedIssueId(modalIssue.id); handleReassign(targetRoId); }} 
                          disabled={!targetRoId} 
                          className="btn btn-secondary" 
                          style={{ padding: '8px 16px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                        >
                          Apply Reassignment
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', marginTop: '16px' }}>
                    <button onClick={() => setEscalationModalIssueId(null)} className="btn btn-secondary">Close Window</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
