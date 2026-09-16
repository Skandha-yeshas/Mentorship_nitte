import React, { useContext } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { Shield, GraduationCap, UserCheck, Briefcase, RefreshCw, Layers, Mail, Key, LogIn, LogOut } from 'lucide-react';
import { NitteLogo } from './NitteLogo';

export const RoleSwitcher = ({ selectedSubProfile, setSelectedSubProfile, onOpenLoginModal, onOpenLoginPage }) => {
  const { currentUser, setCurrentUser, db, resetDatabase, isPgConnected, authenticatedUser, logoutUser, isDemoLimitBypassed, toggleDemoLimitBypass } = useContext(DatabaseContext);

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
      setSelectedSubProfile(db.users.students[0]?.id || 'u18cm24s0058');
    } else if (roleName === 'Mentor') {
      setSelectedSubProfile(db.users.mentors[0]?.id || 'M-101');
    } else if (roleName === 'RO') {
      setSelectedSubProfile(db.users.ros[0]?.id || 'RO-01');
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

          {/* Demo Mode 7-Day Limit Toggle Button */}
          <button
            onClick={toggleDemoLimitBypass}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: isDemoLimitBypassed ? '#10b981' : '#f59e0b',
              color: '#ffffff',
              border: 'none',
              borderRadius: '20px',
              padding: '4px 10px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              marginLeft: '8px',
              boxShadow: isDemoLimitBypassed ? '0 2px 4px rgba(16, 185, 129, 0.3)' : '0 2px 4px rgba(245, 158, 11, 0.3)'
            }}
            title="Toggle 7-Day Limit (Demo Mode allows unlimited submissions for testing)"
          >
            <span>{isDemoLimitBypassed ? '🔓 Demo Mode: 7-Day Limit OFF' : '🔒 7-Day Limit: ON (2/Wk)'}</span>
          </button>
        </div>

        {/* Profile Details Select & Role Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Main Portal Login Page Switcher */}
          <button
            onClick={onOpenLoginPage}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            title="Go to Multi-Role Portal Login Page"
          >
            <LogIn size={14} />
            <span>Portal Login Page</span>
          </button>

          {/* Computer Password Login / Status Button */}
          <button
            onClick={onOpenLoginModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: authenticatedUser ? '#10b981' : 'var(--bg-card)',
              color: authenticatedUser ? '#ffffff' : 'var(--text-secondary)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Quick Login Modal"
          >
            <Key size={13} />
            <span>{authenticatedUser ? `${authenticatedUser.name}` : 'Quick Modal'}</span>
          </button>

          {authenticatedUser && (
            <button
              onClick={() => {
                logoutUser();
                if (onOpenLoginPage) onOpenLoginPage();
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#fca5a5',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '6px',
                padding: '4px 8px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              title="Log out and return to Login Page"
            >
              <LogOut size={12} />
              <span>Exit</span>
            </button>
          )}

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
