import { MAX_ROSTER_FILE_BYTES } from '../../shared/rosterValidation.js';

export async function readRosterFile(file, kind) {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error('Choose an Excel (.xlsx/.xls) or CSV roster.');
  if (!file.size || file.size > MAX_ROSTER_FILE_BYTES) throw new Error('The roster file must be non-empty and no larger than 2 MB.');
  const buffer = await file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./rosterFile.worker.js', import.meta.url), { type: 'module' });
    const finish = (error, rows) => { clearTimeout(timeout); worker.terminate(); if (error) reject(new Error(error)); else resolve(rows); };
    const timeout = setTimeout(() => finish('Reading this file took too long. Export a plain-value Excel or CSV roster and try again.'), 10000);
    worker.onmessage = ({ data }) => finish(data.error, data.rows);
    worker.onerror = () => finish('The roster file could not be read.');
    worker.postMessage({ buffer, kind }, [buffer]);
  });
}
