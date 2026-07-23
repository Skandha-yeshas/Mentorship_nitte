import React, { createContext, useState, useEffect } from 'react';

export const DatabaseContext = createContext();

// Define realistic issue categories representing the 50 possible categories
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
    'Results withholding issues', 'Supplementary exam fees'
  ],
  Financial: [
    'Tuition fee installment requests', 'Scholarship application delay',
    'Hostel fee payment extension', 'Exam fee payment failure',
    'Refund of caution deposits'
  ],
  Hostels: [
    'Room maintenance & repairs', 'Mess food quality/hygiene',
    'Wi-Fi connectivity issues', 'Water supply shortage',
    'Roommate conflicts', 'Hostel curfew permissions'
  ],
  Placements: [
    'Resume verification delay', 'Eligibility criteria appeals',
    'Interview scheduling clashes', 'Placement training portal bugs',
    'Company registration issues'
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

// Flatten to list of categories for drop-down lists
export const ALL_CATEGORIES = Object.keys(ISSUE_CATEGORIES).reduce((acc, cat) => {
  return acc.concat(ISSUE_CATEGORIES[cat].map(sub => `${cat} - ${sub}`));
}, []);

export const DatabaseProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('curr_user_role');
    return saved || 'Student'; // Default to Student dashboard
  });

  const [db, setDb] = useState({
    users: { students: [], mentors: [], ros: [] },
    issues: [],
    meetings: [],
    groupSessions: [],
    resources: [],
    systemLogs: []
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch full state from backend
  const fetchDbState = async () => {
    try {
      const res = await fetch('/api/db-state');
      if (!res.ok) throw new Error('Failed to fetch system state from server.');
      const data = await res.json();
      setDb(data);
      setError(null);
    } catch (err) {
      console.error('Database connection error:', err);
      setError('Could not connect to the PostgreSQL backend. Verify node server is running.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch state on mount
  useEffect(() => {
    fetchDbState();
  }, []);

  // Persist Active User Role on change
  useEffect(() => {
    localStorage.setItem('curr_user_role', currentUser);
  }, [currentUser]);

  // 1. STUDENT ACTIONS
  const submitIssue = async (studentId, category, description, priority) => {
    const student = db.users.students.find(s => s.id === studentId);
    if (!student) return;

    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          studentName: student.name,
          category,
          description,
          priority,
          roId: student.roId
        })
      });
      const data = await res.json();
      await fetchDbState(); // Re-sync local state with database
      return data.id;
    } catch (err) {
      console.error('Error submitting issue:', err);
    }
  };

  const bookMeeting = async (issueId, studentId, date, time, mode) => {
    const student = db.users.students.find(s => s.id === studentId);
    if (!student) return;

    try {
      await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId,
          studentId,
          studentName: student.name,
          roId: student.roId,
          date,
          time,
          mode
        })
      });
      await fetchDbState();
    } catch (err) {
      console.error('Error booking meeting:', err);
    }
  };

  const submitFeedback = async (issueId, rating, comments) => {
    try {
      await fetch(`/api/issues/${issueId}/feedback`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comments })
      });
      await fetchDbState();
    } catch (err) {
      console.error('Error submitting feedback:', err);
    }
  };

  // 2. MENTOR ACTIONS
  const addResource = async (mentorId, title, type, content) => {
    try {
      await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId, title, type, content })
      });
      await fetchDbState();
    } catch (err) {
      console.error('Error adding resource:', err);
    }
  };

  const addGroupSession = async (mentorId, title, dateTime, description, link) => {
    const mentor = db.users.mentors.find(m => m.id === mentorId);
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mentorId,
          mentorName: mentor ? mentor.name : 'Mentor',
          title,
          dateTime,
          description,
          link
        })
      });
      await fetchDbState();
    } catch (err) {
      console.error('Error scheduling group session:', err);
    }
  };

  // 3. RO ACTIONS
  const updateMeetingStatus = async (meetId, status) => {
    try {
      await fetch(`/api/meetings/${meetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      await fetchDbState();
    } catch (err) {
      console.error('Error updating meeting status:', err);
    }
  };

  const resolveIssue = async (issueId, roId, resolutionNotes) => {
    try {
      await fetch(`/api/issues/${issueId}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roId, resolutionNotes, userRole: 'RO' })
      });
      await fetchDbState();
    } catch (err) {
      console.error('Error resolving issue:', err);
    }
  };

  const escalateIssue = async (issueId, roId, reason) => {
    try {
      await fetch(`/api/issues/${issueId}/escalate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roId, reason })
      });
      await fetchDbState();
    } catch (err) {
      console.error('Error escalating issue:', err);
    }
  };

  // 4. ADMIN ACTIONS
  const adminResolveIssue = async (issueId, resolutionNotes) => {
    try {
      await fetch(`/api/issues/${issueId}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roId: 'ADMIN', resolutionNotes, userRole: 'Admin' })
      });
      await fetchDbState();
    } catch (err) {
      console.error('Error admin-resolving issue:', err);
    }
  };

  const reassignIssue = async (issueId, newRoId) => {
    const ro = db.users.ros.find(r => r.id === newRoId);
    try {
      await fetch(`/api/issues/${issueId}/reassign`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newRoId, roName: ro ? ro.name : newRoId })
      });
      await fetchDbState();
    } catch (err) {
      console.error('Error reassigning issue:', err);
    }
  };

  // Reset database helper (Re-creates Tables and Seed data)
  const resetDatabase = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (res.ok) {
        window.location.reload();
      }
    } catch (err) {
      console.error('Error resetting database:', err);
      setLoading(false);
    }
  };

  return (
    <DatabaseContext.Provider value={{
      db,
      loading,
      error,
      currentUser,
      setCurrentUser,
      submitIssue,
      bookMeeting,
      submitFeedback,
      addResource,
      addGroupSession,
      updateMeetingStatus,
      resolveIssue,
      escalateIssue,
      adminResolveIssue,
      reassignIssue,
      resetDatabase
    }}>
      {children}
    </DatabaseContext.Provider>
  );
};
