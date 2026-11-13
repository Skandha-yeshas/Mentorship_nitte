# Running Costs, Maintenance and Project Handover

Smart Mentorship & Student Support System

Prepared by: M YESHAS | Date: 5 November 2026 | Version: 1.0

**DRAFT FOR COLLEGE DISCUSSION — costs are estimates; approval and handover are pending.**

## 1. What the college needs to budget

The development fee is **INR 0**, as confirmed by the developer. Running the software still requires hosting, a database, email delivery, reliable video connectivity, recording storage, backups and someone responsible for maintenance. Who pays these bills is **to be agreed with the college**.

| Arrangement | Suggested monthly infrastructure budget | Annual equivalent |
| --- | --- | --- |
| Cloud application server, managed database and low-volume services | INR 6,000–8,000 | INR 72,000–96,000 |
| College provides a suitable application server, domain and approved email service; managed database remains external | INR 3,000–5,000 | INR 36,000–60,000 |
| Optional developer maintenance support, separate from infrastructure | Suggested INR 3,000 for up to 4 hours; subject to agreement | INR 36,000 if accepted for 12 months |

These are planning budgets for a controlled 100-student pilot under the usage assumptions on page 3. They exclude taxes, bank/foreign-exchange charges, new features and unusually high usage. They do not establish capacity for 100 simultaneous users or all 1,500 students.

**Practical proposal:** seek approval for an infrastructure allowance of INR 7,500/month for the cloud example, plus optional maintenance of INR 3,000/month. Combined planning allowance: **INR 10,500/month**, or INR 1,26,000/year before tax. If college hosting and email are suitable, the comparable allowances are INR 4,600 + INR 3,000 = **INR 7,600/month**. These are discussion figures, not accepted charges.

## What to confirm first

- Ask college IT whether it will supply a server, a subdomain, HTTPS, institutional mail, backups and an operating-system administrator.
- Confirm how many meetings will run at once, estimated monthly meeting hours, and how long recordings must be retained.
- Choose the billing owner, approve a monthly ceiling, and identify the person who will receive budget alerts and provider renewal notices.
- Agree whether the college maintains the application itself or purchases a limited maintenance service from the developer.

Existing launch requirements remain applicable: see COLLEGE_PILOT_REQUIREMENTS.pdf and HARDENING_PROGRESS.md. The project has open release work; this document does not approve public access or certify a completed handover.

<!-- page -->

# 2. Example Monthly Infrastructure Bill

Prices checked against provider pages on 5 November 2026. **INR 95 per USD is an assumed budgeting conversion**, not a guaranteed exchange rate. INR amounts are rounded; provider invoices, region availability and actual usage determine payment. No provider has been purchased or selected by this draft.

| Component | Example basis | Monthly allowance |
| --- | --- | --- |
| Application server | DigitalOcean Basic: 2 vCPU / 4 GiB, USD 24/month [1] | INR 2,280 |
| PostgreSQL database | Supabase Pro with one Micro project, USD 25/month including applicable compute credit [2] | INR 2,375 |
| Outgoing email | Amazon SES: 10,000 messages at USD 0.10 per 1,000; excludes data and optional features [3] | INR 95 |
| Video relay (TURN) | Allow 100 billable GB at USD 0.05/GB; conservatively ignore promotional/free allowances [4] | INR 475 |
| Private recordings — future storage option | R2 Standard: 100 GB average at USD 0.015/GB-month; excludes requests [5] | INR 143 |
| Independent backups | Planning allowance for an additional protected copy and requests; final destination to be quoted | INR 300 |
| Monitoring and logs | Planning allowance; may be lower with approved existing/free tools | INR 500 |
| Domain / HTTPS | Existing college subdomain and automated certificate, if provided | INR 0 incremental |
| **Illustrative subtotal** | Rounded line items above | **INR 6,168** |
| **Reserve and budget** | 20% reserve: about INR 7,402 total; round up for approval | **INR 7,500** |

If the college provides suitable hosting and approved email at no extra project charge, subtract INR 2,280 + INR 95: subtotal **INR 3,793**. With a 20% reserve, request about **INR 4,600/month**. College electricity, connectivity, staffing and hardware replacement still have a cost even when no external invoice is issued.

The example covers one production database and one application server. A second paid staging environment, stronger database compute, high availability, premium support, additional mail services or a new domain requires a separate allowance. A subdomain does not require purchasing another domain.

Managed database service does not host the Node application for this architecture. Supabase authentication user allowances also do not establish this application's capacity: the app uses its own login and PostgreSQL sessions. Do not count included Supabase object storage and an alternative R2 bucket twice for the same recording copy.

<!-- page -->

# 3. Why the Bill Can Change

## Meeting and recording assumptions

The example assumes **100 half-hour one-to-one meetings/month**, or 50 meeting hours. This is an illustrative workload, not a student entitlement or measured production forecast. No safe concurrency limit has been established yet.

- At an assumed 2 Mbps outbound stream to each of two participants, fully relayed calls transfer about 1.8 GB per meeting-hour. Fifty hours is about 90 GB; the cost example rounds this to 100 GB for overhead. Actual codecs, resolution and provider accounting change this figure.
- At an assumed 2 Mbps combined recording bitrate, one recording-hour is about 0.9 GB. Fifty hours generates about 45 GB/month. A proposed 60-day retention window approaches 90 GB before overhead; 100 GB is a rounded storage assumption. The college must approve retention.
- At ten times these meeting hours, relay traffic and new recording volume are roughly ten times higher under the same assumptions. Retained storage accumulates until deletion rules take effect.

The current application uses browser WebRTC and stores uploaded recording bytes in PostgreSQL. Cloudflare TURN application integration is implemented, but activation and real relay tests are deferred to final handover (11 November decision). R2 remains a proposed production service without an implemented integration. The cost example assumes private object storage is implemented before relying on this storage budget. Keeping large recordings in PostgreSQL can fill database disk and increase database, backup and transfer costs much sooner.

## Email is a separate service

College SMTP may have no extra project charge if IT approves automated sending and its quota is sufficient. Otherwise, the SES example is a low-volume sending estimate; production access, sender verification and delivery testing are required. SES sandbox limits do not permit unrestricted roster delivery [6]. Incoming replies, mailbox hosting, spam handling and optional email services are not included in the outgoing-message calculation.

An alternative Resend Pro plan lists USD 20/month for 50,000 emails [7], about INR 1,900 at the budgeting rate. It would replace the INR 95 SES line, adding approximately INR 1,805/month to the example. Resend Free lists a 100-message daily cap; do not assume it can send 1,000 welcome emails immediately. Any provider change needs configuration/integration and testing; none is made by this document.

## Budget controls

- Review actual CPU/memory, database size, query latency, relay GB, stored GB, emails and backup usage after the first two pilot weeks, then monthly.
- Request provider alerts at 70%, 90% and 100% of the approved allowance where supported. An alert is not a hard spending cap. Agree an overrun approval process before enabling metered services.
- Reprice after measured concurrency/load tests and before expanding toward 1,500 students. Add replicas only after shared signaling, limiting and coordination are ready.

<!-- page -->

# 4. Proposed Maintenance Arrangement

**The development fee remains INR 0.** A maintenance fee pays for continuing work after the agreed release is accepted. It is separate from provider bills. The following is a proposed offer for discussion, not a market-rate claim or an obligation accepted by either party.

| Item | Suggested term — subject to agreement |
| --- | --- |
| Maintenance fee | INR 3,000/month for up to 4 working hours; INR 36,000/year if agreed for 12 months |
| Extra work | Suggested INR 750/hour, only after scope, estimate and college approval |
| Support window | Days, hours, holiday coverage and contact channel: to be agreed |
| Response commitment | To be agreed; acknowledgement and resolution are different commitments |
| Unused hours / travel | Carry-forward, on-site visits and expenses: to be agreed |
| Billing and tax treatment | Billing cycle, payment due date and applicable tax/deductions: college accounts to confirm |
| Start, duration and exit | Start only on agreed acceptance date; notice and transition terms to be agreed |

## Work that can be included within the agreed hours

- Review application errors, failed background jobs, email failures, usage trends and backup status; report findings to college IT.
- Apply suitable dependency/security updates after staging checks and schedule deployments with a rollback plan.
- Investigate reproducible defects in accepted features and make small fixes within the agreed allowance.
- Assist college IT with access administration, recovery exercises and renewal planning; provide a short monthly work/usage report.

Four hours/month is limited support. Frequent incidents, substantial releases, operating-system administration or regular on-site support need more time or college IT coverage. Critical alerts outside the agreed support window require a separately staffed response arrangement.

## Work that needs a separate decision

New modules, workflow redesign, new integrations, large data migration, extensive content changes, major scaling work and 24-hour support need a separate estimate and approval. A defect means an accepted feature fails its agreed behaviour; a change request alters that behaviour. Classify the request against signed acceptance criteria before billing.

Open launch fixes listed on page 6 must be recorded in the completion plan before acceptance. They must not silently become chargeable maintenance. Agree any initial defect-correction period and its exclusions in writing. Grammar corrections supplied before the agreed release should be reviewed as part of finishing that release; no application wording is changed by this document.

<!-- page -->

# 5. What to Hand Over

Use a handover meeting and a written inventory. A source-code folder alone is insufficient to operate the service.

**11 November 2026 update - final handover to-do:** The user has deferred TURN setup. Keep `TURN_PROVIDER=stun` and `TURN_FORCE_RELAY=0` for now; some college/mobile networks may not connect. At final handover, agree a college-owned relay service or publicly reachable Coturn server and billing/support ownership, configure private credentials, verify forced-relay allocation and two-device calls on different networks, then record the results and restore normal direct-plus-relay operation. See `TURN_SETUP.md` and `FOLLOW_UPS.md`. This is an open acceptance item, not completed deployment work. Update the PDF/Word copies before final signing; this Markdown source contains the latest decision.

| Handover item | Evidence the college should receive |
| --- | --- |
| Source and release identity | Reviewed repository access, exact release commit/tag, dependency lockfile, build instructions and a list of known defects |
| Installation and operations | Architecture, schema/migrations, environment-variable template without secrets, installation/restart/deployment/rollback instructions and service locations |
| Accounts and ownership | Named owners for repository, server, domain/DNS, database, institutional mail, TURN and private media; billing/recovery contacts and appropriate provider MFA |
| Data and recovery | Approved data export, backup locations, restore instructions and a witnessed restore test; separate media recovery where applicable |
| User guidance | Student/Mentor/RO/Admin guide, roster template, quota/meeting/feedback explanations and an agreed training session |
| Acceptance and support | Test evidence, accepted defects/deferred work, contacts, approved support scope, start/end dates and agreed billing terms |

**Recommended ownership model:** college-controlled provider accounts and billing, with limited named access for the developer while support is agreed. Billing ownership remains undecided. College IT should hold recovery contacts and an independent administrative route so operation does not depend on one student's personal account.

Keep student data under college control. Source-code ownership, reuse rights, third-party licences and institutional academic/IP requirements must be agreed in writing; a zero development fee does not by itself define those terms. Record any restrictions on using real student information or recordings in demonstrations or research.

## Transfer access safely

- Deliver secrets through a private vault or another approved secure channel. Do not attach passwords, .env files, bootstrap credentials or private login spreadsheets to the report, repository or public handover pack.
- Transfer the existing queue encryption key securely with the database and recovery procedure. Replacing or losing it can make pending encrypted roster/mail payloads unreadable.
- Create approximately 10 individual professor Admin accounts for the Principal, HODs and Dean using the existing Admin dashboard/role. Run the documented admin:add command against the intended production database; each owner receives a private initial password and changes it after login. Provisioning is still pending.
- Rotate exposed/test credentials as part of the approved launch process. Remove unnecessary developer access when support ends, after verifying college access and recovery. Do not delete working data or disable services as an informal transfer step.

<!-- page -->

# 6. Conditions Before Pilot Acceptance

These items follow the current hardening records. They remain open until implementation and evidence are reviewed; this document does not complete them. Assign an owner and target date to each item before handover.

| Release gate | Required result |
| --- | --- |
| Remaining saves | Finish legacy Admin assignment/removal and Mentor resource/session/schedule/waiver paths; demonstrate persistence and clear failure messages |
| Database security | Enable verified database TLS; rotate previously exposed credentials and apply approved production access controls |
| Public operation | Configure HTTPS, production serving, process supervision, health checks, monitoring and restart/rollback procedures; address staff MFA and abuse controls |
| Calls | Configure authenticated TURN and test college Wi-Fi/mobile data; verify access is limited to the correct student and started meeting |
| Recordings | Validate capture/upload/playback and role permissions; implement private resumable object storage before relying on that scale/budget assumption |
| Recovery | Demonstrate database, media and queue-key recovery; agree retention and recovery objectives |
| Real accounts and mail | Confirm rosters, individual staff accounts, approved institutional sender and intentional delivery tests within provider limits |
| Capacity and pilot | Run representative load/call tests, record limits and obtain written approval for a staged 20 → 50 → 100 invited-student pilot |

Do not clear current development data now. At the approved final cleanup, first stop or cancel pending roster imports and queued emails so old jobs cannot recreate accounts or send stale notices. Confirm exports, retention decisions and the intended database before any deletion. Replace development recipient addresses only at that agreed final stage.

## Acceptance demonstrations

- Student access returns only that student's data; unauthorized roles cannot retrieve recordings or protected issue details. Students have no recording viewer; an Admin recording viewer remains deferred, while authorized RO playback exists.
- Only the student whose own meeting has actually started receives the join action. Test scheduling, ending, minutes/outcome, reassignment, feedback and refresh/restart persistence.
- The two-submission rolling seven-day quota remains enforced after feedback/resolution; show the next available slot correctly.
- Test roster imports, recipient routing, queue restart/retry behaviour, mail quota handling and separate professor logins using approved test accounts.
- Exercise backup restoration, deployment rollback and failure reporting on a safe environment; record response times, errors and call quality during the pilot.

Previous local tests are useful evidence, but they do not prove production capacity or uninterrupted operation. The launch-readiness and college-requirements documents remain the detailed release references.

<!-- page -->

# 7. Operating Responsibilities and Acceptance

| Responsibility | Proposed owner — confirm before launch |
| --- | --- |
| Service approval, data access/retention policy and budget | College project sponsor / authorised management |
| Server, OS, network, DNS/HTTPS, provider accounts and renewals | College IT or explicitly appointed hosting operator |
| Backup monitoring, restores and incident coordination | Named IT operator, with developer support only as contracted |
| Application fixes and staged releases | Developer / appointed maintainer within agreed scope |
| Verified rosters, meeting operations and user training | Named institutional Admin/RO coordinators |
| Provider invoice review and overrun approval | Named college finance/billing contact |

## Routine operations to agree

On each working day, check service alerts, failed jobs and backup results. Monthly, review access, capacity, bills and patch needs. Test restoration quarterly and after major infrastructure changes. Agree holiday and incident coverage.

Agree a recovery-point objective (how much recent data could be lost) and a recovery-time objective (how long restoration may take). Values are **to be agreed and tested**. Provider backup availability alone is not a verified recovery plan [8]. Maintenance labour is required even when hosting is free.

## Complete together at the handover meeting

| Decision / evidence | College response |
| --- | --- |
| Approved release commit/tag and acceptance date | To be completed |
| Infrastructure providers, plan, region and billing owner | To be agreed |
| Monthly budget ceiling and overrun approver | To be agreed |
| Maintenance fee, hours, support window and contacts | To be agreed |
| Backup retention, recording retention and recovery objectives | To be agreed |
| Ownership/licence terms, known defects and completion plan | To be agreed |
| Training completed; college access and restore verified | Evidence/reference to be completed |
| Pilot cohort/concurrency limits and review date | To be approved after testing |

College representative: ____________________  Role: ____________________

Developer / maintainer: ____________________  Date: ____________________

Record only accepted work, with outstanding items attached. This unsigned draft does not authorise launch, incur charges or transfer ownership. Agree exports, transition support and access/data handling before support ends.

<!-- page -->

# 8. Price Sources and Document Notes

Official provider pages checked on 5 November 2026. Recheck prices, regional availability, quotas, taxes and billing terms before approving purchases. Free allowances have not been relied on to reduce the main paid-services example.

| Ref. | Source and use in this estimate |
| --- | --- |
| [1] | DigitalOcean Droplet pricing — Basic server example: https://www.digitalocean.com/pricing/droplets |
| [2] | Supabase pricing — Pro subscription, compute credit and plan inclusions: https://supabase.com/pricing |
| [3] | Amazon SES pricing — base outgoing-message rate: https://aws.amazon.com/ses/pricing/ |
| [4] | Cloudflare TURN — outbound relay pricing; actual traffic accounting applies: https://developers.cloudflare.com/realtime/turn/ |
| [5] | Cloudflare R2 pricing — Standard storage, request fees and egress terms: https://developers.cloudflare.com/r2/pricing/ |
| [6] | Amazon SES production access — sandbox restrictions and access request: https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html |
| [7] | Resend transactional email pricing — alternative paid plan and daily free-tier limit: https://resend.com/pricing?product=transactional |
| [8] | Supabase backups — recovery coverage and backup limitations: https://supabase.com/docs/guides/platform/backups |

## How the estimates were prepared

Provider rates are separate from the author's planning assumptions. INR 95/USD, 100 GB of relayed traffic, 100 GB of average retained recordings, backup/monitoring allowances, the 20% reserve and suggested maintenance fee are estimates or proposals, not provider quotations. The detailed bill is illustrative rather than a precise prediction of pilot usage.

The cloud illustration is INR 6,168/month before reserve and maintenance. Its annual base equivalent is INR 74,016. The rounded infrastructure budget is INR 90,000/year. Adding the optional INR 36,000/year maintenance proposal gives INR 1,26,000/year, before tax. These annual amounts simply multiply monthly allowances by 12; they are not provider annual-plan quotes.

## Existing project documents to retain

- COLLEGE_PILOT_REQUIREMENTS.pdf — formal college provisions and pilot conditions.
- HARDENING_PROGRESS.md and LAUNCH_READINESS.md — completed safeguards and remaining launch work.
- DATABASE_RELIABILITY.md — save reliability and remaining data paths.
- EMAIL_ROUTING.md and ROSTER_IMPORTS.md — mail, bulk-import and queue operation.
- FOLLOW_UPS.md — deferred professor account setup and Admin recording-viewer reminder.

This document adds commercial and operating discussions to those requirements; it does not replace them. Only documentation is created for this request. No application code, user records, provider subscriptions, email delivery or public deployment is changed.
