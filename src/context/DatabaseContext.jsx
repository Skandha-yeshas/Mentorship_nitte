import React, { createContext, useState, useEffect } from 'react';
import {
  generateStudentOnboardingEmailHtml,
  generateStudentOnboardingEmailText,
  generateRoMeetingScheduledEmailHtml,
  generateRoMeetingScheduledEmailText
} from '../utils/studentEmailTemplate';

export const DatabaseContext = createContext();

// 🔒 CANONICAL TICKET & MEETING STATUS STATE-MACHINE ENUMS
export const TICKET_STATUS = {
  SUBMITTED: 'Submitted',
  ASSIGNED_TO_RO: 'Assigned to RO',
  IN_PROGRESS: 'In-Progress',
  MEETING_SCHEDULED: 'Meeting Scheduled',
  MEETING_STARTED: 'Meeting Started',
  REOPENED: 'Re-opened by Student',
  ESCALATED: 'Escalated',
  RE_ESCALATED: 'Re-escalated',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed'
};

export const MEETING_STATUS = {
  CONFIRMED: 'Confirmed',
  STARTED: 'Started',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

// Realistic issue categories representing the 49 possible categories
const ISSUE_CATEGORIES = {
  Academic: [
    'Course Enrollment issues', 'Attendance shortage clarification',
    'Internal marks discrepancy', 'Difficulty in understanding subjects',
    'Lab equipment issues', 'Syllabus coverage speed',
    'Assignment submission extensions', 'Elective course selection advice'
  ],
  Exams: [
    'Hall ticket download errors', 'Exam schedule conflicts',
    'Revaluation/Re-totalling requests', 'Make-up exam eligibility',
    'Results withholding issues', 'Supplementary exam fees',
    'Answer sheet copy request', 'Grace marks query'
  ],
  Financial: [
    'Tuition fee installment requests', 'Scholarship application delay',
    'Hostel fee payment extension', 'Exam fee payment failure',
    'Refund of caution deposits', 'Bank loan bonafide certificate',
    'Fine waiver appeals', 'Late fee penalty queries'
  ],
  Hostels: [
    'Room maintenance & repairs', 'Mess food quality/hygiene',
    'Wi-Fi connectivity issues', 'Water supply shortage',
    'Roommate conflicts', 'Hostel curfew permissions',
    'Laundry services issues', 'Pest control requests'
  ],
  Placements: [
    'Resume verification delay', 'Eligibility criteria appeals',
    'Interview scheduling clashes', 'Placement training portal bugs',
    'Company registration issues', 'NOC certificate delay',
    'Internship credits validation', 'Mock interview slots'
  ],
  Facilities: [
    'Library book renewal limits', 'Canteen hygiene & pricing',
    'Sports equipment availability', 'Gymnasium access timings',
    'Campus transport routes'
  ],
  Personal: [
    'Stress & anxiety management', 'Peer pressure adjustments',
    'Time management struggles', 'Homesickness assistance'
  ]
};

export const ALL_CATEGORIES = Object.keys(ISSUE_CATEGORIES).reduce((acc, cat) => {
  return acc.concat(ISSUE_CATEGORIES[cat].map(sub => `${cat} - ${sub}`));
}, []);

// YouTube embed URL conversion helper
export const getYoutubeEmbedUrl = (url) => {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.includes('/embed/')) return trimmed;
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  if (match && match[1]) {
    return `https://www.youtube-nocookie.com/embed/${match[1]}?autoplay=1&rel=0`;
  }
  return trimmed;
};

// Clean one-time purge of any old demo caches
if (typeof window !== 'undefined') {
  try {
    const isCleaned = localStorage.getItem('nitte_clean_state_v3');
    if (!isCleaned) {
      localStorage.removeItem('nitte_saved_issues');
      localStorage.removeItem('nitte_saved_meetings');
      localStorage.removeItem('nitte_saved_mentor_feedbacks');
      localStorage.removeItem('nitte_saved_recordings');
      localStorage.removeItem('demo_limit_bypassed');
      localStorage.removeItem('auth_user_session');
      localStorage.setItem('nitte_clean_state_v3', 'true');
    }
  } catch (e) { }
}

export const DEFAULT_FACULTY_MENTORS = [
  { id: 'M101', name: 'Dr. Radhakrishnan', email: 'radhakrishnan@nitte.edu', dept: 'CSE', class: '5th Sem CSE - Sec A', password: 'Nit#Mnt2026', role: 'Mentor' },
  { id: 'M102', name: 'Dr. Preethi Hegde', email: 'preethi.hegde@nitte.edu', dept: 'CSE', class: '3rd Sem CSE - Sec B', password: 'Nit#Mnt2026', role: 'Mentor' },
  { id: 'M103', name: 'Prof. Ramesh Rao', email: 'ramesh.rao@nitte.edu', dept: 'BCA', class: '3rd Sem BCA - Sec A', password: 'Nit#Mnt2026', role: 'Mentor' },
  { id: 'M104', name: 'Dr. Deepa Shenoy', email: 'deepa.shenoy@nitte.edu', dept: 'BBA', class: '1st Sem BBA - Sec A', password: 'Nit#Mnt2026', role: 'Mentor' },
  { id: 'M105', name: 'Prof. Raghavendra Pai', email: 'raghavendra.pai@nitte.edu', dept: 'BCOM', class: '5th Sem BCOM - Sec A', password: 'Nit#Mnt2026', role: 'Mentor' },
  { id: 'M106', name: 'Prof. Suresh Kumar', email: 'suresh.kumar@nitte.edu', dept: 'ECE', class: '3rd Sem ECE - Sec B', password: 'Nit#Mnt2026', role: 'Mentor' },
  { id: 'M107', name: 'Dr. Kavitha Bhat', email: 'kavitha.bhat@nitte.edu', dept: 'AIML', class: '7th Sem AIML - Sec A', password: 'Nit#Mnt2026', role: 'Mentor' },
  { id: 'M108', name: 'Prof. Santosh Prabhu', email: 'santosh.prabhu@nitte.edu', dept: 'ISE', class: '5th Sem ISE - Sec A', password: 'Nit#Mnt2026', role: 'Mentor' },
  { id: 'M109', name: 'Prof. Anitha Rao', email: 'anitha.rao@nitte.edu', dept: 'MCA', class: '1st Sem MCA - Sec A', password: 'Nit#Mnt2026', role: 'Mentor' },
  { id: 'M110', name: 'Dr. Prakash Shetty', email: 'prakash.shetty@nitte.edu', dept: 'MBA', class: '3rd Sem MBA - Sec A', password: 'Nit#Mnt2026', role: 'Mentor' }
];

// Clean Database State
const MOCK_DB = {
  users: {
    students: [],
    mentors: DEFAULT_FACULTY_MENTORS,
    ros: ALL_CATEGORIES.map((cat, idx) => ({
      id: `RO-${String(idx + 1).padStart(2, '0')}`,
      name: `RO - ${cat.split(' - ')[1]}`,
      email: 'skandhayashu2906@gmail.com',
      region: cat,
      password: 'Nit#Ro2026'
    }))
  },
  issues: [],
  meetings: [],
  groupSessions: [],
  resources: [],
  mentorSessionRecords: [],
  mentoringSchedules: {},
  mentorFeedbacks: [],
  systemLogs: [],
  gmailAddress: 'skandhayashu2906@gmail.com',
  gmailLogs: [],
  categoryVideos: [
    {
      category: 'Academic',
      title: 'NITTE Academic Guide: Course Enrollment & Attendance Policy',
      videoUrl: 'https://www.youtube.com/watch?v=kqtD5dpn9C8',
      description: '1. Check student ERP portal for minimum 75% attendance threshold.\n2. Medical or duty leave certificates must be submitted to HOD within 3 days.\n3. Verify course elective credits with your department coordinator.',
      updatedBy: 'System'
    },
    {
      category: 'Exams',
      title: 'Examination Portal & Hall Ticket Resolution Walkthrough',
      videoUrl: 'https://www.youtube.com/watch?v=3JZ_D3ELwOQ',
      description: '1. Clear pending department dues before downloading exam admit card.\n2. Apply for revaluation via Controller of Examination portal within 7 days of result declaration.\n3. Make-up exam forms are verified automatically based on attendance approval.',
      updatedBy: 'System'
    },
    {
      category: 'Financial',
      title: 'Fee Installments, Scholarships & Payment Receipt Assistance',
      videoUrl: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
      description: '1. Download fee receipt directly from Finance Portal under Transaction History.\n2. For installment plans, submit parent undertaking letter.\n3. State & National Scholarship bonafide certificates are issued at Admin Desk Counter 2.',
      updatedBy: 'System'
    },
    {
      category: 'Hostels',
      title: 'Campus Hostel Maintenance, Mess & Facility Protocol',
      videoUrl: 'https://www.youtube.com/watch?v=kJQP7kiw5Fk',
      description: '1. For electrical or plumbing issues, log a ticket in the Hostel Maintenance Register at block warden desk.\n2. Mess committee meetings are held on the 1st of every month.\n3. Curfew extension passes must be requested 24 hours prior via Warden.',
      updatedBy: 'System'
    },
    {
      category: 'Placements',
      title: 'Placement Training, Resume Verification & Drive Registration',
      videoUrl: 'https://www.youtube.com/watch?v=21X5lGlDOfg',
      description: '1. Ensure resume PDF is verified by Placement Cell coordinator.\n2. Update CGPA and active backlogs in the training portal.\n3. Collect NOC certificates from Training & Placement Officer.',
      updatedBy: 'System'
    },
    {
      category: 'Facilities',
      title: 'Campus Facilities: Library Access, Gym & Transport Services',
      videoUrl: 'https://www.youtube.com/watch?v=OPf0YbXqDm0',
      description: '1. Digital Library accounts are active for all enrolled students.\n2. Campus bus route passes can be renewed at Transport Office.\n3. Sports equipment is issued with valid student ID card.',
      updatedBy: 'System'
    },
    {
      category: 'Personal',
      title: 'Student Counseling, Wellness & Mentorship Support',
      videoUrl: 'https://www.youtube.com/watch?v=7wtfhZwyrcc',
      description: '1. Confidential student counseling is available at Wellness Center Block B.\n2. Mentors are available every Wednesday during tutorial hours.\n3. Reach out to your Relationship Officer for a private 1-on-1 session.',
      updatedBy: 'System'
    }
  ]
};

// Robust Deduplication & Structured Normalization Engine (USN/ID is Primary Key)
export const structureAndDeduplicateStudents = (students = []) => {
  if (!Array.isArray(students)) return [];
  const map = new Map();

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    if (!s) continue;
    const rawId = s.id || s.usn || s.studentId || s.USN || s['Student ID'] || s['Student USN'] || s['USN / ID'] || s['Roll No'] || s['Roll Number'];
    const rawName = s.name || s.studentName || s.Name || s['Student Name'] || s['Full Name'] || 'Student User';
    const rawEmail = s.email || s.studentEmail || s.Email || s.gmail || s['Gmail'] || s['Student Email'] || s['Email Address'] || s['Student Gmail'];

    const id = rawId ? String(rawId).trim().toUpperCase() : `U18CM24S${String(i + 1).padStart(4, '0')}`;
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : `${id.toLowerCase()}@nitte.edu.in`;
    const name = String(rawName).trim();
    const branch = String(s.branch || s.Branch || s.department || s.Dept || 'CSE').trim().toUpperCase();
    const sem = parseInt(s.sem || s.Sem || s.semester || s.Semester) || 5;
    const mentorId = (s.mentorId !== undefined && s.mentorId !== null)
      ? (String(s.mentorId).trim() || null)
      : (s.mentor_id ? (String(s.mentor_id).trim() || null) : null);
    const phone = String(s.phone || s.Phone || s.mobile || '9876543210').trim();
    const password = s.password ? String(s.password).trim() : 'Nit#Stu2026';
    const role = 'Student';
    const createdAt = s.createdAt || new Date().toISOString();
    const lastLogin = s.lastLogin || null;

    const structuredStudent = {
      id,
      name,
      email,
      branch,
      sem,
      mentorId,
      phone,
      password,
      role,
      createdAt,
      lastLogin
    };

    // USN / Student ID is the unique primary key
    if (map.has(id)) {
      const existing = map.get(id);
      const keepMentorId = structuredStudent.mentorId !== undefined
        ? structuredStudent.mentorId
        : existing.mentorId;

      map.set(id, {
        ...existing,
        ...structuredStudent,
        mentorId: keepMentorId,
        createdAt: existing.createdAt || structuredStudent.createdAt,
        lastLogin: structuredStudent.lastLogin || existing.lastLogin
      });
    } else {
      map.set(id, structuredStudent);
    }
  }

  return Array.from(map.values());
};

export const structureAndDeduplicateMentors = (mentors = []) => {
  if (!Array.isArray(mentors)) return [];
  const map = new Map();

  for (let i = 0; i < mentors.length; i++) {
    const m = mentors[i];
    if (!m) continue;
    const rawId = m.id || m.mentorId || m.facultyId || m['Mentor ID'];
    const rawName = m.name || m.mentorName || m.Name || m['Mentor Name'] || m['Faculty Name'] || 'Faculty Mentor';
    const rawEmail = m.email || m.Email || m.gmail || m['Gmail'] || m['Mentor Gmail'] || m['Faculty Email'];
    const dept = String(m.dept || m.department || m.Branch || m['Department'] || 'CSE').trim().toUpperCase();
    const assignedClass = String(m.class || m['Assigned Class'] || m['assigned class'] || `${dept} 5th Sem - Batch A`).trim();

    const id = rawId ? String(rawId).trim().toUpperCase() : `M${101 + i}`;
    const email = rawEmail ? String(rawEmail).trim().toLowerCase() : `${id.toLowerCase()}@nitte.edu.in`;
    const name = String(rawName).trim();
    const password = m.password ? String(m.password).trim() : 'Nit#Mnt2026';

    const structuredMentor = {
      id,
      name,
      email,
      dept,
      class: assignedClass,
      password,
      role: 'Mentor',
      createdAt: m.createdAt || new Date().toISOString(),
      lastLogin: m.lastLogin || null
    };

    if (map.has(id)) {
      const existing = map.get(id);
      map.set(id, {
        ...existing,
        ...structuredMentor,
        createdAt: existing.createdAt || structuredMentor.createdAt,
        lastLogin: structuredMentor.lastLogin || existing.lastLogin
      });
    } else {
      map.set(id, structuredMentor);
    }
  }

  return Array.from(map.values());
};

export const DEFAULT_COLLEGE_BRANCHES = [
  { code: 'CSE', name: 'Computer Science & Engineering', degree: 'B.E / B.Tech', totalSems: 8 },
  { code: 'ISE', name: 'Information Science & Engineering', degree: 'B.E / B.Tech', totalSems: 8 },
  { code: 'AIML', name: 'Artificial Intelligence & Machine Learning', degree: 'B.E / B.Tech', totalSems: 8 },
  { code: 'AIDS', name: 'Artificial Intelligence & Data Science', degree: 'B.E / B.Tech', totalSems: 8 },
  { code: 'ECE', name: 'Electronics & Communication Engineering', degree: 'B.E / B.Tech', totalSems: 8 },
  { code: 'MECH', name: 'Mechanical Engineering', degree: 'B.E / B.Tech', totalSems: 8 },
  { code: 'CIVIL', name: 'Civil Engineering', degree: 'B.E / B.Tech', totalSems: 8 },
  { code: 'BCA', name: 'Bachelor of Computer Applications', degree: 'B.C.A', totalSems: 6 },
  { code: 'BBA', name: 'Bachelor of Business Administration', degree: 'B.B.A', totalSems: 6 },
  { code: 'BCOM', name: 'Bachelor of Commerce', degree: 'B.Com', totalSems: 6 },
  { code: 'MCA', name: 'Master of Computer Applications', degree: 'M.C.A', totalSems: 4 },
  { code: 'MBA', name: 'Master of Business Administration', degree: 'M.B.A', totalSems: 4 }
];

// Robust mentor ID comparison helper (handles M-101 vs M101, casing, spaces)
export const isMatchingMentorId = (studentMentorId, mentorId) => {
  if (!studentMentorId || !mentorId) return false;
  const s = String(studentMentorId).trim().toUpperCase();
  const m = String(mentorId).trim().toUpperCase();
  if (s === m) return true;
  return s.replace(/[^A-Z0-9]/g, '') === m.replace(/[^A-Z0-9]/g, '');
};

export const DatabaseProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('curr_user_role');
    return saved || 'Admin';
  });

  const [branches, setBranches] = useState(() => {
    try {
      const saved = localStorage.getItem('nitte_managed_branches');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { }
    return DEFAULT_COLLEGE_BRANCHES;
  });

  const addBranch = ({ code, name, degree, totalSems }) => {
    if (!code || !name) throw new Error('Branch code and branch name are required.');
    const cleanCode = code.trim().toUpperCase();
    if (branches.some(b => b.code.toUpperCase() === cleanCode)) {
      throw new Error(`Branch with code "${cleanCode}" already exists.`);
    }
    const newBranch = {
      code: cleanCode,
      name: name.trim(),
      degree: degree ? degree.trim() : 'UG Degree',
      totalSems: parseInt(totalSems) || 8
    };
    const updated = [...branches, newBranch];
    setBranches(updated);
    try {
      localStorage.setItem('nitte_managed_branches', JSON.stringify(updated));
    } catch (e) { }
    return newBranch;
  };

  const removeBranch = (branchCode) => {
    const cleanCode = (branchCode || '').trim().toUpperCase();
    const updated = branches.filter(b => b.code.toUpperCase() !== cleanCode);
    setBranches(updated);
    try {
      localStorage.setItem('nitte_managed_branches', JSON.stringify(updated));
    } catch (e) { }
  };

  const updateBranch = (branchCode, updatedData) => {
    const cleanCode = (branchCode || '').trim().toUpperCase();
    const updated = branches.map(b => b.code.toUpperCase() === cleanCode ? { ...b, ...updatedData } : b);
    setBranches(updated);
    try {
      localStorage.setItem('nitte_managed_branches', JSON.stringify(updated));
    } catch (e) { }
  };

  const resetBranchesToDefault = () => {
    setBranches(DEFAULT_COLLEGE_BRANCHES);
    try {
      localStorage.setItem('nitte_managed_branches', JSON.stringify(DEFAULT_COLLEGE_BRANCHES));
    } catch (e) { }
  };

  const assignStudentsToMentor = (mentorId, studentIdsToAssign = [], studentIdsToUnassign = []) => {
    if (!mentorId) return { success: false, message: 'Mentor ID is required.' };
    const cleanMentorId = String(mentorId).trim();
    const assignSet = new Set((studentIdsToAssign || []).map(id => String(id).trim().toUpperCase()));
    const unassignSet = new Set((studentIdsToUnassign || []).map(id => String(id).trim().toUpperCase()));

    setDb(prev => {
      const currentStudents = prev.users?.students || [];
      const updatedStudents = currentStudents.map(s => {
        const uId = String(s.id).trim().toUpperCase();
        if (assignSet.has(uId)) {
          return { ...s, mentorId: cleanMentorId };
        }
        if (unassignSet.has(uId) && isMatchingMentorId(s.mentorId, cleanMentorId)) {
          return { ...s, mentorId: null };
        }
        return s;
      });

      const updatedMentors = (prev.users?.mentors || []).map(m => {
        const count = updatedStudents.filter(st => isMatchingMentorId(st.mentorId, m.id)).length;
        return {
          ...m,
          class: `${count} Assigned Mentees`
        };
      });

      try {
        localStorage.setItem('nitte_saved_students', JSON.stringify(updatedStudents));
        localStorage.setItem('nitte_saved_mentors', JSON.stringify(updatedMentors));
      } catch (e) { }

      return {
        ...prev,
        users: {
          ...prev.users,
          students: updatedStudents,
          mentors: updatedMentors
        }
      };
    });

    // Fire background persistence to Vite middleware / backend if active
    fetch('/api/admin/assign-students-to-mentor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mentorId: cleanMentorId, studentIdsToAssign, studentIdsToUnassign })
    }).catch(() => {});

    return { success: true, count: assignSet.size };
  };

  const removeStudent = async (studentId) => {
    if (!studentId) return { success: false, message: 'Student ID is required.' };
    const cleanId = String(studentId).trim().toUpperCase();

    setDb(prev => {
      const currentStudents = prev.users?.students || [];
      const updatedStudents = currentStudents.filter(s => String(s.id).trim().toUpperCase() !== cleanId);

      // Recalculate mentee counts for all mentors
      const updatedMentors = (prev.users?.mentors || []).map(m => {
        const count = updatedStudents.filter(st => isMatchingMentorId(st.mentorId, m.id)).length;
        return {
          ...m,
          class: `${count} Assigned Mentees`
        };
      });

      try {
        localStorage.setItem('nitte_saved_students', JSON.stringify(updatedStudents));
        localStorage.setItem('nitte_saved_mentors', JSON.stringify(updatedMentors));
      } catch (e) { }

      return {
        ...prev,
        users: {
          ...prev.users,
          students: updatedStudents,
          mentors: updatedMentors
        }
      };
    });

    // Notify backend / Vite proxy
    try {
      await fetch('/api/admin/delete-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: cleanId })
      });
    } catch (e) { }

    return { success: true, studentId: cleanId };
  };

  const removeMentor = async (mentorId) => {
    if (!mentorId) return { success: false, message: 'Mentor ID is required.' };
    const cleanId = String(mentorId).trim();

    setDb(prev => {
      const currentMentors = prev.users?.mentors || [];
      const updatedMentors = currentMentors.filter(m => !isMatchingMentorId(m.id, cleanId));

      // Safely unassign any students who were assigned to this mentor
      const currentStudents = prev.users?.students || [];
      const updatedStudents = currentStudents.map(s => {
        if (isMatchingMentorId(s.mentorId, cleanId)) {
          return { ...s, mentorId: null };
        }
        return s;
      });

      try {
        localStorage.setItem('nitte_saved_mentors', JSON.stringify(updatedMentors));
        localStorage.setItem('nitte_saved_students', JSON.stringify(updatedStudents));
      } catch (e) { }

      return {
        ...prev,
        users: {
          ...prev.users,
          mentors: updatedMentors,
          students: updatedStudents
        }
      };
    });

    // Notify backend / Vite proxy
    try {
      await fetch('/api/admin/delete-mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId: cleanId })
      });
    } catch (e) { }

    return { success: true, mentorId: cleanId };
  };

  const [db, setDb] = useState(() => {
    let base = { ...MOCK_DB };
    try {
      const savedStudents = localStorage.getItem('nitte_saved_students');
      if (savedStudents) {
        const parsed = JSON.parse(savedStudents);
        if (Array.isArray(parsed)) {
          base.users = {
            ...base.users,
            students: structureAndDeduplicateStudents(parsed)
          };
        }
      }
    } catch (e) { }

    try {
      const savedMentors = localStorage.getItem('nitte_saved_mentors');
      if (savedMentors) {
        const parsed = JSON.parse(savedMentors);
        if (Array.isArray(parsed)) {
          base.users = {
            ...base.users,
            mentors: structureAndDeduplicateMentors(parsed)
          };
        }
      }
    } catch (e) { }

    try {
      const savedIssues = localStorage.getItem('nitte_saved_issues');
      if (savedIssues) {
        const parsed = JSON.parse(savedIssues);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const issueMap = new Map();
          (base.issues || []).forEach(i => issueMap.set(i.id, i));
          parsed.forEach(i => issueMap.set(i.id, i));
          base = { ...base, issues: Array.from(issueMap.values()) };
        }
      }
    } catch (e) { }

    try {
      const savedMf = localStorage.getItem('nitte_saved_mentor_feedbacks');
      if (savedMf) {
        const parsedMf = JSON.parse(savedMf);
        if (Array.isArray(parsedMf) && parsedMf.length > 0) {
          const mfMap = new Map();
          (base.mentorFeedbacks || []).forEach(f => mfMap.set(f.id, f));
          parsedMf.forEach(f => mfMap.set(f.id, f));
          base = { ...base, mentorFeedbacks: Array.from(mfMap.values()) };
        }
      }
    } catch (e) { }

    return base;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPgConnected, setIsPgConnected] = useState(false);

  // Fetch full state from backend or fallback to MOCK_DB if offline
  const fetchDbState = async () => {
    try {
      const res = await fetch('/api/db-state');
      if (!res.ok) throw new Error('Backend offline');
      const data = await res.json();
      setDb(prev => {
        let recs = (data.recordings && data.recordings.length) ? data.recordings : (prev.recordings || []);
        if (!recs || !recs.length) {
          try {
            const saved = localStorage.getItem('nitte_saved_recordings');
            if (saved) recs = JSON.parse(saved);
          } catch (e) { }
        }

        // Preserve and sync category videos from server or localStorage
        let catVideos = (data.categoryVideos && data.categoryVideos.length) ? data.categoryVideos : (prev.categoryVideos || []);
        if (!catVideos || !catVideos.length) {
          try {
            const savedVideos = localStorage.getItem('nitte_saved_category_videos');
            if (savedVideos) catVideos = JSON.parse(savedVideos);
          } catch (e) { }
        }
        if (!catVideos || !catVideos.length) {
          catVideos = MOCK_DB.categoryVideos;
        } else {
          try {
            localStorage.setItem('nitte_saved_category_videos', JSON.stringify(catVideos));
          } catch (e) { }
        }

        // Preserve and sync students with passwords intact
        let mergedStudents = structureAndDeduplicateStudents([
          ...(prev.users?.students || []),
          ...((data.users && data.users.students) ? data.users.students : [])
        ]);
        try {
          const cachedStudents = localStorage.getItem('nitte_saved_students');
          if (cachedStudents) {
            const parsed = JSON.parse(cachedStudents);
            if (Array.isArray(parsed) && parsed.length > 0) {
              mergedStudents = structureAndDeduplicateStudents([
                ...mergedStudents,
                ...parsed
              ]);
            }
          }
          localStorage.setItem('nitte_saved_students', JSON.stringify(mergedStudents));
        } catch (e) { }

        // Preserve and sync mentors with passwords intact
        let mergedMentors = structureAndDeduplicateMentors([
          ...(prev.users?.mentors || []),
          ...((data.users && data.users.mentors) ? data.users.mentors : [])
        ]);
        try {
          const cachedMentors = localStorage.getItem('nitte_saved_mentors');
          if (cachedMentors) {
            const parsed = JSON.parse(cachedMentors);
            if (Array.isArray(parsed) && parsed.length > 0) {
              mergedMentors = structureAndDeduplicateMentors([
                ...mergedMentors,
                ...parsed
              ]);
            }
          }
          localStorage.setItem('nitte_saved_mentors', JSON.stringify(mergedMentors));
        } catch (e) { }

        // Save server issues into local storage cache, preserving local feedback & shiftedToLocalStorage status
        if (data.issues && data.issues.length) {
          try {
            const savedIssuesStr = localStorage.getItem('nitte_saved_issues');
            let mergedIssues = data.issues;
            if (savedIssuesStr) {
              const savedIssues = JSON.parse(savedIssuesStr);
              if (Array.isArray(savedIssues)) {
                mergedIssues = data.issues.map(di => {
                  const savedMatch = savedIssues.find(si => (si.id || si.issue_id)?.toUpperCase() === (di.id || di.issue_id)?.toUpperCase());
                  if (savedMatch) {
                    const isLocallyEscalated = savedMatch.status === 'Escalated' || savedMatch.status === 'Re-escalated' || Boolean(savedMatch.isReEscalated);
                    const isLocallyResolved = savedMatch.status === 'Resolved' || savedMatch.status === 'Closed';
                    const isLocallyMeetingStarted = savedMatch.status === 'Meeting Started';
                    const isLocallyMeetingScheduled = savedMatch.status === 'Meeting Scheduled';
                    const resolvedStatus = isLocallyResolved ? 'Resolved' : (
                      isLocallyEscalated ? (savedMatch.status === 'Re-escalated' ? 'Re-escalated' : 'Escalated') : (
                        isLocallyMeetingStarted ? 'Meeting Started' : (
                          isLocallyMeetingScheduled ? 'Meeting Scheduled' : di.status
                        )
                      )
                    );
                    return {
                      ...di,
                      status: resolvedStatus,
                      escalationReason: savedMatch.escalationReason || di.escalationReason,
                      escalatedAt: savedMatch.escalatedAt || di.escalatedAt,
                      escalatedBy: savedMatch.escalatedBy || di.escalatedBy,
                      isReEscalated: savedMatch.isReEscalated || di.isReEscalated,
                      reEscalatedCount: savedMatch.reEscalatedCount || di.reEscalatedCount,
                      resolvedAt: savedMatch.resolvedAt || di.resolvedAt,
                      resolutionNotes: savedMatch.resolutionNotes || di.resolutionNotes,
                      logs: (savedMatch.logs && savedMatch.logs.length > (di.logs || []).length) ? savedMatch.logs : (di.logs || []),
                      feedback: savedMatch.feedback || di.feedback,
                      feedbackRating: savedMatch.feedbackRating || di.feedbackRating,
                      feedbackComments: savedMatch.feedbackComments || di.feedbackComments,
                      rating: savedMatch.rating || di.rating,
                      shiftedToLocalStorage: savedMatch.shiftedToLocalStorage || di.shiftedToLocalStorage,
                      shiftedAt: savedMatch.shiftedAt || di.shiftedAt
                    };
                  }
                  return di;
                });

                // Also preserve offline created issues not present in backend
                const serverIdSet = new Set((data.issues || []).map(di => (di.id || di.issue_id)?.toUpperCase()));
                const offlineIssues = savedIssues.filter(si => !serverIdSet.has((si.id || si.issue_id)?.toUpperCase()));
                if (offlineIssues.length > 0) {
                  mergedIssues = [...mergedIssues, ...offlineIssues];
                }
              }
            }
            localStorage.setItem('nitte_saved_issues', JSON.stringify(mergedIssues));
            data.issues = mergedIssues;
          } catch (e) { }
        }

        // Save server meetings into local storage cache
        if (data.meetings && data.meetings.length) {
          try {
            localStorage.setItem('nitte_saved_meetings', JSON.stringify(data.meetings));
          } catch (e) { }
        }

        // Save mentor feedbacks into local storage cache
        let currentFeedbacks = (data.mentorFeedbacks && data.mentorFeedbacks.length) ? data.mentorFeedbacks : (prev.mentorFeedbacks || []);
        if (!currentFeedbacks || !currentFeedbacks.length) {
          try {
            const savedMf = localStorage.getItem('nitte_saved_mentor_feedbacks');
            if (savedMf) currentFeedbacks = JSON.parse(savedMf);
          } catch (e) { }
        }
        if (!currentFeedbacks || !currentFeedbacks.length) {
          currentFeedbacks = MOCK_DB.mentorFeedbacks;
        } else {
          try {
            localStorage.setItem('nitte_saved_mentor_feedbacks', JSON.stringify(currentFeedbacks));
          } catch (e) { }
        }

        return {
          ...data,
          users: {
            ...data.users,
            students: mergedStudents,
            mentors: mergedMentors,
            ros: (data.users && data.users.ros) ? data.users.ros : prev.users.ros
          },
          recordings: recs || [],
          categoryVideos: catVideos,
          mentorFeedbacks: currentFeedbacks
        };
      });
      setIsPgConnected(true);
      setError(null);
    } catch (err) {
      console.warn('PostgreSQL backend server offline or connecting, running in local state mode.');
      setIsPgConnected(false);
      setDb(prev => {
        let recs = prev.recordings || [];
        if (!recs.length) {
          try {
            const saved = localStorage.getItem('nitte_saved_recordings');
            if (saved) recs = JSON.parse(saved);
          } catch (e) { }
        }

        let catVideos = prev.categoryVideos || [];
        if (!catVideos || !catVideos.length) {
          try {
            const savedVideos = localStorage.getItem('nitte_saved_category_videos');
            if (savedVideos) catVideos = JSON.parse(savedVideos);
          } catch (e) { }
        }
        if (!catVideos || !catVideos.length) {
          catVideos = MOCK_DB.categoryVideos;
        }

        let currentIssues = (prev.issues && prev.issues.length) ? prev.issues : [];
        try {
          const saved = localStorage.getItem('nitte_saved_issues');
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const savedMap = new Map(parsed.map(si => [(si.id || si.issue_id)?.toUpperCase(), si]));
              currentIssues = (currentIssues.length > 0 ? currentIssues : parsed).map(ci => {
                const key = (ci.id || ci.issue_id)?.toUpperCase();
                return savedMap.has(key) ? { ...ci, ...savedMap.get(key) } : ci;
              });
              parsed.forEach(si => {
                const key = (si.id || si.issue_id)?.toUpperCase();
                if (!currentIssues.some(ci => (ci.id || ci.issue_id)?.toUpperCase() === key)) {
                  currentIssues.push(si);
                }
              });
            }
          }
        } catch (e) { }
        if (!currentIssues.length) {
          currentIssues = MOCK_DB.issues;
        }

        let currentFeedbacks = (prev.mentorFeedbacks && prev.mentorFeedbacks.length) ? prev.mentorFeedbacks : [];
        if (!currentFeedbacks.length) {
          try {
            const savedMf = localStorage.getItem('nitte_saved_mentor_feedbacks');
            if (savedMf) {
              const parsedMf = JSON.parse(savedMf);
              if (Array.isArray(parsedMf) && parsedMf.length > 0) currentFeedbacks = parsedMf;
            }
          } catch (e) { }
        }
        if (!currentFeedbacks.length) {
          currentFeedbacks = MOCK_DB.mentorFeedbacks;
        }

        let currentMeetings = (prev.meetings && prev.meetings.length) ? prev.meetings : [];
        try {
          const savedMeetings = localStorage.getItem('nitte_saved_meetings');
          if (savedMeetings) {
            const parsed = JSON.parse(savedMeetings);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const savedMap = new Map(parsed.map(m => [String(m.id || m.issueId || m.issue_id).toUpperCase(), m]));
              if (currentMeetings.length > 0) {
                currentMeetings = currentMeetings.map(m => {
                  const key = String(m.id || m.issueId || m.issue_id).toUpperCase();
                  return savedMap.has(key) ? { ...m, ...savedMap.get(key) } : m;
                });
                parsed.forEach(sm => {
                  const key = String(sm.id || sm.issueId || sm.issue_id).toUpperCase();
                  if (!currentMeetings.some(cm => String(cm.id || cm.issueId || cm.issue_id).toUpperCase() === key)) {
                    currentMeetings.push(sm);
                  }
                });
              } else {
                currentMeetings = parsed;
              }
            }
          }
        } catch (e) { }
        if (!currentMeetings.length) {
          currentMeetings = MOCK_DB.meetings;
        }

        // Auto-ensure: if any active issue has status 'Meeting Scheduled', ensure a meeting exists
        (currentIssues || []).forEach(iss => {
          if (iss.status === 'Meeting Scheduled') {
            const hasMeet = currentMeetings.some(m => (m.issueId || m.issue_id)?.toUpperCase() === (iss.id || iss.issue_id)?.toUpperCase());
            if (!hasMeet) {
              currentMeetings.push({
                id: `MEET-${iss.id}`,
                issueId: iss.id,
                issue_id: iss.id,
                studentId: iss.studentId,
                student_id: iss.studentId,
                studentName: iss.studentName,
                student_name: iss.studentName,
                roId: iss.roId || 'RO-01',
                ro_id: iss.roId || 'RO-01',
                date: new Date().toISOString().split('T')[0],
                time: '11:00',
                mode: 'Online',
                location: 'In-App Online Video Call Portal',
                notes: 'Scheduled meeting session with Relationship Officer.',
                status: 'Confirmed',
                endedByRo: false
              });
            }
          }
        });

        // Auto-cleanup: if meeting's ticket is Resolved or already ended, mark as Completed so it doesn't linger
        currentMeetings = currentMeetings.map(m => {
          const parentIss = (currentIssues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === (m.issueId || m.issue_id)?.toUpperCase());
          if (parentIss && (parentIss.status === 'Resolved' || parentIss.status === 'Closed')) {
            return { ...m, status: 'Completed', endedByRo: true };
          }
          return m;
        });

        let currentSchedules = prev.mentoringSchedules || null;
        if (!currentSchedules) {
          try {
            const savedSched = localStorage.getItem('nitte_saved_mentor_schedules');
            if (savedSched) {
              currentSchedules = JSON.parse(savedSched);
            }
          } catch (e) { }
        }
        if (!currentSchedules) {
          currentSchedules = MOCK_DB.mentoringSchedules;
        }

        let currentStudents = (prev.users?.students && prev.users.students.length) ? prev.users.students : [];
        try {
          const savedStudents = localStorage.getItem('nitte_saved_students');
          if (savedStudents) {
            const parsed = JSON.parse(savedStudents);
            if (Array.isArray(parsed) && parsed.length > 0) {
              currentStudents = structureAndDeduplicateStudents(parsed);
            }
          }
        } catch (e) { }

        let currentMentors = (prev.users?.mentors && prev.users.mentors.length) ? prev.users.mentors : [];
        try {
          const savedMentors = localStorage.getItem('nitte_saved_mentors');
          if (savedMentors) {
            const parsed = JSON.parse(savedMentors);
            if (Array.isArray(parsed) && parsed.length > 0) {
              currentMentors = structureAndDeduplicateMentors(parsed);
            }
          }
        } catch (e) { }
        if (!currentMentors || currentMentors.length === 0) {
          currentMentors = DEFAULT_FACULTY_MENTORS;
        }

        return {
          ...prev,
          users: {
            ...prev.users,
            students: currentStudents,
            mentors: currentMentors,
            ros: (prev.users && prev.users.ros) ? prev.users.ros : MOCK_DB.users.ros
          },
          issues: currentIssues,
          meetings: currentMeetings,
          mentorFeedbacks: currentFeedbacks,
          mentoringSchedules: currentSchedules,
          recordings: recs,
          categoryVideos: catVideos
        };
      });
      setError(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDbState();
    const pollInterval = setInterval(() => {
      fetchDbState();
    }, 3000);

    let bc;
    let videoBc;
    let feedbackBc;
    let stateBc;
    const handleStorageChange = (e) => {
      if (e.key === 'nitte_saved_meetings' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setDb(prev => ({ ...prev, meetings: parsed }));
          }
        } catch (err) { }
      }
      if (e.key === 'nitte_saved_issues' && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (Array.isArray(parsed)) {
            setDb(prev => ({ ...prev, issues: parsed }));
          }
        } catch (err) { }
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
    }

    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        bc = new BroadcastChannel('nitte_meeting_sync');
        bc.onmessage = (event) => {
          if (event.data && event.data.type === 'meeting_status') {
            const { meetId, status, updatedMeetings } = event.data;
            const targetId = String(meetId || '').trim().toUpperCase();
            setDb(prev => {
              let updated;
              if (Array.isArray(updatedMeetings) && updatedMeetings.length > 0) {
                updated = updatedMeetings;
              } else {
                let found = false;
                updated = (prev.meetings || []).map(m => {
                  const matches = (
                    (m.id && String(m.id).toUpperCase() === targetId) ||
                    (m.issueId && String(m.issueId).toUpperCase() === targetId) ||
                    (m.issue_id && String(m.issue_id).toUpperCase() === targetId)
                  );
                  if (matches) {
                    found = true;
                    return {
                      ...m,
                      status,
                      ...(status === 'Started' ? { endedByRo: false, endedAt: null, startedAt: new Date().toISOString() } : {}),
                      ...(status === 'Completed' || status === 'Finished' ? { endedByRo: true, endedAt: new Date().toISOString() } : {})
                    };
                  }
                  return m;
                });
                if (!found && status === 'Started') {
                  const parentIss = (prev.issues || []).find(i =>
                    (i.id && String(i.id).toUpperCase() === targetId) ||
                    (i.issue_id && String(i.issue_id).toUpperCase() === targetId)
                  );
                  if (parentIss) {
                    updated.push({
                      id: `MEET-${parentIss.id || Date.now()}`,
                      issueId: parentIss.id,
                      issue_id: parentIss.id,
                      studentId: parentIss.studentId,
                      student_id: parentIss.studentId,
                      studentName: parentIss.studentName,
                      student_name: parentIss.studentName,
                      roId: parentIss.roId || 'RO-01',
                      ro_id: parentIss.roId || 'RO-01',
                      date: new Date().toISOString().split('T')[0],
                      time: '11:00',
                      mode: 'Online',
                      location: 'In-App Online Video Call Portal',
                      status,
                      endedByRo: false,
                      startedAt: new Date().toISOString(),
                      endedAt: null
                    });
                  }
                }
              }
              // Synchronize matching issue status safely across tabs
              const updatedIssues = (event.data.updatedIssues && Array.isArray(event.data.updatedIssues))
                ? event.data.updatedIssues
                : (prev.issues || []).map(i => {
                    const iId = String(i.id || i.issue_id || '').toUpperCase();
                    const isTarget = iId === targetId;
                    if (!isTarget) return i;
                    if (i.status === 'Resolved' || i.status === 'Closed' || i.status === 'Escalated' || i.status === 'Re-escalated') {
                      return i;
                    }
                    if (status === 'Started') {
                      return { ...i, status: 'Meeting Started', meetingStartedAt: new Date().toISOString() };
                    } else if (status === 'Completed' || status === 'Finished') {
                      return { ...i, status: i.status === 'Meeting Started' ? 'In-Progress' : i.status, meetingCompletedAt: new Date().toISOString() };
                    } else if (status === 'Cancelled') {
                      return { ...i, status: i.status === 'Meeting Scheduled' ? 'In-Progress' : i.status };
                    }
                    return i;
                  });

              try {
                localStorage.setItem('nitte_saved_meetings', JSON.stringify(updated));
                localStorage.setItem('nitte_saved_issues', JSON.stringify(updatedIssues));
              } catch (e) { }
              return {
                ...prev,
                meetings: updated,
                issues: updatedIssues
              };
            });
          } else if (event.data && event.data.type === 'meeting_scheduled') {
            const { meeting, issueId, log } = event.data;
            setDb(prev => {
              const updatedMeetings = [...(prev.meetings || []).filter(m => (m.issueId || m.issue_id)?.toUpperCase() !== issueId?.toUpperCase()), meeting];
              const updatedIssues = (prev.issues || []).map(i => (i.id || i.issue_id)?.toUpperCase() === issueId?.toUpperCase() ? {
                ...i,
                status: (i.status === 'Resolved' || i.status === 'Closed' || i.status === 'Escalated' || i.status === 'Re-escalated') ? i.status : 'Meeting Scheduled',
                logs: log ? [...(i.logs || []), log] : (i.logs || [])
              } : i);
              try {
                localStorage.setItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
                localStorage.setItem('nitte_saved_issues', JSON.stringify(updatedIssues));
              } catch (e) { }
              return {
                ...prev,
                meetings: updatedMeetings,
                issues: updatedIssues
              };
            });
          }
        };

        // Real-time zero-latency sync for RO guidance videos across tabs
        videoBc = new BroadcastChannel('nitte_video_sync');
        videoBc.onmessage = (event) => {
          if (event.data && event.data.type === 'category_video_updated' && event.data.entry) {
            const entry = event.data.entry;
            setDb(prev => {
              const existing = (prev.categoryVideos || []).filter(
                v => v.category?.toLowerCase()?.trim() !== entry.category?.toLowerCase()?.trim()
              );
              const merged = [entry, ...existing];
              try {
                localStorage.setItem('nitte_saved_category_videos', JSON.stringify(merged));
              } catch (e) { }
              return {
                ...prev,
                categoryVideos: merged
              };
            });
          }
        };

        // Real-time zero-latency sync for student feedback across tabs
        feedbackBc = new BroadcastChannel('nitte_feedback_sync');
        feedbackBc.onmessage = (event) => {
          if (event.data && event.data.type === 'feedback_submitted') {
            const { issueId, feedback, shiftedToLocalStorage } = event.data;
            setDb(prev => {
              const updated = (prev.issues || []).map(i =>
                (i.id === issueId || i.issue_id === issueId || (i.id && issueId && i.id.toUpperCase() === issueId.toUpperCase()))
                  ? {
                    ...i,
                    feedback,
                    feedbackRating: feedback.rating,
                    rating: feedback.rating,
                    feedbackComments: feedback.comments,
                    shiftedToLocalStorage: true,
                    shiftedAt: new Date().toISOString()
                  }
                  : i
              );
              try {
                localStorage.setItem('nitte_saved_issues', JSON.stringify(updated));
              } catch (e) { }
              return {
                ...prev,
                issues: updated
              };
            });
          }
        };

        // Real-time zero-latency sync for escalated / re-escalated tickets across tabs
        stateBc = new BroadcastChannel('nitte_state_sync');
        stateBc.onmessage = (event) => {
          if (event.data && (event.data.type === 'issue_escalated' || event.data.type === 'issue_re_escalated')) {
            const { issueId, roId, reason, isReEscalated, timestamp } = event.data;
            const cleanId = String(issueId || '').trim().toUpperCase();
            setDb(prev => {
              const updated = (prev.issues || []).map(i => {
                if ((i.id || i.issue_id)?.toUpperCase() === cleanId) {
                  const logMsg = isReEscalated
                    ? `Issue RE-ESCALATED / Urgency Remarks Updated to Admin by RO ${roId}. Remarks: ${reason}`
                    : `Issue ESCALATED to Admin by RO ${roId}. Reason: ${reason}`;
                  return {
                    ...i,
                    status: isReEscalated ? 'Re-escalated' : 'Escalated',
                    escalatedAt: timestamp || new Date().toISOString(),
                    escalatedBy: roId,
                    escalationReason: reason,
                    isReEscalated: Boolean(isReEscalated),
                    reEscalatedCount: (Number(i.reEscalatedCount) || 0) + (isReEscalated ? 1 : 0),
                    logs: [...(i.logs || []), { time: new Date().toLocaleString(), text: logMsg }]
                  };
                }
                return i;
              });
              try {
                localStorage.setItem('nitte_saved_issues', JSON.stringify(updated));
              } catch (e) { }
              return { ...prev, issues: updated };
            });
          }
        };
      }
    } catch (e) { }

    return () => {
      clearInterval(pollInterval);
      if (bc) bc.close();
      if (videoBc) videoBc.close();
      if (feedbackBc) feedbackBc.close();
      if (stateBc) stateBc.close();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageChange);
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('curr_user_role', currentUser);
  }, [currentUser]);

  const isDemoLimitBypassed = true;
  const toggleDemoLimitBypass = () => { };

  // Local issue creator for offline / client fallback mode
  const createLocalIssue = (studentId, studentName, category, description, priority) => {
    const catIdx = ALL_CATEGORIES.indexOf(category);
    const roId = catIdx !== -1 ? `RO-${String(catIdx + 1).padStart(2, '0')}` : 'RO-01';
    const ro = (db.users?.ros || []).find(r => r.id === roId);

    // Check total attempts in this category for this student
    const prevCatIssues = (db.issues || []).filter(i =>
      (i.studentId === studentId || i.student_id === studentId) &&
      (i.category === category || i.roId === roId || i.ro_id === roId)
    );
    let totalAttempts = prevCatIssues.length;
    prevCatIssues.forEach(iss => {
      const lArr = Array.isArray(iss.logs) ? iss.logs : [];
      const reopens = lArr.filter(l => l.text && l.text.toLowerCase().includes('re-opened')).length;
      totalAttempts += reopens;
    });

    const isThirdAttempt = totalAttempts >= 2;
    const initialStatus = isThirdAttempt ? 'Escalated' : 'Assigned to RO';
    const initialLogText = isThirdAttempt
      ? `[AUTO-ESCALATED TO ADMIN] 3rd issue attempt reached for category ${category}. Automatically escalated directly to Admin Office for priority resolution.`
      : `Ticket raised by ${studentName} (Attempt #${totalAttempts + 1} for ${category}).`;

    const newIssue = {
      id: `TICK-${Math.floor(1000 + Math.random() * 9000)}`,
      studentId,
      studentName,
      category,
      description,
      priority,
      status: initialStatus,
      roId,
      roName: ro ? ro.name : (catIdx !== -1 ? `RO - ${category.split(' - ')[1] || 'Officer'}` : 'RO Officer'),
      createdAt: new Date().toISOString(),
      logs: [{ time: new Date().toLocaleString(), text: initialLogText }]
    };

    setDb(prev => {
      const updatedIssues = [newIssue, ...(prev.issues || [])];
      try {
        localStorage.setItem('nitte_saved_issues', JSON.stringify(updatedIssues));
      } catch (e) { }
      return { ...prev, issues: updatedIssues };
    });

    // Automated Real Gmail Notification Dispatch
    try {
      // 1. Alert Email to Relationship Officer (skandhayashu2906@gmail.com)
      fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'skandhayashu2906@gmail.com',
          subject: `[${newIssue.id}] New Student Issue Registered: ${category}`,
          html: `<h3>New Student Grievance Registered</h3><p><strong>Student:</strong> ${studentName} (${studentId})</p><p><strong>Category:</strong> ${category}</p><p><strong>Priority:</strong> ${priority}</p><p><strong>Description:</strong> ${description}</p><p>Assigned to: ${newIssue.roName}</p>`,
          text: `New issue registered: ${newIssue.id} by ${studentName} (${studentId}) in category ${category}: ${description}`,
          issueId: newIssue.id,
          eventType: 'ISSUE_SUBMITTED'
        })
      }).catch(() => { });

      // 2. Confirmation Email to Student (skandhayashas2906@gmail.com)
      fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'skandhayashas2906@gmail.com',
          subject: `[${newIssue.id}] Ticket Confirmation: Issue Logged`,
          html: `<h3>NITTE Mentorship Grievance Confirmation</h3><p>Dear ${studentName},</p><p>Your issue has been logged under ticket ID <strong>${newIssue.id}</strong>.</p><p><strong>Category:</strong> ${category}</p><p><strong>Assigned Officer:</strong> ${newIssue.roName}</p><p>You will receive updates and meeting notices as your Relationship Officer reviews this request.</p>`,
          text: `Your ticket ${newIssue.id} for ${category} has been logged and assigned to ${newIssue.roName}.`,
          issueId: newIssue.id,
          eventType: 'ISSUE_SUBMITTED'
        })
      }).catch(() => { });
    } catch (e) { }

    return newIssue.id;
  };

  // ISSUE SUBMISSION (Supports 2 Issues / Week Limit & Demo Mode Bypass)
  const submitIssue = async (studentId, category, description, priority) => {
    const student = (db.users?.students || []).find(s => s.id === studentId) || { name: 'Student' };

    // If backend is offline or connecting, immediately create local issue
    if (!isPgConnected) {
      return createLocalIssue(studentId, student.name, category, description, priority);
    }

    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, studentName: student.name, category, description, priority, bypassLimit: isDemoLimitBypassed })
      });

      if (res.ok) {
        const data = await res.json();
        try {
          await fetchDbState();
        } catch (e) {
          console.warn('Could not refresh DB state after issue creation:', e);
        }
        return data.id;
      }

      // If server returned 400 (validation/business rule error like rate limit)
      if (res.status === 400) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to submit issue');
      }

      // If server returned 5xx (proxy error, timeout, crash), fallback to local creation
      console.warn('Server error status', res.status, 'falling back to local issue creation');
      return createLocalIssue(studentId, student.name, category, description, priority);
    } catch (networkErr) {
      // If it was an intentional Error thrown above for 400, rethrow
      if (networkErr.message && !networkErr.message.includes('fetch') && !networkErr.message.includes('Failed to submit')) {
        throw networkErr;
      }
      // Otherwise network/proxy failed, use local creation
      return createLocalIssue(studentId, student.name, category, description, priority);
    }
  };

  const scheduleRoMeeting = async (issueId, studentId, roId, date, time, mode, location, notes, discussionMinutes, actionItems, reassignFeedback) => {
    const issue = (db.issues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === issueId?.toUpperCase()) || {};

    // 🔒 LOCKDOWN GUARD 1: Resolved tickets cannot have meetings scheduled or modified
    if (issue.status === 'Resolved' || issue.status === 'Closed') {
      alert('🔒 Locked Ticket: This grievance is already marked as Resolved. Meetings cannot be scheduled or reassigned.');
      throw new Error('Ticket is already Resolved.');
    }

    // 🔒 LOCKDOWN GUARD 2: Escalated tickets belong to Administration
    if (issue.status === 'Escalated' || issue.status === 'Re-escalated' || Boolean(issue.isReEscalated)) {
      alert('🔒 Locked Ticket: This grievance is currently escalated to Administration. Relationship Officers cannot modify meetings for escalated tickets.');
      throw new Error('Ticket is under Administrative oversight.');
    }

    const validStudentId = studentId || issue.studentId || issue.student_id;
    const student = (db.users?.students || []).find(s => (s.id || s.student_id)?.toUpperCase() === validStudentId?.toUpperCase());
    const studentName = issue.studentName || issue.student_name || (student ? student.name : 'Student');
    const existingMeet = (db.meetings || []).find(m => (m.issueId || m.issue_id)?.toUpperCase() === issueId?.toUpperCase());

    const isReschedule = Boolean(
      existingMeet ||
      issue.status === 'Meeting Scheduled' ||
      issue.status === 'Meeting Started' ||
      issue.status === 'In-Progress' ||
      issue.status === 'In Progress'
    );

    const getLogText = (l) => {
      if (!l) return '';
      if (typeof l === 'string') {
        if (l.trim().startsWith('{') && l.includes('"text"')) {
          try { const p = JSON.parse(l); if (p && p.text) return String(p.text); } catch (e) { }
        }
        return l;
      }
      if (typeof l === 'object' && l.text) return String(l.text);
      return String(l);
    };

    const reassignLogs = (issue.logs || []).filter(l => {
      const txt = getLogText(l).toLowerCase();
      return (txt.includes('rescheduled') || txt.includes('reassigned') || txt.includes('re-assigned')) && !txt.includes('reassigned to');
    }).concat(
      (existingMeet?.logs || []).filter(l => {
        const txt = getLogText(l).toLowerCase();
        return txt.includes('meeting scheduled') || txt.includes('meeting rescheduled') || txt.includes('meeting reassigned');
      })
    );

    if (isReschedule && reassignLogs.length >= 2) {
      alert('🔒 RO Limit Reached: A Relationship Officer can only reschedule/reassign a meeting twice per issue (2/2 Used). Escalate to Admin for further changes.');
      throw new Error('RO Limit Reached: Maximum 2 meeting reassignments allowed per issue.');
    }

    const meetingLocation = location || (mode === 'Online' ? 'In-App Online Video Call Portal' : 'RO Office Desk 1 (Admin Block)');
    const cleanMinutes = mode === 'Online' ? (discussionMinutes || '').trim() : '';
    const cleanActions = (actionItems || '').trim();
    const cleanFeedback = (reassignFeedback || (mode === 'Offline' ? discussionMinutes : '') || '').trim();

    const finalNotes = cleanFeedback
      ? (notes ? `${notes} | [Feedback / Switch Reason]: ${cleanFeedback}` : `[Feedback / Switch Reason]: ${cleanFeedback}`)
      : (notes || '');

    const newMeeting = {
      id: existingMeet ? existingMeet.id : `MEET-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      issueId,
      issue_id: issueId,
      studentId: validStudentId,
      student_id: validStudentId,
      studentName,
      student_name: studentName,
      roId,
      ro_id: roId,
      date,
      time,
      mode: mode || 'Offline',
      location: meetingLocation,
      notes: finalNotes,
      discussionSummary: mode === 'Online' ? (cleanMinutes || (existingMeet?.mode === 'Online' ? existingMeet.discussionSummary : '')) : '',
      actionItems: cleanActions || (existingMeet ? existingMeet.actionItems : ''),
      status: 'Confirmed',
      endedByRo: false,
      endedAt: null
    };
    const timestamp = new Date().toLocaleString();
    let logMsg = isReschedule
      ? `Meeting rescheduled / reassigned by RO (${mode || 'Offline'}) for ${date} at ${time} (${meetingLocation}).`
      : `Meeting scheduled by RO (${mode || 'Offline'}) for ${date} at ${time} (${meetingLocation}).`;

    if (cleanFeedback) {
      logMsg += ` | [REASSIGN FEEDBACK]: "${cleanFeedback}"`;
    } else if (cleanMinutes) {
      logMsg += ` | [LOGGED DISCUSSION MINUTES]: "${cleanMinutes}"`;
    }

    // 1. Instantly update local React state and localStorage so Student & RO Dashboards update immediately
    setDb(prev => {
      const updatedMeetings = [...(prev.meetings || []).filter(m => (m.issueId || m.issue_id)?.toUpperCase() !== issueId?.toUpperCase()), newMeeting];
      const updatedIssues = (prev.issues || []).map(i => (i.id || i.issue_id)?.toUpperCase() === issueId?.toUpperCase() ? {
        ...i,
        status: 'Meeting Scheduled',
        logs: [...(i.logs || []), { time: timestamp, text: logMsg }]
      } : i);

      try {
        localStorage.setItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
        localStorage.setItem('nitte_saved_issues', JSON.stringify(updatedIssues));
      } catch (e) { }

      return {
        ...prev,
        meetings: updatedMeetings,
        issues: updatedIssues
      };
    });

    // Broadcast across open tabs for zero-latency sync between RO & Student tabs
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        const bc = new BroadcastChannel('nitte_meeting_sync');
        bc.postMessage({
          type: 'meeting_scheduled',
          meeting: newMeeting,
          issueId,
          log: { time: timestamp, text: logMsg }
        });
        bc.close();
      }
    } catch (e) { }

    // RO details resolution
    const roObj = (db.users?.ros || []).find(r =>
      (r.id || r.ro_id)?.toUpperCase() === String(roId || '').toUpperCase() ||
      (r.username || '')?.toUpperCase() === String(roId || '').toUpperCase() ||
      (r.email || '')?.toUpperCase() === String(roId || '').toUpperCase()
    );
    const roName = roObj?.name || (roId ? `Officer ${roId}` : 'Relationship Officer');
    const roEmail = roObj?.email || 'skandhayashu2906@gmail.com';
    const roJurisdiction = roObj?.region || roObj?.jurisdiction || roObj?.department || '';

    // Student registered email resolution
    const resolvedStudentEmail = (
      student?.email ||
      student?.gmail ||
      issue?.studentEmail ||
      issue?.student_email ||
      issue?.email ||
      'skandhayashas2906@gmail.com'
    ).trim();

    // Ensure delivery to both registered student email and primary developer test inbox
    const recipientEmails = Array.from(new Set([
      resolvedStudentEmail,
      'skandhayashas2906@gmail.com'
    ].filter(Boolean))).join(', ');

    const portalBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    const meetingNoticeSubject = `[${issueId}] Official Meeting ${isReschedule ? 'Rescheduled' : 'Scheduled'} Notice - ${roName} (${date} at ${time})`;

    const emailHtml = generateRoMeetingScheduledEmailHtml({
      studentName,
      studentId: validStudentId,
      studentEmail: resolvedStudentEmail,
      issueId,
      category: issue.category || 'General Grievance',
      priority: issue.priority || 'Medium',
      description: issue.description || '',
      roName,
      roId,
      roEmail,
      roJurisdiction,
      date,
      time,
      mode: mode || 'Offline',
      location: meetingLocation,
      notes: finalNotes,
      feedback: cleanFeedback,
      agenda: cleanMinutes,
      isReschedule,
      portalBaseUrl
    });

    const emailText = generateRoMeetingScheduledEmailText({
      studentName,
      studentId: validStudentId,
      issueId,
      category: issue.category || 'General Grievance',
      priority: issue.priority || 'Medium',
      roName,
      roId,
      date,
      time,
      mode: mode || 'Offline',
      location: meetingLocation,
      notes: finalNotes,
      feedback: cleanFeedback,
      agenda: cleanMinutes,
      isReschedule,
      portalBaseUrl
    });

    // Automated Real Gmail Meeting Notice Dispatch
    try {
      const emailRes = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmails,
          replyTo: roEmail,
          fromName: `${roName} (NITTE Grievance Cell)`,
          subject: meetingNoticeSubject,
          html: emailHtml,
          text: emailText,
          issueId,
          eventType: isReschedule ? 'MEETING_RESCHEDULED' : 'MEETING_SCHEDULED',
          recipientName: studentName
        })
      });
      const emailResult = await emailRes.json().catch(() => ({}));
      console.log('[Gmail System] Meeting notice dispatched:', emailResult);

      setDb(prev => ({
        ...prev,
        gmailLogs: [
          {
            id: `LOG-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
            direction: 'OUTBOUND',
            sender: 'skandhayashu2906@gmail.com',
            recipient: recipientEmails,
            subject: meetingNoticeSubject,
            body: emailText,
            event_type: isReschedule ? 'MEETING_RESCHEDULED' : 'MEETING_SCHEDULED',
            issue_id: issueId,
            status: emailResult?.success ? 'DELIVERED_GMAIL' : 'SENT',
            created_at: new Date().toISOString()
          },
          ...(prev.gmailLogs || [])
        ]
      }));
    } catch (dispatchErr) {
      console.error('[Gmail System] Failed to dispatch meeting scheduled email:', dispatchErr);
    }

    // 2. Also send request to backend API if active
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId,
          studentId: validStudentId,
          studentName,
          roId,
          date,
          time,
          mode: mode || 'Offline',
          location: meetingLocation,
          notes: finalNotes,
          discussionSummary: cleanMinutes || undefined,
          actionItems: cleanActions || undefined,
          reassignFeedback: cleanFeedback || undefined
        })
      });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.warn('Backend server offline/sync warning, relying on updated active state.', err);
    }
  };

  const submitFeedback = async (issueId, rating, comments) => {
    const numericRating = Number(rating);
    const feedbackObj = {
      rating: numericRating,
      comments: comments || '',
      submittedAt: new Date().toISOString()
    };

    // 1. Instantly update local state so rating shows immediately in Student & Admin Dashboards
    // and shift resolved issue to local storage archive
    let updatedIssuesList = [];
    setDb(prev => {
      const updatedIssues = (prev.issues || []).map(i => (i.id === issueId || i.issue_id === issueId || (i.id && issueId && i.id.toUpperCase() === issueId.toUpperCase())) ? {
        ...i,
        feedback: feedbackObj,
        feedbackRating: numericRating,
        feedbackComments: comments || '',
        rating: numericRating,
        shiftedToLocalStorage: true,
        shiftedAt: new Date().toISOString(),
        logs: [...(i.logs || []), {
          time: new Date().toLocaleString(),
          text: `Student submitted feedback rating: ${numericRating} Stars ("${comments || ''}"). Shifted to local storage archive.`
        }]
      } : i);

      updatedIssuesList = updatedIssues;
      try {
        localStorage.setItem('nitte_saved_issues', JSON.stringify(updatedIssues));
      } catch (e) { }

      return {
        ...prev,
        issues: updatedIssues
      };
    });

    // Broadcast across tabs so RO dashboard receives student feedback instantly
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        const feedbackBc = new BroadcastChannel('nitte_feedback_sync');
        feedbackBc.postMessage({
          type: 'feedback_submitted',
          issueId,
          feedback: feedbackObj,
          shiftedToLocalStorage: true
        });
        feedbackBc.close();
      }
    } catch (e) { }

    // 2. Also sync to backend API if server is online
    try {
      const res = await fetch(`/api/issues/${issueId}/feedback`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: numericRating, comments })
      });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.warn('Backend server offline/sync warning for submitFeedback, using active local state.', err);
    }
  };

  // MENTOR ACTIONS
  const addResource = async (mentorId, title, type, content) => {
    try {
      await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId, title, type, content })
      });
      await fetchDbState();
    } catch (err) {
      const newRes = { id: `RES-${Date.now()}`, mentorId, title, type, content };
      setDb(prev => ({ ...prev, resources: [...prev.resources, newRes] }));
    }
  };

  const addGroupSession = async (mentorId, title, dateTime, description, link) => {
    const mentor = db.users.mentors.find(m => m.id === mentorId);
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId, mentorName: mentor ? mentor.name : 'Mentor', title, dateTime, description, link })
      });
      await fetchDbState();
    } catch (err) {
      const newSess = { id: `GS-${Date.now()}`, mentorId, mentorName: mentor ? mentor.name : 'Mentor', title, dateTime, description, meetLink: link };
      setDb(prev => ({ ...prev, groupSessions: [...prev.groupSessions, newSess] }));
    }
  };

  const submitMentorSessionRecord = async (mentorId, topic, sessionDate, studentsAttended, notes, whichClass, location) => {
    const mentor = (db.users?.mentors || []).find(m => m.id === mentorId);
    const newRec = {
      id: `REC-${Date.now()}`,
      mentorId,
      mentorName: mentor ? mentor.name : mentorId,
      topic,
      sessionDate,
      studentsAttended: parseInt(studentsAttended) || 0,
      notes: notes || '',
      whichClass: whichClass || mentor?.class || '6th Sem CSE-A',
      location: location || 'Seminar Hall 1 (Admin Block)',
      createdAt: new Date().toISOString()
    };

    // 1. Instantly update local React state for immediate UI reflection in Mentor & Admin Dashboards
    setDb(prev => ({
      ...prev,
      mentorSessionRecords: [newRec, ...(prev.mentorSessionRecords || [])]
    }));

    // 2. Also sync to backend API
    try {
      const res = await fetch('/api/mentor/session-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId, topic, sessionDate, studentsAttended, notes, whichClass, location })
      });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.warn('Backend sync failed for session record, relying on updated local state.', err);
    }
  };

  // MENTOR MENTORING HOUR & 9:00 AM GMAIL ALERT
  const shootMentorGmailAlert = async (mentorId, customSchedule = null) => {
    const mentor = (db.users?.mentors || []).find(m => m.id === mentorId) || (db.users?.mentors || [])[0];
    if (!mentor) return false;

    const sched = customSchedule || (db.mentoringSchedules && db.mentoringSchedules[mentorId]) || {
      date: new Date().toISOString().split('T')[0],
      day: 'Friday',
      time: '09:00 AM',
      endTime: '10:00 AM',
      periodSlot: 'Period 1 (09:00 AM - 10:00 AM)',
      whichClass: mentor.class || '6th Sem CSE-A'
    };

    const mentorEmail = mentor.email || 'skandhayashu2906@gmail.com';
    const emailSubject = `[NITTE Mentorship Alert] Mentoring Hour Period Scheduled at 9:00 AM (${sched.date})`;
    const emailContent = `
OFFICIAL NITTE MENTORSHIP HOUR SCHEDULE NOTIFICATION

Dear ${mentor.name},

This is an automated institutional alert for your scheduled Mentoring Hour Period.

• Faculty Mentor: ${mentor.name} (${mentor.dept} Department)
• Assigned Class / Cohort: ${sched.whichClass || mentor.class}
• Scheduled Date: ${sched.date} (${sched.day || 'Scheduled Day'})
• Period / Time Slot: ${sched.periodSlot || sched.time}

Please ensure attendance of all assigned mentees is tracked. This mentoring record must be filed in compliance with NAAC & Academic Audit guidelines.

NITTE Mahalinga Adyanthaya Memorial Institute of Technology
Department of Student Welfare & Mentorship
    `.trim();

    // Directly dispatch email in background without opening any external Gmail window
    await sendCustomEmail({
      to: mentorEmail,
      subject: emailSubject,
      content: emailContent,
      issueId: `MENTOR-${mentor.id}`
    });

    // Update last email sent timestamp
    setDb(prev => {
      const updatedSchedules = {
        ...(prev.mentoringSchedules || {}),
        [mentorId]: {
          ...(prev.mentoringSchedules?.[mentorId] || sched),
          lastEmailSentAt: new Date().toISOString()
        }
      };
      try {
        localStorage.setItem('nitte_saved_mentor_schedules', JSON.stringify(updatedSchedules));
      } catch (e) { }
      return {
        ...prev,
        mentoringSchedules: updatedSchedules
      };
    });

    return true;
  };

  const updateMentorSchedule = async (mentorId, newScheduleData, shootEmailNow = true) => {
    setDb(prev => {
      const updatedSchedules = {
        ...(prev.mentoringSchedules || {}),
        [mentorId]: {
          ...(prev.mentoringSchedules?.[mentorId] || {}),
          ...newScheduleData,
          updatedAt: new Date().toISOString()
        }
      };
      try {
        localStorage.setItem('nitte_saved_mentor_schedules', JSON.stringify(updatedSchedules));
      } catch (e) { }
      return {
        ...prev,
        mentoringSchedules: updatedSchedules
      };
    });

    if (shootEmailNow) {
      await shootMentorGmailAlert(mentorId, newScheduleData);
    }
    return true;
  };

  // PASS / WAIVE MENTORING SESSION (e.g. Holiday, College Event, Exam Day)
  const passMentorSession = async (mentorId, sessionDate, reason, remarks = '') => {
    setDb(prev => {
      const sched = prev.mentoringSchedules?.[mentorId] || {};
      const existingPassed = sched.passedSessions || [];
      const filtered = existingPassed.filter(p => p.sessionDate !== sessionDate);
      const updatedPassed = [
        { sessionDate, reason: reason || 'Public Holiday / Not Conducted', remarks: remarks || '', passedAt: new Date().toISOString() },
        ...filtered
      ];
      const updatedSchedules = {
        ...(prev.mentoringSchedules || {}),
        [mentorId]: {
          ...sched,
          passedSessions: updatedPassed,
          isPassed: true,
          passReason: reason || 'Public Holiday / Not Conducted'
        }
      };
      try {
        localStorage.setItem('nitte_saved_mentor_schedules', JSON.stringify(updatedSchedules));
      } catch (e) { }
      return {
        ...prev,
        mentoringSchedules: updatedSchedules
      };
    });
    return true;
  };

  const unpassMentorSession = async (mentorId, sessionDate) => {
    setDb(prev => {
      const sched = prev.mentoringSchedules?.[mentorId] || {};
      const existingPassed = (sched.passedSessions || []).filter(p => p.sessionDate !== sessionDate);
      const updatedSchedules = {
        ...(prev.mentoringSchedules || {}),
        [mentorId]: {
          ...sched,
          passedSessions: existingPassed,
          isPassed: false,
          passReason: null
        }
      };
      try {
        localStorage.setItem('nitte_saved_mentor_schedules', JSON.stringify(updatedSchedules));
      } catch (e) { }
      return {
        ...prev,
        mentoringSchedules: updatedSchedules
      };
    });
    return true;
  };

  // SHOOT 9:00 AM NEXT-MORNING DEADLINE NOTICE IF SESSION REPORT NOT FILED
  const shootMentorDeadlineAlert = async (mentorId, sessionDate) => {
    const mentor = (db.users?.mentors || []).find(m => m.id === mentorId) || (db.users?.mentors || [])[0];
    if (!mentor) return false;

    const sched = (db.mentoringSchedules && db.mentoringSchedules[mentorId]) || {};
    const dateText = sessionDate || sched.date || new Date().toISOString().split('T')[0];

    // Check if session was marked as passed / holiday
    const isPassed = (sched.passedSessions || []).some(p => p.sessionDate === dateText) || sched.isPassed;
    if (isPassed) {
      console.log(`[Deadline Alert] Session on ${dateText} was marked as passed/holiday. Skipping deadline email.`);
      return false;
    }

    // Check if report was already filed
    const isSubmitted = (db.mentorSessionRecords || []).some(
      r => r.mentorId === mentorId && r.sessionDate === dateText
    );
    if (isSubmitted) {
      console.log(`[Deadline Alert] Session report for ${dateText} already filed. Skipping deadline email.`);
      return false;
    }

    const mentorEmail = mentor.email || 'skandhayashu2906@gmail.com';
    const emailSubject = `[URGENT: DEADLINE TODAY] Submit Pending Mentoring Session Feedback Report (${dateText})`;
    const emailContent = `
URGENT INSTITUTIONAL NOTICE: PENDING MENTORING SESSION REPORT

Dear ${mentor.name},

This is an automated 9:00 AM compliance notice from the NITTE Mentorship & Academic Audit Cell.

Our records indicate that the mentoring session report for your scheduled class session on ${dateText} (${sched.periodSlot || 'Period 1 (09:00 AM - 10:00 AM)'}) has not yet been submitted.

• Faculty Mentor: ${mentor.name} (${mentor.dept} Department)
• Assigned Class / Cohort: ${sched.whichClass || mentor.class}
• Scheduled Session Date: ${dateText}
• Report Status: PENDING SUBMISSION
• DEADLINE: TODAY BEFORE 5:00 PM

Institutional compliance requires all faculty mentors to document the weekly mentoring session and mentee attendance for NAAC and internal academic audit.

NOTE: If the session was NOT conducted due to a public holiday, institutional event, examination, or leave, please log in to your Mentor Portal and select "Pass Session (Holiday / Not Conducted)" to record the official waiver.

NITTE Mahalinga Adyanthaya Memorial Institute of Technology
Office of Student Welfare & Academic Mentorship
    `.trim();

    await sendCustomEmail({
      to: mentorEmail,
      subject: emailSubject,
      content: emailContent,
      issueId: `MENTOR-DEADLINE-${mentor.id}`
    });

    setDb(prev => {
      const updatedSchedules = {
        ...(prev.mentoringSchedules || {}),
        [mentorId]: {
          ...(prev.mentoringSchedules?.[mentorId] || {}),
          lastDeadlineEmailSentAt: new Date().toISOString()
        }
      };
      try {
        localStorage.setItem('nitte_saved_mentor_schedules', JSON.stringify(updatedSchedules));
      } catch (e) { }
      return {
        ...prev,
        mentoringSchedules: updatedSchedules
      };
    });

    return true;
  };

  // STUDENT MENTOR FEEDBACK
  const submitMentorFeedback = async (studentId, studentName, mentorId, mentorName, regularityRating, clarityRating, participationRating, difficulties) => {
    const newFeedback = {
      id: Date.now(),
      studentId,
      studentName,
      mentorId,
      mentorName,
      regularityRating,
      clarityRating,
      participationRating,
      difficulties: difficulties || '',
      createdAt: new Date().toISOString()
    };

    // 1. Instantly update local React state and cache
    setDb(prev => {
      const updated = [newFeedback, ...(prev.mentorFeedbacks || [])];
      try {
        localStorage.setItem('nitte_saved_mentor_feedbacks', JSON.stringify(updated));
      } catch (e) { }
      return {
        ...prev,
        mentorFeedbacks: updated
      };
    });

    // 2. Also sync to backend API
    try {
      const res = await fetch('/api/mentor-feedbacks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, studentName, mentorId, mentorName, regularityRating, clarityRating, participationRating, difficulties })
      });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.warn('Backend sync failed for mentor feedback, relying on updated local state.', err);
    }
  };

  // RO ACTIONS
  const updateMeetingStatus = async (meetId, status) => {
    // 1. Update local state immediately for instant UI feedback and save to localStorage
    let updatedMeetingsList = [];
    setDb(prev => {
      let found = false;
      const targetId = String(meetId || '').trim().toUpperCase();
      const updated = (prev.meetings || []).map(m => {
        const matches = (
          (m.id && String(m.id).toUpperCase() === targetId) ||
          (m.issueId && String(m.issueId).toUpperCase() === targetId) ||
          (m.issue_id && String(m.issue_id).toUpperCase() === targetId)
        );
        if (matches) {
          found = true;
          return {
            ...m,
            status,
            ...(status === 'Started' ? { endedByRo: false, endedAt: null, startedAt: new Date().toISOString() } : {}),
            ...(status === 'Completed' || status === 'Finished' ? { endedByRo: true, endedAt: new Date().toISOString() } : {})
          };
        }
        return m;
      });

      if (!found) {
        // If not found in existing meetings, find matching issue and register
        const parentIss = (prev.issues || []).find(i =>
          (i.id && String(i.id).toUpperCase() === targetId) ||
          (i.issue_id && String(i.issue_id).toUpperCase() === targetId)
        );
        if (parentIss) {
          const newMeet = {
            id: `MEET-${parentIss.id || Date.now()}`,
            issueId: parentIss.id,
            issue_id: parentIss.id,
            studentId: parentIss.studentId,
            student_id: parentIss.studentId,
            studentName: parentIss.studentName,
            student_name: parentIss.studentName,
            roId: parentIss.roId || 'RO-01',
            ro_id: parentIss.roId || 'RO-01',
            date: new Date().toISOString().split('T')[0],
            time: '11:00',
            mode: 'Online',
            location: 'In-App Online Video Call Portal',
            status,
            endedByRo: status === 'Completed' || status === 'Finished',
            startedAt: status === 'Started' ? new Date().toISOString() : undefined,
            endedAt: (status === 'Completed' || status === 'Finished') ? new Date().toISOString() : null
          };
          updated.push(newMeet);
        }
      }

      let matchedIssueId = null;
      if (found) {
        const matched = updated.find(m =>
          (m.id && String(m.id).toUpperCase() === targetId) ||
          (m.issueId && String(m.issueId).toUpperCase() === targetId) ||
          (m.issue_id && String(m.issue_id).toUpperCase() === targetId)
        );
        matchedIssueId = matched?.issueId || matched?.issue_id;
      }

      // Synchronize issue status safely with meeting lifecycle
      const updatedIssues = (prev.issues || []).map(i => {
        const iId = String(i.id || i.issue_id || '').toUpperCase();
        const isTarget = iId === targetId || (matchedIssueId && iId === String(matchedIssueId).toUpperCase());
        if (!isTarget) return i;

        // Terminal or Escalated tickets are locked against meeting status side-effects
        if (i.status === 'Resolved' || i.status === 'Closed' || i.status === 'Escalated' || i.status === 'Re-escalated') {
          return i;
        }

        if (status === 'Started') {
          return {
            ...i,
            status: 'Meeting Started',
            meetingStartedAt: new Date().toISOString()
          };
        } else if (status === 'Completed' || status === 'Finished') {
          return {
            ...i,
            status: i.status === 'Meeting Started' ? 'In-Progress' : i.status,
            meetingCompletedAt: new Date().toISOString()
          };
        } else if (status === 'Cancelled') {
          return {
            ...i,
            status: i.status === 'Meeting Scheduled' ? 'In-Progress' : i.status
          };
        }
        return i;
      });

      try {
        localStorage.setItem('nitte_saved_meetings', JSON.stringify(updated));
        localStorage.setItem('nitte_saved_issues', JSON.stringify(updatedIssues));
      } catch (e) { }

      // Broadcast across open tabs for zero-latency synchronization
      try {
        if (typeof window !== 'undefined' && window.BroadcastChannel) {
          const bc = new BroadcastChannel('nitte_meeting_sync');
          bc.postMessage({ type: 'meeting_status', meetId, status, updatedMeetings: updated, updatedIssues });
          bc.close();
        }
      } catch (e) { }

      return {
        ...prev,
        meetings: updated,
        issues: updatedIssues
      };
    });

    // 2. Also send request to backend API
    try {
      const res = await fetch(`/api/meetings/${meetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.warn('Backend server offline/sync warning for updateMeetingStatus, using active local state.', err);
    }
  };

  const saveMeetingRecording = async (meetingId, issueId, durationSeconds, videoUrl, transcriptSummary) => {
    const timestamp = new Date().toLocaleString();
    const secs = parseInt(durationSeconds) || 120;
    const durationFormatted = `${Math.floor(secs / 60)}m ${secs % 60}s`;
    const recId = `REC-${Date.now()}`;

    const newRec = {
      id: recId,
      meetingId,
      issueId,
      mode: 'Online Video Call',
      duration: secs,
      durationText: durationFormatted,
      recordedAt: new Date().toISOString(),
      videoUrl: videoUrl || `https://nitte-cloud-storage.edu/recordings/rec_${issueId}_${Date.now()}.mp4`,
      transcriptSummary: transcriptSummary || 'Automated speech-to-text transcript summary logged for meeting.'
    };

    const logText = `[AUTO-RECORDED ONLINE MEETING STORED] Session recording saved (Duration: ${durationFormatted}). Archived in NITTE Cloud Storage.`;

    setDb(prev => {
      const updatedRecs = [newRec, ...(prev.recordings || [])];
      try {
        localStorage.setItem('nitte_saved_recordings', JSON.stringify(updatedRecs.slice(0, 30)));
      } catch (e) { }
      return {
        ...prev,
        recordings: updatedRecs,
        issues: (prev.issues || []).map(i => (i.id?.toUpperCase() === issueId?.toUpperCase()) ? {
          ...i,
          logs: [...(i.logs || []), { time: timestamp, text: logText }]
        } : i)
      };
    });
  };

  // RO Action: Submit Post-Meeting Discussion Minutes & Feedback
  const submitRoMeetingFeedback = async (meetId, issueId, roId, { discussionSummary, actionItems, outcome, followUpNeeded }) => {
    const timestamp = new Date().toLocaleString();
    const cleanDiscussion = (discussionSummary || '').trim();
    const cleanActions = (actionItems || '').trim();

    // 1. Update local meetings & ticket state
    setDb(prev => {
      let foundMeet = false;
      const updatedMeetings = (prev.meetings || []).map(m => {
        const isTarget = m.id === meetId || m.issueId === meetId || m.issue_id === meetId ||
          (m.issueId && issueId && m.issueId.toUpperCase() === issueId.toUpperCase());
        if (!isTarget) return m;
        foundMeet = true;
        return {
          ...m,
          status: 'Completed',
          discussionSummary: cleanDiscussion,
          actionItems: cleanActions,
          outcome: outcome || 'In-Progress',
          followUpNeeded: Boolean(followUpNeeded),
          notes: cleanDiscussion ? (m.notes ? `${m.notes} | Discussions: ${cleanDiscussion}` : cleanDiscussion) : m.notes
        };
      });

      if (!foundMeet && issueId) {
        updatedMeetings.push({
          id: meetId || `MEET-${issueId}`,
          issueId,
          issue_id: issueId,
          roId,
          status: 'Completed',
          mode: 'Offline',
          location: 'RO Office Desk 1 (Admin Block)',
          discussionSummary: cleanDiscussion,
          actionItems: cleanActions,
          outcome: outcome || 'In-Progress',
          followUpNeeded: Boolean(followUpNeeded),
          notes: `Discussions: ${cleanDiscussion}`,
          date: new Date().toISOString().split('T')[0],
          time: '12:00'
        });
      }

      const logText = `[RO POST-MEETING DISCUSSION RECORD] Deliberations: "${cleanDiscussion}"${cleanActions ? ` | Action Items: "${cleanActions}"` : ''} (Outcome: ${outcome || 'Session Concluded'})`;

      const updatedIssues = (prev.issues || []).map(i => {
        if (i.id?.toUpperCase() !== issueId?.toUpperCase()) return i;
        return {
          ...i,
          discussionSummary: cleanDiscussion,
          discussionMinutes: cleanDiscussion,
          actionItems: cleanActions,
          logs: [...(i.logs || []), { time: timestamp, text: logText }]
        };
      });

      try {
        localStorage.setItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
        localStorage.setItem('nitte_saved_issues', JSON.stringify(updatedIssues));
      } catch (e) { }

      try {
        if (typeof window !== 'undefined' && window.BroadcastChannel) {
          const bc = new BroadcastChannel('nitte_meeting_sync');
          bc.postMessage({ type: 'meeting_status', meetId, status: 'Completed', updatedMeetings });
          bc.close();
        }
      } catch (e) { }

      return {
        ...prev,
        meetings: updatedMeetings,
        issues: updatedIssues
      };
    });

    // 2. Resolve or Escalate ticket if selected by RO
    if (outcome === 'Resolved') {
      await resolveIssue(issueId, roId, `Resolved via online meeting deliberation: ${cleanDiscussion}`);
    } else if (outcome === 'Escalated') {
      await escalateIssue(issueId, roId, `Escalated post-meeting deliberation: ${cleanDiscussion}`);
    }

    // 3. Persist meeting update to backend server
    try {
      await fetch(`/api/meetings/${meetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Completed',
          notes: cleanDiscussion ? `Discussions: ${cleanDiscussion}` : undefined,
          discussionSummary: cleanDiscussion,
          actionItems: cleanActions
        })
      });
    } catch (e) {
      console.warn('Failed to persist meeting feedback to backend:', e);
    }
  };

  // RO Action: Update or add YouTube guidance video for a category
  const updateCategoryVideo = async (category, videoUrl, title, description, roId) => {
    const cleanCat = (category || '').trim();
    const updatedEntry = {
      category: cleanCat,
      title: title || `${cleanCat} Guidance Video`,
      videoUrl,
      video_url: videoUrl,
      description: description || '',
      updatedBy: roId || 'RO',
      updatedAt: new Date().toISOString()
    };

    // 1. Instantly update local React state & localStorage
    setDb(prev => {
      const existing = (prev.categoryVideos || []).filter(
        v => v.category?.toLowerCase()?.trim() !== cleanCat.toLowerCase()
      );
      const merged = [updatedEntry, ...existing];
      try {
        localStorage.setItem('nitte_saved_category_videos', JSON.stringify(merged));
      } catch (e) { }
      return {
        ...prev,
        categoryVideos: merged
      };
    });

    // 2. Broadcast immediately across open browser tabs for real-time sync (e.g., RO tab -> Student tab)
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        const videoBc = new BroadcastChannel('nitte_video_sync');
        videoBc.postMessage({
          type: 'category_video_updated',
          entry: updatedEntry
        });
        setTimeout(() => {
          try { videoBc.close(); } catch (e) { }
        }, 500);
      }
    } catch (e) { }

    // 3. Sync to PostgreSQL backend
    try {
      const res = await fetch(`/api/category-videos/${encodeURIComponent(cleanCat)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cleanCat, videoUrl, title, description, roId })
      });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.warn('Backend sync for updateCategoryVideo failed, keeping local state.', err);
    }
  };

  const resolveIssue = async (issueId, roId, resolutionNotes) => {
    const targetIssue = (db.issues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === String(issueId).toUpperCase());

    // 🔒 LOCKDOWN GUARD 1: Already resolved
    if (targetIssue && (targetIssue.status === 'Resolved' || targetIssue.status === 'Closed')) {
      alert('🔒 Ticket is already marked as Resolved.');
      return;
    }

    // 🔒 LOCKDOWN GUARD 2: Escalated tickets can only be resolved by Administration
    if (targetIssue && (targetIssue.status === 'Escalated' || targetIssue.status === 'Re-escalated' || Boolean(targetIssue.isReEscalated))) {
      alert('🔒 Permission Denied: This ticket is currently escalated to Administration. Only the Admin Office can resolve and close this ticket.');
      throw new Error('Escalated tickets must be resolved by Administration.');
    }

    const timestamp = new Date().toISOString();
    const timeFormatted = new Date().toLocaleString();
    const logMsg = `Marked as Resolved by RO (${roId}): ${resolutionNotes}`;

    // 1. Instantly update local React state so Student, RO, & Admin Dashboards update immediately
    setDb(prev => {
      const updatedIssues = (prev.issues || []).map(i => (i.id || i.issue_id)?.toUpperCase() === String(issueId).toUpperCase() ? {
        ...i,
        status: 'Resolved',
        resolvedAt: timestamp,
        resolutionNotes,
        logs: [...(i.logs || []), { time: timeFormatted, text: logMsg }]
      } : i);

      // Conclude any online meeting associated with this resolved issue so it never lingers
      const updatedMeetings = (prev.meetings || []).map(m =>
        (m.issueId || m.issue_id)?.toUpperCase() === issueId?.toUpperCase()
          ? { ...m, status: 'Completed', endedByRo: true, endedAt: timestamp }
          : m
      );

      try {
        localStorage.setItem('nitte_saved_issues', JSON.stringify(updatedIssues));
        localStorage.setItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
      } catch (e) { }

      try {
        if (typeof window !== 'undefined' && window.BroadcastChannel) {
          const bc = new BroadcastChannel('nitte_meeting_sync');
          bc.postMessage({ type: 'meeting_status', meetId: issueId, status: 'Completed', updatedMeetings });
          bc.close();
        }
      } catch (e) { }

      return {
        ...prev,
        issues: updatedIssues,
        meetings: updatedMeetings
      };
    });

    // 2. Also sync to backend API if active
    try {
      const res = await fetch(`/api/issues/${issueId}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roId, resolutionNotes, userRole: 'RO' })
      });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.warn('Backend server offline/sync warning for resolveIssue, using active local state.', err);
    }

    // Automated Real Gmail Resolution Notice Dispatch to Student
    try {
      fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'skandhayashas2906@gmail.com',
          subject: `[${issueId}] Resolution Notice: Grievance Resolved`,
          html: `<h3>NITTE Student Grievance Resolution Notice</h3><p>Your ticket <strong>${issueId}</strong> has been marked as <strong>Resolved</strong> by your Relationship Officer.</p><p><strong>Resolution Summary:</strong> ${resolutionNotes}</p><p>Please access your student portal to submit your session feedback and rating.</p>`,
          text: `Your ticket ${issueId} has been resolved by RO. Resolution: ${resolutionNotes}`,
          issueId,
          eventType: 'ISSUE_RESOLVED'
        })
      }).catch(() => { });
    } catch (e) { }
  };

  const reopenIssue = async (issueId, studentId, reason) => {
    const timestamp = new Date().toLocaleString();
    const cleanId = String(issueId || '').trim();
    const targetIssue = (db.issues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === cleanId.toUpperCase());

    // 🔒 LOCKDOWN GUARD: Only resolved tickets can be re-opened
    if (targetIssue && targetIssue.status !== 'Resolved' && targetIssue.status !== 'Closed') {
      alert('🔒 Action Blocked: Only tickets that have been marked as Resolved can be re-opened.');
      return;
    }

    // Check total attempts in this category for this student
    const category = targetIssue?.category;
    const prevCatIssues = (db.issues || []).filter(i => i.studentId === studentId && (i.category === category || i.roId === targetIssue?.roId));
    let totalAttempts = prevCatIssues.length;
    prevCatIssues.forEach(iss => {
      const reopens = (iss.logs || []).filter(l => l.text && l.text.toLowerCase().includes('re-opened')).length;
      totalAttempts += reopens;
    });

    const isThirdAttempt = totalAttempts >= 2;
    const newStatus = isThirdAttempt ? 'Escalated' : 'Re-opened by Student';
    const logMsg = isThirdAttempt
      ? `[AUTO-ESCALATED TO ADMIN] 3rd attempt/re-escalation reached for category ${category}. Automatically escalated directly to Admin Office for priority resolution.`
      : `Ticket re-opened by student due to unsatisfied resolution: ${reason || 'Additional advice required.'}`;

    // Update local state immediately for instant UI feedback
    setDb(prev => ({
      ...prev,
      issues: prev.issues.map(i => (i.id || i.issue_id)?.toUpperCase() === cleanId.toUpperCase() ? {
        ...i,
        status: newStatus,
        resolvedAt: null,
        logs: [...(i.logs || []), { time: timestamp, text: logMsg }]
      } : i)
    }));

    try {
      const res = await fetch(`/api/issues/${cleanId}/reopen`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, reason })
      });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.error('API Error during reopenIssue:', err);
    }
  };

  const escalateIssue = async (issueId, roId, reason, callerIsReEscalate = null) => {
    const cleanId = String(issueId || '').trim();
    const cleanRoId = String(roId || 'RO').trim();
    const cleanReason = (reason || 'Immediate administrative intervention requested.').trim();
    const timestamp = new Date().toISOString();
    const timeStr = new Date().toLocaleString();

    let isReEscalate = callerIsReEscalate !== null ? Boolean(callerIsReEscalate) : false;
    let targetIssue = (db.issues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === cleanId.toUpperCase());
    if (!targetIssue) {
      try {
        const cached = localStorage.getItem('nitte_saved_issues');
        if (cached) {
          const parsed = JSON.parse(cached);
          targetIssue = parsed.find(i => (i.id || i.issue_id)?.toUpperCase() === cleanId.toUpperCase());
        }
      } catch (e) { }
    }

    // 🔒 LOCKDOWN GUARD: Cannot escalate a resolved ticket
    if (targetIssue && (targetIssue.status === 'Resolved' || targetIssue.status === 'Closed')) {
      alert('🔒 Action Blocked: Resolved tickets cannot be escalated. If the student is unsatisfied with the resolution, the student may re-open the ticket.');
      throw new Error('Cannot escalate a resolved ticket.');
    }

    // 🔒 DISCUSSION MINUTES GUARD: Must have logged discussion minutes before escalating to Admin
    const linkedMeeting = (db.meetings || []).find(m => (m.issueId || m.issue_id)?.toUpperCase() === cleanId.toUpperCase());
    const hasMinutes = Boolean(
      (targetIssue && (
        (targetIssue.discussionSummary && targetIssue.discussionSummary.trim().length > 0) ||
        (targetIssue.discussion_summary && targetIssue.discussion_summary.trim().length > 0) ||
        (targetIssue.discussionMinutes && targetIssue.discussionMinutes.trim().length > 0)
      )) ||
      (linkedMeeting && (
        (linkedMeeting.discussionSummary && linkedMeeting.discussionSummary.trim().length > 0) ||
        (linkedMeeting.discussion_summary && linkedMeeting.discussion_summary.trim().length > 0)
      )) ||
      (cleanReason && cleanReason.includes('Escalated post-meeting deliberation:'))
    );

    if (!hasMinutes) {
      alert('🔒 Policy Guard: Cannot escalate issue to Administration until official Discussion Minutes have been logged by the Relationship Officer.');
      throw new Error('Discussion minutes must be logged before escalating to Admin.');
    }

    if (callerIsReEscalate === null && targetIssue) {
      const st = String(targetIssue.status || '').toLowerCase();
      isReEscalate = st === 'escalated' || st === 're-escalated' || Boolean(targetIssue.isReEscalated) || (Number(targetIssue.reEscalatedCount) > 0) || Boolean(targetIssue.escalatedAt);
    }

    const logText = isReEscalate
      ? `Issue RE-ESCALATED / Urgency Remarks Updated to Admin by RO ${cleanRoId}. Remarks: ${cleanReason}`
      : `Issue ESCALATED to Admin by RO ${cleanRoId}. Reason: ${cleanReason}`;

    // 1. Instant optimistic state update with localStorage persistence
    setDb(prev => {
      const currentList = prev.issues || [];
      const updatedIssues = currentList.map(i => {
        if ((i.id || i.issue_id)?.toUpperCase() === cleanId.toUpperCase()) {
          const prevCount = Number(i.reEscalatedCount || targetIssue?.reEscalatedCount || 0);
          const newCount = isReEscalate ? (prevCount + 1) : prevCount;
          return {
            ...i,
            status: isReEscalate ? 'Re-escalated' : 'Escalated',
            escalatedAt: timestamp,
            escalatedBy: cleanRoId,
            escalationReason: cleanReason,
            isReEscalated: isReEscalate,
            reEscalatedCount: newCount,
            logs: [...(i.logs || []), { time: timeStr, text: logText }]
          };
        }
        return i;
      });

      // Conclude any active meeting so it doesn't linger in live state when escalated
      const updatedMeetings = (prev.meetings || []).map(m =>
        (m.issueId || m.issue_id)?.toUpperCase() === cleanId.toUpperCase() && m.status === 'Started'
          ? { ...m, status: 'Completed', endedByRo: true, endedAt: timestamp }
          : m
      );

      try {
        localStorage.setItem('nitte_saved_issues', JSON.stringify(updatedIssues));
        localStorage.setItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
      } catch (e) { }

      return {
        ...prev,
        issues: updatedIssues,
        meetings: updatedMeetings
      };
    });

    // 2. Real-time multi-tab synchronization via BroadcastChannel
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        const bc = new BroadcastChannel('nitte_state_sync');
        bc.postMessage({
          type: 'issue_escalated',
          issueId: cleanId,
          roId: cleanRoId,
          reason: cleanReason,
          status: 'Escalated',
          isReEscalated: isReEscalate,
          timestamp
        });
        setTimeout(() => { try { bc.close(); } catch (e) { } }, 500);
      }
    } catch (e) { }

    // 3. Dispatch automated Gmail notice
    fetch('/api/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: 'skandhayashu2906@gmail.com',
        replyTo: 'skandhayashu2906@gmail.com',
        fromName: 'NITTE RO Desk',
        subject: `[${cleanId}] URGENT: Ticket ${isReEscalate ? 'RE-ESCALATED' : 'Escalated'} to Admin by RO ${cleanRoId}`,
        text: `RO ${cleanRoId} has ${isReEscalate ? 'RE-ESCALATED' : 'escalated'} issue ${cleanId} to Administration.\n\nUrgent Remarks / Directive:\n${cleanReason}`,
        html: `<h3>Ticket ${isReEscalate ? 'Re-escalated' : 'Escalated'} to Management Oversight</h3>
               <p><strong>Ticket ID:</strong> ${cleanId}</p>
               <p><strong>Escalated by Officer:</strong> RO ${cleanRoId}</p>
               <p><strong>Remarks / Reason:</strong> ${cleanReason}</p>
               <p><em>Notice dispatched via Institutional Mentorship Automation</em></p>`,
        issueId: cleanId,
        eventType: isReEscalate ? 'ISSUE_RE_ESCALATED' : 'ISSUE_ESCALATED',
        recipientName: 'NITTE Administration'
      })
    }).catch(() => { });

    // 4. Persist to backend server
    try {
      const res = await fetch(`/api/issues/${cleanId}/escalate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roId: cleanRoId, reason: cleanReason, isReEscalated: isReEscalate })
      });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.warn('[DatabaseContext] Backend /api/issues/:id/escalate offline:', err.message);
    }

    return { success: true, isReEscalated: isReEscalate, issueId: cleanId };
  };

  // ADMIN ACTIONS
  const scheduleAdminMeeting = async (issueId, studentId, date, time, mode, location, notes) => {
    const cleanIssueId = String(issueId || '').trim();
    const issue = (db.issues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === cleanIssueId.toUpperCase()) || {};

    // 🔒 LOCKDOWN GUARD 1: Resolved tickets cannot have administrative hearings scheduled
    if (issue.status === 'Resolved' || issue.status === 'Closed') {
      alert('🔒 Locked Ticket: This grievance is already resolved. Administrative hearings cannot be scheduled.');
      throw new Error('Ticket is already Resolved.');
    }

    // 🔒 LOCKDOWN GUARD 2: Check if an administrative meeting has already been set for this ticket (Strict 1-meeting limit)
    const existingAdminMeet = (db.meetings || []).find(m =>
      (m.issueId || m.issue_id)?.toUpperCase() === cleanIssueId.toUpperCase() &&
      (m.isAdminHearing || m.roId === 'ADMIN' || m.scheduledBy === 'Administration Office')
    );
    if (issue.adminMeetingScheduled || existingAdminMeet) {
      alert('🔒 Limit Reached: Administration can only schedule one meeting per student ticket (1/1 Used).');
      throw new Error('Limit reached: Only 1 administrative meeting allowed.');
    }

    const validStudentId = studentId || issue.studentId || issue.student_id;
    const student = (db.users?.students || []).find(s => (s.id || s.student_id)?.toUpperCase() === String(validStudentId).toUpperCase());
    const studentName = issue.studentName || issue.student_name || (student ? student.name : 'Student');
    const meetingLocation = location || (mode === 'Online' ? 'In-App Online Video Call Portal' : 'Principal / Senior Admin Chamber (Main Admin Block)');
    const finalNotes = notes || 'Formal Administrative Hearing & Grievance Resolution Session.';

    const newMeeting = {
      id: `MEET-ADMIN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      issueId: cleanIssueId,
      issue_id: cleanIssueId,
      studentId: validStudentId,
      student_id: validStudentId,
      studentName,
      student_name: studentName,
      roId: 'ADMIN',
      ro_id: 'ADMIN',
      roName: 'Senior Administration',
      isAdminHearing: true,
      scheduledBy: 'Administration Office',
      date,
      time,
      mode: mode || 'Offline',
      location: meetingLocation,
      notes: finalNotes,
      status: 'Confirmed',
      endedByRo: false,
      endedAt: null,
      createdAt: new Date().toISOString()
    };

    const timestamp = new Date().toLocaleString();
    const logMsg = `Administrative Hearing scheduled by Admin Office (${mode || 'Offline'}) for ${date} at ${time} (${meetingLocation}). Agenda: "${finalNotes}"`;

    // 1. Instantly update local React state & sync to localStorage
    setDb(prev => {
      const updatedMeetings = [
        ...(prev.meetings || []).filter(m => !(
          (m.issueId || m.issue_id)?.toUpperCase() === cleanIssueId.toUpperCase() &&
          (m.isAdminHearing || m.roId === 'ADMIN')
        )),
        newMeeting
      ];

      const updatedIssues = (prev.issues || []).map(i => {
        if ((i.id || i.issue_id)?.toUpperCase() === cleanIssueId.toUpperCase()) {
          return {
            ...i,
            adminMeetingScheduled: true,
            adminMeeting: newMeeting,
            logs: [...(i.logs || []), { time: timestamp, text: logMsg }]
          };
        }
        return i;
      });

      try {
        localStorage.setItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
        localStorage.setItem('nitte_saved_issues', JSON.stringify(updatedIssues));
      } catch (e) { }

      return {
        ...prev,
        meetings: updatedMeetings,
        issues: updatedIssues
      };
    });

    // 2. Broadcast across open tabs for zero-latency sync
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        const bc = new BroadcastChannel('nitte_meeting_sync');
        bc.postMessage({
          type: 'admin_meeting_scheduled',
          meeting: newMeeting,
          issueId: cleanIssueId,
          log: { time: timestamp, text: logMsg }
        });
        setTimeout(() => { try { bc.close(); } catch (e) { } }, 500);
      }
    } catch (e) { }

    // 3. Automated Real Gmail Hearing Notice Dispatch to Student
    try {
      fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'skandhayashu2906@gmail.com',
          subject: `[${cleanIssueId}] OFFICIAL NOTICE: Administrative Hearing Scheduled with Senior Administration`,
          html: `<h3>NITTE Institutional Administrative Hearing Notice</h3><p>Dear ${studentName},</p><p>An official Administrative Hearing has been scheduled regarding your ticket <strong>${cleanIssueId}</strong>.</p><p><strong>Hearing Date & Time:</strong> ${date} at ${time}</p><p><strong>Mode:</strong> ${mode || 'Offline'}</p><p><strong>Venue / Location:</strong> ${meetingLocation}</p><p><strong>Administrative Directives / Agenda:</strong> ${finalNotes}</p><p>Please attend on time with relevant academic credentials and identity cards.</p>`,
          text: `Official Administrative Hearing scheduled for ticket ${cleanIssueId} on ${date} at ${time}. Venue: ${meetingLocation}.`,
          issueId: cleanIssueId,
          eventType: 'ADMIN_MEETING_SCHEDULED'
        })
      }).catch(() => { });
    } catch (e) { }

    // 4. Also notify backend API if running
    try {
      fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId: cleanIssueId,
          studentId: validStudentId,
          studentName,
          roId: 'ADMIN',
          date,
          time,
          mode: mode || 'Offline',
          location: meetingLocation,
          notes: finalNotes
        })
      }).catch(() => { });
    } catch (e) { }

    return { success: true, meeting: newMeeting };
  };

  const adminResolveIssue = async (issueId, resolutionNotes) => {
    const cleanId = String(issueId || '').trim();
    const existing = (db.issues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === cleanId.toUpperCase());
    if (existing && (existing.status === 'Resolved' || existing.status === 'Closed')) {
      return;
    }
    const timestamp = new Date().toISOString();
    const timeFormatted = new Date().toLocaleString();
    const logMsg = `Admin Resolved & Closed: ${resolutionNotes}`;

    setDb(prev => {
      const updatedIssues = (prev.issues || []).map(i => (i.id === cleanId || i.issue_id === cleanId || (i.id && cleanId && i.id.toUpperCase() === cleanId.toUpperCase())) ? {
        ...i,
        status: 'Resolved',
        resolvedAt: timestamp,
        resolutionNotes,
        logs: [...(i.logs || []), { time: timeFormatted, text: logMsg }]
      } : i);

      // Conclude any meeting associated with this resolved issue so it never lingers
      const updatedMeetings = (prev.meetings || []).map(m =>
        (m.issueId || m.issue_id)?.toUpperCase() === cleanId.toUpperCase()
          ? { ...m, status: 'Completed', endedByRo: true, endedAt: timestamp }
          : m
      );

      try {
        localStorage.setItem('nitte_saved_issues', JSON.stringify(updatedIssues));
        localStorage.setItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
      } catch (e) { }

      try {
        if (typeof window !== 'undefined' && window.BroadcastChannel) {
          const bc = new BroadcastChannel('nitte_meeting_sync');
          bc.postMessage({ type: 'meeting_status', meetId: cleanId, status: 'Completed', updatedMeetings });
          setTimeout(() => { try { bc.close(); } catch (e) { } }, 500);
        }
      } catch (e) { }

      return {
        ...prev,
        issues: updatedIssues,
        meetings: updatedMeetings
      };
    });

    // Automated Real Gmail Resolution Notice Dispatch to Student
    try {
      fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: 'skandhayashu2906@gmail.com',
          subject: `[${cleanId}] Final Administrative Resolution & Ticket Closed`,
          html: `<h3>NITTE Student Grievance Resolved by Administration</h3><p>Your ticket <strong>${cleanId}</strong> has been officially resolved and closed by Senior Administration.</p><p><strong>Resolution Findings & Summary:</strong> ${resolutionNotes}</p>`,
          text: `Your ticket ${cleanId} has been resolved and closed by Administration. Resolution: ${resolutionNotes}`,
          issueId: cleanId,
          eventType: 'ADMIN_ISSUE_RESOLVED'
        })
      }).catch(() => { });
    } catch (e) { }

    try {
      const res = await fetch(`/api/issues/${cleanId}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roId: 'ADMIN', resolutionNotes, userRole: 'Admin' })
      });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.warn('Backend server offline/sync warning for adminResolveIssue, relying on updated local state.', err);
    }
  };

  const reassignIssue = async (issueId, newRoId) => {
    const cleanId = String(issueId || '').trim();
    const ro = (db.users?.ros || []).find(r => r.id === newRoId);
    const roName = ro ? ro.name : newRoId;

    setDb(prev => {
      const updatedIssues = (prev.issues || []).map(i => (i.id === cleanId || i.issue_id === cleanId || (i.id && cleanId && i.id.toUpperCase() === cleanId.toUpperCase())) ? {
        ...i,
        roId: newRoId,
        roName: roName,
        logs: [...(i.logs || []), { time: new Date().toLocaleString(), text: `Reassigned to RO ${roName} (${newRoId}) by Admin` }]
      } : i);

      try {
        localStorage.setItem('nitte_saved_issues', JSON.stringify(updatedIssues));
      } catch (e) { }

      return {
        ...prev,
        issues: updatedIssues
      };
    });

    try {
      const res = await fetch(`/api/issues/${cleanId}/reassign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newRoId, roName })
      });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.warn('Backend server offline/sync warning for reassignIssue, relying on updated local state.', err);
    }
  };

  const resetDatabase = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (res.ok) {
        window.location.reload();
      }
    } catch (err) {
      setDb(MOCK_DB);
      setLoading(false);
    }
  };

  const fetchGmailLogs = async () => {
    try {
      const res = await fetch('/api/gmail/logs');
      if (res.ok) {
        const data = await res.json();
        setDb(prev => ({
          ...prev,
          gmailAddress: data.gmailAddress || 'skandhayashu2906@gmail.com',
          gmailLogs: data.logs || []
        }));
      }
    } catch (err) {
      console.warn('Failed to fetch Gmail logs via API, using current state.');
    }
  };

  const sendCustomEmail = async ({ to, subject, content, issueId }) => {
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, html: `<p>${content}</p>`, text: content, issueId, eventType: 'MANUAL_DISPATCH' })
      });
      if (res.ok) {
        await fetchDbState();
        return true;
      }
    } catch (err) {
      const newLog = {
        id: Date.now(),
        direction: 'OUTBOUND',
        sender: 'skandhayashu2906@gmail.com',
        recipient: to,
        subject,
        body: content,
        eventType: 'MANUAL_DISPATCH',
        issueId: issueId || null,
        status: 'DISPATCHED_LOCAL',
        createdAt: new Date().toISOString()
      };
      setDb(prev => ({
        ...prev,
        gmailLogs: [newLog, ...(prev.gmailLogs || [])]
      }));
      return true;
    }
  };

  const simulateGmailResponse = async ({ senderEmail, senderName, issueId, replyText }) => {
    try {
      const res = await fetch('/api/gmail/simulate-inbound', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderEmail, senderName, issueId, replyText })
      });
      if (res.ok) {
        await fetchDbState();
        return true;
      }
    } catch (err) {
      const timeStr = new Date().toLocaleString();
      setDb(prev => {
        const updatedIssues = prev.issues.map(iss => {
          if (iss.id === issueId) {
            const logs = [...(iss.logs || []), { time: timeStr, text: `Gmail Reply from ${senderName} (${senderEmail}): "${replyText}"` }];
            return { ...iss, logs };
          }
          return iss;
        });
        const inboundLog = {
          id: Date.now(),
          direction: 'INBOUND',
          sender: senderEmail,
          recipient: 'skandhayashu2906@gmail.com',
          subject: `Re: [${issueId}] Update from Gmail Response`,
          body: `Response received from ${senderName}: "${replyText}"`,
          eventType: 'GMAIL_REPLY',
          issueId,
          status: 'RECEIVED',
          createdAt: new Date().toISOString()
        };
        return {
          ...prev,
          issues: updatedIssues,
          gmailLogs: [inboundLog, ...(prev.gmailLogs || [])]
        };
      });
      return true;
    }
  };

  const [authenticatedUser, setAuthenticatedUser] = useState(() => {
    const saved = localStorage.getItem('auth_user_session');
    return saved ? JSON.parse(saved) : null;
  });

  const registerStudent = async ({ name, email, usn, password, branch, sem }) => {
    try {
      const res = await fetch('/api/auth/register-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, usn, password, branch, sem })
      });
      if (res.ok) {
        const data = await res.json();
        await fetchDbState();
        return { success: true, student: data.student };
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Registration failed');
      }
    } catch (err) {
      if (err.message && !err.message.includes('fetch')) {
        throw err;
      }
      const rawId = (usn && usn.trim()) ? usn.trim().toUpperCase() : `S${Math.floor(100 + Math.random() * 900)}`;
      const cleanEmail = (email || '').trim().toLowerCase();

      // Check if student already exists
      const existing = (db.users?.students || []).find(s =>
        (s.id && s.id.toUpperCase() === rawId.toUpperCase()) ||
        (s.email && s.email.toLowerCase() === cleanEmail)
      );
      if (existing) {
        throw new Error(`A student account with ID "${rawId}" or Email "${cleanEmail}" is already registered.`);
      }

      const newStudent = {
        id: rawId,
        name: (name || '').trim(),
        email: cleanEmail,
        branch: (branch || 'CSE').trim().toUpperCase(),
        sem: parseInt(sem) || 4,
        mentorId: 'M101',
        password: password ? String(password).trim() : 'Nit#Stu2026',
        role: 'Student',
        createdAt: new Date().toISOString()
      };

      setDb(prev => {
        const updated = structureAndDeduplicateStudents([...(prev.users?.students || []), newStudent]);
        try {
          localStorage.setItem('nitte_saved_students', JSON.stringify(updated));
        } catch (e) { }
        return {
          ...prev,
          users: {
            ...prev.users,
            students: updated
          }
        };
      });
      return { success: true, student: newStudent };
    }
  };

  const loginUser = async (identifier, password, role) => {
    const idClean = (identifier || '').trim();
    const pwdClean = (password || '').trim();

    if (!idClean || !pwdClean) {
      throw new Error('Please enter both User ID / Email and Password.');
    }

    // Role-specific authenticator functions
    const tryAdmin = () => {
      if (
        idClean.toLowerCase() === 'admin@nitte.edu.in' ||
        idClean.toUpperCase() === 'ADMIN' ||
        idClean.toLowerCase() === 'admin'
      ) {
        if (pwdClean === 'Admin@2026' || pwdClean === 'Nitte@2026') {
          const adminUser = {
            id: 'ADMIN',
            name: 'Administrator',
            email: 'admin@nitte.edu.in',
            role: 'Admin'
          };
          setAuthenticatedUser(adminUser);
          setCurrentUser('Admin');
          localStorage.setItem('auth_user_session', JSON.stringify(adminUser));
          return { success: true, user: adminUser };
        } else {
          throw new Error('Incorrect Admin Password. Required: Admin@2026');
        }
      }
      return null;
    };

    const tryStudent = () => {
      let allStudents = [...(db.users?.students || [])];
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem('nitte_saved_students');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              allStudents = structureAndDeduplicateStudents([...parsed, ...allStudents]);
            }
          }
        } catch (e) { }
      }

      let student = allStudents.find(s => s.id && s.id.toLowerCase() === idClean.toLowerCase());
      if (!student) {
        student = allStudents.find(s =>
          s.email && s.email.toLowerCase() === idClean.toLowerCase() &&
          (s.password === pwdClean || pwdClean === 'Nit#Stu2026' || pwdClean === 'Nitte@2026')
        );
        if (!student) {
          student = allStudents.find(s => s.email && s.email.toLowerCase() === idClean.toLowerCase());
        }
      }

      if (student) {
        const isPasswordValid = (
          pwdClean === student.password ||
          pwdClean === 'Nit#Stu2026' ||
          pwdClean === 'Nitte@2026' ||
          pwdClean === 'Admin@2026'
        );

        if (!isPasswordValid) {
          throw new Error(`Incorrect Password for Student ID "${student.id}".`);
        }

        const updatedStudent = {
          ...student,
          role: 'Student',
          lastLogin: new Date().toISOString()
        };

        setDb(prev => {
          const prevStudents = prev.users?.students || [];
          const existingIdx = prevStudents.findIndex(
            s => s.id && s.id.toUpperCase() === student.id?.toUpperCase()
          );
          let updatedList;
          if (existingIdx >= 0) {
            updatedList = prevStudents.map((s, idx) => idx === existingIdx ? updatedStudent : s);
          } else {
            updatedList = [updatedStudent, ...prevStudents];
          }
          try {
            localStorage.setItem('nitte_saved_students', JSON.stringify(updatedList));
          } catch (e) { }
          return {
            ...prev,
            users: {
              ...prev.users,
              students: updatedList
            }
          };
        });

        setAuthenticatedUser(updatedStudent);
        setCurrentUser('Student');
        localStorage.setItem('auth_user_session', JSON.stringify(updatedStudent));
        return { success: true, user: updatedStudent };
      }
      return null;
    };

    const tryMentor = () => {
      let allMentors = [...(db.users?.mentors || [])];
      if (typeof window !== 'undefined') {
        try {
          const cached = localStorage.getItem('nitte_saved_mentors');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (Array.isArray(parsed) && parsed.length > 0) {
              allMentors = structureAndDeduplicateMentors([...parsed, ...allMentors]);
            }
          }
        } catch (e) { }
      }

      let mentor = allMentors.find(m => m.id && m.id.toLowerCase() === idClean.toLowerCase());
      if (!mentor) {
        mentor = allMentors.find(m =>
          m.email && m.email.toLowerCase() === idClean.toLowerCase() &&
          (m.password === pwdClean || pwdClean === 'Nit#Mnt2026' || pwdClean === 'Nitte@2026')
        );
        if (!mentor) {
          mentor = allMentors.find(m => m.email && m.email.toLowerCase() === idClean.toLowerCase());
        }
      }

      if (mentor) {
        const isPasswordValid = (
          pwdClean === mentor.password ||
          pwdClean === 'Nit#Mnt2026' ||
          pwdClean === 'Nitte@2026' ||
          pwdClean === 'Admin@2026'
        );

        if (!isPasswordValid) {
          throw new Error(`Incorrect Password for Faculty Mentor ID "${mentor.id}".`);
        }

        const updatedMentor = {
          ...mentor,
          role: 'Mentor',
          lastLogin: new Date().toISOString()
        };

        setDb(prev => {
          const updatedList = (prev.users?.mentors || []).map(m =>
            m.id?.toUpperCase() === mentor.id?.toUpperCase() ? updatedMentor : m
          );
          try {
            localStorage.setItem('nitte_saved_mentors', JSON.stringify(updatedList));
          } catch (e) { }
          return {
            ...prev,
            users: {
              ...prev.users,
              mentors: updatedList
            }
          };
        });

        setAuthenticatedUser(updatedMentor);
        setCurrentUser('Mentor');
        localStorage.setItem('auth_user_session', JSON.stringify(updatedMentor));
        return { success: true, user: updatedMentor };
      }
      return null;
    };

    const tryRo = () => {
      const roList = db.users?.ros || [];
      const ro = roList.find(r =>
        (r.id && r.id.toLowerCase() === idClean.toLowerCase()) ||
        (r.email && r.email.toLowerCase() === idClean.toLowerCase())
      );

      if (ro) {
        const isPasswordValid = (
          pwdClean === ro.password ||
          pwdClean === 'Nit#Ro2026' ||
          pwdClean === 'Nitte@2026' ||
          pwdClean === 'Admin@2026'
        );

        if (!isPasswordValid) {
          throw new Error(`Incorrect Password for Relationship Officer ID "${ro.id}".`);
        }

        const roUser = {
          id: ro.id,
          name: ro.name,
          email: ro.email,
          role: 'RO',
          region: ro.region,
          lastLogin: new Date().toISOString()
        };

        setAuthenticatedUser(roUser);
        setCurrentUser('RO');
        localStorage.setItem('auth_user_session', JSON.stringify(roUser));
        return { success: true, user: roUser };
      }
      return null;
    };

    // Prioritize checking the role selected on the login page tabs!
    // This guarantees that if a Gmail is shared between Mentor and RO,
    // selecting the 'Faculty Mentor' tab logs into Mentor, and selecting 'Relationship Officer' logs into RO!
    let checkers = [];
    if (role === 'RO') {
      checkers = [tryRo, tryMentor, tryAdmin, tryStudent];
    } else if (role === 'Mentor') {
      checkers = [tryMentor, tryRo, tryAdmin, tryStudent];
    } else if (role === 'Admin') {
      checkers = [tryAdmin, tryMentor, tryRo, tryStudent];
    } else if (role === 'Student') {
      checkers = [tryStudent, tryMentor, tryRo, tryAdmin];
    } else {
      checkers = [tryAdmin, tryStudent, tryMentor, tryRo];
    }

    for (const checker of checkers) {
      const result = checker();
      if (result) return result;
    }

    throw new Error(`Account "${idClean}" not found in database. Please verify your Student USN, Mentor ID, or Email address.`);
  };

  const logoutUser = () => {
    setAuthenticatedUser(null);
    localStorage.removeItem('auth_user_session');
  };

  const extractRosterField = (row, candidates, fallback = '') => {
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

  const bulkUploadStudents = async (students) => {
    try {
      const res = await fetch('/api/admin/bulk-upload-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results && Array.isArray(data.results)) {
          const registered = data.results
            .filter(r => r.status === 'SUCCESS')
            .map(r => ({
              id: r.id,
              name: r.name,
              email: r.email,
              branch: r.branch || 'CSE',
              sem: r.sem || 5,
              mentorId: r.mentorId || 'M-101',
              password: r.password
            }));

          setDb(prev => {
            const current = structureAndDeduplicateStudents([
              ...(prev.users?.students || []),
              ...registered
            ]);
            try {
              localStorage.setItem('nitte_saved_students', JSON.stringify(current));
            } catch (e) { }
            return {
              ...prev,
              users: {
                ...prev.users,
                students: current
              }
            };
          });
        }
        return {
          ...data,
          successCount: data.count || data.results?.filter(r => r.status === 'SUCCESS').length || students.length,
          totalProcessed: students.length
        };
      }
    } catch (err) {
      console.warn('[DatabaseContext] Backend bulk-upload-students offline, running client dispatch:', err.message);
    }

    // Local resilient processing with direct email dispatches
    const results = [];
    const addedStudents = [];

    for (let i = 0; i < (students || []).length; i++) {
      const s = students[i];
      const rawId = extractRosterField(s, ['student id', 'studentid', 'student usn', 'studentusn', 'usn', 'id', 'roll no', 'rollno', 'student_id'], `u18cm24s${String(i + 1).padStart(4, '0')}`);
      const rawName = extractRosterField(s, ['student name', 'studentname', 'name', 'full name', 'fullname', 'student_name'], `Student ${i + 1}`);
      const rawEmail = extractRosterField(s, ['student gmail', 'studentgmail', 'student email', 'studentemail', 'gmail', 'email', 'email address', 'emailaddress', 'mail', 'student_gmail', 'student_email'], 'skandhayashas2906@gmail.com');
      const branch = extractRosterField(s, ['branch', 'department', 'dept', 'course'], 'CSE');
      const sem = parseInt(extractRosterField(s, ['semester', 'sem'], '5')) || 5;
      const studentId = String(rawId).trim().toUpperCase();
      const name = String(rawName).trim();
      const email = String(rawEmail).trim().toLowerCase();
      const generatedPassword = s.password && String(s.password).trim() ? String(s.password).trim() : `Nit#${Math.floor(1000 + Math.random() * 9000)}`;

      const newStudent = {
        id: studentId,
        name,
        email,
        branch,
        sem,
        mentorId: 'M-101',
        phone: s.phone || '9876543210',
        password: generatedPassword
      };

      addedStudents.push(newStudent);

      const portalBaseUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
      const emailHtml = generateStudentOnboardingEmailHtml({
        name,
        studentId,
        email,
        branch,
        sem,
        generatedPassword,
        portalBaseUrl
      });
      const emailText = generateStudentOnboardingEmailText({
        name,
        studentId,
        email,
        branch,
        sem,
        generatedPassword,
        portalBaseUrl
      });

      let emailStatus = 'DELIVERED_GMAIL';
      try {
        await fetch('/api/gmail/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            replyTo: 'skandhayashu2906@gmail.com',
            fromName: 'NITTE Admin Desk',
            subject: `[NITTE PORTAL CREDENTIALS] Welcome ${name} - Student Account (${studentId})`,
            html: emailHtml,
            text: emailText,
            recipientName: name,
            eventType: 'BULK_STUDENT_ONBOARDING'
          })
        });
      } catch (e) {
        console.warn('Email dispatch warning:', e.message);
        emailStatus = 'DISPATCHED_LOCAL';
      }

      results.push({
        status: 'SUCCESS',
        index: i + 1,
        id: studentId,
        name,
        email,
        branch,
        sem,
        password: generatedPassword,
        emailStatus
      });
    }

    setDb(prev => {
      const updatedList = structureAndDeduplicateStudents([
        ...(prev.users?.students || []),
        ...addedStudents
      ]);
      try {
        localStorage.setItem('nitte_saved_students', JSON.stringify(updatedList));
      } catch (e) { }
      return {
        ...prev,
        users: {
          ...prev.users,
          students: updatedList
        }
      };
    });

    return {
      success: true,
      message: `Successfully processed ${results.length} student records.`,
      count: results.length,
      successCount: results.length,
      totalProcessed: students.length,
      results
    };
  };

  const bulkUploadMentors = async (mentors) => {
    try {
      const res = await fetch('/api/admin/bulk-upload-mentors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentors })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.results && Array.isArray(data.results)) {
          const registered = data.results
            .filter(r => r.status === 'SUCCESS')
            .map(r => ({
              id: r.id,
              name: r.name,
              email: r.email,
              dept: r.dept || 'CSE',
              class: r.class || 'Assigned Mentees',
              password: r.password
            }));

          setDb(prev => {
            const current = structureAndDeduplicateMentors([
              ...(prev.users?.mentors || []),
              ...registered
            ]);
            try {
              localStorage.setItem('nitte_saved_mentors', JSON.stringify(current));
            } catch (e) { }
            return {
              ...prev,
              users: {
                ...prev.users,
                mentors: current
              }
            };
          });
        }
        return data;
      }
    } catch (err) {
      console.warn('[DatabaseContext] Backend bulk-upload-mentors offline, running client dispatch:', err.message);
    }

    const results = [];
    const addedMentors = [];

    (mentors || []).forEach((m, i) => {
      const rawId = extractRosterField(m, ['mentor id', 'mentorid', 'faculty id', 'facultyid', 'id'], `M-${101 + i}`);
      const rawName = extractRosterField(m, ['mentor name', 'mentorname', 'faculty name', 'facultyname', 'name', 'full name'], `Faculty Mentor ${i + 1}`);
      const rawEmail = extractRosterField(m, ['mentor email', 'mentoremail', 'faculty email', 'facultyemail', 'email', 'gmail', 'mail'], 'skandhayashu2906@gmail.com');
      const dept = extractRosterField(m, ['department', 'dept', 'branch'], 'CSE');
      const assignedClass = extractRosterField(m, ['assigned class / batch', 'assigned class', 'assigned batch', 'class', 'batch', 'mentees'], `${dept} 5th Sem - Batch A`);
      const mentorId = String(rawId).trim().toUpperCase();
      const name = String(rawName).trim();
      const email = String(rawEmail).trim().toLowerCase();
      const password = m.password && String(m.password).trim() ? String(m.password).trim() : `Nit#Mnt${Math.floor(1000 + Math.random() * 9000)}`;

      const newMentor = {
        id: mentorId,
        name,
        email,
        dept,
        class: assignedClass,
        password
      };

      addedMentors.push(newMentor);
      results.push({
        status: 'SUCCESS',
        index: i + 1,
        id: mentorId,
        name,
        email,
        dept,
        class: assignedClass,
        password
      });
    });

    setDb(prev => {
      const updatedList = structureAndDeduplicateMentors([
        ...(prev.users?.mentors || []),
        ...addedMentors
      ]);
      try {
        localStorage.setItem('nitte_saved_mentors', JSON.stringify(updatedList));
      } catch (e) { }
      return {
        ...prev,
        users: {
          ...prev.users,
          mentors: updatedList
        }
      };
    });

    return {
      success: true,
      message: `Successfully processed ${results.length} mentor records.`,
      count: results.length,
      successCount: results.length,
      totalProcessed: mentors.length,
      results
    };
  };

  const addSingleMentor = async (mentorData) => {
    if (!mentorData) return { success: false, message: 'Mentor data is required.' };
    return await bulkUploadMentors([mentorData]);
  };

  const bulkUploadRos = async (ros) => {
    try {
      const res = await fetch('/api/admin/bulk-upload-ros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ros })
      });
      if (res.ok) {
        const data = await res.json();
        await fetchDbState();
        return data;
      }
    } catch (err) {
      console.warn('[DatabaseContext] Backend bulk-upload-ros offline, falling back to local processing:', err.message);
    }

    const results = [];
    const addedRos = [];

    (ros || []).forEach((r, i) => {
      const rawId = r.id || r.roId || r['RO ID'] || `RO${100 + i}`;
      const rawName = r.name || r.roName || r.Name || r['RO Name'] || 'Relationship Officer';
      const rawEmail = r.email || r.Email || r.gmail || r['Gmail'] || r['RO Gmail'] || `${String(rawId).toLowerCase()}@nitte.edu.in`;
      const category = r.category || r.Category || 'Academic & Attendance Support';
      const roId = String(rawId).trim().toUpperCase();
      const name = String(rawName).trim();
      const email = String(rawEmail).trim().toLowerCase();
      const password = r.password && String(r.password).trim() ? String(r.password).trim() : `Ro#${Math.floor(1000 + Math.random() * 9000)}`;

      const newRo = {
        id: roId,
        name,
        email,
        category,
        phone: r.phone || '9876543210',
        password
      };

      addedRos.push(newRo);
      results.push({
        status: 'SUCCESS',
        index: i + 1,
        id: roId,
        name,
        email,
        category,
        password,
        emailStatus: 'DELIVERED_GMAIL'
      });
    });

    setDb(prev => {
      const existing = prev.users?.ros || [];
      const updatedList = [...existing];
      addedRos.forEach(ro => {
        const idx = updatedList.findIndex(e => e.id?.toUpperCase() === ro.id.toUpperCase());
        if (idx >= 0) updatedList[idx] = ro;
        else updatedList.push(ro);
      });
      return {
        ...prev,
        users: {
          ...prev.users,
          ros: updatedList
        }
      };
    });

    return {
      success: true,
      message: `Successfully processed ${results.length} Relationship Officer records.`,
      count: results.length,
      results
    };
  };

  return (
    <DatabaseContext.Provider value={{
      db,
      loading,
      error,
      isPgConnected,
      currentUser,
      setCurrentUser,
      authenticatedUser,
      isDemoLimitBypassed,
      toggleDemoLimitBypass,
      loginUser,
      logoutUser,
      registerStudent,
      submitIssue,
      scheduleRoMeeting,
      scheduleAdminMeeting,
      submitFeedback,
      addResource,
      addGroupSession,
      submitMentorSessionRecord,
      updateMeetingStatus,
      resolveIssue,
      reopenIssue,
      escalateIssue,
      adminResolveIssue,
      reassignIssue,
      resetDatabase,
      fetchGmailLogs,
      sendCustomEmail,
      simulateGmailResponse,
      bulkUploadStudents,
      bulkUploadMentors,
      bulkUploadRos,
      saveMeetingRecording,
      updateCategoryVideo,
      submitRoMeetingFeedback,
      getYoutubeEmbedUrl,
      submitMentorFeedback,
      updateMentorSchedule,
      shootMentorGmailAlert,
      passMentorSession,
      unpassMentorSession,
      shootMentorDeadlineAlert,
      branches,
      addBranch,
      removeBranch,
      updateBranch,
      resetBranchesToDefault,
      assignStudentsToMentor,
      isMatchingMentorId,
      removeStudent,
      removeMentor,
      addSingleMentor
    }}>
      {children}
    </DatabaseContext.Provider>
  );
};
