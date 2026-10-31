import { useEffect, useState } from 'react';

const colors = ['bg-blue-600', 'bg-indigo-600', 'bg-amber-500', 'bg-emerald-600', 'bg-rose-500', 'bg-purple-600', 'bg-cyan-600', 'bg-slate-500'];
const percent = value => value === null ? 'N/A' : `${value.toFixed(1)}%`;
const hours = value => value === null ? 'N/A' : `${value.toFixed(1)} hrs`;
const speedClass = value => value === null ? 'text-slate-500' : value < 24 ? 'text-emerald-700' : value <= 48 ? 'text-amber-700' : 'text-rose-700';

export default function AdminGrievanceAnalytics({ branches = [] }) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let disposed = false;
    let inFlight = false;
    const controller = new AbortController();
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch('/api/admin/analytics', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Database analytics are temporarily unavailable.');
        const data = await response.json();
        if (data.source !== 'database' || !Array.isArray(data.domains) || !Array.isArray(data.branches)) throw new Error('Could not load database analytics.');
        if (!disposed) setState({ data, loading: false, error: '' });
      } catch (error) {
        if (!disposed) setState(previous => ({ ...previous, loading: false, error: error.message }));
      } finally { inFlight = false; }
    };
    refresh();
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { disposed = true; controller.abort(); clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [retry]);

  const { data, loading, error } = state;
  const branchNames = new Map(branches.map(branch => [String(branch.code).trim().toUpperCase(), branch.name]));
  const updated = data ? new Date(data.generatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
  const placeholder = loading ? 'Loading database analytics...' : 'Database analytics unavailable.';

  return <section aria-label="Database grievance analytics" className="space-y-3">
    {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
      <span>{error} {data ? 'Showing the last successful database update.' : 'No analytics have been loaded.'}</span>
      <button type="button" className="font-bold underline" onClick={() => setRetry(value => value + 1)}>Retry analytics</button>
    </div>}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 p-5 lg:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">Grievance Distribution Across Domains</h3>
            <p className="text-xs text-slate-500 mt-0.5">Active grievances by submitted domain; resolved and closed cases excluded.</p>
          </div>
          {data && <span className="text-[11px] font-mono text-blue-700">Updated {updated} IST</span>}
        </div>
        {!data ? <p role="status" className="text-xs text-slate-500 py-6">{placeholder}</p>
          : data.totals.activeIssues === 0 ? <p className="text-xs text-slate-500 py-6">No active grievances in the database.</p>
            : <div className="space-y-4 mt-2">
              {data.domains.map((item, index) => <div key={item.domain}>
                <div className="flex justify-between gap-3 text-xs font-medium mb-1.5">
                  <span className="text-slate-700 flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${colors[index % colors.length]}`}></span>{item.domain}</span>
                  <span className="font-mono text-slate-900 font-semibold">{item.count} Cases ({percent(item.percentage)})</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden" role="img" aria-label={`${item.domain}: ${item.count} active grievances, ${percent(item.percentage)}`}>
                  <div className={`h-full rounded-full ${colors[index % colors.length]}`} style={{ width: `${item.percentage}%` }}></div>
                </div>
              </div>)}
            </div>}
        {data && <p className="mt-6 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">{data.totals.activeIssues} active grievances across all domains.</p>}
      </div>

      <div className="lg:col-span-7 p-5 lg:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900 tracking-tight">Academic Branch SLA &amp; Resolution Throughput</h3>
        <p className="text-xs text-slate-500 mt-0.5">Persisted student and mentor totals, with grievance outcomes by the student's branch.</p>
        <div className="flex flex-wrap gap-2 mt-3 mb-5 text-[10px] font-semibold">
          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">&lt; 24h average</span>
          <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">24–48h average</span>
          <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">&gt; 48h average</span>
        </div>
        {!data ? <p role="status" className="text-xs text-slate-500 py-6">{placeholder}</p>
          : !data.branches.length ? <p className="text-xs text-slate-500 py-6">No branch records in the database.</p>
            : <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 text-[11px] uppercase tracking-wider"><tr>
                  <th className="py-2.5 px-3">Department / Branch</th><th className="py-2.5 px-3">Enrolled</th><th className="py-2.5 px-3">Mentors</th><th className="py-2.5 px-3">Active Tickets</th><th className="py-2.5 px-3">Avg Resolution</th><th className="py-2.5 px-3 text-right">Resolved %</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {data.branches.map(branch => <tr key={branch.code} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3 font-semibold text-slate-900">{branch.code === '__UNASSIGNED__' ? 'Unassigned branch' : branchNames.has(branch.code) ? `${branch.code} (${branchNames.get(branch.code)})` : branch.code}</td>
                    <td className="py-3 px-3 font-mono">{branch.enrolled}</td><td className="py-3 px-3 font-mono">{branch.mentorCount}</td>
                    <td className="py-3 px-3"><span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono border border-blue-200">{branch.activeTickets} Open</span></td>
                    <td className={`py-3 px-3 font-mono ${speedClass(branch.averageResolutionHours)}`} title={`${branch.timedResolutionCount} resolved or closed ticket(s) with valid timestamps`}>{hours(branch.averageResolutionHours)}</td>
                    <td className="py-3 px-3 text-right font-mono" title={`${branch.resolvedCount} resolved or closed out of ${branch.totalTickets} total ticket(s)`}>{percent(branch.resolutionRate)}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>}
        {data && <p className="mt-3 text-[11px] text-slate-500">Average resolution measures submission to resolution for resolved or closed tickets with valid timestamps. Resolved % = resolved or closed / all tickets. N/A means no eligible records.</p>}
      </div>
    </div>
  </section>;
}
