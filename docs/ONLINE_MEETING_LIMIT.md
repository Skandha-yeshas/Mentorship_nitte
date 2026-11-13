# Online meeting time limit

Implemented 6 November 2026: an online session has a 30-minute limit measured from the RO's saved `started_at` value. Scheduling time, student join time and recording start time do not start separate clocks. Offline meetings are unaffected.

- Both call screens show time remaining, with an amber warning during the last five minutes.
- At expiry, supported clients close the call and stop their camera/microphone. The RO follows the existing recording-finalisation/upload flow and can enter minutes/feedback.
- A persistent background check completes expired online meetings, records the exact start-plus-30-minute end time and appends one end event to the issue history. It uses the same issue-before-meeting transaction lock order as ticket actions. Failed history/audit writes roll back for retry.
- Signaling requests independently check database time and reject expired/inactive rooms; they do not wait for the background sweep. Browser signaling polls also receive a server-based deadline and schedule a local monotonic timer so a later network interruption cannot reset the countdown.
- Refreshes, duplicate start requests and late joins do not extend the clock. Rescheduling deliberately creates a fresh session. RO minutes/feedback are still required; expiry does not resolve an issue, submit feedback, unlock a grievance slot or increment reassignment count.

The background sweep normally checks idle work about every two seconds; database outages may delay persistence until recovery. Browser suspension may delay visible cleanup until execution resumes. WebRTC media is peer-to-peer: server signaling checks do not give the server direct control over media exchanged by modified clients. This is the supported application's session policy, not an SFU-based network cutoff.

Legacy `Started` records without a start timestamp have no recoverable start time; they are not admitted by server signaling and should be rescheduled. No historic timestamp was guessed or backfilled. No real meetings or accounts were created by the tests.

Verification: shared duration/student/RO lifecycle regression checks; isolated PostgreSQL expiry, concurrent-worker, rollback/retry, reschedule and feedback checks; browser countdown/RO recording-finalisation/student media-cleanup checks; production build. Email remains disabled during local verification.
