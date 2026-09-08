import React, { createContext, useState, useEffect } from 'react';

export const DatabaseContext = createContext();

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

// Mock Fallback Database State when PostgreSQL server is offline
const MOCK_DB = {
  users: {
    students: [
      { id: 'u18cm24s0058', name: 'Aarav Sharma', email: 'skandhayashas2906@gmail.com', sem: 6, branch: 'CSE', mentorId: 'M-101', password: 'Nit#Stu2026' },
      { id: 'u18cm24s0056', name: 'Ananya Rao', email: 'skandhayashas2906@gmail.com', sem: 6, branch: 'ECE', mentorId: 'M-102', password: 'Nit#Stu2026' },
      { id: 'u18cm24s0053', name: 'Rohan Mehta', email: 'skandhayashas2906@gmail.com', sem: 4, branch: 'ISE', mentorId: 'M-103', password: 'Nit#Stu2026' },
      { id: 'u18cm24s0040', name: 'Priya Nair', email: 'skandhayashas2906@gmail.com', sem: 4, branch: 'ME', mentorId: 'M-104', password: 'Nit#Stu2026' }
    ],
    mentors: [
      { id: 'M-101', name: 'Dr. Suresh Kumar', email: 'skandhayashu2906@gmail.com', dept: 'CSE', class: '6th Sem CSE-A', password: 'Nit#Mnt2026' },
      { id: 'M-102', name: 'Prof. Lakshmi Devi', email: 'skandhayashu2906@gmail.com', dept: 'ECE', class: '6th Sem ECE-B', password: 'Nit#Mnt2026' },
      { id: 'M-103', name: 'Dr. Rajesh Hegde', email: 'skandhayashu2906@gmail.com', dept: 'ISE', class: '4th Sem ISE-A', password: 'Nit#Mnt2026' },
      { id: 'M-104', name: 'Prof. Vikram Shetty', email: 'skandhayashu2906@gmail.com', dept: 'ME', class: '4th Sem ME-B', password: 'Nit#Mnt2026' }
    ],
    ros: ALL_CATEGORIES.map((cat, idx) => ({
      id: `RO-${String(idx + 1).padStart(2, '0')}`,
      name: `RO - ${cat.split(' - ')[1]}`,
      email: 'skandhayashu2906@gmail.com',
      region: cat,
      password: 'Nit#Ro2026'
    }))
  },
  issues: [
    {
      id: 'TICK-1001',
      studentId: 'u18cm24s0058',
      studentName: 'Aarav Sharma',
      category: 'Academic - Internal marks discrepancy',
      description: 'Discrepancy in Mid-Sem 2 Data Structures internal marks calculation.',
      priority: 'High',
      status: 'Assigned to RO',
      roId: 'RO-03',
      roName: 'RO - Internal marks discrepancy',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      logs: [
        { time: new Date(Date.now() - 86400000 * 2).toLocaleString(), text: 'Ticket created and assigned to RO-03.' }
      ]
    },
    {
      id: 'TICK-1002',
      studentId: 'u18cm24s0056',
      studentName: 'Ananya Rao',
      category: 'Financial - Scholarship application delay',
      description: 'SSP Scholarship portal document verification pending at college office.',
      priority: 'Medium',
      status: 'Meeting Scheduled',
      roId: 'RO-18',
      roName: 'RO - Scholarship application delay',
      createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      logs: [
        { time: new Date(Date.now() - 86400000 * 4).toLocaleString(), text: 'Ticket created.' },
        { time: new Date(Date.now() - 86400000 * 1).toLocaleString(), text: 'Meeting scheduled for tomorrow at 11:00 AM.' }
      ]
    },
    {
      id: 'TICK-1003',
      studentId: 'u18cm24s0053',
      studentName: 'Rohan Mehta',
      category: 'Hostels - Wi-Fi connectivity issues',
      description: 'Intermittent internet connection in Block B, 3rd Floor rooms.',
      priority: 'Low',
      status: 'Resolved',
      roId: 'RO-27',
      roName: 'RO - Wi-Fi connectivity issues',
      createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
      resolutionNotes: 'Access point router replaced on 3rd floor corridor.',
      rating: 5,
      feedbackComments: 'Resolved quickly! Thanks.',
      logs: [
        { time: new Date(Date.now() - 86400000 * 6).toLocaleString(), text: 'Ticket created.' },
        { time: new Date(Date.now() - 86400000 * 3).toLocaleString(), text: 'Issue resolved by network team.' }
      ]
    }
  ],
  meetings: [],
  groupSessions: [
    {
      id: 'GS-01',
      mentorId: 'M-101',
      title: 'Career & Higher Studies Counseling',
      dateTime: '2026-08-05T15:00',
      description: 'Interactive session discussing GATE, GRE, and campus placement strategies.',
      meetLink: 'https://meet.google.com/abc-defg-hij'
    }
  ],
  resources: [
    {
      id: 'RES-01',
      mentorId: 'M-101',
      title: 'Algorithms & Data Structures Study Notes',
      type: 'PDF Notes',
      content: 'Complete handbook covering Trees, Graphs, and Dynamic Programming.'
    }
  ],
  mentorSessionRecords: [],
  systemLogs: [],
  gmailAddress: 'skandhayashu2906@gmail.com',
  gmailLogs: [
    {
      id: 101,
      direction: 'OUTBOUND',
      sender: 'skandhayashu2906@gmail.com',
      recipient: 'aarav.mehta@nitte.edu',
      subject: '[TICK-1001] Issue Registered: Academic - Internal marks discrepancy',
      body: 'Your ticket has been logged and assigned to RO-03.',
      eventType: 'ISSUE_SUBMITTED',
      issueId: 'TICK-1001',
      status: 'DELIVERED_GMAIL',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
    },
    {
      id: 102,
      direction: 'OUTBOUND',
      sender: 'skandhayashu2906@gmail.com',
      recipient: 'ananya.rao@nitte.edu',
      subject: '[TICK-1002] Meeting Scheduled Notice',
      body: 'Meeting scheduled for tomorrow at 11:00 AM at RO Office Desk.',
      eventType: 'MEETING_SCHEDULED',
      issueId: 'TICK-1002',
      status: 'DELIVERED_GMAIL',
      createdAt: new Date(Date.now() - 86400000 * 1).toISOString()
    }
  ],
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

export const DatabaseProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('curr_user_role');
    return saved || 'Student';
  });

  const [db, setDb] = useState(MOCK_DB);
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
          } catch (e) {}
        }

        // Preserve and sync category videos from server or localStorage
        let catVideos = (data.categoryVideos && data.categoryVideos.length) ? data.categoryVideos : (prev.categoryVideos || []);
        if (!catVideos || !catVideos.length) {
          try {
            const savedVideos = localStorage.getItem('nitte_saved_category_videos');
            if (savedVideos) catVideos = JSON.parse(savedVideos);
          } catch (e) {}
        }
        if (!catVideos || !catVideos.length) {
          catVideos = MOCK_DB.categoryVideos;
        } else {
          try {
            localStorage.setItem('nitte_saved_category_videos', JSON.stringify(catVideos));
          } catch (e) {}
        }

        return {
          ...data,
          recordings: recs || [],
          categoryVideos: catVideos
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
          } catch (e) {}
        }

        let catVideos = prev.categoryVideos || [];
        if (!catVideos || !catVideos.length) {
          try {
            const savedVideos = localStorage.getItem('nitte_saved_category_videos');
            if (savedVideos) catVideos = JSON.parse(savedVideos);
          } catch (e) {}
        }
        if (!catVideos || !catVideos.length) {
          catVideos = MOCK_DB.categoryVideos;
        }

        return {
          ...(prev.users?.students?.length ? prev : MOCK_DB),
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
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        bc = new BroadcastChannel('nitte_meeting_sync');
        bc.onmessage = (event) => {
          if (event.data && event.data.type === 'meeting_status') {
            const { meetId, status } = event.data;
            setDb(prev => ({
              ...prev,
              meetings: (prev.meetings || []).map(m => 
                (m.id === meetId || m.issueId === meetId || m.issue_id === meetId || (m.issueId && meetId && m.issueId.toUpperCase() === meetId.toUpperCase()))
                  ? { ...m, status }
                  : m
              )
            }));
            fetchDbState();
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
              } catch (e) {}
              return {
                ...prev,
                categoryVideos: merged
              };
            });
          }
        };
      }
    } catch (e) {}

    return () => {
      clearInterval(pollInterval);
      if (bc) bc.close();
      if (videoBc) videoBc.close();
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('curr_user_role', currentUser);
  }, [currentUser]);

  const [isDemoLimitBypassed, setIsDemoLimitBypassed] = useState(() => {
    return localStorage.getItem('demo_limit_bypassed') === 'true';
  });

  const toggleDemoLimitBypass = () => {
    setIsDemoLimitBypassed(prev => {
      const nextVal = !prev;
      localStorage.setItem('demo_limit_bypassed', String(nextVal));
      return nextVal;
    });
  };

  // ISSUE SUBMISSION (Supports 2 Issues / Week Limit & Demo Mode Bypass)
  const submitIssue = async (studentId, category, description, priority) => {
    const student = db.users.students.find(s => s.id === studentId) || { name: 'Student' };

    let res;
    try {
      res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, studentName: student.name, category, description, priority, bypassLimit: isDemoLimitBypassed })
      });
    } catch (networkErr) {
      // Local state fallback only when network fetch completely fails/offline
      const catIdx = ALL_CATEGORIES.indexOf(category);
      const roId = catIdx !== -1 ? `RO-${String(catIdx + 1).padStart(2, '0')}` : 'RO-01';
      const ro = db.users.ros.find(r => r.id === roId);

      // Check total attempts in this category for this student
      const prevCatIssues = (db.issues || []).filter(i => i.studentId === studentId && (i.category === category || i.roId === roId));
      let totalAttempts = prevCatIssues.length;
      prevCatIssues.forEach(iss => {
        const reopens = (iss.logs || []).filter(l => l.text && l.text.toLowerCase().includes('re-opened')).length;
        totalAttempts += reopens;
      });

      const isThirdAttempt = totalAttempts >= 2;
      const initialStatus = isThirdAttempt ? 'Escalated' : 'Assigned to RO';
      const initialLogText = isThirdAttempt
        ? `[AUTO-ESCALATED TO ADMIN] 3rd issue attempt reached for category ${category}. Automatically escalated directly to Admin Office for priority resolution.`
        : `Ticket raised by ${student.name} (Attempt #${totalAttempts + 1} for ${category}).`;

      const newIssue = {
        id: `TICK-${Math.floor(1000 + Math.random() * 9000)}`,
        studentId,
        studentName: student.name,
        category,
        description,
        priority,
        status: initialStatus,
        roId,
        roName: ro ? ro.name : 'RO Officer',
        createdAt: new Date().toISOString(),
        logs: [{ time: new Date().toLocaleString(), text: initialLogText }]
      };
      setDb(prev => ({ ...prev, issues: [newIssue, ...prev.issues] }));
      return newIssue.id;
    }

    if (res.ok) {
      const data = await res.json();
      try {
        await fetchDbState();
      } catch (e) {
        console.warn('Could not refresh DB state after issue creation:', e);
      }
      return data.id;
    } else {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to submit issue');
    }
  };

  const scheduleRoMeeting = async (issueId, studentId, roId, date, time, mode, location, notes) => {
    const student = (db.users?.students || []).find(s => s.id === studentId) || {};
    const issue = (db.issues || []).find(i => (i.id || i.issue_id)?.toUpperCase() === issueId?.toUpperCase());
    if (!issue) return;
    const studentName = student.name || issue.studentName || 'Student';

    const getLogText = (l) => {
      if (!l) return '';
      if (typeof l === 'string') {
        if (l.trim().startsWith('{') && l.includes('"text"')) {
          try { const p = JSON.parse(l); if (p && p.text) return String(p.text); } catch (e) {}
        }
        return l;
      }
      if (typeof l === 'object' && l.text) return String(l.text);
      return String(l);
    };

    const existingMeet = (db.meetings || []).find(m => (m.issueId || m.issue_id)?.toUpperCase() === issueId?.toUpperCase());
    const reassignLogs = (issue.logs || []).filter(l => {
      const txt = getLogText(l).toLowerCase();
      return (txt.includes('rescheduled') || txt.includes('reassigned') || txt.includes('re-assigned')) && !txt.includes('reassigned to');
    });
    const isReschedule = Boolean(
      existingMeet ||
      issue.status === 'Meeting Scheduled' ||
      issue.status === 'Meeting Started' ||
      issue.status === 'In-Progress' ||
      issue.status === 'In Progress' ||
      (issue.logs || []).some(l => {
        const txt = getLogText(l).toLowerCase();
        return txt.includes('meeting scheduled') || txt.includes('meeting rescheduled') || txt.includes('meeting reassigned');
      })
    );

    if (isReschedule && reassignLogs.length >= 2) {
      alert('🔒 RO Limit Reached: A Relationship Officer can only reschedule/reassign a meeting twice per issue (2/2 Used). Escalate to Admin for further changes.');
      throw new Error('RO Limit Reached: Maximum 2 meeting reassignments allowed per issue.');
    }

    const meetingLocation = location || (mode === 'Online' ? 'Google Meet / Zoom Online Video Link' : 'RO Office Desk');

    const newMeeting = {
      id: existingMeet ? existingMeet.id : `MEET-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      issueId,
      issue_id: issueId,
      studentId: issue.studentId || studentId,
      student_id: issue.studentId || studentId,
      studentName,
      student_name: studentName,
      roId,
      ro_id: roId,
      date,
      time,
      mode: mode || 'Offline',
      location: meetingLocation,
      notes: notes || '',
      status: 'Confirmed'
    };
    const timestamp = new Date().toLocaleString();
    const logMsg = isReschedule
      ? `Meeting rescheduled / reassigned by RO (${mode || 'Offline'}) for ${date} at ${time} (${meetingLocation}).`
      : `Meeting scheduled by RO (${mode || 'Offline'}) for ${date} at ${time} (${meetingLocation}).`;

    // 1. Instantly update local React state so Student & RO Dashboards update immediately
    setDb(prev => ({
      ...prev,
      meetings: [...(prev.meetings || []).filter(m => (m.issueId || m.issue_id)?.toUpperCase() !== issueId?.toUpperCase()), newMeeting],
      issues: (prev.issues || []).map(i => i.id?.toUpperCase() === issueId?.toUpperCase() ? {
        ...i,
        status: 'Meeting Scheduled',
        logs: [...(i.logs || []), { time: timestamp, text: logMsg }]
      } : i)
    }));

    // 2. Also send request to backend API if active
    try {
      const res = await fetch('/api/meetings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issueId,
          studentId: issue.studentId || studentId,
          studentName,
          roId,
          date,
          time,
          mode: mode || 'Offline',
          location: meetingLocation,
          notes: notes || ''
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
    const feedbackObj = { rating: numericRating, comments: comments || '' };

    // 1. Instantly update local state so rating shows immediately in Student & Admin Dashboards
    setDb(prev => ({
      ...prev,
      issues: (prev.issues || []).map(i => i.id === issueId ? {
        ...i,
        feedback: feedbackObj,
        feedbackRating: numericRating,
        feedbackComments: comments || '',
        logs: [...(i.logs || []), {
          time: new Date().toLocaleString(),
          text: `Student submitted feedback rating: ${numericRating} Stars ("${comments || ''}")`
        }]
      } : i)
    }));

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

  // RO ACTIONS
  const updateMeetingStatus = async (meetId, status) => {
    // 1. Update local state immediately for instant UI feedback
    setDb(prev => ({
      ...prev,
      meetings: (prev.meetings || []).map(m => 
        (m.id === meetId || m.issueId === meetId || m.issue_id === meetId || (m.issueId && meetId && m.issueId.toUpperCase() === meetId.toUpperCase()))
          ? { ...m, status }
          : m
      )
    }));

    // Broadcast across open tabs
    try {
      if (typeof window !== 'undefined' && window.BroadcastChannel) {
        const bc = new BroadcastChannel('nitte_meeting_sync');
        bc.postMessage({ type: 'meeting_status', meetId, status });
        bc.close();
      }
    } catch (e) {}

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
      } catch (e) {}
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
      } catch (e) {}
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
          try { videoBc.close(); } catch (e) {}
        }, 500);
      }
    } catch (e) {}

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
    const timestamp = new Date().toISOString();
    const timeFormatted = new Date().toLocaleString();
    const logMsg = `Marked as Resolved by RO (${roId}): ${resolutionNotes}`;

    // 1. Instantly update local React state so Student, RO, & Admin Dashboards update immediately
    setDb(prev => ({
      ...prev,
      issues: (prev.issues || []).map(i => i.id === issueId ? {
        ...i,
        status: 'Resolved',
        resolvedAt: timestamp,
        resolutionNotes,
        logs: [...(i.logs || []), { time: timeFormatted, text: logMsg }]
      } : i)
    }));

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
  };

  const reopenIssue = async (issueId, studentId, reason) => {
    const timestamp = new Date().toLocaleString();
    const targetIssue = (db.issues || []).find(i => i.id === issueId);

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
      issues: prev.issues.map(i => i.id === issueId ? {
        ...i,
        status: newStatus,
        resolvedAt: null,
        logs: [...(i.logs || []), { time: timestamp, text: logMsg }]
      } : i)
    }));

    try {
      const res = await fetch(`/api/issues/${issueId}/reopen`, {
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

  const escalateIssue = async (issueId, roId, reason) => {
    try {
      await fetch(`/api/issues/${issueId}/escalate`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roId, reason })
      });
      await fetchDbState();
    } catch (err) {
      setDb(prev => ({
        ...prev,
        issues: prev.issues.map(i => i.id === issueId ? {
          ...i,
          status: 'Escalated to Principal',
          logs: [...(i.logs || []), { time: new Date().toLocaleString(), text: `Escalated: ${reason}` }]
        } : i)
      }));
    }
  };

  // ADMIN ACTIONS
  const adminResolveIssue = async (issueId, resolutionNotes) => {
    try {
      await fetch(`/api/issues/${issueId}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roId: 'ADMIN', resolutionNotes, userRole: 'Admin' })
      });
      await fetchDbState();
    } catch (err) {
      setDb(prev => ({
        ...prev,
        issues: prev.issues.map(i => i.id === issueId ? {
          ...i,
          status: 'Resolved',
          resolutionNotes,
          logs: [...(i.logs || []), { time: new Date().toLocaleString(), text: `Admin Resolved: ${resolutionNotes}` }]
        } : i)
      }));
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
      setDb(prev => ({
        ...prev,
        issues: prev.issues.map(i => i.id === issueId ? {
          ...i,
          roId: newRoId,
          roName: ro ? ro.name : newRoId
        } : i)
      }));
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
      const newStudent = {
        id: (usn && usn.trim()) ? usn.trim().toUpperCase() : `S${Math.floor(100 + Math.random() * 900)}`,
        name: name.trim(),
        email: email.trim(),
        branch: branch || 'CSE',
        sem: parseInt(sem) || 4,
        mentorId: 'M101'
      };
      setDb(prev => ({
        ...prev,
        users: {
          ...prev.users,
          students: [...(prev.users?.students || []), newStudent]
        }
      }));
      return { success: true, student: newStudent };
    }
  };

  const loginUser = async (identifier, password, role) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: identifier, email: identifier, password, role })
      });
      if (res.ok) {
        const data = await res.json();
        setAuthenticatedUser(data.user);
        setCurrentUser(role || 'Student');
        localStorage.setItem('auth_user_session', JSON.stringify(data.user));
        return { success: true, user: data.user };
      } else {
        const errData = await res.json();
        throw new Error(errData.error || 'Authentication failed');
      }
    } catch (err) {
      if (err.message && !err.message.includes('fetch')) {
        throw err;
      }
      const dummyUser = {
        id: identifier || 'S101',
        name: 'Logged-in Student',
        email: identifier.includes('@') ? identifier : 'skandhayashas2906@gmail.com',
        role: role || 'Student'
      };
      setAuthenticatedUser(dummyUser);
      setCurrentUser(role || 'Student');
      localStorage.setItem('auth_user_session', JSON.stringify(dummyUser));
      return { success: true, user: dummyUser };
    }
  };

  const logoutUser = () => {
    setAuthenticatedUser(null);
    localStorage.removeItem('auth_user_session');
  };

  const bulkUploadStudents = async (students) => {
    try {
      const res = await fetch('/api/admin/bulk-upload-students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students })
      });
      const data = await res.json();
      if (res.ok) {
        await fetchDbState();
        return data;
      } else {
        throw new Error(data.error || 'Failed to process bulk upload.');
      }
    } catch (err) {
      console.error('Error uploading student roster:', err);
      throw err;
    }
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
      saveMeetingRecording,
      updateCategoryVideo,
      getYoutubeEmbedUrl
    }}>
      {children}
    </DatabaseContext.Provider>
  );
};
