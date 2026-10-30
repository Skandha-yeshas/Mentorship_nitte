import { useEffect, useMemo, useState } from 'react';
import { buildIssueActivity, formatActivityTime } from '../../shared/issueActivity.js';

export default function IssueActivityLog({ issue, emailLogs = [] }) {
  const issueId = String(issue?.id || issue?.issue_id || '').trim();
  const [remote, setRemote] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!issueId) return;
    const controller = new AbortController();
    let active = true;
    let timer;
    setRemote(null);
    setStatus('loading');
    const refresh = async () => {
      try {
        const response = await fetch(`/api/issues/${encodeURIComponent(issueId)}/activity`, { signal: controller.signal });
        if (!response.ok) throw new Error('Activity unavailable');
        const data = await response.json();
        if (!active) return;
        setRemote(data);
        setStatus('ready');
      } catch (error) {
        if (active && error.name !== 'AbortError') setStatus('offline');
      } finally {
        if (active) timer = setTimeout(refresh, 5000);
      }
    };
    refresh();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [issueId]);

  // Never reuse the previous ticket's results while the selected issue changes.
  const matchingRemote = remote && String(remote.issueId).toUpperCase() === issueId.toUpperCase() ? remote : null;
  const activity = useMemo(() => buildIssueActivity({
    issue, logs: matchingRemote?.logs || [], emailLogs: matchingRemote?.emailLogs || emailLogs
  }), [issue, matchingRemote, emailLogs]);

  return (
    <section aria-labelledby="student-action-log-title" className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h4 id="student-action-log-title" className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <span className="material-symbols-outlined text-[20px] text-nitte-800" aria-hidden="true">history_edu</span>
            Action &amp; Procedure Log
          </h4>
          <p className="mt-1 text-[11px] text-slate-500">Complete ticket history, from submission through meetings, decisions, emails, and feedback. Oldest first.</p>
        </div>
        <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-800">{activity.length} events</span>
      </div>
      {status === 'loading' && <p role="status" className="text-xs text-slate-500">Loading complete ticket history…</p>}
      {status === 'offline' && <p role="status" className="text-xs text-amber-800">Showing available history. Email and saved action updates will refresh when the server reconnects.</p>}
      {activity.length ? (
        <ol className="max-h-96 space-y-3 overflow-y-auto pr-1" aria-label="Ticket activity, oldest first">
          {activity.map(event => (
            <li key={event.id} className={`rounded-lg border p-3 text-xs ${event.kind === 'email' ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-800">{event.title}</span>
                <time dateTime={event.time || undefined} className="text-[10px] text-slate-500">{formatActivityTime(event.time)}</time>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-slate-700">{event.text}</p>
              {event.actor && <p className="mt-1 text-[11px] text-slate-500">By: {event.actor}</p>}
              {event.kind === 'email' && (
                <div className="mt-2 space-y-1 border-t border-blue-100 pt-2 text-[11px] text-slate-600">
                  {event.sender && <p className="break-words">From: {event.sender}</p>}
                  {event.recipient && <p className="break-words">To: {event.recipient}</p>}
                  <p className="font-semibold">{event.delivery}{event.eventType ? ` · ${event.eventType}` : ''}</p>
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : <p className="text-xs text-slate-500">No actions have been recorded for this ticket yet.</p>}
    </section>
  );
}
