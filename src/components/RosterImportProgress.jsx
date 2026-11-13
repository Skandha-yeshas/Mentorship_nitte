import React, { useState } from 'react';
import { apiFetch } from '../utils/apiFetch.js';
import { downloadRosterCsv } from '../utils/rosterCredentialExport.js';

export function RosterImportProgress({ jobs, kind, refresh }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const visible = (jobs || []).filter(job => job.kind === kind).slice(0, 3);
  if (!visible.length) return null;
  const download = async job => {
    setBusy(job.id); setError('');
    try {
      const response = await apiFetch(`/api/admin/roster-jobs/${job.id}?results=1`, { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not download import results.');
      if (result.status !== 'COMPLETED') throw new Error('This import is still processing. Download results after it completes.');
      const columns = ['index', 'id', 'name', 'email', 'status', 'action', 'password', 'passwordStatus', 'emailStatus', 'reason'].map(key => [key, key]);
      downloadRosterCsv(`${kind}-import-${job.id}.csv`, columns, result.results || []);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  };
  const retry = async job => {
    setBusy(job.id); setError('');
    try {
      const response = await apiFetch(`/api/admin/roster-jobs/${job.id}/retry-emails`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not queue retries.');
      setMessage(`${result.queued} eligible emails queued. Unconfirmed deliveries need a provider check.`);
      await refresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(''); }
  };
  return <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4" aria-label="Roster import progress">
    <h3 className="text-sm font-bold text-blue-950">Recent roster imports</h3>
    <p className="text-xs text-slate-600">Imports continue when you close the browser. Existing accounts keep their passwords. Account creation and email delivery are shown separately.</p>
    {visible.map(job => <div key={job.id} className="space-y-2 rounded-lg bg-white p-3 text-xs text-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-2"><strong>{job.processed}/{job.total} processed · {job.successCount} saved · {job.failureCount} failed</strong><span>{job.status}</span></div>
      <progress className="w-full" value={job.processed} max={job.total} aria-label="Accounts processed" />
      <p>Emails: {job.emailsSent} accepted · {job.emailsWaiting} waiting · {job.emailsUnsent} not sent</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy === job.id || job.status !== 'COMPLETED'} onClick={() => download(job)} className="rounded border px-3 py-1 font-semibold disabled:opacity-50">Download results and initial passwords</button>
        {job.emailsUnsent > 0 && <button type="button" disabled={busy === job.id} onClick={() => retry(job)} className="rounded border px-3 py-1">Retry eligible unsent emails</button>}
      </div>
    </div>)}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    {message && <p role="status" className="text-xs text-slate-700">{message}</p>}
  </section>;
}
