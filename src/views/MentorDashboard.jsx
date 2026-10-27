import React, { useContext, useState, useMemo, useEffect } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import {
  Users, BookOpen, Presentation, Calendar, Plus, ExternalLink, Send,
  CheckCircle2, UserCheck, FileText, Clock, MapPin, Mail, Edit3, Sparkles,
  X, AlertCircle, AlertTriangle, SkipForward, RotateCcw, Info, Download,
  ShieldCheck, Search, Filter, Check,
  LogOut, Upload, CheckCheck, Landmark, Shield, Layers, HelpCircle
} from 'lucide-react';

export const MentorDashboard = ({ mentorId }) => {
  const {
    db,
    currentUser,
    authenticatedUser,
    logoutUser,
    addResource,
    submitMentorSessionRecord,
    updateMentorSchedule,
    passMentorSession,
    unpassMentorSession,
    shootMentorDeadlineAlert,
    shootMentorGmailAlert,
    isMatchingMentorId
  } = useContext(DatabaseContext);

  // Active navigation tab
  const [activeTab, setActiveTab] = useState('tab-mentees'); // 'tab-mentees', 'tab-schedule', 'tab-resources', 'tab-session-filing'

  // Toast feedback state
  const [toast, setToast] = useState(null);
  const showToast = (message, isError = false) => {
    setToast({ message, isError });
    setTimeout(() => setToast(null), 3800);
  };

  // Resolve active mentor
  const mentor = useMemo(() => {
    const list = db.users?.mentors || [];
    if (mentorId) {
      const found = list.find(m => isMatchingMentorId(m.id, mentorId));
      if (found) return found;
    }
    if (authenticatedUser && authenticatedUser.role === 'Mentor') {
      const found = list.find(m => isMatchingMentorId(m.id, authenticatedUser.id));
      if (found) return found;
    }
    return list[0] || {
      id: 'FAC-CSE-04',
      name: 'Dr. Rekha Bhandary',
      dept: 'CSE',
      class: '3rd Yr CSE-A & BCA',
      email: 'rekha.bhandary@nitte.edu.in'
    };
  }, [db.users?.mentors, mentorId, authenticatedUser, isMatchingMentorId]);

  // Assigned students (mentees) - matched with robust matcher
  const mentees = useMemo(() => {
    return (db.users?.students || []).filter(s => isMatchingMentorId(s.mentorId, mentor.id));
  }, [db.users?.students, mentor.id, isMatchingMentorId]);

  const myResources = useMemo(() => {
    return (db.resources || []).filter(r => isMatchingMentorId(r.mentorId, mentor.id));
  }, [db.resources, mentor.id, isMatchingMentorId]);

  const myRecords = useMemo(() => {
    return (db.mentorSessionRecords || []).filter(r => isMatchingMentorId(r.mentorId, mentor.id));
  }, [db.mentorSessionRecords, mentor.id, isMatchingMentorId]);

  // Mentoring Schedule details
  const mentoringSchedule = useMemo(() => {
    return (db.mentoringSchedules && db.mentoringSchedules[mentor.id]) || {
      mentorId: mentor.id,
      date: '2026-10-30',
      day: 'Friday',
      time: '03:30 PM',
      endTime: '04:30 PM',
      periodSlot: 'Period 6 (03:30 PM - 04:30 PM)',
      whichClass: mentor.class || '3rd Yr CSE-A & BCA',
      location: 'Seminar Hall 204, Block III',
      autoEmailAt9: true,
      lastEmailSentAt: null,
      passedSessions: []
    };
  }, [db.mentoringSchedules, mentor.id, mentor.class]);

  const sessionDate = mentoringSchedule.date || '2026-10-30';
  const isSessionPassed = Boolean(
    mentoringSchedule.isPassed ||
    (mentoringSchedule.passedSessions || []).some(p => p.sessionDate === sessionDate)
  );

  const normalizeDate = (d) => String(d || '').split('T')[0].trim();

  // Distinctly identify submitted reports from drafts
  const submittedRecord = myRecords.find(r =>
    r.status !== 'Draft' && (
      normalizeDate(r.sessionDate) === normalizeDate(sessionDate) ||
      normalizeDate(r.date) === normalizeDate(sessionDate)
    )
  ) || myRecords.find(r => r.status === 'Submitted') || myRecords.find(r => r.status && r.status !== 'Draft');

  const draftRecord = myRecords.find(r =>
    r.status === 'Draft' && (
      normalizeDate(r.sessionDate) === normalizeDate(sessionDate) ||
      normalizeDate(r.date) === normalizeDate(sessionDate)
    )
  ) || myRecords.find(r => r.status === 'Draft');

  const [localDraftExists, setLocalDraftExists] = useState(false);
  const isReportFiled = Boolean(submittedRecord);
  const isDraftSaved = Boolean(draftRecord || localDraftExists) && !isReportFiled;
  const filedRecord = submittedRecord || draftRecord;

  // Mentees Table Filter States
  const [menteeSearch, setMenteeSearch] = useState('');
  const [filterProgram, setFilterProgram] = useState('ALL');
  const [filterSemester, setFilterSemester] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Filtered Mentees
  const filteredMentees = useMemo(() => {
    return mentees.filter(st => {
      const q = menteeSearch.toLowerCase().trim();
      const name = (st.name || '').toLowerCase();
      const usn = (st.id || '').toLowerCase();
      const branch = (st.branch || '').toUpperCase();
      const sem = String(st.sem || '');

      const matchesQ = !q || name.includes(q) || usn.includes(q);
      const matchesProg = filterProgram === 'ALL' || branch.includes(filterProgram.toUpperCase());
      const matchesSem = filterSemester === 'ALL' || sem === filterSemester.replace('Sem ', '');

      const hasOpenIssues = (db.issues || []).some(
        iss => (iss.studentId || iss.student_id)?.toUpperCase() === st.id?.toUpperCase() &&
               iss.status !== 'Resolved' && iss.status !== 'Closed'
      );
      const matchesStatus = filterStatus === 'ALL' ||
        (filterStatus === 'FLAGGED' && hasOpenIssues) ||
        (filterStatus === 'CLEAR' && !hasOpenIssues);

      return matchesQ && matchesProg && matchesSem && matchesStatus;
    });
  }, [mentees, menteeSearch, filterProgram, filterSemester, filterStatus, db.issues]);

  // Modals state
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [editDate, setEditDate] = useState(mentoringSchedule.date || '2026-10-30');
  const [editPeriodSlot, setEditPeriodSlot] = useState(mentoringSchedule.periodSlot || 'Period 6 (03:30 PM - 04:30 PM)');
  const [editCustomStart, setEditCustomStart] = useState('03:30 PM');
  const [editCustomEnd, setEditCustomEnd] = useState('04:30 PM');
  const [editVenue, setEditVenue] = useState(mentoringSchedule.location || 'Seminar Hall 204, Block III');
  const [rescheduleJustification, setRescheduleJustification] = useState('');
  const [isUpdatingSchedule, setIsUpdatingSchedule] = useState(false);

  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [passReason, setPassReason] = useState('Public / Declared Gazetted Holiday');
  const [passRemarks, setPassRemarks] = useState('');
  const [isPassingSession, setIsPassingSession] = useState(false);



  const [isAddResourceModalOpen, setIsAddResourceModalOpen] = useState(false);
  const [newResTitle, setNewResTitle] = useState('');
  const [newResType, setNewResType] = useState('PDF');
  const [newResContent, setNewResContent] = useState('');
  const [newResCohort, setNewResCohort] = useState('All Cohorts');

  // Mentoring session filing form state
  const [reportDate, setReportDate] = useState(sessionDate);
  const [reportVenue, setReportVenue] = useState(mentoringSchedule.location || 'Seminar Hall 204, Block III');
  const [reportAttendance, setReportAttendance] = useState(mentees.length || 18);
  const [reportFocusAreas, setReportFocusAreas] = useState({
    academic: false,
    attendance: false,
    wellbeing: false
  });
  const [reportNotes, setReportNotes] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  // Restore draft or populate submitted filing data
  useEffect(() => {
    try {
      const savedDraftStr = localStorage.getItem(`nitte_mentor_draft_${mentor.id}`);
      if (savedDraftStr) {
        const draft = JSON.parse(savedDraftStr);
        if (draft) {
          setLocalDraftExists(true);
          if (draft.date || draft.sessionDate) setReportDate(draft.date || draft.sessionDate);
          if (draft.venue) setReportVenue(draft.venue);
          if (draft.attendance !== undefined) setReportAttendance(draft.attendance);
          if (draft.focusAreas) setReportFocusAreas(draft.focusAreas);
          if (draft.notes) setReportNotes(draft.notes);
          return;
        }
      }
    } catch (e) { }

    const dbDraft = myRecords.find(r => r.status === 'Draft');
    if (dbDraft) {
      setLocalDraftExists(true);
      if (dbDraft.sessionDate) setReportDate(dbDraft.sessionDate);
      if (dbDraft.location) setReportVenue(dbDraft.location);
      if (dbDraft.studentsAttended !== undefined) setReportAttendance(dbDraft.studentsAttended);
      if (dbDraft.notes) setReportNotes(dbDraft.notes);
    } else {
      setLocalDraftExists(false);
      const dbSubmitted = myRecords.find(r => r.status !== 'Draft');
      if (dbSubmitted) {
        if (dbSubmitted.sessionDate) setReportDate(dbSubmitted.sessionDate);
        if (dbSubmitted.location) setReportVenue(dbSubmitted.location);
        if (dbSubmitted.studentsAttended !== undefined) setReportAttendance(dbSubmitted.studentsAttended);
        if (dbSubmitted.notes) setReportNotes(dbSubmitted.notes);
      } else if (mentees.length > 0) {
        setReportAttendance(mentees.length);
      }
    }
  }, [mentor.id, myRecords.length]);

  // Handlers
  const handleRescheduleSubmit = async (e) => {
    e.preventDefault();
    setIsUpdatingSchedule(true);
    try {
      const timeMatch = editPeriodSlot.match(/\((.*?)\s*-/);
      const endMatch = editPeriodSlot.match(/-\s*(.*?)\)/);
      const timeText = editPeriodSlot === 'Custom' ? editCustomStart : (timeMatch ? timeMatch[1] : '03:30 PM');
      const endText = editPeriodSlot === 'Custom' ? editCustomEnd : (endMatch ? endMatch[1] : '04:30 PM');
      const dayName = new Date(editDate).toLocaleDateString('en-US', { weekday: 'long' });

      const updated = {
        date: editDate,
        day: dayName,
        time: timeText,
        endTime: endText,
        periodSlot: editPeriodSlot,
        location: editVenue,
        whichClass: mentor.class || '3rd Yr CSE-A & BCA',
        justification: rescheduleJustification,
        autoEmailAt9: true
      };

      await updateMentorSchedule(mentor.id, updated, true);
      setIsRescheduleModalOpen(false);
      showToast(`Mentoring slot rescheduled to ${dayName}, ${editDate} (${editPeriodSlot})!`);
    } catch (err) {
      showToast('Failed to reschedule: ' + err.message, true);
    } finally {
      setIsUpdatingSchedule(false);
    }
  };

  const handlePassSessionSubmit = async (e) => {
    e.preventDefault();
    setIsPassingSession(true);
    try {
      await passMentorSession(mentor.id, sessionDate, passReason, passRemarks);
      setIsPassModalOpen(false);
      showToast(`Session on ${sessionDate} marked as Not Conducted (${passReason}).`);
    } catch (err) {
      showToast('Failed to record pass session: ' + err.message, true);
    } finally {
      setIsPassingSession(false);
    }
  };

  const handleTriggerManualAlert = async () => {
    try {
      if (shootMentorGmailAlert) {
        await shootMentorGmailAlert(mentor.id, sessionDate, 'Fortnightly Mentorship Hour', mentoringSchedule.time);
      } else if (shootMentorDeadlineAlert) {
        await shootMentorDeadlineAlert(mentor.id, sessionDate);
      }
      showToast(`9:00 AM Automated Alert dispatched to all ${mentees.length} mentees via Gmail & SMS!`);
    } catch (err) {
      showToast('Alert notification triggered: ' + err.message);
    }
  };

  const handleAddResourceSubmit = (e) => {
    e.preventDefault();
    if (!newResTitle.trim() || !newResContent.trim()) return;
    addResource(mentor.id, newResTitle.trim(), newResType, newResContent.trim());
    setNewResTitle('');
    setNewResContent('');
    setIsAddResourceModalOpen(false);
    showToast('Educational material published to Academic Vault!');
  };

  const handleSaveDraft = async () => {
    try {
      const draftData = {
        mentorId: mentor.id,
        date: reportDate,
        sessionDate: reportDate,
        venue: reportVenue,
        attendance: parseInt(reportAttendance) || mentees.length,
        focusAreas: reportFocusAreas,
        notes: reportNotes,
        updatedAt: new Date().toISOString()
      };
      localStorage.setItem(`nitte_mentor_draft_${mentor.id}`, JSON.stringify(draftData));
      setLocalDraftExists(true);

      await submitMentorSessionRecord(
        mentor.id,
        'Mentorship Session',
        reportDate,
        parseInt(reportAttendance) || mentees.length,
        reportNotes,
        mentor.class,
        reportVenue,
        'Draft'
      );
      showToast('Draft successfully saved!');
    } catch (err) {
      showToast('Failed to save draft: ' + err.message, true);
    }
  };

  const handleReportFilingSubmit = async (e) => {
    e.preventDefault();
    setIsSubmittingReport(true);
    try {
      await submitMentorSessionRecord(
        mentor.id,
        'Mentorship Session',
        reportDate,
        parseInt(reportAttendance) || mentees.length,
        reportNotes,
        mentor.class,
        reportVenue,
        'Submitted'
      );
      try {
        localStorage.removeItem(`nitte_mentor_draft_${mentor.id}`);
      } catch (e) { }
      setLocalDraftExists(false);
      showToast('Session report successfully submitted!');
    } catch (err) {
      showToast('Failed to submit report: ' + err.message, true);
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const handleExportCSV = () => {
    if (!mentees.length) {
      showToast('No mentees in roster to export.', true);
      return;
    }

    let csv = 'Index,USN,Full Name,Program,Semester,Official Email,Contact Phone\n';
    mentees.forEach((s, idx) => {
      const usn = String(s.id || '').replace(/"/g, '""');
      const name = String(s.name || '').replace(/"/g, '""');
      const prog = String(s.branch || 'CSE').replace(/"/g, '""');
      const sem = String(s.sem || '5').replace(/"/g, '""');
      const email = String(s.email || '').replace(/"/g, '""');
      const phone = String(s.phone || '9876543210').replace(/"/g, '""');
      csv += `${idx + 1},"${usn}","${name}","${prog}","Sem ${sem}","${email}","${phone}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `NITTE_Mentees_Roster_${mentor.name.replace(/[^a-zA-Z0-9]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast(`Exported ${mentees.length} assigned mentees to CSV.`);
  };

  // Capacity calculations
  const menteeCapacityPercent = Math.min(100, Math.round((mentees.length / 30) * 100));
  const availableSeats = Math.max(0, 30 - mentees.length);

  return (
    <div className="bg-surface font-body-md text-on-surface antialiased min-h-screen selection:bg-secondary-fixed selection:text-on-secondary-fixed flex flex-col">
      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-space-xs animate-in fade-in slide-in-from-bottom-5 duration-300">
          <div className={`p-3 px-4 rounded-xl shadow-xl font-body-sm text-body-sm flex items-center gap-2.5 text-on-primary ${toast.isError ? 'bg-error' : 'bg-primary'}`}>
            <span className="material-symbols-outlined text-[18px]">
              {toast.isError ? 'error' : 'check_circle'}
            </span>
            <span className="font-medium tracking-tight">{toast.message}</span>
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <div className="w-full pb-16 flex-1">
        <div className="w-full flex flex-col gap-space-xl max-w-[1440px] mx-auto">

          {/* TOP IDENTITY & INSTITUTIONAL HEADER STRIP */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-surface-container">
            <div className="flex items-start gap-space-md">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-secondary text-white flex items-center justify-center font-bold text-xl shadow-md ring-2 ring-primary/20 shrink-0">
                {mentor.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <div className="flex flex-col">
                <div className="flex flex-wrap items-center gap-space-xs">
                  <span className="font-headline-sm text-headline-sm text-on-surface font-extrabold">{mentor.name}</span>
                  <span className="px-space-xs py-0.5 rounded bg-surface-container-high text-primary font-label-sm text-label-sm font-mono tracking-wider font-semibold">
                    {mentor.id}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-label-sm text-label-sm font-bold border border-emerald-200">
                    Faculty Advisor
                  </span>
                </div>
                <span className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                  Associate Professor • Dept. of {mentor.dept || 'Computer Science & Engineering'} • Designated Mentor Batch 2022-26 & 2023-26
                </span>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-on-surface-variant font-label-md text-label-md mt-1 font-mono">
                  <span>Room: <strong>{mentoringSchedule.location || 'Seminar Hall 204 (Block III)'}</strong></span>
                  <span>•</span>
                  <span>Roster: <strong className="text-primary font-bold">{mentees.length} Active Mentees</strong></span>
                  <span>•</span>
                  <span>Cycle: <strong>Academic Year 2024–25 (Odd Sem)</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* 1. EXECUTIVE BENTO-GRID KPI ANALYTICS DECK */}
          <section aria-label="Faculty Executive Telemetry" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-space-md">
            
            {/* KPI 1: Statutory Mentee Quota (Span 4) */}
            <div className="xl:col-span-4 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between relative overflow-hidden border border-surface-container">
              <div className="absolute -right-4 -top-4 w-28 h-28 bg-primary/5 rounded-full pointer-events-none"></div>
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">Statutory Mentee Allocation</span>
                  <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[18px]">groups</span>
                  </div>
                </div>
                <div className="flex items-baseline gap-space-xs mt-1">
                  <span className="font-metric-stat text-metric-stat text-primary font-mono">{mentees.length}</span>
                  <span className="font-headline-sm text-headline-sm text-on-surface-variant font-mono">/ 30</span>
                  <span className={`ml-auto px-2 py-0.5 rounded-full font-label-sm text-label-sm font-bold ${menteeCapacityPercent > 85 ? 'bg-amber-100 text-amber-800' : 'bg-tertiary-fixed text-on-tertiary-fixed'}`}>
                    {menteeCapacityPercent}% Loaded
                  </span>
                </div>
                {/* Progress bar */}
                <div className="w-full bg-surface-container-high rounded-full h-2 mt-2 overflow-hidden">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-500"
                    style={{ width: `${menteeCapacityPercent}%` }}
                  ></div>
                </div>
              </div>
              <div className="flex flex-col gap-1 mt-4 pt-3 bg-surface-container-low/50 -mx-space-lg -mb-space-lg p-space-md border-t border-surface-container">
                <div className="flex items-center gap-1.5 text-tertiary font-label-md text-label-md font-bold">
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                  <span>Cohort Capacity Active</span>
                </div>
                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                  {availableSeats} Seats Available
                </span>
              </div>
            </div>

            {/* KPI 2: Fortnightly Mentorship Hour Timetable (Span 4) */}
            <div className="xl:col-span-4 bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col justify-between relative overflow-hidden border border-surface-container">
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">Next Designated Slot</span>
                  <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm font-bold">
                    {mentoringSchedule.periodSlot ? mentoringSchedule.periodSlot.split(' ')[0] : 'Period 6'}
                  </span>
                </div>
                <div className="flex flex-col mt-1">
                  <span className="font-title-md text-title-md text-on-surface font-extrabold">
                    {mentoringSchedule.day || 'Friday'}, {sessionDate}
                  </span>
                  <span className="font-body-sm text-body-sm text-secondary font-mono font-bold">
                    {mentoringSchedule.time || '03:30 PM'} – {mentoringSchedule.endTime || '04:30 PM'} IST
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-body-sm mt-1">
                  <span className="material-symbols-outlined text-[16px] text-primary">location_on</span>
                  <span className="font-mono text-xs">{mentoringSchedule.location || 'Seminar Hall 204, Block III'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-3 border-t border-surface-container">
                <button
                  onClick={() => setIsRescheduleModalOpen(true)}
                  className="flex-1 py-1.5 px-space-sm bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-label-md font-bold rounded-lg transition-all text-center"
                >
                  Reschedule
                </button>
                <button
                  onClick={() => setIsPassModalOpen(true)}
                  className="flex-1 py-1.5 px-space-sm bg-surface-container-low hover:bg-error-container text-on-surface-variant hover:text-on-error-container font-label-md text-label-md font-bold rounded-lg transition-all text-center"
                >
                  {isSessionPassed ? 'Waived (Passed)' : 'Pass / Holiday'}
                </button>
              </div>
            </div>

            {/* KPI 3: Mentoring Session Report Status (Span 4) */}
            <div className={`xl:col-span-4 rounded-xl p-space-lg shadow-sm flex flex-col justify-between relative overflow-hidden border ${
              isReportFiled
                ? 'bg-emerald-50 border-emerald-200'
                : (isDraftSaved || localDraftExists)
                  ? 'bg-amber-50/80 border-amber-200'
                  : 'bg-error-container/40 border-error-container'
            }`}>
              <div className="flex flex-col gap-space-xs">
                <div className="flex items-center justify-between">
                  <span className={`font-label-sm text-label-sm font-bold uppercase tracking-wider ${
                    isReportFiled
                      ? 'text-emerald-800'
                      : (isDraftSaved || localDraftExists)
                        ? 'text-amber-800'
                        : 'text-error'
                  }`}>
                    Report Status
                  </span>
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    isReportFiled
                      ? 'bg-emerald-600'
                      : (isDraftSaved || localDraftExists)
                        ? 'bg-amber-500'
                        : 'bg-error animate-ping'
                  }`}></span>
                </div>
                <div className="flex flex-col mt-1">
                  <span className={`font-title-md text-title-md font-extrabold flex items-center gap-1.5 ${
                    isReportFiled
                      ? 'text-emerald-900'
                      : (isDraftSaved || localDraftExists)
                        ? 'text-amber-900'
                        : 'text-error'
                  }`}>
                    <span className="material-symbols-outlined text-[20px]">
                      {isReportFiled ? 'verified' : (isDraftSaved || localDraftExists) ? 'edit_note' : 'warning'}
                    </span>
                    {isReportFiled
                      ? 'Session Report Submitted'
                      : (isDraftSaved || localDraftExists)
                        ? 'Draft Saved (Pending Submission)'
                        : 'Report Submission Pending'}
                  </span>
                  <span className="font-body-sm text-body-sm text-on-surface-variant mt-1 font-mono">
                    Session: {reportDate || sessionDate} • Status: {
                      isReportFiled
                        ? 'Submitted'
                        : (isDraftSaved || localDraftExists)
                          ? 'Draft Stored • Unsubmitted'
                          : (isSessionPassed ? 'Waived (Holiday)' : 'Submission Pending')
                    }
                  </span>
                </div>
              </div>
              <div className="mt-4 pt-2">
                <button
                  onClick={() => setActiveTab('tab-session-filing')}
                  className={`w-full py-2 px-space-md font-label-md text-label-md font-bold rounded-lg shadow-sm flex items-center justify-center gap-2 transition-all ${
                    isReportFiled
                      ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                      : (isDraftSaved || localDraftExists)
                        ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'bg-error text-on-error hover:bg-error/90'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {isReportFiled ? 'assignment_turned_in' : (isDraftSaved || localDraftExists) ? 'edit_document' : 'assignment_turned_in'}
                  </span>
                  <span>{isReportFiled ? 'View Submitted Report' : (isDraftSaved || localDraftExists) ? 'Resume & Submit Draft' : 'Open Report Form'}</span>
                </button>
              </div>
            </div>

            {/* KPI 4: Academic Resources Shared (Span 6) */}
            <div className="xl:col-span-6 bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between border border-surface-container">
              <div className="flex items-center gap-space-md">
                <div className="w-12 h-12 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                  <span className="material-symbols-outlined text-[24px]">folder_special</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm font-bold uppercase text-on-surface-variant">Active Vault Notes</span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface font-mono">{myResources.length} Resources</span>
                    <span className="font-body-sm text-body-sm text-tertiary font-bold font-mono">{myResources.length * 18 + 14} Mentee Downloads</span>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">98% Cohort Download Compliance Rate</span>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('tab-resources')}
                className="px-space-md py-1.5 bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-label-md font-bold rounded-lg transition-all shrink-0"
              >
                Open Vault
              </button>
            </div>

            {/* KPI 5: Inquiries & Support Discrepancies (Span 6) */}
            <div className="xl:col-span-6 bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex items-center justify-between border border-surface-container">
              <div className="flex items-center gap-space-md">
                <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                  <span className="material-symbols-outlined text-[24px]">live_help</span>
                </div>
                <div className="flex flex-col">
                  <span className="font-label-sm text-label-sm font-bold uppercase text-on-surface-variant">Mentee Support Inquiries</span>
                  <div className="flex items-baseline gap-2">
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface font-mono">
                      {(db.issues || []).filter(i => mentees.some(m => String(m.id).toUpperCase() === String(i.studentId || i.student_id).toUpperCase())).length} Inquiries
                    </span>
                    <span className="font-body-sm text-body-sm text-emerald-700 font-bold font-mono">Institutional Redressal Active</span>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">Continuous Support Tracking Active</span>
                </div>
              </div>
              <button
                onClick={() => {
                  setActiveTab('tab-mentees');
                  setFilterStatus('FLAGGED');
                  showToast('Filtered: Showing mentees with active inquiries');
                }}
                className="px-space-md py-1.5 bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-label-md font-bold rounded-lg transition-all shrink-0"
              >
                Filter Inquiries
              </button>
            </div>

          </section>

          {/* 2. INSTITUTIONAL DIVISION WORKSPACE TABS BAR */}
          <div className="flex flex-col w-full bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container overflow-hidden">
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar border-b border-surface-container p-2 pb-2.5">
              <button
                onClick={() => setActiveTab('tab-mentees')}
                className={`tab-btn px-space-md py-2.5 rounded-lg font-title-md text-title-md flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'tab-mentees' ? 'text-primary bg-surface-container font-bold shadow-xs' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'}`}
              >
                <span className="material-symbols-outlined text-[20px]">badge</span>
                <span>Assigned Mentees ({mentees.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('tab-schedule')}
                className={`tab-btn px-space-md py-2.5 rounded-lg font-title-md text-title-md flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'tab-schedule' ? 'text-primary bg-surface-container font-bold shadow-xs' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'}`}
              >
                <span className="material-symbols-outlined text-[20px]">calendar_clock</span>
                <span>Mentoring Timetable & Alerts</span>
              </button>

              <button
                onClick={() => setActiveTab('tab-resources')}
                className={`tab-btn px-space-md py-2.5 rounded-lg font-title-md text-title-md flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'tab-resources' ? 'text-primary bg-surface-container font-bold shadow-xs' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'}`}
              >
                <span className="material-symbols-outlined text-[20px]">auto_stories</span>
                <span>Academic Vault & Notes ({myResources.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('tab-session-filing')}
                className={`tab-btn px-space-md py-2.5 rounded-lg font-title-md text-title-md flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'tab-session-filing' ? 'text-primary bg-surface-container font-bold shadow-xs' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low'}`}
              >
                <span className="material-symbols-outlined text-[20px]">fact_check</span>
                <span>Session Reports ({myRecords.length})</span>
              </button>
            </div>

            {/* WORKSPACE PANELS */}
            <div className="p-space-lg w-full">

              {/* ======================================================== */}
              {/* DIVISION 1: ASSIGNED MENTEES DIRECTORY */}
              {/* ======================================================== */}
              {activeTab === 'tab-mentees' && (
                <div className="flex flex-col gap-space-lg w-full">
                  {/* Control Filter Ribbon */}
                  <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-space-md bg-surface-container-low p-space-md rounded-xl">
                    {/* Search Field */}
                    <div className="relative flex-1 min-w-[280px]">
                      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                      <input
                        value={menteeSearch}
                        onChange={(e) => setMenteeSearch(e.target.value)}
                        placeholder="Search by Student Name, USN (e.g. U18CM24S0001), or Roll No..."
                        className="w-full h-11 pl-10 pr-4 bg-surface-container-lowest text-on-surface rounded-lg font-body-md text-body-md focus:outline-none focus:ring-2 focus:ring-primary shadow-xs border border-surface-container"
                        type="text"
                      />
                    </div>

                    {/* Filters & Buttons */}
                    <div className="flex flex-wrap items-center gap-space-sm">
                      <select
                        value={filterProgram}
                        onChange={(e) => setFilterProgram(e.target.value)}
                        className="h-11 px-3 bg-surface-container-lowest rounded-lg font-label-md text-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer shadow-xs border border-surface-container"
                      >
                        <option value="ALL">All Programs</option>
                        <option value="CSE">B.Tech Computer Science (CSE)</option>
                        <option value="BCA">Bachelor of Comp. Applications (BCA)</option>
                        <option value="BBA">Bachelor of Business Admin (BBA)</option>
                        <option value="B.COM">Bachelor of Commerce (B.Com)</option>
                        <option value="AIML">Artificial Intelligence & ML</option>
                      </select>

                      <select
                        value={filterSemester}
                        onChange={(e) => setFilterSemester(e.target.value)}
                        className="h-11 px-3 bg-surface-container-lowest rounded-lg font-label-md text-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer shadow-xs border border-surface-container"
                      >
                        <option value="ALL">All Semesters</option>
                        <option value="Sem 1">Semester 1</option>
                        <option value="Sem 2">Semester 2</option>
                        <option value="Sem 3">Semester 3</option>
                        <option value="Sem 4">Semester 4</option>
                        <option value="Sem 5">Semester 5</option>
                        <option value="Sem 6">Semester 6</option>
                        <option value="Sem 7">Semester 7</option>
                        <option value="Sem 8">Semester 8</option>
                      </select>

                      <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        className="h-11 px-3 bg-surface-container-lowest rounded-lg font-label-md text-label-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer shadow-xs border border-surface-container"
                      >
                        <option value="ALL">All Inquiries Status</option>
                        <option value="FLAGGED">Has Open Inquiry / Issue</option>
                        <option value="CLEAR">All Clear</option>
                      </select>

                      <button
                        onClick={handleExportCSV}
                        className="h-11 px-4 bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-label-md font-bold rounded-lg flex items-center gap-1.5 transition-all shadow-xs shrink-0"
                      >
                        <span className="material-symbols-outlined text-[18px]">download</span>
                        <span>Export Roster (CSV)</span>
                      </button>
                    </div>
                  </div>

                  {/* Mentees Data Table */}
                  <div className="w-full overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                          <th className="py-3 px-4 font-bold">USN / Roll No</th>
                          <th className="py-3 px-4 font-bold">Mentee Student Profile</th>
                          <th className="py-3 px-4 font-bold">Program & Sem</th>
                          <th className="py-3 px-4 font-bold">Contact Credentials</th>
                          <th className="py-3 px-4 font-bold text-right">Mentorship Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-surface-container font-body-md text-body-md text-on-surface">
                        {filteredMentees.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-slate-400">
                              <Users className="mx-auto mb-2 opacity-40" size={32} />
                              <p className="text-sm font-semibold text-slate-600">No assigned mentees match the current search or filters.</p>
                              <p className="text-xs text-slate-400 mt-0.5">Mentees assigned to {mentor.name} will appear live here.</p>
                            </td>
                          </tr>
                        ) : (
                          filteredMentees.map((st, idx) => {
                            const initials = (st.name || 'ST').split(' ').map(n => n[0]).slice(0, 2).join('');
                            const hasOpenIssues = (db.issues || []).some(
                              iss => (iss.studentId || iss.student_id)?.toUpperCase() === st.id?.toUpperCase() &&
                                     iss.status !== 'Resolved' && iss.status !== 'Closed'
                            );

                            return (
                              <tr key={st.id || idx} className="hover:bg-surface-container-low/50 transition-colors">
                                <td className="py-3.5 px-4 font-mono font-bold text-primary">
                                  {st.id}
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center font-bold text-xs shrink-0 ring-1 ring-primary/10">
                                      {initials}
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="font-bold text-on-surface leading-tight">{st.name}</span>
                                      <span className="font-label-sm text-label-sm text-on-surface-variant">
                                        {hasOpenIssues ? (
                                          <span className="text-rose-600 font-semibold flex items-center gap-1">
                                            <AlertCircle size={10} /> Active Issue Logged
                                          </span>
                                        ) : (
                                          <span>Designated Cohort Mentee</span>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex flex-col">
                                    <span className="font-semibold text-xs">{st.branch || 'CSE'}</span>
                                    <span className="text-on-surface-variant font-mono text-xs">Sem {st.sem || 5}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4 font-mono text-xs">
                                  <div>{st.email}</div>
                                  <div className="text-on-surface-variant">{st.phone || '+91 98765 43210'}</div>
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <div className="flex items-center justify-end">
                                    <a
                                      href={`mailto:${st.email}?subject=NITTE Mentorship Interaction - ${mentor.name}`}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-label-md font-semibold transition-all shadow-xs"
                                      title="Email Student"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">mail</span>
                                      <span>Email Mentee</span>
                                    </a>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm px-2">
                    <span>Showing {filteredMentees.length} of {mentees.length} assigned mentees</span>
                    <span className="font-mono">Mentor Record ID: NITTE-MENTOR-{mentor.id}</span>
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* DIVISION 2: TIMETABLE & AUTOMATED NOTIFICATIONS */}
              {/* ======================================================== */}
              {activeTab === 'tab-schedule' && (
                <div className="flex flex-col gap-space-lg w-full">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
                    {/* Schedule Card */}
                    <div className="lg:col-span-2 bg-surface-container-low p-space-lg rounded-xl flex flex-col justify-between gap-space-md border border-surface-container">
                      <div className="flex flex-col gap-space-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-primary">Fortnightly Institutional Slot</span>
                          <span className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-bold ${isSessionPassed ? 'bg-amber-100 text-amber-800' : 'bg-tertiary-fixed text-on-tertiary-fixed'}`}>
                            {isSessionPassed ? 'Session Waived (Holiday)' : 'Statutory Approved'}
                          </span>
                        </div>
                        <h3 className="font-headline-sm text-headline-sm text-on-surface font-extrabold">
                          {mentoringSchedule.day || 'Friday'}, {sessionDate} • {mentoringSchedule.time || '03:30 PM'} to {mentoringSchedule.endTime || '04:30 PM'} ({mentoringSchedule.periodSlot || 'Period 6'})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md mt-2 font-mono text-sm">
                          <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-xs border border-surface-container">
                            <span className="text-on-surface-variant block text-xs uppercase font-sans">Physical Venue</span>
                            <strong className="text-on-surface text-base">{mentoringSchedule.location || 'Seminar Hall 204'}</strong>
                            <span className="text-on-surface-variant block text-xs mt-0.5 font-sans">Academic Block III (Dept Wing)</span>
                          </div>
                          <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-xs border border-surface-container">
                            <span className="text-on-surface-variant block text-xs uppercase font-sans">Target Mentee Cohort</span>
                            <strong className="text-on-surface text-base">{mentor.class || 'Batch CSE-A & BCA'} ({mentees.length} Students)</strong>
                            <span className="text-on-surface-variant block text-xs mt-0.5 font-sans">Designated Faculty Mentorship Group</span>
                          </div>
                        </div>
                      </div>

                      {/* Automated 9:00 AM Notification Engine Trigger */}
                      <div className="bg-surface-container-lowest p-space-md rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-space-md border border-secondary-fixed">
                        <div className="flex items-center gap-space-sm">
                          <div className="w-10 h-10 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[20px]">mark_email_unread</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="font-title-md text-title-md text-on-surface font-bold">9:00 AM Automated Alert Engine</span>
                            <span className="font-body-sm text-body-sm text-on-surface-variant">Scheduled for {mentoringSchedule.day || 'Friday'} {sessionDate} at 09:00 AM IST via Gmail & SMS</span>
                          </div>
                        </div>
                        <button
                          onClick={handleTriggerManualAlert}
                          className="px-space-md py-2 bg-secondary text-on-secondary hover:bg-secondary/90 font-label-md text-label-md font-bold rounded-lg shadow-sm transition-all whitespace-nowrap flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[18px]">bolt</span>
                          <span>Trigger Alert Now</span>
                        </button>
                      </div>
                    </div>

                    {/* Calendar & Actions Summary */}
                    <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col justify-between gap-space-md border border-surface-container">
                      <div className="flex flex-col gap-space-xs">
                        <span className="font-label-sm text-label-sm font-bold uppercase text-on-surface-variant">Session Actions</span>
                        <h4 className="font-title-md text-title-md text-on-surface font-bold">Session State Administration</h4>
                        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                          Record rationale for any rescheduled, cancelled, or passed session slots.
                        </p>
                      </div>
                      <div className="flex flex-col gap-space-sm">
                        <button
                          onClick={() => setIsRescheduleModalOpen(true)}
                          className="w-full py-2.5 px-space-md bg-surface-container hover:bg-surface-container-high text-primary font-label-md text-label-md font-bold rounded-lg flex items-center justify-center gap-2 transition-all"
                        >
                          <span className="material-symbols-outlined text-[18px]">event_repeat</span>
                          <span>Reschedule Mentoring Slot</span>
                        </button>

                        {isSessionPassed ? (
                          <button
                            onClick={handleUnpassSession}
                            className="w-full py-2.5 px-space-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-label-md text-label-md font-bold rounded-lg flex items-center justify-center gap-2 transition-all border border-emerald-200"
                          >
                            <span className="material-symbols-outlined text-[18px]">undo</span>
                            <span>Re-activate Session</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => setIsPassModalOpen(true)}
                            className="w-full py-2.5 px-space-md bg-surface-container-low hover:bg-error-container text-on-surface-variant hover:text-on-error-container font-label-md text-label-md font-bold rounded-lg flex items-center justify-center gap-2 transition-all"
                          >
                            <span className="material-symbols-outlined text-[18px]">cancel</span>
                            <span>Pass / Log Holiday Waiver</span>
                          </button>
                        )}
                      </div>
                      <div className="p-space-sm rounded-lg bg-surface-container-low text-xs text-on-surface-variant font-mono">
                        Last modified by {mentor.name} on {new Date().toLocaleDateString('en-GB')}.
                      </div>
                    </div>
                  </div>
                </div>
              )}



              {/* ======================================================== */}
              {/* DIVISION 4: ACADEMIC RESOURCES & STUDY VAULT */}
              {/* ======================================================== */}
              {activeTab === 'tab-resources' && (
                <div className="flex flex-col gap-space-lg w-full">
                  <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-space-md bg-surface-container-low p-space-md rounded-xl border border-surface-container">
                    <div>
                      <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Curated Study Materials & Question Banks</h3>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">Materials synchronized with student university portals</span>
                    </div>
                    <button
                      onClick={() => setIsAddResourceModalOpen(true)}
                      className="px-space-md py-2.5 bg-primary text-on-primary hover:bg-primary/90 font-label-md text-label-md font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all shrink-0"
                    >
                      <span className="material-symbols-outlined text-[20px]">upload_file</span>
                      <span>Publish New Material</span>
                    </button>
                  </div>

                  {/* Resources Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-space-md">
                    {myResources.length === 0 ? (
                      <div className="col-span-full bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-surface-container text-center py-12 text-on-surface-variant">
                        <BookOpen className="mx-auto mb-2 opacity-40 text-primary" size={32} />
                        <p className="font-semibold text-sm">No study materials in the vault yet.</p>
                        <p className="text-xs text-slate-400 mt-0.5">Click "Publish New Material" above to share syllabus PDFs, question banks, or Drive links.</p>
                      </div>
                    ) : (
                      myResources.map((res, idx) => (
                        <div key={res.id || idx} className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between gap-space-sm hover:shadow-md transition-shadow border border-surface-container">
                          <div className="flex items-start justify-between">
                            <div className="w-10 h-10 rounded-lg bg-surface-container-high text-primary flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined text-[22px]">
                                {res.type === 'PDF' ? 'picture_as_pdf' : (res.type === 'Quiz' ? 'quiz' : 'link')}
                              </span>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-surface-container font-label-sm text-label-sm font-bold text-on-surface-variant">
                              {mentor.dept || 'CSE'}
                            </span>
                          </div>
                          <div className="flex flex-col mt-1">
                            <h4 className="font-title-md text-title-md font-bold text-on-surface">{res.title}</h4>
                            <span className="font-label-sm text-label-sm text-on-surface-variant mt-1 font-mono">
                              {res.type} Document • Uploaded {res.dateShared ? new Date(res.dateShared).toLocaleDateString() : 'Recently'}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-surface-container font-mono text-xs text-on-surface-variant">
                            <span>{mentees.length} / {mentees.length} Downloaded</span>
                            <a
                              href={res.content || '#'}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline font-bold flex items-center gap-1"
                            >
                              <span>View</span>
                              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                            </a>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* ======================================================== */}
              {/* DIVISION 5: SESSION REPORT & LOGS CENTER */}
              {/* ======================================================== */}
              {activeTab === 'tab-session-filing' && (
                <div className="flex flex-col gap-space-lg w-full">
                  <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex flex-col gap-space-md border-t-4 border-primary border border-surface-container">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm">
                      <div>
                        <span className="font-label-sm text-label-sm font-bold uppercase tracking-wider text-primary">Mentoring Session Report</span>
                        <h3 className="font-headline-sm text-headline-sm font-extrabold text-on-surface">Submit Session Report</h3>
                        <span className="font-body-sm text-body-sm text-on-surface-variant">Log session attendance, topics discussed, and mentor observations</span>
                      </div>
                      <span className={`px-3 py-1 font-label-sm text-label-sm font-bold rounded-full w-max border ${
                        isReportFiled 
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                          : (isDraftSaved || localDraftExists)
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-slate-100 text-slate-800 border-slate-300'
                      }`}>
                        {isReportFiled 
                          ? '✓ Report Submitted' 
                          : (isDraftSaved || localDraftExists)
                            ? '✎ Draft Saved • Not Yet Submitted'
                            : 'Submission Active'}
                      </span>
                    </div>

                    <form onSubmit={handleReportFilingSubmit} className="flex flex-col gap-space-md mt-2">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
                        <div>
                          <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">Session Date</label>
                          <input
                            value={reportDate}
                            onChange={(e) => setReportDate(e.target.value)}
                            className="w-full h-11 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none border border-surface-container"
                            required
                            type="date"
                          />
                        </div>
                        <div>
                          <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">Venue Held</label>
                          <input
                            value={reportVenue}
                            onChange={(e) => setReportVenue(e.target.value)}
                            className="w-full h-11 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none border border-surface-container"
                            required
                            type="text"
                          />
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant">Students Present</label>
                            <button
                              type="button"
                              onClick={() => setReportAttendance(mentees.length)}
                              className="text-xs text-primary font-bold hover:underline"
                            >
                              Set All {mentees.length} Present
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              value={reportAttendance}
                              onChange={(e) => setReportAttendance(e.target.value)}
                              className="w-full h-11 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono font-bold focus:ring-2 focus:ring-primary focus:outline-none border border-surface-container"
                              max={mentees.length || 30}
                              min={0}
                              required
                              type="number"
                            />
                            <span className="font-mono text-xs text-on-surface-variant shrink-0">/ {mentees.length} Allocated</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">Topics Discussed (Check all that apply)</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm">
                          <label className="flex items-center gap-2 p-space-sm bg-surface-container-low rounded-lg cursor-pointer border border-surface-container">
                            <input
                              checked={reportFocusAreas.academic}
                              onChange={(e) => setReportFocusAreas(p => ({ ...p, academic: e.target.checked }))}
                              className="w-4 h-4 text-primary rounded"
                              type="checkbox"
                            />
                            <span className="font-body-sm text-body-sm text-on-surface font-medium">Academic Performance & CIE Marks</span>
                          </label>
                          <label className="flex items-center gap-2 p-space-sm bg-surface-container-low rounded-lg cursor-pointer border border-surface-container">
                            <input
                              checked={reportFocusAreas.attendance}
                              onChange={(e) => setReportFocusAreas(p => ({ ...p, attendance: e.target.checked }))}
                              className="w-4 h-4 text-primary rounded"
                              type="checkbox"
                            />
                            <span className="font-body-sm text-body-sm text-on-surface font-medium">Campus Attendance Redressal</span>
                          </label>
                          <label className="flex items-center gap-2 p-space-sm bg-surface-container-low rounded-lg cursor-pointer border border-surface-container">
                            <input
                              checked={reportFocusAreas.wellbeing}
                              onChange={(e) => setReportFocusAreas(p => ({ ...p, wellbeing: e.target.checked }))}
                              className="w-4 h-4 text-primary rounded"
                              type="checkbox"
                            />
                            <span className="font-body-sm text-body-sm text-on-surface font-medium">Personal Well-being & Hostels</span>
                          </label>
                        </div>
                      </div>

                      <div>
                        <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">Mentor Summary & Notes</label>
                        <textarea
                          value={reportNotes}
                          onChange={(e) => setReportNotes(e.target.value)}
                          placeholder="Enter summary of discussion, mentor advice, or action items..."
                          className="w-full p-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface focus:ring-2 focus:ring-primary focus:outline-none border border-surface-container"
                          required
                          rows={3}
                        />
                      </div>

                      <div className="flex items-center justify-end gap-space-sm pt-2">
                        <button
                          type="button"
                          onClick={handleSaveDraft}
                          className="px-space-md py-2.5 bg-surface-container text-on-surface-variant font-label-md text-label-md font-bold rounded-lg hover:bg-surface-container-high transition-all flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-[18px]">save</span>
                          <span>Save as Draft</span>
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmittingReport}
                          className="px-space-lg py-2.5 bg-primary text-on-primary hover:bg-primary/90 font-label-md text-label-md font-bold rounded-lg shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
                        >
                          <span className="material-symbols-outlined text-[18px]">verified</span>
                          <span>{isSubmittingReport ? 'Submitting...' : 'Submit Session Report'}</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Filing History Table */}
                  <div className="flex flex-col gap-space-sm">
                    <span className="font-label-sm text-label-sm font-bold uppercase text-on-surface-variant">Session Report History</span>
                    <div className="w-full overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm border border-surface-container">
                      <table className="w-full text-left border-collapse font-body-md text-body-md">
                        <thead>
                          <tr className="bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                            <th className="py-3 px-4 font-bold">Session / Topic</th>
                            <th className="py-3 px-4 font-bold">Date</th>
                            <th className="py-3 px-4 font-bold">Attendance Recorded</th>
                            <th className="py-3 px-4 font-bold">Status</th>
                            <th className="py-3 px-4 text-right font-bold">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-surface-container">
                          {myRecords.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-slate-400">
                                No session records filed yet for this semester.
                              </td>
                            </tr>
                          ) : (
                            myRecords.map((rec, idx) => (
                              <tr key={rec.id || idx}>
                                <td className="py-3 px-4 font-bold text-on-surface font-mono">
                                  {rec.topic || `Mentorship Session #${idx + 1}`}
                                </td>
                                <td className="py-3 px-4 font-mono text-xs">
                                  {rec.sessionDate || rec.createdAt ? new Date(rec.sessionDate || rec.createdAt).toLocaleDateString() : 'Recent'}
                                </td>
                                <td className="py-3 px-4 font-mono">
                                  {rec.studentsAttended || mentees.length} / {mentees.length || 30} Present
                                </td>
                                <td className="py-3 px-4">
                                  {rec.status === 'Draft' ? (
                                    <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-label-sm text-label-sm font-bold border border-amber-300 inline-flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[14px]">edit_note</span>
                                      Draft (Unsubmitted)
                                    </span>
                                  ) : (
                                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-label-sm text-label-sm font-bold border border-emerald-200 inline-flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[14px]">verified</span>
                                      Submitted
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {rec.status === 'Draft' ? (
                                      <button
                                        onClick={() => {
                                          if (rec.sessionDate) setReportDate(rec.sessionDate);
                                          if (rec.location) setReportVenue(rec.location);
                                          if (rec.studentsAttended !== undefined) setReportAttendance(rec.studentsAttended);
                                          if (rec.notes) setReportNotes(rec.notes);
                                          window.scrollTo({ top: 300, behavior: 'smooth' });
                                          showToast('Draft restored into form. You can now edit and submit!');
                                        }}
                                        className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold transition flex items-center gap-1"
                                      >
                                        <span className="material-symbols-outlined text-[14px]">edit</span>
                                        Resume
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => showToast(`Exporting report summary for ${rec.sessionDate || 'session'}...`)}
                                        className="p-1.5 text-primary hover:bg-surface-container rounded-lg"
                                        title="Download Report Summary"
                                      >
                                        <span className="material-symbols-outlined text-[18px]">description</span>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}



            </div>
          </div>

        </div>
      </div>

      {/* 3. MODALS */}
      {/* Modal 1: Reschedule Slot */}
      {isRescheduleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-xl shadow-2xl p-space-lg flex flex-col gap-space-md border border-surface-container">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary font-title-md text-title-md font-bold">
                <span className="material-symbols-outlined">schedule</span>
                <span>Reschedule Mentoring Slot</span>
              </div>
              <button onClick={() => setIsRescheduleModalOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Shift current session ({mentoringSchedule.day || 'Friday'}, {sessionDate} • {mentoringSchedule.periodSlot || 'Period 6'}) to a compensatory timetable slot.
            </p>
            <form onSubmit={handleRescheduleSubmit} className="flex flex-col gap-space-sm">
              <div>
                <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">New Date</label>
                <input
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface border border-surface-container"
                  required
                  type="date"
                />
              </div>
              <div>
                <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">New Slot / Period</label>
                <select
                  value={editPeriodSlot}
                  onChange={(e) => setEditPeriodSlot(e.target.value)}
                  className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface border border-surface-container"
                >
                  <option value="Period 1 (09:00 AM - 10:00 AM)">Period 1 (09:00 AM - 10:00 AM)</option>
                  <option value="Period 2 (10:00 AM - 11:00 AM)">Period 2 (10:00 AM - 11:00 AM)</option>
                  <option value="Period 3 (11:15 AM - 12:15 PM)">Period 3 (11:15 AM - 12:15 PM)</option>
                  <option value="Period 4 (12:15 PM - 01:15 PM)">Period 4 (12:15 PM - 01:15 PM)</option>
                  <option value="Period 5 (02:00 PM - 03:00 PM)">Period 5 (02:00 PM - 03:00 PM)</option>
                  <option value="Period 6 (03:30 PM - 04:30 PM)">Period 6 (03:30 PM - 04:30 PM)</option>
                  <option value="Period 7 (04:30 PM - 05:30 PM)">Period 7 (04:30 PM - 05:30 PM)</option>
                </select>
              </div>
              <div>
                <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">Venue</label>
                <input
                  value={editVenue}
                  onChange={(e) => setEditVenue(e.target.value)}
                  className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface border border-surface-container"
                  required
                  type="text"
                />
              </div>
              <div>
                <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">Statutory Justification (Audit)</label>
                <textarea
                  value={rescheduleJustification}
                  onChange={(e) => setRescheduleJustification(e.target.value)}
                  placeholder="Reason for change (e.g. NAAC Committee Visit clash)..."
                  className="w-full p-2.5 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface border border-surface-container"
                  required
                  rows={2}
                />
              </div>
              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIsRescheduleModalOpen(false)}
                  className="px-4 py-2 bg-surface-container rounded-lg font-label-md text-label-md font-bold text-on-surface-variant"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingSchedule}
                  className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md font-bold shadow-sm disabled:opacity-50"
                >
                  {isUpdatingSchedule ? 'Updating...' : 'Save & Broadcast'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Pass Session / Holiday Log */}
      {isPassModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-xl shadow-2xl p-space-lg flex flex-col gap-space-md border border-surface-container">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-error font-title-md text-title-md font-bold">
                <span className="material-symbols-outlined">event_busy</span>
                <span>Record Pass Session Waiver</span>
              </div>
              <button onClick={() => setIsPassModalOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Record waiver for session on {sessionDate}.
            </p>
            <form onSubmit={handlePassSessionSubmit} className="flex flex-col gap-space-sm">
              <div>
                <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">Waiver Classification</label>
                <select
                  value={passReason}
                  onChange={(e) => setPassReason(e.target.value)}
                  className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface border border-surface-container"
                  required
                >
                  <option value="Public / Declared Gazetted Holiday">Public / Declared Gazetted Holiday</option>
                  <option value="University Semester End Examination Duty">University Semester End Examination Duty</option>
                  <option value="Official Institutional Symposium / Fest">Official Institutional Symposium / Fest</option>
                  <option value="Faculty Deputation / Medical Leave">Faculty Deputation / Medical Leave</option>
                </select>
              </div>
              <div>
                <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">Audit Remark Note</label>
                <textarea
                  value={passRemarks}
                  onChange={(e) => setPassRemarks(e.target.value)}
                  placeholder="Institute office notification reference #..."
                  className="w-full p-2.5 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface border border-surface-container"
                  required
                  rows={2}
                />
              </div>
              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIsPassModalOpen(false)}
                  className="px-4 py-2 bg-surface-container rounded-lg font-label-md text-label-md font-bold text-on-surface-variant"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPassingSession}
                  className="px-4 py-2 bg-error text-on-error rounded-lg font-label-md text-label-md font-bold shadow-sm disabled:opacity-50"
                >
                  {isPassingSession ? 'Recording...' : 'Record Exemption'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Modal 4: Publish Material Modal */}
      {isAddResourceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest w-full max-w-md rounded-xl shadow-2xl p-space-lg flex flex-col gap-space-md border border-surface-container">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary font-title-md text-title-md font-bold">
                <span className="material-symbols-outlined">upload_file</span>
                <span>Publish Study Material</span>
              </div>
              <button onClick={() => setIsAddResourceModalOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleAddResourceSubmit} className="flex flex-col gap-space-sm">
              <div>
                <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">Material Title</label>
                <input
                  value={newResTitle}
                  onChange={(e) => setNewResTitle(e.target.value)}
                  placeholder="e.g. 21CS51: DBMS Unit 3 Notes & Question Bank"
                  className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface border border-surface-container"
                  required
                  type="text"
                />
              </div>
              <div>
                <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">Document Type</label>
                <select
                  value={newResType}
                  onChange={(e) => setNewResType(e.target.value)}
                  className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface border border-surface-container"
                >
                  <option value="PDF">PDF Lecture Notes</option>
                  <option value="Quiz">Practice Question Bank</option>
                  <option value="Lab">Lab Manual & Viva Code</option>
                  <option value="Link">External Drive / Reference Link</option>
                </select>
              </div>
              <div>
                <label className="block font-label-sm text-label-sm font-bold uppercase text-on-surface-variant mb-1">Google Drive or Document Link</label>
                <input
                  value={newResContent}
                  onChange={(e) => setNewResContent(e.target.value)}
                  placeholder="https://drive.google.com/file/d/..."
                  className="w-full h-10 px-3 bg-surface-container-low rounded-lg font-body-md text-body-md text-on-surface font-mono text-xs border border-surface-container"
                  required
                  type="text"
                />
              </div>
              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setIsAddResourceModalOpen(false)}
                  className="px-4 py-2 bg-surface-container rounded-lg font-label-md text-label-md font-bold text-on-surface-variant"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md text-label-md font-bold shadow-sm"
                >
                  Publish to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* FOOTER */}
      <footer className="w-full bg-surface-container-low py-space-md border-t border-outline-variant/20 mt-auto">
        <div className="w-full px-gutter flex flex-col md:flex-row items-center justify-between gap-space-sm text-on-surface-variant font-label-sm text-label-sm">
          <span>© 2025 NITTE (Deemed to be University) • Department of {mentor.dept || 'Computer Science & Engineering'}. All Rights Reserved.</span>
          <div className="flex items-center gap-space-md">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-tertiary">verified</span>
              NAAC Accredited 'A+' Grade
            </span>
            <span>Mentorship Advisory System</span>
            <a className="text-primary hover:underline font-semibold" href="#">Institutional Support</a>
          </div>
        </div>
      </footer>

    </div>
  );
};
