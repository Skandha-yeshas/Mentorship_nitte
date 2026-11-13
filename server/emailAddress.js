import { createHash } from 'node:crypto';

const legacyDeveloperAddresses = new Set([
  '1e57afe1ea7927409a04cc2dcb211fc88e64382cb6d0b5969dfae85180215c74',
  'ae14fb287caf441e8ebe02b810bb825d049574ff132f34ac2dd23e6aa46bf7cc'
]);
export const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export function recipientProblem(value, { allowLegacy = false } = {}) {
  const email = normalizeEmail(value);
  if (!email) return 'No recipient email is registered.';
  if (email.length > 150 || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,63}$/i.test(email)
    || email.includes('..')) return 'A single valid recipient email is required.';
  if (!allowLegacy && legacyDeveloperAddresses.has(createHash('sha256').update(email).digest('hex'))) return 'Legacy developer address blocked in production. Update this account’s institutional email.';
  if (/\.(invalid|test|localhost|example)$/.test(email) || /@(?:[^@.]+\.)?(?:example\.com|example\.org|example\.net)$/.test(email)) return 'Test or reserved email address; delivery skipped.';
  return null;
}
export const escapeEmailHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
