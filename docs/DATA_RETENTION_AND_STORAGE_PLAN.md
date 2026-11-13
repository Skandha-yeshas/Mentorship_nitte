# Data retention and storage planning

Prepared 7 November 2026. Estimates for 1,500 enrolled students and approximately 100 RO/Mentor accounts in total. If the intended staff count is 100 ROs plus 100 Mentors, account storage is still a small part of this estimate. This is a planning document, not a capacity benchmark or an implemented deletion job.

## Confirmed retention requirement

The user confirmed on 7 November 2026:

- Keep tickets, minutes, feedback and issue-related history for three years after the ticket is resolved or closed.
- Keep meeting videos for a shorter period. The exact video retention period is still undecided.

Do not automatically delete an unresolved case just because its submission date is three years old. Before implementation, define how reopening a case affects retention, which final closure timestamp controls expiry, and any institution-approved exception. A proposed approach is to calculate three calendar years from the final resolution/closure; reopening suspends deletion until the case closes again. This reopening behaviour has not been approved yet.

## Current aggregate measurement

Read-only measurement on 7 November 2026:

| Measurement | Value |
| --- | --- |
| Whole PostgreSQL database | 13,162,163 bytes, approximately 13.2 MB |
| Public application tables including their indexes/TOAST | 1,253,376 bytes, approximately 1.25 MB |
| Current accounts | 21 students, 12 ROs and 10 Mentors |
| Current tickets / meetings | 2 / 1 |
| Current email log entries | 33 |
| Stored recordings | 0 |

Database size includes PostgreSQL/system overhead. Average current ticket row size is about 1.1 KB, but two development records do not represent a completed production lifecycle. This small sample must not be multiplied directly to promise production storage needs. No account details or message contents were exported. No records were changed by the measurement.

## Ticket-storage estimates

Use an illustrative budget of **100 KB per completed ticket** for its issue text, lifecycle history, associated meeting minutes, feedback and notification records, excluding video and attachments. This is an assumption, not a measured production average. Add indexes, other tables, operating headroom and growth separately. All KB/MB/GB estimates here use decimal units.

| Usage assumption | Tickets over 3 years | Ticket-related data at 100 KB each | Indicative primary database/archive capacity with headroom |
| --- | --- | --- | --- |
| 2 tickets per student per year | 9,000 | 0.9 GB | 2–4 GB |
| 6 tickets per student per year | 27,000 | 2.7 GB | 6–10 GB |
| 1 ticket per student per month | 54,000 | 5.4 GB | 10–20 GB |
| Every student uses both slots every week | About 468,000 | About 46.8 GB | About 90–150 GB |

The last row uses 52 weeks/year as an approximation to the rolling two-submission/seven-day rule. Actual calendar boundaries differ slightly. It is a high-use illustration, not a demand forecast or guaranteed maximum record size. Attachments, unusually long activity histories, frequent reassignments, many notifications and cases left open longer than three years can increase storage. Current student population is assumed constant over the three years; account churn and outstanding older cases should also be measured.

At the moderate monthly-ticket assumption, **20 GB across primary ticket/database/archive storage is a sensible growth target**, with backups budgeted separately. This is not a requirement to buy 20 GB before the small pilot. For this volume, retaining indexed ticket records in one PostgreSQL database may be simpler than introducing a second database; measure cost and query performance before adding an archive service.

Profiles for roughly 1,600 people contain small text records compared with tickets and videos. Full photos, uploads and ongoing Mentor report/resource histories are separate usage drivers. Session rows, completed-job payloads and temporary onboarding credentials need their own shorter cleanup policies; three-year ticket retention is not a reason to keep sensitive temporary credentials for three years.

## Video-storage estimates

The current browser recorder requests a 900 kbps video bitrate at 960 × 540, plus audio. The video component alone is about 202.5 MB for 30 minutes. Browser output, audio and container overhead vary; **250 MB per half-hour recording** is an illustrative planning allowance, not a hard upper bound. The current upload limit is 256 MiB, so actual full-length recordings must be measured before the pilot; a bitrate target does not enforce the upload limit.

| Half-hour recordings per month | New recordings each month at 250 MB each | Steady retained amount at 60 days | Steady retained amount at 90 days |
| --- | --- | --- | --- |
| 100 | 25 GB | About 50 GB | About 75 GB |
| 300 | 75 GB | About 150 GB | About 225 GB |
| 1,000 | 250 GB | About 500 GB | About 750 GB |

These steady-state figures approximate months as 30 days and assume every recording is retained for the full period, then successfully deleted. They exclude backup copies, object versions, failed/partial uploads, longer or repeated sessions, retrieval traffic and any case-specific retention exception. Sixty and ninety days are comparison examples; neither is an accepted video policy.

For example, 100 recordings/month with an approved 90-day retention would justify an initial growth allowance around **100 GB of private media storage**, separate from the 10–20 GB ticket estimate and separate from backups. No video storage has been provisioned by this document.

Recordings currently save as bytes inside PostgreSQL. Move video uploads/playback to private object storage with appropriate access checks and reliable uploads before relying on a separate media-storage estimate. PostgreSQL should retain the recording ID, issue/meeting association, storage reference, size, timestamps, retention date and permitted access. The proposed media integration is not implemented yet.

## What an archive means

Cold data is data kept for infrequent retrieval. It does not require another permanently running PostgreSQL server. Options include keeping closed cases in indexed PostgreSQL tables, or exporting complete case bundles to encrypted private object storage with a small searchable index.

If case bundles are archived, include the ticket, complete lifecycle/procedure log, relevant meeting minutes/outcomes, feedback and issue-related email/delivery records. Preserve account relationships needed to interpret the case without copying password hashes, login sessions or unrelated private data into the archive. Keep access restricted to authorised roles. Verify archive completeness, integrity, recoverability and authorised retrieval before removing any source copy. An archive is not a substitute for an independent backup.

## Expiry and permanent deletion

Implement retention in a separate, reviewed release after the policy details are approved. The current application does not yet enforce this three-year archival/deletion lifecycle.

1. Calculate an explicit case retention date from the agreed resolution/closure timestamp.
2. Keep active cases available; archive closed cases according to an agreed operational schedule.
3. Identify expired cases, recheck status and exceptions transactionally, and remove related live/archive data and any retained media within scope. Avoid orphaning references or deleting a case that has reopened.
4. Include generated exports, object versions, replicas and developer-held copies in the deletion procedure. Messages already delivered to recipients' mailboxes are not removed by deleting an application record.
5. Expired personal data may remain inside earlier backups until those backups expire under their own documented rotation. Set that maximum window explicitly; instant deletion from every historical backup must not be promised.
6. After restoring an older backup, reapply the current retention/deletion ledger before reopening access so previously expired records are not resurrected. Retain only minimal, approved non-content purge evidence.

Private media objects require their own backup/recovery process. Supabase states that PostgreSQL backups do not include files stored through its Storage API.

## Sizing checkpoints and sources

Measure database growth per completed ticket, notification volume, archive size, actual full-length recording sizes, monthly call count and deletion success during the pilot. Review after two weeks, then monthly. Storage capacity and concurrent-user capacity are different: storage estimates do not certify support for 1,500 simultaneous users or concurrent calls.

- Supabase plan inclusions, checked 7 November 2026: https://supabase.com/pricing — Free lists a 500 MB database; Pro starts with 8 GB database disk, with further usage billed separately. Account-count allowances do not determine the capacity of this custom-auth application. File-storage quota is separate from database disk; recordings saved as PostgreSQL bytes currently consume database space.
- Private object storage reference: https://developers.cloudflare.com/r2/pricing/ — storage classes and retrieval/request charges differ. Compare actual access patterns before choosing an infrequent-access tier; no cost saving or compression ratio is assumed above.
- Database backup coverage: https://supabase.com/docs/guides/platform/backups — database backup retention and separate object recovery must be planned.
- Local implementation references: `shared/grievanceQuota.js`, `src/utils/compositeRecorder.js`, `shared/meetingRecordings.js`, `server/recordings.js` and `server/db.js`.
