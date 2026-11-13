Updated: 31 October 2026.

**Background-job update:** messages now persist encrypted payloads and are dispatched by a background worker, with configurable rolling limits, bounded retries and crash handling. Roster account creation has a separate recoverable job and does not wait for SMTP. See `docs/ROSTER_IMPORTS.md`. The descriptions below of recipient selection and testing-only addresses still apply; the earlier per-request SMTP claim implementation has been extended with this queue.

**The routing change is implemented. Development recipient records are preserved at the user’s request.** Real institutional addresses and the final development-data cleanup are deferred until the last launch stage. This document does not declare the system ready for public use.

| Event | Intended recipient |
| --- | --- |
| Student submits an issue | One confirmation to that student; one notice to the ticket’s assigned RO |
| RO schedules/reschedules a meeting | The student who owns that ticket |
| Admin schedules a hearing | The student who owns that ticket |
| RO/Admin resolves an issue | The student who owns that ticket |
| Student reopens an issue or submits feedback | The RO currently assigned to that ticket |
| RO escalates or updates an escalation | Registered Admin email addresses; separate messages, with duplicate addresses combined |
| Mentor schedule/report reminder | That mentor’s registered address |
| Account roster onboarding | Only the email supplied for that account |
| Admin custom email | A registered account; when linked to a ticket, only its student, assigned RO or a registered Admin |

The server resolves recipients from the database. Browser action handlers no longer send a second automatic email. Missing addresses do not fall back to another account or a developer inbox. All replies are directed to the configured support sender so the same mailbox can receive the conversation. Incoming reply processing is optional; it matches the complete UUID ticket ID and checks that the sender address belongs to the ticket’s student, assigned RO or an Admin. Message IDs prevent duplicate imports and unrelated inbox messages are not automatically marked read. Matching an address is not proof of sender authenticity: institutional inbound filtering/authentication still requires provider configuration and testing before relying on replies publicly.

**Development behavior:** current stored developer addresses continue to work when `NODE_ENV` is not `production`. The two known legacy developer inboxes are blocked in production. Reserved addresses such as `example.invalid` are never sent to. No existing account email values were changed by this work. The inspected development database had legacy developer addresses on 20 students, 10 mentors and 12 ROs; the existing Admin had no email. Re-run the audit for current counts rather than treating those numbers as permanent.

**Delivery status is explicit:** disabled delivery, invalid/missing addresses and unconfigured mail are logged as skipped; SMTP failures are logged as failed. “Accepted by mail server” confirms SMTP acceptance, not inbox delivery. The app does not report a disabled message as sent. Initial account credentials are omitted from newly written onboarding audit bodies, and login links do not carry passwords. Historical log content is not rewritten by this migration.

Every outgoing attempt first saves a unique notification claim in PostgreSQL. Reusing the same event key and recipient does not send again, including concurrent requests or a restarted service. Scheduled meeting notices use the scheduling event ID. This removes the duplicate browser/server send path and suppresses repeated claims; it is not an exactly-once inbox-delivery guarantee or a complete background queue. If the process stops between claiming a message and finishing SMTP, its state may remain pending. If final logging fails, delivery is marked unconfirmed locally. Check provider logs before retrying; automatic durable retries and monitoring remain release work.

**Configuration:** keep secrets in `server/.env` or hosting secret settings. `GMAIL_USER` and `GMAIL_APP_PASS` still work for development. An institutional SMTP server can instead use `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM`. The sender must be approved by the institution/provider. Set `APP_URL` to the real HTTPS portal URL in production. TLS certificates are verified for SMTP and IMAP; port 465 uses TLS immediately and other SMTP ports require STARTTLS. See the [official Nodemailer SMTP documentation](https://nodemailer.com/smtp).

`DISABLE_EMAIL=1` prevents outbound delivery and inbox polling. The currently running verification app uses this setting so tests cannot email people. To test actual delivery later, run with `DISABLE_EMAIL=0` and the intended development mail configuration. Inbox processing additionally requires `ENABLE_INBOUND_EMAIL_REPLIES=1`; configure `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER` and `IMAP_PASSWORD` for the monitored support mailbox. It stays off by default. Configure provider spam, SPF/DKIM/DMARC and mailbox access with college IT before public use. No real SMTP or IMAP connection was used by the automated routing tests.

**Before the final launch:** obtain the institutional addresses, carry out the deferred development-data cleanup with the user, import the real rosters, create the professors’ separate Admin accounts, and set the institutional sender and public portal URL. Run `npm run email:audit`; it prints only readiness counts, not addresses or credentials, and does not change records. Then perform a deliberate delivery test to approved test recipients. `node server/testEmail.js` alone sends nothing; the explicit `--send` option and `MAIL_TEST_TO` are required to send one diagnostic message, and the normal disabled-delivery setting still applies.

**Validation:** synthetic routing/security tests exercise ticket ownership, Admin recipient privacy, developer/production mode, disabled/failed delivery, duplicate suppression, protected mentor endpoints and inbound participant checks. Browser tests use the actual database provider with mocked APIs to verify that RO and Admin meeting actions call the action API once and do not issue a duplicate mail request. A separate PostgreSQL integration test uses temporary tables and rolls back; it checks migration compatibility, persisted statuses, duplicate claims, and atomic duplicate-safe reply logging. No test sends real email or updates existing account addresses.
