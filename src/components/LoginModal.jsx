import React, { useState, useContext } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';

export const LoginModal = ({ isOpen, onClose }) => {
  const { db, loginUser, logoutUser, authenticatedUser, generateUserPassword } = useContext(DatabaseContext);

  const [activeTab, setActiveTab] = useState('login'); // 'login' or 'generate'
  const [role, setRole] = useState('Student');
  const [userId, setUserId] = useState('S101');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState('');

  // Password Generator State
  const [genRoleId, setGenRoleId] = useState('S101');
  const [genRole, setGenRole] = useState('Student');
  const [generatedPwd, setGeneratedPwd] = useState('');
  const [targetEmail, setTargetEmail] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    if (newRole === 'Student' && db.users?.students?.length) {
      setUserId(db.users.students[0].id);
    } else if (newRole === 'RO' && db.users?.ros?.length) {
      setUserId(db.users.ros[0].id);
    } else if (newRole === 'Mentor' && db.users?.mentors?.length) {
      setUserId(db.users.mentors[0].id);
    } else {
      setUserId('ADMIN');
    }
  };

  const handleGenRoleChange = (newRole) => {
    setGenRole(newRole);
    if (newRole === 'Student' && db.users?.students?.length) {
      setGenRoleId(db.users.students[0].id);
    } else if (newRole === 'RO' && db.users?.ros?.length) {
      setGenRoleId(db.users.ros[0].id);
    } else if (newRole === 'Mentor' && db.users?.mentors?.length) {
      setGenRoleId(db.users.mentors[0].id);
    } else {
      setGenRoleId('ADMIN');
    }
  };

  const handleGeneratePassword = async (e) => {
    e.preventDefault();
    setIsGenerating(true);
    setGeneratedPwd('');
    setCopied(false);

    try {
      const res = await generateUserPassword(genRoleId, genRole);
      if (res && res.password) {
        setGeneratedPwd(res.password);
        setTargetEmail(res.email || (genRole === 'Student' ? 'skandhayashas2906@gmail.com' : 'skandhayashu2906@gmail.com'));
        setPassword(res.password);
        setUserId(genRoleId);
        setRole(genRole);
      }
    } catch (err) {
      console.error('Password generation failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError('');
    setLoginSuccess('');

    const res = await loginUser(userId, password, role);
    if (res.success) {
      setLoginSuccess(`Successfully logged in as ${res.user.name || userId}`);
      setTimeout(() => {
        setLoginSuccess('');
        onClose();
      }, 1200);
    } else {
      setLoginError(res.error || 'Invalid credentials.');
    }
  };

  const copyToClipboard = () => {
    if (generatedPwd) {
      navigator.clipboard.writeText(generatedPwd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
                Portal Authentication & Security
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Computer Password Generation System
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
            🔐 User Login
          </button>
          <button
            onClick={() => setActiveTab('generate')}
            style={{
              flex: 1,
              padding: '0.85rem 1rem',
              border: 'none',
              background: 'transparent',
              fontWeight: 600,
              fontSize: '0.9rem',
              cursor: 'pointer',
              color: activeTab === 'generate' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'generate' ? '2px solid #2563eb' : '2px solid transparent'
            }}
          >
            ⚡ Generate Password
          </button>
        </div>

        {/* Body Content */}
        <div style={{ padding: '1.5rem' }}>
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
                  Select Portal Role
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
                  User ID / USN *
                </label>
                {role === 'Admin' ? (
                  <input
                    type="text"
                    readOnly
                    value="ADMIN"
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontWeight: 600 }}
                  />
                ) : (
                  <select
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: 600 }}
                  >
                    {role === 'Student' && (db.users?.students || []).map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                    ))}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                    Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setActiveTab('generate')}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
                  >
                    ⚡ Need Computer Password?
                  </button>
                </div>
                <input
                  type="password"
                  required
                  placeholder="Enter generated password..."
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
            </form>
          )}

          {/* GENERATE TAB */}
          {activeTab === 'generate' && (
            <form onSubmit={handleGeneratePassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ backgroundColor: '#eff6ff', border: '1px solid #bfdbfe', padding: '0.85rem 1rem', borderRadius: '8px', fontSize: '0.85rem', color: '#1e40af' }}>
                🤖 <strong>Computer Password Generator:</strong> Select a account and click <strong>Generate Computer Password</strong>. The computer system will construct a high-entropy password, update your account security, and dispatch confirmation to your assigned Gmail address:
                <div style={{ marginTop: '0.35rem', fontWeight: 600 }}>
                  • Students: <code>skandhayashas2906@gmail.com</code><br/>
                  • RO Officers: <code>skandhayashu2906@gmail.com</code>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}>
                  Target Role
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
                  {['Student', 'RO', 'Mentor', 'Admin'].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleGenRoleChange(r)}
                      style={{
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: genRole === r ? '2px solid #2563eb' : '1px solid #cbd5e1',
                        backgroundColor: genRole === r ? '#eff6ff' : '#ffffff',
                        color: genRole === r ? '#1e40af' : '#475569',
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
                  Select User ID for Password Generation
                </label>
                {genRole === 'Admin' ? (
                  <input
                    type="text"
                    readOnly
                    value="ADMIN"
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', backgroundColor: '#f8fafc', fontWeight: 600 }}
                  />
                ) : (
                  <select
                    value={genRoleId}
                    onChange={(e) => setGenRoleId(e.target.value)}
                    style={{ width: '100%', padding: '0.65rem 0.85rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', fontWeight: 600 }}
                  >
                    {genRole === 'Student' && (db.users?.students || []).map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                    ))}
                    {genRole === 'RO' && (db.users?.ros || []).map(r => (
                      <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
                    ))}
                    {genRole === 'Mentor' && (db.users?.mentors || []).map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
                    ))}
                  </select>
                )}
              </div>

              <button
                type="submit"
                disabled={isGenerating}
                style={{
                  padding: '0.75rem',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: isGenerating ? 'wait' : 'pointer',
                  boxShadow: '0 2px 4px rgba(2, 132, 199, 0.3)'
                }}
              >
                {isGenerating ? '🔄 Generating Password...' : '⚡ Generate Computer Password'}
              </button>

              {generatedPwd && (
                <div style={{
                  backgroundColor: '#f8fafc',
                  border: '2px solid #3b82f6',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  marginTop: '0.5rem',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                    Computer-Generated Secure Password
                  </div>
                  <div style={{
                    fontSize: '1.6rem',
                    fontWeight: 800,
                    letterSpacing: '2px',
                    fontFamily: 'monospace',
                    color: '#0f172a',
                    backgroundColor: '#ffffff',
                    padding: '0.6rem 1rem',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    margin: '0.75rem 0',
                    userSelect: 'all'
                  }}>
                    {generatedPwd}
                  </div>
                  
                  <div style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600, marginBottom: '0.85rem' }}>
                    📩 Notification sent via Gmail to <code>{targetEmail}</code>
                  </div>

                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={copyToClipboard}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#ffffff',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      {copied ? '✅ Copied!' : '📋 Copy Password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('login')}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: 'pointer'
                      }}
                    >
                      🚀 Login Now with this Password
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
