import React, { useContext, useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { DatabaseContext } from '../context/DatabaseContext';
import AdminGrievanceAnalytics from '../components/AdminGrievanceAnalytics';
import { AccountSecurity } from '../components/AccountSecurity';
import {
  Users, Ticket, CheckCircle2, AlertTriangle, Star, ShieldAlert,
  Download, RefreshCw, FileText, Search, Bell, HelpCircle, ArrowUpRight,
  Filter, MoreVertical, TrendingUp, ArrowUp, ArrowDown, ExternalLink,
  GraduationCap, Briefcase, UserCheck, Activity, Eye, Layers, Clock,
  Upload, FileSpreadsheet, Mail, Key, Check, AlertCircle, X, UserPlus, Grid,
  Printer, FileDown, MessageSquare, Plus, Trash2, Edit3, SlidersHorizontal,
  ChevronLeft, ChevronRight, Sparkles, BookOpen, School, FolderPlus, Calendar,
  ArrowLeftRight, PhoneCall, CheckCheck, Landmark, LogOut
} from 'lucide-react';

export const AdminDashboard = ({ onLogout }) => {
  const {
    db,
    authenticatedUser,
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
    removeAllStudents,
    removeMentor,
    removeAllMentors,
    restoreDefaultMentors,
    addSingleMentor,
    removeRo,
    addSingleRo,
    logoutUser
  } = useContext(DatabaseContext);

  // Navigation State
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'students', 'mentors', 'ros', 'mentor-logs', 'mentor-feedbacks', 'all-tickets'

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
  const [isRemoveAllStudentsModalOpen, setIsRemoveAllStudentsModalOpen] = useState(false);
  const [isRemovingAllStudents, setIsRemovingAllStudents] = useState(false);

  // Faculty Mentor Removal & Single Onboard Form State
  const [mentorPendingDelete, setMentorPendingDelete] = useState(null);
  const [mentorDeleteSuccessMsg, setMentorDeleteSuccessMsg] = useState('');
  const [isRemoveAllMentorsModalOpen, setIsRemoveAllMentorsModalOpen] = useState(false);
  const [isRemovingAllMentors, setIsRemovingAllMentors] = useState(false);
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

  // Faculty Mentor Bulk Excel Import States
  const [isMentorImportDrawerOpen, setIsMentorImportDrawerOpen] = useState(false);
  const [mentorRosterFile, setMentorRosterFile] = useState(null);
  const [parsedMentorRoster, setParsedMentorRoster] = useState([]);
  const [isUploadingMentorRoster, setIsUploadingMentorRoster] = useState(false);
  const [mentorUploadResult, setMentorUploadResult] = useState(null);
  const [mentorUploadError, setMentorUploadError] = useState('');

  // Mentor Feedback Filter State
  const [mfMentorFilter, setMfMentorFilter] = useState('ALL');
  const [mfSearchTerm, setMfSearchTerm] = useState('');
  const [selectedFeedbackModal, setSelectedFeedbackModal] = useState(null);

  // Mentor Session Records State
  const [mlSearchTerm, setMlSearchTerm] = useState('');
  const [mlMentorFilter, setMlMentorFilter] = useState('ALL');
  const [mlStatusFilter, setMlStatusFilter] = useState('ALL'); // 'ALL' | 'Submitted' | 'Draft'
  const [selectedMentorReportModal, setSelectedMentorReportModal] = useState(null);

  // Relationship Officer (RO) Management State
  const [roSearchTerm, setRoSearchTerm] = useState('');
  const [roCategoryFilter, setRoCategoryFilter] = useState('ALL');
  const [isRoImportDrawerOpen, setIsRoImportDrawerOpen] = useState(false);
  const [roRosterFile, setRoRosterFile] = useState(null);
  const [parsedRoRoster, setParsedRoRoster] = useState([]);
  const [isUploadingRoRoster, setIsUploadingRoRoster] = useState(false);
  const [roUploadResult, setRoUploadResult] = useState(null);
  const [roUploadError, setRoUploadError] = useState('');
  const [isAddRoModalOpen, setIsAddRoModalOpen] = useState(false);
  const [singleRoId, setSingleRoId] = useState('');
  const [singleRoName, setSingleRoName] = useState('');
  const [singleRoEmail, setSingleRoEmail] = useState('');
  const [singleRoCategory, setSingleRoCategory] = useState('');
  const [singleRoPassword, setSingleRoPassword] = useState('');
  const [isSubmittingSingleRo, setIsSubmittingSingleRo] = useState(false);
  const [singleRoError, setSingleRoError] = useState('');
  const [roPendingDelete, setRoPendingDelete] = useState(null);

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

  // Memoized Filtered Relationship Officers
  const filteredRos = useMemo(() => {
    let list = db.users?.ros || [];
    if (roCategoryFilter !== 'ALL') {
      list = list.filter(r => (r.region ?? r.category ?? '').toLowerCase() === roCategoryFilter.toLowerCase());
    }
    if (roSearchTerm.trim()) {
      const q = roSearchTerm.toLowerCase().trim();
      list = list.filter(r =>
        (r.name || '').toLowerCase().includes(q) ||
        (r.id || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.region ?? r.category ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [db.users?.ros, roCategoryFilter, roSearchTerm]);

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


  // Mentor Feedback calculations (Direct Student-to-Mentor feedback list, no rating averages)
  const mentorFeedbacks = db.mentorFeedbacks || [];
  const totalMf = mentorFeedbacks.length;
  const uniqueStudentsWithFeedback = useMemo(() => {
    return new Set(mentorFeedbacks.map(f => f.studentId || f.student_id)).size;
  }, [mentorFeedbacks]);
  const uniqueMentorsWithFeedback = useMemo(() => {
    return new Set(mentorFeedbacks.map(f => f.mentorId || f.mentor_id)).size;
  }, [mentorFeedbacks]);

  const filteredMentorFeedbacks = useMemo(() => {
    return mentorFeedbacks.filter(f => {
      if (mfMentorFilter !== 'ALL' && f.mentorId !== mfMentorFilter && f.mentorName !== mfMentorFilter) return false;
      if (mfSearchTerm.trim()) {
        const q = mfSearchTerm.toLowerCase();
        const sName = String(f.studentName || f.student_name || '').toLowerCase();
        const sId = String(f.studentId || f.student_id || '').toLowerCase();
        const mName = String(f.mentorName || f.mentor_name || '').toLowerCase();
        const diff = String(f.difficulties || '').toLowerCase();
        if (!sName.includes(q) && !sId.includes(q) && !mName.includes(q) && !diff.includes(q)) return false;
      }
      return true;
    });
  }, [mentorFeedbacks, mfMentorFilter, mfSearchTerm]);

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
      const notes = interventionDirectiveText.trim() || 'Direct Executive Resolution authorized.';
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

  const handleConfirmRemoveAllStudents = async () => {
    setIsRemovingAllStudents(true);
    try {
      await removeAllStudents();
      setIsRemoveAllStudentsModalOpen(false);
      showToast('All students removed from database and local storage.');
    } catch (e) {
      showToast('Failed to remove all students: ' + e.message);
    } finally {
      setIsRemovingAllStudents(false);
    }
  };

  const handleConfirmRemoveMentor = async () => {
    if (!mentorPendingDelete) return;
    const name = mentorPendingDelete.name;
    const id = mentorPendingDelete.id;
    await removeMentor(id);
    setMentorPendingDelete(null);
    showToast(`Faculty Mentor "${name}" (${id}) removed.`);
  };

  const handleConfirmRemoveAllMentors = async () => {
    setIsRemovingAllMentors(true);
    try {
      await removeAllMentors();
      setIsRemoveAllMentorsModalOpen(false);
      showToast('All faculty mentors have been removed. Mentees unassigned.');
    } catch (e) {
      showToast('Failed to remove all mentors: ' + e.message);
    } finally {
      setIsRemovingAllMentors(false);
    }
  };

  const handleRestoreDefaultMentors = () => {
    restoreDefaultMentors();
    showToast('Default faculty mentors restored successfully.');
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
        const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const data = (rawData || []).filter(row =>
          row && typeof row === 'object' && Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '')
        );
        setParsedRoster(data);
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
    const records = (uploadResult && Array.isArray(uploadResult.results) && uploadResult.results.length > 0)
      ? uploadResult.results
      : (db.users?.students || []);

    if (!records || records.length === 0) {
      showToast('No student records available to export.');
      return;
    }

    let csvContent = 'Index,Student ID,Student Name,Gmail Address,Generated Password,Email Delivery Status\n';
    records.forEach((row, i) => {
      const id = String(row.id || '').replace(/"/g, '""');
      const name = String(row.name || '').replace(/"/g, '""');
      const email = String(row.email || '').replace(/"/g, '""');
      const pwd = String(row.password || 'N/A').replace(/"/g, '""');
      const status = String(row.emailStatus || 'REGISTERED').replace(/"/g, '""');
      csvContent += `${i + 1},"${id}","${name}","${email}","${pwd}","${status}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `nitte_student_credentials_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${records.length} student credentials to CSV.`);
  };

  // Faculty Mentor Roster Handlers
  const handleMentorFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setMentorRosterFile(file);
    setMentorUploadError('');
    setMentorUploadResult(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target.result;
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const data = (rawData || []).filter(row =>
          row && typeof row === 'object' && Object.values(row).some(v => v !== null && v !== undefined && String(v).trim() !== '')
        );
        setParsedMentorRoster(data);
      } catch (err) {
        setMentorUploadError('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadMentorTemplate = () => {
    const sampleData = [
      { 'Mentor ID': 'FAC-CSE-01', 'Faculty Name': 'Dr. Rekha Bhandary', 'Official Email': 'rekha.bhandary@nitte.edu.in', 'Department': 'CSE', 'Assigned Class / Batch': '3rd Yr CSE-A & BCA', 'Initial Password': 'Nit#Mnt2026' },
      { 'Mentor ID': 'FAC-CSE-02', 'Faculty Name': 'Prof. Ramesh Naik', 'Official Email': 'ramesh.naik@nitte.edu.in', 'Department': 'CSE', 'Assigned Class / Batch': '5th Sem CSE-B', 'Initial Password': 'Nit#Mnt2026' },
      { 'Mentor ID': 'FAC-BCA-01', 'Faculty Name': 'Prof. Shailaja Shetty', 'Official Email': 'shailaja.s@nitte.edu.in', 'Department': 'BCA', 'Assigned Class / Batch': '3rd Sem BCA-A', 'Initial Password': 'Nit#Mnt2026' },
      { 'Mentor ID': 'FAC-AIML-01', 'Faculty Name': 'Dr. Pradeep Kumar', 'Official Email': 'pradeep.k@nitte.edu.in', 'Department': 'AIML', 'Assigned Class / Batch': '5th Sem AIML', 'Initial Password': 'Nit#Mnt2026' }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Faculty Mentors Roster');
    XLSX.writeFile(wb, 'nitte_faculty_mentor_roster_specimen.xlsx');
    showToast('Downloading official NITTE Faculty Mentor Specimen Template...');
  };

  const handleMentorRosterSubmit = async () => {
    if (!parsedMentorRoster || parsedMentorRoster.length === 0) {
      setMentorUploadError('Please select a valid Excel (.xlsx, .xls) or CSV file with mentor records.');
      return;
    }
    setIsUploadingMentorRoster(true);
    setMentorUploadError('');
    try {
      const res = await bulkUploadMentors(parsedMentorRoster);
      setMentorUploadResult(res);
      setParsedMentorRoster([]);
      setMentorRosterFile(null);
      showToast(`Mentor Batch Ingested: ${res?.count || parsedMentorRoster.length} Faculty Mentors added/updated.`);
    } catch (err) {
      setMentorUploadError(err.message || 'Failed to process faculty mentor roster.');
    } finally {
      setIsUploadingMentorRoster(false);
    }
  };

  const handleExportMentorCredentialsCsv = () => {
    const records = (mentorUploadResult && Array.isArray(mentorUploadResult.results) && mentorUploadResult.results.length > 0)
      ? mentorUploadResult.results
      : (db.users?.mentors || []);

    if (!records || records.length === 0) {
      showToast('No Faculty Mentor records available to export.');
      return;
    }

    let csvContent = 'Index,Faculty ID,Faculty Name,Official Email,Department,Assigned Class / Batch,Generated Password,Delivery Status\n';
    records.forEach((row, i) => {
      const id = String(row.id || '').replace(/"/g, '""');
      const name = String(row.name || '').replace(/"/g, '""');
      const email = String(row.email || '').replace(/"/g, '""');
      const dept = String(row.dept || 'CSE').replace(/"/g, '""');
      const cls = String(row.class || '').replace(/"/g, '""');
      const pwd = String(row.password || 'Not available').replace(/"/g, '""');
      const status = String(row.emailStatus || 'REGISTERED').replace(/"/g, '""');
      csvContent += `${i + 1},"${id}","${name}","${email}","${dept}","${cls}","${pwd}","${status}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `nitte_faculty_mentor_credentials_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${records.length} mentor credentials to CSV.`);
  };

  // RO Roster & Modal Handlers
  const handleRoFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setRoRosterFile(file);
    setRoUploadError('');
    setRoUploadResult(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target.result;
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
        setParsedRoRoster(data || []);
      } catch (err) {
        setRoUploadError('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadRoTemplate = () => {
    const sampleData = [{ 'RO ID': '', 'RO Name': '', 'Official Email': '', 'Assigned Domain Category': '', 'Initial Password': '' }];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RO Roster');
    XLSX.writeFile(wb, 'nitte_relationship_officers_specimen.xlsx');
    showToast('Downloading official NITTE Relationship Officers Specimen Template...');
  };

  const handleRoRosterSubmit = async () => {
    if (!parsedRoRoster || parsedRoRoster.length === 0) {
      setRoUploadError('Please select a valid Excel (.xlsx) or CSV file with RO records.');
      return;
    }
    setIsUploadingRoRoster(true);
    setRoUploadError('');
    try {
      const res = await bulkUploadRos(parsedRoRoster);
      setRoUploadResult(res);
      setParsedRoRoster([]);
      setRoRosterFile(null);
      showToast(`RO Batch Ingested: ${res?.count || parsedRoRoster.length} Relationship Officers added/updated.`);
    } catch (err) {
      setRoUploadError(err.message || 'Failed to process RO roster.');
    } finally {
      setIsUploadingRoRoster(false);
    }
  };

  const handleExportRoCredentialsCsv = () => {
    const records = (roUploadResult && Array.isArray(roUploadResult.results) && roUploadResult.results.length > 0)
      ? roUploadResult.results
      : (db.users?.ros || []);

    if (!records || records.length === 0) {
      showToast('No Relationship Officer records available to export.');
      return;
    }

    let csvContent = 'Index,RO ID,RO Name,Official Email,Domain Category,Initial Password,Delivery Status\n';
    records.forEach((row, i) => {
      const id = String(row.id || '').replace(/"/g, '""');
      const name = String(row.name || '').replace(/"/g, '""');
      const email = String(row.email || '').replace(/"/g, '""');
      const cat = String(row.category || row.region || 'General').replace(/"/g, '""');
      const pwd = String(row.password || 'Not available').replace(/"/g, '""');
      const status = String(row.emailStatus || 'REGISTERED').replace(/"/g, '""');
      csvContent += `${i + 1},"${id}","${name}","${email}","${cat}","${pwd}","${status}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `NITTE_RO_Credentials_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${records.length} RO credentials to CSV.`);
  };

  const handleSingleRoSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!singleRoName.trim() || !singleRoEmail.trim()) {
      setSingleRoError('Please enter both RO Full Name and Official Email.');
      return;
    }
    setSingleRoError('');
    setIsSubmittingSingleRo(true);
    try {
      let roIdToUse = singleRoId.trim().toUpperCase();
      if (!roIdToUse) {
        const nextNum = (db.users?.ros || []).length + 1;
        roIdToUse = `RO-${String(nextNum).padStart(2, '0')}`;
      }
      const roPayload = {
        id: roIdToUse,
        name: singleRoName.trim(),
        email: singleRoEmail.trim().toLowerCase(),
        category: singleRoCategory,
        password: singleRoPassword.trim() || undefined
      };
      await addSingleRo(roPayload);
      showToast(`Relationship Officer ${roPayload.name} (${roPayload.id}) onboarded.`);
      setSingleRoName('');
      setSingleRoEmail('');
      setSingleRoId('');
      setSingleRoPassword('');
      setIsAddRoModalOpen(false);
    } catch (err) {
      setSingleRoError(err.message || 'Failed to onboard Relationship Officer.');
    } finally {
      setIsSubmittingSingleRo(false);
    }
  };

  const handleConfirmRemoveRo = async () => {
    if (!roPendingDelete) return;
    const name = roPendingDelete.name;
    const id = roPendingDelete.id;
    await removeRo(id);
    setRoPendingDelete(null);
    showToast(`Relationship Officer "${name}" (${id}) deactivated.`);
  };

  const handleDownloadReport = (reportType) => {
    let csvContent = 'Ticket ID,Student Name,Category,Priority,Status,Created At,Resolved At,Satisfaction\n';
    (db.issues || []).forEach(i => {
      const satisfaction = i.feedback ? i.feedback.rating : 'N/A';
      const resolved = i.resolvedAt ? new Date(i.resolvedAt).toLocaleDateString() : 'N/A';
      const id = String(i.id || '').replace(/"/g, '""');
      const sName = String(i.studentName || '').replace(/"/g, '""');
      const cat = String(i.category || '').replace(/"/g, '""');
      const prio = String(i.priority || '').replace(/"/g, '""');
      const stat = String(i.status || '').replace(/"/g, '""');
      csvContent += `"${id}","${sName}","${cat}","${prio}","${stat}","${new Date(i.createdAt).toLocaleDateString()}","${resolved}","${satisfaction}"\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `nitte_grievance_report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Generating grievance report (CSV)...');
  };

  const handleExportMentorFeedbacksCsv = () => {
    if (filteredMentorFeedbacks.length === 0) return;
    let csvContent = 'ID,Student Name,Student USN,Faculty Mentor Name,Mentor ID,Student Feedback Narrative,Submission Date\n';
    filteredMentorFeedbacks.forEach((f, idx) => {
      const cleanDiff = (f.difficulties || 'Student shared positive session feedback with no concerns noted.').replace(/"/g, '""').replace(/\r?\n/g, ' ');
      const dateStr = f.createdAt ? new Date(f.createdAt).toLocaleString() : 'Recent';
      csvContent += `"${f.id || idx + 1}","${f.studentName || f.student_name || ''}","${f.studentId || f.student_id || ''}","${f.mentorName || f.mentor_name || ''}","${f.mentorId || f.mentor_id || ''}","${cleanDiff}","${dateStr}"\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `nitte_student_mentor_feedbacks_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Exported student mentor feedbacks to CSV.');
  };

  // Filtered Mentor Session Records for Admin Inspection
  const filteredMentorRecords = useMemo(() => {
    const list = db.mentorSessionRecords || [];
    return list.filter(r => {
      const q = mlSearchTerm.toLowerCase().trim();
      const mentor = (db.users?.mentors || []).find(m => isMatchingMentorId(m.id, r.mentorId || r.mentor_id));
      const mentorName = (r.mentorName || mentor?.name || '').toLowerCase();
      const mentorId = (r.mentorId || r.mentor_id || '').toLowerCase();
      const topic = (r.topic || '').toLowerCase();
      const notes = (r.notes || '').toLowerCase();
      const whichClass = (r.whichClass || r.which_class || r.assignedBatch || '').toLowerCase();
      const location = (r.location || '').toLowerCase();

      const matchesQ = !q || mentorName.includes(q) || mentorId.includes(q) || topic.includes(q) || notes.includes(q) || whichClass.includes(q) || location.includes(q);
      const matchesMentor = mlMentorFilter === 'ALL' || isMatchingMentorId(r.mentorId || r.mentor_id, mlMentorFilter);

      const recordStatus = r.status === 'Draft' ? 'Draft' : 'Submitted';
      const matchesStatus = mlStatusFilter === 'ALL' || recordStatus === mlStatusFilter;

      return matchesQ && matchesMentor && matchesStatus;
    });
  }, [db.mentorSessionRecords, db.users?.mentors, mlSearchTerm, mlMentorFilter, mlStatusFilter, isMatchingMentorId]);

  const handleExportMentorRecordsCsv = () => {
    if (!filteredMentorRecords.length) {
      showToast('No mentor session records found to export.');
      return;
    }

    let csv = 'Record ID,Session Date,Faculty Mentor ID,Faculty Mentor Name,Department,Batch / Class,Students Attended,Topic / Focus,Filing Status,Location,Deliberations Notes,Created At\n';
    filteredMentorRecords.forEach(r => {
      const mentor = (db.users?.mentors || []).find(m => isMatchingMentorId(m.id, r.mentorId || r.mentor_id));
      const id = String(r.id || '').replace(/"/g, '""');
      const date = String(r.sessionDate || r.date || '').replace(/"/g, '""');
      const mId = String(r.mentorId || r.mentor_id || '').replace(/"/g, '""');
      const mName = String(r.mentorName || mentor?.name || 'Faculty Mentor').replace(/"/g, '""');
      const dept = String(mentor?.dept || 'CSE').replace(/"/g, '""');
      const cls = String(r.whichClass || r.which_class || r.assignedBatch || mentor?.class || '3rd Yr CSE').replace(/"/g, '""');
      const att = String(r.studentsAttended !== undefined ? r.studentsAttended : (r.menteesAttendedCount || 0));
      const topic = String(r.topic || 'Fortnightly Mentorship').replace(/"/g, '""');
      const status = String(r.status === 'Draft' ? 'Draft' : 'Submitted').replace(/"/g, '""');
      const loc = String(r.location || 'Seminar Hall').replace(/"/g, '""');
      const notes = String(r.notes || '').replace(/"/g, '""');
      const createdAt = String(r.createdAt || r.created_at || '').replace(/"/g, '""');

      csv += `"${id}","${date}","${mId}","${mName}","${dept}","${cls}",${att},"${topic}","${status}","${loc}","${notes}","${createdAt}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `NITTE_Faculty_Mentoring_Records_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${filteredMentorRecords.length} session records to CSV.`);
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
                <span className="text-xs text-slate-500 font-medium">NIRF Top 50 • NITTE DU</span>
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
              <span>Export Grievance Report (CSV)</span>
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
                {(authenticatedUser?.name || 'Admin').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase()}
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-xs font-bold text-slate-900 leading-tight flex items-center gap-1">
                  {authenticatedUser?.name || 'Administrator'}
                  <CheckCircle2 size={13} className="text-emerald-600" />
                </div>
                <div className="text-[11px] text-slate-500 font-medium">Admin Account · {authenticatedUser?.id}</div>
              </div>
              <div className="ml-1 flex shrink-0 flex-col items-stretch gap-1 sm:ml-2">
              <button
                onClick={() => {
                  if (onLogout) {
                    onLogout();
                  } else if (logoutUser) {
                    logoutUser();
                    window.location.reload();
                  }
                }}
                className="justify-center px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition flex items-center space-x-1 shadow-sm"
                title="Sign out from Admin Console"
              >
                <LogOut size={13} />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
              <AccountSecurity />
              </div>
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
              onClick={() => setActiveTab('ros')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 ${activeTab === 'ros' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <Briefcase size={15} />
              <span>Relationship Officers</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-50 text-amber-800 font-mono font-semibold border border-amber-200">{(db.users?.ros || []).length}</span>
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
              <MessageSquare size={15} />
              <span>Mentor Feedback</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-50 text-blue-700 font-mono font-semibold border border-blue-200">{totalMf}</span>
            </button>
            <button
              onClick={() => setActiveTab('all-tickets')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 ${activeTab === 'all-tickets' ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}
            >
              <AlertTriangle size={15} />
              <span>Grievance Master Queue</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-50 text-rose-700 font-mono font-semibold border border-rose-200">{activeIssues}</span>
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
                      <span className="text-xs text-rose-700 font-mono font-semibold">Resolution SLA &lt; 8 Hours</span>
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
                    <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">All Cases Resolved</span>
                    <h3 className="text-sm font-bold text-slate-900">All Escalated Grievances Resolved Within SLA Timelines</h3>
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
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">Optimal Resolution</span>
                </div>
                <div className="mt-3.5 flex items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-100">
                  <span>Average SLA: <strong className="text-slate-800 font-mono font-semibold">31.8 hrs</strong></span>
                  <span className="text-amber-600 font-bold">★ {averageSatisfaction} / 5.0 CSAT</span>
                </div>
              </div>
            </div>

            <AdminGrievanceAnalytics branches={branches} />
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
                {(db.users?.students || []).length > 0 && (
                  <button
                    onClick={handleExportCredentialsCsv}
                    className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                    title="Export credentials for all current students as CSV"
                  >
                    <Key size={13} className="text-emerald-600" />
                    <span>Download Passwords CSV</span>
                  </button>
                )}
                {(db.users?.students || []).length > 0 && (
                  <button
                    onClick={() => setIsRemoveAllStudentsModalOpen(true)}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                    title="Remove all students from database"
                  >
                    <Trash2 size={13} />
                    <span>Clear All Students</span>
                  </button>
                )}
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
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="py-12 text-center text-slate-400">
                          <Users size={28} className="mx-auto mb-2 text-slate-300" />
                          <p className="font-semibold text-slate-600 text-sm">No Students Registered</p>
                          <p className="text-xs text-slate-400 mt-0.5">Use "Bulk Batch Import" above to ingest an Excel/CSV roster or onboard students.</p>
                        </td>
                      </tr>
                    ) : (
                      paginatedStudents.map((s) => {
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
                    }))}
                  </tbody>
                </table>
              </div>

              {/* Table Pagination */}
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
                <span>Displaying {paginatedStudents.length} of <strong className="text-slate-800 font-semibold">{filteredStudents.length}</strong> registered students across NITTE DU faculties</span>
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
                <p className="text-xs text-slate-500 mt-0.5">Manage mentor allocations and monitor session reports</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(db.users?.mentors || []).length > 0 && (
                  <button
                    onClick={() => setIsRemoveAllMentorsModalOpen(true)}
                    className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                    title="Remove all faculty mentors and unassign mentees"
                  >
                    <Trash2 size={13} />
                    <span>Clear All Mentors</span>
                  </button>
                )}
                {(db.users?.mentors || []).length > 0 && (
                  <button
                    onClick={handleExportMentorCredentialsCsv}
                    className="px-3 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                    title="Export credentials for all current faculty mentors as CSV"
                  >
                    <Key size={13} className="text-emerald-600" />
                    <span>Download Passwords CSV</span>
                  </button>
                )}
                {(db.users?.mentors || []).length > 0 && (
                  <button
                    onClick={() => handleOpenAssignmentModal((db.users?.mentors || [])[0])}
                    className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                  >
                    <Grid size={14} />
                    <span>Interactive Allocation Engine</span>
                  </button>
                )}
                <button
                  onClick={handleDownloadMentorTemplate}
                  className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                  title="Download NITTE Faculty Mentor Excel Specimen Template"
                >
                  <FileSpreadsheet size={14} className="text-emerald-600" />
                  <span>Download Specimen Template</span>
                </button>
                <button
                  onClick={() => setIsMentorImportDrawerOpen(!isMentorImportDrawerOpen)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm shadow-blue-600/30"
                >
                  <Upload size={14} />
                  <span>{isMentorImportDrawerOpen ? 'Close Roster Importer' : 'Bulk Mentor Roster Import'}</span>
                </button>
                <button
                  onClick={() => setIsAddMentorModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm shadow-emerald-600/30"
                >
                  <UserPlus size={14} />
                  <span>Onboard Faculty Mentor</span>
                </button>
              </div>
            </div>

            {/* Faculty Mentor Bulk Roster Import Drawer */}
            {isMentorImportDrawerOpen && (
              <div className="p-6 rounded-2xl bg-slate-50 border-2 border-dashed border-blue-400 shadow-sm transition space-y-4">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 rounded-2xl bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 shrink-0">
                      <GraduationCap size={28} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Import Faculty Mentor Registry (.xlsx or .csv)</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Upload official NITTE Faculty Mentors spreadsheet: Mentor ID / Faculty ID, Full Name, Official Email, Department, Assigned Class / Batch, Initial Password.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono mt-2">
                        <span>Max file size: 25MB</span>
                        <span>•</span>
                        <span>Auto-creates LDAP Credentials</span>
                        <span>•</span>
                        <span>Direct Supabase Cloud Synchronization</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                    <label className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer border border-slate-200 shadow-sm transition">
                      <span>{mentorRosterFile ? mentorRosterFile.name : 'Choose Faculty Spreadsheet File'}</span>
                      <input
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        onChange={handleMentorFileSelect}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={handleMentorRosterSubmit}
                      disabled={isUploadingMentorRoster || !parsedMentorRoster.length}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm shadow-blue-600/20 disabled:opacity-50"
                    >
                      <Upload size={14} />
                      <span>{isUploadingMentorRoster ? 'Ingesting...' : `Ingest ${parsedMentorRoster.length || 0} Faculty Records`}</span>
                    </button>
                  </div>
                </div>

                {mentorUploadError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center space-x-2">
                    <AlertCircle size={15} />
                    <span>{mentorUploadError}</span>
                  </div>
                )}

                {/* Parsed Preview Table */}
                {parsedMentorRoster.length > 0 && !mentorUploadResult && (
                  <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span>Preview of Parsed Faculty Mentor Roster ({parsedMentorRoster.length} Rows Detected)</span>
                      <span className="text-[11px] text-slate-500 font-mono">Ready to Ingest</span>
                    </div>
                    <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px]">
                          <tr>
                            <th className="py-2 px-3">#</th>
                            <th className="py-2 px-3">Mentor ID</th>
                            <th className="py-2 px-3">Faculty Name</th>
                            <th className="py-2 px-3">Official Email</th>
                            <th className="py-2 px-3">Department</th>
                            <th className="py-2 px-3">Assigned Batch / Class</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {parsedMentorRoster.slice(0, 10).map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono text-slate-400">{i + 1}</td>
                              <td className="py-2 px-3 font-mono font-bold text-blue-700">
                                {r['Mentor ID'] || r['Faculty ID'] || r.id || `M-${101 + i}`}
                              </td>
                              <td className="py-2 px-3 font-semibold text-slate-900">
                                {r['Faculty Name'] || r['Mentor Name'] || r.name || 'Faculty Member'}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-600">
                                {r['Official Email'] || r['Email'] || r.email || 'N/A'}
                              </td>
                              <td className="py-2 px-3 text-slate-700">
                                {r['Department'] || r['Dept'] || r.dept || 'CSE'}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-500">
                                {r['Assigned Class / Batch'] || r['Assigned Batch'] || r.class || 'General Mentorship'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {parsedMentorRoster.length > 10 && (
                        <div className="p-2 text-center text-[11px] text-slate-500 bg-slate-50 border-t border-slate-200">
                          ... and {parsedMentorRoster.length - 10} more rows
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Ingestion Results Card */}
                {mentorUploadResult && (
                  <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-emerald-800 font-bold">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        <span>Faculty Mentor Ingestion Complete: {mentorUploadResult.count || parsedMentorRoster.length} Mentors Active</span>
                      </div>
                      <button
                        onClick={handleExportMentorCredentialsCsv}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold transition flex items-center space-x-1.5 shadow-sm"
                      >
                        <Key size={13} />
                        <span>Download Passwords CSV</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Faculty Mentor Cards Grid or Clean Empty State */}
            {(db.users?.mentors || []).length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                  <UserPlus size={28} />
                </div>
                <div className="max-w-md mx-auto">
                  <h3 className="text-base font-bold text-slate-900">No Faculty Mentors Active</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    No faculty mentors currently provisioned. You can onboard individual faculty mentors or upload a faculty roster via Excel spreadsheet.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => setIsAddMentorModalOpen(true)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm shadow-blue-600/20"
                  >
                    <UserPlus size={14} />
                    <span>Onboard Faculty Mentor</span>
                  </button>
                  <button
                    onClick={() => setIsMentorImportDrawerOpen(true)}
                    className="px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition flex items-center space-x-1.5 border border-slate-200 shadow-sm"
                  >
                    <Upload size={14} />
                    <span>Bulk Import Roster</span>
                  </button>
                </div>
              </div>
            ) : filteredMentors.length === 0 ? (
              <div className="p-8 text-center rounded-2xl bg-white border border-slate-200 shadow-sm">
                <p className="text-sm font-semibold text-slate-700">No faculty mentors match the selected department or search filter.</p>
              </div>
            ) : (
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
            )}
          </section>
        )}

        {/* ================= TAB: RELATIONSHIP OFFICERS (RO MODULE) ================= */}
        {activeTab === 'ros' && (
          <section className="space-y-6">
            {/* Header & Controls */}
            <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <h2 className="text-base font-bold text-slate-900 tracking-tight">Relationship Officers (RO) Registry & Governance</h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Manage institutional Relationship Officers, assign specialized domain categories, and import officer rosters</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleDownloadRoTemplate}
                  className="px-3 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                >
                  <FileSpreadsheet size={14} className="text-emerald-600" />
                  <span>Download RO Excel Specimen</span>
                </button>
                <button
                  onClick={() => setIsRoImportDrawerOpen(!isRoImportDrawerOpen)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm shadow-blue-600/30"
                >
                  <Upload size={14} />
                  <span>{isRoImportDrawerOpen ? 'Close Roster Importer' : 'Bulk RO Roster Import'}</span>
                </button>
                <button
                  onClick={() => {
                    const nextNum = (db.users?.ros || []).length + 1;
                    setSingleRoId(`RO-${String(nextNum).padStart(2, '0')}`);
                    setIsAddRoModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm shadow-emerald-600/30"
                >
                  <UserPlus size={14} />
                  <span>Onboard Relationship Officer</span>
                </button>
              </div>
            </div>

            {/* Bulk RO Roster Import Drawer */}
            {isRoImportDrawerOpen && (
              <div className="p-6 rounded-2xl bg-slate-50 border-2 border-dashed border-blue-400 shadow-sm transition space-y-4">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-700">
                      <Briefcase size={28} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">Import Relationship Officers Registry (.xlsx or .csv)</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Upload official NITTE RO roster spreadsheet: RO ID, RO Name, Official Email, Assigned Domain Category, Initial Password.</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 font-mono mt-2">
                        <span>Max file size: 25MB</span>
                        <span>•</span>
                        <span>Auto-creates LDAP Credentials</span>
                        <span>•</span>
                        <span>Overwrites/Updates matching RO IDs</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
                    <label className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold cursor-pointer border border-slate-200 shadow-sm transition">
                      <span>{roRosterFile ? roRosterFile.name : 'Choose RO Spreadsheet File'}</span>
                      <input
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        onChange={handleRoFileSelect}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={handleRoRosterSubmit}
                      disabled={isUploadingRoRoster || !parsedRoRoster.length}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm shadow-emerald-600/20 disabled:opacity-50"
                    >
                      <Upload size={14} />
                      <span>{isUploadingRoRoster ? 'Ingesting...' : `Ingest ${parsedRoRoster.length || 0} RO Records`}</span>
                    </button>
                  </div>
                </div>

                {roUploadError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center space-x-2">
                    <AlertCircle size={15} />
                    <span>{roUploadError}</span>
                  </div>
                )}

                {/* Parsed Preview Table */}
                {parsedRoRoster.length > 0 && !roUploadResult && (
                  <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span>Preview of Parsed RO Roster ({parsedRoRoster.length} Rows Detected)</span>
                      <span className="text-[11px] text-slate-500 font-mono">Ready to Ingest</span>
                    </div>
                    <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px]">
                          <tr>
                            <th className="py-2 px-3">#</th>
                            <th className="py-2 px-3">RO ID</th>
                            <th className="py-2 px-3">Full Name</th>
                            <th className="py-2 px-3">Official Email</th>
                            <th className="py-2 px-3">Domain Category</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-700">
                          {parsedRoRoster.slice(0, 10).map((r, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono text-slate-400">{i + 1}</td>
                              <td className="py-2 px-3 font-mono font-bold text-blue-700">{r['RO ID'] || r.id || r.roId || `RO-${100 + i}`}</td>
                              <td className="py-2 px-3 font-semibold text-slate-900">{r['RO Name'] || r.name || r.roName || 'Officer'}</td>
                              <td className="py-2 px-3 font-mono text-slate-600">{r['Official Email'] || r.email || r.Email || 'N/A'}</td>
                              <td className="py-2 px-3 text-slate-700">{r['Assigned Domain Category'] || r.category || 'General Support'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {parsedRoRoster.length > 10 && (
                        <div className="p-2 text-center text-[11px] text-slate-500 bg-slate-50 border-t border-slate-200">
                          ... and {parsedRoRoster.length - 10} more rows
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Ingestion Results Card */}
                {roUploadResult && (
                  <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-3 text-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-emerald-800 font-bold">
                        <CheckCircle2 size={16} className="text-emerald-600" />
                        <span>RO Roster Ingestion Complete: {roUploadResult.count || parsedRoRoster.length} Officers Provisioned</span>
                      </div>
                      <button
                        onClick={handleExportRoCredentialsCsv}
                        className="px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold transition flex items-center space-x-1.5 shadow-sm"
                      >
                        <Download size={13} />
                        <span>Export RO Credentials (CSV)</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-emerald-700">
                      All Relationship Officers can now authenticate using their official institutional email ID or RO-ID with standard or generated passwords.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Filter & Search Bar */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-64">
                  <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={roSearchTerm}
                    onChange={(e) => setRoSearchTerm(e.target.value)}
                    placeholder="Search by RO Name, ID, Email..."
                    className="w-full bg-slate-50 text-xs text-slate-800 pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white transition"
                  />
                </div>
                <select
                  value={roCategoryFilter}
                  onChange={(e) => setRoCategoryFilter(e.target.value)}
                  className="bg-slate-50 text-xs text-slate-700 px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600"
                >
                  <option value="ALL">All Domain Categories</option>
                  {Array.from(new Set((db.users?.ros || []).map(r => r.region ?? r.category).filter(Boolean))).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                Showing <strong className="text-slate-800">{filteredRos.length}</strong> of {(db.users?.ros || []).length} Relationship Officers
              </span>
            </div>

            {/* RO High-Density Table */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Officer ID & Info</th>
                      <th className="py-3.5 px-4">Assigned Domain Category</th>
                      <th className="py-3.5 px-4">Official Email</th>
                      <th className="py-3.5 px-4">Active Ticket Caseload</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredRos.length > 0 ? (
                      filteredRos.map((ro) => {
                        const activeCaseload = (db.issues || []).filter(i =>
                          (String(i.roId || '').toUpperCase() === String(ro.id || '').toUpperCase() ||
                           String(i.roName || '').toLowerCase() === String(ro.name || '').toLowerCase()) &&
                          i.status !== 'Resolved' && i.status !== 'Closed'
                        ).length;

                        return (
                          <tr key={ro.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-3.5 px-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-600 to-indigo-700 text-white font-bold flex items-center justify-center text-xs shadow-sm">
                                  {ro.name ? ro.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'RO'}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-900 text-xs">{ro.name}</div>
                                  <div className="font-mono text-[11px] text-blue-700 font-semibold">{ro.id}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
                                {ro.region ?? ro.category ?? 'Unassigned'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 font-mono text-[11px]">
                              <div className="text-slate-800">{ro.email}</div>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                                activeCaseload > 5
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : activeCaseload > 0
                                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}>
                                {activeCaseload} Active {activeCaseload === 1 ? 'Case' : 'Cases'}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <div className="flex items-center justify-end space-x-2">
                                <button
                                  onClick={() => {
                                    setTicketStatusFilter('All');
                                    setSearchTerm(ro.name || ro.id);
                                    setActiveTab('all-tickets');
                                  }}
                                  className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
                                  title="View Assigned Tickets"
                                >
                                  <Eye size={14} />
                                </button>
                                <button
                                  onClick={() => setRoPendingDelete(ro)}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition"
                                  title="Deactivate Relationship Officer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                          No Relationship Officers found matching the search criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* ================= TAB 4: MENTOR LOGS (FACULTY SESSION RECORDS) ================= */}
        {activeTab === 'mentor-logs' && (() => {
          const allRecords = db.mentorSessionRecords || [];
          const submittedCount = allRecords.filter(r => r.status !== 'Draft').length;
          const draftCount = allRecords.filter(r => r.status === 'Draft').length;
          const uniqueMentorIds = new Set(allRecords.map(r => r.mentorId || r.mentor_id).filter(Boolean));

          return (
            <section className="space-y-6">
              {/* Telemetry Metric Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Total Session Reports</span>
                    <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">{allRecords.length}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Logged across cohorts</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <FileText size={20} />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-emerald-700 font-semibold uppercase tracking-wider">Submitted Reports</span>
                    <div className="text-2xl font-bold text-emerald-700 mt-1 font-mono">{submittedCount}</div>
                    <div className="text-[11px] text-emerald-600/80 mt-0.5">Submitted by mentors</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 size={20} />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-amber-700 font-semibold uppercase tracking-wider">Drafts Saved</span>
                    <div className="text-2xl font-bold text-amber-700 mt-1 font-mono">{draftCount}</div>
                    <div className="text-[11px] text-amber-600/80 mt-0.5">Pending submission</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Clock size={20} />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Active Faculty Reporting</span>
                    <div className="text-2xl font-bold text-slate-900 mt-1 font-mono">{uniqueMentorIds.size}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Advisors with session logs</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <UserCheck size={20} />
                  </div>
                </div>
              </div>

              {/* Filter & Search Toolbar */}
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={mlSearchTerm}
                      onChange={(e) => setMlSearchTerm(e.target.value)}
                      placeholder="Search by mentor name, USN, topic, class, notes, or venue..."
                      className="w-full bg-slate-50 text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800"
                    />
                  </div>

                  <select
                    value={mlMentorFilter}
                    onChange={(e) => setMlMentorFilter(e.target.value)}
                    className="bg-slate-50 text-xs px-3 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ALL">All Faculty Mentors</option>
                    {(db.users?.mentors || []).map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.dept || 'Dept'})</option>
                    ))}
                  </select>

                  <select
                    value={mlStatusFilter}
                    onChange={(e) => setMlStatusFilter(e.target.value)}
                    className="bg-slate-50 text-xs px-3 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="Submitted">Submitted Only</option>
                    <option value="Draft">Drafts Only</option>
                  </select>
                </div>

                <button
                  onClick={handleExportMentorRecordsCsv}
                  className="px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 shadow-sm transition flex items-center justify-center space-x-1.5 shrink-0"
                >
                  <Download size={13} />
                  <span>Export Records (CSV)</span>
                </button>
              </div>

              {/* Records Table */}
              {filteredMentorRecords.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                    <FileText size={24} />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900">No Mentoring Session Records Found</h3>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    {allRecords.length === 0
                      ? "Faculty mentors have not yet submitted any reports. When mentors submit or draft session reports, they will automatically appear here."
                      : "No records match the current search or status filter."}
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-3 px-4">Session Date</th>
                          <th className="py-3 px-4">Faculty Mentor</th>
                          <th className="py-3 px-4">Cohort / Class</th>
                          <th className="py-3 px-4">Attendance</th>
                          <th className="py-3 px-4">Deliberation & Academic Focus</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {filteredMentorRecords.map((rec, idx) => {
                          const mentor = (db.users?.mentors || []).find(m => isMatchingMentorId(m.id, rec.mentorId || rec.mentor_id));
                          const mentorName = rec.mentorName || mentor?.name || 'Faculty Mentor';
                          const isDraft = rec.status === 'Draft';
                          const displayDate = rec.sessionDate || rec.date || (rec.createdAt ? new Date(rec.createdAt).toLocaleDateString() : 'Recent');
                          const attendedCount = rec.studentsAttended !== undefined ? rec.studentsAttended : (rec.menteesAttendedCount || 0);
                          const cohort = rec.whichClass || rec.which_class || rec.assignedBatch || mentor?.class || '3rd Yr CSE';

                          return (
                            <tr key={rec.id || idx} className="hover:bg-slate-50/80 transition">
                              <td className="py-3 px-4 font-mono font-medium text-slate-900 whitespace-nowrap">
                                <div>{displayDate}</div>
                                <div className="text-[10px] text-slate-400 font-sans">{rec.location || 'Seminar Hall'}</div>
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-bold text-slate-900">{mentorName}</div>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="font-mono text-[10px] text-blue-700 font-semibold">{rec.mentorId || rec.mentor_id || mentor?.id}</span>
                                  <span className="text-slate-300">•</span>
                                  <span className="px-1.5 py-0.2 rounded bg-slate-100 text-[10px] text-slate-600 font-semibold">{mentor?.dept || 'CSE'}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-medium text-blue-800">
                                {cohort}
                              </td>
                              <td className="py-3 px-4 font-mono font-bold text-emerald-700 whitespace-nowrap">
                                {attendedCount} Mentees Present
                              </td>
                              <td className="py-3 px-4 max-w-sm">
                                <div className="font-semibold text-slate-800 line-clamp-1">{rec.topic || 'Mentorship Session'}</div>
                                {rec.notes && (
                                  <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                    {rec.notes}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                {isDraft ? (
                                  <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-[11px] font-bold border border-amber-200 inline-flex items-center gap-1">
                                    <Clock size={12} />
                                    <span>Draft Saved</span>
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200 inline-flex items-center gap-1">
                                    <CheckCircle2 size={12} />
                                    <span>Submitted</span>
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                <button
                                  onClick={() => setSelectedMentorReportModal({ ...rec, mentor, mentorName, displayDate, attendedCount, cohort })}
                                  className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold shadow-sm transition inline-flex items-center space-x-1"
                                >
                                  <Eye size={12} />
                                  <span>View Full Report</span>
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
            </section>
          );
        })()}

        {/* ================= TAB 5: STUDENT FEEDBACK ON MENTORS ================= */}
        {activeTab === 'mentor-feedbacks' && (
          <section className="space-y-6">
            {/* Header & Metrics (No rating averages, just student feedback counts) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Total Feedbacks Logged</span>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{totalMf}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Submitted by students</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <MessageSquare size={20} />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Students Participating</span>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{uniqueStudentsWithFeedback}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Active mentee respondents</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                  <Users size={20} />
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Faculty Mentors Covered</span>
                  <div className="text-2xl font-bold text-slate-900 mt-1">{uniqueMentorsWithFeedback}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Mentors with feedback entries</div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <GraduationCap size={20} />
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={mfSearchTerm}
                    onChange={(e) => setMfSearchTerm(e.target.value)}
                    placeholder="Search by student name, USN, mentor, or feedback text..."
                    className="w-full bg-slate-50 text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <select
                  value={mfMentorFilter}
                  onChange={(e) => setMfMentorFilter(e.target.value)}
                  className="bg-slate-50 text-xs px-3 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">All Faculty Mentors</option>
                  {(db.users?.mentors || []).map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.dept || 'Dept'})</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleExportMentorFeedbacksCsv}
                className="px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 shadow-sm transition flex items-center justify-center space-x-1.5"
              >
                <Download size={13} />
                <span>Export Feedbacks (CSV)</span>
              </button>
            </div>

            {/* Feedback Records Table */}
            {filteredMentorFeedbacks.length === 0 ? (
              <div className="p-12 text-center rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                  <MessageSquare size={24} />
                </div>
                <h3 className="text-sm font-bold text-slate-900">No Student Feedbacks Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {totalMf === 0
                    ? "Students have not yet submitted feedback for their assigned faculty mentors. When they do, their observations will appear here."
                    : "No feedbacks match the current search or mentor filter."}
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-3 px-4">Student Details</th>
                        <th className="py-3 px-4">Assigned Mentor</th>
                        <th className="py-3 px-4">Submission Date</th>
                        <th className="py-3 px-4">Student Observations & Feedback</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {filteredMentorFeedbacks.map((f, i) => {
                        const student = (db.users?.students || []).find(s => String(s.id).toUpperCase() === String(f.studentId || f.student_id).toUpperCase());
                        const mentor = (db.users?.mentors || []).find(m => isMatchingMentorId(m.id, f.mentorId || f.mentor_id));
                        const feedbackText = f.difficulties || 'Student submitted positive mentorship session feedback with no concerns noted.';
                        return (
                          <tr key={f.id || i} className="hover:bg-slate-50/80 transition">
                            <td className="py-3.5 px-4">
                              <div className="font-bold text-slate-900">{f.studentName || f.student_name || student?.name || 'Student'}</div>
                              <div className="font-mono text-[11px] text-blue-700 font-semibold">{f.studentId || f.student_id || student?.id}</div>
                              {student && (
                                <div className="text-[10px] text-slate-400 mt-0.5">{student.branch || 'Branch'} • Sem {student.sem || 5}</div>
                              )}
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="font-semibold text-slate-800">{f.mentorName || f.mentor_name || mentor?.name || 'Faculty Mentor'}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{f.mentorId || f.mentor_id || mentor?.id || 'Mentor'}</div>
                              {mentor && (
                                <div className="text-[10px] text-slate-400">{mentor.dept || 'Engineering'}</div>
                              )}
                            </td>
                            <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                              {f.createdAt ? new Date(f.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Recent'}
                            </td>
                            <td className="py-3.5 px-4 max-w-md">
                              <p className="line-clamp-2 text-slate-700 text-xs leading-relaxed bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                                "{feedbackText}"
                              </p>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                onClick={() => setSelectedFeedbackModal({ ...f, fullText: feedbackText, student, mentor })}
                                className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold shadow-sm transition inline-flex items-center space-x-1"
                              >
                                <Eye size={12} />
                                <span>View Full</span>
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
                  <p className="text-xs text-slate-500 font-mono">Case #{interventionModalIssue.id}</p>
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
                <p className="text-xs text-slate-500 mt-0.5">Allocate enrolled students to faculty mentors</p>
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
              <h3 className="text-sm font-bold text-slate-900">NITTE DU Academic Program & Branch Registry</h3>
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

      {/* 7b. CONFIRM REMOVE ALL MENTORS MODAL */}
      {isRemoveAllMentorsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <AlertCircle size={24} />
              <h3 className="text-base font-bold text-slate-900">Remove All Faculty Mentors?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove <strong>all {(db.users?.mentors || []).length} faculty mentors</strong>? All currently assigned students will be unallocated and returned to the general pool.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsRemoveAllMentorsModalOpen(false)}
                disabled={isRemovingAllMentors}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoveAllMentors}
                disabled={isRemovingAllMentors}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50 flex items-center space-x-1.5"
              >
                {isRemovingAllMentors ? (
                  <span>Removing...</span>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Confirm Remove All</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7c. CONFIRM REMOVE ALL STUDENTS MODAL */}
      {isRemoveAllStudentsModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <AlertCircle size={24} />
              <h3 className="text-base font-bold text-slate-900">Remove All Students?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove <strong>all {(db.users?.students || []).length} students</strong> from both the Supabase cloud database and local storage? This action will completely purge the student roster.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setIsRemoveAllStudentsModalOpen(false)}
                disabled={isRemovingAllStudents}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoveAllStudents}
                disabled={isRemovingAllStudents}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm disabled:opacity-50 flex items-center space-x-1.5"
              >
                {isRemovingAllStudents ? (
                  <span>Removing...</span>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Confirm Remove All</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. ONBOARD NEW RELATIONSHIP OFFICER MODAL */}
      {isAddRoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-amber-50 text-amber-700 border border-amber-200">
                  <Briefcase size={20} />
                </div>
                <h3 className="text-sm font-bold text-slate-900">Onboard Relationship Officer (RO)</h3>
              </div>
              <button onClick={() => setIsAddRoModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>

            {singleRoError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center space-x-2">
                <AlertCircle size={14} />
                <span>{singleRoError}</span>
              </div>
            )}

            <form onSubmit={handleSingleRoSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Full Name (with Title) *</label>
                <input
                  type="text"
                  required
                  value={singleRoName}
                  onChange={(e) => setSingleRoName(e.target.value)}
                  placeholder="e.g. Prof. Suresh Nayak"
                  className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Officer ID *</label>
                  <input
                    type="text"
                    required
                    value={singleRoId}
                    onChange={(e) => setSingleRoId(e.target.value.toUpperCase())}
                    placeholder="e.g. RO-04"
                    className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Assigned Domain Category *</label>
                  <input
                    required
                    value={singleRoCategory}
                    onChange={e => setSingleRoCategory(e.target.value)}
                    placeholder="Domain - Issue topic"
                    className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Institutional Email Address *</label>
                  <input
                    type="email"
                    required
                    value={singleRoEmail}
                    onChange={(e) => setSingleRoEmail(e.target.value)}
                    placeholder="officer@nitte.edu.in"
                    className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-medium mb-1">Initial Password (Optional)</label>
                <input
                  type="text"
                  value={singleRoPassword}
                  onChange={(e) => setSingleRoPassword(e.target.value)}
                  placeholder="Defaults to Nit#Ro2026"
                  className="w-full bg-slate-50 text-slate-900 p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:border-blue-600 focus:bg-white font-mono"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddRoModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingSingleRo}
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
                >
                  {isSubmittingSingleRo ? 'Provisioning...' : 'Provision Officer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. CONFIRM REMOVE RELATIONSHIP OFFICER MODAL */}
      {roPendingDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600">
              <AlertCircle size={24} />
              <h3 className="text-base font-bold text-slate-900">Confirm RO Deactivation</h3>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to deactivate Relationship Officer <strong className="text-slate-900 font-bold">{roPendingDelete.name}</strong> ({roPendingDelete.id})? Active tickets assigned to this officer will be flagged for reassignment.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
              <button onClick={() => setRoPendingDelete(null)} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold">
                Cancel
              </button>
              <button onClick={handleConfirmRemoveRo} className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold">
                Confirm Deactivation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VIEW FULL STUDENT MENTOR FEEDBACK */}
      {selectedFeedbackModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                  <MessageSquare size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Student Mentorship Feedback</h3>
                  <p className="text-[11px] text-slate-500">Official student observation submitted for faculty mentor</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedFeedbackModal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Submitted By Student</span>
                <div className="font-bold text-slate-900 mt-0.5">{selectedFeedbackModal.studentName || selectedFeedbackModal.student_name}</div>
                <div className="font-mono text-blue-700 font-semibold">{selectedFeedbackModal.studentId || selectedFeedbackModal.student_id}</div>
                {selectedFeedbackModal.student && (
                  <div className="text-[11px] text-slate-500 mt-0.5">{selectedFeedbackModal.student.branch} • Sem {selectedFeedbackModal.student.sem}</div>
                )}
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Assigned Faculty Mentor</span>
                <div className="font-bold text-slate-900 mt-0.5">{selectedFeedbackModal.mentorName || selectedFeedbackModal.mentor_name}</div>
                <div className="font-mono text-slate-600">{selectedFeedbackModal.mentorId || selectedFeedbackModal.mentor_id}</div>
                {selectedFeedbackModal.mentor && (
                  <div className="text-[11px] text-slate-500 mt-0.5">{selectedFeedbackModal.mentor.dept} Department</div>
                )}
              </div>
            </div>

            <div>
              <span className="text-xs font-bold text-slate-700">Student Feedback / Observations Narrative:</span>
              <div className="mt-1.5 p-4 rounded-xl bg-blue-50/50 border border-blue-100 text-xs text-slate-800 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
                "{selectedFeedbackModal.fullText}"
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
              <span>Date: {selectedFeedbackModal.createdAt ? new Date(selectedFeedbackModal.createdAt).toLocaleString() : 'Recent submission'}</span>
              <button
                onClick={() => setSelectedFeedbackModal(null)}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VIEW FULL FACULTY MENTOR SESSION REPORT */}
      {selectedMentorReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
                  <FileText size={22} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-bold text-slate-900">Faculty Mentorship Session Report</span>
                    {selectedMentorReportModal.status === 'Draft' ? (
                      <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 text-[10px] font-bold border border-amber-200 inline-flex items-center gap-1">
                        <Clock size={11} />
                        <span>Draft Saved</span>
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[10px] font-bold border border-emerald-200 inline-flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        <span>Submitted</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    Report Reference: #{selectedMentorReportModal.id || 'REC-XXXX'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedMentorReportModal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mentor & Session Metadata Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Faculty Mentor Details</span>
                <div className="font-bold text-slate-900 text-sm mt-0.5">
                  {selectedMentorReportModal.mentorName || selectedMentorReportModal.mentor?.name || 'Faculty Mentor'}
                </div>
                <div className="font-mono text-blue-700 font-semibold mt-0.5">
                  ID: {selectedMentorReportModal.mentorId || selectedMentorReportModal.mentor_id || selectedMentorReportModal.mentor?.id}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Dept of {selectedMentorReportModal.mentor?.dept || 'Computer Science & Engineering'} • {selectedMentorReportModal.mentor?.email || 'mentor@nitte.edu.in'}
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Session & Cohort Telemetry</span>
                <div className="text-slate-800 font-medium mt-0.5">
                  <strong>Date:</strong> {selectedMentorReportModal.displayDate || selectedMentorReportModal.sessionDate || selectedMentorReportModal.date}
                </div>
                <div className="text-slate-800 font-medium mt-0.5">
                  <strong>Venue:</strong> {selectedMentorReportModal.location || 'Seminar Hall 204, Block III'}
                </div>
                <div className="text-slate-800 font-medium mt-0.5">
                  <strong>Target Class:</strong> {selectedMentorReportModal.cohort || selectedMentorReportModal.whichClass || selectedMentorReportModal.which_class || '3rd Yr CSE'}
                </div>
                <div className="text-emerald-700 font-mono font-bold mt-1 inline-flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <CheckCircle2 size={12} />
                  <span>{selectedMentorReportModal.attendedCount !== undefined ? selectedMentorReportModal.attendedCount : selectedMentorReportModal.studentsAttended} Mentees Recorded Present</span>
                </div>
              </div>
            </div>

            {/* Topic & Focus Areas */}
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider text-[11px]">Session Topic & Discussion Focus</span>
              <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100 text-xs font-bold text-blue-900">
                {selectedMentorReportModal.topic || 'Mentorship Session'}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">
                  ✓ Academic Performance & CIE Marks
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">
                  ✓ Campus Attendance Redressal
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-semibold border border-slate-200">
                  ✓ Personal Well-being & Hostels
                </span>
              </div>
            </div>

            {/* Full Mentor Session Notes */}
            <div className="space-y-1.5">
              <span className="text-xs font-bold text-slate-700">Mentor Session Notes:</span>
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-sans">
                {selectedMentorReportModal.notes || 'No session notes recorded.'}
              </div>
            </div>

            {/* Status Footer */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <span className="font-bold text-slate-900 block">Session Report Status</span>
                <span className="text-slate-600 text-[11px]">
                  {selectedMentorReportModal.status === 'Draft'
                    ? 'Unsubmitted Faculty Draft'
                    : 'Submitted by Faculty Mentor'}
                </span>
              </div>
              <span className="font-mono text-[10px] text-slate-500 shrink-0">
                Logged: {selectedMentorReportModal.createdAt ? new Date(selectedMentorReportModal.createdAt).toLocaleString() : 'Current Academic Cycle'}
              </span>
            </div>

            {/* Action Bar */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  showToast(`Printing session report #${selectedMentorReportModal.id}...`);
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition flex items-center space-x-1.5"
              >
                <Printer size={13} />
                <span>Print Report</span>
              </button>
              <button
                onClick={() => setSelectedMentorReportModal(null)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
              >
                Close Report
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
