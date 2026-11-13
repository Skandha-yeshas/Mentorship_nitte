import React, { createContext, useState, useEffect, useRef } from 'react';
import { apiFetch as fetch } from '../utils/apiFetch.js';
import { clearPrivateCaches, safeCacheSetItem, initializePrivateCaches } from '../utils/sessionCache.js';
import { stripSecrets } from '../../shared/sanitization.js';
initializePrivateCaches();
import { validateRoster } from '../../shared/rosterValidation.js';
import { createRecordingApi } from '../utils/recordingApi.js';
import { mergeRecordingArchive } from '../../shared/meetingRecordings.js';
import { getGrievanceQuota, getQuotaLockMessage } from '../../shared/grievanceQuota.js';
import { getCategoryVideoUpdate } from '../../shared/categoryGuidance.js';
import { findRoForCategory, clearResetGrievanceCaches } from '../../shared/roCatalog.js';
import { getMeetingIssueId, getUniqueMeetings, mergeMeetingRecord } from '../utils/roMeetings';
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

  // Retain the last confirmed snapshot on a transient outage.
  const fetchDbState = async ({ afterWrite = false } = {}) => {
    if (!authUserRef.current) { setLoading(false); return; }
    if (refreshInFlightRef.current) {
      await refreshInFlightRef.current;
      return afterWrite ? fetchDbState() : undefined;
    }
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
        setDb({ ...structuredClone(MOCK_DB), ...data });
        setIsPgConnected(data.isPgConnected !== false); setError(null);
      } catch (failure) { setIsPgConnected(false); setError(failure.message || 'Your dashboard is temporarily unavailable.'); }
      finally { setLoading(false); refreshInFlightRef.current = null; }
    })();
    return refreshInFlightRef.current;
  };

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') fetchDbState(); };
    const timer = setInterval(() => {
      const role = authUserRef.current?.role;
      // Meeting participants need quicker refreshes than the administrative roster.
      if (['Student', 'RO'].includes(role)) refresh();
    }, 5000);
    const rosterTimer = setInterval(() => {
      if (['Admin', 'Mentor'].includes(authUserRef.current?.role)) refresh();
    }, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const channels = ['nitte_meeting_sync', 'nitte_state_sync', 'nitte_category_video_sync', 'nitte_feedback_sync']
      .map(name => { try { const channel = new BroadcastChannel(name); channel.onmessage = refresh; return channel; } catch { return null; } });
    return () => {
      clearInterval(timer); clearInterval(rosterTimer); window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh); channels.forEach(channel => channel?.close());
    };
  }, []);

  useEffect(() => {
    safeCacheSetItem('curr_user_role', currentUser);
  }, [currentUser]);

  const [isDemoLimitBypassed, setIsDemoLimitBypassed] = useState(false);
  const toggleDemoLimitBypass = () => setIsDemoLimitBypassed(prev => !prev);

  // Issue submission uses the server's authoritative seven-day quota guard.
  // Never announce an action to other tabs or update its state before a confirmed save.
  const performAction = async (path, body, method = 'PUT') => {
    let response;
    try { response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    catch { throw new Error('The save could not be confirmed. Refresh the ticket before retrying.'); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(result.error || 'The save could not be completed. Please retry.');
      failure.quota = result.quota; throw failure;
    }
    await fetchDbState({ afterWrite: true });
    try {
      const channel = new BroadcastChannel('nitte_state_sync');
      channel.postMessage({ type: 'refresh' }); channel.close();
    } catch { /* Polling refresh remains available. */ }
    return result;
  };

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
    let ticketNumber = null;

    // 1. PRIMARY AUTHORITATIVE CALL: Dispatch to backend /api/issues
    // The backend saves one ticket and its notification queue records together.
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
        ticketNumber = data.ticketNumber;
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
      ticketNumber,
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

    return { id: issueId, ticketNumber };
  };

  const scheduleRoMeeting = async (issueId, studentId, roId, date, time, mode, location, notes, discussionMinutes, actionItems, reassignFeedback) => {
    return performAction('/api/meetings', {
      issueId, date, time, mode: mode || 'Offline', location, notes,
      discussionSummary: mode === 'Online' ? discussionMinutes : undefined, actionItems,
      reassignFeedback: reassignFeedback || (mode === 'Offline' ? discussionMinutes : undefined),
      scheduleEventId: `schedule:${crypto.randomUUID()}`
    }, 'POST');
  };

  const submitFeedback = (issueId, rating, comments) => performAction(`/api/issues/${encodeURIComponent(issueId)}/feedback`, { rating: Number(rating), comments });

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

  const sendMentorNotice = async (mentorId, kind, schedule) => {
    const response = await fetch(`/api/mentors/${encodeURIComponent(mentorId)}/notifications`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, schedule, notificationId: crypto.randomUUID() })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The email could not be processed.');
    await fetchDbState();
    return result;
  };

  const shootMentorGmailAlert = async (mentorId, customSchedule = null) => {
    const mentor = (db.users?.mentors || []).find(row => row.id === mentorId);
    if (!mentor) throw new Error('Mentor account not found.');
    const schedule = customSchedule && typeof customSchedule === 'object' ? customSchedule : db.mentoringSchedules?.[mentorId] || {};
    return sendMentorNotice(mentorId, 'schedule', { ...schedule, date: schedule.date || new Date().toISOString().slice(0, 10) });
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

  const shootMentorDeadlineAlert = async (mentorId, sessionDate) => {
    const schedule = db.mentoringSchedules?.[mentorId] || {};
    const date = sessionDate || schedule.date || new Date().toISOString().slice(0, 10);
    if (schedule.isPassed || (schedule.passedSessions || []).some(row => row.sessionDate === date)
      || (db.mentorSessionRecords || []).some(row => row.mentorId === mentorId && row.sessionDate === date)) return false;
    return sendMentorNotice(mentorId, 'deadline', { ...schedule, date });
  };

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
  const updateMeetingStatus = (meetId, status) => performAction(`/api/meetings/${encodeURIComponent(meetId)}`, { status });

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
  const submitRoMeetingFeedback = (meetId, issueId, roId, { discussionSummary, actionItems, outcome, followUpNeeded }) => {
    const summary = (discussionSummary || '').trim();
    if (!summary) throw new Error('Please enter the meeting discussion summary before submitting feedback.');
    return performAction(`/api/meetings/${encodeURIComponent(meetId)}`, {
      status: 'Completed', discussionSummary: summary, actionItems, outcome, followUpNeeded
    });
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

  const resolveIssue = (issueId, roId, resolutionNotes) => performAction(`/api/issues/${encodeURIComponent(issueId)}/resolve`, { resolutionNotes });

  const reopenIssue = (issueId, studentId, reason) => performAction(`/api/issues/${encodeURIComponent(issueId)}/reopen`, { reason });

  const escalateIssue = (issueId, roId, reason) => performAction(`/api/issues/${encodeURIComponent(issueId)}/escalate`, { reason });

  // ADMIN ACTIONS
  const scheduleAdminMeeting = async (issueId, studentId, date, time, mode, location, notes) => {
    const result = await performAction('/api/meetings', {
      issueId, date, time, mode: mode || 'Offline', location, notes, scheduleEventId: `schedule:${crypto.randomUUID()}`
    }, 'POST');
    return { success: true, meeting: { id: result.id, issueId, date, time, mode, location, notes, isAdminHearing: true } };
  };

  const adminResolveIssue = (issueId, resolutionNotes) => performAction(`/api/issues/${encodeURIComponent(issueId)}/resolve`, { resolutionNotes });

  const reassignIssue = (issueId, newRoId) => performAction(`/api/issues/${encodeURIComponent(issueId)}/reassign`, { newRoId });

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
          gmailAddress: data.gmailAddress || '',
          gmailLogs: data.logs || []
        }));
      }
    } catch (err) {
      console.warn('Failed to fetch Gmail logs via API, using current state.');
    }
  };

  const sendCustomEmail = async ({ to, subject, content, issueId }) => {
    const response = await fetch('/api/gmail/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, text: content, issueId, eventType: 'MANUAL_DISPATCH', notificationId: crypto.randomUUID() })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The email could not be processed.');
    await fetchDbState();
    return result;
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

  const [rosterImports, setRosterImports] = useState([]);
  const refreshRosterImports = async () => {
    if (authUserRef.current?.role !== 'Admin') return;
    const response = await fetch('/api/admin/roster-jobs', { cache: 'no-store' });
    if (!response.ok) return;
    const jobs = await response.json();
    if (Array.isArray(jobs)) setRosterImports(jobs);
  };
  useEffect(() => {
    if (authenticatedUser?.role !== 'Admin') { setRosterImports([]); return; }
    refreshRosterImports().catch(() => {});
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refreshRosterImports().catch(() => {}); }, 2500);
    return () => clearInterval(timer);
  }, [authenticatedUser?.id, authenticatedUser?.role]);

  const submitRoster = async (kind, input) => {
    const rows = validateRoster(kind, input);
    const response = await fetch(`/api/admin/bulk-upload-${kind}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [kind]: rows, requestId: crypto.randomUUID() })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Roster import could not be queued.');
    if (response.status === 202) { await refreshRosterImports(); return result; }
    // Completed responses are also accepted during a rolling backend upgrade.
    await fetchDbState();
    return { ...result, count: result.successCount ?? result.count ?? 0 };
  };
  const bulkUploadStudents = rows => submitRoster('students', rows);
  const bulkUploadMentors = rows => submitRoster('mentors', rows);
  const bulkUploadRos = rows => submitRoster('ros', rows);
  const waitForSingleImport = async result => {
    if (!result.jobId) return result;
    for (let attempt = 0; attempt < 60; attempt++) {
      const response = await fetch(`/api/admin/roster-jobs/${result.jobId}?results=1`, { cache: 'no-store' });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || 'Import progress is unavailable.');
      if (job.status === 'COMPLETED') { await fetchDbState(); await refreshRosterImports(); return job; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('The account import is still running. Check recent roster imports for its result.');
  };
  const addSingleMentor = async row => {
    const result = await waitForSingleImport(await bulkUploadMentors([row]));
    if (!result.successCount) throw new Error(result.results?.[0]?.reason || 'Mentor account could not be saved.');
    return result;
  };
  const addSingleRo = async row => {
    const result = await waitForSingleImport(await bulkUploadRos([row]));
    if (!result.successCount) throw new Error(result.results?.[0]?.reason || 'RO account could not be saved.');
    return result;
  };

  return (
    <DatabaseContext.Provider value={{
      db,
      loading,
      error,
      fetchDbState,
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
      rosterImports,
      refreshRosterImports,
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
