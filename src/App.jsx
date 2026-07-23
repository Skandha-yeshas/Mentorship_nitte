import React, { useState, useContext, useEffect } from 'react';
import { DatabaseProvider, DatabaseContext } from './context/DatabaseContext';
import { RoleSwitcher } from './components/RoleSwitcher';
import { StudentDashboard } from './views/StudentDashboard';
import { MentorDashboard } from './views/MentorDashboard';
import { RODashboard } from './views/RODashboard';
import { AdminDashboard } from './views/AdminDashboard';

function AppContent() {
  const { currentUser, db, loading, error } = useContext(DatabaseContext);
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

  // Loading Screen
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)' }}>
        <div style={{ border: '4px solid rgba(255,255,255,0.05)', borderTop: '4px solid var(--accent-indigo)', borderRadius: '50%', width: '50px', height: '50px', animation: 'spin 1s linear infinite' }}></div>
        <p style={{ marginTop: '20px', color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Establishing secure connection to PostgreSQL database...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Database Connection Error Screen
  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-primary)', padding: '24px', textAlign: 'center' }}>
        <div className="glass-card" style={{ maxWidth: '520px', borderLeft: '4px solid var(--accent-rose)', margin: '0 auto' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--accent-rose)', marginBottom: '12px' }}>Database Connection Error</h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>{error}</p>
          <div style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '6px', textAlign: 'left', color: 'var(--text-secondary)' }}>
            <p style={{ fontWeight: '700', marginBottom: '6px', color: 'var(--text-primary)' }}>Troubleshooting Checklist:</p>
            <ol style={{ marginLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <li>Verify your local PostgreSQL server is active on your machine.</li>
              <li>Ensure server credentials in <code>server/.env</code> are correct.</li>
              <li>Verify the connection port (default <code>5432</code>) is open.</li>
              <li>Confirm the node server is active (run <code>npm start</code> in <code>server/</code> folder).</li>
            </ol>
          </div>
          <button className="btn btn-primary" style={{ marginTop: '20px', width: '100%' }} onClick={() => window.location.reload()}>
            Retry Database Connection
          </button>
        </div>
      </div>
    );
  }

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
