import React, { useState, useContext, useMemo } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { 
  GraduationCap, UserCheck, Briefcase, Shield, Key, Mail, Lock, 
  ArrowRight, Search, CheckCircle2, AlertCircle, Eye, EyeOff, 
  Sparkles, RefreshCw, Zap, Users, ShieldCheck, ChevronRight
} from 'lucide-react';
import { NitteLogo } from '../components/NitteLogo';

export const LoginPage = ({ onLoginSuccess, onBypassToDashboard }) => {
  const { 
    db, 
    loginUser, 
    isPgConnected, 
    setCurrentUser, 
    isDemoLimitBypassed, 
    toggleDemoLimitBypass,
    registerStudent 
  } = useContext(DatabaseContext);

  // Tab State: 'login', 'signup'
  const [authMode, setAuthMode] = useState('login');
  
  // Selected Role: 'Student', 'Mentor', 'RO', 'Admin'
  const [selectedRole, setSelectedRole] = useState('Student');
  
  // Credentials Form State
  const [identifier, setIdentifier] = useState('u18cm24s0058');
  const [password, setPassword] = useState('Nit#Stu2026');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Roster Search & Filter in Demo Mode
  const [rosterSearch, setRosterSearch] = useState('');
  const [roCategoryFilter, setRoCategoryFilter] = useState('ALL');

  // Student Sign-Up State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regUsn, setRegUsn] = useState('');
  const [regPassword, setRegPassword] = useState('Nit#Stu2026');
  const [regBranch, setRegBranch] = useState('CSE');
  const [regSem, setRegSem] = useState('5');
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);

  // When role changes, pre-populate default representative credentials
  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setErrorMsg('');
    setSuccessMsg('');
    setAuthMode('login');

    if (role === 'Student') {
      const s = db.users?.students?.[0];
      setIdentifier(s ? s.id : 'u18cm24s0058');
      setPassword(s?.password || 'Nit#Stu2026');
    } else if (role === 'Mentor') {
      const m = db.users?.mentors?.[0];
      setIdentifier(m ? m.id : 'M-101');
      setPassword(m?.password || 'Nit#Mnt2026');
    } else if (role === 'RO') {
      const r = db.users?.ros?.[0];
      setIdentifier(r ? r.id : 'RO-01');
      setPassword(r?.password || 'Nit#Ro2026');
    } else if (role === 'Admin') {
      setIdentifier('ADMIN');
      setPassword('Admin@2026');
    }
  };

  // 1-Click Roster Auto-Fill & Instant Login
  const handleQuickRosterLogin = async (userRecord, role) => {
    setErrorMsg('');
    setSuccessMsg('');
    setIsLoading(true);

    const targetId = userRecord.id || userRecord.email;
    const targetPwd = userRecord.password || (
      role === 'Student' ? 'Nit#Stu2026' :
      role === 'Mentor' ? 'Nit#Mnt2026' :
      role === 'RO' ? 'Nit#Ro2026' : 'Admin@2026'
    );

    setIdentifier(targetId);
    setPassword(targetPwd);
    setSelectedRole(role);

    try {
      const res = await loginUser(targetId, targetPwd, role);
      if (res.success) {
        setSuccessMsg(`Welcome, ${res.user.name || targetId}! Redirecting to ${role} Dashboard...`);
        setTimeout(() => {
          if (onLoginSuccess) {
            onLoginSuccess(res.user, role, userRecord.id);
          }
        }, 600);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Quick login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Manual Login Form
  const handleSubmitLogin = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      setErrorMsg('Please enter your User ID / Email and Password.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await loginUser(identifier.trim(), password.trim(), selectedRole);
      if (res.success) {
        setSuccessMsg(`Authenticated as ${res.user.name || identifier}! Redirecting...`);
        setTimeout(() => {
          if (onLoginSuccess) {
            onLoginSuccess(res.user, selectedRole, res.user.id);
          }
        }, 600);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Login failed. Please check credentials or use Demo 1-Click Access.');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit Student Sign-up Form
  const handleStudentSignUp = async (e) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setErrorMsg('Name, Gmail ID, and Password are required.');
      return;
    }

    setIsSubmittingReg(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await registerStudent({
        name: regName.trim(),
        email: regEmail.trim(),
        usn: regUsn.trim(),
        password: regPassword.trim(),
        branch: regBranch,
        sem: regSem
      });

      if (res.success) {
        setSuccessMsg(`Account created for ${res.student.name}! Automated welcome email dispatched.`);
        setTimeout(() => {
          handleRoleSelect('Student');
          setIdentifier(res.student.email);
          setPassword(regPassword.trim());
          setAuthMode('login');
        }, 1200);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Registration failed.');
    } finally {
      setIsSubmittingReg(false);
    }
  };

  // Filtered Roster lists for Demo Mode
  const filteredStudents = useMemo(() => {
    const list = db.users?.students || [];
    if (!rosterSearch) return list;
    const q = rosterSearch.toLowerCase();
    return list.filter(s => 
      s.name?.toLowerCase().includes(q) || 
      s.id?.toLowerCase().includes(q) || 
      s.email?.toLowerCase().includes(q) ||
      s.branch?.toLowerCase().includes(q)
    );
  }, [db.users?.students, rosterSearch]);

  const filteredMentors = useMemo(() => {
    const list = db.users?.mentors || [];
    if (!rosterSearch) return list;
    const q = rosterSearch.toLowerCase();
    return list.filter(m => 
      m.name?.toLowerCase().includes(q) || 
      m.id?.toLowerCase().includes(q) || 
      m.email?.toLowerCase().includes(q) ||
      m.dept?.toLowerCase().includes(q)
    );
  }, [db.users?.mentors, rosterSearch]);

  const filteredRos = useMemo(() => {
    let list = db.users?.ros || [];
    if (roCategoryFilter !== 'ALL') {
      list = list.filter(r => r.region && r.region.toLowerCase().startsWith(roCategoryFilter.toLowerCase()));
    }
    if (!rosterSearch) return list;
    const q = rosterSearch.toLowerCase();
    return list.filter(r => 
      r.name?.toLowerCase().includes(q) || 
      r.id?.toLowerCase().includes(q) || 
      r.region?.toLowerCase().includes(q) ||
      r.email?.toLowerCase().includes(q)
    );
  }, [db.users?.ros, rosterSearch, roCategoryFilter]);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'radial-gradient(ellipse at top, #0f172a 0%, #020617 100%)',
      color: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif"
    }}>
      {/* Top Portal Banner */}
      <header style={{
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(12px)',
        background: 'rgba(15, 23, 42, 0.75)',
        padding: '12px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <NitteLogo height={34} />
          <div>
            <h1 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, letterSpacing: '0.5px', color: '#f8fafc' }}>
              NITTE (Deemed to be University)
            </h1>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
              Smart Student Mentorship & Escalation Support Portal
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: isPgConnected ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
            border: `1px solid ${isPgConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            color: isPgConnected ? '#6ee7b7' : '#fcd34d'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: isPgConnected ? '#10b981' : '#f59e0b',
              boxShadow: isPgConnected ? '0 0 8px #10b981' : '0 0 8px #f59e0b'
            }} />
            <span>{isPgConnected ? 'PostgreSQL Database Live' : 'Local Demo Mode'}</span>
          </div>

          <button
            onClick={toggleDemoLimitBypass}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: isDemoLimitBypassed ? '#059669' : '#d97706',
              color: '#ffffff',
              border: 'none',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Toggle demo limit mode"
          >
            <span>{isDemoLimitBypassed ? '🔓 Demo Mode: Unlimited' : '🔒 7-Day Limit (2/Wk)'}</span>
          </button>
        </div>
      </header>

      {/* Main Login Screen Container */}
      <main style={{
        flex: 1,
        maxWidth: '1280px',
        margin: '0 auto',
        width: '100%',
        padding: '32px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}>
        {/* Institutional Welcome Heading */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '8px', 
            background: 'rgba(59, 130, 246, 0.12)', 
            border: '1px solid rgba(59, 130, 246, 0.25)', 
            padding: '4px 14px', 
            borderRadius: '20px',
            fontSize: '0.8rem',
            color: '#60a5fa',
            marginBottom: '10px'
          }}>
            <Sparkles size={14} /> Multi-Role Portal Authentication System
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
            Welcome to NITTE Mentorship Portal
          </h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8', maxWidth: '600px', marginInline: 'auto' }}>
            Choose your official role below to sign in with your institution credentials, or select an active account from the live roster database in Demo Mode.
          </p>
        </div>

        {/* 4-Role Navigation Pills */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '10px',
          maxWidth: '820px',
          margin: '0 auto 28px auto',
          width: '100%'
        }}>
          {[
            { id: 'Student', label: 'Student (Mentee)', icon: GraduationCap, color: '#3b82f6' },
            { id: 'Mentor', label: 'Faculty Mentor', icon: UserCheck, color: '#8b5cf6' },
            { id: 'RO', label: 'Relationship Officer', icon: Briefcase, color: '#10b981' },
            { id: 'Admin', label: 'System Admin', icon: Shield, color: '#f59e0b' }
          ].map(r => {
            const Icon = r.icon;
            const isSel = selectedRole === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => handleRoleSelect(r.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  padding: '12px 14px',
                  borderRadius: '12px',
                  border: isSel ? `2px solid ${r.color}` : '1px solid rgba(255, 255, 255, 0.1)',
                  background: isSel ? `rgba(${r.color === '#3b82f6' ? '59, 130, 246' : r.color === '#8b5cf6' ? '139, 92, 246' : r.color === '#10b981' ? '16, 185, 129' : '245, 158, 11'}, 0.15)` : 'rgba(255, 255, 255, 0.03)',
                  color: isSel ? '#ffffff' : '#94a3b8',
                  fontWeight: isSel ? 700 : 600,
                  fontSize: '0.88rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: isSel ? `0 8px 20px -4px rgba(0, 0, 0, 0.4)` : 'none'
                }}
              >
                <Icon size={18} style={{ color: isSel ? r.color : '#64748b' }} />
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>

        {/* Two-Column Grid: Form Left, Live Roster Demo Right */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.1fr',
          gap: '24px',
          alignItems: 'start'
        }}>
          {/* COLUMN 1: LOGIN FORM */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            padding: '28px',
            backdropFilter: 'blur(16px)',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
          }}>
            {/* Form Top Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Lock size={20} style={{ color: '#38bdf8' }} />
                  {authMode === 'signup' ? 'Student Registration' : `${selectedRole} Sign In`}
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                  {authMode === 'signup' 
                    ? 'Register your student profile with Gmail for immediate access.' 
                    : `Enter your ${selectedRole} credentials or pick from the roster.`}
                </p>
              </div>

              {selectedRole === 'Student' && (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === 'login' ? 'signup' : 'login');
                    setErrorMsg('');
                    setSuccessMsg('');
                  }}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    color: '#60a5fa',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {authMode === 'login' ? '+ New Student Sign-Up' : '← Back to Login'}
                </button>
              )}
            </div>

            {/* Error and Success Alerts */}
            {errorMsg && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#fca5a5',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.85rem'
              }}>
                <AlertCircle size={18} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#6ee7b7',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.85rem'
              }}>
                <CheckCircle2 size={18} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* LOGIN TAB FORM */}
            {authMode === 'login' ? (
              <form onSubmit={handleSubmitLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                    {selectedRole === 'Student' ? 'Student USN / ID or Registered Gmail Address *' :
                     selectedRole === 'Mentor' ? 'Faculty Mentor ID or Official Email *' :
                     selectedRole === 'RO' ? 'Relationship Officer ID (e.g. RO-01) or Email *' :
                     'Administrator ID or Master Email *'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      required
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={
                        selectedRole === 'Student' ? 'e.g. u18cm24s0058 or skandhayashas2906@gmail.com' :
                        selectedRole === 'Mentor' ? 'e.g. M-101 or skandhayashu2906@gmail.com' :
                        selectedRole === 'RO' ? 'e.g. RO-01 or officer@nitte.edu' : 'ADMIN'
                      }
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        paddingLeft: '38px',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '0.9rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <Mail size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#cbd5e1' }}>
                      Account Password *
                    </label>
                    <span style={{ fontSize: '0.75rem', color: '#60a5fa' }}>
                      Default: <code>{selectedRole === 'Student' ? 'Nit#Stu2026' : selectedRole === 'Mentor' ? 'Nit#Mnt2026' : selectedRole === 'RO' ? 'Nit#Ro2026' : 'Admin@2026'}</code>
                    </span>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password..."
                      style={{
                        width: '100%',
                        padding: '11px 14px',
                        paddingLeft: '38px',
                        paddingRight: '38px',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '0.9rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <Key size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    marginTop: '8px',
                    padding: '12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)'
                  }}
                >
                  {isLoading ? (
                    <>
                      <RefreshCw size={18} className="spin" />
                      <span>Authenticating Credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In as {selectedRole}</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>

                {/* Instant Bypass Button for Evaluators */}
                <div style={{ textAlign: 'center', marginTop: '6px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (onBypassToDashboard) onBypassToDashboard(selectedRole, identifier);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    ⚡ Fast Demo Bypass: Jump straight into {selectedRole} Dashboard
                  </button>
                </div>
              </form>
            ) : (
              /* STUDENT SIGN-UP FORM */
              <form onSubmit={handleStudentSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                    Student Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sumanth Shetty"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                    Registered Gmail Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. student@gmail.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                      USN / ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 4NM23CS045"
                      value={regUsn}
                      onChange={(e) => setRegUsn(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 10px',
                        background: 'rgba(15, 23, 42, 0.6)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '0.85rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                      Branch
                    </label>
                    <select
                      value={regBranch}
                      onChange={(e) => setRegBranch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 8px',
                        background: 'rgba(15, 23, 42, 0.9)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '0.85rem',
                        boxSizing: 'border-box'
                      }}
                    >
                      <option value="CSE">CSE</option>
                      <option value="ISE">ISE</option>
                      <option value="ECE">ECE</option>
                      <option value="AIML">AIML</option>
                      <option value="ME">ME</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                      Semester
                    </label>
                    <select
                      value={regSem}
                      onChange={(e) => setRegSem(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 8px',
                        background: 'rgba(15, 23, 42, 0.9)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '0.85rem',
                        boxSizing: 'border-box'
                      }}
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                        <option key={s} value={s}>Sem {s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                    Set Account Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      color: '#ffffff',
                      fontSize: '0.88rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingReg}
                  style={{
                    marginTop: '6px',
                    padding: '11px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#10b981',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {isSubmittingReg ? <RefreshCw size={16} className="spin" /> : <ShieldCheck size={16} />}
                  <span>Register & Auto-Login Student</span>
                </button>
              </form>
            )}
          </div>

          {/* COLUMN 2: DEMO MODE LIVE ROSTER DATABASE QUICK ACCESS */}
          <div style={{
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '24px',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '620px'
          }}>
            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px', color: '#f1f5f9' }}>
                  <Zap size={18} style={{ color: '#f59e0b' }} />
                  Demo Mode: Live {selectedRole} Roster
                </h3>
                <span style={{ fontSize: '0.75rem', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
                  1-Click Auto-Fill
                </span>
              </div>
              <p style={{ margin: '4px 0 12px 0', fontSize: '0.78rem', color: '#94a3b8' }}>
                Click any profile below to immediately auto-fill their credentials and log in to the portal without manual typing.
              </p>

              {/* Roster Search Bar & Category Filter */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    placeholder={`Search ${selectedRole} by name or ID...`}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      paddingLeft: '32px',
                      background: 'rgba(15, 23, 42, 0.6)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '0.8rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                </div>

                {selectedRole === 'RO' && (
                  <select
                    value={roCategoryFilter}
                    onChange={(e) => setRoCategoryFilter(e.target.value)}
                    style={{
                      padding: '8px 10px',
                      background: 'rgba(15, 23, 42, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#ffffff',
                      fontSize: '0.8rem'
                    }}
                  >
                    <option value="ALL">All Departments</option>
                    <option value="Academic">Academic</option>
                    <option value="Exams">Exams</option>
                    <option value="Financial">Financial</option>
                    <option value="Hostels">Hostels</option>
                    <option value="Placements">Placements</option>
                    <option value="Facilities">Facilities</option>
                    <option value="Personal">Personal</option>
                  </select>
                )}
              </div>
            </div>

            {/* Scrollable Roster Cards Container */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingRight: '4px'
            }}>
              {/* STUDENT ROSTER LIST */}
              {selectedRole === 'Student' && (
                filteredStudents.map((stu, i) => (
                  <div
                    key={stu.id || i}
                    onClick={() => handleQuickRosterLogin(stu, 'Student')}
                    style={{
                      background: identifier === stu.id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: identifier === stu.id ? '1px solid rgba(59, 130, 246, 0.5)' : '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: 'rgba(59, 130, 246, 0.2)',
                        color: '#60a5fa',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.85rem'
                      }}>
                        {stu.name ? stu.name.charAt(0) : 'S'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f8fafc' }}>
                          {stu.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: '8px', marginTop: '2px' }}>
                          <code>{stu.id}</code>
                          <span>•</span>
                          <span>{stu.branch} - Sem {stu.sem}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        {stu.password || 'Nit#Stu2026'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                        Login <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                ))
              )}

              {/* MENTOR ROSTER LIST */}
              {selectedRole === 'Mentor' && (
                filteredMentors.map((mnt, i) => (
                  <div
                    key={mnt.id || i}
                    onClick={() => handleQuickRosterLogin(mnt, 'Mentor')}
                    style={{
                      background: identifier === mnt.id ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: identifier === mnt.id ? '1px solid rgba(139, 92, 246, 0.5)' : '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: 'rgba(139, 92, 246, 0.2)',
                        color: '#c084fc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.85rem'
                      }}>
                        {mnt.name ? mnt.name.charAt(0) : 'M'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f8fafc' }}>
                          {mnt.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: '8px', marginTop: '2px' }}>
                          <code>{mnt.id}</code>
                          <span>•</span>
                          <span>{mnt.dept || 'CSE'}</span>
                          <span>•</span>
                          <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mnt.class || 'Assigned Mentees'}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        {mnt.password || 'Nit#Mnt2026'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#c084fc', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                        Login <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                ))
              )}

              {/* RO ROSTER LIST */}
              {selectedRole === 'RO' && (
                filteredRos.map((ro, i) => (
                  <div
                    key={ro.id || i}
                    onClick={() => handleQuickRosterLogin(ro, 'RO')}
                    style={{
                      background: identifier === ro.id ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: identifier === ro.id ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: '10px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: 'rgba(16, 185, 129, 0.2)',
                        color: '#34d399',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.85rem'
                      }}>
                        {ro.id.replace('RO-', '')}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f8fafc' }}>
                          {ro.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', gap: '6px', marginTop: '2px', alignItems: 'center' }}>
                          <code>{ro.id}</code>
                          <span>•</span>
                          <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ro.region}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.72rem', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                        {ro.password || 'Nit#Ro2026'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                        Login <ChevronRight size={12} />
                      </span>
                    </div>
                  </div>
                ))
              )}

              {/* ADMIN ROSTER LIST */}
              {selectedRole === 'Admin' && (
                <div
                  onClick={() => handleQuickRosterLogin({ id: 'ADMIN', name: 'System Administrator', email: 'skandhayashu2906@gmail.com', password: 'Admin@2026' }, 'Admin')}
                  style={{
                    background: 'rgba(245, 158, 11, 0.15)',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    borderRadius: '10px',
                    padding: '16px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'rgba(245, 158, 11, 0.25)',
                      color: '#fbbf24',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '1.1rem'
                    }}>
                      <Shield size={22} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#ffffff' }}>
                        System Administrator / Principal
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '3px' }}>
                        Master Email: <code>skandhayashu2906@gmail.com</code>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.75rem', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', padding: '3px 8px', borderRadius: '4px', fontWeight: 700, display: 'block', marginBottom: '6px' }}>
                      Admin@2026
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#fbbf24', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                      1-Click Login <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
