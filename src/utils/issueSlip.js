import { buildIssueActivity, formatActivityTime, parseActivityTime } from '../../shared/issueActivity.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]));
const field = (label, value) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || 'Not recorded')}</dd></div>`;
const section = (title, content) => content ? `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(content)}</p></section>` : '';

export function buildIssueSlipHtml({ issue, student = {}, officer = {}, history = {}, exportedAt = new Date().toISOString() }) {
  const issueId = String(issue?.id || issue?.issue_id || '').trim();
  if (!issueId) throw new Error('Select an issue before exporting its slip.');
  if (history.issueId && String(history.issueId).trim().toUpperCase() !== issueId.toUpperCase()) {
    throw new Error('The activity history does not belong to the selected issue.');
  }
  const activity = buildIssueActivity({ issue, logs: history.logs || [], emailLogs: history.emailLogs || [] });
  const feedback = issue.feedback;
  const rating = feedback?.rating ?? issue.feedbackRating ?? issue.feedback_rating;
  const feedbackComments = feedback?.comments || issue.feedbackComments || issue.feedback_comments || '';
  const feedbackText = rating != null ? `Rating: ${rating} / 5${feedbackComments ? `\n${feedbackComments}` : ''}` : feedbackComments;
  const events = activity.map(event => `<li>
    <div class="event-heading"><strong>${escapeHtml(event.title)}</strong><time>${escapeHtml(formatActivityTime(event.time))}</time></div>
    <p>${escapeHtml(event.text)}</p>
    ${event.actor ? `<p class="detail">By: ${escapeHtml(event.actor)}</p>` : ''}
    ${event.kind === 'email' ? `<div class="email-details">
      ${event.sender ? `<p>From: ${escapeHtml(event.sender)}</p>` : ''}
      ${event.recipient ? `<p>To: ${escapeHtml(event.recipient)}</p>` : ''}
      <p>${escapeHtml(event.delivery)}${event.eventType ? ` · ${escapeHtml(event.eventType)}` : ''}</p>
    </div>` : ''}
  </li>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(issueId)} - Grievance Slip</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #172033; background: white; font: 12px/1.55 Arial, sans-serif; }
  header { border-bottom: 2px solid #00236f; padding-bottom: 12px; margin-bottom: 18px; }
  h1 { margin: 2px 0; color: #00236f; font-size: 23px; }
  h2 { margin: 0 0 8px; font-size: 15px; color: #00236f; }
  p { margin: 5px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .institution { font-weight: bold; letter-spacing: .05em; }
  .subtitle, .detail { color: #4b5563; }
  .metadata { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 22px; margin: 0 0 20px; }
  dt { color: #4b5563; font-size: 10px; text-transform: uppercase; }
  dd { margin: 2px 0 0; font-weight: bold; overflow-wrap: anywhere; }
  section { margin: 18px 0; }
  ol { list-style: none; padding: 0; margin: 0; }
  li { border: 1px solid #d7dce4; border-radius: 5px; padding: 10px 12px; margin: 0 0 10px; break-inside: avoid; }
  .event-heading { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; }
  time { color: #4b5563; font-size: 10px; }
  .email-details { border-top: 1px solid #e5e7eb; margin-top: 6px; padding-top: 4px; font-size: 11px; }
  footer { border-top: 1px solid #d7dce4; padding-top: 10px; color: #4b5563; font-size: 10px; }
  h2, header { break-after: avoid; }
</style></head><body>
<header><p class="institution">NITTE Student Mentorship &amp; Grievance Portal</p><h1>Grievance Slip · ${escapeHtml(issueId)}</h1><p class="subtitle">Selected issue and its Action &amp; Procedure Log</p></header>
<main>
<dl class="metadata">
  ${field('Ticket ID', issueId)}
  ${field('Status', issue.status)}
  ${field('Student', issue.studentName || issue.student_name || student.name)}
  ${field('Student ID', issue.studentId || issue.student_id || student.id)}
  ${field('Category', issue.category)}
  ${field('Priority', issue.priority)}
  ${field('Assigned officer', issue.roName || officer.name || issue.roId || issue.ro_id)}
  ${field('Submitted', formatActivityTime(parseActivityTime(issue.createdAt || issue.created_at || issue.submittedAt)))}
</dl>
${section('Reported Issue', issue.description)}
${section('Discussion Minutes', issue.discussionSummary || issue.discussionMinutes || issue.discussion_summary)}
${section('Agreed Action Items', issue.actionItems || issue.action_items)}
${section('Resolution', issue.resolutionNotes || issue.resolution_notes)}
${section('Student Feedback', feedbackText)}
<section><h2>Action &amp; Procedure Log</h2><p class="subtitle">${activity.length} events · Oldest first · All times in IST</p>
${events ? `<ol>${events}</ol>` : '<p>No actions have been recorded for this issue yet.</p>'}</section>
</main>
<footer>Ticket ${escapeHtml(issueId)} · Exported ${escapeHtml(formatActivityTime(parseActivityTime(exportedAt)))}</footer>
</body></html>`;
}

export function printIssueSlip(html, documentRef = document) {
  return new Promise((resolve, reject) => {
    const frame = documentRef.createElement('iframe');
    frame.title = 'Selected grievance slip';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    const cleanup = () => frame.remove();
    frame.onload = () => {
      try {
        const printWindow = frame.contentWindow;
        if (!printWindow?.print) throw new Error('Printing is not available in this browser.');
        printWindow.addEventListener('afterprint', cleanup, { once: true });
        printWindow.focus();
        printWindow.print();
        resolve();
      } catch (error) { cleanup(); reject(error); }
    };
    frame.onerror = () => { cleanup(); reject(new Error('Could not prepare the selected issue slip.')); };
    frame.srcdoc = html;
    documentRef.body.appendChild(frame);
  });
}
