import React, { useContext } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { Shield, GraduationCap, UserCheck, Briefcase, RefreshCw, Layers, Mail, Key } from 'lucide-react';
import { NitteLogo } from './NitteLogo';

export const RoleSwitcher = ({ selectedSubProfile, setSelectedSubProfile, onOpenLoginModal }) => {
  const { currentUser, setCurrentUser, db, resetDatabase, isPgConnected, authenticatedUser } = useContext(DatabaseContext);

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
          <NitteLogo height={38} />
          <div className="portal-badge">
            <span>MENTORSHIP PORTAL</span>
          </div>
        </div>

        {/* System Ribbon */}
        <div className="system-ribbon">
          <div className="ribbon-item">
            <span 
              className="ribbon-dot" 
              style={{ backgroundColor: isPgConnected ? 'var(--accent-emerald)' : 'var(--accent-amber)' }}
            />
            <span>{isPgConnected ? 'PostgreSQL Live' : 'Local Demo Mode'}</span>
          </div>
          <div className="ribbon-item" style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '12px' }}>
            <span>Active Issues: <strong>{activeIssues}</strong></span>
          </div>
        </div>

        {/* Profile Details Select & Role Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {/* Computer Password Login Button */}
          <button
            onClick={onOpenLoginModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: authenticatedUser ? '#10b981' : '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)'
            }}
            title="Log in or Generate Computer Password"
          >
            <Key size={14} />
            <span>{authenticatedUser ? `Auth: ${authenticatedUser.id}` : 'Login / Generate Password'}</span>
          </button>

          {activeSubProfiles.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Profile:</span>
              <select
                className="form-select"
                style={{ padding: '6px 12px', width: 'auto', fontSize: '0.8rem', minWidth: '220px' }}
                value={selectedSubProfile}
                onChange={(e) => setSelectedSubProfile(e.target.value)}
              >
                {currentUser === 'RO' ? (
                  <>
                    {['Academic', 'Exams', 'Financial', 'Hostels', 'Placements', 'Facilities', 'Personal'].map(dept => {
                      const deptROs = db.users.ros.filter(r => r.region && r.region.startsWith(dept));
                      return (
                        <optgroup key={dept} label={`${dept} Helpdesks`}>
                          {deptROs.map(r => (
                            <option key={r.id} value={r.id}>{r.name.replace('RO - ', '')}</option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </>
                ) : (
                  activeSubProfiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))
                )}
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
