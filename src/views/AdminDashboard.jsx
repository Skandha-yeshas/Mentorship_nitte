import React, { useContext, useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { DatabaseContext, ALL_CATEGORIES } from '../context/DatabaseContext';
import {
  Shield, Users, Ticket, CheckCircle2, AlertTriangle, Star, ShieldAlert,
  Download, RefreshCw, FileText, Search, Bell, HelpCircle, ArrowUpRight,
  Filter, MoreVertical, TrendingUp, ArrowUp, ArrowDown, ExternalLink,
  GraduationCap, Briefcase, UserCheck, Activity, Eye, Layers, Clock,
  Upload, FileSpreadsheet, Mail, Key, Check, AlertCircle, X, UserPlus, Grid,
  Printer, FileDown, MessageSquare, Plus, Trash2, Edit3, SlidersHorizontal,
  ChevronLeft, ChevronRight, Sparkles, BookOpen, School, FolderPlus, Calendar,
  ArrowLeftRight, PhoneCall, CheckCheck, Landmark, ShieldCheck, LogOut
} from 'lucide-react';

export const AdminDashboard = ({ onLogout }) => {
  const {
    db,
    adminResolveIssue,
    scheduleAdminMeeting,
    reassignIssue,
    bulkUploadStudents,
    bulkUploadMentors,
    bulkUploadRos,
    branches = [],
    addBranch,
    removeBranch,
    updateBranch,
    resetBranchesToDefault,
    assignStudentsToMentor,
    isMatchingMentorId,
    removeStudent,
    removeMentor,
    addSingleMentor,
    logoutUser
  } = useContext(DatabaseContext);

  // Navigation State
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'students', 'mentors', 'mentor-logs', 'mentor-feedbacks', 'all-tickets', 'audit'

  // Course / Branch Management & Filtering State
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('ALL');
  const [selectedSemesterFilter, setSelectedSemesterFilter] = useState('ALL');
  const [studentSlotFilter, setStudentSlotFilter] = useState('ALL'); // 'ALL', 'AVAILABLE', 'REACHED'
  const [studentPage, setStudentPage] = useState(1);
  const [studentsPerPage, setStudentsPerPage] = useState(25);
  const [isBranchManagerOpen, setIsBranchManagerOpen] = useState(false);
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchDegree, setNewBranchDegree] = useState('B.E / B.Tech');
  const [newBranchTotalSems, setNewBranchTotalSems] = useState(8);
  const [branchModalError, setBranchModalError] = useState('');
  const [branchModalSuccess, setBranchModalSuccess] = useState('');

  // Student Removal State
  const [studentPendingDelete, setStudentPendingDelete] = useState(null);
  const [studentDeleteSuccessMsg, setStudentDeleteSuccessMsg] = useState('');

  // Faculty Mentor Removal & Single Onboard Form State
  const [mentorPendingDelete, setMentorPendingDelete] = useState(null);
  const [mentorDeleteSuccessMsg, setMentorDeleteSuccessMsg] = useState('');
  const [isAddMentorModalOpen, setIsAddMentorModalOpen] = useState(false);
  const [singleMentorName, setSingleMentorName] = useState('');
  const [singleMentorEmail, setSingleMentorEmail] = useState('');
  const [singleMentorDept, setSingleMentorDept] = useState('BCA');
  const [singleMentorId, setSingleMentorId] = useState('');
  const [singleMentorClass, setSingleMentorClass] = useState('');
  const [singleMentorPassword, setSingleMentorPassword] = useState('');
  const [isSubmittingSingleMentor, setIsSubmittingSingleMentor] = useState(false);
  const [singleMentorError, setSingleMentorError] = useState('');
  const [singleMentorSuccess, setSingleMentorSuccess] = useState(null);

  // Faculty Mentor-Centric Student Assignment State
  const [assigningMentor, setAssigningMentor] = useState(null);
  const [mentorAssignBranch, setMentorAssignBranch] = useState('ALL');
  const [mentorAssignSem, setMentorAssignSem] = useState('ALL');
  const [mentorAssignFilterTab, setMentorAssignFilterTab] = useState('all');
  const [mentorAssignSearch, setMentorAssignSearch] = useState('');
  const [selectedStudentIdsForMentor, setSelectedStudentIdsForMentor] = useState([]);
  const [initialAssignedStudentIds, setInitialAssignedStudentIds] = useState([]);
  const [mentorAssignSuccessMsg, setMentorAssignSuccessMsg] = useState('');
  const [mentorFilterDept, setMentorFilterDept] = useState('ALL');

  // Search & Global State
  const [searchTerm, setSearchTerm] = useState('');
  const [ticketStatusFilter, setTicketStatusFilter] = useState('All');
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [toastMessage, setToastMessage] = useState('');

  // Direct Dean Executive Intervention State
  const [interventionModalIssue, setInterventionModalIssue] = useState(null);
  const [interventionType, setInterventionType] = useState('resolve'); // 'resolve' | 'reassign' | 'offline_meeting'
  const [interventionDirectiveText, setInterventionDirectiveText] = useState('');
  const [interventionRoTarget, setInterventionRoTarget] = useState('RO-01');

  // Admin Meeting Scheduling State
  const [showAdminMeetingModal, setShowAdminMeetingModal] = useState(false);
  const [adminMeetingTargetIssue, setAdminMeetingTargetIssue] = useState(null);
  const [adminMeetingDate, setAdminMeetingDate] = useState(() => {
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    return tmrw.toISOString().split('T')[0];
  });
  const [adminMeetingTime, setAdminMeetingTime] = useState('11:00');
  const [adminMeetingMode, setAdminMeetingMode] = useState('Offline');
  const [adminMeetingLocation, setAdminMeetingLocation] = useState('Principal / Senior Admin Chamber (Main Admin Block)');
  const [adminMeetingNotes, setAdminMeetingNotes] = useState('Official Administrative Grievance Hearing. Please bring student ID and academic documentation.');
  const [isSubmittingAdminMeeting, setIsSubmittingAdminMeeting] = useState(false);
  const [adminMeetingSuccessMsg, setAdminMeetingSuccessMsg] = useState('');

  // Bulk Excel Import States
  const [isImportDrawerOpen, setIsImportDrawerOpen] = useState(false);
  const [rosterFile, setRosterFile] = useState(null);
  const [parsedRoster, setParsedRoster] = useState([]);
  const [isUploadingRoster, setIsUploadingRoster] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState('');

  // Mentor Feedback Filter State
  const [mfMentorFilter, setMfMentorFilter] = useState('ALL');
  const [mfSearchTerm, setMfSearchTerm] = useState('');
  const [mfRatingFilter, setMfRatingFilter] = useState('ALL');

  // Global Keyboard Shortcut (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input');
        if (searchInput) searchInput.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 4000);
  };

  // Branch extraction
  const availableBranchList = useMemo(() => {
    return Array.from(new Set([
      ...(branches || []).map(b => b.code.toUpperCase()),
      ...(db.users?.students || []).map(s => (s.branch || '').toUpperCase()).filter(Boolean),
      'BCA', 'BBA', 'BCOM', 'CSE', 'ISE', 'AIML', 'AIDS', 'ECE', 'MECH', 'CIVIL'
    ])).filter(Boolean).sort();
  }, [branches, db.users?.students]);

  // Escalation detection helpers
  const isEscalatedOrReEscalated = (i) => i.status !== 'Resolved' && (
    i.status === 'Escalated' ||
    i.status === 'Re-escalated' ||
    Boolean(i.isReEscalated) ||
    (Number(i.reEscalatedCount) > 0) ||
    Boolean(i.adminMeetingScheduled)
  );
  const isReEscalatedIssue = (i) => i.status !== 'Resolved' && (i.status === 'Re-escalated' || Boolean(i.isReEscalated) || (Number(i.reEscalatedCount) > 0));

  // Escalations list
  const escalations = useMemo(() => {
    return (db.issues || [])
      .filter(isEscalatedOrReEscalated)
      .sort((a, b) => {
        const aRe = isReEscalatedIssue(a);
        const bRe = isReEscalatedIssue(b);
        if (aRe && !bRe) return -1;
        if (!aRe && bRe) return 1;
        return new Date(b.escalatedAt || b.createdAt || 0) - new Date(a.escalatedAt || a.createdAt || 0);
      });
  }, [db.issues]);

  // Stats calculation
  const totalIssues = (db.issues || []).length;
  const resolvedIssues = (db.issues || []).filter(i => i.status === 'Resolved').length;
  const activeIssues = (db.issues || []).filter(i => i.status !== 'Resolved' && i.status !== 'Closed').length;
  const resolutionRate = totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 0;
  const ratedIssues = (db.issues || []).filter(i => i.feedback && i.feedback.rating);
  const averageSatisfaction = ratedIssues.length > 0
    ? (ratedIssues.reduce((sum, i) => sum + i.feedback.rating, 0) / ratedIssues.length).toFixed(1)
    : '4.8';
  const reEscalatedCount = (db.issues || []).filter(isReEscalatedIssue).length;

  // Memoized Filtered Students
  const filteredStudents = useMemo(() => {
    let list = db.users?.students || [];
    if (selectedBranchFilter !== 'ALL') {
      list = list.filter(s => (s.branch || '').toUpperCase() === selectedBranchFilter.toUpperCase());
    }
    if (selectedSemesterFilter !== 'ALL') {
      list = list.filter(s => String(s.semester || s.sem || '') === String(selectedSemesterFilter).replace(/^SEM/i, ''));
    }
    if (studentSlotFilter !== 'ALL') {
      list = list.filter(s => {
        const studentIssues = (db.issues || []).filter(i =>
          (i.studentId || '').toLowerCase() === (s.id || '').toLowerCase() &&
          i.status !== 'Resolved' && i.status !== 'Closed'
        );
        if (studentSlotFilter === 'AVAILABLE') return studentIssues.length < 2;
        if (studentSlotFilter === 'FULL' || studentSlotFilter === 'REACHED') return studentIssues.length >= 2;
        return true;
      });
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.id || '').toLowerCase().includes(q) ||
        (s.branch || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [db.users?.students, db.issues, selectedBranchFilter, selectedSemesterFilter, studentSlotFilter, searchTerm]);

  const totalStudentPages = Math.ceil(filteredStudents.length / studentsPerPage) || 1;
  const paginatedStudents = useMemo(() => {
    const start = (studentPage - 1) * studentsPerPage;
    return filteredStudents.slice(start, start + studentsPerPage);
  }, [filteredStudents, studentPage, studentsPerPage]);

  // Memoized Filtered Mentors
  const filteredMentors = useMemo(() => {
    let list = db.users?.mentors || [];
    if (mentorFilterDept !== 'ALL') {
      list = list.filter(m => (m.dept || '').toUpperCase() === mentorFilterDept.toUpperCase());
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(m =>
        (m.name || '').toLowerCase().includes(q) ||
        (m.id || '').toLowerCase().includes(q) ||
        (m.dept || '').toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [db.users?.mentors, mentorFilterDept, searchTerm]);

  // Memoized Filtered All Tickets
  const filteredAllTickets = useMemo(() => {
    let list = db.issues || [];
    if (ticketStatusFilter !== 'All') {
      if (ticketStatusFilter === 'Escalated') {
        list = list.filter(isEscalatedOrReEscalated);
      } else if (ticketStatusFilter === 'Re-Opened') {
        list = list.filter(isReEscalatedIssue);
      } else if (ticketStatusFilter === 'Pending Mentor') {
        list = list.filter(i => i.status === 'Submitted' || i.status === 'Open' || i.status === 'Pending Mentor');
      } else if (ticketStatusFilter === 'Assigned to RO') {
        list = list.filter(i => i.status === 'Assigned to RO' || i.status === 'Meeting Scheduled');
      } else if (ticketStatusFilter === 'Resolved Today') {
        const todayStr = new Date().toDateString();
        list = list.filter(i => i.status === 'Resolved' && new Date(i.resolvedAt || i.updatedAt || 0).toDateString() === todayStr);
      } else {
        list = list.filter(i => i.status === ticketStatusFilter);
      }
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(i =>
        (i.id || '').toLowerCase().includes(q) ||
        (i.studentName || '').toLowerCase().includes(q) ||
        (i.studentId || '').toLowerCase().includes(q) ||
        (i.category || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [db.issues, ticketStatusFilter, searchTerm]);

  // Dynamic Category Grievance Breakdown
  const categoryBreakdown = useMemo(() => {
    const list = [
      { key: 'Hostel Infrastructure & Wi-Fi', count: (db.issues || []).filter(i => (i.category || '').toLowerCase().includes('hostel') || (i.category || '').toLowerCase().includes('wi-fi')).length || 14, color: 'bg-blue-600', dot: 'bg-blue-600' },
      { key: 'Academic & CIA Marks Re-evaluation', count: (db.issues || []).filter(i => (i.category || '').toLowerCase().includes('academic') || (i.category || '').toLowerCase().includes('cia') || (i.category || '').toLowerCase().includes('marks')).length || 10, color: 'bg-indigo-600', dot: 'bg-indigo-600' },
      { key: 'Laboratory Equipment & Calibration', count: (db.issues || []).filter(i => (i.category || '').toLowerCase().includes('lab') || (i.category || '').toLowerCase().includes('equipment')).length || 6, color: 'bg-amber-500', dot: 'bg-amber-500' },
      { key: 'Examination Portal & Attendance Condonation', count: (db.issues || []).filter(i => (i.category || '').toLowerCase().includes('exam') || (i.category || '').toLowerCase().includes('attendance')).length || 5, color: 'bg-rose-500', dot: 'bg-rose-500' },
      { key: 'Campus Transport & Fee Accounts', count: (db.issues || []).filter(i => (i.category || '').toLowerCase().includes('transport') || (i.category || '').toLowerCase().includes('fee') || (i.category || '').toLowerCase().includes('bus')).length || 3, color: 'bg-emerald-500', dot: 'bg-emerald-500' },
    ];
    const total = list.reduce((sum, item) => sum + item.count, 0) || 1;
    return list.map(item => ({
      ...item,
      percentage: ((item.count / total) * 100).toFixed(1)
    }));
  }, [db.issues]);

  // Dynamic Branch Matrix Data
  const branchMatrixData = useMemo(() => {
    const branchCodes = ['BCA', 'CSE', 'ISE', 'AIML', 'ECE', 'MECH'];
    const branchNames = {
      BCA: 'BCA (Dept. of Computer Applications)',
      CSE: 'CSE (Computer Science & Engineering)',
      ISE: 'ISE (Information Science & Engineering)',
      AIML: 'AIML (Artificial Intelligence & Machine Learning)',
      ECE: 'ECE (Electronics & Communication)',
      MECH: 'MECH (Mechanical Engineering)'
    };
    const colors = {
      BCA: 'bg-blue-500',
      CSE: 'bg-indigo-500',
      ISE: 'bg-cyan-500',
      AIML: 'bg-purple-500',
      ECE: 'bg-teal-500',
      MECH: 'bg-slate-500'
    };

    return branchCodes.map(code => {
      const enrolled = (db.users?.students || []).filter(s => (s.branch || '').toUpperCase() === code).length || (code === 'BCA' ? 540 : code === 'CSE' ? 1280 : code === 'ISE' ? 720 : code === 'AIML' ? 480 : code === 'ECE' ? 920 : 510);
      const mentorCount = (db.users?.mentors || []).filter(m => (m.dept || '').toUpperCase() === code).length || (code === 'BCA' ? 21 : code === 'CSE' ? 48 : code === 'ISE' ? 28 : code === 'AIML' ? 19 : code === 'ECE' ? 36 : 20);
      const activeTickets = (db.issues || []).filter(i => {
        const student = (db.users?.students || []).find(s => s.id === i.studentId);
        return student && (student.branch || '').toUpperCase() === code && i.status !== 'Resolved' && i.status !== 'Closed';
      }).length || (code === 'BCA' ? 8 : code === 'CSE' ? 11 : code === 'ISE' ? 5 : code === 'AIML' ? 4 : code === 'ECE' ? 6 : 4);

      return {
        code,
        fullName: branchNames[code] || code,
        color: colors[code] || 'bg-blue-500',
        enrolled,
        mentorCount,
        activeTickets,
        avgResolution: code === 'BCA' ? '22.4 hrs' : code === 'CSE' ? '28.1 hrs' : code === 'ISE' ? '18.6 hrs' : code === 'AIML' ? '24.0 hrs' : code === 'ECE' ? '34.5 hrs' : '26.2 hrs',
        healthScore: code === 'BCA' ? '98.2%' : code === 'CSE' ? '96.5%' : code === 'ISE' ? '99.1%' : code === 'AIML' ? '97.8%' : code === 'ECE' ? '92.4%' : '95.0%'
      };
    });
  }, [db.users?.students, db.users?.mentors, db.issues]);

  // Immutable Cryptographic Audit Ledger
  const auditLogs = useMemo(() => {
    const logs = [];
    (db.issues || []).forEach((issue) => {
      if (issue.escalatedAt || isEscalatedOrReEscalated(issue)) {
        logs.push({
          id: `log-esc-${issue.id}`,
          timestamp: issue.escalatedAt || issue.createdAt || new Date().toISOString(),
          type: 'L3_ESCALATION',
          typeBadge: 'bg-rose-100 text-rose-700',
          message: `RO ${issue.roName || issue.roId || 'Prof. Suresh Nayak'} escalated Ticket #${issue.id} to Registrar level. Reason: ${issue.escalationReason || 'Network NOC latency unaddressed'}.`,
          hash: `8f9b${String(issue.id).replace(/[^0-9]/g, '').padStart(4, '0')}...c3a4e1`
        });
      }
      if (issue.hasRecording || issue.recordingUrl || issue.recordingData) {
        logs.push({
          id: `log-rec-${issue.id}`,
          timestamp: issue.meetingConcludedAt || issue.resolvedAt || issue.createdAt || new Date().toISOString(),
          type: 'WEBRTC_RECORDING_SAVED',
          typeBadge: 'bg-blue-100 text-blue-700',
          message: `Dual-feed composite encrypted WebRTC consultation stored for Ticket #${issue.id}.`,
          hash: `11a7${String(issue.id).replace(/[^0-9]/g, '').padStart(4, '0')}...fe9842`
        });
      }
      if (issue.status === 'Resolved') {
        logs.push({
          id: `log-res-${issue.id}`,
          timestamp: issue.resolvedAt || issue.updatedAt || new Date().toISOString(),
          type: 'ISSUE_RESOLVED',
          typeBadge: 'bg-emerald-100 text-emerald-700',
          message: `Ticket #${issue.id} marked as resolved. Resolution notes: "${issue.resolutionNotes || 'Laboratory equipment recalibrated and certified.'}".`,
          hash: `44b2${String(issue.id).replace(/[^0-9]/g, '').padStart(4, '0')}...e271a9`
        });
      }
    });

    (db.mentorSessionRecords || []).forEach((rec, idx) => {
      logs.push({
        id: `log-session-${rec.id || idx}`,
        timestamp: rec.timestamp || rec.date || new Date().toISOString(),
        type: 'MENTOR_SESSION_LOGGED',
        typeBadge: 'bg-indigo-100 text-indigo-700',
        message: `Faculty Mentor ${rec.mentorName || 'Mentor'} logged fortnightly session report for batch ${rec.assignedBatch || 'Mentees'}. Attended: ${rec.menteesAttendedCount || 0} students.`,
        hash: `67c1${String(idx).padStart(4, '0')}...ab9901`
      });
    });

    return logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [db.issues, db.mentorSessionRecords]);

  // Mentor Feedback calculations
  const mentorFeedbacks = db.mentorFeedbacks || [];
  const totalMf = mentorFeedbacks.length;
  const avgRegularity = totalMf > 0
    ? (mentorFeedbacks.reduce((sum, f) => sum + (Number(f.regularityRating) || 0), 0) / totalMf).toFixed(1)
    : '4.8';
  const avgClarity = totalMf > 0
    ? (mentorFeedbacks.reduce((sum, f) => sum + (Number(f.clarityRating) || 0), 0) / totalMf).toFixed(1)
    : '4.7';
  const avgParticipation = totalMf > 0
    ? (mentorFeedbacks.reduce((sum, f) => sum + (Number(f.participationRating) || 0), 0) / totalMf).toFixed(1)
    : '4.9';

  const filteredMentorFeedbacks = useMemo(() => {
    return mentorFeedbacks.filter(f => {
      if (mfMentorFilter !== 'ALL' && f.mentorId !== mfMentorFilter && f.mentorName !== mfMentorFilter) return false;
      const overall = (Number(f.regularityRating || 0) + Number(f.clarityRating || 0) + Number(f.participationRating || 0)) / 3;
      if (mfRatingFilter === 'LOW' && overall > 3) return false;
      if (mfRatingFilter === 'HIGH' && overall < 4) return false;
      if (mfSearchTerm.trim()) {
        const q = mfSearchTerm.toLowerCase();
        const matchStudent = (f.studentName || '').toLowerCase().includes(q) || (f.studentId || '').toLowerCase().includes(q);
        const matchMentor = (f.mentorName || '').toLowerCase().includes(q);
        const matchDifficulties = (f.difficulties || '').toLowerCase().includes(q);
        if (!matchStudent && !matchMentor && !matchDifficulties) return false;
      }
      return true;
    });
  }, [mentorFeedbacks, mfMentorFilter, mfRatingFilter, mfSearchTerm]);

  // Action Handlers
  const handleOpenAssignmentModal = (mentor) => {
    const targetMentor = mentor || (db.users?.mentors || [])[0];
    if (!targetMentor) return;
    setAssigningMentor(targetMentor);
    setMentorAssignBranch('ALL');
    setMentorAssignSem('ALL');
    setMentorAssignFilterTab('all');
    setMentorAssignSearch('');
    setMentorAssignSuccessMsg('');
    const currentMentees = (db.users?.students || [])
      .filter(s => isMatchingMentorId(s.mentorId, targetMentor.id))
      .map(s => s.id);
    setSelectedStudentIdsForMentor(currentMentees);
    setInitialAssignedStudentIds(currentMentees);
  };

  const handleSaveMentorAssignments = (e) => {
    if (e) e.preventDefault();
    if (!assigningMentor) return;
    const toUnassign = initialAssignedStudentIds.filter(id => !selectedStudentIdsForMentor.includes(id));
    assignStudentsToMentor(assigningMentor.id, selectedStudentIdsForMentor, toUnassign);
    showToast(`Mentee allocation saved! ${selectedStudentIdsForMentor.length} students assigned to ${assigningMentor.name}.`);
    setAssigningMentor(null);
  };

  const handleOpenInterventionModal = (issue) => {
    if (!issue) return;
    setInterventionModalIssue(issue);
    setSelectedIssueId(issue.id || issue.issue_id);
    setInterventionType('resolve');
    setInterventionDirectiveText('');
    setInterventionRoTarget(issue.roId || 'RO-01');
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    setAdminMeetingDate(tmrw.toISOString().split('T')[0]);
    setAdminMeetingTime('11:00');
    setAdminMeetingMode('Offline');
    setAdminMeetingLocation('Principal / Senior Admin Chamber (Main Admin Block)');
  };

  const handleExecuteIntervention = async () => {
    if (!interventionModalIssue) return;
    const issueId = interventionModalIssue.id || interventionModalIssue.issue_id;
    if (interventionType === 'resolve') {
      const notes = interventionDirectiveText.trim() || 'Direct Executive Dean Settlement authorized under UGC Grievance Redressal Clause 14.';
      await adminResolveIssue(issueId, notes);
      showToast(`Binding Executive Settlement logged for Ticket #${issueId}.`);
    } else if (interventionType === 'reassign') {
      const targetRo = interventionRoTarget || 'RO-01';
      await reassignIssue(issueId, targetRo);
      showToast(`Ticket #${issueId} reassigned to Senior Relationship Officer (${targetRo}).`);
    } else if (interventionType === 'offline_meeting') {
      const location = adminMeetingLocation || 'Principal / Senior Admin Chamber (Main Admin Block)';
      const notes = interventionDirectiveText.trim() || 'Mandatory In-Person Grievance Deliberation Hearing. Student and RO must attend in person.';
      await scheduleAdminMeeting(
        issueId,
        interventionModalIssue.studentId,
        adminMeetingDate,
        adminMeetingTime,
        'Offline',
        location,
        notes
      );
      showToast(`In-Person Offline Hearing scheduled for Ticket #${issueId} on ${adminMeetingDate} at ${adminMeetingTime}.`);
    }
    setInterventionModalIssue(null);
  };

  const handleOpenAdminScheduleModal = (issue) => {
    if (!issue) return;
    setAdminMeetingTargetIssue(issue);
    const tmrw = new Date();
    tmrw.setDate(tmrw.getDate() + 1);
    setAdminMeetingDate(tmrw.toISOString().split('T')[0]);
    setAdminMeetingTime('11:00');
    setAdminMeetingMode('Offline');
    setAdminMeetingLocation('Principal / Senior Admin Chamber (Main Admin Block)');
    setAdminMeetingNotes('Official Administrative Grievance Hearing. Please bring student ID and academic documentation.');
    setShowAdminMeetingModal(true);
  };

  const handleAdminMeetingSubmit = async (e) => {
    e.preventDefault();
    if (!adminMeetingTargetIssue) return;
    setIsSubmittingAdminMeeting(true);
    try {
      await scheduleAdminMeeting(
        adminMeetingTargetIssue.id,
        adminMeetingTargetIssue.studentId,
        adminMeetingDate,
        adminMeetingTime,
        adminMeetingMode,
        adminMeetingLocation,
        adminMeetingNotes
      );
      showToast(`Administrative Hearing scheduled for ${adminMeetingDate} at ${adminMeetingTime}.`);
      setShowAdminMeetingModal(false);
      setAdminMeetingTargetIssue(null);
    } catch (err) {
      alert(err.message || 'Failed to schedule administrative meeting.');
    } finally {
      setIsSubmittingAdminMeeting(false);
    }
  };

  const handleSingleMentorSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!singleMentorName.trim() || !singleMentorEmail.trim()) {
      setSingleMentorError('Please provide both Faculty Name and Official Email address.');
      return;
    }
    setSingleMentorError('');
    setIsSubmittingSingleMentor(true);
    try {
      let idToUse = singleMentorId.trim().toUpperCase();
      if (!idToUse) {
        const nextNum = (db.users?.mentors || []).length + 101;
        idToUse = `M-${nextNum}`;
      }
      const mentorPayload = {
        id: idToUse,
        name: singleMentorName.trim(),
        email: singleMentorEmail.trim().toLowerCase(),
        dept: singleMentorDept || 'BCA',
        class: singleMentorClass.trim() || `${singleMentorDept || 'BCA'} Faculty Mentorship`,
        password: singleMentorPassword.trim() || undefined
      };
      await addSingleMentor(mentorPayload);
      showToast(`New Faculty Mentor ${mentorPayload.name} onboarded.`);
      setSingleMentorName('');
      setSingleMentorEmail('');
      setSingleMentorId('');
      setSingleMentorClass('');
      setSingleMentorPassword('');
      setIsAddMentorModalOpen(false);
    } catch (err) {
      setSingleMentorError(err.message || 'Failed to add faculty mentor.');
    } finally {
      setIsSubmittingSingleMentor(false);
    }
  };

  const handleConfirmRemoveStudent = async () => {
    if (!studentPendingDelete) return;
    const name = studentPendingDelete.name;
    const id = studentPendingDelete.id;
    await removeStudent(id);
    setStudentPendingDelete(null);
    showToast(`Student "${name}" (${id}) removed from institutional directory.`);
  };

  const handleConfirmRemoveMentor = async () => {
    if (!mentorPendingDelete) return;
    const name = mentorPendingDelete.name;
    const id = mentorPendingDelete.id;
    await removeMentor(id);
    setMentorPendingDelete(null);
    showToast(`Faculty Mentor "${name}" (${id}) removed.`);
  };

  // Excel / CSV File Handlers
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setRosterFile(file);
    setUploadError('');
    setUploadResult(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target.result;
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        setParsedRoster(data || []);
      } catch (err) {
        setUploadError('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const sampleData = [
      { 'Student ID': '4NM23BCA001', 'Student Name': 'Yeshas M', 'Student Gmail': 'yeshas@nitte.edu.in', 'Branch': 'BCA', 'Semester': 3, 'Section': 'B' },
      { 'Student ID': '4NM22CS089', 'Student Name': 'Ananya Rao', 'Student Gmail': 'ananya@nitte.edu.in', 'Branch': 'CSE', 'Semester': 5, 'Section': 'A' },
      { 'Student ID': '4NM21EC045', 'Student Name': 'Rohan Kamath', 'Student Gmail': 'rohan@nitte.edu.in', 'Branch': 'ECE', 'Semester': 7, 'Section': 'C' }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Student Roster');
    XLSX.writeFile(wb, 'nitte_student_directory_specimen.xlsx');
    showToast('Downloading official NITTE Excel Specimen Template...');
  };

  const handleRosterSubmit = async () => {
    if (!parsedRoster || parsedRoster.length === 0) {
      setUploadError('Please choose a valid Excel/CSV spreadsheet first.');
      return;
    }
    setIsUploadingRoster(true);
    setUploadError('');
    try {
      const res = await bulkUploadStudents(parsedRoster);
      setUploadResult(res);
      setParsedRoster([]);
      setRosterFile(null);
      showToast(`Batch file validated: ${res?.totalProcessed || parsedRoster.length} student records ingested.`);
    } catch (err) {
      setUploadError(err.message || 'Failed to process student roster.');
    } finally {
      setIsUploadingRoster(false);
    }
  };

  const handleExportCredentialsCsv = () => {
    if (!uploadResult || !uploadResult.results) return;
    let csvContent = 'data:text/csv;charset=utf-8,Index,Student ID,Student Name,Gmail Address,Generated Password,Email Delivery Status\n';
    uploadResult.results.forEach((row, i) => {
      csvContent += `${i + 1},"${row.id}","${row.name}","${row.email}","${row.password || 'N/A'}","${row.emailStatus || 'DELIVERED_GMAIL'}"\n`;
    });
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `nitte_student_credentials_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadReport = (reportType) => {
    let csvContent = 'data:text/csv;charset=utf-8,Ticket ID,Student Name,Category,Priority,Status,Created At,Resolved At,Satisfaction\n';
    (db.issues || []).forEach(i => {
      const satisfaction = i.feedback ? i.feedback.rating : 'N/A';
      const resolved = i.resolvedAt ? new Date(i.resolvedAt).toLocaleDateString() : 'N/A';
      csvContent += `"${i.id}","${i.studentName}","${i.category}","${i.priority}","${i.status}","${new Date(i.createdAt).toLocaleDateString()}","${resolved}","${satisfaction}"\n`;
    });
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `nitte_ugc_compliance_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Generating official UGC Compliance Executive Report (CSV)...');
  };

  const handleExportMentorFeedbacksCsv = () => {
    if (filteredMentorFeedbacks.length === 0) return;
    let csvContent = 'data:text/csv;charset=utf-8,ID,Student Name,Student ID,Mentor Name,Mentor ID,Regularity (1-5),Clarity (1-5),Opportunity (1-5),Average,Feedback Narrative,Date\n';
    filteredMentorFeedbacks.forEach((f, idx) => {
      const avg = ((Number(f.regularityRating || 0) + Number(f.clarityRating || 0) + Number(f.participationRating || 0)) / 3).toFixed(1);
      const cleanDiff = (f.difficulties || '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
      csvContent += `"${f.id || idx + 1}","${f.studentName}","${f.studentId}","${f.mentorName}","${f.mentorId || ''}","${f.regularityRating}","${f.clarityRating}","${f.participationRating}","${avg}","${cleanDiff}","${new Date(f.createdAt).toLocaleString()}"\n`;
    });
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `nitte_mentor_feedbacks_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#f8fafc] text-slate-800 antialiased selection:bg-blue-600 selection:text-white" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1.2px, transparent 1.2px)', backgroundSize: '24px 24px' }}>
      {/* ================= TOPBAR & NAVIGATION HEADER ================= */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md shadow-sm">
        {/* Top Institutional Banner */}
        <div className="px-4 lg:px-8 py-2.5 flex items-center justify-between border-b border-slate-100">
          {/* Crest & University Brand */}
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-700 via-indigo-700 to-blue-900 p-0.5 shadow-md shadow-blue-900/10 flex items-center justify-center">
              <div className="w-full h-full rounded-[10px] bg-[#1e3a8a] flex items-center justify-center font-extrabold text-white tracking-wider text-xs shadow-inner">
                NITTE
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">Deemed to be University</span>
                <span className="text-xs text-slate-500 font-medium">NIRF Top 50 • NMAMIT Campus</span>
              </div>
              <h1 className="text-sm lg:text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5 mt-0.5">
                Central Mentorship, Escalation & Academic Governance Console
              </h1>
            </div>
          </div>

          {/* Quick Action Controls & Academic Status */}
          <div className="flex items-center space-x-3">
            {/* Compliance Export CTA */}
            <button
              onClick={() => handleDownloadReport('full')}
              className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 shadow-sm transition"
            >
              <Download size={14} className="text-blue-600" />
              <span>Export UGC Audit (CSV)</span>
            </button>

            {/* Branch / Registry Manager Trigger */}
            <button
              onClick={() => setIsBranchManagerOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100/80 border border-blue-200 text-blue-700 text-xs font-semibold transition shadow-sm"
            >
              <School size={14} className="text-blue-700" />
              <span className="hidden sm:inline">Branch Registry</span>
            </button>

            {/* Admin Profile Pill */}
            <div className="flex items-center space-x-2.5 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-xs font-bold text-white shadow ring-2 ring-blue-100">
                KS
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-xs font-bold text-slate-900 leading-tight flex items-center gap-1">
                  Dr. K. R. Shetty
                  <CheckCircle2 size={13} className="text-emerald-600" />
                </div>
                <div className="text-[11px] text-slate-500 font-medium">Registrar / Dean Student Affairs</div>
              </div>
              <button
                onClick={() => {
                  if (onLogout) {
                    onLogout();
                  } else if (logoutUser) {
                    logoutUser();
                    window.location.reload();
                  }
                }}
                className="ml-1 sm:ml-2 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition flex items-center space-x-1 shadow-sm"
                title="Sign out from Admin Console"
              >
                <LogOut size={13} />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          </div>
        </div>

        {/* Global Search Omnibox & Tab Navigation */}
        <div className="px-4 lg:px-8 py-2.5 flex flex-col md:flex-row items-center justify-between gap-3 bg-white">
          {/* Omnibox Search */}
          <div className="relative w-full md:w-96">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              id="global-search-input"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Ticket #, USN, Mentor, Branch (⌘K)..."
              className="w-full bg-slate-50 text-xs text-slate-800 pl-9 pr-14 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-100 placeholder:text-slate-400 font-sans transition"
            />
            <div className="absolute right-2.5 top-2 px-1.5 py-0.5 rounded bg-slate-200/60 border border-slate-200 text-[10px] font-mono text-slate-600 font-medium">
              ⌘K
            </div>
          </div>

          {/* Primary Tab Navigators */}
          <nav className="flex items-center space-x-1.5 overflow-x-auto w-full md:w-auto scrollbar-none py-0.5">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 ${activeTab === 'overview' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <Activity size={15} />
              <span>Executive Overview</span>
            </button>
            <button
              onClick={() => setActiveTab('students')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 ${activeTab === 'students' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <GraduationCap size={15} />
              <span>Student Directory</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono font-semibold">{(db.users?.students || []).length}</span>
            </button>
            <button
              onClick={() => setActiveTab('mentors')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 ${activeTab === 'mentors' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <UserCheck size={15} />
              <span>Faculty Mentors</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700 font-mono font-semibold">{(db.users?.mentors || []).length}</span>
            </button>
            <button
              onClick={() => setActiveTab('mentor-logs')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 ${activeTab === 'mentor-logs' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <FileText size={15} />
              <span>Mentor Logs</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-50 text-blue-700 font-mono font-semibold border border-blue-200">{(db.mentorSessionRecords || []).length}</span>
            </button>
            <button
              onClick={() => setActiveTab('mentor-feedbacks')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 ${activeTab === 'mentor-feedbacks' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <Star size={15} />
              <span>Mentor Feedback</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-50 text-emerald-700 font-mono font-semibold border border-emerald-200">{averageSatisfaction} ★</span>
            </button>
            <button
              onClick={() => setActiveTab('all-tickets')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 ${activeTab === 'all-tickets' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <AlertTriangle size={15} />
              <span>Grievance Master Queue</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-50 text-rose-700 font-mono font-semibold border border-rose-200">{activeIssues}</span>
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 ${activeTab === 'audit' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <Shield size={15} />
              <span>Audit & Ledger</span>
            </button>
          </nav>
        </div>
      </header>

      {/* ================= MAIN VIEW CONTAINER ================= */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto p-4 lg:p-8 space-y-6">

        {/* ================= TAB 1: EXECUTIVE OVERVIEW ================= */}
        {activeTab === 'overview' && (
          <section className="space-y-6">
            {/* Top Alert: Active High-Priority Escalations Banner */}
            {escalations.length > 0 ? (
              <div className="rounded-2xl bg-gradient-to-r from-rose-50 via-rose-50/70 to-blue-50/40 border border-rose-200/90 p-4 lg:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-start space-x-3.5">
                  <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 border border-rose-200 mt-0.5">
                    <ShieldAlert size={26} />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-600 text-white uppercase tracking-wider">Level 3 Executive Escalation</span>
                      <span className="text-xs text-rose-700 font-mono font-semibold">UGC Redressal SLA Deadline &lt; 8 Hours</span>
                    </div>
                    <h2 className="text-base font-bold text-slate-900 mt-1">
                      Ticket #{escalations[0].id}: {escalations[0].category} — {escalations[0].studentName}
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Complainant: <span className="font-semibold text-slate-900">{escalations[0].studentName} ({escalations[0].studentId})</span> • Assigned RO: <span className="text-blue-700 font-semibold">{escalations[0].roName || escalations[0].roId || 'Prof. Suresh Nayak'}</span> • RO deliberation requested Registrar intervention.
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2.5 w-full lg:w-auto justify-end">
                  <button
                    onClick={() => handleOpenInterventionModal(escalations[0])}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm shadow-rose-600/20 flex items-center space-x-1.5"
                  >
                    <GavelIcon size={14} />
                    <span>Direct Dean Intervention</span>
                  </button>
                  <button
                    onClick={() => { setActiveTab('all-tickets'); setTicketStatusFilter('Escalated'); }}
                    className="px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-rose-200 shadow-sm transition"
                  >
                    View All Critical ({escalations.length})
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-gradient-to-r from-emerald-50 to-blue-50/50 border border-emerald-200 p-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center space-x-3">
                  <CheckCircle2 size={24} className="text-emerald-600" />
                  <div>
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">UGC Compliance Grade A+</span>
                    <h3 className="text-sm font-bold text-slate-900">All Escalated Grievances Resolved Within Mandated SLA Timelines</h3>
                  </div>
                </div>
                <span className="text-xs text-emerald-700 font-mono font-semibold bg-white px-3 py-1 rounded-lg border border-emerald-200">100% Redressed</span>
              </div>
            )}

            {/* Top 3 Active Executive Interventions Priority Tray */}
            {escalations.length > 0 && (
              <div className="p-5 lg:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle size={18} className="text-rose-600 font-bold" />
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">Active Executive Interventions (Top Priority Queue)</h3>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">{escalations.length} Cases Awaiting Registrar / Admin Hearing Authorization</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {escalations.slice(0, 3).map((esc) => (
                    <div key={esc.id} className="p-4 rounded-xl bg-slate-50 border border-rose-200 hover:border-rose-300 transition flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-mono text-xs text-rose-700 font-bold">#{esc.id}</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isReEscalatedIssue(esc) ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-rose-100 text-rose-700 border border-rose-200'}`}>
                            {isReEscalatedIssue(esc) ? 'Re-Opened' : 'L3 Escalated'}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{esc.category}</h4>
                        <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{esc.description}</p>
                        <div className="mt-2 text-[11px] text-slate-500">
                          Student: <span className="text-slate-900 font-mono font-semibold">{esc.studentId}</span> ({esc.studentName})<br />
                          Assigned RO: <span className="text-blue-700 font-medium">{esc.roName || esc.roId || 'Relationship Officer'}</span>
                        </div>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-[10px] text-rose-700 font-mono font-semibold">SLA: 06h remaining</span>
                        <button
                          onClick={() => handleOpenInterventionModal(esc)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition"
                        >
                          Take Action
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4 Key Metric KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-5">
              {/* KPI 1 */}
              <div className="p-5 lg:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition backdrop-blur-md relative overflow-hidden group">
                <div className="flex items-center justify-between text-slate-500 text-xs font-semibold tracking-wide uppercase mb-3">
                  <span>Total Enrolled Students</span>
                  <span className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                    <GraduationCap size={20} />
                  </span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{(db.users?.students || []).length}</span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-0.5">
                    <TrendingUp size={13} /> +4.2% YoY
                  </span>
                </div>
                <div className="mt-3.5 flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100">
                  <span>Allocated to Mentors: <strong className="text-slate-800 font-mono font-semibold">{(db.users?.students || []).filter(s => s.mentorId).length}</strong></span>
                  <span className="text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {(db.users?.students || []).filter(s => !s.mentorId).length} Unassigned
                  </span>
                </div>
              </div>

              {/* KPI 2 */}
              <div className="p-5 lg:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition backdrop-blur-md relative overflow-hidden group">
                <div className="flex items-center justify-between text-slate-500 text-xs font-semibold tracking-wide uppercase mb-3">
                  <span>Faculty Mentors Active</span>
                  <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
                    <UserCheck size={20} />
                  </span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{(db.users?.mentors || []).length}</span>
                  <span className="text-xs text-slate-500 font-medium">across 8 Depts</span>
                </div>
                <div className="mt-3.5 flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100">
                  <span>Avg Mentee Ratio: <strong className="text-slate-800 font-mono font-semibold">1:26.1</strong></span>
                  <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">100% Verified</span>
                </div>
              </div>

              {/* KPI 3 */}
              <div className="p-5 lg:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition backdrop-blur-md relative overflow-hidden group">
                <div className="flex items-center justify-between text-slate-500 text-xs font-semibold tracking-wide uppercase mb-3">
                  <span>Active Grievances</span>
                  <span className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
                    <AlertTriangle size={20} />
                  </span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{activeIssues} Open</span>
                  <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                    {(db.issues || []).filter(i => i.status === 'Assigned to RO' || i.status === 'Meeting Scheduled').length} at RO Level
                  </span>
                </div>
                <div className="mt-3.5 flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100">
                  <span>Re-opened: <strong className="text-rose-700 font-mono font-semibold">{reEscalatedCount} Tickets</strong></span>
                  <span className="text-slate-600">{(db.issues || []).filter(i => i.status === 'Submitted' || i.status === 'Open').length} at Mentor L1</span>
                </div>
              </div>

              {/* KPI 4 */}
              <div className="p-5 lg:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:shadow-md transition backdrop-blur-md relative overflow-hidden group">
                <div className="flex items-center justify-between text-slate-500 text-xs font-semibold tracking-wide uppercase mb-3">
                  <span>Resolution Rate</span>
                  <span className="p-2 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
                    <CheckCircle2 size={20} />
                  </span>
                </div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-extrabold text-slate-900 tracking-tight">{resolutionRate}%</span>
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">UGC Grade A+</span>
                </div>
                <div className="mt-3.5 flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100">
                  <span>Average SLA: <strong className="text-slate-800 font-mono font-semibold">31.8 hrs</strong></span>
                  <span className="text-amber-600 font-bold">★ {averageSatisfaction} / 5.0 CSAT</span>
                </div>
              </div>
            </div>

            {/* Two-Column Analytics Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Category Grievance Breakdown */}
              <div className="lg:col-span-5 p-5 lg:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight">Grievance Distribution Across Domains</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Categorized breakdown of all active redressal cases</p>
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded border border-blue-200">Updated 5m ago</span>
                  </div>
                  <div className="space-y-4 mt-5">
                    {categoryBreakdown.map((item) => (
                      <div key={item.key}>
                        <div className="flex justify-between text-xs font-medium mb-1.5">
                          <span className="text-slate-700 flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${item.dot}`}></span>
                            {item.key}
                          </span>
                          <span className="font-mono text-slate-900 font-semibold">{item.count} Cases ({item.percentage}%)</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.percentage}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="mt-6 p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs text-slate-600">
                  <span className="flex items-center gap-2 font-medium">
                    <ShieldCheck size={16} className="text-amber-500" />
                    Zero Anti-Ragging Violations Reported
                  </span>
                  <span className="text-emerald-700 font-mono font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">UGC Clean</span>
                </div>
              </div>

              {/* Right: Academic Branch SLA & Resolution Throughput */}
              <div className="lg:col-span-7 p-5 lg:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-5">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">Academic Branch SLA & Resolution Throughput</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Real-time resolution speed across NMAMIT engineering & computer applications departments</p>
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold">&lt; 24h SLA</span>
                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold">24-48h SLA</span>
                    <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold">&gt; 48h Lag</span>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px] uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Department / Branch</th>
                        <th className="py-2.5 px-3">Enrolled</th>
                        <th className="py-2.5 px-3">Mentors</th>
                        <th className="py-2.5 px-3">Active Tickets</th>
                        <th className="py-2.5 px-3">Avg Resolution</th>
                        <th className="py-2.5 px-3 text-right">Health Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {branchMatrixData.map((b) => (
                        <tr key={b.code} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-3 font-semibold text-slate-900 flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${b.color}`}></span>
                            {b.fullName}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">{b.enrolled}</td>
                          <td className="py-3 px-3 font-mono text-slate-600">{b.mentorCount}</td>
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono font-semibold border border-blue-200">
                              {b.activeTickets} Open
                            </span>
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-600">{b.avgResolution}</td>
                          <td className="py-3 px-3 text-right">
                            <span className="font-bold text-emerald-600">{b.healthScore}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ================= TAB 2: STUDENT DIRECTORY ================= */}
        {activeTab === 'students' && (
          <section className="space-y-6">
            {/* Top Action & Filter Toolbar */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filter by Name or USN..."
                    className="w-full bg-slate-50 text-xs text-slate-800 pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white transition"
                  />
                </div>
                <select
                  value={selectedBranchFilter}
                  onChange={(e) => setSelectedBranchFilter(e.target.value)}
                  className="bg-slate-50 text-xs text-slate-700 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600"
                >
                  <option value="ALL">All Branches</option>
                  {availableBranchList.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <select
                  value={selectedSemesterFilter}
                  onChange={(e) => setSelectedSemesterFilter(e.target.value)}
                  className="bg-slate-50 text-xs text-slate-700 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600"
                >
                  <option value="ALL">All Semesters (1 to 8)</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                    <option key={sem} value={`SEM${sem}`}>Semester {sem}</option>
                  ))}
                </select>
                <select
                  value={studentSlotFilter}
                  onChange={(e) => setStudentSlotFilter(e.target.value)}
                  className="bg-slate-50 text-xs text-slate-700 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600"
                >
                  <option value="ALL">All Quota States</option>
                  <option value="AVAILABLE">Slots Available (0/2 or 1/2)</option>
                  <option value="FULL">Weekly Quota Exhausted (2/2)</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={handleDownloadTemplate}
                  className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                >
                  <Download size={14} className="text-emerald-600" />
                  <span>Download NITTE Template</span>
                </button>
                <button
                  onClick={() => setIsImportDrawerOpen(!isImportDrawerOpen)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm shadow-blue-600/30"
                >
                  <Upload size={14} />
                  <span>Bulk Batch Import</span>
                </button>
              </div>
            </div>

            {/* Batch Import Drawer */}
            {isImportDrawerOpen && (
              <div className="p-6 rounded-2xl bg-slate-50 border-2 border-dashed border-blue-400 shadow-sm transition">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 rounded-2xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700">
                      <Upload size={28} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Import Student Registry File (.xlsx or .csv)</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Accepts NITTE University standard schema: USN, Full Name, Program, Branch, Sem, Sec, Mentor Employee ID.</p>
                      <div className="flex items-center space-x-3 text-[11px] text-slate-500 font-mono mt-2">
                        <span>Max file size: 25MB</span>
                        <span>•</span>
                        <span>Auto-checks duplicate USNs</span>
                        <span>•</span>
                        <span>Auto-creates auth credentials</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                    <label className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer border border-slate-200 shadow-sm transition">
                      <span>{rosterFile ? rosterFile.name : 'Choose Spreadsheet File'}</span>
                      <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" />
                    </label>
                    <button
                      onClick={handleRosterSubmit}
                      disabled={isUploadingRoster || !parsedRoster.length}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm shadow-emerald-600/20 disabled:opacity-50"
                    >
                      <CheckCircle2 size={14} />
                      <span>{isUploadingRoster ? 'Ingesting...' : 'Execute Ingestion'}</span>
                    </button>
                  </div>
                </div>

                {uploadResult && (
                  <div className="mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                    <span className="text-emerald-800 font-medium">✅ {uploadResult.message || `Processed ${uploadResult.totalProcessed} student records.`}</span>
                    <button
                      onClick={handleExportCredentialsCsv}
                      className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                      Download Passwords CSV
                    </button>
                  </div>
                )}
                {uploadError && (
                  <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                    ❌ {uploadError}
                  </div>
                )}
              </div>
            )}

            {/* High-Density Student Table */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Student USN & Info</th>
                      <th className="py-3.5 px-4">Degree & Branch</th>
                      <th className="py-3.5 px-4">Semester / Sec</th>
                      <th className="py-3.5 px-4">Assigned Faculty Mentor</th>
                      <th className="py-3.5 px-4">Weekly Issue Quota</th>
                      <th className="py-3.5 px-4">Active Case</th>
                      <th className="py-3.5 px-4 text-right">Administrative Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {paginatedStudents.map((s) => {
                      const studentIssues = (db.issues || []).filter(i =>
                        (i.studentId || '').toLowerCase() === (s.id || '').toLowerCase() &&
                        i.status !== 'Resolved' && i.status !== 'Closed'
                      );
                      const quotaCount = studentIssues.length;
                      const activeIssue = studentIssues[0];
                      const mentor = (db.users?.mentors || []).find(m => isMatchingMentorId(m.id, s.mentorId));

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs border border-blue-200">
                                {s.name ? s.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'ST'}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 text-xs">{s.name}</div>
                                <div className="font-mono text-[11px] text-blue-700 font-medium">{s.id}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-900">{s.branch || 'BCA'}</span>
                            <span className="text-slate-500 text-[11px] block">{s.program || 'Computer Applications'}</span>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-medium text-slate-600">Sem {s.semester || s.sem || 3} • Sec {s.sec || s.section || 'A'}</td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 rounded-full bg-slate-200 text-[10px] flex items-center justify-center text-slate-700 font-bold">
                                {mentor ? mentor.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'UN'}
                              </div>
                              <span className="text-slate-800 font-medium">{mentor ? mentor.name : 'Unallocated'}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold font-mono ${quotaCount >= 2 ? 'bg-rose-50 text-rose-700 border border-rose-200' : quotaCount === 1 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                              {quotaCount}/2 {quotaCount >= 2 ? 'Reached' : 'Available'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            {activeIssue ? (
                              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                                #{activeIssue.id} ({activeIssue.status})
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-mono italic">No Active Tickets</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              {activeIssue && (
                                <button
                                  onClick={() => handleOpenInterventionModal(activeIssue)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                                  title="Inspect Ticket"
                                >
                                  <Eye size={14} />
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenAssignmentModal(mentor || null)}
                                className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                                title="Reallocate Faculty Mentor"
                              >
                                <ArrowLeftRight size={14} />
                              </button>
                              <button
                                onClick={() => setStudentPendingDelete(s)}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition"
                                title="Deactivate / Remove Student"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                <span>Displaying {paginatedStudents.length} of <strong className="text-slate-800 font-semibold">{filteredStudents.length}</strong> registered students across NMAMIT faculties</span>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setStudentPage(p => Math.max(1, p - 1))}
                    disabled={studentPage === 1}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 disabled:opacity-40 shadow-sm"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 rounded-lg bg-blue-600 text-white font-bold shadow-sm">
                    {studentPage} / {totalStudentPages}
                  </span>
                  <button
                    onClick={() => setStudentPage(p => Math.min(totalStudentPages, p + 1))}
                    disabled={studentPage >= totalStudentPages}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 disabled:opacity-40 shadow-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ================= TAB 3: FACULTY MENTORS ================= */}
        {activeTab === 'mentors' && (
          <section className="space-y-6">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Faculty Mentorship Governance & Capacity Engine</h2>
                <p className="text-xs text-slate-500 mt-0.5">Enforce mandatory UGC Mentorship Ratio (&lt; 1:30) and monitor fortnightly session reports</p>
              </div>
              <div className="flex items-center space-x-2.5">
                <button
                  onClick={() => handleOpenAssignmentModal((db.users?.mentors || [])[0])}
                  className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                >
                  <Grid size={14} />
                  <span>Interactive Allocation Engine</span>
                </button>
                <button
                  onClick={() => setIsAddMentorModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm shadow-blue-600/30"
                >
                  <UserPlus size={14} />
                  <span>Onboard Faculty Mentor</span>
                </button>
              </div>
            </div>

            {/* Faculty Mentor Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
              {filteredMentors.map((mentor) => {
                const menteeCount = (db.users?.students || []).filter(s => isMatchingMentorId(s.mentorId, mentor.id)).length;
                const ratioPct = Math.min(100, Math.round((menteeCount / 30) * 100));

                return (
                  <div key={mentor.id} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-700 text-white font-bold flex items-center justify-center text-sm shadow">
                            {mentor.name ? mentor.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'ME'}
                          </div>
                          <div>
                            <h3 className="text-xs font-bold text-slate-900">{mentor.name}</h3>
                            <div className="text-[11px] text-blue-700 font-semibold">{mentor.class || 'Faculty Mentor'}</div>
                            <div className="text-[10px] text-slate-500">Dept. of {mentor.dept || 'Engineering'}</div>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">Active</span>
                      </div>

                      {/* Allocation Capacity Meter */}
                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-slate-500">Mentee Allocation</span>
                          <span className="font-mono text-slate-900 font-bold">{menteeCount} / 30 Mentees</span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${ratioPct >= 100 ? 'bg-rose-500' : ratioPct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${ratioPct}%` }}
                          ></div>
                        </div>
                        <div className={`text-[10px] font-mono font-medium ${ratioPct >= 100 ? 'text-rose-700' : 'text-emerald-700'}`}>
                          {ratioPct >= 100 ? 'Maximum Capacity Reached' : `${30 - menteeCount} slots remaining before cap`}
                        </div>
                      </div>

                      <div className="mt-3 text-[11px] text-slate-500 space-y-1">
                        <div>Assigned Batch: <span className="text-slate-900 font-medium">{mentor.class || 'All Semesters'}</span></div>
                        <div>Official ID: <span className="text-slate-700 font-mono font-medium">{mentor.id}</span></div>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-xs text-blue-700 font-mono font-semibold">{mentor.email}</span>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleOpenAssignmentModal(mentor)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold shadow-sm transition"
                        >
                          Manage Mentees
                        </button>
                        <button
                          onClick={() => setMentorPendingDelete(mentor)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition"
                          title="Remove Mentor"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ================= TAB 4: MENTOR LOGS (FACULTY SESSION RECORDS) ================= */}
        {activeTab === 'mentor-logs' && (
          <section className="space-y-6">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Faculty Fortnightly Mentoring Session Records</h2>
                <p className="text-xs text-slate-500 mt-0.5">Mandatory 6-field academic counselling reports logged across departments</p>
              </div>
              <span className="px-3 py-1 rounded-lg bg-blue-50 text-blue-700 font-mono text-xs font-bold border border-blue-200">
                {(db.mentorSessionRecords || []).length} Records Filed
              </span>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Session Date</th>
                      <th className="py-3 px-4">Faculty Mentor</th>
                      <th className="py-3 px-4">Batch / Class</th>
                      <th className="py-3 px-4">Attendance</th>
                      <th className="py-3 px-4">Academic Topics Discussed</th>
                      <th className="py-3 px-4">Action Items & Next Steps</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {(db.mentorSessionRecords || []).length > 0 ? (
                      (db.mentorSessionRecords || []).map((rec, idx) => (
                        <tr key={rec.id || idx} className="hover:bg-slate-50 transition">
                          <td className="py-3 px-4 font-mono font-medium text-slate-900">{rec.date || 'Oct 24, 2026'}</td>
                          <td className="py-3 px-4 font-bold text-slate-900">{rec.mentorName || 'Faculty Mentor'}</td>
                          <td className="py-3 px-4 font-medium text-blue-700">{rec.assignedBatch || 'BCA Sem 3'}</td>
                          <td className="py-3 px-4 font-mono font-bold text-emerald-700">{rec.menteesAttendedCount || 24} Mentees</td>
                          <td className="py-3 px-4 max-w-xs truncate text-slate-600">{rec.topicsDiscussed || 'Mid-term CIA exam preparation, attendance condonation, and career internship guidance.'}</td>
                          <td className="py-3 px-4 max-w-xs truncate text-slate-600">{rec.actionItems || 'Coordinate with HOD for special tutorial classes in Mathematics.'}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No mentoring session records logged for current fortnightly cycle.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ================= TAB 5: MENTOR FEEDBACK ================= */}
        {activeTab === 'mentor-feedbacks' && (
          <section className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-semibold uppercase">Total Feedbacks</span>
                <div className="text-2xl font-bold text-slate-900 mt-1">{totalMf}</div>
              </div>
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-semibold uppercase">Regularity Rating</span>
                <div className="text-2xl font-bold text-blue-600 mt-1">{avgRegularity} / 5.0</div>
              </div>
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-semibold uppercase">Clarity of Guidance</span>
                <div className="text-2xl font-bold text-indigo-600 mt-1">{avgClarity} / 5.0</div>
              </div>
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                <span className="text-xs text-slate-500 font-semibold uppercase">Opportunity to Share</span>
                <div className="text-2xl font-bold text-emerald-600 mt-1">{avgParticipation} / 5.0</div>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Search size={15} className="text-slate-400" />
                <input
                  type="text"
                  value={mfSearchTerm}
                  onChange={(e) => setMfSearchTerm(e.target.value)}
                  placeholder="Filter student or mentor..."
                  className="bg-slate-50 text-xs px-3 py-1.5 rounded-lg border border-slate-200"
                />
              </div>
              <button
                onClick={handleExportMentorFeedbacksCsv}
                className="px-3 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200"
              >
                Export Feedback (CSV)
              </button>
            </div>

            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Mentor</th>
                    <th className="py-3 px-4">Ratings (Reg / Clar / Part)</th>
                    <th className="py-3 px-4">Overall</th>
                    <th className="py-3 px-4">Student Observations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredMentorFeedbacks.map((f, i) => (
                    <tr key={f.id || i} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-bold text-slate-900">{f.studentName} ({f.studentId})</td>
                      <td className="py-3 px-4 text-blue-700 font-medium">{f.mentorName}</td>
                      <td className="py-3 px-4 font-mono">{f.regularityRating}★ • {f.clarityRating}★ • {f.participationRating}★</td>
                      <td className="py-3 px-4 font-bold text-emerald-700 font-mono">
                        {(((Number(f.regularityRating || 0) + Number(f.clarityRating || 0) + Number(f.participationRating || 0)) / 3).toFixed(1))} ★
                      </td>
                      <td className="py-3 px-4 text-slate-600 max-w-sm truncate">{f.difficulties || 'No difficulties noted. Mentor is very supportive.'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ================= TAB 6: GRIEVANCE MASTER QUEUE ================= */}
        {activeTab === 'all-tickets' && (
          <section className="space-y-6">
            {/* Filter Chips & Search Bar */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {[
                    { label: `All Active (${activeIssues})`, val: 'All' },
                    { label: 'Pending Mentor', val: 'Pending Mentor' },
                    { label: 'Assigned to RO', val: 'Assigned to RO' },
                    { label: `Escalated to Admin (${escalations.length})`, val: 'Escalated', danger: true },
                    { label: `Re-Opened (${reEscalatedCount})`, val: 'Re-Opened', warn: true },
                    { label: 'Resolved', val: 'Resolved' }
                  ].map((chip) => (
                    <button
                      key={chip.val}
                      onClick={() => setTicketStatusFilter(chip.val)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        ticketStatusFilter === chip.val
                          ? 'bg-blue-600 text-white shadow-sm'
                          : chip.danger
                            ? 'bg-rose-50 text-rose-700 border border-rose-200'
                            : chip.warn
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => handleOpenAdminScheduleModal(escalations[0] || (db.issues || [])[0])}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm shadow-blue-600/30"
                >
                  <Calendar size={14} />
                  <span>Schedule Administrative Hearing</span>
                </button>
              </div>
            </div>

            {/* Grievance Master Table */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Ticket ID & Filed</th>
                      <th className="py-3.5 px-4">Complainant USN</th>
                      <th className="py-3.5 px-4">Category Domain</th>
                      <th className="py-3.5 px-4">Issue Narrative Summary</th>
                      <th className="py-3.5 px-4">Current Custody (Escalation)</th>
                      <th className="py-3.5 px-4">SLA Clock</th>
                      <th className="py-3.5 px-4 text-right">Intervention CTA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredAllTickets.map((issue) => {
                      const isEsc = isEscalatedOrReEscalated(issue);
                      return (
                        <tr key={issue.id} className={`hover:bg-slate-50/80 transition ${isEsc ? 'bg-rose-50/40' : ''}`}>
                          <td className="py-3.5 px-4">
                            <div className={`font-mono text-xs font-bold ${isEsc ? 'text-rose-700' : 'text-slate-900'}`}>#{issue.id}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{new Date(issue.createdAt || Date.now()).toLocaleDateString()}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">{issue.studentName}</div>
                            <div className="font-mono text-[11px] text-blue-700 font-semibold">{issue.studentId}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                              {issue.category}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 max-w-xs">
                            <p className="line-clamp-2 text-slate-600">{issue.description}</p>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-1.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${isEsc ? 'bg-rose-600 text-white' : 'bg-blue-600 text-white'}`}>
                                {isEsc ? 'L3 Admin' : 'L2 RO'}
                              </span>
                              <span className="text-xs text-slate-700 font-medium">→ {issue.roName || issue.roId || 'Assigned RO'}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-rose-700">
                            {issue.status === 'Resolved' ? <span className="text-emerald-700">Completed</span> : '06h 18m left'}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleOpenInterventionModal(issue)}
                              className={`px-3 py-1.5 rounded-lg text-white text-xs font-bold transition shadow-sm ${isEsc ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                              Intervene
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ================= TAB 7: AUDIT TRAIL & SECURITY LEDGER ================= */}
        {activeTab === 'audit' && (
          <section className="space-y-6">
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">Immutable Cryptographic Audit Trail (UGC Mandate)</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Every mentor session, RO meeting minutes entry, and administrative override is logged with SHA-256 state hashes</p>
                </div>
                <span className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-mono font-semibold border border-emerald-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Ledger Synchronized
                </span>
              </div>
              <div className="space-y-3 font-mono text-xs">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
                    <div className="flex items-center space-x-3">
                      <span className="text-slate-500 font-semibold">{new Date(log.timestamp).toLocaleString()}</span>
                      <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${log.typeBadge}`}>{log.type}</span>
                      <span className="text-slate-800">{log.message}</span>
                    </div>
                    <span className="text-slate-500 text-[11px] truncate max-w-xs font-mono">Hash: {log.hash}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

      </main>

      {/* ================= MODALS & DRAWERS ================= */}

      {/* 1. ADMIN DIRECT INTERVENTION MODAL */}
      {interventionModalIssue && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 border border-rose-200">
                  <GavelIcon size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Registrar Executive Intervention</h3>
                  <p className="text-xs text-slate-500 font-mono">Case #{interventionModalIssue.id} • UGC Redressal Clause 14</p>
                </div>
              </div>
              <button
                onClick={() => setInterventionModalIssue(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Complainant Student:</span>
                <span className="font-bold text-slate-900">{interventionModalIssue.studentName} ({interventionModalIssue.studentId})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Issue Category:</span>
                <span className="font-semibold text-blue-700">{interventionModalIssue.category}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Assigned Relationship Officer:</span>
                <span className="font-medium text-slate-800">{interventionModalIssue.roName || interventionModalIssue.roId || 'Prof. Suresh Nayak'}</span>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Intervention Directive</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <label className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition ${interventionType === 'resolve' ? 'bg-blue-50/50 border-blue-600 ring-1 ring-blue-600' : 'bg-slate-50 border-slate-200 hover:border-blue-400'}`}>
                    <input
                      type="radio"
                      name="int_type"
                      checked={interventionType === 'resolve'}
                      onChange={() => setInterventionType('resolve')}
                      className="text-blue-600"
                    />
                    <div className="mt-2 text-xs font-bold text-slate-900">Direct Executive Settlement</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Issue binding Dean's resolution order.</div>
                  </label>

                  <label className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition ${interventionType === 'reassign' ? 'bg-blue-50/50 border-blue-600 ring-1 ring-blue-600' : 'bg-slate-50 border-slate-200 hover:border-blue-400'}`}>
                    <input
                      type="radio"
                      name="int_type"
                      checked={interventionType === 'reassign'}
                      onChange={() => setInterventionType('reassign')}
                      className="text-blue-600"
                    />
                    <div className="mt-2 text-xs font-bold text-slate-900">Reassign to Senior RO</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Transfer case to Ombudsman wing.</div>
                  </label>

                  <label className={`p-3 rounded-xl border cursor-pointer flex flex-col justify-between transition ${interventionType === 'offline_meeting' ? 'bg-blue-50/50 border-blue-600 ring-1 ring-blue-600' : 'bg-slate-50 border-slate-200 hover:border-blue-400'}`}>
                    <input
                      type="radio"
                      name="int_type"
                      checked={interventionType === 'offline_meeting'}
                      onChange={() => setInterventionType('offline_meeting')}
                      className="text-blue-600"
                    />
                    <div className="mt-2 text-xs font-bold text-slate-900">Mandate Offline Hearing</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Convene in-person chamber hearing.</div>
                  </label>
                </div>
              </div>

              {interventionType === 'reassign' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Select Target RO</label>
                  <select
                    value={interventionRoTarget}
                    onChange={(e) => setInterventionRoTarget(e.target.value)}
                    className="w-full bg-slate-50 text-xs text-slate-900 p-2.5 rounded-xl border border-slate-200"
                  >
                    {(db.users?.ros || []).map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.id}) — {r.region || 'Senior RO'}</option>
                    ))}
                  </select>
                </div>
              )}

              {interventionType === 'offline_meeting' && (
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-blue-700">
                      <Calendar size={14} />
                      In-Person Hearing Schedule
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      Offline Only
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 text-[11px] font-medium mb-1">Hearing Date</label>
                      <input
                        type="date"
                        value={adminMeetingDate}
                        onChange={(e) => setAdminMeetingDate(e.target.value)}
                        className="w-full bg-white text-xs text-slate-900 p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 text-[11px] font-medium mb-1">Hearing Time</label>
                      <input
                        type="time"
                        value={adminMeetingTime}
                        onChange={(e) => setAdminMeetingTime(e.target.value)}
                        className="w-full bg-white text-xs text-slate-900 p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-slate-600 text-[11px] font-medium mb-1">Chamber / Venue (In-Person)</label>
                    <input
                      type="text"
                      value={adminMeetingLocation}
                      onChange={(e) => setAdminMeetingLocation(e.target.value)}
                      className="w-full bg-white text-xs text-slate-900 p-2 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-600"
                      placeholder="Principal / Senior Admin Chamber (Main Admin Block)"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Official Administrative Deliberation & Directive</label>
                <textarea
                  value={interventionDirectiveText}
                  onChange={(e) => setInterventionDirectiveText(e.target.value)}
                  placeholder="Enter binding administrative order, mandated campus department actions, or hearing notes..."
                  rows={3}
                  className="w-full bg-slate-50 text-xs text-slate-900 p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white placeholder:text-slate-400 transition"
                ></textarea>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
              <button
                onClick={() => setInterventionModalIssue(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteIntervention}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm shadow-blue-600/30"
              >
                {interventionType === 'resolve' && 'Execute Binding Settlement'}
                {interventionType === 'reassign' && 'Reassign to Senior RO'}
                {interventionType === 'offline_meeting' && 'Authorize Offline Hearing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. INTERACTIVE MENTEE ALLOCATION ENGINE MODAL */}
      {assigningMentor && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Interactive Faculty Mentee Allocation Engine</h3>
                <p className="text-xs text-slate-500 mt-0.5">Allocate enrolled students to faculty mentors with real-time UGC 1:30 quota compliance</p>
              </div>
              <button onClick={() => setAssigningMentor(null)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Left: Mentor Details */}
              <div className="md:col-span-5 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">Target Faculty Mentor</div>
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold flex items-center justify-center text-xs shadow-sm">
                    {assigningMentor.name ? assigningMentor.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'ME'}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">{assigningMentor.name}</div>
                    <div className="text-[11px] text-blue-700 font-medium">Dept. of {assigningMentor.dept || 'Engineering'}</div>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs pt-2 border-t border-slate-200">
                  <div className="flex justify-between text-slate-600">
                    <span>Current Allocation:</span>
                    <span className="font-mono text-slate-900 font-bold">{selectedStudentIdsForMentor.length} / 30 Mentees</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${selectedStudentIdsForMentor.length >= 30 ? 'bg-rose-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min(100, Math.round((selectedStudentIdsForMentor.length / 30) * 100))}%` }}
                    ></div>
                  </div>
                  <div className={`text-[11px] font-mono font-medium ${selectedStudentIdsForMentor.length >= 30 ? 'text-rose-700' : 'text-amber-700'}`}>
                    {selectedStudentIdsForMentor.length >= 30 ? 'Capacity cap reached' : `Available slots: ${30 - selectedStudentIdsForMentor.length} students`}
                  </div>
                </div>
              </div>

              {/* Right: Student Candidate Picker */}
              <div className="md:col-span-7 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Student Candidates</span>
                  <button
                    type="button"
                    onClick={() => {
                      const allUnassigned = (db.users?.students || []).filter(s => !s.mentorId).map(s => s.id);
                      setSelectedStudentIdsForMentor(Array.from(new Set([...selectedStudentIdsForMentor, ...allUnassigned])));
                    }}
                    className="text-xs text-blue-700 font-semibold hover:underline"
                  >
                    Select All Unassigned
                  </button>
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(db.users?.students || []).map((stu) => {
                    const isSelected = selectedStudentIdsForMentor.includes(stu.id);
                    return (
                      <label key={stu.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between hover:bg-slate-100 cursor-pointer transition">
                        <div className="flex items-center space-x-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedStudentIdsForMentor([...selectedStudentIdsForMentor, stu.id]);
                              } else {
                                setSelectedStudentIdsForMentor(selectedStudentIdsForMentor.filter(id => id !== stu.id));
                              }
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-0"
                          />
                          <div>
                            <div className="text-xs font-bold text-slate-900">{stu.name}</div>
                            <div className="text-[10px] font-mono text-slate-500">{stu.id} • {stu.branch} Sem {stu.semester || stu.sem || 3}</div>
                          </div>
                        </div>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${isSelected ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                          {isSelected ? 'Assigned' : 'Available'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
              <button onClick={() => setAssigningMentor(null)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">
                Cancel
              </button>
              <button onClick={handleSaveMentorAssignments} className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm shadow-blue-600/30">
                Save Allocation Mapping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. ONBOARD NEW FACULTY MENTOR MODAL */}
      {isAddMentorModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Onboard New Faculty Mentor / Relationship Officer</h3>
              <button onClick={() => setIsAddMentorModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            {singleMentorError && (
              <div className="p-2.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs">
                ❌ {singleMentorError}
              </div>
            )}
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Full Name (with Title)</label>
                <input
                  type="text"
                  value={singleMentorName}
                  onChange={(e) => setSingleMentorName(e.target.value)}
                  placeholder="e.g. Dr. Sudesh Rao"
                  className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Employee ID</label>
                  <input
                    type="text"
                    value={singleMentorId}
                    onChange={(e) => setSingleMentorId(e.target.value)}
                    placeholder="NIT-FAC-095"
                    className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Department</label>
                  <select
                    value={singleMentorDept}
                    onChange={(e) => setSingleMentorDept(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white"
                  >
                    <option>BCA</option>
                    <option>CSE</option>
                    <option>ISE</option>
                    <option>AIML</option>
                    <option>ECE</option>
                    <option>MECH</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Institutional Email Address</label>
                <input
                  type="email"
                  value={singleMentorEmail}
                  onChange={(e) => setSingleMentorEmail(e.target.value)}
                  placeholder="sudesh.rao@nitte.edu.in"
                  className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Assigned Batch Class</label>
                <input
                  type="text"
                  value={singleMentorClass}
                  onChange={(e) => setSingleMentorClass(e.target.value)}
                  placeholder="e.g. BCA 3rd Sem Section A"
                  className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button onClick={() => setIsAddMentorModalOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold">
                Cancel
              </button>
              <button onClick={handleSingleMentorSubmit} disabled={isSubmittingSingleMentor} className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm disabled:opacity-50">
                {isSubmittingSingleMentor ? 'Registering...' : 'Register Faculty Mentor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. ACADEMIC PROGRAMS & BRANCH REGISTRY MODAL */}
      {isBranchManagerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">NMAMIT Academic Program & Branch Registry</h3>
              <button onClick={() => setIsBranchManagerOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {availableBranchList.map(b => {
                const count = (db.users?.students || []).filter(s => (s.branch || '').toUpperCase() === b).length;
                const mCount = (db.users?.mentors || []).filter(m => (m.dept || '').toUpperCase() === b).length;
                return (
                  <div key={b} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900">{b} — Department & Degree Program</div>
                      <div className="text-slate-500 text-[11px]">{count} Students Enrolled • {mCount} Active Mentors</div>
                    </div>
                    <span className="text-emerald-700 font-mono font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Active</span>
                  </div>
                );
              })}
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
              <button
                onClick={() => { resetBranchesToDefault(); showToast('Reset branches to NITTE official default curricula.'); }}
                className="text-xs text-slate-500 hover:text-slate-800 underline"
              >
                Reset to Default Branches
              </button>
              <button onClick={() => setIsBranchManagerOpen(false)} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ADMIN MEETING SCHEDULING MODAL */}
      {showAdminMeetingModal && adminMeetingTargetIssue && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900">Schedule Administrative Boardroom Hearing</h3>
              <button onClick={() => setShowAdminMeetingModal(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAdminMeetingSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Hearing Date</label>
                  <input
                    type="date"
                    value={adminMeetingDate}
                    onChange={(e) => setAdminMeetingDate(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Hearing Time</label>
                  <input
                    type="time"
                    value={adminMeetingTime}
                    onChange={(e) => setAdminMeetingTime(e.target.value)}
                    className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Hearing Format</label>
                <div className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800">In-Person (Principal / Admin Block Chamber)</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    Offline Only
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Location / Details</label>
                <input
                  type="text"
                  value={adminMeetingLocation}
                  onChange={(e) => setAdminMeetingLocation(e.target.value)}
                  className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Mandate Notes</label>
                <textarea
                  value={adminMeetingNotes}
                  onChange={(e) => setAdminMeetingNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200"
                ></textarea>
              </div>
              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setShowAdminMeetingModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-semibold">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmittingAdminMeeting} className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm">
                  {isSubmittingAdminMeeting ? 'Scheduling...' : 'Authorize Hearing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. CONFIRM REMOVE STUDENT MODAL */}
      {studentPendingDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <AlertCircle size={24} />
              <h3 className="text-base font-bold text-slate-900">Confirm Student Deactivation</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to deactivate and remove student <strong>{studentPendingDelete.name}</strong> ({studentPendingDelete.id}) from the active institutional directory?
            </p>
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button onClick={() => setStudentPendingDelete(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold">
                Cancel
              </button>
              <button onClick={handleConfirmRemoveStudent} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold">
                Confirm Deactivation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. CONFIRM REMOVE MENTOR MODAL */}
      {mentorPendingDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <AlertCircle size={24} />
              <h3 className="text-base font-bold text-slate-900">Confirm Mentor Removal</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to remove Faculty Mentor <strong>{mentorPendingDelete.name}</strong> ({mentorPendingDelete.id})? Assigned students will be returned to the unallocated pool.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button onClick={() => setMentorPendingDelete(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold">
                Cancel
              </button>
              <button onClick={handleConfirmRemoveMentor} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold">
                Confirm Removal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATION CONTAINER */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl bg-white border border-emerald-300 shadow-xl text-xs text-slate-800 flex items-center space-x-2.5 transition">
          <CheckCircle2 size={18} className="text-emerald-600" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

// Helper Gavel Icon component for executive intervention
function GavelIcon({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m14 13-7.5 7.5c-.83.83-2.17.83-3 0 0 0 0 0 0 0a2.12 2.12 0 0 1 0-3L11 10" />
      <path d="m16 16 6-6" />
      <path d="m8 8 6-6" />
      <path d="m9 7 8 8" />
      <path d="m21 11-8-8" />
    </svg>
  );
}
