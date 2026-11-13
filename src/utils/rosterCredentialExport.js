import { apiFetch } from './apiFetch.js';
import { safeCsvCell } from '../../shared/rosterValidation.js';

const labels = { students: 'student', mentors: 'faculty mentor', ros: 'RO' };
const columns = {
  students: [['index', 'Index'], ['id', 'Student ID'], ['name', 'Student Name'], ['email', 'Official Email'], ['password', 'Initial Password'], ['passwordStatus', 'Password Source'], ['emailStatus', 'Email Delivery Status']],
  mentors: [['index', 'Index'], ['id', 'Faculty ID'], ['name', 'Faculty Name'], ['email', 'Official Email'], ['dept', 'Department'], ['class', 'Assigned Class / Batch'], ['password', 'Initial Password'], ['passwordStatus', 'Password Source'], ['emailStatus', 'Email Delivery Status']],
  ros: [['index', 'Index'], ['id', 'RO ID'], ['name', 'RO Name'], ['email', 'Official Email'], ['region', 'Domain Category'], ['password', 'Initial Password'], ['passwordStatus', 'Password Source'], ['emailStatus', 'Email Delivery Status']]
};

export function downloadRosterCsv(filename, fields, rows) {
  const csv = [fields.map(([, label]) => safeCsvCell(label)).join(','),
    ...rows.map(row => fields.map(([key]) => safeCsvCell(row[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Immediate revocation can cancel a download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function exportRosterPasswords(kind, { jobId, fetchImpl = apiFetch, downloadImpl = downloadRosterCsv } = {}) {
  if (!columns[kind]) throw new Error('Unknown roster type.');
  let id = jobId;
  if (!id) {
    const response = await fetchImpl('/api/admin/roster-jobs', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load recent roster imports. Please retry.');
    const jobs = await response.json();
    id = Array.isArray(jobs) ? jobs.find(job => job.kind === kind)?.id : null;
  }
  if (!id) throw new Error(`No recent ${labels[kind]} import found. Initial passwords are available from the import that created the accounts.`);
  const response = await fetchImpl(`/api/admin/roster-jobs/${encodeURIComponent(id)}?results=1`, { cache: 'no-store' });
  const job = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(job.error || 'Could not load import results. Please retry.');
  if (job.kind !== kind) throw new Error('The selected import belongs to a different roster.');
  if (job.status !== 'COMPLETED') throw new Error('This import is still processing. Download the initial passwords after it completes.');
  const records = (job.results || []).filter(row => row.action === 'CREATED' && typeof row.password === 'string' && row.password.length > 0);
  if (!records.length) throw new Error('This import created no new accounts with initial passwords. Existing passwords cannot be downloaded; use password reset if needed.');
  downloadImpl(`smart_mentorship_${kind}_initial_passwords_${id}.csv`, columns[kind], records);
  return records.length;
}
