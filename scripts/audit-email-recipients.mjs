// Read-only launch check. Prints aggregate counts, never addresses or credentials.
import { getPool, shutdown } from '../server/db.js';
import { normalizeEmail, recipientProblem } from '../server/emailAddress.js';

try {
  const accounts = {};
  for (const table of ['students', 'mentors', 'ros', 'admins']) {
    const rows = (await getPool().query(`SELECT email FROM ${table}`)).rows;
    const addresses = new Map();
    for (const row of rows) {
      const email = normalizeEmail(row.email);
      if (email) addresses.set(email, (addresses.get(email) || 0) + 1);
    }
    accounts[table] = { accounts: rows.length, missing: rows.filter(row => !normalizeEmail(row.email)).length,
      notReadyForProduction: rows.filter(row => recipientProblem(row.email)).length,
      sharedAddressGroups: [...addresses.values()].filter(count => count > 1).length };
  }
  const sender = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.GMAIL_USER;
  console.log(JSON.stringify({ purpose: 'Production recipient readiness; current development addresses are not changed.', accounts,
    senderConfigured: Boolean(sender), senderReadyForProduction: !recipientProblem(sender),
    ready: Object.values(accounts).every(role => role.notReadyForProduction === 0 && role.sharedAddressGroups === 0) && !recipientProblem(sender) }, null, 2));
} catch {
  console.error('Could not audit recipient records. Check the private database configuration. No email was sent and no records were changed.');
  process.exitCode = 1;
} finally { await shutdown(); }
