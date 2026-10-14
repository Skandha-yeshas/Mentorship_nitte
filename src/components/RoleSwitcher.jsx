import React, { useContext } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { LogOut, User, Shield, GraduationCap, UserCheck, Briefcase } from 'lucide-react';
import { NitteLogo } from './NitteLogo';

export const RoleSwitcher = ({ selectedSubProfile, onOpenLoginPage }) => {
  const { currentUser, db, authenticatedUser, logoutUser } = useContext(DatabaseContext);

  const handleLogout = () => {
    logoutUser();
    if (onOpenLoginPage) {
      onOpenLoginPage();
    }
  };

  // Get display name & role icon
  const getRoleIcon = () => {
    if (currentUser === 'Admin') return Shield;
    if (currentUser === 'Student') return GraduationCap;
    if (currentUser === 'Mentor') return UserCheck;
    if (currentUser === 'RO') return Briefcase;
    return User;
  };

  const RoleIcon = getRoleIcon();

  const getDisplayName = () => {
    if (authenticatedUser?.name) return authenticatedUser.name;
    if (currentUser === 'Admin') return 'Administrator';
    if (currentUser === 'Student') {
      const stu = db.users?.students?.find(s => s.id === selectedSubProfile);
      return stu ? stu.name : (selectedSubProfile || 'Student');
    }
    if (currentUser === 'Mentor') {
      const mnt = db.users?.mentors?.find(m => m.id === selectedSubProfile);
      return mnt ? mnt.name : (selectedSubProfile || 'Faculty Mentor');
    }
    if (currentUser === 'RO') {
      const ro = db.users?.ros?.find(r => r.id === selectedSubProfile);
      return ro ? ro.name : (selectedSubProfile || 'Relationship Officer');
    }
    return currentUser;
  };

  return (
    <header className="header-bar" style={{
      background: '#ffffff',
      borderBottom: '1px solid #e2e8f0',
      padding: '10px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
      position: 'sticky',
      top: 0,
      zIndex: 50
    }}>
      {/* Left: University Branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <NitteLogo height={34} />
        <div>
          <h1 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#1e3a8a', letterSpacing: '0.2px' }}>
            NITTE (Deemed to be University)
          </h1>
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>
            Student Mentorship & Escalation Support Portal
          </p>
        </div>
      </div>

      {/* Right: Current Session & Logout Button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* User Identity Chip */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          padding: '6px 12px',
          borderRadius: '20px'
        }}>
          <div style={{
            width: '26px',
            height: '26px',
            borderRadius: '50%',
            background: currentUser === 'Admin' ? '#ffe4e6' : currentUser === 'Student' ? '#eff6ff' : currentUser === 'Mentor' ? '#ecfdf5' : '#fffbeb',
            color: currentUser === 'Admin' ? '#e11d48' : currentUser === 'Student' ? '#2563eb' : currentUser === 'Mentor' ? '#059669' : '#d97706',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <RoleIcon size={14} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a', lineHeight: '1.2' }}>
              {getDisplayName()}
            </span>
            <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
              {currentUser} Account
            </span>
          </div>
        </div>

        {/* Prominent Log Out Button */}
        <button
          onClick={handleLogout}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#fee2e2',
            color: '#b91c1c',
            border: '1px solid #fca5a5',
            borderRadius: '8px',
            padding: '7px 14px',
            fontSize: '0.8rem',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            boxShadow: '0 1px 3px rgba(185, 28, 28, 0.08)'
          }}
          title="Sign out and return to Login Portal"
        >
          <LogOut size={14} />
          <span>Log Out</span>
        </button>
      </div>
    </header>
  );
};
