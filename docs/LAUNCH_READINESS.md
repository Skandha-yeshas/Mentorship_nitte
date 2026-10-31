Assessment date: **31 October 2026, Asia/Kolkata**.

**Update after the first hardening pass:** server-verified login, role and record permissions, hashed passwords, persistent sessions, roster-only student enrollment and private database permissions have now been implemented and applied locally. Anonymous dashboard access now returns HTTP 401; the latest JSON audit reflects that change. The findings below describe the original assessment. See `docs/HARDENING_PROGRESS.md` for completed work, validation, Admin login instructions and remaining release blockers. Unrestricted public launch remains blocked.

**Launch decision: postpone unrestricted public access.** The current code has verified authentication and data-access problems. A successful build and passing feature tests do not establish production security or capacity. The existing college server, domain, and institutional email may be usable, but IT has not confirmed their details. Begin with a small pilot after the security blockers are fixed.

This assessment involved source inspection, an anonymous GET to the local API, read-only queries of the configured PostgreSQL database's security metadata, existing regression tests, and official provider documentation. It did not modify application records, send email, invoke destructive endpoints, run exploit payloads, or conduct a production load test. Application code was not hardened as part of this assessment.

**What was verified.** The production build passed. The regression suite passed 133 tests; two opt-in live-database tests were skipped. Lint reported 335 warnings, including 319 unused-import/variable warnings, and zero errors. The installed spreadsheet parser is `xlsx@0.18.5`. An anonymous GET to `/api/db-state` returned HTTP 200 and password fields for all 43 accounts present during inspection. No password values are reproduced in this report. Live RLS metadata confirmed public `ALL` policies with `USING (true)` and `WITH CHECK (true)` on students, mentors, ROs, issues, meetings, and email logs. The anonymous database role has the corresponding table privileges. Recording and application-settings tables have RLS enabled without those public-all policies.

The metadata and anonymous-response summary are in `docs/launch-readiness-check.json`. To repeat the read-only checks locally, run `node scripts/audit-launch-readiness.mjs`. Never paste database credentials into chat or commit them to Git.

**The release blockers and the required work are:**

| Priority | Verified finding | Required before public use |
| --- | --- | --- |
| Critical | Most Express routes have no authentication or role middleware. Administrative deletion, email dispatch, meeting signaling, and `/api/reset` are among the exposed routes in source. | Authenticate every protected API, authorize each action and record on the server, remove the production reset/simulation endpoints, and test unauthorized access. Never infer authority from a client-supplied role or RO/student ID. |
| Critical | `/api/db-state` returns all user groups and password fields without login. Passwords are compared as stored strings; the current snapshot contained no recognized bcrypt/Argon2 password hashes. | Replace the global snapshot with role-scoped, paginated responses. Remove password fields from API responses and browser storage. Prefer managed authentication; migrate existing accounts through secure invitations/password resets. |
| Critical | Backend and browser login code include hardcoded administrative and shared-password bypasses. Some links include passwords in URL parameters. | Remove every bypass and password-bearing URL. Use verified sessions, server-owned role assignments, short-lived invitations, secure logout, and administrator MFA. |
| Critical | Live public RLS policies permit operations on sensitive tables. The browser also directly reads and writes multiple database tables. | Implement appropriate identity-bound policies or deny public table access and route operations through an authenticated backend. Migrate frontend flows together with the policies: switching off access alone will break current direct-database flows. A publishable Supabase key is expected to be public; permissive policies are the problem. |
| Critical | Tracked source includes fallback database and Gmail app-password credentials. | Revoke/rotate the affected credentials, remove embedded defaults, require server-side environment secrets, and scan repository history. Deleting a credential from the latest source does not revoke copies already obtained. |
| Critical | Grievance and meeting emails include hardcoded personal/developer destinations. | Send only to verified, intended institutional recipients. Remove test copies and choose one authoritative email dispatcher to prevent duplicate notices. |
| High | The installed `xlsx@0.18.5` falls in published affected ranges for prototype pollution and regular-expression denial of service. | Upgrade using the publisher's supported distribution or replace the parser; pin the dependency and test real workbooks. Add file-size, row-count, and content validation. This matters because roster import reads files. |
| High | The meeting configuration contains STUN servers and no TURN relay. | Add authenticated, short-lived TURN credentials and verify calls on different networks and behind the college firewall. Protect signaling with meeting membership and server-verified identity. |
| High | Recording chunks remain in RO browser memory until the call ends. The API buffers an entire upload up to 256 MiB and writes media bytes into PostgreSQL. | For public scale, use private object storage with resumable/chunked uploads and store recording metadata/access rights in PostgreSQL. Make interrupted uploads recoverable and define retention. |
| High | Every browser tab polls the complete application state every three seconds. The state handler contains 12 explicit database query calls plus its email-log lookup. | Fetch only the signed-in user's records. Paginate, index frequent filters, cache appropriate aggregates, stop overlapping/hidden-tab refreshes, and use events or slower targeted polling. |
| High | Signaling, recording sessions, and student-submission locks depend on process-local memory. | Use shared/persistent coordination before adding API replicas. Two instances currently can disagree about sessions, signals, and submission locks. Move inbox processing/email jobs to one controlled worker with deduplication. |
| High | Development and backend behavior differ. Vite supplies middleware/proxy behavior; Express currently does not serve the built frontend and has no readiness endpoint. | Choose a production serving strategy, move required APIs into Express, replace localhost links, add health/readiness checks, graceful shutdown, migrations, and tested deployment/rollback procedures. |

Other cleanup includes compiling Tailwind into local production CSS instead of relying on its browser CDN, splitting the large frontend bundle, restricting CORS, validating request bodies, rate limiting sensitive operations, restoring TLS certificate verification, and removing unused declarations. Unused imports are lower priority than the verified access-control failures.

Useful source locations: `server/server.js:33` (middleware), `server/server.js:167` (state API), `server/server.js:192` (password selection), `server/server.js:1151` (login), `server/server.js:1733` (process-local signaling), `server/server.js:2187` (reset), `server/gmailService.js:7` (embedded credential fallback), `server/db.js:12` (database credential fallback), `server/supabase_setup.sql:193` (public policies), `src/context/DatabaseContext.jsx:1318` (polling), `src/utils/webrtcService.js:160` (ICE configuration), `src/utils/compositeRecorder.js:200` (recording bitrate), `server/recordings.js:90` (buffered uploads), and `index.html:14` (runtime CSS CDN). Line numbers can change after edits.

**How 1,500 students affect load.** Total accounts and simultaneous activity are different measurements. With efficient access control and queries, 1,500 registered accounts is a reasonable application size. The current full-state polling and upload design have not been shown to support that load.

| Browser tabs actively polling | Current state requests per second, approximately |
| --- | ---: |
| 100 | 33 |
| 300 | 100 |
| 1,500 | 500 |

These are arithmetic estimates from the three-second interval, not benchmark results. They exclude signaling, quota refreshes, email, submissions, and uploads. Each state response grows with the database. At 1,500 active tabs, the handler alone can initiate roughly 6,000 explicit database query calls per second, before its additional email lookup. Current whole-table responses must be redesigned before treating server sizing as the solution.

**How meetings affect load.** Live meetings are currently one-to-one peer connections. The application server handles signaling and application actions; it does not normally transport both live camera streams. STUN helps discover a direct route. TURN relays media when the networks cannot connect directly. The relay's bandwidth and bill are separate from the API server's CPU/RAM. The RO's computer also does the canvas recording and audio mixing, so low-end devices need testing.

For illustration only, assume each participant sends 1 Mbps, every call is relayed, and ignore audio/protocol overhead:

| Simultaneous two-person calls | TURN outbound traffic | Outbound data per hour |
| --- | ---: | ---: |
| 5 | 10 Mbps | 4.5 GB |
| 10 | 20 Mbps | 9 GB |
| 25 | 50 Mbps | 22.5 GB |

Actual camera bitrate, relay use, audio, and network overhead will change these numbers. Higher video bitrates increase them proportionally. The table does not establish the application's supported meeting count.

**Recordings need a production storage decision.** The current recorder requests about 0.9 Mbps for video. Video alone is approximately 202.5 MB per 30 minutes or 405 MB per hour; audio and encoder behavior add variability. A one-hour call can exceed the current 256 MiB upload limit. Twenty simultaneous maximum-size requests represent up to 5 GiB of raw buffered bodies before database/driver copies and other application memory. Browser closure or a crash before final upload can lose the local recording.

The PostgreSQL binary recording feature is functional for small tested recordings. For the public system, the recommendation is to retain database records containing meeting ID, object path, owner, duration, size, timestamps, and access rights, while private object storage holds the video bytes. Upload during recording or use resumable uploads, verify completion/checksums, use short-lived playback authorization, and clean up incomplete objects. This change is proposed, not implemented. Access must remain restricted to authorized RO/Admin users.

As an example, 200 half-hour recordings at 200-250 MB each add approximately 40-50 GB per month. Three months of retention means approximately 120-150 GB before extra copies. The college should decide the required retention, deletion, access, recording notice/consent, and approved storage region. Database backups do not automatically back up object-storage video files.

**Recommended initial setup, subject to college IT confirmation.** Prefer college-managed infrastructure and an accountable IT owner. Avoid maintaining an unmanaged personal laptop or home connection as the public server.

| Component | Proposed pilot arrangement |
| --- | --- |
| Application hosting | College-managed Linux VM, approximately 2 vCPU and 4 GB RAM as an initial test allocation; HTTPS reverse proxy plus a supervised Node process. Database/storage services run separately. This is a starting point for measurement, not a capacity guarantee. |
| Authentication | Managed authentication or the college's approved identity service. Server verifies identity and role; browser role selectors do not grant access. |
| Database | Existing PostgreSQL/Supabase, with appropriate access controls, connection pooling, query indexes, backups, and resource monitoring. |
| Recordings | Private object storage and database metadata, with resumable uploads and separate media backup/retention. |
| Meetings | Existing one-to-one WebRTC with a managed TURN service and protected signaling. A group-call requirement would need a different media-capacity assessment. |
| Email | Institution-approved delivery service, queued with retries and deduplication. Remove personal test recipients and send invitations rather than reusable passwords. |
| Domain | College-controlled HTTPS domain; frontend and `/api` on the same origin simplifies the current cookie and relative-URL design. |
| Monitoring | Uptime, API errors/latency, server CPU/RAM, database connections/query time, email backlog, recording failures, and relay/storage costs; alerts go to a named operator. |

Do not use `npm run dev` or `vite preview` as the production web server. After the code is ready, build the frontend with `npm ci` and `npm run build`; serve `dist` using the chosen production web server. Run Express under supervision using its production start command, set `NODE_ENV=production`, and route `/api` to it. Currently this production routing/static serving still requires configuration or code changes. Keep host-provided port handling and replace every localhost link used in emails. Put secrets in server settings, not frontend variables. Never deploy the database-reset utilities as callable public routes.

If the college does not supply hosting, one possible paid cloud pilot is a Render 1 CPU/2 GB web service (listed at $25/month) and Supabase Pro (from $25/month). The approximate $50/month starting subtotal excludes workers/queues, relay/storage/egress overages, domain, email, taxes, and additional compute. It is not a complete quote or a performance guarantee. A larger Render 2 CPU/4 GB web instance is listed at $85/month if tests justify it. Cloudflare Realtime lists a shared TURN/SFU allowance of 1,000 GB/month and $0.05/GB beyond it. Confirm current pricing with IT before purchasing. Free sleeping application services are unsuitable for dependable scheduled meetings.

Personal Gmail can hit its sending limits during a 1,500-person onboarding batch. Institutional limits depend on the provider and account configuration. IT should confirm the approved sending method, authentication, daily/rate limits, SPF/DKIM/DMARC configuration, bounce handling, and who receives delivery alerts. Current synchronous, per-row email sends and small default JSON request limits also need attention before a large roster import: use validated batches/background jobs and report true per-row success/failure.

**Send these questions to college IT yourself before finalizing deployment:**

1. What server/VM, OS, CPU, RAM, disk, network capacity, and operational support are available? Who installs updates and restarts the application after a failure?
2. Who owns DNS and HTTPS certificates for the chosen public hostname? Can the frontend and `/api` share an origin? What reverse proxy and firewall rules are required?
3. Is PostgreSQL/Supabase already approved and funded? What are the connection limits, permitted hosting region, backup policy, and restore process?
4. Which institutional email platform and sending API/SMTP configuration are available, and what quotas apply?
5. Can the campus and mobile networks reach the chosen TURN provider using its required protocols/ports? Can IT assist with tests behind the real campus firewall?
6. Where will private recordings be stored, how long will they be retained, and who approves access and recording notices?
7. Who receives uptime/security alerts, owns the monthly budget, and can authorize rollback or a temporary meeting fallback?

**A phased release plan:**

Before deployment, remind the user to create and verify separate Admin accounts for approximately 10 professors (Principal, HODs and Dean) using `npm run admin:add` against the production database. All use the existing Admin dashboard and permissions. This is a pending user-requested launch reminder recorded in `docs/FOLLOW_UPS.md`.

1. Keep the current build private. Rotate exposed credentials and complete the critical authorization, password, and database-policy work together in staging. Obtain an experienced backend/security review.
2. Prepare a separate staging environment with synthetic student accounts, an isolated database/storage bucket, and a mail sandbox or disabled delivery. Keep destructive and email-producing load tests away from production.
3. Fix targeted data fetching, recording uploads, TURN configuration, production routes/static serving, and shared-state handling. Configure domain/HTTPS, migrations, backup jobs, readiness checks, and alerts.
4. Test permissions: Student A cannot fetch or modify Student B's issue; an RO can access only assigned records; anonymous users cannot retrieve private data, send mail, reset, delete, or join meetings; recordings remain private; signed access expires.
5. Test the complete workflow: roster imports, issue routing, two-slot/seven-day limits, one-count reassignments, scheduled/started/ended meeting states, RO minutes, resolution, feedback, and selected-ticket export. Test live calls over college Wi-Fi, home Wi-Fi, and mobile networks, including forced TURN in staging. Test denied camera permission, reconnection, interruptions, long recordings, and recovery after an interrupted upload.
6. Run staged load tests after optimization. An initial test target can be 100 simultaneous dashboard users and five simultaneous two-person calls, then 300 users and ten calls if demand requires it. If 1,500 students could open the site together, test that arrival pattern separately. Run full-length recording/upload tests and an extended soak test. Track p95 latency, error rates, memory growth, DB saturation, and video/audio quality. Example acceptance goals such as p95 API latency below one second and an error rate below 1% are proposed targets, not current measurements.
7. Restore both database and recording backups into a separate environment and verify playback and access rules. Agree with IT on acceptable data loss and recovery time. Check a rollback release before launch.
8. Invite approximately 25-50 students, two mentors, and two ROs from one branch after the critical checks pass. Start with two to five concurrent meetings and staffed support. Review failures and costs before adding branches in stages. Expand based on measurements; do not promise a trouble-free public launch in two days.

**Official references checked for this assessment:**

- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod) and [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security).
- [OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) and [Express production security](https://expressjs.com/en/advanced/best-practice-security/).
- [WebRTC TURN overview](https://webrtc.org/getting-started/turn-server) and [browser camera/microphone secure-context requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
- [Supabase resumable uploads](https://supabase.com/docs/guides/storage/uploads/resumable-uploads) and [database backup scope](https://supabase.com/docs/guides/platform/backups).
- [Render compute plans](https://render.com/docs/compute-plans), [pricing](https://render.com/pricing), and [free-service limitations](https://render.com/docs/free).
- [Supabase pricing](https://supabase.com/pricing) and [Cloudflare TURN pricing and billing](https://developers.cloudflare.com/realtime/turn/faq/).
- [Gmail sending limits](https://support.google.com/mail/answer/22839) and [Vite production deployment guidance](https://vite.dev/guide/static-deploy.html).
- [SheetJS prototype-pollution advisory](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6), [SheetJS ReDoS advisory](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9), and [publisher-supported installation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/).

The registry-based `npm audit --omit=dev` check reported zero findings in this run. That result does not negate the separately verified SheetJS advisories or the application-level access-control failures. The review is a point-in-time readiness assessment, not a penetration-test certificate or a measured service-level guarantee.
