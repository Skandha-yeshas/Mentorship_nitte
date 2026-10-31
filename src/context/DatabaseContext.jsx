import React, { createContext, useState, useEffect, useRef } from 'react';
import { apiFetch as fetch } from '../utils/apiFetch.js';
import { clearPrivateCaches, safeCacheSetItem, initializePrivateCaches } from '../utils/sessionCache.js';
import { stripSecrets } from '../../shared/sanitization.js';
initializePrivateCaches();
import { createRecordingApi } from '../utils/recordingApi.js';
import { mergeRecordingArchive } from '../../shared/meetingRecordings.js';
import { getGrievanceQuota, getQuotaLockMessage } from '../../shared/grievanceQuota.js';
import { getCategoryVideoUpdate } from '../../shared/categoryGuidance.js';
import { normalizeRoRosterRow, findRoForCategory, clearResetGrievanceCaches } from '../../shared/roCatalog.js';
import { createMeetingScheduleEvent, getMeetingReassignmentCount, MEETING_REASSIGNMENT_LIMIT } from '../../shared/meetingReassignments.js';
import { getMeetingIssueId, getUniqueMeetings, mergeMeetingRecord } from '../utils/roMeetings';
import {
  generateStudentOnboardingEmailHtml,
  generateStudentOnboardingEmailText,
  generateRoMeetingScheduledEmailHtml,
  generateRoMeetingScheduledEmailText
} from '../utils/studentEmailTemplate';
import {
  generateMentorOnboardingEmailHtml,
  generateMentorOnboardingEmailText
} from '../utils/mentorEmailTemplate';

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

// Issue categories are derived from imported RO records.

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
    const isCleaned = localStorage.getItem('nitte_clean_state_v5');
    if (!isCleaned) {
      localStorage.removeItem('nitte_saved_students');
      safeCacheSetItem('nitte_saved_students', JSON.stringify([]));
      safeCacheSetItem('nitte_clean_state_v5', 'true');
    }
  } catch (e) { }
}

export const DEFAULT_STUDENTS = [];

export const DEFAULT_FACULTY_MENTORS = [];

// Clean Database State
const MOCK_DB = {
  users: {
    students: [],
    mentors: [],
    ros: []
  },
  issues: [],
  meetings: [],
  groupSessions: [],
  resources: [],
  mentorSessionRecords: [],
  mentoringSchedules: {},
  mentorFeedbacks: [],
  systemLogs: [],
  gmailAddress: '',
  gmailLogs: [],
  categoryVideos: []
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

    const structuredMentor = {
      id,
      name,
      email,
      dept,
      class: assignedClass,
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
  const recordingActorRef = useRef(null);
  const recordingApiRef = useRef(null);
  if (!recordingApiRef.current) recordingApiRef.current = createRecordingApi({ getActor: () => recordingActorRef.current });
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
      safeCacheSetItem('nitte_managed_branches', JSON.stringify(updated));
    } catch (e) { }
    return newBranch;
  };

  const removeBranch = (branchCode) => {
    const cleanCode = (branchCode || '').trim().toUpperCase();
    const updated = branches.filter(b => b.code.toUpperCase() !== cleanCode);
    setBranches(updated);
    try {
      safeCacheSetItem('nitte_managed_branches', JSON.stringify(updated));
    } catch (e) { }
  };

  const updateBranch = (branchCode, updatedData) => {
    const cleanCode = (branchCode || '').trim().toUpperCase();
    const updated = branches.map(b => b.code.toUpperCase() === cleanCode ? { ...b, ...updatedData } : b);
    setBranches(updated);
    try {
      safeCacheSetItem('nitte_managed_branches', JSON.stringify(updated));
    } catch (e) { }
  };

  const resetBranchesToDefault = () => {
    setBranches(DEFAULT_COLLEGE_BRANCHES);
    try {
      safeCacheSetItem('nitte_managed_branches', JSON.stringify(DEFAULT_COLLEGE_BRANCHES));
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
        safeCacheSetItem('nitte_saved_students', JSON.stringify(updatedStudents));
        safeCacheSetItem('nitte_saved_mentors', JSON.stringify(updatedMentors));
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

    // Direct Supabase Cloud persistence
    try {
      const SUPABASE_URL = 'https://tadfbhczpmnyouoailds.supabase.co';
      const SUPABASE_KEY = 'sb_publishable_JcJbgPJnh3ecRyMqqpetEg_r-q3IZLO';
      const sbHeaders = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      };
      if (studentIdsToAssign && studentIdsToAssign.length > 0) {
        studentIdsToAssign.forEach(id => {
          fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${encodeURIComponent(String(id).trim().toUpperCase())}`, {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify({ mentor_id: cleanMentorId })
          }).catch(() => {});
        });
      }
      if (studentIdsToUnassign && studentIdsToUnassign.length > 0) {
        studentIdsToUnassign.forEach(id => {
          fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${encodeURIComponent(String(id).trim().toUpperCase())}`, {
            method: 'PATCH',
            headers: sbHeaders,
            body: JSON.stringify({ mentor_id: null })
          }).catch(() => {});
        });
      }
    } catch (e) { }

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
        safeCacheSetItem('nitte_saved_students', JSON.stringify(updatedStudents));
        safeCacheSetItem('nitte_saved_mentors', JSON.stringify(updatedMentors));
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

    // Delete directly from Supabase Cloud
    try {
      const SUPABASE_URL = 'https://tadfbhczpmnyouoailds.supabase.co';
      const SUPABASE_KEY = 'sb_publishable_JcJbgPJnh3ecRyMqqpetEg_r-q3IZLO';
      await fetch(`${SUPABASE_URL}/rest/v1/students?id=eq.${encodeURIComponent(cleanId)}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
    } catch (e) { }

    // Notify backend / Vite proxy
    try {
      fetch('/api/admin/delete-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: cleanId })
      }).catch(() => {});
    } catch (e) { }

    return { success: true, studentId: cleanId };
  };

  const removeAllStudents = async () => {
    // 1. Direct Supabase Cloud remove all students
    try {
      const SUPABASE_URL = 'https://tadfbhczpmnyouoailds.supabase.co';
      const SUPABASE_KEY = 'sb_publishable_JcJbgPJnh3ecRyMqqpetEg_r-q3IZLO';
      await fetch(`${SUPABASE_URL}/rest/v1/students?id=not.is.null`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
    } catch (e) { }

    // 2. Clear local storage
    try {
      safeCacheSetItem('nitte_saved_students', JSON.stringify([]));
    } catch (e) { }

    // 3. Update React state
    setDb(prev => {
      const updatedMentors = (prev.users?.mentors || []).map(m => ({
        ...m,
        class: '0 Assigned Mentees'
      }));
      try {
        safeCacheSetItem('nitte_saved_mentors', JSON.stringify(updatedMentors));
      } catch (e) { }

      return {
        ...prev,
        users: {
          ...prev.users,
          students: [],
          mentors: updatedMentors
        }
      };
    });

    // 4. Notify backend
    try {
      fetch('/api/admin/delete-all-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {});
    } catch (e) { }

    return { success: true };
  };

  const removeMentor = async (mentorId) => {
    if (!mentorId) return { success: false, message: 'Mentor ID is required.' };
    const cleanId = String(mentorId).trim();
    const cleanIdUpper = cleanId.toUpperCase();

    // Track deleted mentor ID so background polling never resurrects it
    try {
      const existingDeleted = JSON.parse(localStorage.getItem('nitte_deleted_mentor_ids') || '[]');
      const deletedSet = new Set(existingDeleted.map(id => String(id).toUpperCase()));
      deletedSet.add(cleanIdUpper);
      safeCacheSetItem('nitte_deleted_mentor_ids', JSON.stringify(Array.from(deletedSet)));
    } catch (e) { }

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
        safeCacheSetItem('nitte_saved_mentors', JSON.stringify(updatedMentors));
        safeCacheSetItem('nitte_saved_students', JSON.stringify(updatedStudents));
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

    // Direct Supabase Cloud delete and unassign
    try {
      const SUPABASE_URL = 'https://tadfbhczpmnyouoailds.supabase.co';
      const SUPABASE_KEY = 'sb_publishable_JcJbgPJnh3ecRyMqqpetEg_r-q3IZLO';
      const sbHeaders = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      };
      await fetch(`${SUPABASE_URL}/rest/v1/students?mentor_id=eq.${encodeURIComponent(cleanId)}`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ mentor_id: null })
      });
      await fetch(`${SUPABASE_URL}/rest/v1/mentors?id=eq.${encodeURIComponent(cleanId)}`, {
        method: 'DELETE',
        headers: sbHeaders
      });
    } catch (e) { }

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

  const removeAllMentors = async () => {
    setDb(prev => {
      const currentMentors = prev.users?.mentors || [];
      const currentStudents = prev.users?.students || [];

      // Unassign all students
      const updatedStudents = currentStudents.map(s => ({ ...s, mentorId: null }));

      // Track all deleted IDs so background polling never resurrects them
      try {
        const existingDeleted = JSON.parse(localStorage.getItem('nitte_deleted_mentor_ids') || '[]');
        const deletedSet = new Set(existingDeleted.map(id => String(id).toUpperCase()));
        currentMentors.forEach(m => {
          if (m.id) deletedSet.add(String(m.id).toUpperCase());
        });
        safeCacheSetItem('nitte_deleted_mentor_ids', JSON.stringify(Array.from(deletedSet)));
        safeCacheSetItem('nitte_saved_mentors', JSON.stringify([]));
        safeCacheSetItem('nitte_saved_students', JSON.stringify(updatedStudents));
      } catch (e) { }

      return {
        ...prev,
        users: {
          ...prev.users,
          mentors: [],
          students: updatedStudents
        }
      };
    });

    // Direct Supabase Cloud remove all mentors and unassign
    try {
      const SUPABASE_URL = 'https://tadfbhczpmnyouoailds.supabase.co';
      const SUPABASE_KEY = 'sb_publishable_JcJbgPJnh3ecRyMqqpetEg_r-q3IZLO';
      const sbHeaders = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      };
      await fetch(`${SUPABASE_URL}/rest/v1/students?mentor_id=not.is.null`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ mentor_id: null })
      });
      await fetch(`${SUPABASE_URL}/rest/v1/mentors?id=not.is.null`, {
        method: 'DELETE',
        headers: sbHeaders
      });
    } catch (e) { }

    // Notify backend / Vite proxy
    try {
      await fetch('/api/admin/delete-all-mentors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (e) { }

    return { success: true };
  };

  const restoreDefaultMentors = () => {
    try {
      localStorage.removeItem('nitte_deleted_mentor_ids');
    } catch (e) { }
    return { success: true, count: (db.users?.mentors || []).length };
  };

  const removeRo = async (roId) => {
    if (!roId) return { success: false, message: 'RO ID is required.' };
    const cleanId = String(roId).trim().toUpperCase();

    setDb(prev => {
      const currentRos = prev.users?.ros || [];
      const updatedRos = currentRos.filter(r => (r.id || '').toUpperCase() !== cleanId);
      try {
        safeCacheSetItem('nitte_saved_ros', JSON.stringify(updatedRos));
      } catch (e) { }
      return {
        ...prev,
        users: {
          ...prev.users,
          ros: updatedRos
        }
      };
    });

    try {
      await fetch('/api/admin/delete-ro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roId: cleanId })
      });
    } catch (e) { }

    return { success: true, roId: cleanId };
  };

  const authUserRef = useRef(null);
  const refreshInFlightRef = useRef(null);
  const [db, setDbInternal] = useState(() => structuredClone(MOCK_DB));
  const setDb = update => setDbInternal(previous => stripSecrets(typeof update === 'function' ? update(previous) : update));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPgConnected, setIsPgConnected] = useState(false);

  // Fetch full state from backend or fallback to MOCK_DB if offline
  const fetchDbState = async () => {
    if (!authUserRef.current) { setLoading(false); return; }
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const currentActor = `${authUserRef.current.role}:${authUserRef.current.id}`;
    refreshInFlightRef.current = (async () => {
      try {
        const response = await fetch('/api/db-state', { cache: 'no-store' });
        if (response.status === 401) {
          clearPrivateCaches(); authUserRef.current = null; setAuthenticatedUser(null);
          setDb(structuredClone(MOCK_DB)); setError(null); return;
        }
        if (!response.ok) throw new Error('Your dashboard could not be refreshed. Please retry.');
        const data = await response.json();
        if (!authUserRef.current || currentActor !== `${authUserRef.current.role}:${authUserRef.current.id}`) return;
        if (data.authenticatedUser && (data.authenticatedUser.id !== authUserRef.current.id || data.authenticatedUser.role !== authUserRef.current.role)) {
          clearPrivateCaches(); authUserRef.current = data.authenticatedUser;
          setAuthenticatedUser(data.authenticatedUser); setCurrentUser(data.authenticatedUser.role);
        }
        clearResetGrievanceCaches(localStorage, data.grievanceResetVersion);
        let recordings = [];
        if (['RO', 'Admin'].includes(authUserRef.current?.role)) {
          try { recordings = await recordingApiRef.current.list(); } catch { /* A recording upload can be retried independently. */ }
        }
        setDb({ ...structuredClone(MOCK_DB), ...data, recordings });
        setIsPgConnected(data.isPgConnected !== false); setError(null);
      } catch (failure) { setError(failure.message || 'Your dashboard is temporarily unavailable.'); }
      finally { setLoading(false); refreshInFlightRef.current = null; }
    })();
    return refreshInFlightRef.current;
  };

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') fetchDbState(); };
    const timer = setInterval(refresh, 3000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const channels = ['nitte_meeting_sync', 'nitte_state_sync', 'nitte_category_video_sync', 'nitte_feedback_sync']
      .map(name => { try { const channel = new BroadcastChannel(name); channel.onmessage = refresh; return channel; } catch { return null; } });
    return () => {
      clearInterval(timer); window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh); channels.forEach(channel => channel?.close());
    };
  }, []);

  useEffect(() => {
    safeCacheSetItem('curr_user_role', currentUser);
  }, [currentUser]);

  const [isDemoLimitBypassed, setIsDemoLimitBypassed] = useState(false);
  const toggleDemoLimitBypass = () => setIsDemoLimitBypassed(prev => !prev);

  // Issue submission uses the server's authoritative seven-day quota guard.
  const submitIssue = async (studentId, category, description, priority) => {
    const cleanStudentId = String(studentId || authenticatedUser?.id || '').trim();
    const student = (db.users?.students || []).find(s => s.id && String(s.id).trim().toLowerCase() === cleanStudentId.toLowerCase()) ||
      (authenticatedUser && String(authenticatedUser.id || '').trim().toLowerCase() === cleanStudentId.toLowerCase() ? authenticatedUser : null) ||
      authenticatedUser ||
      { id: cleanStudentId, name: 'Student' };
    const effectiveStudentId = student.id || cleanStudentId;
    const effectiveStudentName = student.name || 'Student';

    const ro = findRoForCategory(db.users?.ros || [], category);
    if (!ro) throw new Error('This issue category has no imported Relationship Officer. Please contact Admin.');
    const roId = ro.id;

    const localQuota = getGrievanceQuota({ issues: db.issues || [], studentId: effectiveStudentId });
    if (localQuota.isLocked) {
      const error = new Error(getQuotaLockMessage(localQuota));
      error.quota = localQuota;
      throw error;
    }
    let initialStatus = 'Assigned to RO';
    const logText = `Ticket raised by ${effectiveStudentName} and assigned to ${roId}.`;

    let timestamp = new Date().toISOString();
    let issueId = null;

    // 1. PRIMARY AUTHORITATIVE CALL: Dispatch to backend /api/issues
    // The backend creates ONE single issue, persists to PostgreSQL, syncs to Supabase, and sends Gmail
    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: effectiveStudentId,
          studentName: effectiveStudentName,
          category,
          description,
          priority
        })
      });

      if (res.ok) {
        const data = await res.json();
        issueId = data.id;
        timestamp = data.createdAt || timestamp;
        if (data.status) initialStatus = data.status;
      } else {
        const errJson = await res.json().catch(() => ({}));
        const error = new Error(errJson.error || `Failed to submit issue (HTTP ${res.status})`);
        error.quota = errJson.quota;
        throw error;
      }
    } catch (apiErr) {
      if (apiErr.quota || !['Failed to fetch', 'NetworkError'].some(message => apiErr.message?.includes(message))) throw apiErr;
      throw new Error('Unable to verify the grievance quota. Please try again when the server is available.');
    }

    if (!issueId) throw new Error('Unable to verify the grievance quota. Please try again when the server is available.');

    const newIssueObj = {
      id: issueId,
      studentId: effectiveStudentId,
      student_id: effectiveStudentId,
      studentName: effectiveStudentName,
      student_name: effectiveStudentName,
      category,
      description,
      priority,
      status: initialStatus,
      roId,
      ro_id: roId,
      roName: ro.name,
      createdAt: timestamp,
      created_at: timestamp,
      logs: [{ time: new Date().toLocaleString(), text: logText }]
    };

    // 3. Update local React state & localStorage with only this single issue
    setDb(prev => {
      const prevWithoutSameId = (prev.issues || []).filter(i => (i.id || i.issue_id)?.toUpperCase() !== issueId.toUpperCase());
      const updatedIssues = [newIssueObj, ...prevWithoutSameId];
      try {
        safeCacheSetItem('nitte_saved_issues', JSON.stringify(updatedIssues));
      } catch (e) { }
      return { ...prev, issues: updatedIssues };
    });

    // 4. Trigger state refresh
    fetchDbState().catch(() => {});

    return issueId;
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
      issue.status === 'Meeting Started'
    );

    if (isReschedule && getMeetingReassignmentCount(issue, existingMeet) >= MEETING_REASSIGNMENT_LIMIT) {
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
      discussionSummary: '',
      feedbackSubmittedAt: null,
      actionItems: cleanActions || (existingMeet ? existingMeet.actionItems : ''),
      status: 'Confirmed',
      endedByRo: false,
      endedAt: null
    };
    const scheduleEventId = `schedule:${crypto.randomUUID()}`;
    const scheduleEvent = createMeetingScheduleEvent({
      id: scheduleEventId, timestamp: new Date().toISOString(), isReschedule,
      meetingId: newMeeting.id, date, time, mode: mode || 'Offline', location: meetingLocation,
      roId, feedback: cleanFeedback, discussionMinutes: cleanMinutes
    });

    // 1. Instantly update local React state and localStorage so Student & RO Dashboards update immediately
    setDb(prev => {
      const updatedMeetings = [...(prev.meetings || []).filter(m => (m.issueId || m.issue_id)?.toUpperCase() !== issueId?.toUpperCase()), newMeeting];
      const updatedIssues = (prev.issues || []).map(i => (i.id || i.issue_id)?.toUpperCase() === issueId?.toUpperCase() ? {
        ...i,
        status: 'Meeting Scheduled',
        logs: [...(i.logs || []), scheduleEvent]
      } : i);

      try {
        safeCacheSetItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
        safeCacheSetItem('nitte_saved_issues', JSON.stringify(updatedIssues));
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
          log: scheduleEvent
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
          id: newMeeting.id,
          scheduleEventId,
          isReschedule,
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

    // Direct Supabase Cloud persistence
    try {
      const SUPABASE_URL = 'https://tadfbhczpmnyouoailds.supabase.co';
      const SUPABASE_KEY = 'sb_publishable_JcJbgPJnh3ecRyMqqpetEg_r-q3IZLO';
      const sbHeaders = {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      };
      fetch(`${SUPABASE_URL}/rest/v1/meetings`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({
          id: newMeeting.id,
          issue_id: issueId,
          student_id: validStudentId,
          student_name: studentName,
          ro_id: roId,
          date,
          time,
          mode: mode || 'Offline',
          location: meetingLocation,
          notes: finalNotes,
          status: 'Confirmed'
        })
      }).catch(e => console.warn('Supabase meeting sync warning:', e.message));

      fetch(`${SUPABASE_URL}/rest/v1/issues?id=eq.${issueId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'Meeting Scheduled' })
      }).catch(e => console.warn('Supabase issue status sync warning:', e.message));
    } catch (e) { }
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
        safeCacheSetItem('nitte_saved_issues', JSON.stringify(updatedIssues));
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
    const mentor = (db.users?.mentors || []).find(m => m.id === mentorId);
    const mentorName = mentor ? mentor.name : 'Faculty Mentor';
    const newSess = {
      id: `GS-${Date.now()}`,
      mentorId,
      mentorName,
      title,
      dateTime,
      description,
      link,
      meetLink: link
    };

    setDb(prev => ({ ...prev, groupSessions: [newSess, ...(prev.groupSessions || [])] }));

    // Sync live to Supabase Cloud
    try {
      const SUPABASE_URL = 'https://tadfbhczpmnyouoailds.supabase.co';
      const SUPABASE_KEY = 'sb_publishable_JcJbgPJnh3ecRyMqqpetEg_r-q3IZLO';
      await fetch(`${SUPABASE_URL}/rest/v1/group_sessions`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: newSess.id,
          mentor_id: mentorId,
          mentor_name: mentorName,
          title,
          date_time: dateTime,
          description,
          link
        })
      });
    } catch (e) { }

    // Also notify local Express server if running
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId, mentorName, title, dateTime, description, link })
      });
    } catch (err) { }
  };

  const submitMentorSessionRecord = async (mentorId, topic, sessionDate, studentsAttended, notes, whichClass, location, status = 'Submitted') => {
    const mentor = (db.users?.mentors || []).find(m => isMatchingMentorId(m.id, mentorId));
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
      status: status || 'Submitted',
      createdAt: new Date().toISOString()
    };

    // 1. Instantly update local React state and localStorage cache
    setDb(prev => {
      const existing = (prev.mentorSessionRecords || []).filter(
        r => r.id !== newRec.id && !(isMatchingMentorId(r.mentorId, mentorId) && r.sessionDate === sessionDate && r.status === 'Draft' && status === 'Submitted')
      );
      const updatedList = [newRec, ...existing];
      try {
        safeCacheSetItem('nitte_saved_mentor_records', JSON.stringify(updatedList));
      } catch (e) { }
      return {
        ...prev,
        mentorSessionRecords: updatedList
      };
    });

    // 2. Direct Supabase Cloud persistence
    try {
      const SUPABASE_URL = 'https://tadfbhczpmnyouoailds.supabase.co';
      const SUPABASE_KEY = 'sb_publishable_JcJbgPJnh3ecRyMqqpetEg_r-q3IZLO';
      await fetch(`${SUPABASE_URL}/rest/v1/mentor_session_records`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation,resolution=merge-duplicates'
        },
        body: JSON.stringify({
          id: newRec.id,
          mentor_id: mentorId,
          session_date: sessionDate,
          students_attended: parseInt(studentsAttended) || 0,
          topic: topic,
          notes: notes || '',
          which_class: whichClass || mentor?.class || '6th Sem CSE-A',
          location: location || 'Seminar Hall 1 (Admin Block)',
          status: newRec.status
        })
      });
    } catch (sbErr) {
      console.warn('Direct Supabase Cloud session record persistence note:', sbErr?.message || sbErr);
    }

    // 3. Backend API sync
    try {
      const res = await fetch('/api/mentor/session-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newRec.id,
          mentorId,
          topic,
          sessionDate,
          studentsAttended,
          notes,
          whichClass,
          location,
          status: newRec.status
        })
      });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.warn('Backend sync failed for session record, relying on updated local state.', err);
    }

    return newRec;
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
        safeCacheSetItem('nitte_saved_mentor_schedules', JSON.stringify(updatedSchedules));
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
        safeCacheSetItem('nitte_saved_mentor_schedules', JSON.stringify(updatedSchedules));
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
        safeCacheSetItem('nitte_saved_mentor_schedules', JSON.stringify(updatedSchedules));
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
        safeCacheSetItem('nitte_saved_mentor_schedules', JSON.stringify(updatedSchedules));
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
        safeCacheSetItem('nitte_saved_mentor_schedules', JSON.stringify(updatedSchedules));
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
        safeCacheSetItem('nitte_saved_mentor_feedbacks', JSON.stringify(updated));
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
        safeCacheSetItem('nitte_saved_meetings', JSON.stringify(updated));
        safeCacheSetItem('nitte_saved_issues', JSON.stringify(updatedIssues));
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

    // 3. Direct Supabase Cloud persistence
    try {
      const SUPABASE_URL = 'https://tadfbhczpmnyouoailds.supabase.co';
      const SUPABASE_KEY = 'sb_publishable_JcJbgPJnh3ecRyMqqpetEg_r-q3IZLO';
      const sbHeaders = {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json'
      };
      fetch(`${SUPABASE_URL}/rest/v1/meetings?or=(id.eq.${meetId},issue_id.eq.${meetId})`, {
        method: 'PATCH',
        headers: sbHeaders,
        body: JSON.stringify({ status })
      }).catch(e => console.warn('Supabase meeting status patch warning:', e.message));

      if (status === 'Started') {
        fetch(`${SUPABASE_URL}/rest/v1/issues?id=eq.${meetId}`, {
          method: 'PATCH',
          headers: sbHeaders,
          body: JSON.stringify({ status: 'Meeting Started' })
        }).catch(e => console.warn('Supabase issue meeting started warning:', e.message));
      }
    } catch (e) { }
  };

  const loadMeetingRecording = id => recordingApiRef.current.get(id);

  const saveMeetingRecording = async (meetingId, issueId, durationSeconds, blob, transcriptSummary, { recordingId } = {}) => {
    const recording = await recordingApiRef.current.save({ recordingId: recordingId || `REC-${crypto.randomUUID()}`, meetingId, issueId, durationSeconds, blob, transcriptSummary });
    const logText = `Meeting recording saved to the database (${recording.duration} seconds).`;
    setDb(prev => {
      const recordings = ['RO', 'Admin'].includes(recordingActorRef.current?.role)
        ? [recording, ...(prev.recordings || []).filter(existing => existing.id !== recording.id)] : [];
      try { safeCacheSetItem('nitte_saved_recordings', JSON.stringify(recordings)); } catch { }
      return {
        ...prev, recordings,
        issues: (prev.issues || []).map(issue => String(issue.id || issue.issue_id).toUpperCase() === String(issueId).toUpperCase()
          ? { ...issue, logs: [...(issue.logs || []), { id: `recording:${recording.id}`, text: logText, time: recording.recordedAt, actor: recording.roId }] }
          : issue)
      };
    });
    return recording;
  };

  // RO Action: Submit Post-Meeting Discussion Minutes & Feedback
  const submitRoMeetingFeedback = async (meetId, issueId, roId, { discussionSummary, actionItems, outcome, followUpNeeded }) => {
    const timestamp = new Date().toLocaleString();
    const cleanDiscussion = (discussionSummary || '').trim();
    const cleanActions = (actionItems || '').trim();
    if (!cleanDiscussion) throw new Error('Please enter the meeting discussion summary before submitting feedback.');
    const feedbackSubmittedAt = new Date().toISOString();

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
          feedbackSubmittedAt,
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
          feedbackSubmittedAt,
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
        safeCacheSetItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
        safeCacheSetItem('nitte_saved_issues', JSON.stringify(updatedIssues));
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
          actionItems: cleanActions,
          outcome,
          followUpNeeded
        })
      });
    } catch (e) {
      console.warn('Failed to persist meeting feedback to backend:', e);
    }
  };

  // RO Action: Update or add YouTube guidance video for a category
  const updateCategoryVideo = async (category, videoUrl, title, description, roId, { noVideo = false } = {}) => {
    const cleanCat = (category || '').trim();
    const setting = getCategoryVideoUpdate({ videoUrl, noVideo });
    // Publish only after the server accepts the category's video availability setting.
    const response = await fetch(`/api/category-videos/${encodeURIComponent(cleanCat)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: cleanCat, videoUrl: setting.videoUrl, title, description, roId, noVideo: setting.noVideo })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Could not save the category guidance setting. Please try again.');
    }
    const updatedEntry = {
      category: cleanCat,
      title: title || `${cleanCat} Guidance Video`,
      videoUrl: setting.videoUrl,
      video_url: setting.videoUrl,
      noVideo: setting.noVideo,
      videoAvailable: !setting.noVideo,
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
        safeCacheSetItem('nitte_saved_category_videos', JSON.stringify(merged));
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

    await fetchDbState();
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
        safeCacheSetItem('nitte_saved_issues', JSON.stringify(updatedIssues));
        safeCacheSetItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
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

    // Direct Supabase Cloud update (guarantees real-time cross-developer sync)
    try {
      const SUPABASE_URL = 'https://tadfbhczpmnyouoailds.supabase.co';
      const SUPABASE_KEY = 'sb_publishable_JcJbgPJnh3ecRyMqqpetEg_r-q3IZLO';
      fetch(`${SUPABASE_URL}/rest/v1/issues?id=eq.${encodeURIComponent(issueId)}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'Resolved',
          resolved_at: timestamp,
          resolution_notes: resolutionNotes
        })
      }).catch(() => {});
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

    const newStatus = 'Re-opened by Student';
    const logMsg = `Ticket re-opened by student due to unsatisfied resolution: ${reason || 'Additional advice required.'}`;

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
        safeCacheSetItem('nitte_saved_issues', JSON.stringify(updatedIssues));
        safeCacheSetItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
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
        safeCacheSetItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
        safeCacheSetItem('nitte_saved_issues', JSON.stringify(updatedIssues));
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
        safeCacheSetItem('nitte_saved_issues', JSON.stringify(updatedIssues));
        safeCacheSetItem('nitte_saved_meetings', JSON.stringify(updatedMeetings));
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

    // Direct Supabase Cloud update (guarantees cross-developer sync)
    try {
      const SUPABASE_URL = 'https://tadfbhczpmnyouoailds.supabase.co';
      const SUPABASE_KEY = 'sb_publishable_JcJbgPJnh3ecRyMqqpetEg_r-q3IZLO';
      fetch(`${SUPABASE_URL}/rest/v1/issues?id=eq.${encodeURIComponent(cleanId)}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          status: 'Resolved',
          resolved_at: timestamp,
          resolution_notes: resolutionNotes
        })
      }).catch(() => {});
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
        safeCacheSetItem('nitte_saved_issues', JSON.stringify(updatedIssues));
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

  const [authenticatedUser, setAuthenticatedUser] = useState(null);
  recordingActorRef.current = authenticatedUser && ['RO', 'Admin'].includes(authenticatedUser.role) ? authenticatedUser : null;
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!response.ok) { if (response.status !== 401) throw new Error('Sign-in verification is temporarily unavailable.'); return; }
        const { user } = await response.json();
        if (!disposed && user) {
          clearPrivateCaches(); authUserRef.current = user; setAuthenticatedUser(user); setCurrentUser(user.role);
          await fetchDbState();
        }
      } catch (failure) { if (!disposed) setError(failure.message); }
      finally { if (!disposed) setLoading(false); }
    })();
    return () => { disposed = true; };
  }, []);

  const loginUser = async (identifier, password, role) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: String(identifier || '').trim(), password, role })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Sign-in failed.');
    clearPrivateCaches(); authUserRef.current = result.user;
    setDb(structuredClone(MOCK_DB)); setAuthenticatedUser(result.user); setCurrentUser(result.user.role);
    setLoading(true); setError(null);
    await fetchDbState();
    return result;
  };

  const logoutUser = async () => {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (!response.ok && response.status !== 401) throw new Error('Could not end the server session. Please retry.');
    clearPrivateCaches(); authUserRef.current = null; recordingActorRef.current = null;
    setAuthenticatedUser(null); setDb(structuredClone(MOCK_DB)); setError(null); setLoading(false);
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

  const bulkUploadStudents = async (rows) => {
    const students = rows.map(row => ({
      ...row,
      id: extractRosterField(row, ['student id', 'student usn', 'usn', 'id', 'roll no'], ''),
      name: extractRosterField(row, ['student name', 'name', 'full name'], ''),
      email: extractRosterField(row, ['official email', 'student email', 'email', 'gmail', 'mail'], ''),
      mentorId: extractRosterField(row, ['mentor id', 'mentorId', 'mentor_id'], ''),
      branch: extractRosterField(row, ['branch', 'department', 'dept'], ''),
      sem: extractRosterField(row, ['semester', 'sem'], ''),
      password: extractRosterField(row, ['initial password', 'password'], '')
    }));
    const response = await fetch('/api/admin/bulk-upload-students', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ students })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Student roster import failed.');
    await fetchDbState();
    return { ...result, count: result.successCount ?? result.count ?? 0 };
  };

  const bulkUploadMentors = async (rows) => {
    const mentors = rows.map(row => ({
      ...row,
      id: extractRosterField(row, ['mentor id', 'faculty id', 'id'], ''),
      name: extractRosterField(row, ['mentor name', 'faculty name', 'name', 'full name'], ''),
      email: extractRosterField(row, ['official email', 'mentor email', 'faculty email', 'email', 'gmail'], ''),
      dept: extractRosterField(row, ['department', 'dept', 'branch'], ''),
      class: extractRosterField(row, ['assigned class / batch', 'assigned class', 'class', 'batch'], ''),
      password: extractRosterField(row, ['initial password', 'password'], '')
    }));
    const response = await fetch('/api/admin/bulk-upload-mentors', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mentors })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Mentor roster import failed.');
    await fetchDbState();
    return { ...result, count: result.successCount ?? result.count ?? 0 };
  };

  const bulkUploadRos = async (rows) => {
    const ros = rows.map(normalizeRoRosterRow);
    const response = await fetch('/api/admin/bulk-upload-ros', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ros })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'RO roster import failed.');
    const saved = (result.results || []).filter(row => row.status === 'SUCCESS').map(row => ({ ...row, category: row.region }));
    setDb(previous => {
      const roster = new Map((previous.users?.ros || []).map(ro => [ro.id.toUpperCase(), ro]));
      saved.forEach(ro => roster.set(ro.id.toUpperCase(), ro));
      const ros = [...roster.values()];
      safeCacheSetItem('nitte_saved_ros', JSON.stringify(ros));
      return { ...previous, users: { ...previous.users, ros } };
    });
    await fetchDbState();
    return { ...result, count: result.successCount };
  };

  const addSingleMentor = async row => {
    const result = await bulkUploadMentors([row]);
    if (!result.successCount) throw new Error(result.results?.[0]?.reason || 'Mentor account could not be saved.');
    return result;
  };
  const addSingleRo = async row => {
    const result = await bulkUploadRos([row]);
    if (!result.successCount) throw new Error(result.results?.[0]?.reason || 'RO account could not be saved.');
    return result;
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
      loadMeetingRecording,
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
      removeAllStudents,
      removeMentor,
      removeAllMentors,
      restoreDefaultMentors,
      addSingleMentor,
      removeRo,
      addSingleRo
    }}>
      {children}
    </DatabaseContext.Provider>
  );
};
