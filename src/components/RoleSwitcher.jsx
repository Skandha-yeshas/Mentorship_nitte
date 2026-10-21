import React, { useContext } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { LogOut } from 'lucide-react';
import { NitteLogo } from './NitteLogo';

export const RoleSwitcher = ({ selectedSubProfile, onOpenLoginPage }) => {
  const { currentUser, db, authenticatedUser, logoutUser } = useContext(DatabaseContext);

  const handleLogout = () => {
    logoutUser();
    if (onOpenLoginPage) {
      onOpenLoginPage();
    }
  };

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

  // Student specific profile details
  const targetStudentId = String(selectedSubProfile || authenticatedUser?.id || '').trim().toLowerCase();
  const currentStudent = currentUser === 'Student' ? (
    (db.users?.students || []).find(s => s.id && String(s.id).trim().toLowerCase() === targetStudentId) ||
    (db.users?.students || []).find(s => s.email && String(s.email).trim().toLowerCase() === targetStudentId) ||
    authenticatedUser ||
    (db.users?.students || [])[0]
  ) : null;

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-[0_1px_4px_rgba(0,0,0,0.03)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
        {/* Brand & University Seal */}
        <div className="flex items-center gap-3.5">
          <NitteLogo height={34} />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-extrabold tracking-tight text-nitte-800 leading-tight">NITTE DU</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-nitte-50 text-nitte-800 font-semibold border border-nitte-200">Redressal Portal</span>
            </div>
            <span className="text-[12px] text-slate-500 font-medium leading-none mt-0.5">NITTE DU • Smart Mentorship System</span>
          </div>
        </div>

        {/* Quick Search (Desktop) */}
        <div className="hidden lg:flex items-center flex-1 max-w-sm mx-6">
          <div className="relative w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
            <input
              className="w-full text-xs pl-9 pr-8 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-nitte-800/30 focus:border-nitte-800 transition"
              placeholder="Search grievance ID, mentor, circulars..."
              type="text"
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">⌘K</kbd>
          </div>
        </div>

        {/* Profile Pill & Prominent Log Out */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 pl-1">
            <div className="relative">
              {/* Profile photo is EMPTY (clean silhouette placeholder) */}
              <div className="w-10 h-10 rounded-full bg-slate-100 border-2 border-slate-200 flex items-center justify-center text-slate-400 shadow-sm">
                <span className="material-symbols-outlined text-[22px]">person</span>
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-white"></span>
            </div>
            <div className="flex flex-col text-left">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm leading-none">{getDisplayName()}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-nitte-100 text-nitte-800 font-bold border border-nitte-200">
                  {currentUser === 'Student' && currentStudent?.sem ? `Sem ${currentStudent.sem} • ${currentStudent.branch}` : `${currentUser} Account`}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {currentUser === 'Student' && (
                  <span className="text-[11px] font-mono text-slate-500 leading-none">
                    USN: {currentStudent?.id || selectedSubProfile || ''}
                  </span>
                )}
                <span className="inline-flex items-center text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                  UGC Verified
                </span>
              </div>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-200"></div>

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
      </div>
    </header>
  );
};
