import React, { useState, useContext, useEffect } from 'react';
import { DatabaseProvider, DatabaseContext } from './context/DatabaseContext';
import { RoleSwitcher } from './components/RoleSwitcher';
import { StudentDashboard } from './views/StudentDashboard';
import { MentorDashboard } from './views/MentorDashboard';
import { RODashboard } from './views/RODashboard';
import { AdminDashboard } from './views/AdminDashboard';

function AppContent() {
  const { currentUser, db } = useContext(DatabaseContext);
  const [selectedSubProfile, setSelectedSubProfile] = useState('');

  // Automatically initialize default sub-profile when switching roles
  useEffect(() => {
    if (currentUser === 'Student' && db.users.students.length > 0) {
      setSelectedSubProfile(db.users.students[0].id);
    } else if (currentUser === 'Mentor' && db.users.mentors.length > 0) {
      setSelectedSubProfile(db.users.mentors[0].id);
    } else if (currentUser === 'RO' && db.users.ros.length > 0) {
      setSelectedSubProfile(db.users.ros[0].id);
    } else {
      setSelectedSubProfile('ADMIN');
    }
  }, [currentUser, db.users]);

  return (
    <div className="app-container">
      <RoleSwitcher 
        selectedSubProfile={selectedSubProfile} 
        setSelectedSubProfile={setSelectedSubProfile} 
      />
      <main className="main-content">
        {currentUser === 'Student' && selectedSubProfile && (
          <StudentDashboard studentId={selectedSubProfile} />
        )}
        {currentUser === 'Mentor' && selectedSubProfile && (
          <MentorDashboard mentorId={selectedSubProfile} />
        )}
        {currentUser === 'RO' && selectedSubProfile && (
          <RODashboard roId={selectedSubProfile} />
        )}
        {currentUser === 'Admin' && (
          <AdminDashboard />
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <DatabaseProvider>
      <AppContent />
    </DatabaseProvider>
  );
}

export default App;
