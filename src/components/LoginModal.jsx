import React, { useState, useContext } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';

export const LoginModal = ({ isOpen, onClose }) => {
  const { db, loginUser, logoutUser, authenticatedUser, registerStudent } = useContext(DatabaseContext);

  const [activeTab, setActiveTab] = useState('login'); // 'login' or 'signup'
  
  // Login Form State
  const [role, setRole] = useState('Student');
  const [loginIdentifier, setLoginIdentifier] = useState('skandhayashas2906@gmail.com');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState('');

  // Register Student Form State
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('skandhayashas2906@gmail.com');
  const [regUsn, setRegUsn] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regBranch, setRegBranch] = useState('Computer Science & Engineering (CSE)');
  const [regSem, setRegSem] = useState('4');
  const [regError, setRegError] = useState('');
  const [regSuccess, setRegSuccess] = useState('');
  const [isSubmittingReg, setIsSubmittingReg] = useState(false);

  if (!isOpen) return null;

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    if (newRole === 'Student') {
      setLoginIdentifier(db.users?.students?.[0]?.email || 'skandhayashas2906@gmail.com');
    } else if (newRole === 'RO') {
      setLoginIdentifier(db.users?.ros?.[0]?.id || 'RO-01');
    } else if (newRole === 'Mentor') {
      setLoginIdentifier(db.users?.mentors?.[0]?.id || 'M101');
    } else {
      setLoginIdentifier('ADMIN');
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginSuccess('');

    try {
      const res = await loginUser(loginIdentifier, password, role);
      if (res.success) {
        setLoginSuccess(`Successfully authenticated as ${res.user.name || loginIdentifier}`);
        setTimeout(() => {
          setLoginSuccess('');
          onClose();
        }, 1200);
      } else {
        setLoginError(res.error || 'Invalid email/ID or password.');
      }
    } catch (err) {
      setLoginError(err.message || 'Login failed. Please check your credentials.');
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setRegError('');
    setRegSuccess('');

    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setRegError('Full Name, Gmail Address, and Password are required.');
      return;
    }

    setIsSubmittingReg(true);

    try {
      const res = await registerStudent({
        name: regName,
        email: regEmail,
        usn: regUsn,
        password: regPassword,
        branch: regBranch,
        sem: regSem
      });

      if (res.success) {
        setRegSuccess(`Registration successful! Account created for ${res.student.name}. Confirmation email sent to ${res.student.email}`);
        setLoginIdentifier(res.student.email);
        setPassword(regPassword);
        setRole('Student');
        
        setTimeout(() => {
          setActiveTab('login');
          setRegSuccess('');
        }, 2000);
      }
    } catch (err) {
      setRegError(err.message || 'Registration failed. Please check your details.');
    } finally {
      setIsSubmittingReg(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '92vh',
        borderRadius: '16px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        border: '1px solid #e2e8f0'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#ffffff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '1.2rem',
              fontWeight: 'bold'
            }}>
              🔑
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>
                NITTE Mentorship Student Portal
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Gmail Sign-Up & Portal Authentication
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.4rem',
              cursor: 'pointer',
              lineHeight: 1
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Buttons */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #e2e8f0',
          backgroundColor: '#f8fafc'
        }}>
          <button
            onClick={() => setActiveTab('login')}
            style={{
              flex: 1,
              padding: '0.85rem 1rem',
              border: 'none',
              background: 'transparent',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              color: activeTab === 'login' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'login' ? '2px solid #2563eb' : '2px solid transparent'
            }}
          >
            🔐 Log In
          </button>
          <button
            onClick={() => setActiveTab('signup')}
            style={{
              flex: 1,
              padding: '0.85rem 1rem',
              border: 'none',
              background: 'transparent',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              color: activeTab === 'signup' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'signup' ? '2px solid #2563eb' : '2px solid transparent'
            }}
          >
            ✨ Student Sign-Up (Gmail)
          </button>
        </div>

        {/* Body Content */}
        <div style={{ padding: '1.5rem', overflowY: 'auto' }}>
          {authenticatedUser && (
            <div style={{
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '10px',
              padding: '1rem',
              marginBottom: '1.25rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase' }}>
                  Active Logged In Session
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0f172a', marginTop: '0.1rem' }}>
                  {authenticatedUser.name} ({authenticatedUser.role})
                </div>
                <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                  Email: <code>{authenticatedUser.email}</code>
                </div>
              </div>
              <button
                onClick={logoutUser}
                style={{
                  backgroundColor: '#fee2e2',
                  color: '#991b1b',
                  border: '1px solid #fca5a5',
                  borderRadius: '6px',
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Log Out
              </button>
            </div>
          )}

          {/* LOGIN TAB */}
          {activeTab === 'login' && (
            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {loginSuccess && (
                <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600 }}>
                  ✅ {loginSuccess}
                </div>
              )}

              {loginError && (
                <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.875rem', border: '1px solid #fecaca' }}>
                  ⚠️ {loginError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Portal Role
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                  {['Student', 'RO', 'Mentor', 'Admin'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleRoleChange(r)}
                      style={{
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: role === r ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        backgroundColor: role === r ? '#eff6ff' : '#ffffff',
                        color: role === r ? '#1e40af' : '#475569',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  {role === 'Student' ? 'Registered Gmail Address / Student ID *' : 'User ID / Officer ID *'}
                </label>
                {role === 'Student' ? (
                  <input
                    type="text"
                    required
                    placeholder="e.g. skandhayashas2906@gmail.com or S101"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: 500 }}
                  />
                ) : role === 'Admin' ? (
                  <input
                    type="text"
                    readOnly
                    value="ADMIN"
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontWeight: 600 }}
                  />
                ) : (
                  <select
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: 600 }}
                  >
                    {role === 'RO' && (db.users?.ros || []).map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
                    ))}
                    {role === 'Mentor' && (db.users?.mentors || []).map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter account password..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>

              <button
                type="submit"
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(37, 99, 235, 0.3)'
                }}
              >
                Log In to {role} Dashboard
              </button>

              <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>New student? </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('signup')}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Create a Student Account with Gmail
                </button>
              </div>
            </form>
          )}

          {/* STUDENT SIGN-UP TAB */}
          {activeTab === 'signup' && (
            <form onSubmit={handleRegisterSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#1e40af' }}>
                🎓 <strong>Student Registration:</strong> Register with your <strong>Gmail ID</strong>. You will receive an instant welcome confirmation email, and can log in immediately with your password!
              </div>

              {regSuccess && (
                <div style={{ backgroundColor: '#dcfce7', color: '#166534', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600 }}>
                  {regSuccess}
                </div>
              )}

              {regError && (
                <div style={{ backgroundColor: '#fef2f2', color: '#991b1b', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', border: '1px solid #fecaca' }}>
                  ⚠️ {regError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Aarav Mehta"
                  value={regName}
                  onChange={(e) => setRegName(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Gmail Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. skandhayashas2906@gmail.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    USN / Student ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 4NM23CS001"
                    value={regUsn}
                    onChange={(e) => setRegUsn(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                    Semester *
                  </label>
                  <select
                    value={regSem}
                    onChange={(e) => setRegSem(e.target.value)}
                    style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                      <option key={s} value={s}>Semester {s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Branch / Department *
                </label>
                <select
                  value={regBranch}
                  onChange={(e) => setRegBranch(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                >
                  <option value="Computer Science & Engineering (CSE)">Computer Science & Engineering (CSE)</option>
                  <option value="Information Science & Engineering (ISE)">Information Science & Engineering (ISE)</option>
                  <option value="Artificial Intelligence & Data Science (AI&DS)">Artificial Intelligence & Data Science (AI&DS)</option>
                  <option value="Electronics & Communication (ECE)">Electronics & Communication (ECE)</option>
                  <option value="Electrical & Electronics (EEE)">Electrical & Electronics (EEE)</option>
                  <option value="Mechanical Engineering (MECH)">Mechanical Engineering (MECH)</option>
                  <option value="Civil Engineering (CIVIL)">Civil Engineering (CIVIL)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
                  Create Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Create secure password..."
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem' }}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingReg}
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: isSubmittingReg ? 'wait' : 'pointer',
                  boxShadow: '0 2px 4px rgba(22, 163, 74, 0.3)'
                }}
              >
                {isSubmittingReg ? '🔄 Registering Account...' : '✨ Register Student Account'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '0.35rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#64748b' }}>Already registered? </span>
                <button
                  type="button"
                  onClick={() => setActiveTab('login')}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Back to Log In
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
