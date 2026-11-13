# Review of the supplied Project Report on.docx

Reviewed: 3 November 2026. The supplied Word document was opened as a ZIP/XML package for read-only inspection. Its paragraphs, tables, embedded diagrams, references and document fields were inspected and compared with the current repository. The original file was not edited. Its SHA-256 hash was unchanged after inspection.

This is a correction checklist, not a rewritten report. Locations below use chapter/section names and searchable phrases, because Word page numbers were not established by rendering the document in Word. Institutional names, authorship, academic requirements and staff titles must be confirmed with the college. No application code, database records or email settings were changed for this review.

## Priority 1: correct these before submission

### 1. Front matter: authorship and academic details

- The cover, certificates and declaration identify one student, while the declaration signature identifies a different student. Use the actual author's approved name and matching USN throughout. Do not assume that either name in this template is correct for the intended submission.
- The certificate says final semester, other text says V/5th semester, and the acknowledgement says VI semester. Confirm the required semester and use it consistently.
- Separate the programme batch (2024–2027, if correct) from the academic submission year (2026–2027, if correct). The certificate currently calls the entire three-year batch an academic year.
- Verify the official university name, affiliation wording, college name, guide, HOD and Principal details using the college-approved report template. The university naming differs between sections.
- Correct the inconsistent spelling of the college address and inconsistent capitalization in department names and signature labels.
- Check the certificate/signature-block arrangement in Word. Some signature text is stored in alternate drawing/fallback representations, so XML repetition alone is not evidence that the signatures visibly duplicate.
- Use one project title throughout. Current variants include Smart Mentoring System, Smart Mentoring & Student Redressal System, and the NITTE Student Mentorship & RO Management Platform. A consistent subtitle can explain the combined mentoring/grievance purpose.
- Define RO consistently as **Relationship Officer**, matching the current application. Much of the prose instead says Resolution Officer, while the diagrams use Relationship Officer.

### 2. Chapter 6: replace the unrelated Coding content

The sections `5.2 user Dashboard` and `5.3 workspace page` contain another application's code:

- `gatherly_user`, `gatherly_active_workspace`;
- workspaces, tasks, expenses and workspace chat;
- `/api/spaces`, `/api/tasks/workspace`, `/api/expenses/workspace`;
- MongoDB-style `_id` fields and React Router navigation.

These are not the mentorship project's implemented dashboards/endpoints. Replace these sections with short, explained excerpts from the actual source. Appropriate examples are server authentication/ownership checks, transactional ticket submission, quota enforcement, meeting start/end and minutes, queued email, roster validation and scoped dashboard reads. Cite the exact source file and reviewed commit/date for each excerpt. Avoid publishing credentials, real personal records or long unexplained source listings.

The `5.1 main` excerpt is also outdated: it includes `TestApp` and a `?test=1` switch which are absent from the current `src/main.jsx`. Use the actual entry point. Number the subsections as 6.1, 6.2, etc., if Coding remains Chapter 6.

### 3. Chapter 12: rebuild the bibliography around the actual project

The following references are presented as technologies used by this application, but the current implementation does not support those descriptions: MongoDB, Mongoose, MongoDB Compass, Socket.IO, JWT, bcryptjs, Multer/shared galleries, React Router workspace routes, Axios, Framer Motion, React Quill/workspace notes, and Gemini-generated workspace itineraries.

Remove these implementation claims. A reference may remain only when genuinely discussed as related work, an alternative or future work, clearly labelled as such and actually consulted.

Use sources that match the implementation: React, Vite, Node.js, Express, PostgreSQL, node-postgres, Node crypto/scrypt, browser WebRTC/MediaRecorder/BroadcastChannel documentation, SheetJS, Nodemailer, the actual optional IMAP components, Playwright and Oxlint. Include libraries/tools only when actually used. Do not assert use of pgAdmin, Postman, Figma, a particular coding assistant or another tool merely because it appears in the template.

The document already contains hyperlinks; the main problem is their relevance and incomplete academic reference formatting. Add consistent author/organization, page title, URL, access date and in-text citations. Correct the development port from 5175 to the actual Vite configuration, 5173; the current API defaults to 5001. Do not describe every available tool as a project dependency.

## Priority 2: correct the implemented behaviour

These errors recur in the Executive Summary, Technologies Used, Website Modules, Proposed System, Requirement Analysis, comparison table, diagrams and Observations. Update every occurrence.

| Search for / present description | Required correction |
| --- | --- |
| Student Self-Registration | Student accounts are provisioned through authorized Admin roster import. Public student signup is disabled. |
| Active quota / block until cases close / fourth active issue | Two submissions per rolling seven-day period. Each submission occupies its slot for seven days even after resolution or feedback. The third submission is rejected while both slots remain occupied; it is not automatically escalated to Admin. |
| Predefined fixed issue categories | Categories come from imported RO assignments. Listed categories may be examples, not a permanently seeded catalogue. Each available category requires exactly one responsible RO. |
| Proceed with RO forwards the ticket for the first time | The backend assigns the ticket to the category's RO during submission. The guidance choice does not create a second ticket or initiate the first assignment. Student self-resolution is a subsequent ticket update. |
| Every issue automatically plays a verified video | RO-managed guidance is conditional. An RO can explicitly select No Video Available; no video should play for that category. Describe category matching accurately, rather than an unverified keyword/AI search engine or institutional verification process. |
| Join button appears immediately after scheduling | A scheduled meeting is not a live call. Only the owning student should receive the join prompt after the RO starts the corresponding online meeting. It disappears after the call ends. |
| Quota, rescheduling and minutes omitted | Document the two permitted meeting reassignments, one-count-per-operation rule, end-of-call lifecycle, RO minutes/feedback and resulting resolve/escalate actions. Scheduled/awaiting-feedback work is distinct from a live room. |
| Admin recording archive already available | RO recording playback exists with server authorization; student recording viewing is removed. The Admin viewer remains deferred. Distinguish backend authorization from an implemented Admin viewer UI. |
| Admin Audit & Ledger page | This top-level Admin section was removed. Per-issue action/procedure history, email history and backend system logging are separate features. |
| Immutable/tamper-proof audit trails | Current records are chronological database activity/history, not a proven immutable or tamper-evident ledger. Do not claim an append-only security guarantee that has not been implemented. |
| Demo Mode / localStorage offline persistence / dual-tier fallback / zero downtime | This design was removed from critical ticket/meeting persistence. Failed database writes return errors; confirmed reads/saves come from the server. Existing displayed state may remain during a transient read failure, but this is not durable offline saving or automatic replay. Private account/ticket caches are cleared or blocked. |
| Every operation is fully durable | Ticket/meeting transactions are hardened, but legacy Admin and mentor paths still need save-reliability cleanup; mentor schedule/waiver paths include client-only state. State these limitations. |
| Password encryption | Passwords use salted scrypt **hashing**, not reversible encryption. Encrypted queue/import payloads are a separate mechanism with a separate recovery key. |
| Immediate/synchronous email delivery | Notices are persisted to a background queue. Queued, provider-accepted, skipped, retrying, failed and uncertain are distinct states. SMTP acceptance does not guarantee inbox receipt. Inbound IMAP is optional and disabled unless explicitly enabled. |
| Hundreds/thousands imported in seconds | Describe validated persistent background jobs and progress reporting. Do not provide a throughput claim without a measured workload, host, dataset and timings. Account processing and email delivery complete separately. |
| Zero-latency/global BroadcastChannel sync | BroadcastChannel refreshes same-origin browser contexts locally; cross-device updates use server requests/polling. Student/RO state polling is five seconds and Admin/Mentor fifteen seconds, paused in hidden tabs. Do not describe this as instantaneous across all devices. |
| Guaranteed sub-100 ms video / 24x7 availability / seamless horizontal scaling | Replace with targets or measured results. TURN is not integrated; signaling is process-local; operational availability and capacity are unproven. Multiple API instances need shared coordination. |
| Every consultation automatically archived | The RO browser captures/composites the recording and performs a final upload. Upload failure or browser loss can prevent saving. Current bytes are stored in PostgreSQL with a 256 MiB upload cap; resumable object storage remains pending. |
| Zero third-party dependency | The app avoids a separate meeting application/SDK, but still uses external STUN, configured mail and hosted YouTube guidance, and needs a relay service for broader connectivity. |

Also update the technology list: Vite 8's installed build uses Rolldown, so the specific claim about Rollup production builds is outdated. A generic description of the Vite build process is sufficient. `pg` is the node-postgres client library; do not call it the official PostgreSQL project's client without supporting attribution. Dotenv loads configuration and is not itself a secret vault. The styling includes Tailwind utility classes/browser CDN as well as custom CSS; describing the whole UI as Vanilla CSS alone is incomplete.

## Priority 3: repair the testing chapter

Chapter 8 currently lists all twelve tests as Pass without dates, environment, evidence or measured results. Validate each claimed execution before retaining its Actual Output/Pass entry. A prospective or unexecuted test belongs in the plan with Not Run/Planned status.

| Test | What to change |
| --- | --- |
| TC-01 | Replace public student registration success with Admin roster enrollment. Add a separate negative test that public signup is rejected. |
| TC-03 | Test guidance when a video exists and the explicit No Video Available branch. |
| TC-04 | Test rejection of the third submission while two seven-day slots are occupied. Test that resolution/feedback do not release a slot early and that expiry restores availability. |
| TC-06 | Scheduling saves the meeting but does not expose a live Join Call prompt. Add start/end tests and a second unrelated student's account. |
| TC-08 | State the actual tested browser/network setup. A successful same-network STUN call is not evidence of reliable calls across all networks; TURN remains pending. |
| TC-09 | Verify finalized bytes, successful upload, reload/playback, authorization and upload failure/retry. Do not equate a local recorder stop with a durable recording save. |
| TC-10 | Keep the claim of 60 imported records only if it was actually tested and evidence is available. Record created/updated/failed counts, duplicate handling, invalid input, progress and password preservation. |
| TC-11 | Record truthful queue/SMTP status. Current development and automated checks have used disabled/fake SMTP; they do not establish real institutional inbox delivery. |
| TC-12 | Separate local BroadcastChannel refresh from remote-device polling. Record observed behaviour rather than instant/global consistency. |

Add tests for unauthorized/other-user access, forged role/ownership, CSRF rejection, password change/logout/session expiry, concurrent quota submissions, failed saves/transaction rollback, reschedule counting and limits, student-specific issue-slip export, student recording denial, and queued-mail recovery. Use synthetic identities and authorized test systems.

Add columns or accompanying evidence for version/commit, date, environment, preconditions, steps, expected behaviour, observed behaviour and result. The project's historical regression counts can be cited with their execution date and skipped-test count; they should not be presented as a newly performed field trial or a 100-student capacity result.

## Chapter 7: screenshots are missing

The Snapshots chapter contains only Landing Page, Login Portal and User Dashboard labels. There are no embedded application screenshots within that chapter. Existing embedded images are front-matter graphics and later diagrams.

Capture the actual current application using synthetic/test data: login; Student issue creation/quota/tracker/action log; conditional guidance/no-video; RO priority/New inbox and scheduler; RO-started student join alert; meeting end and minutes; authorized RO recording playback; mentor roster/session screens; Admin analytics/roster import progress; and Change Password.

Give each image a numbered caption explaining the behaviour. Hide real grievances, student details and all credentials. Do not use the private bootstrap file as a screenshot. Only include a landing-page screenshot if that page genuinely exists in the implemented flow.

## Chapter 9: diagrams need technical and print corrections

- Use a white/high-contrast background and legible labels at final A4 print size. The supplied diagrams are dark, dense raster images; the use-case image is particularly narrow.
- Use consistent chapter-based captions. Figures are labelled 4.1–4.5 while the diagram chapter is Chapter 9. Use 9.1 onward if this placement remains.
- Use case: replace generic self-register/login with role login and Admin roster provisioning; check all actor associations; include the actual student/RO/Admin recording permissions and current feedback/export workflows.
- Context DFD: keep the system boundary explicit and distinguish user data, signaling, external mail and media flows. Do not suggest that live peer media is always routed through the application server.
- Level 1 DFD: the diagram connects the Mentor directly to the D5 Mentorship Records store. Route external actors through an appropriate process. Do not imply that ICE/signaling messages are persisted in the meetings database: current signaling is in process memory. Include email/import processing if the diagram claims to cover the full system.
- ER diagram: populate Group Sessions, Resources and Mentor Session Records instead of `(no attributes)`. Add or separately diagram Admins, Auth Sessions, system logs and import/mail-job support tables. Update meeting lifecycle/minutes fields and actual key types/column names. For example, the diagram's email `dispatched_at` differs from the current `created_at`; feedback IDs are serial integers in the schema, not generic varchar IDs.
- Distinguish a conceptual category match from a physical foreign key: `issues.category` is not declared as an FK to `category_videos.category`. Use optionality/cardinality consistent with No Video Available and the current schema. Explain the historical meeting-recording ID relationship rather than drawing unimplemented constraints.
- Architecture: remove LocalStorage & In-Memory Fallback as a durable persistence tier. Show verified sessions, access middleware, scoped API reads, PostgreSQL transactions, persistent import/mail jobs and optional IMAP. Label private object storage and TURN as pending/proposed if shown.
- `WORKSPACE FLOW DIAGRAM` is only a heading and carries the wrong project's terminology. Replace it with the actual mentorship/grievance lifecycle diagram, or remove it if redundant.

## Structure, writing and formatting

- Populate and regenerate the contents with page numbers. No automatic TOC field was found. Use proper heading styles, automatic numbering, captions, a List of Figures and a List of Tables if required by the college.
- Align chapter labels and subsection numbers; current forms mix `CHAPTER 01`, `CHAPTER - 5`, `CHAPTER – 7`, and 5.x under Chapter 6. Resolve remaining tracked edits before the approved final export.
- The Executive Summary, Abstract, Introduction, Objectives and several module sections repeat the same broad description. Condense the abstract (roughly 200–300 words unless the faculty template specifies otherwise); use later chapters for concrete requirements, design decisions and evidence.
- Remove the stray line `Ran list frontend views and components`.
- Replace promotional phrases such as cockpits, zero administrative delay, zero dependency, seamless, dramatically, and guaranteed with precise descriptions and justified results.
- Move the `CORE WEBSITE FEATURES` description from the Existing System chapter to Proposed System. Existing System should describe the actual baseline and evidence for its limitations, rather than repeat the new app's capabilities.
- Merge `FUTURE ADDITIONS` from Chapter 4 with Chapter 11. Existing scheduling/analytics are not entirely future features; describe the specific unfinished improvement.
- Give Requirement Analysis and System Design clear subsections/chapters as the faculty format permits. Add a role-permission matrix, data dictionary, endpoint overview and current/proposed architecture distinction.
- Separate client-device requirements, developer-machine requirements and production-server requirements. The current i3/4 GB/20 GB/2 Mbps list does not establish server capacity or acceptable real-world video performance. List actually tested browser/OS versions and mark hosting sizes/performance thresholds as proposals until measured.
- Add an explicit limitations/deployment-readiness section and a Conclusion. Keep the proposed 100-student pilot separate from completed evaluation; do not claim it has already happened.
- Confirm font, line spacing, margins, page-border and front-matter pagination against the actual college template. The document uses A4 with one-inch margins, but this does not establish compliance with local submission rules.

## Observations and future work

Chapter 10 states that overhead is dramatically reduced, every consultation is archived, state is globally zero-latency, and student well-being significantly improves. No study data supporting these effects is provided in this report. Rewrite these as design aims or limited development observations unless an approved evaluation actually measured them. Do not claim competing meeting tools eliminate accountability or that the college's current process has specific failings without evidence.

Chapter 11 mixes optional long-term ideas with current release blockers. Put reliable Admin/mentor saves, verified database TLS, TURN, resumable private recordings, monitoring, backup/restore and production deployment first. Clearly identify optional AI, speech-to-text, anonymous channels, mobile apps and ERP/SSO integration as unimplemented proposals requiring separate design/approval. Reconsider phone-based SMS/WhatsApp and parent notifications against the present no-phone product scope and institutional consent rules. Avoid presenting hypothetical AI distress detection, anonymous reporting or accreditation compliance as an existing capability or guaranteed outcome.

## Suggested revision order

1. Confirm authorship, institution, semester and project name.
2. Replace the unrelated Coding content and bibliography.
3. Correct behaviour and label implemented, incomplete and proposed features.
4. Rewrite the test table with actual evidence; add missing screenshots.
5. Update the diagrams/data dictionary and remove unsupported observations.
6. Reduce repetition, add limitations/conclusion and repair citations/numbering/TOC.
7. Have the guide review the content, then check the final Word/PDF layout and signature pages.

The report can retain its overall mentoring/grievance topic and much of its introductory context. The coding, references, behaviour claims and test evidence require substantive revision before the report accurately represents this project.
