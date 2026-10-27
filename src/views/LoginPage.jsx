import React, { useState, useContext, useEffect } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import {
  GraduationCap, UserCheck, Briefcase, Shield, Key, Mail, Lock,
  ArrowRight, CheckCircle2, AlertCircle, Eye, EyeOff, RefreshCw, ShieldCheck, Sparkles
} from 'lucide-react';
import { NitteLogo } from '../components/NitteLogo';

export const LoginPage = ({ onLoginSuccess }) => {
  const { db, loginUser } = useContext(DatabaseContext);

  // Selected Role: 'Admin', 'Student', 'Mentor', 'RO' (Default to Admin)
  const [selectedRole, setSelectedRole] = useState('Admin');

  // Credentials Form State (Default to Admin)
  const [identifier, setIdentifier] = useState('admin@nitte.edu.in');
  const [password, setPassword] = useState('Admin@2026');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [isTypingPassword, setIsTypingPassword] = useState(false);

  // Handle URL query parameters for One-Click Direct Sign-In (from Roster Onboarding Gmail)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const roleParam = params.get('role');
      const idParam = params.get('id') || params.get('user') || params.get('usn') || params.get('email');
      const pwdParam = params.get('pwd') || params.get('password') || params.get('key');

      if (idParam || pwdParam || roleParam) {
        let targetRole = 'Student';
        if (roleParam) {
          const matched = ['Student', 'Mentor', 'RO', 'Admin'].find(
            r => r.toLowerCase() === roleParam.toLowerCase()
          );
          if (matched) targetRole = matched;
        }

        setSelectedRole(targetRole);

        const cleanId = idParam ? decodeURIComponent(idParam).trim() : '';
        const cleanPwd = pwdParam ? decodeURIComponent(pwdParam).trim() : '';

        if (cleanId) setIdentifier(cleanId);
        if (cleanPwd) setPassword(cleanPwd);

        // If credentials are provided from the invitation link:
        if (cleanId && cleanPwd) {
          const targetRoleLabel = targetRole === 'Mentor' ? 'Faculty Mentor' : targetRole;
          setSuccessMsg(`⚡ Credentials pre-filled for ${cleanId}. Please click "Sign In to ${targetRoleLabel} Portal" below to access your dashboard.`);
        }
      }
    } catch (e) {
      console.warn('Error reading URL login parameters:', e);
    }
  }, []);

  // Role details mapping
  const roleConfig = {
    Admin: {
      label: 'System Admin',
      title: 'Administrator Portal',
      subtitle: 'Sign in to access institutional management, roster upload, and analytics.',
      icon: Shield,
      color: '#e11d48',
      bg: '#fff1f2',
      border: '#fecdd3',
      defaultId: 'admin@nitte.edu.in',
      idPlaceholder: 'admin@nitte.edu.in or ADMIN',
      idLabel: 'Admin Email ID / Username *'
    },
    Student: {
      label: 'Student (Mentee)',
      title: 'Student Mentorship Portal',
      subtitle: 'Sign in with your institutional credentials to submit issues and track mentorship.',
      icon: GraduationCap,
      color: '#2563eb',
      bg: '#eff6ff',
      border: '#bfdbfe',
      defaultId: '',
      idPlaceholder: 'e.g. u18cm24s0058 or student@nitte.edu.in',
      idLabel: 'Student USN / Institutional Email ID *'
    },
    Mentor: {
      label: 'Faculty Mentor',
      title: 'Faculty Mentor Portal',
      subtitle: 'Sign in to view your mentee students, review feedback, and schedule meetings.',
      icon: UserCheck,
      color: '#059669',
      bg: '#ecfdf5',
      border: '#a7f3d0',
      defaultId: '',
      idPlaceholder: 'e.g. M-101 or faculty@nitte.edu.in',
      idLabel: 'Faculty Mentor ID / Official Email *'
    },
    RO: {
      label: 'Relationship Officer',
      title: 'Relationship Officer Portal',
      subtitle: 'Sign in to manage departmental student issues and conduct 1-on-1 resolution sessions.',
      icon: Briefcase,
      color: '#d97706',
      bg: '#fffbeb',
      border: '#fde68a',
      defaultId: 'RO-01',
      idPlaceholder: 'e.g. RO-01 or officer@nitte.edu.in',
      idLabel: 'Relationship Officer ID (RO-01 to RO-49) / Email *'
    }
  };

  // When role changes, set appropriate default credentials
  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setErrorMsg('');
    setSuccessMsg('');

    if (role === 'Admin') {
      setIdentifier('admin@nitte.edu.in');
      setPassword('Admin@2026');
    } else if (role === 'RO') {
      setIdentifier('RO-01');
      setPassword('Nit#Ro2026');
    } else {
      setIdentifier('');
      setPassword('');
    }
  };

  // Track Caps Lock and typing status on password input
  const handlePasswordKeyDown = (e) => {
    // If the user clicks the Caps Lock key itself while not typing, do not show or trigger
    if (e.key === 'CapsLock' && !isTypingPassword) {
      return;
    }

    if (e.getModifierState) {
      setCapsLockOn(e.getModifierState('CapsLock'));
    } else if (e.key && e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
      const isUpper = e.key === e.key.toUpperCase();
      const isShift = e.shiftKey;
      setCapsLockOn((isUpper && !isShift) || (!isUpper && isShift));
    }

    // Only set typing state when an actual typing key is pressed (not CapsLock by itself)
    if (e.key !== 'CapsLock') {
      setIsTypingPassword(true);
    }
  };

  const handlePasswordKeyUp = (e) => {
    if (e.key === 'CapsLock' && !isTypingPassword) {
      return;
    }
    if (e.getModifierState) {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  };

  // Submit Login Form
  const handleSubmitLogin = async (e) => {
    e.preventDefault();
    if (!identifier.trim() || !password.trim()) {
      setErrorMsg('Please enter your Email ID / User ID and Password.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await loginUser(identifier.trim(), password.trim(), selectedRole);
      if (res.success) {
        const targetRole = res.user.role || selectedRole;
        setSuccessMsg(`Welcome, ${res.user.name || identifier}! Redirecting to ${targetRole} Dashboard...`);
        setTimeout(() => {
          if (onLoginSuccess) {
            onLoginSuccess(res.user, targetRole, res.user.id);
          }
        }, 300);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Login failed. Please verify your credentials and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const currentConfig = roleConfig[selectedRole] || roleConfig.Admin;
  const RoleIcon = currentConfig.icon;

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f7ff 0%, #f8fafc 50%, #eef2ff 100%)',
      color: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, Roboto, sans-serif"
    }}>
      {/* Top Header Banner */}
      <header style={{
        borderBottom: '1px solid #e2e8f0',
        backdropFilter: 'blur(16px)',
        background: 'rgba(255, 255, 255, 0.95)',
        padding: '12px 28px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        boxShadow: '0 2px 10px rgba(30, 58, 138, 0.05)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <NitteLogo height={36} />
          <div>
            <h1 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, letterSpacing: '0.3px', color: '#1e3a8a' }}>
              NITTE (Deemed to be University)
            </h1>
            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748b' }}>
              Student Mentorship & Escalation Support Portal
            </p>
          </div>
        </div>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          padding: '4px 12px',
          borderRadius: '20px',
          fontSize: '0.74rem',
          fontWeight: 600,
          color: '#047857'
        }}>
          <span style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: '#10b981',
            boxShadow: '0 0 6px #10b981'
          }} />
          <span>Institutional Portal Active</span>
        </div>
      </header>

      {/* Centered Single-Column Container */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        width: '100%'
      }}>
        <div style={{
          width: '100%',
          maxWidth: '460px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}>
          {/* Header Title */}
          <div style={{ textAlign: 'center' }}>
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
              <ShieldCheck size={13} /> Institutional Single Sign-On
            </div>
            <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: '0 0 4px 0', letterSpacing: '-0.3px', color: '#1e3a8a' }}>
              Sign In to NITTE Portal
            </h2>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748b' }}>
              Select your role and enter your institutional email & password.
            </p>
          </div>

          {/* 4-Role Navigation Pills */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '6px',
            background: '#f1f5f9',
            padding: '4px',
            borderRadius: '12px'
          }}>
            {[
              { id: 'Admin', label: 'Admin', icon: Shield, color: '#e11d48' },
              { id: 'Student', label: 'Student', icon: GraduationCap, color: '#2563eb' },
              { id: 'Mentor', label: 'Mentor', icon: UserCheck, color: '#059669' },
              { id: 'RO', label: 'RO', icon: Briefcase, color: '#d97706' }
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
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '8px 4px',
                    borderRadius: '8px',
                    border: 'none',
                    background: isSel ? '#ffffff' : 'transparent',
                    color: isSel ? r.color : '#64748b',
                    fontWeight: isSel ? 800 : 600,
                    fontSize: '0.76rem',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSel ? '0 2px 8px rgba(0, 0, 0, 0.08)' : 'none'
                  }}
                >
                  <Icon size={16} style={{ color: isSel ? r.color : '#94a3b8' }} />
                  <span>{r.label}</span>
                </button>
              );
            })}
          </div>

          {/* Single Column Login Card */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 30px -4px rgba(30, 58, 138, 0.08)'
          }}>
            {/* Form Role Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '18px',
              paddingBottom: '14px',
              borderBottom: '1px solid #f1f5f9'
            }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: currentConfig.bg,
                color: currentConfig.color,
                border: `1px solid ${currentConfig.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <RoleIcon size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  {currentConfig.title}
                </h3>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#64748b' }}>
                  {currentConfig.subtitle}
                </p>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                padding: '10px 12px',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.8rem'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Success Message */}
            {successMsg && (
              <div style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#047857',
                padding: '10px 12px',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.8rem'
              }}>
                <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                <span>{successMsg}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmitLogin} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                  {currentConfig.idLabel}
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={currentConfig.idPlaceholder}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      paddingLeft: '36px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      color: '#0f172a',
                      fontSize: '0.88rem',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'border-color 0.15s ease'
                    }}
                  />
                  <Mail size={16} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                  Account Password *
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (e.target.value.length > 0) {
                        setIsTypingPassword(true);
                      } else {
                        setIsTypingPassword(false);
                      }
                    }}
                    onKeyDown={handlePasswordKeyDown}
                    onKeyUp={handlePasswordKeyUp}
                    onBlur={() => setIsTypingPassword(false)}
                    placeholder="Enter account password..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      paddingLeft: '36px',
                      paddingRight: '36px',
                      background: '#ffffff',
                      border: (isTypingPassword && password.length > 0 && capsLockOn)
                        ? '1px solid #f59e0b'
                        : '1px solid #cbd5e1',
                      borderRadius: '8px',
                      color: '#0f172a',
                      fontSize: '0.88rem',
                      outline: 'none',
                      boxSizing: 'border-box'
                    }}
                  />
                  <Key size={16} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
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
                      cursor: 'pointer',
                      padding: '2px'
                    }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {isTypingPassword && password.length > 0 && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '6px',
                    padding: '5px 10px',
                    background: capsLockOn ? '#fffbeb' : '#f0fdf4',
                    border: `1px solid ${capsLockOn ? '#fde68a' : '#bbf7d0'}`,
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: capsLockOn ? '#b45309' : '#15803d',
                    transition: 'all 0.15s ease'
                  }}>
                    {capsLockOn ? (
                      <>
                        <AlertCircle size={13} style={{ color: '#d97706', flexShrink: 0 }} />
                        <span>Caps Lock is ON</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={13} style={{ color: '#16a34a', flexShrink: 0 }} />
                        <span>Caps Lock is OFF</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                style={{
                  marginTop: '6px',
                  padding: '11px',
                  borderRadius: '8px',
                  border: 'none',
                  background: `linear-gradient(135deg, ${currentConfig.color} 0%, #0f172a 100%)`,
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: `0 4px 14px -2px ${currentConfig.color}40`,
                  transition: 'opacity 0.15s ease'
                }}
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={16} className="spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to {currentConfig.label || selectedRole} Portal</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Footer Security Note */}
          <div style={{ textAlign: 'center', fontSize: '0.73rem', color: '#94a3b8' }}>
            Official NITTE Institutional Portal • All account logins and activities are securely recorded and monitored.
          </div>
        </div>
      </main>
    </div>
  );
};
