import React, { useContext, useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { DatabaseContext } from '../context/DatabaseContext';
import { BarChart, DonutChart } from '../components/CustomChart';
import {
  Shield, Users, Ticket, CheckCircle2, AlertTriangle, Star, ShieldAlert,
  Download, RefreshCw, FileText, Search, Bell, HelpCircle, ArrowUpRight,
  Filter, MoreVertical, TrendingUp, ArrowUp, ArrowDown, ExternalLink,
  GraduationCap, Briefcase, UserCheck, Activity, Eye, Layers, Clock,
  Upload, FileSpreadsheet, Mail, Key, Check, AlertCircle, X, UserPlus, Grid,
  Printer, FileDown, MessageSquare, Plus, Trash2, Edit3, SlidersHorizontal,
  ChevronLeft, ChevronRight, Sparkles, BookOpen, School, FolderPlus, Calendar
} from 'lucide-react';

export const AdminDashboard = () => {
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
    addSingleMentor
  } = useContext(DatabaseContext);

  // Navigation State
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'students', 'mentors', 'ros', 'all-tickets', 'mentor-feedbacks'
  const [studentSubTab, setStudentSubTab] = useState('directory'); // 'directory', 'excel-import'
  const [mentorSubTab, setMentorSubTab] = useState('directory'); // 'directory', 'session-reports', 'excel-import'
  const [roSubTab, setRoSubTab] = useState('directory'); // 'directory', 'excel-import'
  const [ticketSubTab, setTicketSubTab] = useState('tickets'); // 'tickets', 'audit-logs'

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

  // Student Removal State (Subtle Action Menu & Security Confirmation)
  const [studentPendingDelete, setStudentPendingDelete] = useState(null);
  const [studentDeleteSuccessMsg, setStudentDeleteSuccessMsg] = useState('');
  const [activeActionMenuStudentId, setActiveActionMenuStudentId] = useState(null);

  // Faculty Mentor Removal State & Single Mentor Direct Add Form State
  const [mentorPendingDelete, setMentorPendingDelete] = useState(null);
  const [mentorDeleteSuccessMsg, setMentorDeleteSuccessMsg] = useState('');
  const [activeActionMenuMentorId, setActiveActionMenuMentorId] = useState(null);
  const [mentorEntryMode, setMentorEntryMode] = useState('single'); // 'single', 'excel'
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
  const [assigningMentor, setAssigningMentor] = useState(null); // mentor object
  const [mentorAssignBranch, setMentorAssignBranch] = useState('ALL');
  const [mentorAssignSem, setMentorAssignSem] = useState('ALL');
  const [mentorAssignFilterTab, setMentorAssignFilterTab] = useState('all'); // 'all', 'unassigned', 'assigned-to-this'
  const [mentorAssignSearch, setMentorAssignSearch] = useState('');
  const [selectedStudentIdsForMentor, setSelectedStudentIdsForMentor] = useState([]);
  const [initialAssignedStudentIds, setInitialAssignedStudentIds] = useState([]);
  const [mentorAssignSuccessMsg, setMentorAssignSuccessMsg] = useState('');
  const [mentorFilterDept, setMentorFilterDept] = useState('ALL');

  // Safely extract available branches with deduplication and custom branch inclusion
  const availableBranchList = useMemo(() => {
    return Array.from(new Set([
      ...(branches || []).map(b => b.code.toUpperCase()),
      ...(db.users?.students || []).map(s => (s.branch || '').toUpperCase()).filter(Boolean),
      'BCA', 'BBA', 'BCOM', 'CSE', 'ISE', 'AIML', 'AIDS', 'ECE', 'MECH', 'CIVIL'
    ])).filter(Boolean).sort();
  }, [branches, db.users?.students]);

  const handleOpenAssignmentModal = (mentor) => {
    if (!mentor) return;
    setAssigningMentor(mentor);
    setMentorAssignBranch('ALL'); // Default to ALL branches so students are never hidden
    setMentorAssignSem('ALL');
    setMentorAssignFilterTab('all');
    setMentorAssignSearch('');
    setMentorAssignSuccessMsg('');
    const currentMentees = (db.users?.students || [])
      .filter(s => isMatchingMentorId(s.mentorId, mentor.id))
      .map(s => s.id);
    setSelectedStudentIdsForMentor(currentMentees);
    setInitialAssignedStudentIds(currentMentees);
  };

  const handleSaveMentorAssignments = (e) => {
    if (e) e.preventDefault();
    if (!assigningMentor) return;

    const toUnassign = initialAssignedStudentIds.filter(id => !selectedStudentIdsForMentor.includes(id));
    assignStudentsToMentor(assigningMentor.id, selectedStudentIdsForMentor, toUnassign);
    setMentorAssignSuccessMsg(`✅ Saved! ${selectedStudentIdsForMentor.length} students assigned to ${assigningMentor.name}.`);
    setInitialAssignedStudentIds([...selectedStudentIdsForMentor]);
    setTimeout(() => {
      setAssigningMentor(null);
    }, 1200);
  };

  const handleConfirmRemoveStudent = async () => {
    if (!studentPendingDelete) return;
    const name = studentPendingDelete.name;
    const id = studentPendingDelete.id;
    await removeStudent(id);
    setStudentPendingDelete(null);
    setStudentDeleteSuccessMsg(`✅ Student "${name}" (${id}) removed from institutional directory.`);
    setTimeout(() => {
      setStudentDeleteSuccessMsg('');
    }, 4000);
  };

  const handleConfirmRemoveMentor = async () => {
    if (!mentorPendingDelete) return;
    const name = mentorPendingDelete.name;
    const id = mentorPendingDelete.id;
    await removeMentor(id);
    setMentorPendingDelete(null);
    setMentorDeleteSuccessMsg(`✅ Faculty Mentor "${name}" (${id}) removed. Any assigned students have been returned to the unallocated pool.`);
    setTimeout(() => {
      setMentorDeleteSuccessMsg('');
    }, 4000);
  };

  const handleSingleMentorSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!singleMentorName.trim() || !singleMentorEmail.trim()) {
      setSingleMentorError('Please provide both Faculty Name and Official Email address.');
      return;
    }

    setSingleMentorError('');
    setIsSubmittingSingleMentor(true);
    setSingleMentorSuccess(null);

    try {
      let idToUse = singleMentorId.trim().toUpperCase();
      if (!idToUse) {
        const existingNums = (db.users?.mentors || [])
          .map(m => {
            const match = (m.id || '').match(/M-?(\d+)/i);
            return match ? parseInt(match[1]) : 0;
          })
          .filter(n => n > 0);
        const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 101;
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

      const res = await addSingleMentor(mentorPayload);
      const generatedPwd = res?.results?.[0]?.password || mentorPayload.password || 'Generated & Emailed';
      setSingleMentorSuccess({
        ...mentorPayload,
        password: generatedPwd,
        emailStatus: res?.results?.[0]?.emailStatus || 'DELIVERED_GMAIL'
      });

      // Clear form
      setSingleMentorName('');
      setSingleMentorEmail('');
      setSingleMentorId('');
      setSingleMentorClass('');
      setSingleMentorPassword('');
    } catch (err) {
      setSingleMentorError(err.message || 'Failed to add faculty mentor.');
    } finally {
      setIsSubmittingSingleMentor(false);
    }
  };

  // Filter & Search State
  const [ticketStatusFilter, setTicketStatusFilter] = useState('All');
  const [viewLogIssueId, setViewLogIssueId] = useState(null);
  const [selectedIssueId, setSelectedIssueId] = useState(null);
  const [escalationModalIssueId, setEscalationModalIssueId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Mentor Feedback Filter & Search State
  const [mfMentorFilter, setMfMentorFilter] = useState('ALL');
  const [mfSearchTerm, setMfSearchTerm] = useState('');
  const [mfRatingFilter, setMfRatingFilter] = useState('ALL'); // 'ALL', 'LOW' (<=3), 'HIGH' (>=4)

  // Student Roster Bulk Upload State
  const [rosterFile, setRosterFile] = useState(null);
  const [parsedRoster, setParsedRoster] = useState([]);
  const [isUploadingRoster, setIsUploadingRoster] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploadError, setUploadError] = useState('');

  // Mentor Roster Bulk Upload State
  const [mentorRosterFile, setMentorRosterFile] = useState(null);
  const [parsedMentorRoster, setParsedMentorRoster] = useState([]);
  const [isUploadingMentorRoster, setIsUploadingMentorRoster] = useState(false);
  const [mentorUploadResult, setMentorUploadResult] = useState(null);
  const [mentorUploadError, setMentorUploadError] = useState('');

  // RO Roster Bulk Upload State
  const [roRosterFile, setRoRosterFile] = useState(null);
  const [parsedRoRoster, setParsedRoRoster] = useState([]);
  const [isUploadingRoRoster, setIsUploadingRoRoster] = useState(false);
  const [roUploadResult, setRoUploadResult] = useState(null);
  const [roUploadError, setRoUploadError] = useState('');

  // Modal State
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Admin Meeting Scheduling State (Strict 1-Meeting Policy)
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

  // Reassign State
  const [targetRoId, setTargetRoId] = useState('');
  const [selectedRoForFilter, setSelectedRoForFilter] = useState('ALL');

  // Excel / CSV Parsing Handlers
  const getRosterField = (row, candidates, fallback = '') => {
    if (!row || typeof row !== 'object') return fallback;
    const keys = Object.keys(row);
    for (const c of candidates) {
      const target = c.toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const k of keys) {
        const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (cleanK === target && row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== '') {
          return String(row[k]).trim();
        }
      }
    }
    return fallback;
  };

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
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadTemplate = () => {
    const sampleData = [
      { 'Student ID': 'u18cm24s0001', 'Student Name': 'Aarav Nair', 'Student Gmail': 'skandhayashas2906@gmail.com', 'Branch': 'CSE', 'Semester': 5 },
      { 'Student ID': 'u18cm24s0002', 'Student Name': 'Ananya Bhat', 'Student Gmail': 'skandhayashu2906@gmail.com', 'Branch': 'CSE', 'Semester': 5 },
      { 'Student ID': 'u18cm24s0003', 'Student Name': 'Aditya Kulkarni', 'Student Gmail': 'skandhayashas2906@gmail.com', 'Branch': 'ISE', 'Semester': 5 }
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
      csvContent += `${i + 1},"${row.id}","${row.name}","${row.email}","${row.password || 'N/A'}","${row.emailStatus || (row.status === 'SUCCESS' ? 'DELIVERED_GMAIL' : 'FAILED')}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nitte_student_credentials_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Mentor Roster Handlers
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
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data || data.length === 0) {
          setMentorUploadError('The uploaded Excel/CSV file is empty or formatted incorrectly.');
          setParsedMentorRoster([]);
          return;
        }

        setParsedMentorRoster(data);
      } catch (err) {
        setMentorUploadError('Failed to parse mentor roster file: ' + err.message);
        setParsedMentorRoster([]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadMentorTemplate = () => {
    const sampleData = [
      { 'Mentor ID': 'M102', 'Faculty Name': 'Dr. Preethi Hegde', 'Faculty Email': 'preethi.hegde@nitte.edu', 'Department': 'CSE', 'Assigned Class': '5th Sem CSE - Sec A (25 Mentees)' },
      { 'Mentor ID': 'M103', 'Faculty Name': 'Prof. Suresh Kumar', 'Faculty Email': 'suresh.kumar@nitte.edu', 'Department': 'ECE', 'Assigned Class': '3rd Sem ECE - Sec B (28 Mentees)' },
      { 'Mentor ID': 'M104', 'Faculty Name': 'Dr. Kavitha Bhat', 'Faculty Email': 'kavitha.bhat@nitte.edu', 'Department': 'AIML', 'Assigned Class': '7th Sem AIML - Sec A (22 Mentees)' }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Faculty Mentors Roster');
    XLSX.writeFile(wb, 'nitte_mentor_roster_template.xlsx');
  };

  const handleMentorRosterSubmit = async () => {
    if (!parsedMentorRoster || parsedMentorRoster.length === 0) {
      setMentorUploadError('Please select a valid Excel or CSV file with mentor rows first.');
      return;
    }

    setIsUploadingMentorRoster(true);
    setMentorUploadError('');
    setMentorUploadResult(null);

    try {
      const res = await bulkUploadMentors(parsedMentorRoster);
      setMentorUploadResult(res);
      setParsedMentorRoster([]);
      setMentorRosterFile(null);
    } catch (err) {
      setMentorUploadError(err.message || 'Failed to process bulk faculty mentor upload.');
    } finally {
      setIsUploadingMentorRoster(false);
    }
  };

  const handleExportMentorCredentialsCsv = () => {
    if (!mentorUploadResult || !mentorUploadResult.results) return;
    let csvContent = 'data:text/csv;charset=utf-8,Index,Mentor ID,Faculty Name,Department,Assigned Class,Email Address,Generated Password,Email Delivery Status\n';
    mentorUploadResult.results.forEach((row, i) => {
      csvContent += `${i + 1},"${row.id}","${row.name}","${row.dept || 'CSE'}","${row.class || 'General'}","${row.email}","${row.password || 'N/A'}","${row.status === 'SUCCESS' ? 'DELIVERED_GMAIL' : 'FAILED'}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nitte_mentor_credentials_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // RO Roster Handlers
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
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data || data.length === 0) {
          setRoUploadError('The uploaded Excel/CSV file is empty or formatted incorrectly.');
          setParsedRoRoster([]);
          return;
        }

        setParsedRoRoster(data);
      } catch (err) {
        setRoUploadError('Failed to parse RO roster file: ' + err.message);
        setParsedRoRoster([]);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDownloadRoTemplate = () => {
    const sampleData = [
      { 'RO ID': 'RO-50', 'Officer Name': 'Dr. Manjunath Shetty', 'Officer Email': 'skandhayashu2906@gmail.com', 'Category Jurisdiction': 'Academic - Research & Project Guidance' },
      { 'RO ID': 'RO-51', 'Officer Name': 'Prof. Shailaja Pai', 'Officer Email': 'skandhayashu2906@gmail.com', 'Category Jurisdiction': 'Hostels - Health & Emergency Medical' },
      { 'RO ID': 'RO-52', 'Officer Name': 'Mr. Arvind Kamath', 'Officer Email': 'skandhayashu2906@gmail.com', 'Category Jurisdiction': 'Facilities - Innovation Lab & Hackathons' }
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relationship Officers Roster');
    XLSX.writeFile(wb, 'nitte_ro_roster_template.xlsx');
  };

  const handleRoRosterSubmit = async () => {
    if (!parsedRoRoster || parsedRoRoster.length === 0) {
      setRoUploadError('Please select a valid Excel or CSV file with RO rows first.');
      return;
    }

    setIsUploadingRoRoster(true);
    setRoUploadError('');
    setRoUploadResult(null);

    try {
      const res = await bulkUploadRos(parsedRoRoster);
      setRoUploadResult(res);
      setParsedRoRoster([]);
      setRoRosterFile(null);
    } catch (err) {
      setRoUploadError(err.message || 'Failed to process bulk RO upload.');
    } finally {
      setIsUploadingRoRoster(false);
    }
  };

  const handleExportRoCredentialsCsv = () => {
    if (!roUploadResult || !roUploadResult.results) return;
    let csvContent = 'data:text/csv;charset=utf-8,Index,RO ID,Officer Name,Category Jurisdiction,Official Gmail,Generated Password,Email Delivery Status\n';
    roUploadResult.results.forEach((row, i) => {
      csvContent += `${i + 1},"${row.id}","${row.name}","${row.region || 'General'}","${row.email}","${row.password || 'N/A'}","${row.status === 'SUCCESS' ? 'DELIVERED_GMAIL' : 'FAILED'}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nitte_ro_credentials_${Date.now()}.csv`);
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


  const isEscalatedOrReEscalated = (i) => i.status !== 'Resolved' && (
    i.status === 'Escalated' ||
    i.status === 'Re-escalated' ||
    Boolean(i.isReEscalated) ||
    (Number(i.reEscalatedCount) > 0) ||
    Boolean(i.adminMeetingScheduled)
  );
  const isReEscalatedIssue = (i) => i.status !== 'Resolved' && (i.status === 'Re-escalated' || Boolean(i.isReEscalated) || (Number(i.reEscalatedCount) > 0));

  const getAdminMeetingForIssue = (issue) => {
    if (!issue) return null;
    const cleanId = String(issue.id || issue.issue_id || '').toUpperCase();
    if (issue.adminMeeting) return issue.adminMeeting;
    return (db.meetings || []).find(m =>
      (m.issueId || m.issue_id)?.toUpperCase() === cleanId &&
      (m.isAdminHearing || m.roId === 'ADMIN' || m.scheduledBy === 'Administration Office')
    ) || null;
  };

  const hasAdminMeetingForIssue = (issue) => {
    if (!issue) return false;
    return Boolean(issue.adminMeetingScheduled || getAdminMeetingForIssue(issue));
  };

  const handleOpenAdminScheduleModal = (issue) => {
    if (!issue) return;
    if (hasAdminMeetingForIssue(issue)) {
      alert('🔒 Limit Reached: Only 1 Administrative Hearing can be scheduled per ticket. You can now Close the Ticket.');
      return;
    }
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
      setAdminMeetingSuccessMsg(`Administrative Hearing successfully scheduled for ${adminMeetingDate} at ${adminMeetingTime}. You can now Close the Ticket.`);
      setTimeout(() => setAdminMeetingSuccessMsg(''), 5000);
      setShowAdminMeetingModal(false);
      setAdminMeetingTargetIssue(null);
    } catch (err) {
      alert(err.message || 'Failed to schedule administrative meeting.');
    } finally {
      setIsSubmittingAdminMeeting(false);
    }
  };

  // 1. STATS CALCULATION
  const totalIssues = db.issues.length;
  const resolvedIssues = db.issues.filter(i => i.status === 'Resolved').length;
  const escalatedIssues = db.issues.filter(isEscalatedOrReEscalated).length;
  const reEscalatedCount = db.issues.filter(isReEscalatedIssue).length;
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
    { name: 'Escalated', value: escalatedIssues },
    { name: 'Scheduled', value: db.issues.filter(i => i.status === 'Meeting Scheduled').length },
    { name: 'Assigned/New', value: db.issues.filter(i => i.status === 'Assigned to RO' || i.status === 'Submitted').length }
  ];

  const categories = ['Academic', 'Hostels', 'Financial', 'Exams', 'Facilities', 'Personal'];
  const categoryData = categories.map(cat => ({
    name: cat,
    value: db.issues.filter(i => i.category.startsWith(cat)).length
  }));

  // Escalated Issues list — sorted so Re-escalated tickets appear at the very top!
  const escalations = db.issues
    .filter(isEscalatedOrReEscalated)
    .sort((a, b) => {
      const aRe = isReEscalatedIssue(a);
      const bRe = isReEscalatedIssue(b);
      if (aRe && !bRe) return -1;
      if (!aRe && bRe) return 1;
      return new Date(b.escalatedAt || b.createdAt || 0) - new Date(a.escalatedAt || a.createdAt || 0);
    });
  const selectedIssue = db.issues.find(i => (i.id || i.issue_id)?.toUpperCase() === selectedIssueId?.toUpperCase());

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

  // MENTOR FEEDBACK STATS & FILTERING
  const mentorFeedbacks = db.mentorFeedbacks || [];
  const totalMf = mentorFeedbacks.length;
  const avgRegularity = totalMf > 0
    ? (mentorFeedbacks.reduce((sum, f) => sum + (Number(f.regularityRating) || 0), 0) / totalMf).toFixed(1)
    : '0.0';
  const avgClarity = totalMf > 0
    ? (mentorFeedbacks.reduce((sum, f) => sum + (Number(f.clarityRating) || 0), 0) / totalMf).toFixed(1)
    : '0.0';
  const avgParticipation = totalMf > 0
    ? (mentorFeedbacks.reduce((sum, f) => sum + (Number(f.participationRating) || 0), 0) / totalMf).toFixed(1)
    : '0.0';
  const avgOverall = totalMf > 0
    ? ((Number(avgRegularity) + Number(avgClarity) + Number(avgParticipation)) / 3).toFixed(1)
    : '0.0';

  const filteredMentorFeedbacks = mentorFeedbacks.filter(f => {
    if (mfMentorFilter !== 'ALL' && f.mentorId !== mfMentorFilter && f.mentorName !== mfMentorFilter) {
      return false;
    }
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

  const handleExportMentorFeedbacksCsv = () => {
    if (filteredMentorFeedbacks.length === 0) return;
    let csvContent = 'data:text/csv;charset=utf-8,ID,Student Name,Student ID,Mentor Name,Mentor ID,Regularity Rating (1-5),Clarity of Explanation (1-5),Opportunity to Participate (1-5),Overall Average,Difficulties / Issues Faced With Mentoring,Submission Date\n';
    filteredMentorFeedbacks.forEach((f, idx) => {
      const avg = ((Number(f.regularityRating || 0) + Number(f.clarityRating || 0) + Number(f.participationRating || 0)) / 3).toFixed(1);
      const cleanDiff = (f.difficulties || '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
      csvContent += `"${f.id || idx + 1}","${f.studentName}","${f.studentId}","${f.mentorName}","${f.mentorId || ''}","${f.regularityRating}","${f.clarityRating}","${f.participationRating}","${avg}","${cleanDiff}","${new Date(f.createdAt).toLocaleString()}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `nitte_mentor_feedbacks_${Date.now()}.csv`);
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
              <span style={{ background: reEscalatedCount > 0 ? '#dc2626' : '#ef4444', color: '#fff', fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px', fontWeight: 'bold' }}>
                {escalations.length} {reEscalatedCount > 0 ? `(⚡${reEscalatedCount})` : ''}
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

        {/* Tab 6: Mentor Feedbacks */}
        <button
          className={`panel-btn ${activeTab === 'mentor-feedbacks' ? 'active Admin' : ''}`}
          onClick={() => setActiveTab('mentor-feedbacks')}
        >
          <MessageSquare size={18} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <span>Mentor Feedbacks</span>
            <span style={{ fontSize: '0.72rem', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>
              {mentorFeedbacks.length}
            </span>
          </div>
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
                  <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <ShieldAlert size={22} style={{ color: escalations.length > 0 ? '#ef4444' : '#10b981' }} />
                    Critical Escalations Queue ({escalations.length})
                    {reEscalatedCount > 0 && (
                      <span style={{ fontSize: '0.75rem', background: '#dc2626', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                        ⚡ {reEscalatedCount} Re-escalated
                      </span>
                    )}
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

              {adminMeetingSuccessMsg && (
                <div style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid #10b981',
                  color: '#34d399',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  marginBottom: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.84rem',
                  fontWeight: 600
                }}>
                  <CheckCircle2 size={16} /> {adminMeetingSuccessMsg}
                </div>
              )}

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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{issue.category}</strong>
                            {Boolean(issue.isReEscalated || (issue.reEscalatedCount && issue.reEscalatedCount > 0)) && (
                              <span style={{
                                fontSize: '0.7rem',
                                background: 'rgba(239, 68, 68, 0.25)',
                                color: '#f87171',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                border: '1px solid rgba(239, 68, 68, 0.5)',
                                fontWeight: '700'
                              }}>
                                ⚡ Re-escalated {issue.reEscalatedCount ? `(${issue.reEscalatedCount}x)` : ''}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Ticket ID: <code>{issue.id}</code> &nbsp;|&nbsp; Escalated from: <strong>{db.users.ros.find(r => r.id === issue.roId)?.name || issue.roId}</strong>
                          </div>
                        </div>
                        <span className="badge badge-escalated" style={{
                          fontSize: '0.75rem',
                          background: (issue.isReEscalated || issue.status === 'Re-escalated' || (issue.reEscalatedCount && issue.reEscalatedCount > 0)) ? 'rgba(239, 68, 68, 0.25)' : undefined,
                          color: (issue.isReEscalated || issue.status === 'Re-escalated' || (issue.reEscalatedCount && issue.reEscalatedCount > 0)) ? '#f87171' : undefined,
                          border: (issue.isReEscalated || issue.status === 'Re-escalated' || (issue.reEscalatedCount && issue.reEscalatedCount > 0)) ? '1px solid #ef4444' : undefined,
                          fontWeight: (issue.isReEscalated || issue.status === 'Re-escalated' || (issue.reEscalatedCount && issue.reEscalatedCount > 0)) ? '700' : undefined
                        }}>
                          {Boolean(issue.isReEscalated || issue.status === 'Re-escalated' || (issue.reEscalatedCount && issue.reEscalatedCount > 0)) ? '⚡ Re-escalated' : 'Escalated'}
                        </span>
                      </div>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 10px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {issue.description}
                      </p>
                      {issue.escalationReason && (
                        <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px dashed rgba(244,63,94,0.35)', padding: '6px 12px', borderRadius: '6px', marginBottom: '10px', fontSize: '0.8rem', color: '#fecdd3' }}>
                          <strong>RO Urgency Directive:</strong> <span style={{ fontStyle: 'italic' }}>"{issue.escalationReason}"</span>
                        </div>
                      )}
                      <div className="issue-meta" style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Student: <strong>{issue.studentName}</strong> (<code>{issue.studentId}</code>) &nbsp;|&nbsp; Priority: <span style={{ color: '#fca5a5', fontWeight: '600' }}>{issue.priority}</span></span>
                        <span style={{ color: '#60a5fa', fontWeight: '600', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Eye size={14} /> Open Audit Detail & Download MS Word Report →
                        </span>
                      </div>

                      {/* ADMIN MEETING & CLOSE TICKET ACTION BAR */}
                      <div style={{
                        marginTop: '12px',
                        paddingTop: '10px',
                        borderTop: '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap'
                      }}>
                        {!hasAdminMeetingForIssue(issue) ? (
                          <>
                            <span style={{ fontSize: '0.75rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Shield size={13} /> Step 1: Direct Meeting with Mentee (1 Allowed)
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenAdminScheduleModal(issue);
                              }}
                              className="btn btn-primary"
                              style={{
                                padding: '6px 14px',
                                fontSize: '0.8rem',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                                border: 'none',
                                borderRadius: '6px',
                                boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
                                cursor: 'pointer'
                              }}
                            >
                              <Calendar size={14} /> Setup Meeting with Student
                            </button>
                          </>
                        ) : (
                          <>
                            {(() => {
                              const m = getAdminMeetingForIssue(issue);
                              return (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  background: 'rgba(59, 130, 246, 0.12)',
                                  border: '1px solid rgba(59, 130, 246, 0.3)',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  fontSize: '0.75rem',
                                  color: '#93c5fd'
                                }}>
                                  <Calendar size={13} />
                                  <span>Hearing: <strong>{m?.date || 'Scheduled'}</strong> at <strong>{m?.time || '11:00 AM'}</strong> ({m?.mode || 'Offline'})</span>
                                </div>
                              );
                            })()}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedIssueId(issue.id);
                                setShowResolveModal(true);
                              }}
                              className="btn btn-success"
                              style={{
                                padding: '6px 14px',
                                fontSize: '0.8rem',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                border: 'none',
                                borderRadius: '6px',
                                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                                cursor: 'pointer'
                              }}
                            >
                              <CheckCircle2 size={14} /> Close the Ticket
                            </button>
                          </>
                        )}
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

            {/* 4. STUDENT MENTOR FEEDBACK QUICK AUDIT */}
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h2 className="section-title" style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MessageSquare size={18} style={{ color: 'var(--accent-amber)' }} />
                    Student Mentor Feedback & Reviews Summary
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                    Student ratings on mentoring class regularity, explanation clarity, classroom participation, and reported difficulties.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('mentor-feedbacks')}
                  className="btn btn-primary"
                  style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <MessageSquare size={14} /> View All Feedbacks ({totalMf}) →
                </button>
              </div>

              {totalMf === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                  <MessageSquare size={36} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: '0.85rem' }}>No student mentor feedbacks submitted yet.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px 14px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Total Reviews</span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '4px 0 0 0', color: 'var(--text-primary)' }}>{totalMf}</h3>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>From enrolled mentees</span>
                  </div>
                  <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '8px', padding: '12px 14px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#f59e0b', display: 'block' }}>Class Regularity</span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '4px 0 0 0', color: '#f59e0b' }}>⭐ {avgRegularity} / 5</h3>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Routine session cadence</span>
                  </div>
                  <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', padding: '12px 14px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#3b82f6', display: 'block' }}>Teaching Clarity</span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '4px 0 0 0', color: '#3b82f6' }}>⭐ {avgClarity} / 5</h3>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Concepts & guidance clarity</span>
                  </div>
                  <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '8px', padding: '12px 14px' }}>
                    <span style={{ fontSize: '0.72rem', color: '#10b981', display: 'block' }}>Student Participation</span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '4px 0 0 0', color: '#10b981' }}>⭐ {avgParticipation} / 5</h3>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Opportunity to express opinions</span>
                  </div>
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
            {studentSubTab === 'directory' && (() => {
              // Extract unique branches from database students as well as configured branches
              const allKnownBranchCodes = Array.from(
                new Set([
                  ...branches.map(b => b.code.toUpperCase()),
                  ...db.users.students.map(s => (s.branch || 'CSE').toUpperCase())
                ])
              ).filter(Boolean);

              // Calculate branch distribution counts
              const branchCounts = {};
              allKnownBranchCodes.forEach(code => {
                branchCounts[code] = db.users.students.filter(s => (s.branch || 'CSE').toUpperCase() === code).length;
              });

              // Apply Filters
              const filteredStudents = db.users.students.filter(student => {
                const sBranch = (student.branch || 'CSE').toUpperCase();
                const sSem = parseInt(student.sem) || 5;

                // Branch filter
                if (selectedBranchFilter !== 'ALL' && sBranch !== selectedBranchFilter.toUpperCase()) {
                  return false;
                }

                // Semester filter
                if (selectedSemesterFilter !== 'ALL' && sSem !== parseInt(selectedSemesterFilter)) {
                  return false;
                }

                // Search query
                if (searchTerm.trim()) {
                  const q = searchTerm.toLowerCase();
                  const nameMatch = (student.name || '').toLowerCase().includes(q);
                  const idMatch = (student.id || '').toLowerCase().includes(q);
                  const emailMatch = (student.email || '').toLowerCase().includes(q);
                  const branchMatch = (student.branch || '').toLowerCase().includes(q);
                  if (!nameMatch && !idMatch && !emailMatch && !branchMatch) return false;
                }

                // Slot limit filter
                if (studentSlotFilter !== 'ALL') {
                  const recentCount = db.issues.filter(i => {
                    if (i.studentId !== student.id) return false;
                    const created = new Date(i.createdAt).getTime();
                    return created >= Date.now() - (7 * 24 * 60 * 60 * 1000);
                  }).length;
                  if (studentSlotFilter === 'REACHED' && recentCount < 2) return false;
                  if (studentSlotFilter === 'AVAILABLE' && recentCount >= 2) return false;
                }

                return true;
              });

              // Pagination
              const totalPages = Math.max(1, Math.ceil(filteredStudents.length / studentsPerPage));
              const currentPage = Math.min(studentPage, totalPages);
              const startIndex = (currentPage - 1) * studentsPerPage;
              const paginatedStudents = filteredStudents.slice(startIndex, startIndex + studentsPerPage);

              const handleExportFilteredStudents = () => {
                if (filteredStudents.length === 0) return;
                const exportData = filteredStudents.map((s, idx) => ({
                  'Sl No': idx + 1,
                  'Student USN / ID': s.id,
                  'Student Name': s.name,
                  'Gmail Address': s.email,
                  'Branch / Course': s.branch || 'CSE',
                  'Semester': s.sem || 5,
                  'Assigned Mentor': db.users.mentors.find(m => m.id === s.mentorId)?.name || 'Unassigned',
                  'Phone Number': s.phone || 'N/A'
                }));
                const ws = XLSX.utils.json_to_sheet(exportData);
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Filtered Students');
                XLSX.writeFile(wb, `nitte_students_${selectedBranchFilter}_sem${selectedSemesterFilter}_${Date.now()}.xlsx`);
              };

              const handleAddBranchSubmit = (e) => {
                e.preventDefault();
                setBranchModalError('');
                setBranchModalSuccess('');
                try {
                  addBranch({
                    code: newBranchCode,
                    name: newBranchName,
                    degree: newBranchDegree,
                    totalSems: newBranchTotalSems
                  });
                  setBranchModalSuccess(`Branch "${newBranchCode.toUpperCase()}" added successfully!`);
                  setNewBranchCode('');
                  setNewBranchName('');
                  setNewBranchTotalSems(8);
                } catch (err) {
                  setBranchModalError(err.message || 'Failed to add branch.');
                }
              };

              return (
                <div>
                  {/* Top Header & Quick Action Buttons */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <School size={20} style={{ color: '#3b82f6' }} />
                        Degree College Student Directory & Course Explorer
                      </h2>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                        Browse, filter, and manage student divisions across all degree programs and semesters.
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button
                        onClick={() => setIsBranchManagerOpen(true)}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 14px' }}
                      >
                        <SlidersHorizontal size={15} />
                        Manage College Branches ({branches.length})
                      </button>
                      <button
                        onClick={handleExportFilteredStudents}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 14px' }}
                        title="Export current filtered view to Excel"
                      >
                        <Download size={15} />
                        Export Filtered List ({filteredStudents.length})
                      </button>
                      <button
                        onClick={() => setStudentSubTab('excel-import')}
                        className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '6px 14px' }}
                      >
                        <FileSpreadsheet size={16} />
                        Import Excel Roster
                      </button>
                    </div>
                  </div>

                  {/* Branch Filter Pills Bar */}
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    marginBottom: '16px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <BookOpen size={14} style={{ color: '#3b82f6' }} /> Filter By College Branch / Department:
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Showing {filteredStudents.length} of {db.users.students.length} Total Enrolled
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      <button
                        onClick={() => { setSelectedBranchFilter('ALL'); setStudentPage(1); }}
                        style={{
                          background: selectedBranchFilter === 'ALL' ? '#2563eb' : 'rgba(255, 255, 255, 0.05)',
                          color: selectedBranchFilter === 'ALL' ? '#ffffff' : 'var(--text-primary)',
                          border: selectedBranchFilter === 'ALL' ? '1px solid #2563eb' : '1px solid var(--border-color)',
                          borderRadius: '20px',
                          padding: '4px 12px',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        All Branches
                        <span style={{
                          background: selectedBranchFilter === 'ALL' ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          fontSize: '0.72rem'
                        }}>
                          {db.users.students.length}
                        </span>
                      </button>

                      {allKnownBranchCodes.map(code => {
                        const count = branchCounts[code] || 0;
                        const isSelected = selectedBranchFilter === code;
                        const branchInfo = branches.find(b => b.code.toUpperCase() === code);

                        return (
                          <button
                            key={code}
                            onClick={() => { setSelectedBranchFilter(code); setStudentPage(1); }}
                            title={branchInfo ? `${branchInfo.name} (${branchInfo.degree})` : code}
                            style={{
                              background: isSelected ? '#2563eb' : 'rgba(255, 255, 255, 0.05)',
                              color: isSelected ? '#ffffff' : 'var(--text-primary)',
                              border: isSelected ? '1px solid #2563eb' : '1px solid var(--border-color)',
                              borderRadius: '20px',
                              padding: '4px 12px',
                              fontSize: '0.8rem',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            {code}
                            <span style={{
                              background: isSelected ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                              padding: '1px 6px',
                              borderRadius: '10px',
                              fontSize: '0.72rem',
                              color: isSelected ? '#ffffff' : count > 0 ? '#93c5fd' : 'var(--text-muted)'
                            }}>
                              {count}
                            </span>
                          </button>
                        );
                      })}

                      <button
                        onClick={() => setIsBranchManagerOpen(true)}
                        style={{
                          background: 'rgba(59, 130, 246, 0.1)',
                          color: '#60a5fa',
                          border: '1px dashed rgba(59, 130, 246, 0.4)',
                          borderRadius: '20px',
                          padding: '4px 12px',
                          fontSize: '0.78rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Plus size={13} /> Add / Remove Branch
                      </button>
                    </div>
                  </div>

                  {/* Secondary Filter & Search Row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    {/* Live Search */}
                    <div style={{ position: 'relative' }}>
                      <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        placeholder="Search USN, Name, Gmail, Branch..."
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setStudentPage(1); }}
                        className="form-control"
                        style={{ paddingLeft: '36px', height: '38px', fontSize: '0.85rem' }}
                      />
                      {searchTerm && (
                        <button
                          onClick={() => { setSearchTerm(''); setStudentPage(1); }}
                          style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Semester Dropdown Filter */}
                    <div>
                      <select
                        value={selectedSemesterFilter}
                        onChange={(e) => { setSelectedSemesterFilter(e.target.value); setStudentPage(1); }}
                        className="form-control"
                        style={{ height: '38px', fontSize: '0.85rem' }}
                      >
                        <option value="ALL">All Semesters (1 to 8)</option>
                        <option value="1">1st Semester</option>
                        <option value="2">2nd Semester</option>
                        <option value="3">3rd Semester</option>
                        <option value="4">4th Semester</option>
                        <option value="5">5th Semester</option>
                        <option value="6">6th Semester</option>
                        <option value="7">7th Semester</option>
                        <option value="8">8th Semester</option>
                      </select>
                    </div>

                    {/* Slot Limit Status Filter */}
                    <div>
                      <select
                        value={studentSlotFilter}
                        onChange={(e) => { setStudentSlotFilter(e.target.value); setStudentPage(1); }}
                        className="form-control"
                        style={{ height: '38px', fontSize: '0.85rem' }}
                      >
                        <option value="ALL">All Slot Limit Statuses</option>
                        <option value="AVAILABLE">Slots Available (0-1 Tickets)</option>
                        <option value="REACHED">Limit Reached (2/2 Tickets)</option>
                      </select>
                    </div>

                    {/* Page Size Selector */}
                    <div>
                      <select
                        value={studentsPerPage}
                        onChange={(e) => { setStudentsPerPage(parseInt(e.target.value)); setStudentPage(1); }}
                        className="form-control"
                        style={{ height: '38px', fontSize: '0.85rem' }}
                      >
                        <option value="15">Show 15 per page</option>
                        <option value="25">Show 25 per page</option>
                        <option value="50">Show 50 per page</option>
                        <option value="100">Show 100 per page</option>
                      </select>
                    </div>
                  </div>

                  {/* Student Delete Success Alert */}
                  {studentDeleteSuccessMsg && (
                    <div style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#34d399',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      marginBottom: '16px',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 size={16} />
                        <span>{studentDeleteSuccessMsg}</span>
                      </div>
                      <button
                        onClick={() => setStudentDeleteSuccessMsg('')}
                        style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer', padding: 0 }}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}

                  {/* Student Table */}
                  <div className="custom-table-container" style={{ maxHeight: '540px', overflowY: 'auto' }}>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Student ID / USN</th>
                          <th>Student Name</th>
                          <th>Gmail Address</th>
                          <th>Branch & Degree</th>
                          <th>Semester</th>
                          <th>Assigned Mentor</th>
                          <th>Active Tickets</th>
                          <th>Slot Limit Status</th>
                          <th style={{ width: '45px', textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedStudents.length === 0 ? (
                          <tr>
                            <td colSpan={9} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                              <GraduationCap size={36} style={{ marginBottom: '8px', opacity: 0.5 }} />
                              <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600' }}>No students found matching the selected filters.</p>
                              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem' }}>
                                Try selecting "All Branches" or clear your search query.
                              </p>
                            </td>
                          </tr>
                        ) : (
                          paginatedStudents.map(student => {
                            const mentor = (db.users?.mentors || []).find(m => isMatchingMentorId(m.id, student.mentorId));
                            const activeCount = db.issues.filter(i => i.studentId === student.id && i.status !== 'Resolved').length;
                            const recentWeeklyIssuesCount = db.issues.filter(i => {
                              if (i.studentId !== student.id) return false;
                              const created = new Date(i.createdAt).getTime();
                              const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                              return created >= sevenDaysAgo;
                            }).length;

                            const isLimitReached = recentWeeklyIssuesCount >= 2;
                            const branchInfo = branches.find(b => b.code.toUpperCase() === (student.branch || '').toUpperCase());

                            return (
                              <tr key={student.id}>
                                <td><code style={{ fontWeight: 'bold', color: '#93c5fd' }}>{student.id}</code></td>
                                <td>
                                  <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{student.name}</div>
                                  {student.phone && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>📞 {student.phone}</span>}
                                </td>
                                <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{student.email}</td>
                                <td>
                                  <span className="badge badge-assigned" title={branchInfo ? branchInfo.name : student.branch}>
                                    {student.branch || 'CSE'}
                                    {branchInfo?.degree && <span style={{ opacity: 0.75, fontSize: '0.7rem', marginLeft: '4px' }}>({branchInfo.degree})</span>}
                                  </span>
                                </td>
                                <td>
                                  <span style={{ fontSize: '0.82rem', fontWeight: '600' }}>
                                    Sem {student.sem || 5}
                                  </span>
                                </td>
                                <td>
                                  <select
                                    value={mentor ? mentor.id : ''}
                                    onChange={(e) => {
                                      const newMentorId = e.target.value;
                                      if (newMentorId) {
                                        assignStudentsToMentor(newMentorId, [student.id], student.mentorId ? [student.id] : []);
                                      } else if (student.mentorId) {
                                        assignStudentsToMentor(student.mentorId, [], [student.id]);
                                      }
                                    }}
                                    className="form-control"
                                    style={{
                                      height: '30px',
                                      fontSize: '0.78rem',
                                      padding: '2px 8px',
                                      minWidth: '150px',
                                      background: mentor ? 'rgba(124, 58, 237, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                                      borderColor: mentor ? 'rgba(124, 58, 237, 0.35)' : 'var(--border-color)',
                                      color: mentor ? '#c4b5fd' : 'var(--text-muted)',
                                      fontWeight: mentor ? '600' : 'normal'
                                    }}
                                    title="Quick assign or change faculty mentor"
                                  >
                                    <option value="">⚪ Unassigned</option>
                                    {(db.users?.mentors || []).map(m => (
                                      <option key={m.id} value={m.id}>
                                        {m.name} ({m.dept || 'Faculty'})
                                      </option>
                                    ))}
                                  </select>
                                </td>
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
                                      <CheckCircle2 size={12} /> {recentWeeklyIssuesCount}/2 Slots Used
                                    </span>
                                  )}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ position: 'relative', display: 'inline-block' }}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveActionMenuStudentId(activeActionMenuStudentId === student.id ? null : student.id);
                                      }}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: 'var(--text-muted)',
                                        cursor: 'pointer',
                                        padding: '5px',
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        opacity: 0.65,
                                        transition: 'all 0.2s'
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.65'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                                      title="Student actions"
                                    >
                                      <MoreVertical size={16} />
                                    </button>

                                    {activeActionMenuStudentId === student.id && (
                                      <>
                                        <div
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveActionMenuStudentId(null);
                                          }}
                                          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}
                                        />
                                        <div
                                          onClick={(e) => e.stopPropagation()}
                                          style={{
                                            position: 'absolute',
                                            right: 0,
                                            top: '100%',
                                            marginTop: '4px',
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
                                            zIndex: 101,
                                            minWidth: '165px',
                                            padding: '4px'
                                          }}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveActionMenuStudentId(null);
                                              setStudentPendingDelete(student);
                                            }}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '8px',
                                              width: '100%',
                                              padding: '8px 12px',
                                              fontSize: '0.8rem',
                                              fontWeight: '600',
                                              background: 'none',
                                              border: 'none',
                                              color: '#f87171',
                                              cursor: 'pointer',
                                              borderRadius: '6px',
                                              textAlign: 'left'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                          >
                                            <Trash2 size={14} />
                                            Remove Student
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination Footer */}
                  {filteredStudents.length > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '12px' }}>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        Showing <strong>{startIndex + 1}</strong> to <strong>{Math.min(startIndex + studentsPerPage, filteredStudents.length)}</strong> of <strong>{filteredStudents.length}</strong> students
                        {selectedBranchFilter !== 'ALL' && <span> in <strong>{selectedBranchFilter}</strong></span>}
                      </div>

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          onClick={() => setStudentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', opacity: currentPage === 1 ? 0.5 : 1 }}
                        >
                          <ChevronLeft size={14} /> Prev
                        </button>

                        <div style={{ fontSize: '0.82rem', fontWeight: '600', padding: '0 8px' }}>
                          Page {currentPage} of {totalPages}
                        </div>

                        <button
                          onClick={() => setStudentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', opacity: currentPage === totalPages ? 0.5 : 1 }}
                        >
                          Next <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Branch Management Modal */}
                  {isBranchManagerOpen && (
                    <div style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: 'rgba(0, 0, 0, 0.75)',
                      backdropFilter: 'blur(8px)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 9999,
                      padding: '20px'
                    }}>
                      <div style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '16px',
                        maxWidth: '700px',
                        width: '100%',
                        maxHeight: '90vh',
                        overflowY: 'auto',
                        padding: '28px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
                          <div>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <School size={22} style={{ color: '#3b82f6' }} />
                              Manage College Branches & Degree Courses
                            </h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                              Add new degree branches or remove inactive departments from the college filter list.
                            </p>
                          </div>
                          <button
                            onClick={() => { setIsBranchManagerOpen(false); setBranchModalError(''); setBranchModalSuccess(''); }}
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                          >
                            <X size={20} />
                          </button>
                        </div>

                        {/* Error / Success Notifications */}
                        {branchModalError && (
                          <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <AlertCircle size={16} />
                            {branchModalError}
                          </div>
                        )}
                        {branchModalSuccess && (
                          <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <CheckCircle2 size={16} />
                            {branchModalSuccess}
                          </div>
                        )}

                        {/* Form to Add New Branch */}
                        <form onSubmit={handleAddBranchSubmit} style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '10px',
                          padding: '16px',
                          marginBottom: '20px'
                        }}>
                          <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', fontWeight: '700', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Plus size={16} /> Add New College Branch / Course
                          </h4>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                            <div>
                              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Branch Code *</label>
                              <input
                                type="text"
                                placeholder="e.g. BCA, BBA, MCA"
                                value={newBranchCode}
                                onChange={(e) => setNewBranchCode(e.target.value.toUpperCase())}
                                required
                                className="form-control"
                                style={{ height: '36px', fontSize: '0.85rem', textTransform: 'uppercase' }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Course / Branch Full Name *</label>
                              <input
                                type="text"
                                placeholder="e.g. Bachelor of Computer Applications"
                                value={newBranchName}
                                onChange={(e) => setNewBranchName(e.target.value)}
                                required
                                className="form-control"
                                style={{ height: '36px', fontSize: '0.85rem' }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Degree Level</label>
                              <input
                                type="text"
                                placeholder="e.g. B.C.A, B.Tech, M.B.A"
                                value={newBranchDegree}
                                onChange={(e) => setNewBranchDegree(e.target.value)}
                                className="form-control"
                                style={{ height: '36px', fontSize: '0.85rem' }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Total Semesters</label>
                              <input
                                type="number"
                                min="1"
                                max="12"
                                value={newBranchTotalSems}
                                onChange={(e) => setNewBranchTotalSems(e.target.value)}
                                className="form-control"
                                style={{ height: '36px', fontSize: '0.85rem' }}
                              />
                            </div>
                          </div>
                          <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: '600', padding: '8px' }}
                          >
                            <Plus size={16} />
                            Save Branch to College System
                          </button>
                        </form>

                        {/* List of Configured Branches */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700' }}>Active Configured Branches ({branches.length})</h4>
                            <button
                              onClick={() => {
                                if (window.confirm('Reset all branches to official default degree college branches?')) {
                                  resetBranchesToDefault();
                                  setBranchModalSuccess('Reset to default college branches.');
                                }
                              }}
                              style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                              Reset to Institutional Defaults
                            </button>
                          </div>

                          <div style={{ maxHeight: '260px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                            <table className="custom-table" style={{ fontSize: '0.82rem' }}>
                              <thead>
                                <tr>
                                  <th>Code</th>
                                  <th>Course Name</th>
                                  <th>Degree Level</th>
                                  <th>Enrolled Students</th>
                                  <th style={{ textAlign: 'right' }}>Action</th>
                                </tr>
                              </thead>
                              <tbody>
                                {branches.map(b => {
                                  const count = db.users.students.filter(s => (s.branch || '').toUpperCase() === b.code.toUpperCase()).length;
                                  return (
                                    <tr key={b.code}>
                                      <td><strong style={{ color: '#93c5fd' }}>{b.code}</strong></td>
                                      <td>{b.name}</td>
                                      <td><span style={{ opacity: 0.8 }}>{b.degree} ({b.totalSems || 8} Sems)</span></td>
                                      <td>
                                        <span className="badge badge-assigned">{count} Students</span>
                                      </td>
                                      <td style={{ textAlign: 'right' }}>
                                        <button
                                          onClick={() => {
                                            if (window.confirm(`Are you sure you want to remove branch "${b.code}" from the filter list?`)) {
                                              removeBranch(b.code);
                                              if (selectedBranchFilter === b.code) setSelectedBranchFilter('ALL');
                                            }
                                          }}
                                          style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                                          title="Remove branch"
                                        >
                                          <Trash2 size={13} /> Remove
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        <div style={{ marginTop: '20px', textAlign: 'right' }}>
                          <button
                            onClick={() => { setIsBranchManagerOpen(false); setBranchModalError(''); setBranchModalSuccess(''); }}
                            className="btn btn-secondary"
                            style={{ padding: '6px 20px', fontSize: '0.85rem' }}
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

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
                            const idVal = getRosterField(row, ['student id', 'studentid', 'student usn', 'studentusn', 'usn', 'id', 'roll no', 'rollno', 'student_id'], '—');
                            const nameVal = getRosterField(row, ['student name', 'studentname', 'name', 'full name', 'fullname', 'student_name'], '—');
                            const emailVal = getRosterField(row, ['student gmail', 'studentgmail', 'student email', 'studentemail', 'gmail', 'email', 'email address', 'emailaddress', 'mail', 'student_gmail', 'student_email'], '—');
                            const branchVal = getRosterField(row, ['branch', 'department', 'dept', 'course'], 'CSE');
                            const semVal = getRosterField(row, ['semester', 'sem'], '5');

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
                        <p style={{ fontSize: '0.78rem', color: '#38bdf8', margin: '6px 0 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Sparkles size={14} /> Dispatched modern HTML credentials email featuring a direct 1-click student portal login button (auto-populates ID & Password).
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
              <button
                className={`btn ${mentorSubTab === 'excel-import' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setMentorSubTab('excel-import')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                <UserPlus size={16} />
                Add / Import Mentors
              </button>
            </div>

            {/* Sub-tab 1: Faculty Directory */}
            {mentorSubTab === 'directory' && (() => {
              // Stats
              const totalStudents = db.users.students.length;
              const assignedStudentsCount = db.users.students.filter(s => !!s.mentorId).length;
              const unassignedStudentsCount = totalStudents - assignedStudentsCount;

              // Filtered mentors list
              const filteredMentors = db.users.mentors.filter(m => {
                const matchDept = mentorFilterDept === 'ALL' || (m.dept || '').toUpperCase() === mentorFilterDept.toUpperCase();
                const q = searchTerm.toLowerCase();
                const matchSearch = !q || (m.name || '').toLowerCase().includes(q) || (m.id || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q) || (m.dept || '').toLowerCase().includes(q);
                return matchDept && matchSearch;
              });

              // Mentor departments
              const allMentorDepts = Array.from(new Set(db.users.mentors.map(m => (m.dept || 'CSE').toUpperCase()))).sort();

              return (
                <div>
                  {/* Header & Quick Summary */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UserCheck size={20} style={{ color: '#8b5cf6' }} />
                        Faculty Mentors Directory & Student Allocation
                      </h2>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                        Manage faculty mentors, add mentors directly, and assign degree college students with 1-click batch allocation.
                      </p>
                    </div>

                    {/* Summary KPI Badges & Quick Add Action */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <div style={{ background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.78rem' }}>
                        👨‍🏫 Faculty: <strong style={{ color: '#c4b5fd' }}>{db.users.mentors.length}</strong>
                      </div>
                      <div style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.78rem' }}>
                        ✅ Assigned: <strong style={{ color: '#34d399' }}>{assignedStudentsCount}</strong> / {totalStudents}
                      </div>
                      {unassignedStudentsCount > 0 && (
                        <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '4px 12px', borderRadius: '8px', fontSize: '0.78rem' }}>
                          ⚠️ Unassigned: <strong style={{ color: '#f87171' }}>{unassignedStudentsCount}</strong>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setMentorSubTab('excel-import');
                          setMentorEntryMode('single');
                        }}
                        className="btn btn-primary"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.82rem',
                          padding: '6px 14px',
                          background: '#7c3aed',
                          border: 'none',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                        title="Add a single faculty mentor directly without spreadsheet"
                      >
                        <Plus size={15} /> Add Single Mentor
                      </button>
                    </div>
                  </div>

                  {/* Mentor Delete Success Alert */}
                  {mentorDeleteSuccessMsg && (
                    <div style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      color: '#34d399',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.88rem',
                      fontWeight: '600'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle2 size={18} />
                        <span>{mentorDeleteSuccessMsg}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMentorDeleteSuccessMsg('')}
                        style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer' }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  )}

                  {/* Filter & Search Bar */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        placeholder="Search Faculty Name, ID, Email, Dept..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="form-control"
                        style={{ paddingLeft: '36px', height: '38px', fontSize: '0.85rem' }}
                      />
                    </div>
                    <div>
                      <select
                        value={mentorFilterDept}
                        onChange={(e) => setMentorFilterDept(e.target.value)}
                        className="form-control"
                        style={{ height: '38px', fontSize: '0.85rem' }}
                      >
                        <option value="ALL">All Faculty Departments</option>
                        {allMentorDepts.map(dept => (
                          <option key={dept} value={dept}>
                            {dept} Department ({db.users.mentors.filter(m => (m.dept || '').toUpperCase() === dept).length} Mentors)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Faculty Mentors Table */}
                  <div className="custom-table-container" style={{ maxHeight: '520px', overflowY: 'auto' }}>
                    <table className="custom-table">
                      <thead>
                        <tr>
                          <th>Mentor ID</th>
                          <th>Faculty Mentor Name</th>
                          <th>Email Address</th>
                          <th>Department</th>
                          <th>Assigned Mentees Count</th>
                          <th>Action</th>
                          <th style={{ width: '50px', textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMentors.length === 0 ? (
                          <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                              <UserCheck size={36} style={{ marginBottom: '8px', opacity: 0.5 }} />
                              <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600' }}>No faculty mentors found.</p>
                            </td>
                          </tr>
                        ) : (
                          filteredMentors.map(mentor => {
                            const mentees = (db.users?.students || []).filter(s => isMatchingMentorId(s.mentorId, mentor.id));
                            const mentorDept = (mentor.dept || 'CSE').toUpperCase();
                            const deptStudentsTotal = (db.users?.students || []).filter(s => (s.branch || '').toUpperCase() === mentorDept).length;

                            return (
                              <tr key={mentor.id}>
                                <td><code style={{ fontWeight: 'bold', color: '#c4b5fd' }}>{mentor.id}</code></td>
                                <td>
                                  <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>{mentor.name}</strong>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{mentor.class || `${mentees.length} Assigned Mentees`}</div>
                                </td>
                                <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{mentor.email}</td>
                                <td>
                                  <span className="badge badge-assigned" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#c4b5fd', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                                    {mentorDept}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    onClick={() => handleOpenAssignmentModal(mentor)}
                                    style={{
                                      background: mentees.length > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                      border: mentees.length > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                                      color: mentees.length > 0 ? '#34d399' : '#fca5a5',
                                      borderRadius: '16px',
                                      padding: '4px 12px',
                                      fontSize: '0.78rem',
                                      fontWeight: '700',
                                      cursor: 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px'
                                    }}
                                    title="Click to view and assign students"
                                  >
                                    <Users size={13} />
                                    {mentees.length} Mentees Assigned
                                  </button>
                                  {deptStudentsTotal > 0 && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                                      ({deptStudentsTotal} total {mentorDept} students)
                                    </span>
                                  )}
                                </td>
                                <td>
                                  <button
                                    onClick={() => handleOpenAssignmentModal(mentor)}
                                    className="btn btn-primary"
                                    style={{
                                      fontSize: '0.8rem',
                                      padding: '6px 14px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontWeight: '600',
                                      background: '#7c3aed',
                                      border: 'none',
                                      cursor: 'pointer'
                                    }}
                                    title={`Click to assign students to ${mentor.name}`}
                                  >
                                    <UserPlus size={15} />
                                    Assign Students
                                  </button>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <div style={{ position: 'relative', display: 'inline-block' }}>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveActionMenuMentorId(activeActionMenuMentorId === mentor.id ? null : mentor.id);
                                      }}
                                      style={{
                                        background: 'rgba(255, 255, 255, 0.06)',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--text-secondary)',
                                        cursor: 'pointer',
                                        padding: '5px 7px',
                                        borderRadius: '6px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'all 0.2s'
                                      }}
                                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                      title="Faculty mentor actions"
                                    >
                                      <MoreVertical size={16} />
                                    </button>

                                    {activeActionMenuMentorId === mentor.id && (
                                      <>
                                        <div
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveActionMenuMentorId(null);
                                          }}
                                          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}
                                        />
                                        <div
                                          onClick={(e) => e.stopPropagation()}
                                          style={{
                                            position: 'absolute',
                                            right: 0,
                                            top: '100%',
                                            marginTop: '4px',
                                            background: 'var(--bg-secondary)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
                                            zIndex: 101,
                                            minWidth: '170px',
                                            padding: '4px'
                                          }}
                                        >
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveActionMenuMentorId(null);
                                              handleOpenAssignmentModal(mentor);
                                            }}
                                            style={{
                                              width: '100%',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '8px',
                                              padding: '8px 12px',
                                              background: 'none',
                                              border: 'none',
                                              color: 'var(--text-primary)',
                                              borderRadius: '6px',
                                              fontSize: '0.82rem',
                                              fontWeight: '500',
                                              cursor: 'pointer',
                                              textAlign: 'left'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                          >
                                            <UserPlus size={14} style={{ color: '#8b5cf6' }} /> Assign Students
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setActiveActionMenuMentorId(null);
                                              setMentorPendingDelete(mentor);
                                            }}
                                            style={{
                                              width: '100%',
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '8px',
                                              padding: '8px 12px',
                                              background: 'none',
                                              border: 'none',
                                              color: '#f87171',
                                              borderRadius: '6px',
                                              fontSize: '0.82rem',
                                              fontWeight: '600',
                                              cursor: 'pointer',
                                              textAlign: 'left',
                                              transition: 'background 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                          >
                                            <Trash2 size={14} /> Remove Mentor
                                          </button>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* ========================================================= */}
                  {/* ZERO-TYPING STUDENT ASSIGNMENT MODAL */}
                  {/* ========================================================= */}
                  {assigningMentor && (() => {
                    const mentorDept = (assigningMentor.dept || 'CSE').toUpperCase();

                    // Filtered students for modal checklist
                    const modalStudents = (db.users?.students || []).filter(s => {
                      // Branch Filter
                      if (mentorAssignBranch !== 'ALL' && (s.branch || '').toUpperCase() !== mentorAssignBranch.toUpperCase()) {
                        return false;
                      }
                      // Semester Filter
                      if (mentorAssignSem !== 'ALL' && parseInt(s.sem) !== parseInt(mentorAssignSem)) {
                        return false;
                      }
                      // Status tab filter
                      if (mentorAssignFilterTab === 'unassigned' && !!s.mentorId) {
                        return false;
                      }
                      if (mentorAssignFilterTab === 'assigned-to-this' && !isMatchingMentorId(s.mentorId, assigningMentor.id)) {
                        return false;
                      }
                      // Search filter
                      if (mentorAssignSearch.trim()) {
                        const q = mentorAssignSearch.toLowerCase();
                        const matchName = (s.name || '').toLowerCase().includes(q);
                        const matchId = (s.id || '').toLowerCase().includes(q);
                        const matchBranch = (s.branch || '').toLowerCase().includes(q);
                        if (!matchName && !matchId && !matchBranch) return false;
                      }
                      return true;
                    });

                    // Quick counts
                    const allDeptStudents = (db.users?.students || []).filter(s => (s.branch || '').toUpperCase() === mentorDept);
                    const unassignedDeptStudents = allDeptStudents.filter(s => !s.mentorId || isMatchingMentorId(s.mentorId, assigningMentor.id));
                    const allUnassignedStudents = (db.users?.students || []).filter(s => !s.mentorId || isMatchingMentorId(s.mentorId, assigningMentor.id));

                    // 1-Click Handlers (ZERO TYPING!)
                    const handleQuickSelectAllVisible = () => {
                      const visibleIds = modalStudents.map(s => s.id);
                      setSelectedStudentIdsForMentor(Array.from(new Set([...selectedStudentIdsForMentor, ...visibleIds])));
                    };

                    const handleQuickSelectAllDept = () => {
                      const deptIds = allDeptStudents.map(s => s.id);
                      setSelectedStudentIdsForMentor(Array.from(new Set([...selectedStudentIdsForMentor, ...deptIds])));
                    };

                    const handleQuickSelectUnassignedDept = () => {
                      const unassignedIds = unassignedDeptStudents.map(s => s.id);
                      setSelectedStudentIdsForMentor(Array.from(new Set([...selectedStudentIdsForMentor, ...unassignedIds])));
                    };

                    const handleQuickSelectAllUnassigned = () => {
                      const unassignedIds = allUnassignedStudents.map(s => s.id);
                      setSelectedStudentIdsForMentor(Array.from(new Set([...selectedStudentIdsForMentor, ...unassignedIds])));
                    };

                    const handleQuickSelectSem = (semNumber) => {
                      const semStudents = (db.users?.students || []).filter(s => {
                        const matchSem = parseInt(s.sem) === semNumber;
                        const matchBranch = mentorAssignBranch === 'ALL' || (s.branch || '').toUpperCase() === mentorAssignBranch.toUpperCase();
                        return matchSem && matchBranch;
                      }).map(s => s.id);
                      setSelectedStudentIdsForMentor(Array.from(new Set([...selectedStudentIdsForMentor, ...semStudents])));
                    };

                    const handleToggleSelectAllVisible = () => {
                      const visibleIds = modalStudents.map(s => s.id);
                      const allVisibleSelected = visibleIds.every(id => selectedStudentIdsForMentor.includes(id));
                      if (allVisibleSelected) {
                        setSelectedStudentIdsForMentor(selectedStudentIdsForMentor.filter(id => !visibleIds.includes(id)));
                      } else {
                        setSelectedStudentIdsForMentor(Array.from(new Set([...selectedStudentIdsForMentor, ...visibleIds])));
                      }
                    };

                    const handleToggleStudent = (studentId) => {
                      if (selectedStudentIdsForMentor.includes(studentId)) {
                        setSelectedStudentIdsForMentor(selectedStudentIdsForMentor.filter(id => id !== studentId));
                      } else {
                        setSelectedStudentIdsForMentor([...selectedStudentIdsForMentor, studentId]);
                      }
                    };

                    const isAllVisibleSelected = modalStudents.length > 0 && modalStudents.every(s => selectedStudentIdsForMentor.includes(s.id));

                    return (
                      <div style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0, 0, 0, 0.78)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        padding: '20px'
                      }}>
                        <div style={{
                          background: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '16px',
                          maxWidth: '780px',
                          width: '100%',
                          maxHeight: '92vh',
                          display: 'flex',
                          flexDirection: 'column',
                          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
                          overflow: 'hidden'
                        }}>
                          {/* Modal Header */}
                          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(124, 58, 237, 0.06)' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(139, 92, 246, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c4b5fd' }}>
                                  <UserCheck size={22} />
                                </div>
                                <div>
                                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                                    Assign Students to {assigningMentor.name}
                                  </h3>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                                    <span style={{ fontSize: '0.75rem', background: 'rgba(139, 92, 246, 0.2)', color: '#c4b5fd', padding: '1px 8px', borderRadius: '10px', fontWeight: '700' }}>
                                      {mentorDept} Department
                                    </span>
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                      {assigningMentor.email}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ fontSize: '0.85rem', fontWeight: '700', background: '#7c3aed', color: '#ffffff', padding: '4px 12px', borderRadius: '16px' }}>
                                {selectedStudentIdsForMentor.length} Mentees Selected
                              </span>
                              <button
                                onClick={() => setAssigningMentor(null)}
                                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                              >
                                <X size={20} />
                              </button>
                            </div>
                          </div>

                          {/* Modal Body */}
                          <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                            {/* Success Notification */}
                            {mentorAssignSuccessMsg && (
                              <div style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CheckCircle2 size={16} />
                                {mentorAssignSuccessMsg}
                              </div>
                            )}

                            {/* 1-Click Smart Actions Bar (ZERO TYPING REQUIRED!) */}
                            <div style={{
                              background: 'rgba(255, 255, 255, 0.02)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '10px',
                              padding: '12px 14px',
                              marginBottom: '16px'
                            }}>
                              <div style={{ fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Sparkles size={14} style={{ color: '#fbbf24' }} /> 1-Click Quick Batch Allocations (Zero Typing):
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                <button
                                  type="button"
                                  onClick={handleQuickSelectAllVisible}
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.78rem', padding: '5px 12px', background: 'rgba(124, 58, 237, 0.18)', border: '1px solid rgba(124, 58, 237, 0.4)', color: '#c4b5fd', fontWeight: '700' }}
                                >
                                  ⚡ Select All Visible Students ({modalStudents.length})
                                </button>
                                {allDeptStudents.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={handleQuickSelectAllDept}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.78rem', padding: '5px 12px', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#93c5fd' }}
                                  >
                                    ➕ All {mentorDept} ({allDeptStudents.length})
                                  </button>
                                )}
                                {unassignedDeptStudents.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={handleQuickSelectUnassignedDept}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.78rem', padding: '5px 12px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399' }}
                                  >
                                    ➕ Unassigned {mentorDept} ({unassignedDeptStudents.length})
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={handleQuickSelectAllUnassigned}
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.78rem', padding: '5px 12px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24' }}
                                >
                                  ➕ All Unassigned ({allUnassignedStudents.length})
                                </button>
                                {[1, 2, 3, 4, 5, 6].map(sem => (
                                  <button
                                    key={sem}
                                    type="button"
                                    onClick={() => handleQuickSelectSem(sem)}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                                  >
                                    + Sem {sem}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => setSelectedStudentIdsForMentor([])}
                                  style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '0.75rem', cursor: 'pointer', marginLeft: 'auto', textDecoration: 'underline' }}
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>

                            {/* Checklist Filters & Search */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                              <div style={{ position: 'relative' }}>
                                <Search size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                  type="text"
                                  placeholder="Search USN, Name, Branch..."
                                  value={mentorAssignSearch}
                                  onChange={(e) => setMentorAssignSearch(e.target.value)}
                                  className="form-control"
                                  style={{ paddingLeft: '32px', height: '34px', fontSize: '0.82rem' }}
                                />
                              </div>
                              <select
                                value={mentorAssignBranch}
                                onChange={(e) => setMentorAssignBranch(e.target.value)}
                                className="form-control"
                                style={{ height: '34px', fontSize: '0.82rem' }}
                              >
                                <option value="ALL">All Branches ({(db.users?.students || []).length})</option>
                                {availableBranchList.map(code => (
                                  <option key={code} value={code}>
                                    {code} ({(db.users?.students || []).filter(s => (s.branch || '').toUpperCase() === code).length} Students)
                                  </option>
                                ))}
                              </select>
                              <select
                                value={mentorAssignSem}
                                onChange={(e) => setMentorAssignSem(e.target.value)}
                                className="form-control"
                                style={{ height: '34px', fontSize: '0.82rem' }}
                              >
                                <option value="ALL">All Semesters</option>
                                <option value="1">Sem 1</option>
                                <option value="2">Sem 2</option>
                                <option value="3">Sem 3</option>
                                <option value="4">Sem 4</option>
                                <option value="5">Sem 5</option>
                                <option value="6">Sem 6</option>
                                <option value="7">Sem 7</option>
                                <option value="8">Sem 8</option>
                              </select>
                            </div>

                            {/* 1-Click Branch Quick Filter Pills */}
                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '12px' }}>
                              <button
                                type="button"
                                onClick={() => setMentorAssignBranch('ALL')}
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '2px 8px',
                                  borderRadius: '12px',
                                  border: '1px solid',
                                  borderColor: mentorAssignBranch === 'ALL' ? '#7c3aed' : 'var(--border-color)',
                                  background: mentorAssignBranch === 'ALL' ? 'rgba(124, 58, 237, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                                  color: mentorAssignBranch === 'ALL' ? '#c4b5fd' : 'var(--text-muted)',
                                  cursor: 'pointer',
                                  fontWeight: mentorAssignBranch === 'ALL' ? '700' : 'normal'
                                }}
                              >
                                All ({(db.users?.students || []).length})
                              </button>
                              {availableBranchList.map(bCode => {
                                const count = (db.users?.students || []).filter(s => (s.branch || '').toUpperCase() === bCode).length;
                                if (count === 0 && bCode !== mentorDept) return null;
                                const isSelected = mentorAssignBranch === bCode;
                                return (
                                  <button
                                    key={bCode}
                                    type="button"
                                    onClick={() => setMentorAssignBranch(bCode)}
                                    style={{
                                      fontSize: '0.72rem',
                                      padding: '2px 8px',
                                      borderRadius: '12px',
                                      border: '1px solid',
                                      borderColor: isSelected ? '#7c3aed' : 'var(--border-color)',
                                      background: isSelected ? 'rgba(124, 58, 237, 0.25)' : 'rgba(255, 255, 255, 0.03)',
                                      color: isSelected ? '#c4b5fd' : 'var(--text-secondary)',
                                      cursor: 'pointer',
                                      fontWeight: isSelected ? '700' : 'normal'
                                    }}
                                  >
                                    {bCode} ({count})
                                  </button>
                                );
                              })}
                            </div>

                            {/* Status Tabs */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--border-color)' }}>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  onClick={() => setMentorAssignFilterTab('all')}
                                  style={{
                                    background: mentorAssignFilterTab === 'all' ? 'rgba(124, 58, 237, 0.2)' : 'none',
                                    border: 'none',
                                    color: mentorAssignFilterTab === 'all' ? '#c4b5fd' : 'var(--text-muted)',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                  }}
                                >
                                  All ({modalStudents.length})
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMentorAssignFilterTab('unassigned')}
                                  style={{
                                    background: mentorAssignFilterTab === 'unassigned' ? 'rgba(124, 58, 237, 0.2)' : 'none',
                                    border: 'none',
                                    color: mentorAssignFilterTab === 'unassigned' ? '#c4b5fd' : 'var(--text-muted)',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Unassigned Only
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMentorAssignFilterTab('assigned-to-this')}
                                  style={{
                                    background: mentorAssignFilterTab === 'assigned-to-this' ? 'rgba(124, 58, 237, 0.2)' : 'none',
                                    border: 'none',
                                    color: mentorAssignFilterTab === 'assigned-to-this' ? '#c4b5fd' : 'var(--text-muted)',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: '600',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Currently Assigned to this Mentor ({selectedStudentIdsForMentor.length})
                                </button>
                              </div>

                              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={isAllVisibleSelected}
                                  onChange={handleToggleSelectAllVisible}
                                  style={{ cursor: 'pointer' }}
                                />
                                Select All Visible ({modalStudents.length})
                              </label>
                            </div>

                            {/* Students Interactive Checklist */}
                            <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                              {modalStudents.length === 0 ? (
                                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                  No students match the current filters.
                                </div>
                              ) : (
                                <table className="custom-table" style={{ fontSize: '0.82rem', margin: 0 }}>
                                  <thead>
                                    <tr>
                                      <th style={{ width: '36px' }}></th>
                                      <th>Student USN / ID</th>
                                      <th>Student Name</th>
                                      <th>Branch & Sem</th>
                                      <th>Current Assignment Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {modalStudents.map(student => {
                                      const isSelected = selectedStudentIdsForMentor.includes(student.id);
                                      const currentMentor = (db.users?.mentors || []).find(m => isMatchingMentorId(m.id, student.mentorId));
                                      const isAssignedToThisMentor = isMatchingMentorId(student.mentorId, assigningMentor.id);

                                      return (
                                        <tr
                                          key={student.id}
                                          onClick={() => handleToggleStudent(student.id)}
                                          style={{
                                            cursor: 'pointer',
                                            background: isSelected ? 'rgba(124, 58, 237, 0.12)' : 'transparent'
                                          }}
                                        >
                                          <td onClick={(e) => e.stopPropagation()}>
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() => handleToggleStudent(student.id)}
                                              style={{ cursor: 'pointer' }}
                                            />
                                          </td>
                                          <td><code style={{ fontWeight: 'bold', color: '#93c5fd' }}>{student.id}</code></td>
                                          <td><strong style={{ color: 'var(--text-primary)' }}>{student.name}</strong></td>
                                          <td>
                                            <span style={{ fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                                              {student.branch || 'CSE'} · Sem {student.sem || 5}
                                            </span>
                                          </td>
                                          <td>
                                            {isAssignedToThisMentor ? (
                                              <span style={{ fontSize: '0.72rem', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>
                                                ✅ Assigned to {assigningMentor.name}
                                              </span>
                                            ) : currentMentor ? (
                                              <span style={{ fontSize: '0.72rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '2px 8px', borderRadius: '10px' }}>
                                                ⚠️ Assigned to {currentMentor.name}
                                              </span>
                                            ) : (
                                              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                ⚪ Unassigned
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </div>

                          {/* Modal Footer */}
                          <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0, 0, 0, 0.2)' }}>
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                              Total Selected: <strong style={{ color: '#c4b5fd' }}>{selectedStudentIdsForMentor.length} Students</strong>
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button
                                type="button"
                                onClick={() => setAssigningMentor(null)}
                                className="btn btn-secondary"
                                style={{ padding: '7px 18px', fontSize: '0.85rem' }}
                              >
                                Close
                              </button>
                              <button
                                type="button"
                                onClick={handleSaveMentorAssignments}
                                className="btn btn-primary"
                                style={{
                                  padding: '7px 24px',
                                  fontSize: '0.85rem',
                                  fontWeight: '700',
                                  background: '#7c3aed',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px'
                                }}
                              >
                                <CheckCircle2 size={16} />
                                Save Assigned Students ({selectedStudentIdsForMentor.length})
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}

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

            {/* Sub-tab 3: Faculty Mentors Onboarding & Excel Import */}
            {mentorSubTab === 'excel-import' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <UserPlus size={22} style={{ color: '#8b5cf6' }} />
                      Faculty Mentors Onboarding & Credential Dispatch
                    </h2>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                      Add faculty mentors individually via the quick form or bulk-upload institutional rosters via Excel / CSV spreadsheets.
                    </p>
                  </div>
                  {mentorEntryMode === 'excel' && (
                    <button onClick={handleDownloadMentorTemplate} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                      <FileSpreadsheet size={16} />
                      Download Sample Excel Template
                    </button>
                  )}
                </div>

                {/* Mode Switcher: Add Single Mentor vs Bulk Excel/CSV Import */}
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '5px',
                  marginBottom: '20px'
                }}>
                  <button
                    type="button"
                    onClick={() => setMentorEntryMode('single')}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: mentorEntryMode === 'single' ? '#7c3aed' : 'transparent',
                      color: mentorEntryMode === 'single' ? '#ffffff' : 'var(--text-secondary)',
                      fontWeight: mentorEntryMode === 'single' ? '700' : '600',
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <UserPlus size={16} />
                    Add Single Mentor Directly (No Spreadsheet Needed)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMentorEntryMode('excel')}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px 16px',
                      borderRadius: '8px',
                      border: 'none',
                      background: mentorEntryMode === 'excel' ? '#2563eb' : 'transparent',
                      color: mentorEntryMode === 'excel' ? '#ffffff' : 'var(--text-secondary)',
                      fontWeight: mentorEntryMode === 'excel' ? '700' : '600',
                      fontSize: '0.88rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <FileSpreadsheet size={16} />
                    Bulk Upload via Excel / CSV Spreadsheet
                  </button>
                </div>

                {/* MODE 1: SINGLE MENTOR DIRECT FORM */}
                {mentorEntryMode === 'single' && (
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '14px',
                    padding: '24px',
                    marginBottom: '24px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: '700', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <UserPlus size={20} style={{ color: '#8b5cf6' }} />
                          Quick Single Mentor Registration
                        </h3>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          Create an individual faculty mentor account immediately. Credentials will be generated and dispatched to their email automatically.
                        </p>
                      </div>
                      <span style={{ fontSize: '0.75rem', background: 'rgba(124, 58, 237, 0.15)', color: '#c4b5fd', padding: '4px 10px', borderRadius: '12px', fontWeight: '600' }}>
                        ⚡ Instant Provisioning
                      </span>
                    </div>

                    {/* Success Feedback Card */}
                    {singleMentorSuccess && (
                      <div style={{
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        borderRadius: '12px',
                        padding: '18px 20px',
                        marginBottom: '20px'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#34d399', fontWeight: '700', fontSize: '0.95rem' }}>
                            <CheckCircle2 size={20} />
                            Faculty Mentor "{singleMentorSuccess.name}" Successfully Registered!
                          </div>
                          <button
                            type="button"
                            onClick={() => setSingleMentorSuccess(null)}
                            style={{ background: 'none', border: 'none', color: '#34d399', cursor: 'pointer' }}
                          >
                            <X size={16} />
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', fontSize: '0.82rem', marginBottom: '14px' }}>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Mentor ID:</span>{' '}
                            <code style={{ color: '#c4b5fd', fontWeight: 'bold' }}>{singleMentorSuccess.id}</code>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Email:</span>{' '}
                            <strong style={{ color: 'var(--text-primary)' }}>{singleMentorSuccess.email}</strong>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Department:</span>{' '}
                            <span className="badge badge-assigned">{singleMentorSuccess.dept}</span>
                          </div>
                          <div>
                            <span style={{ color: 'var(--text-muted)' }}>Generated Password:</span>{' '}
                            <code style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                              {singleMentorSuccess.password}
                            </code>
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSingleMentorSuccess(null);
                              setMentorSubTab('directory');
                            }}
                            className="btn btn-secondary"
                            style={{ fontSize: '0.82rem', padding: '6px 14px' }}
                          >
                            View in Faculty Directory
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const registered = (db.users?.mentors || []).find(m => m.id === singleMentorSuccess.id) || singleMentorSuccess;
                              handleOpenAssignmentModal(registered);
                            }}
                            className="btn btn-primary"
                            style={{ fontSize: '0.82rem', padding: '6px 14px', background: '#7c3aed', border: 'none' }}
                          >
                            <UserPlus size={14} /> Assign Students to {singleMentorSuccess.name}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Error Message */}
                    {singleMentorError && (
                      <div style={{
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#fca5a5',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        marginBottom: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.85rem'
                      }}>
                        <AlertCircle size={18} />
                        <span>{singleMentorError}</span>
                      </div>
                    )}

                    {/* Form Grid */}
                    <form onSubmit={handleSingleMentorSubmit}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', marginBottom: '6px', color: 'var(--text-primary)' }}>
                            Faculty Mentor Name *
                          </label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Dr. Raghavan Sharma"
                            value={singleMentorName}
                            onChange={(e) => setSingleMentorName(e.target.value)}
                            className="form-control"
                            style={{ fontSize: '0.85rem' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', marginBottom: '6px', color: 'var(--text-primary)' }}>
                            Official Email Address / Gmail *
                          </label>
                          <input
                            type="email"
                            required
                            placeholder="e.g. raghavan.sharma@nitte.edu.in"
                            value={singleMentorEmail}
                            onChange={(e) => setSingleMentorEmail(e.target.value)}
                            className="form-control"
                            style={{ fontSize: '0.85rem' }}
                          />
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Login credentials & portal access URL will be sent to this email.
                          </span>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', marginBottom: '6px', color: 'var(--text-primary)' }}>
                            Faculty Department / Degree Branch *
                          </label>
                          <select
                            value={singleMentorDept}
                            onChange={(e) => setSingleMentorDept(e.target.value)}
                            className="form-control"
                            style={{ fontSize: '0.85rem' }}
                          >
                            {availableBranchList.map(bCode => (
                              <option key={bCode} value={bCode}>{bCode} Department</option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', marginBottom: '6px', color: 'var(--text-primary)' }}>
                            Mentor ID / Faculty ID <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span>
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. M-105 (Auto-generated if left blank)"
                            value={singleMentorId}
                            onChange={(e) => setSingleMentorId(e.target.value)}
                            className="form-control"
                            style={{ fontSize: '0.85rem' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', marginBottom: '6px', color: 'var(--text-primary)' }}>
                            Assigned Class / Batch / Cabin <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span>
                          </label>
                          <input
                            type="text"
                            placeholder={`e.g. ${singleMentorDept || 'BCA'} 3rd Sem or Room 302`}
                            value={singleMentorClass}
                            onChange={(e) => setSingleMentorClass(e.target.value)}
                            className="form-control"
                            style={{ fontSize: '0.85rem' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '700', marginBottom: '6px', color: 'var(--text-primary)' }}>
                            Initial Password <span style={{ fontWeight: 'normal', color: 'var(--text-muted)' }}>(Optional)</span>
                          </label>
                          <input
                            type="text"
                            placeholder="Leave empty to auto-generate e.g. Nit#Mnt4821"
                            value={singleMentorPassword}
                            onChange={(e) => setSingleMentorPassword(e.target.value)}
                            className="form-control"
                            style={{ fontSize: '0.85rem' }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button
                          type="submit"
                          disabled={isSubmittingSingleMentor}
                          className="btn btn-primary"
                          style={{
                            background: '#7c3aed',
                            border: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 24px',
                            fontSize: '0.9rem',
                            fontWeight: '700',
                            cursor: 'pointer'
                          }}
                        >
                          {isSubmittingSingleMentor ? (
                            <>
                              <RefreshCw size={16} className="spin" />
                              Registering Faculty Mentor & Sending Credentials...
                            </>
                          ) : (
                            <>
                              <UserPlus size={16} />
                              Register Faculty Mentor & Dispatch Credentials
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* MODE 2: EXCEL / CSV BULK IMPORT */}
                {mentorEntryMode === 'excel' && (
                  <div>
                    {/* Instruction Banner */}
                    <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#60a5fa', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Shield size={16} /> How Bulk Faculty Onboarding Works:
                      </h4>
                      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <li>Your uploaded spreadsheet must include headers for <strong>Mentor ID</strong> (e.g. <code>M102</code>), <strong>Faculty Name</strong>, and <strong>Faculty Email</strong>. (Department and Assigned Class are optional).</li>
                        <li>The system will automatically generate a secure password (e.g. <code>Nit#K9m2</code>) for each faculty mentor unless a custom password column is provided.</li>
                        <li>Accounts are saved into PostgreSQL. An automated onboarding email with login credentials & URL is sent via <code>skandhayashu2906@gmail.com</code>.</li>
                        <li>Admin receives a full audit table and can download an Excel/CSV copy of all generated faculty credentials.</li>
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
                    Drag and drop your faculty roster file here or click below to browse from your computer
                  </p>

                  <input
                    type="file"
                    id="mentorRosterFileInput"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleMentorFileSelect}
                    style={{ display: 'none' }}
                  />
                  <label
                    htmlFor="mentorRosterFileInput"
                    className="btn btn-primary"
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                  >
                    <FileSpreadsheet size={16} />
                    Select Faculty Excel File
                  </label>

                  {mentorRosterFile && (
                    <div style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'rgba(37, 99, 235, 0.15)', border: '1px solid rgba(37, 99, 235, 0.3)', padding: '8px 16px', borderRadius: '20px' }}>
                      <FileSpreadsheet size={16} style={{ color: '#60a5fa' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#93c5fd' }}>{mentorRosterFile.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({(mentorRosterFile.size / 1024).toFixed(1)} KB — {parsedMentorRoster.length} rows detected)</span>
                      <button onClick={() => { setMentorRosterFile(null); setParsedMentorRoster([]); }} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {mentorUploadError && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    <AlertCircle size={18} />
                    <span>{mentorUploadError}</span>
                  </div>
                )}

                {/* Parsed Preview Table */}
                {parsedMentorRoster.length > 0 && !mentorUploadResult && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                        Previewing {parsedMentorRoster.length} Faculty Mentor Record{parsedMentorRoster.length > 1 ? 's' : ''} Ready for Onboarding
                      </h3>
                      <button
                        onClick={handleMentorRosterSubmit}
                        disabled={isUploadingMentorRoster}
                        className="btn btn-success"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', fontSize: '0.9rem', fontWeight: '600' }}
                      >
                        {isUploadingMentorRoster ? (
                          <>
                            <RefreshCw size={16} className="spin" />
                            Generating Passwords & Sending Emails...
                          </>
                        ) : (
                          <>
                            <Mail size={16} />
                            Register & Dispatch Credentials ({parsedMentorRoster.length})
                          </>
                        )}
                      </button>
                    </div>

                    <div className="custom-table-container" style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: '24px' }}>
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Mentor ID</th>
                            <th>Faculty Name</th>
                            <th>Faculty Email</th>
                            <th>Department</th>
                            <th>Assigned Class</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedMentorRoster.map((row, idx) => {
                            const id = row.id || row.mentorId || row['Mentor ID'] || row['FAC ID'] || row['Faculty ID'] || '—';
                            const name = row.name || row.mentorName || row['Faculty Name'] || row['Mentor Name'] || row['Name'] || '—';
                            const email = row.email || row.mentorEmail || row['Faculty Email'] || row['Mentor Email'] || row['Email'] || '—';
                            const dept = row.dept || row.Dept || row['Department'] || 'CSE';
                            const assignedClass = row.class || row['Class'] || row['Assigned Class'] || row['Section'] || 'General';
                            return (
                              <tr key={idx}>
                                <td>{idx + 1}</td>
                                <td><code>{id}</code></td>
                                <td><strong>{name}</strong></td>
                                <td>{email}</td>
                                <td><span className="badge badge-assigned">{dept}</span></td>
                                <td style={{ fontSize: '0.85rem' }}>{assignedClass}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Upload Results & Audit Table */}
                {mentorUploadResult && (
                  <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#34d399', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CheckCircle2 size={20} />
                          Bulk Faculty Onboarding Finished: {mentorUploadResult.successCount} Enrolled, {mentorUploadResult.failureCount} Failed
                        </h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                          PostgreSQL accounts created/updated, passwords generated, and credential emails dispatched via Gmail SMTP.
                        </p>
                      </div>
                      <button
                        onClick={handleExportMentorCredentialsCsv}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
                      >
                        <Download size={16} />
                        Export Faculty Credentials CSV
                      </button>
                    </div>

                    <div className="custom-table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Mentor ID</th>
                            <th>Faculty Name</th>
                            <th>Email Address</th>
                            <th>Generated Password</th>
                            <th>Email Dispatch Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(mentorUploadResult.results || []).map((res, i) => (
                            <tr key={i}>
                              <td>{i + 1}</td>
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
          </div>
        )}


        {/* ============================================================== */}
        {/* TAB 4: RELATIONSHIP OFFICERS */}
        {/* ============================================================== */}
        {activeTab === 'ros' && (
          <div className="glass-card">
            {/* Sub-tab pills */}
            <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '14px', marginBottom: '20px' }}>
              <button
                className={`btn ${roSubTab === 'directory' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRoSubTab('directory')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                <Users size={16} />
                Relationship Officers Directory ({db.users.ros.length})
              </button>
              <button
                className={`btn ${roSubTab === 'excel-import' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setRoSubTab('excel-import')}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
              >
                <FileSpreadsheet size={16} />
                Import ROs Roster
              </button>
            </div>

            {/* Sub-tab 1: RO Directory */}
            {roSubTab === 'directory' && (
              <div>
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
                              <td><span className="badge badge-resolved">{ro.password || 'Nit#Ro2026'}</span></td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Sub-tab 2: ROs Excel Import */}
            {roSubTab === 'excel-import' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div>
                    <h2 className="section-title" style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileSpreadsheet size={22} style={{ color: '#059669' }} />
                      Relationship Officers (ROs) Roster Import & Automated Credential Dispatch
                    </h2>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                      Upload Relationship Officers rosters in Excel (<code>.xlsx</code>, <code>.xls</code>) or <code>.csv</code> format. The system automatically registers RO accounts in PostgreSQL, generates login credentials, and emails credentials directly to officers.
                    </p>
                  </div>
                  <button onClick={handleDownloadRoTemplate} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    <FileSpreadsheet size={16} />
                    Download Sample Excel Template
                  </button>
                </div>

                {/* Instruction Banner */}
                <div style={{ background: 'rgba(5, 150, 105, 0.08)', border: '1px solid rgba(5, 150, 105, 0.25)', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#34d399', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Shield size={16} /> How Bulk Relationship Officer Onboarding Works:
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.82rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <li>Your uploaded spreadsheet must include headers for <strong>RO ID</strong> (e.g. <code>RO-50</code>), <strong>Officer Name</strong>, and <strong>Category Jurisdiction</strong> (Officer Email is optional, defaults to <code>skandhayashu2906@gmail.com</code>).</li>
                    <li>The system will automatically generate a secure password (e.g. <code>Nit#J2x8</code>) for each RO unless a custom password column is provided.</li>
                    <li>Accounts are saved into PostgreSQL. An automated onboarding email with login credentials & URL is sent via <code>skandhayashu2906@gmail.com</code>.</li>
                    <li>Admin receives a full audit table and can download an Excel/CSV copy of all generated RO credentials.</li>
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
                  <Upload size={40} style={{ color: '#059669', marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '6px' }}>Choose Excel (.xlsx, .xls) or CSV File</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Drag and drop your RO roster file here or click below to browse from your computer
                  </p>

                  <input
                    type="file"
                    id="roRosterFileInput"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleRoFileSelect}
                    style={{ display: 'none' }}
                  />
                  <label
                    htmlFor="roRosterFileInput"
                    className="btn btn-primary"
                    style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#059669', borderColor: '#059669' }}
                  >
                    <FileSpreadsheet size={16} />
                    Select RO Excel File
                  </label>

                  {roRosterFile && (
                    <div style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '10px', background: 'rgba(5, 150, 105, 0.15)', border: '1px solid rgba(5, 150, 105, 0.3)', padding: '8px 16px', borderRadius: '20px' }}>
                      <FileSpreadsheet size={16} style={{ color: '#34d399' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: '600', color: '#6ee7b7' }}>{roRosterFile.name}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>({(roRosterFile.size / 1024).toFixed(1)} KB — {parsedRoRoster.length} rows detected)</span>
                      <button onClick={() => { setRoRosterFile(null); setParsedRoRoster([]); }} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Error Message */}
                {roUploadError && (
                  <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5', padding: '12px 16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                    <AlertCircle size={18} />
                    <span>{roUploadError}</span>
                  </div>
                )}

                {/* Parsed Preview Table */}
                {parsedRoRoster.length > 0 && !roUploadResult && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                        Previewing {parsedRoRoster.length} Relationship Officer Record{parsedRoRoster.length > 1 ? 's' : ''} Ready for Onboarding
                      </h3>
                      <button
                        onClick={handleRoRosterSubmit}
                        disabled={isUploadingRoRoster}
                        className="btn btn-success"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 20px', fontSize: '0.9rem', fontWeight: '600', background: '#059669', borderColor: '#059669' }}
                      >
                        {isUploadingRoRoster ? (
                          <>
                            <RefreshCw size={16} className="spin" />
                            Generating Passwords & Sending Emails...
                          </>
                        ) : (
                          <>
                            <Mail size={16} />
                            Register & Dispatch Credentials ({parsedRoRoster.length})
                          </>
                        )}
                      </button>
                    </div>

                    <div className="custom-table-container" style={{ maxHeight: '350px', overflowY: 'auto', marginBottom: '24px' }}>
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>RO ID</th>
                            <th>Officer Name</th>
                            <th>Officer Email</th>
                            <th>Jurisdiction Category</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedRoRoster.map((row, idx) => {
                            const id = row.id || row.roId || row['RO ID'] || row['Officer ID'] || row['Officer Code'] || '—';
                            const name = row.name || row.roName || row['Officer Name'] || row['RO Name'] || row['Name'] || '—';
                            const email = row.email || row.roEmail || row['Officer Email'] || row['Email'] || row['Gmail'] || 'skandhayashu2906@gmail.com';
                            const region = row.region || row['Region'] || row['Jurisdiction'] || row['Category Jurisdiction'] || row['Category'] || 'General Support';
                            return (
                              <tr key={idx}>
                                <td>{idx + 1}</td>
                                <td><code>{id}</code></td>
                                <td><strong>{name}</strong></td>
                                <td>{email}</td>
                                <td><span className="badge badge-assigned">{region}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Upload Results & Audit Table */}
                {roUploadResult && (
                  <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#34d399', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <CheckCircle2 size={20} />
                          Bulk RO Onboarding Finished: {roUploadResult.successCount} Enrolled, {roUploadResult.failureCount} Failed
                        </h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                          PostgreSQL accounts created/updated, passwords generated, and credential emails dispatched via Gmail SMTP.
                        </p>
                      </div>
                      <button
                        onClick={handleExportRoCredentialsCsv}
                        className="btn btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}
                      >
                        <Download size={16} />
                        Export RO Credentials CSV
                      </button>
                    </div>

                    <div className="custom-table-container" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                      <table className="custom-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>RO ID</th>
                            <th>Officer Name</th>
                            <th>Category Jurisdiction</th>
                            <th>Email Address</th>
                            <th>Generated Password</th>
                            <th>Email Dispatch Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(roUploadResult.results || []).map((res, i) => (
                            <tr key={i}>
                              <td>{i + 1}</td>
                              <td><code>{res.id}</code></td>
                              <td><strong>{res.name}</strong></td>
                              <td><span className="badge badge-assigned">{res.region}</span></td>
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
                      <option value="Re-escalated">⚡ Re-escalated</option>
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
                        .filter(i => {
                          if (ticketStatusFilter === 'All') return true;
                          if (ticketStatusFilter === 'Re-escalated') return Boolean(i.isReEscalated || i.status === 'Re-escalated' || (i.reEscalatedCount && i.reEscalatedCount > 0));
                          if (ticketStatusFilter === 'Escalated') return i.status === 'Escalated' || i.status === 'Re-escalated' || Boolean(i.isReEscalated);
                          return i.status === ticketStatusFilter;
                        })
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
                            <td>
                              <span className={`badge badge-${issue.status.toLowerCase().replace(' ', '-')}`}>{issue.status}</span>
                              {Boolean(issue.isReEscalated || (issue.reEscalatedCount && issue.reEscalatedCount > 0)) && (
                                <span style={{ marginLeft: '6px', fontSize: '0.68rem', background: 'rgba(239, 68, 68, 0.25)', color: '#f87171', padding: '1px 6px', borderRadius: '8px', fontWeight: '700', border: '1px solid rgba(239, 68, 68, 0.4)' }}>
                                  ⚡ {issue.reEscalatedCount ? `${issue.reEscalatedCount}x` : 'Re-escalated'}
                                </span>
                              )}
                            </td>
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
                                  <>
                                    {!hasAdminMeetingForIssue(issue) ? (
                                      <button
                                        onClick={() => handleOpenAdminScheduleModal(issue)}
                                        className="btn btn-primary"
                                        style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        title="Setup 1 Meeting with Student"
                                      >
                                        <Calendar size={12} /> Setup Meeting
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => { setSelectedIssueId(issue.id); setShowResolveModal(true); }}
                                        className="btn btn-success"
                                        style={{ padding: '4px 8px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                        title="Close the Ticket"
                                      >
                                        <CheckCircle2 size={12} /> Close Ticket
                                      </button>
                                    )}
                                  </>
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

        {/* ============================================================== */}
        {/* TAB 6: MENTOR FEEDBACKS MONITORING CENTER */}
        {/* ============================================================== */}
        {activeTab === 'mentor-feedbacks' && (
          <div className="glass-card">
            {/* Header & Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
              <div>
                <h2 className="section-title" style={{ fontSize: '1.25rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <MessageSquare size={22} style={{ color: 'var(--accent-amber)' }} />
                  Student Feedback on Mentors & Mentoring Classes
                </h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Official record of student evaluations assessing mentor regularity, explanation clarity, student participation, and reported difficulties.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={handleExportMentorFeedbacksCsv}
                  disabled={filteredMentorFeedbacks.length === 0}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem' }}
                >
                  <Download size={15} /> Export Audit CSV
                </button>
              </div>
            </div>

            {/* KPI Cards Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
              {/* Total Reviews */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Feedbacks</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                  <span style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>{totalMf}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>from students</span>
                </div>
              </div>

              {/* Regularity */}
              <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '10px', padding: '16px' }}>
                <span style={{ fontSize: '0.75rem', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Regularity of Classes</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                  <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>{avgRegularity}</span>
                  <span style={{ fontSize: '0.8rem', color: '#f59e0b' }}>/ 5.0</span>
                </div>
              </div>

              {/* Clarity */}
              <div style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', borderRadius: '10px', padding: '16px' }}>
                <span style={{ fontSize: '0.75rem', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Clarity of Explanation</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                  <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#3b82f6' }}>{avgClarity}</span>
                  <span style={{ fontSize: '0.8rem', color: '#3b82f6' }}>/ 5.0</span>
                </div>
              </div>

              {/* Participation */}
              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '16px' }}>
                <span style={{ fontSize: '0.75rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Student Participation</span>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                  <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#10b981' }}>{avgParticipation}</span>
                  <span style={{ fontSize: '0.8rem', color: '#10b981' }}>/ 5.0</span>
                </div>
              </div>
            </div>

            {/* Filter & Search Bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '20px' }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search by student, mentor, or problem..."
                  value={mfSearchTerm}
                  onChange={(e) => setMfSearchTerm(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '36px', fontSize: '0.84rem' }}
                />
              </div>

              <div>
                <select
                  value={mfMentorFilter}
                  onChange={(e) => setMfMentorFilter(e.target.value)}
                  className="form-select"
                  style={{ fontSize: '0.84rem' }}
                >
                  <option value="ALL">All Mentors ({db.users.mentors.length})</option>
                  {db.users.mentors.map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({m.dept})</option>
                  ))}
                </select>
              </div>

              <div>
                <select
                  value={mfRatingFilter}
                  onChange={(e) => setMfRatingFilter(e.target.value)}
                  className="form-select"
                  style={{ fontSize: '0.84rem' }}
                >
                  <option value="ALL">All Rating Ranges</option>
                  <option value="HIGH">High Satisfaction (Avg ≥ 4.0 ★)</option>
                  <option value="LOW">Needs Attention (Avg ≤ 3.0 ★)</option>
                </select>
              </div>
            </div>

            {/* Feedback Records List */}
            {filteredMentorFeedbacks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
                <MessageSquare size={44} style={{ marginBottom: '12px', opacity: 0.4 }} />
                <p style={{ margin: 0, fontSize: '0.92rem', color: 'var(--text-secondary)' }}>No student mentor feedbacks match your search or filter criteria.</p>
                {(mfSearchTerm || mfMentorFilter !== 'ALL' || mfRatingFilter !== 'ALL') && (
                  <button
                    onClick={() => { setMfSearchTerm(''); setMfMentorFilter('ALL'); setMfRatingFilter('ALL'); }}
                    className="btn btn-secondary"
                    style={{ marginTop: '12px', fontSize: '0.78rem' }}
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {filteredMentorFeedbacks.map((fb, idx) => {
                  const avg = ((Number(fb.regularityRating || 0) + Number(fb.clarityRating || 0) + Number(fb.participationRating || 0)) / 3).toFixed(1);
                  return (
                    <div
                      key={fb.id || idx}
                      className="glass-card"
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        padding: '18px',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {/* Top Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                              {fb.studentName}
                            </span>
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '6px' }}>
                              {fb.studentId}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                            Mentor Evaluated: <strong style={{ color: 'var(--text-primary)' }}>{fb.mentorName}</strong>
                          </p>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', background: Number(avg) >= 4 ? 'rgba(16, 185, 129, 0.15)' : Number(avg) <= 3 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)', color: Number(avg) >= 4 ? '#34d399' : Number(avg) <= 3 ? '#f87171' : '#fbbf24' }}>
                            Overall: ★ {avg} / 5.0
                          </span>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                            {new Date(fb.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Ratings Breakdown Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '14px', background: 'rgba(0,0,0,0.15)', padding: '10px 14px', borderRadius: '8px' }}>
                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Regularity of Classes</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <div style={{ display: 'flex', gap: '2px' }}>
                              {[1, 2, 3, 4, 5].map(star => (
                                <Star key={star} size={14} fill={star <= fb.regularityRating ? '#f59e0b' : 'none'} stroke="#f59e0b" />
                              ))}
                            </div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#f59e0b' }}>{fb.regularityRating}/5</span>
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Clarity of Explanation</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <div style={{ display: 'flex', gap: '2px' }}>
                              {[1, 2, 3, 4, 5].map(star => (
                                <Star key={star} size={14} fill={star <= fb.clarityRating ? '#3b82f6' : 'none'} stroke="#3b82f6" />
                              ))}
                            </div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3b82f6' }}>{fb.clarityRating}/5</span>
                          </div>
                        </div>

                        <div>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>Participation & Opinions</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <div style={{ display: 'flex', gap: '2px' }}>
                              {[1, 2, 3, 4, 5].map(star => (
                                <Star key={star} size={14} fill={star <= fb.participationRating ? '#10b981' : 'none'} stroke="#10b981" />
                              ))}
                            </div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#10b981' }}>{fb.participationRating}/5</span>
                          </div>
                        </div>
                      </div>

                      {/* Long Answer: Difficulties & Issues */}
                      <div style={{ background: 'rgba(255,255,255,0.015)', borderLeft: '3px solid var(--accent-amber)', padding: '10px 14px', borderRadius: '6px' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--accent-amber)', display: 'block', marginBottom: '4px' }}>
                          What difficulties or issues do you face with the mentoring classes or the way they are conducted?
                        </span>
                        <p style={{ fontSize: '0.85rem', color: fb.difficulties ? 'var(--text-primary)' : 'var(--text-muted)', fontStyle: fb.difficulties ? 'normal' : 'italic', margin: 0, lineHeight: '1.5' }}>
                          {fb.difficulties ? `"${fb.difficulties}"` : 'No specific difficulties or challenges noted by student.'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

      </div>

      {/* ADMIN RESOLVE DIRECT OVERRIDE / CLOSE TICKET MODAL */}
      {showResolveModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle2 size={20} color="#10b981" /> Administrative Resolution & Close Ticket
              </h3>
              <button onClick={() => setShowResolveModal(false)} className="btn-icon-only">✕</button>
            </div>
            <form onSubmit={handleResolveSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                  You are performing an official administrative resolution on ticket <strong>{selectedIssue?.id}</strong>. This concludes the grievance, closes the ticket, and archives the file.
                </p>

                {(() => {
                  const m = getAdminMeetingForIssue(selectedIssue);
                  if (!m) return null;
                  return (
                    <div style={{
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      marginBottom: '14px',
                      fontSize: '0.82rem',
                      color: '#93c5fd'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                        <Calendar size={14} /> Hearing Conducted / Scheduled:
                      </div>
                      <div style={{ marginTop: '2px' }}>
                        {m.date} at {m.time} ({m.mode || 'Offline'} - {m.location})
                      </div>
                      {m.notes && (
                        <div style={{ fontSize: '0.78rem', marginTop: '3px', fontStyle: 'italic', opacity: 0.9 }}>
                          Hearing Directives: "{m.notes}"
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="form-group">
                  <label className="form-label">Final Resolution & Closure Findings *</label>
                  <textarea
                    className="form-textarea"
                    required
                    rows={4}
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="e.g. Administrative hearing completed. Principal and HOD reviewed academic records and approved 10% attendance dispensation due to state sports tournament. Issue officially closed."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setShowResolveModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-success" style={{ fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={16} /> Confirm & Close the Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADMIN MEETING SETUP MODAL (STRICT 1-MEETING RULE) */}
      {showAdminMeetingModal && adminMeetingTargetIssue && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="modal-content" style={{ maxWidth: '580px', width: '100%', borderRadius: '16px', overflow: 'hidden' }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.05))', borderBottom: '1px solid var(--border-color)', padding: '16px 20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={20} color="#3b82f6" /> Setup Meeting with Student
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Formal Administrative Grievance Hearing (Ticket #{adminMeetingTargetIssue.id})
                </p>
              </div>
              <button onClick={() => setShowAdminMeetingModal(false)} className="btn-icon-only">✕</button>
            </div>

            <form onSubmit={handleAdminMeetingSubmit}>
              <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 1-Meeting Policy Notice */}
                <div style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'flex-start'
                }}>
                  <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '0.8rem', color: '#fbbf24', lineHeight: 1.4 }}>
                    <strong>Institutional 1-Meeting Rule:</strong> The Administration can schedule exactly <strong>one meeting</strong> with the student for this ticket. Once scheduled, the meeting button will disappear and transition to the <strong>"Close the Ticket"</strong> button.
                  </div>
                </div>

                {/* Student & Ticket Snapshot */}
                <div style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '12px 14px',
                  fontSize: '0.82rem',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px'
                }}>
                  <div><strong>Student:</strong> {adminMeetingTargetIssue.studentName} (<code>{adminMeetingTargetIssue.studentId}</code>)</div>
                  <div><strong>Category:</strong> {adminMeetingTargetIssue.category}</div>
                  <div><strong>Priority:</strong> <span style={{ color: '#f87171', fontWeight: 600 }}>{adminMeetingTargetIssue.priority}</span></div>
                  <div><strong>Assigned Officer:</strong> {db.users.ros.find(r => r.id === adminMeetingTargetIssue.roId)?.name || adminMeetingTargetIssue.roId}</div>
                </div>

                {/* Date & Time Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Hearing Date *</label>
                    <input
                      type="date"
                      className="form-input"
                      required
                      value={adminMeetingDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setAdminMeetingDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Hearing Time *</label>
                    <input
                      type="time"
                      className="form-input"
                      required
                      value={adminMeetingTime}
                      onChange={(e) => setAdminMeetingTime(e.target.value)}
                    />
                  </div>
                </div>

                {/* Meeting Mode (Mandatory Offline In-Person Hearing) */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Meeting Mode *</label>
                  <div style={{
                    padding: '10px 14px',
                    background: 'rgba(59, 130, 246, 0.12)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      🏢 In-Person / Offline Hearing
                    </span>
                    <span style={{ fontSize: '0.72rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                      Offline Only (Administrative Protocol)
                    </span>
                  </div>
                </div>

                {/* Location / Venue */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Venue / Location *</label>
                  <input
                    type="text"
                    className="form-input"
                    required
                    value={adminMeetingLocation}
                    onChange={(e) => setAdminMeetingLocation(e.target.value)}
                    placeholder="e.g. Principal / Senior Admin Chamber (Main Admin Block)"
                  />
                </div>

                {/* Hearing Agenda / Directives */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>Hearing Agenda & Directives for Mentee</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    value={adminMeetingNotes}
                    onChange={(e) => setAdminMeetingNotes(e.target.value)}
                    placeholder="Specify directives, documents required, and grievance points to review..."
                  />
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '14px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  disabled={isSubmittingAdminMeeting}
                  onClick={() => setShowAdminMeetingModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingAdminMeeting}
                  className="btn btn-primary"
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isSubmittingAdminMeeting ? 'Scheduling...' : 'Confirm & Schedule 1 Meeting'}
                </button>
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
              <h3 style={{ fontWeight: '700' }}>Administrative Ticket Inspection & Audit — {viewLogIssueId}</h3>
              <button onClick={() => setViewLogIssueId(null)} className="btn-icon-only">✕</button>
            </div>
            <div className="modal-body">
              {(() => {
                const targetIssue = db.issues.find(i => i.id === viewLogIssueId);
                if (!targetIssue) return <p>Issue not found.</p>;
                const feedbackData = targetIssue.feedback || (targetIssue.rating ? { rating: targetIssue.rating, comments: targetIssue.feedbackComments } : null);
                return (
                  <div>
                    <div style={{ marginBottom: '14px', fontSize: '0.85rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '6px' }}>
                      <p style={{ margin: 0 }}><strong>Category:</strong> {targetIssue.category}</p>
                      <p style={{ margin: 0 }}><strong>Student:</strong> {targetIssue.studentName} ({targetIssue.studentId})</p>
                      <p style={{ margin: 0 }}><strong>Assigned RO:</strong> {targetIssue.roId}</p>
                      <p style={{ margin: 0 }}><strong>Status:</strong> <span className={`badge badge-${targetIssue.status.toLowerCase().replace(' ', '-')}`}>{targetIssue.status}</span></p>
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                      <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Student Description:</h4>
                      <p style={{ margin: 0, fontSize: '0.85rem', background: 'rgba(0,0,0,0.2)', padding: '10px 12px', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
                        {targetIssue.description}
                      </p>
                    </div>

                    {targetIssue.resolutionNotes && (
                      <div style={{ marginBottom: '14px', borderLeft: '3px solid var(--accent-emerald)', background: 'rgba(16,185,129,0.06)', padding: '10px 12px', borderRadius: '4px', fontSize: '0.85rem' }}>
                        <strong style={{ color: '#10b981' }}>Resolution Action Taken:</strong>
                        <p style={{ margin: '4px 0 0 0' }}>{targetIssue.resolutionNotes}</p>
                      </div>
                    )}

                    {/* CONFIDENTIAL STUDENT FEEDBACK - ADMIN INSPECTION ONLY */}
                    {feedbackData && feedbackData.rating ? (
                      <div style={{ marginBottom: '14px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '12px 14px', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span style={{ fontWeight: 700, color: '#fbbf24', fontSize: '0.88rem' }}>
                            ⭐ Student Rating & Feedback (Administrative Audit)
                          </span>
                          <span style={{ fontWeight: 800, color: '#fbbf24', fontSize: '0.9rem' }}>
                            {'★'.repeat(feedbackData.rating)}{'☆'.repeat(5 - feedbackData.rating)} ({feedbackData.rating} / 5)
                          </span>
                        </div>
                        {feedbackData.comments ? (
                          <p style={{ margin: 0, fontStyle: 'italic', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                            "{feedbackData.comments}"
                          </p>
                        ) : (
                          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            (Student submitted rating without written comments)
                          </p>
                        )}
                        <p style={{ margin: '6px 0 0 0', fontSize: '0.72rem', color: '#94a3b8' }}>
                          Archived in Local Storage • Submitted by {targetIssue.studentName}
                        </p>
                      </div>
                    ) : (targetIssue.status === 'Resolved' && (
                      <div style={{ marginBottom: '14px', fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        ⏳ Student has not submitted rating or feedback yet.
                      </div>
                    ))}

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
                      <div><strong>Escalation Status:</strong> <span className="badge badge-escalated" style={{
                        background: (modalIssue.isReEscalated || modalIssue.status === 'Re-escalated' || (modalIssue.reEscalatedCount && modalIssue.reEscalatedCount > 0)) ? 'rgba(239, 68, 68, 0.25)' : undefined,
                        color: (modalIssue.isReEscalated || modalIssue.status === 'Re-escalated' || (modalIssue.reEscalatedCount && modalIssue.reEscalatedCount > 0)) ? '#f87171' : undefined,
                        border: (modalIssue.isReEscalated || modalIssue.status === 'Re-escalated' || (modalIssue.reEscalatedCount && modalIssue.reEscalatedCount > 0)) ? '1px solid #ef4444' : undefined,
                        fontWeight: '700'
                      }}>{Boolean(modalIssue.isReEscalated || modalIssue.status === 'Re-escalated' || (modalIssue.reEscalatedCount && modalIssue.reEscalatedCount > 0)) ? '⚡ Re-escalated' : modalIssue.status}</span></div>
                      <div><strong>Category:</strong> {modalIssue.category}</div>
                      <div><strong>Priority Level:</strong> <span className={`badge badge-${modalIssue.priority.toLowerCase()}`}>{modalIssue.priority}</span></div>
                      <div><strong>Student Name:</strong> <strong>{modalIssue.studentName}</strong></div>
                      <div><strong>Student USN / ID:</strong> <code>{modalIssue.studentId}</code></div>
                      <div><strong>Assigned Relationship Officer:</strong> <strong>{roName}</strong> (<code>{modalIssue.roId}</code>)</div>
                      <div><strong>Submission Date:</strong> {new Date(modalIssue.createdAt).toLocaleString()}</div>
                    </div>

                    {/* Latest RO Escalation Directive / Urgency Remarks */}
                    {modalIssue.escalationReason && (
                      <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', borderLeft: '5px solid #ef4444', padding: '12px 16px', borderRadius: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fca5a5' }}>
                            ⚡ Active RO Escalation Directive / Urgency Remarks:
                          </span>
                          {Boolean(modalIssue.isReEscalated || (modalIssue.reEscalatedCount && modalIssue.reEscalatedCount > 0)) && (
                            <span style={{ fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '2px 8px', borderRadius: '10px', fontWeight: '700', border: '1px solid rgba(239,68,68,0.5)' }}>
                              ⚡ Re-escalated {modalIssue.reEscalatedCount ? `(${modalIssue.reEscalatedCount}x)` : ''}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.88rem', color: '#fff', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                          "{modalIssue.escalationReason}"
                        </div>
                        {modalIssue.escalatedAt && (
                          <div style={{ fontSize: '0.75rem', color: '#fca5a5', marginTop: '6px', opacity: 0.85 }}>
                            Dispatched: {new Date(modalIssue.escalatedAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    )}

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
                      {modalIssue.status === 'Resolved' ? (
                        <div style={{
                          background: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          borderRadius: '8px',
                          padding: '14px 18px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px'
                        }}>
                          <CheckCircle2 size={24} style={{ color: '#10b981', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: '800', color: '#10b981', fontSize: '0.92rem' }}>
                              Ticket Officially Resolved & Closed by Senior Administration
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
                              <strong>Resolution Findings:</strong> {modalIssue.resolutionNotes || 'Administrative resolution completed.'}
                            </div>
                            {modalIssue.resolvedAt && (
                              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                Resolved At: {new Date(modalIssue.resolvedAt).toLocaleString()}
                              </div>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {!hasAdminMeetingForIssue(modalIssue) ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <button
                                  onClick={() => handleOpenAdminScheduleModal(modalIssue)}
                                  className="btn btn-primary"
                                  style={{
                                    width: '100%',
                                    padding: '12px 18px',
                                    fontSize: '0.9rem',
                                    fontWeight: '700',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <Calendar size={18} /> Setup Meeting with Student (1 Meeting Allowed)
                                </button>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                  ⚠️ 1-Meeting Policy: Admin may schedule exactly 1 formal hearing with the mentee. After setting the meeting, this button disappears and unlocks "Close the Ticket".
                                </span>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {/* Scheduled Admin Hearing Summary Card */}
                                {(() => {
                                  const m = getAdminMeetingForIssue(modalIssue);
                                  return (
                                    <div style={{
                                      background: 'rgba(59, 130, 246, 0.1)',
                                      border: '1px solid rgba(59, 130, 246, 0.35)',
                                      borderRadius: '8px',
                                      padding: '12px 16px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '6px'
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ color: '#60a5fa', fontWeight: '700', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <Calendar size={15} /> Administrative Hearing Scheduled (1/1 Meeting Used)
                                        </span>
                                        <span style={{ fontSize: '0.7rem', background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '10px', fontWeight: 'bold' }}>
                                          Meeting Scheduled
                                        </span>
                                      </div>
                                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                        <strong>Date & Time:</strong> {m?.date || 'Scheduled'} at {m?.time || '11:00 AM'} &nbsp;|&nbsp;
                                        <strong>Mode:</strong> {m?.mode || 'Offline'} &nbsp;|&nbsp;
                                        <strong>Venue:</strong> {m?.location || 'Principal Chamber'}
                                      </div>
                                      {m?.notes && (
                                        <div style={{ fontSize: '0.78rem', color: '#93c5fd', fontStyle: 'italic', background: 'rgba(0,0,0,0.2)', padding: '6px 10px', borderRadius: '4px' }}>
                                          Directives / Agenda: "{m.notes}"
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}

                                {/* Close the Ticket Button */}
                                <button
                                  onClick={() => {
                                    setSelectedIssueId(modalIssue.id);
                                    setShowResolveModal(true);
                                    setEscalationModalIssueId(null);
                                  }}
                                  className="btn btn-success"
                                  style={{
                                    width: '100%',
                                    padding: '12px 18px',
                                    fontSize: '0.9rem',
                                    fontWeight: '700',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '8px',
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    border: 'none',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <CheckCircle2 size={18} /> Close the Ticket
                                </button>
                              </div>
                            )}
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
                        </>
                      )}
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

      {/* ========================================================= */}
      {/* STUDENT REMOVAL SECURITY CONFIRMATION MODAL */}
      {/* ========================================================= */}
      {studentPendingDelete && (() => {
        const currentMentor = (db.users?.mentors || []).find(m => isMatchingMentorId(m.id, studentPendingDelete.mentorId));
        const activeTickets = db.issues.filter(i => i.studentId === studentPendingDelete.id && i.status !== 'Resolved').length;

        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}>
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              overflow: 'hidden',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              {/* Modal Header */}
              <div style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(239, 68, 68, 0.08)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f87171'
                  }}>
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                      Remove Student Record
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Administrative account de-provisioning
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setStudentPendingDelete(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '22px 24px' }}>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Are you sure you want to remove this student from the institutional directory?
                </p>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{studentPendingDelete.name}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{studentPendingDelete.email}</div>
                    </div>
                    <code style={{ fontSize: '0.82rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', fontWeight: 'bold' }}>
                      {studentPendingDelete.id}
                    </code>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px', fontSize: '0.78rem', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Branch: <strong style={{ color: 'var(--text-primary)' }}>{studentPendingDelete.branch || 'CSE'}</strong>
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>•</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Semester: <strong style={{ color: 'var(--text-primary)' }}>{studentPendingDelete.sem || 5}</strong>
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>•</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Mentor: <strong style={{ color: currentMentor ? '#c4b5fd' : 'var(--text-muted)' }}>{currentMentor ? currentMentor.name : 'Unassigned'}</strong>
                    </span>
                  </div>
                </div>

                <div style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#fbbf24',
                  fontSize: '0.8rem',
                  lineHeight: 1.4
                }}>
                  ⚠️ <strong>Notice:</strong> This action will permanently remove the student's access credentials and unassign them from their faculty mentor.
                  {activeTickets > 0 && <span> Note that this student currently has <strong>{activeTickets} active tickets</strong>.</span>}
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                background: 'rgba(0, 0, 0, 0.2)'
              }}>
                <button
                  type="button"
                  onClick={() => setStudentPendingDelete(null)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 18px', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRemoveStudent}
                  style={{
                    padding: '8px 20px',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    background: '#dc2626',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Trash2 size={15} />
                  Confirm Remove Student
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================= */}
      {/* FACULTY MENTOR REMOVAL SECURITY CONFIRMATION MODAL */}
      {/* ========================================================= */}
      {mentorPendingDelete && (() => {
        const assignedMentees = (db.users?.students || []).filter(s => isMatchingMentorId(s.mentorId, mentorPendingDelete.id));
        const activeMentorIssues = (db.issues || []).filter(i => isMatchingMentorId(i.mentorId, mentorPendingDelete.id) && i.status !== 'Resolved').length;

        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px'
          }}>
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              overflow: 'hidden',
              animation: 'fadeIn 0.2s ease-out'
            }}>
              {/* Modal Header */}
              <div style={{
                padding: '18px 24px',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(239, 68, 68, 0.08)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '50%',
                    background: 'rgba(239, 68, 68, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f87171'
                  }}>
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                      Remove Faculty Mentor
                    </h3>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Administrative account de-provisioning
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setMentorPendingDelete(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: '22px 24px' }}>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Are you sure you want to remove this faculty mentor from the mentorship portal?
                </p>

                <div style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginBottom: '16px'
                }}>
                  <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>{mentorPendingDelete.name}</strong>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>{mentorPendingDelete.email}</div>
                    </div>
                    <code style={{ fontSize: '0.82rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(139, 92, 246, 0.15)', color: '#c4b5fd', fontWeight: 'bold' }}>
                      {mentorPendingDelete.id}
                    </code>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Department: <strong style={{ color: 'var(--text-primary)' }}>{mentorPendingDelete.dept || 'CSE'}</strong>
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>•</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Assigned Mentees: <strong style={{ color: assignedMentees.length > 0 ? '#fbbf24' : 'var(--text-primary)' }}>{assignedMentees.length} Students</strong>
                    </span>
                    {mentorPendingDelete.class && (
                      <>
                        <span style={{ color: 'var(--text-muted)' }}>•</span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          Batch/Class: <strong style={{ color: 'var(--text-primary)' }}>{mentorPendingDelete.class}</strong>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#fbbf24',
                  fontSize: '0.8rem',
                  lineHeight: 1.4
                }}>
                  ⚠️ <strong>Notice:</strong> This action will permanently remove this mentor's portal access.
                  {assignedMentees.length > 0 ? (
                    <span> <strong>{assignedMentees.length} assigned student(s)</strong> will be safely moved back to the unassigned student pool so you can reassign them to another mentor.</span>
                  ) : (
                    <span> No students are currently assigned to this mentor.</span>
                  )}
                  {activeMentorIssues > 0 && <span> There are currently <strong>{activeMentorIssues} open mentorship tickets</strong> associated with this faculty.</span>}
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
                background: 'rgba(0, 0, 0, 0.2)'
              }}>
                <button
                  type="button"
                  onClick={() => setMentorPendingDelete(null)}
                  className="btn btn-secondary"
                  style={{ padding: '8px 18px', fontSize: '0.85rem' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRemoveMentor}
                  style={{
                    padding: '8px 20px',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    background: '#dc2626',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Trash2 size={15} />
                  Confirm Remove Mentor
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
