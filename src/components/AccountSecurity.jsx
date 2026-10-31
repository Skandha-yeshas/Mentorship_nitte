import React, { useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { DatabaseContext } from '../context/DatabaseContext';
import { apiFetch } from '../utils/apiFetch.js';

export function AccountSecurity() {
  const { authenticatedUser, logoutUser } = useContext(DatabaseContext);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  if (!authenticatedUser) return null;
  const close = () => { setOpen(false); setCurrent(''); setPassword(''); setConfirmation(''); setError(''); };
  const submit = async event => {
    event.preventDefault(); setError('');
    if (password !== confirmation) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      const response = await apiFetch('/api/auth/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: current, newPassword: password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not change your password.');
      close(); await logoutUser(); window.alert('Password changed. Please sign in again with your new password.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Change password</button>
    {open && createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true" aria-labelledby="password-title">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <h2 id="password-title" className="font-bold text-slate-900">Change password</h2>
        <p className="text-sm text-slate-600">Use 12 to 128 characters. Changing your password signs you out on all devices.</p>
        <label className="block text-sm">Current password<input required type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        <label className="block text-sm">New password<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        <label className="block text-sm">Confirm new password<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-1 w-full rounded border p-2" /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={close}>Cancel</button><button type="submit" disabled={busy} className="rounded bg-blue-700 px-3 py-2 text-sm text-white">{busy ? 'Saving…' : 'Save password'}</button></div>
      </form>
    </div>, document.body)}
  </>;
}
