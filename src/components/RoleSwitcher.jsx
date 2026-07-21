import React, { useContext } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { Shield, GraduationCap, UserCheck, Briefcase, RefreshCw, Layers } from 'lucide-react';

export const RoleSwitcher = ({ selectedSubProfile, setSelectedSubProfile }) => {
  const { currentUser, setCurrentUser, db, resetDatabase } = useContext(DatabaseContext);

  const roles = [
    { name: 'Student', icon: GraduationCap, label: 'Student (Mentee)' },
    { name: 'Mentor', icon: UserCheck, label: 'Mentor (Faculty)' },
    { name: 'RO', icon: Briefcase, label: 'Relationship Officer' },
    { name: 'Admin', icon: Shield, label: 'Admin / Principal' }
  ];

  const handleRoleChange = (roleName) => {
    setCurrentUser(roleName);
    
    // Automatically set default sub-profile
    if (roleName === 'Student') {
      setSelectedSubProfile(db.users.students[0].id);
    } else if (roleName === 'Mentor') {
      setSelectedSubProfile(db.users.mentors[0].id);
    } else if (roleName === 'RO') {
      setSelectedSubProfile(db.users.ros[0].id);
    } else {
      setSelectedSubProfile('ADMIN');
    }
  };

  // Get options for the sub-profile switcher based on active role
  const getSubProfileOptions = () => {
    if (currentUser === 'Student') {
      return db.users.students.map(s => ({ id: s.id, name: `${s.name} (${s.id} - Sem ${s.sem})` }));
    }
    if (currentUser === 'Mentor') {
      return db.users.mentors.map(m => ({ id: m.id, name: m.name }));
    }
    if (currentUser === 'RO') {
      return db.users.ros.map(r => ({ id: r.id, name: r.name }));
    }
    return [];
  };

  const activeSubProfiles = getSubProfileOptions();

  // Get active issues count for the status ribbon
  const activeIssues = db.issues.filter(i => i.status !== 'Resolved').length;

  return (
    <header className="header-bar">
      <div className="header-container">
        {/* Logo & Branding */}
        <div className="app-branding">
          <div className="app-logo">
            <Layers size={22} />
          </div>
          <div className="app-title-group">
            <h1>SMART MENTORSHIP & STUDENT SUPPORT</h1>
            <p>Nitte Meenakshi Institute of Technology</p>
          </div>
        </div>

        {/* System Ribbon */}
        <div className="system-ribbon">
          <div className="ribbon-item">
            <span className="ribbon-dot"></span>
            <span>System Live</span>
          </div>
          <div className="ribbon-item" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '12px' }}>
            <span>Active Issues: <strong>{activeIssues}</strong></span>
          </div>
        </div>

        {/* Profile Details Select & Role Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {activeSubProfiles.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Profile:</span>
              <select
                className="form-select"
                style={{ padding: '6px 12px', width: 'auto', fontSize: '0.8rem', minWidth: '150px' }}
                value={selectedSubProfile}
                onChange={(e) => setSelectedSubProfile(e.target.value)}
              >
                {activeSubProfiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Role Tabs */}
          <div className="role-switcher-group">
            {roles.map(role => {
              const Icon = role.icon;
              const isActive = currentUser === role.name;
              return (
                <button
                  key={role.name}
                  onClick={() => handleRoleChange(role.name)}
                  className={`role-tab ${isActive ? `active-${role.name}` : ''}`}
                  title={role.label}
                >
                  <Icon size={16} />
                  <span>{role.name}</span>
                </button>
              );
            })}
          </div>

          {/* Reset System Database */}
          <button 
            onClick={resetDatabase} 
            className="btn-icon-only" 
            title="Reset Database to Defaults"
            style={{ padding: '8px' }}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
    </header>
  );
};
