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

  const [db, setDb] = useState(() => {
    const saved = localStorage.getItem('mentorship_db');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse database, resetting...', e);
      }
    }

    // Default initial mock database
    const initialUsers = {
      students: [
        { id: 'S101', name: 'Aarav Mehta', email: 'aarav.mehta@nitte.edu', mentorId: 'M01', roId: 'RO1', phone: '9876543210', branch: 'CSE', sem: 5 },
        { id: 'S102', name: 'Bhavana Rao', email: 'bhavana.rao@nitte.edu', mentorId: 'M01', roId: 'RO1', phone: '9876543211', branch: 'CSE', sem: 5 },
        { id: 'S103', name: 'Chaitra Hegde', email: 'chaitra.hegde@nitte.edu', mentorId: 'M01', roId: 'RO2', phone: '9876543212', branch: 'CSE', sem: 5 },
        { id: 'S104', name: 'Daniel Dsouza', email: 'daniel.d@nitte.edu', mentorId: 'M01', roId: 'RO2', phone: '9876543213', branch: 'CSE', sem: 5 },
        { id: 'S105', name: 'Esha Sharma', email: 'esha.s@nitte.edu', mentorId: 'M02', roId: 'RO3', phone: '9876543214', branch: 'ISE', sem: 3 },
        { id: 'S106', name: 'Farhan Khan', email: 'farhan.k@nitte.edu', mentorId: 'M02', roId: 'RO3', phone: '9876543215', branch: 'ISE', sem: 3 },
        { id: 'S107', name: 'Gautam Shenoy', email: 'gautam.s@nitte.edu', mentorId: 'M02', roId: 'RO4', phone: '9876543216', branch: 'ISE', sem: 3 },
        { id: 'S108', name: 'Harshita Pai', email: 'harshita.p@nitte.edu', mentorId: 'M02', roId: 'RO4', phone: '9876543217', branch: 'ISE', sem: 3 }
      ],
      mentors: [
        { id: 'M01', name: 'Dr. Rajesh Kumar', email: 'rajesh.kumar@nitte.edu', dept: 'CSE', class: '5th Sem CSE - Section A (28 Mentees)' },
        { id: 'M02', name: 'Prof. Sunita Sharma', email: 'sunita.sharma@nitte.edu', dept: 'ISE', class: '3rd Sem ISE - Section B (26 Mentees)' }
      ],
      ros: [
        { id: 'RO1', name: 'RO Amit Patel', email: 'amit.patel@nitte.edu', region: 'Hostel Block A & CSE Dept' },
        { id: 'RO2', name: 'RO Priya Naik', email: 'priya.naik@nitte.edu', region: 'Hostel Block B & CSE Dept' },
        { id: 'RO3', name: 'RO Vikram Shetty', email: 'vikram.shetty@nitte.edu', region: 'Day Scholars & ISE Dept' },
        { id: 'RO4', name: 'RO Sneha Alva', email: 'sneha.alva@nitte.edu', region: 'Scholarships & ISE Dept' }
      ]
    };

    const initialIssues = [
      {
        id: 'ISS-001',
        studentId: 'S101',
        studentName: 'Aarav Mehta',
        category: 'Academic - Internal marks discrepancy',
        description: 'My internal marks for Software Engineering lab were entered as 12 instead of 22 in the portal. I have cross-checked my sheets.',
        priority: 'High',
        status: 'Assigned to RO',
        roId: 'RO1',
        createdAt: '2026-07-15T09:30:00Z',
        logs: [{ text: 'Issue submitted by Aarav Mehta', time: '2026-07-15T09:30:00Z' }]
      },
      {
        id: 'ISS-002',
        studentId: 'S102',
        studentName: 'Bhavana Rao',
        category: 'Hostels - Mess food quality/hygiene',
        description: 'Found plastic pieces in the lunch served today. Need immediate inspection of the Block A dining hall.',
        priority: 'High',
        status: 'Meeting Scheduled',
        roId: 'RO1',
        createdAt: '2026-07-16T13:45:00Z',
        logs: [
          { text: 'Issue submitted by Bhavana Rao', time: '2026-07-16T13:45:00Z' },
          { text: 'RO Amit Patel scheduled an offline meeting', time: '2026-07-17T10:00:00Z' }
        ]
      },
      {
        id: 'ISS-003',
        studentId: 'S103',
        studentName: 'Chaitra Hegde',
        category: 'Financial - Scholarship application delay',
        description: 'State Scholarship portal is asking for Nitte bonafide certificate verification, but the college office has not approved it yet.',
        priority: 'Medium',
        status: 'Escalated',
        roId: 'RO2',
        createdAt: '2026-07-10T11:15:00Z',
        resolvedAt: null,
        logs: [
          { text: 'Issue submitted by Chaitra Hegde', time: '2026-07-10T11:15:00Z' },
          { text: 'Escalated to Admin by RO Priya Naik due to lack of administrative portal access', time: '2026-07-14T15:20:00Z' }
        ]
      },
      {
        id: 'ISS-004',
        studentId: 'S104',
        studentName: 'Daniel Dsouza',
        category: 'Facilities - Library book renewal limits',
        description: 'Need to renew standard reference text for project work, but the system shows limit exceeded. Project submissions are next week.',
        priority: 'Low',
        status: 'Resolved',
        roId: 'RO2',
        createdAt: '2026-07-12T10:00:00Z',
        resolvedAt: '2026-07-13T14:30:00Z',
        resolutionNotes: 'Approved library exemption card. Book renewed for 15 additional days.',
        feedback: { rating: 5, comments: 'Extremely fast resolution. Thank you!' },
        logs: [
          { text: 'Issue submitted by Daniel Dsouza', time: '2026-07-12T10:00:00Z' },
          { text: 'Resolved by RO Priya Naik: Approved library exemption card.', time: '2026-07-13T14:30:00Z' },
          { text: 'Student submitted 5-star rating.', time: '2026-07-13T16:00:00Z' }
        ]
      },
      {
        id: 'ISS-005',
        studentId: 'S105',
        studentName: 'Esha Sharma',
        category: 'Personal - Stress & anxiety management',
        description: 'Struggling to balance ISE syllabus and placement prep, feeling highly overwhelmed and anxious.',
        priority: 'Medium',
        status: 'Submitted',
        roId: 'RO3',
        createdAt: '2026-07-18T18:00:00Z',
        logs: [{ text: 'Issue submitted by Esha Sharma', time: '2026-07-18T18:00:00Z' }]
      }
    ];

    const initialMeetings = [
      {
        id: 'MEET-001',
        issueId: 'ISS-002',
        studentId: 'S102',
        studentName: 'Bhavana Rao',
        roId: 'RO1',
        date: '2026-07-20',
        time: '11:30',
        mode: 'Offline',
        status: 'Confirmed'
      }
    ];

    const initialGroupSessions = [
      {
        id: 'SESS-001',
        mentorId: 'M01',
        mentorName: 'Dr. Rajesh Kumar',
        title: 'Project Selection Strategy & Industry Mentorship',
        dateTime: '2026-07-22T14:30',
        description: 'Discussing the guidelines for final year projects, selecting domains, and assigning industry guides.',
        link: 'https://meet.google.com/abc-defg-hij'
      },
      {
        id: 'SESS-002',
        mentorId: 'M02',
        mentorName: 'Prof. Sunita Sharma',
        title: 'Mid-Sem Performance Review & Guidance',
        dateTime: '2026-07-25T10:00',
        description: 'One-on-one progress logs and group strategies to clear difficult core courses.',
        link: 'https://meet.google.com/xyz-uvwx-yza'
      }
    ];

    const initialResources = [
      {
        id: 'RES-001',
        mentorId: 'M01',
        title: 'Final Year Project Guidelines PDF',
        type: 'PDF',
        content: 'Official roadmap and rubrics for engineering design projects.',
        dateShared: '2026-07-10'
      },
      {
        id: 'RES-002',
        mentorId: 'M01',
        title: 'Resume Templates for Tech Placement',
        type: 'Link',
        content: 'https://github.com/nitte-placement/templates',
        dateShared: '2026-07-12'
      },
      {
        id: 'RES-003',
        mentorId: 'M02',
        title: 'Notes on Data Structures & Algorithms',
        type: 'Note',
        content: 'Review lectures 1-15 covering Graphs and Dynamic Programming strategies.',
        dateShared: '2026-07-14'
      }
    ];

    const initialSystemLogs = [
      { id: 1, text: 'System Initialized.', timestamp: '2026-07-19T01:00:00Z', userRole: 'Admin', userId: 'SYSTEM' },
      { id: 2, text: 'Mock Student and RO database populated.', timestamp: '2026-07-19T01:05:00Z', userRole: 'Admin', userId: 'SYSTEM' },
      { id: 3, text: 'Daniel Dsouza Library issue marked as Resolved.', timestamp: '2026-07-13T14:30:00Z', userRole: 'RO', userId: 'RO2' },
      { id: 4, text: 'Chaitra Hegde Scholarship issue escalated to Admin.', timestamp: '2026-07-14T15:20:00Z', userRole: 'RO', userId: 'RO2' }
    ];

    return {
      users: initialUsers,
      issues: initialIssues,
      meetings: initialMeetings,
      groupSessions: initialGroupSessions,
      resources: initialResources,
      systemLogs: initialSystemLogs
    };
  });

  // Persist DB state on change
  useEffect(() => {
    localStorage.setItem('mentorship_db', JSON.stringify(db));
  }, [db]);

  // Persist Active User Role on change
  useEffect(() => {
    localStorage.setItem('curr_user_role', currentUser);
  }, [currentUser]);

  // Log functions
  const addSystemLog = (text, userRole, userId) => {
    setDb(prev => {
      const newLog = {
        id: Date.now(),
        text,
        timestamp: new Date().toISOString(),
        userRole,
        userId
      };
      return {
        ...prev,
        systemLogs: [newLog, ...prev.systemLogs].slice(0, 100) // Keep last 100 logs
      };
    });
  };

  // 1. STUDENT INTERACTIONS
  const submitIssue = (studentId, category, description, priority) => {
    const student = db.users.students.find(s => s.id === studentId);
    if (!student) return;

    const newIssue = {
      id: `ISS-${Math.floor(100 + Math.random() * 900)}`,
      studentId,
      studentName: student.name,
      category,
      description,
      priority,
      status: 'Assigned to RO',
      roId: student.roId,
      createdAt: new Date().toISOString(),
      logs: [{ text: `Issue submitted by ${student.name}`, time: new Date().toISOString() }]
    };

    setDb(prev => ({
      ...prev,
      issues: [newIssue, ...prev.issues]
    }));

    addSystemLog(`Student ${student.name} submitted a new issue: ${category}`, 'Student', studentId);
    return newIssue.id;
  };

  const bookMeeting = (issueId, studentId, date, time, mode) => {
    const student = db.users.students.find(s => s.id === studentId);
    const issue = db.issues.find(i => i.id === issueId);
    if (!student || !issue) return;

    const newMeet = {
      id: `MEET-${Math.floor(100 + Math.random() * 900)}`,
      issueId,
      studentId,
      studentName: student.name,
      roId: student.roId,
      date,
      time,
      mode,
      status: 'Pending'
    };

    setDb(prev => {
      const updatedIssues = prev.issues.map(i => {
        if (i.id === issueId) {
          return {
            ...i,
            status: 'Meeting Scheduled',
            logs: [...i.logs, { text: `Meeting scheduled with RO for ${date} at ${time} (${mode})`, time: new Date().toISOString() }]
          };
        }
        return i;
      });

      return {
        ...prev,
        issues: updatedIssues,
        meetings: [...prev.meetings, newMeet]
      };
    });

    addSystemLog(`Student ${student.name} booked a meeting slot on ${date} at ${time}`, 'Student', studentId);
  };

  const submitFeedback = (issueId, rating, comments) => {
    setDb(prev => {
      const updatedIssues = prev.issues.map(i => {
        if (i.id === issueId) {
          return {
            ...i,
            feedback: { rating, comments },
            logs: [...i.logs, { text: `Student submitted feedback: ${rating} Stars - "${comments}"`, time: new Date().toISOString() }]
          };
        }
        return i;
      });
      return { ...prev, issues: updatedIssues };
    });
    addSystemLog(`Feedback submitted for Issue ${issueId}: ${rating} stars`, 'Student', 'FEEDBACK');
  };

  // 2. MENTOR INTERACTIONS
  const addResource = (mentorId, title, type, content) => {
    const newRes = {
      id: `RES-${Math.floor(100 + Math.random() * 900)}`,
      mentorId,
      title,
      type,
      content,
      dateShared: new Date().toISOString().split('T')[0]
    };
    setDb(prev => ({
      ...prev,
      resources: [newRes, ...prev.resources]
    }));
    addSystemLog(`Mentor ${mentorId} shared a new resource: ${title}`, 'Mentor', mentorId);
  };

  const addGroupSession = (mentorId, title, dateTime, description, link) => {
    const mentor = db.users.mentors.find(m => m.id === mentorId);
    const newSession = {
      id: `SESS-${Math.floor(100 + Math.random() * 900)}`,
      mentorId,
      mentorName: mentor ? mentor.name : 'Mentor',
      title,
      dateTime,
      description,
      link
    };
    setDb(prev => ({
      ...prev,
      groupSessions: [newSession, ...prev.groupSessions]
    }));
    addSystemLog(`Mentor ${mentor ? mentor.name : mentorId} scheduled a group session: ${title}`, 'Mentor', mentorId);
  };

  // 3. RO INTERACTIONS
  const updateMeetingStatus = (meetId, status) => {
    setDb(prev => {
      const updatedMeetings = prev.meetings.map(m => {
        if (m.id === meetId) {
          return { ...m, status };
        }
        return m;
      });
      return { ...prev, meetings: updatedMeetings };
    });
    addSystemLog(`Meeting ${meetId} status updated to ${status}`, 'RO', 'MEETING_MGR');
  };

  const resolveIssue = (issueId, roId, resolutionNotes) => {
    setDb(prev => {
      const updatedIssues = prev.issues.map(i => {
        if (i.id === issueId) {
          return {
            ...i,
            status: 'Resolved',
            resolvedAt: new Date().toISOString(),
            resolutionNotes,
            logs: [...i.logs, { text: `Issue resolved by RO: ${resolutionNotes}`, time: new Date().toISOString() }]
          };
        }
        return i;
      });
      return { ...prev, issues: updatedIssues };
    });
    addSystemLog(`Issue ${issueId} resolved by RO ${roId}`, 'RO', roId);
  };

  const escalateIssue = (issueId, roId, reason) => {
    setDb(prev => {
      const updatedIssues = prev.issues.map(i => {
        if (i.id === issueId) {
          return {
            ...i,
            status: 'Escalated',
            logs: [...i.logs, { text: `Issue ESCALATED to Admin by RO. Reason: ${reason}`, time: new Date().toISOString() }]
          };
        }
        return i;
      });
      return { ...prev, issues: updatedIssues };
    });
    addSystemLog(`Issue ${issueId} ESCALATED by RO ${roId}. Reason: ${reason}`, 'RO', roId);
  };

  // 4. ADMIN INTERACTIONS
  const adminResolveIssue = (issueId, resolutionNotes) => {
    setDb(prev => {
      const updatedIssues = prev.issues.map(i => {
        if (i.id === issueId) {
          return {
            ...i,
            status: 'Resolved',
            resolvedAt: new Date().toISOString(),
            resolutionNotes: `[Admin Resolution] ${resolutionNotes}`,
            logs: [...i.logs, { text: `Issue resolved by Administrator: ${resolutionNotes}`, time: new Date().toISOString() }]
          };
        }
        return i;
      });
      return { ...prev, issues: updatedIssues };
    });
    addSystemLog(`Escalated Issue ${issueId} resolved by Administrator`, 'Admin', 'ADMIN');
  };

  const reassignIssue = (issueId, newRoId) => {
    const ro = db.users.ros.find(r => r.id === newRoId);
    setDb(prev => {
      const updatedIssues = prev.issues.map(i => {
        if (i.id === issueId) {
          return {
            ...i,
            roId: newRoId,
            logs: [...i.logs, { text: `Issue reassigned to ${ro ? ro.name : newRoId} by Admin`, time: new Date().toISOString() }]
          };
        }
        return i;
      });
      return { ...prev, issues: updatedIssues };
    });
    addSystemLog(`Issue ${issueId} reassigned to RO ${newRoId} by Admin`, 'Admin', 'ADMIN');
  };

  // Reset database helper
  const resetDatabase = () => {
    localStorage.removeItem('mentorship_db');
    window.location.reload();
  };

  return (
    <DatabaseContext.Provider value={{
      db,
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
