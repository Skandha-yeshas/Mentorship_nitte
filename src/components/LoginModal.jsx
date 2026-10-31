import React, { useContext } from 'react';
import { DatabaseContext } from '../context/DatabaseContext';
import { LoginPage } from '../views/LoginPage';

export const LoginModal = ({ isOpen, onClose }) => {
  const { authenticatedUser } = useContext(DatabaseContext);
  if (!isOpen) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="Portal sign in" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#f8fafc', overflowY: 'auto' }}>
      <button type="button" onClick={onClose} aria-label="Close sign in" style={{ position: 'absolute', right: 16, top: 20, zIndex: 1001, padding: 8 }}>Close</button>
      {authenticatedUser ? <p style={{ padding: 24 }}>Signed in as {authenticatedUser.name}. Close this window to return to your dashboard.</p> : <LoginPage onLoginSuccess={onClose} />}
    </div>
  );
};
