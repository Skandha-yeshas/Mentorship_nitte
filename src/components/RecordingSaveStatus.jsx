export default function RecordingSaveStatus({ uploads, onRetry, onDownload }) {
  if (!uploads.length) return null;
  return <div className="space-y-2" aria-live="polite">
    {uploads.map(upload => <div key={upload.id} className={`rounded-xl border p-3 text-xs ${upload.status === 'error' ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-blue-200 bg-blue-50 text-blue-950'}`}>
      <p className="font-bold">Ticket #{upload.issueId} · {upload.status === 'saved' ? 'Recording saved to database' : upload.status === 'error' ? 'Recording was not saved' : 'Saving meeting recording…'}</p>
      {upload.message && <p className="mt-1">{upload.message}</p>}
      {upload.status === 'error' && upload.hasBlob && <div className="mt-2 flex flex-wrap gap-3">
        <button type="button" onClick={() => onRetry(upload.id)} className="font-bold underline">Retry Upload</button>
        <button type="button" onClick={() => onDownload(upload.id)} className="font-bold underline">Download Unsaved Recording</button>
      </div>}
    </div>)}
  </div>;
}
