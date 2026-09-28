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
      background: 'linear-gradient(135deg, #f0f7ff 0%, #f8fafc 50%, #eef2ff 100%)',
      color: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, Roboto, sans-serif"
    }}>
      {/* Top Portal Banner */}
      <header style={{
        borderBottom: '1px solid #e2e8f0',
        backdropFilter: 'blur(16px)',
        background: 'rgba(255, 255, 255, 0.95)',
        padding: '10px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 2px 10px rgba(30, 58, 138, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <NitteLogo height={34} />
          <div>
            <h1 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, letterSpacing: '0.3px', color: '#1e3a8a' }}>
              NITTE (Deemed to be University)
            </h1>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>
              Smart Student Mentorship & Escalation Support Portal
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: isPgConnected ? '#ecfdf5' : '#fffbeb',
            border: `1px solid ${isPgConnected ? '#a7f3d0' : '#fde68a'}`,
            padding: '4px 10px',
            borderRadius: '20px',
            fontSize: '0.72rem',
            fontWeight: 600,
            color: isPgConnected ? '#047857' : '#b45309'
          }}>
            <span style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: isPgConnected ? '#10b981' : '#f59e0b',
              boxShadow: isPgConnected ? '0 0 6px #10b981' : '0 0 6px #f59e0b'
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
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: isDemoLimitBypassed ? '0 2px 6px rgba(5, 150, 105, 0.25)' : '0 2px 6px rgba(217, 119, 6, 0.25)'
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
        maxWidth: '1240px',
        margin: '0 auto',
        width: '100%',
        padding: '20px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center'
      }}>
        {/* Institutional Welcome Heading - Compact */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <div style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: '6px', 
            background: '#eff6ff', 
            border: '1px solid #bfdbfe', 
            padding: '3px 12px', 
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 700,
            color: '#1d4ed8',
            marginBottom: '8px'
          }}>
            <Sparkles size={13} /> Multi-Role Portal Authentication System
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 4px 0', letterSpacing: '-0.4px', color: '#1e3a8a' }}>
            Welcome to NITTE Mentorship Portal
          </h2>
          <p style={{ margin: 0, fontSize: '0.84rem', color: '#64748b', maxWidth: '620px', marginInline: 'auto' }}>
            Choose your official role below to sign in with your institution credentials, or select an active account from the live roster database in Demo Mode.
          </p>
        </div>

        {/* 4-Role Navigation Pills - Sleek & Compact */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '10px',
          maxWidth: '820px',
          margin: '0 auto 16px auto',
          width: '100%'
        }}>
          {[
            { id: 'Student', label: 'Student (Mentee)', icon: GraduationCap, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
            { id: 'Mentor', label: 'Faculty Mentor', icon: UserCheck, color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' },
            { id: 'RO', label: 'Relationship Officer', icon: Briefcase, color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
            { id: 'Admin', label: 'System Admin', icon: Shield, color: '#e11d48', bg: '#fff1f2', border: '#fecdd3' }
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
                  gap: '8px',
                  padding: '9px 12px',
                  borderRadius: '10px',
                  border: isSel ? `2px solid ${r.color}` : '1px solid #e2e8f0',
                  background: isSel ? r.bg : '#ffffff',
                  color: isSel ? r.color : '#475569',
                  fontWeight: isSel ? 800 : 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.16s ease',
                  boxShadow: isSel ? `0 4px 12px -2px rgba(30, 58, 138, 0.12)` : '0 1px 3px rgba(0, 0, 0, 0.02)'
                }}
              >
                <Icon size={16} style={{ color: isSel ? r.color : '#94a3b8' }} />
                <span>{r.label}</span>
              </button>
            );
          })}
        </div>

        {/* Two-Column Grid: Form Left, Live Roster Demo Right - Compact */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.15fr',
          gap: '16px',
          alignItems: 'start'
        }}>
          {/* COLUMN 1: LOGIN FORM */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '20px',
            boxShadow: '0 4px 20px -2px rgba(30, 58, 138, 0.07)'
          }}>
            {/* Form Top Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px', color: '#1e3a8a' }}>
                  <Lock size={18} style={{ color: '#2563eb' }} />
                  {authMode === 'signup' ? 'Student Registration' : `${selectedRole} Sign In`}
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: '#64748b' }}>
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
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    color: '#1d4ed8',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
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
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.8rem'
              }}>
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#047857',
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.8rem'
              }}>
                <CheckCircle2 size={16} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* LOGIN TAB FORM */}
            {authMode === 'login' ? (
              <form onSubmit={handleSubmitLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#334155', marginBottom: '4px' }}>
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
                        padding: '9px 12px',
                        paddingLeft: '34px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        color: '#0f172a',
                        fontSize: '0.86rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <Mail size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#334155' }}>
                      Account Password *
                    </label>
                    <span style={{ fontSize: '0.72rem', color: '#2563eb' }}>
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
                        padding: '9px 12px',
                        paddingLeft: '34px',
                        paddingRight: '34px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        color: '#0f172a',
                        fontSize: '0.86rem',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <Key size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer'
                      }}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  style={{
                    marginTop: '4px',
                    padding: '10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #2563eb 0%, #1e3a8a 100%)',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.25)'
                  }}
                >
                  {isLoading ? (
                    <>
                      <RefreshCw size={16} className="spin" />
                      <span>Authenticating Credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In as {selectedRole}</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

                {/* Instant Bypass Button for Evaluators */}
                <div style={{ textAlign: 'center', marginTop: '2px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (onBypassToDashboard) onBypassToDashboard(selectedRole, identifier);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#64748b',
                      fontSize: '0.74rem',
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
              <form onSubmit={handleStudentSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
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
                      padding: '8px 10px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      color: '#0f172a',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
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
                      padding: '8px 10px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      color: '#0f172a',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                      USN / ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 4NM23CS045"
                      value={regUsn}
                      onChange={(e) => setRegUsn(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 8px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        color: '#0f172a',
                        fontSize: '0.82rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                      Branch
                    </label>
                    <select
                      value={regBranch}
                      onChange={(e) => setRegBranch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 6px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        color: '#0f172a',
                        fontSize: '0.82rem',
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
                    <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                      Semester
                    </label>
                    <select
                      value={regSem}
                      onChange={(e) => setRegSem(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 6px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        color: '#0f172a',
                        fontSize: '0.82rem',
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
                  <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 600, color: '#334155', marginBottom: '3px' }}>
                    Set Account Password *
                  </label>
                  <input
                    type="password"
                    required
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      color: '#0f172a',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingReg}
                  style={{
                    marginTop: '4px',
                    padding: '9px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#059669',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {isSubmittingReg ? <RefreshCw size={15} className="spin" /> : <ShieldCheck size={15} />}
                  <span>Register & Auto-Login Student</span>
                </button>
              </form>
            )}
          </div>

          {/* COLUMN 2: DEMO MODE LIVE ROSTER DATABASE QUICK ACCESS */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '14px',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '560px',
            boxShadow: '0 4px 20px -2px rgba(30, 58, 138, 0.07)'
          }}>
            <div style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', color: '#1e3a8a' }}>
                  <Zap size={16} style={{ color: '#d97706' }} />
                  Demo Mode: Live {selectedRole} Roster
                </h3>
                <span style={{ fontSize: '0.7rem', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>
                  1-Click Auto-Fill
                </span>
              </div>
              <p style={{ margin: '2px 0 8px 0', fontSize: '0.74rem', color: '#64748b' }}>
                Click any profile below to immediately auto-fill credentials and log in without manual typing.
              </p>

              {/* Roster Search Bar & Category Filter */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    placeholder={`Search ${selectedRole} by name or ID...`}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      paddingLeft: '28px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      color: '#0f172a',
                      fontSize: '0.78rem',
                      boxSizing: 'border-box'
                    }}
                  />
                  <Search size={13} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                </div>

                {selectedRole === 'RO' && (
                  <select
                    value={roCategoryFilter}
                    onChange={(e) => setRoCategoryFilter(e.target.value)}
                    style={{
                      padding: '6px 8px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      color: '#0f172a',
                      fontSize: '0.78rem'
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
              gap: '6px',
              paddingRight: '4px'
            }}>
              {/* STUDENT ROSTER LIST */}
              {selectedRole === 'Student' && (
                filteredStudents.map((stu, i) => (
                  <div
                    key={stu.id || i}
                    onClick={() => handleQuickRosterLogin(stu, 'Student')}
                    style={{
                      background: identifier === stu.id ? '#eff6ff' : '#ffffff',
                      border: identifier === stu.id ? '1.5px solid #2563eb' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.8rem'
                      }}>
                        {stu.name ? stu.name.charAt(0) : 'S'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>
                          {stu.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', gap: '6px', marginTop: '1px' }}>
                          <code>{stu.id}</code>
                          <span>•</span>
                          <span>{stu.branch} - Sem {stu.sem}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.68rem', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, display: 'block', marginBottom: '2px' }}>
                        {stu.password || 'Nit#Stu2026'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                        Login <ChevronRight size={11} />
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
                      background: identifier === mnt.id ? '#ecfdf5' : '#ffffff',
                      border: identifier === mnt.id ? '1.5px solid #059669' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: '#ecfdf5',
                        color: '#047857',
                        border: '1px solid #a7f3d0',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.8rem'
                      }}>
                        {mnt.name ? mnt.name.charAt(0) : 'M'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>
                          {mnt.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', gap: '6px', marginTop: '1px' }}>
                          <code>{mnt.id}</code>
                          <span>•</span>
                          <span>{mnt.dept || 'CSE'}</span>
                          <span>•</span>
                          <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mnt.class || 'Mentees'}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.68rem', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, display: 'block', marginBottom: '2px' }}>
                        {mnt.password || 'Nit#Mnt2026'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                        Login <ChevronRight size={11} />
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
                      background: identifier === ro.id ? '#fffbeb' : '#ffffff',
                      border: identifier === ro.id ? '1.5px solid #d97706' : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '6px',
                        background: '#fffbeb',
                        color: '#b45309',
                        border: '1px solid #fde68a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: '0.8rem'
                      }}>
                        {ro.id.replace('RO-', '')}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#0f172a' }}>
                          {ro.name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', gap: '6px', marginTop: '1px', alignItems: 'center' }}>
                          <code>{ro.id}</code>
                          <span>•</span>
                          <span style={{ maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ro.region}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '0.68rem', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, display: 'block', marginBottom: '2px' }}>
                        {ro.password || 'Nit#Ro2026'}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#d97706', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                        Login <ChevronRight size={11} />
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
                    background: '#fff1f2',
                    border: '1.5px solid #fecdd3',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '8px',
                      background: '#ffe4e6',
                      color: '#e11d48',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '1rem'
                    }}>
                      <Shield size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.86rem', color: '#881337' }}>
                        System Administrator / Principal
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#9f1239', marginTop: '1px' }}>
                        Master Email: <code>skandhayashu2906@gmail.com</code>
                      </div>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.7rem', background: '#ffffff', color: '#e11d48', border: '1px solid #fecdd3', padding: '2px 6px', borderRadius: '4px', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                      Admin@2026
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#e11d48', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'flex-end' }}>
                      1-Click Login <ChevronRight size={12} />
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
