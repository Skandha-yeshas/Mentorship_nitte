export function formatTicketNumber(issueOrNumber) {
  const issue = issueOrNumber && typeof issueOrNumber === 'object' ? issueOrNumber : null;
  const raw = issue ? issue.ticketNumber ?? issue.ticket_number : issueOrNumber;
  if (typeof raw === 'string' && /^GRV-\d+$/i.test(raw.trim())) return raw.trim().toUpperCase();
  const number = Number(raw);
  if (Number.isSafeInteger(number) && number > 0) return `GRV-${String(number).padStart(6, '0')}`;
  return String(issue?.id || issue?.issue_id || raw || '');
}
