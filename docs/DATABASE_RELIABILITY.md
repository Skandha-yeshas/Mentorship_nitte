# Ticket saves and dashboard reads

Implemented locally: 1 November 2026.

## Changes

Ticket submission, meeting scheduling/rescheduling, start/end/cancel, RO minutes and outcome, resolution, reopening, escalation, student feedback and RO transfer now use transactional action endpoints. Business changes, ticket history, system audit and notification queue records commit together. SMTP runs later through the existing worker. Disabled/unconfigured delivery has a saved skipped status; a database/outbox failure rolls the action back.

Failed reschedules retain the original meeting. Failed minutes/outcome saves cannot partially resolve/escalate a ticket. Meeting lifecycle timestamps, RO feedback time, summary, actions, outcome and the Admin-hearing flag have database columns. Admin hearings use the issue's valid RO foreign key instead of trying to insert a nonexistent `ADMIN` RO.

Scheduling locks the issue row. The server enforces two meeting reassignments, counts a repeated schedule operation ID once, and enforces one administrative hearing. Student submission holds a PostgreSQL transaction advisory lock while checking/consuming the two-slot rolling seven-day quota. The advisory lock serializes submissions across processes; the seven-day policy is calculated from saved timestamps. Feedback/resolution never frees a slot early. Ticket actions lock the issue before changing history and recheck ownership inside that transaction.

The affected client actions wait for a confirmed save, propagate errors and then refresh/broadcast. Duplicate ticket/meeting table-sync writes are removed. Minutes and the selected outcome use one request. RO/student buttons wait before showing success or closing the form. A lost response means the save could not be confirmed: refresh before retrying; arbitrary actions are not automatically replayed.

The API no longer returns temporary-memory/demo dashboards or uses anonymous Supabase REST for ticket/meeting persistence. Database initialization fails if schema setup fails. The generic query helper no longer automatically replays a potentially committed write after a connection error.

`/api/db-state` uses one SQL statement with per-role predicates and explicit safe columns. This produces one consistent snapshot, in addition to authentication queries. Passwords, queued credentials, email bodies and recording bytes are excluded. Email history is limited **after** applying account scope. Recording metadata comes with the snapshot instead of an additional request per poll. Indexes match ownership/lookups. Student/RO refresh every five seconds; Admin/Mentor every fifteen seconds; hidden tabs pause. Successful actions and focus/visibility changes refresh immediately. Read failures retain the last confirmed data and show a retry message.

Ticket timestamps stored as UTC without a timezone are explicitly interpreted as UTC in dashboard/quota queries, so browser/Node local timezones do not alter the seven-day cutoff. No stored timestamps were rewritten.

## Verification

Run the regression suite with `node --test`. The optional database test is:

```powershell
$env:RELIABILITY_DATABASE_TEST = '1'
node --test server/reliability.database.test.js
```

It creates an isolated uniquely named schema with test-only accounts and disabled email, then drops that schema. It tests failed meeting/audit/outbox writes and rollback, concurrent three-way quota enforcement, concurrent meeting-history preservation, reschedule deduplication/limits, persisted minutes, Admin hearings and scoped snapshots for all roles. It does not change existing application records.

Browser tests inject API failures and verify unchanged confirmed ticket state, propagated errors, one minutes/outcome request, no recording-list polling and hidden-tab polling suppression. Before/after private digests verified that existing account names/emails/passwords and saved history were unchanged by the migration. Authenticated dashboard HTTP 200 and anonymous HTTP 401 were verified locally.

## Remaining work

This is the ticket/meeting persistence pass. Legacy Admin assignment/removal and mentor resource/session/scheduling paths still need authoritative-save cleanup; mentor schedule/waiver state has client-only paths. Admin analytics and roster-job polling remain separate. Large Admin rosters/history need pagination or incremental refresh. These tests do not establish capacity for 1,500 active users.

Signaling is still in process memory. TURN application integration was added on 10 November; provider account activation and live-network verification remain pending (`TURN_SETUP.md`). Shared signaling for multiple instances, resumable private recording storage, database TLS verification, backups/restore, monitoring and production hosting remain launch work. Current developer addresses remain unchanged until the final institutional-data cleanup requested by the user. Email was disabled throughout this migration/verification.
