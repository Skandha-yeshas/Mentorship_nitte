# 🔄 System Execution Flow & Call Hierarchy (flow.md)

This document maps the end-to-end execution flow of the **NITTE Mentorship & Grievance Redressal System**. It specifies the exact entry points, functions called, API endpoints hit, data mutations, signaling mechanisms, and termination end points across the key modules.

---

## 📑 Table of Contents
1. [Application Startup & State Synchronization Flow](#1-application-startup--state-synchronization-flow)
2. [Student Issue Submission & Guidance Video Flow](#2-student-issue-submission--guidance-video-flow)
3. [RO Guidance Video Management & Real-Time Sync Flow](#3-ro-guidance-video-management--real-time-sync-flow)
4. [Online Video Meeting Scheduling, Joining & WebRTC Handshake Flow](#4-online-video-meeting-scheduling-joining--webrtc-handshake-flow)
5. [Host-Driven Meeting Termination & Session Auto-Recording Flow](#5-host-driven-meeting-termination--session-auto-recording-flow)
6. [Ticket Lifecycle State Transition Flow](#6-ticket-lifecycle-state-transition-flow)

---

## 1. Application Startup & State Synchronization Flow

```mermaid
sequenceDiagram
    autonumber
    participant Browser as Client Browser
    participant Main as src/main.jsx
    participant App as src/App.jsx
    participant Ctx as DatabaseContext.jsx
    participant Server as server/server.js
    participant DB as PostgreSQL Database

    Browser->>Main: Loads index.html
    Main->>App: Mounts React DOM
    App->>Ctx: Wraps App with <DatabaseProvider>
    Ctx->>Ctx: Initializes state (MOCK_DB / LocalStorage)
    Ctx->>Ctx: useEffect() mounts fetchDbState() & BroadcastChannels
    Ctx->>Server: HTTP GET /api/db-state
    Server->>DB: Executes multi-table queries (students, ros, issues, meetings, category_videos)
    DB-->>Server: Returns rows
    Server-->>Ctx: 200 OK with full JSON application state
    Ctx->>Ctx: setDb(mergedData) & sets isPgConnected = true
    Ctx->>Browser: Renders Header, Navigation, and Role Dashboard (Student / RO / Mentor / Admin)
```

### Detailed Function Call Trace:
1. **Entry Point**: `src/main.jsx` invokes `ReactDOM.createRoot().render(<App />)`.
2. **Context Setup**: `src/App.jsx` mounts `<DatabaseProvider>` from `src/context/DatabaseContext.jsx`.
3. **Database Bootstrap (Server)**:
   - `server/server.js` boots via `node server/server.js`.
   - Calls `initDb()` in `server/db.js`.
   - Runs `createTables()`: creates `students`, `mentors`, `ros`, `issues`, `meetings`, `category_videos`, etc.
   - Runs `seedTables()`: populates initial records if tables are empty.
4. **Client State Polling**:
   - `DatabaseContext.jsx` runs `fetchDbState()` on mount and sets up a `setInterval(fetchDbState, 3000)` polling cycle.
   - Also binds listeners for:
     - `new BroadcastChannel('nitte_meeting_sync')`
     - `new BroadcastChannel('nitte_video_sync')`
5. **End Point**: React state `db` is fully hydrated; role view is rendered based on `currentUser` (`StudentDashboard`, `RODashboard`, `MentorDashboard`, or `AdminDashboard`).

---

## 2. Student Issue Submission & Guidance Video Flow

```mermaid
sequenceDiagram
    autonumber
    participant Student as Student UI (StudentDashboard.jsx)
    participant Ctx as DatabaseContext.jsx
    participant Server as server/server.js
    participant DB as PostgreSQL Database

    Student->>Student: Selects Category, enters Description, clicks "Submit Ticket"
    Student->>Student: handleSubmitIssue(e)
    Student->>Ctx: submitIssue(studentId, category, description, priority)
    Ctx->>Server: POST /api/issues { studentId, category, description, priority }
    Server->>DB: INSERT INTO issues (...) RETURNING id
    DB-->>Server: Issue record created
    Server-->>Ctx: 201 Created { id: 'TICK-XXXX', ... }
    Ctx->>Ctx: setDb(prev => ({ ...prev, issues: [newIssue, ...prev.issues] }))
    Student->>Student: setSubmissionVideoModal({ issueId, category, roName })
    Student->>Student: getCategoryVideo(category)
    Note over Student: Multi-tier category matching finds matching YouTube URL
    Student->>Student: getYoutubeEmbedUrl(rawUrl)
    Student->>Student: Renders 16:9 solution video & FAQ checklist
    alt Student clicks "✅ Video Solved My Issue - Close Ticket"
        Student->>Student: handleSelfResolveIssue()
        Student->>Ctx: resolveIssue(issueId, 'Student (Self-Resolved)', notes)
        Ctx->>Server: PUT /api/issues/:id/resolve
        Server->>DB: UPDATE issues SET status = 'Resolved'
        Student->>Student: Closes modal, marks ticket closed
    else Student clicks "🚀 Need More Help - Proceed with RO"
        Student->>Student: handleProceedToRO()
        Student->>Student: Closes modal, keeps ticket "Assigned to RO"
    end
```

### Detailed Function Call Trace:
1. **Entry Point**: Student clicks the "Submit Issue" button on the *Raise Issue* tab in `src/views/StudentDashboard.jsx`.
2. **Form Handler**:
   - Executes `handleSubmitIssue(e)`.
   - Validates description and weekly slot limits (`isFormLocked`).
3. **Context Dispatch**:
   - Calls `submitIssue(student.id, category, description, priority)`.
   - Sends `POST /api/issues` with payload.
   - Updates local `db.issues` state optimistically.
4. **Instant Video Modal Launch**:
   - Sets state `setSubmissionVideoModal({ issueId: newIssueId, category: submittedCategory, roName })`.
5. **Video Resolution Algorithm (`getCategoryVideo(cat)`)**:
   - Reads memory state and `localStorage.getItem('nitte_saved_category_videos')`.
   - **Tier 1**: Exact match on subcategory (`cat.toLowerCase() === v.category.toLowerCase()`).
   - **Tier 2**: Prefix match before `' - '` (e.g. `'Academic'` matches `'Academic'`).
   - **Tier 3**: Support Desk synonym match (e.g. `'Academic Support Desk'` matches `'Academic'`).
   - **Tier 4**: Substring containment match.
   - **Fallback**: Default system guide.
6. **YouTube URL Conversion (`getYoutubeEmbedUrl(url)`)**:
   - Parses watch URLs (`watch?v=...`), shortlinks (`youtu.be/...`), and shorts (`shorts/...`).
   - Extracts the 11-character video ID.
   - Outputs: `https://www.youtube-nocookie.com/embed/{id}?autoplay=1&rel=0`.
7. **End Point Actions**:
   - `handleSelfResolveIssue()` ➔ calls `resolveIssue()` ➔ marks ticket `Resolved` ➔ closes modal.
   - `handleProceedToRO()` ➔ ticket remains `Assigned to RO` ➔ navigates to `My Issues` view.

---

## 3. RO Guidance Video Management & Real-Time Sync Flow

```mermaid
sequenceDiagram
    autonumber
    participant RO as RO UI (RODashboard.jsx)
    participant Ctx as DatabaseContext.jsx
    participant BC as BroadcastChannel ('nitte_video_sync')
    participant Student as Open Student Tabs
    participant Server as server/server.js
    participant DB as PostgreSQL Database

    RO->>RO: Clicks "🎥 Edit Solution Video for this Issue" on assigned ticket
    RO->>RO: openVideoManagerForCategory(selectedIssue.category, selectedIssue.id)
    RO->>RO: Validates category is in myAssignedIssueCategories & locks modal to ticket
    RO->>RO: loadCategoryVideoData(cat)
    RO->>RO: Modifies Title, YouTube Link, and FAQ checklist
    RO->>RO: Clicks "💾 Save & Publish Guidance Video"
    RO->>RO: handleSaveCategoryVideo(e) verifies RO authorization
    RO->>Ctx: updateCategoryVideo(category, videoUrl, title, description, roId)
    Ctx->>Ctx: Optimistically updates React state (db.categoryVideos)
    Ctx->>Ctx: Writes to localStorage ('nitte_saved_category_videos')
    Ctx->>BC: postMessage({ type: 'category_video_updated', entry })
    BC-->>Student: onmessage receives event
    Student->>Student: setDb(updates db.categoryVideos) with 0ms latency
    Ctx->>Server: PUT /api/category-videos/:category { roId }
    Server->>DB: Validates RO authorization for category (rejects 403 if unauthorized)
    Server->>DB: UPSERT INTO category_videos ... ON CONFLICT DO UPDATE
    DB-->>Server: Rows updated
    Server-->>Ctx: 200 OK { success: true }
    Ctx->>Ctx: fetchDbState() re-confirms state
```

### Detailed Function Call Trace:
1. **Entry Point**: RO clicks:
   - Ticket details: `openVideoManagerForCategory(selectedIssue.category, selectedIssue.id)` (Locked specifically to that assigned issue's category).
   - Sidebar: `openVideoManagerForCategory()` (Strictly constrained to `myAssignedIssueCategories`).
2. **Access Control & Data Prefill**:
   - `openVideoManagerForCategory` checks if target category is in `myAssignedIssueCategories`. If not, access is denied.
   - Sets `managerTargetIssueId` to lock the modal to that ticket.
   - Executes `loadCategoryVideoData(cat)` in `RODashboard.jsx`.
   - Sets form states: `managerVideoTitle`, `managerVideoUrl`, `managerVideoDesc`.
3. **Save Handler**:
   - Executes `handleSaveCategoryVideo(e)` upon clicking submit.
   - Verifies `myAssignedIssueCategories.includes(managerCategory)`.
   - Invokes `updateCategoryVideo(managerCategory, managerVideoUrl, managerVideoTitle, managerVideoDesc, ro.id)` from `DatabaseContext.jsx`.
4. **Backend Authorization Verification (`server/server.js`)**:
   - `PUT /api/category-videos/:category` verifies that the requesting `roId` matches the designated RO or has active tickets in that category. Rejects unauthorized attempts with `403 Forbidden`.
5. **Multi-Tab Broadcast Execution**:
   - Updates local state `setDb(prev => ({ ...prev, categoryVideos: merged }))`.
   - Persists to `localStorage.setItem('nitte_saved_category_videos', ...)`.
   - Dispatches broadcast:
     ```javascript
     const videoBc = new BroadcastChannel('nitte_video_sync');
     videoBc.postMessage({ type: 'category_video_updated', entry: updatedEntry });
     ```
   - In any other open tab (e.g. Student tab), `videoBc.onmessage` receives the entry and mutates state in **0 milliseconds**.
5. **Backend Persistence**:
   - Sends `PUT /api/category-videos/:category` with payload.
   - `server/server.js` runs PostgreSQL `ON CONFLICT (category) DO UPDATE`.
   - Synchronizes root department and `${dept} Support Desk` rows.
6. **End Point**: All current and future students submitting issues under this category view the new YouTube guidance video.

---

## 4. Online Video Meeting Scheduling, Joining & WebRTC Handshake Flow

```mermaid
sequenceDiagram
    autonumber
    participant RO as RO (Host)
    participant Student as Student (Peer)
    participant Relay as Express Signaling Relay (/api/meetings/signals)
    participant Google as Google STUN Servers

    Note over RO,Student: RO Schedules Meeting (Mode: Online)
    RO->>RO: handleOpenOnlineMeeting()
    RO->>RO: requestMedia() -> getUserMedia({ video: true, audio: true })
    RO->>RO: Starts MediaRecorder(stream) for session auto-recording
    RO->>RO: new WebRtcMeetingSession({ role: 'ro', localStream })
    RO->>RO: setupPeerConnection() with Google STUN

    Student->>Student: Clicks "Join Video Session"
    Student->>Student: requestStudentMedia() -> getUserMedia({ video: true, audio: true })
    Student->>Student: new WebRtcMeetingSession({ role: 'student', localStream })
    Student->>Relay: Sends 'ready' signal via BroadcastChannel & HTTP Relay

    RO->>RO: Receives 'ready' -> createOffer()
    RO->>RO: setLocalDescription(offer)
    RO->>Relay: Sends 'offer' signal
    Relay-->>Student: Relays 'offer' signal

    Student->>Student: setRemoteDescription(offer)
    Student->>Student: createAnswer() -> setLocalDescription(answer)
    Student->>Relay: Sends 'answer' signal
    Relay-->>RO: Relays 'answer' signal
    RO->>RO: setRemoteDescription(answer)

    par ICE Candidate Trickle
        RO->>Google: STUN NAT discovery
        Google-->>RO: Candidate discovered
        RO->>Relay: Sends 'candidate'
        Relay-->>Student: Relays 'candidate'
        Student->>Student: addIceCandidate()
    and
        Student->>Google: STUN NAT discovery
        Google-->>Student: Candidate discovered
        Student->>Relay: Sends 'candidate'
        Relay-->>RO: Relays 'candidate'
        RO->>RO: addIceCandidate()
    end

    Note over RO,Student: pc.ontrack triggers on both peers -> Tracks aggregated into persistent MediaStream -> Rendered via memoized VideoStreamPlayer with zero flicker!
```

### Detailed Function Call Trace:
1. **Meeting Launch (RO)**:
   - RO clicks "Start Video Call Session" in `src/views/RODashboard.jsx`.
   - Executes `handleLaunchOnlineMeeting()`.
   - Calls `requestMediaPermissions()`:
     ```javascript
     const stream = await navigator.mediaDevices.getUserMedia({
       video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user' },
       audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
     });
     ```
   - Instantiates memoized `<VideoStreamPlayer stream={localStream} muted={true} />`.
   - Starts recording: `new MediaRecorder(stream)` begins collecting chunks with relaxed 10s buffer.
   - Instantiates `webrtcSessionRef.current = new WebRtcMeetingSession({ role: 'ro', localStream: stream, ... })`.
2. **Meeting Join (Student)**:
   - Student clicks "Join Video Session" on their ticket in `src/views/StudentDashboard.jsx`.
   - Calls `requestStudentMedia()`.
   - Instantiates memoized `<VideoStreamPlayer stream={studentStream} muted={true} />`.
   - Instantiates `new WebRtcMeetingSession({ role: 'student', localStream: stream, ... })`.
3. **Signaling & SDP Audio Negotiation (`src/utils/webrtcService.js`)**:
   - `sendSignal({ type: 'ready' })` announces presence with unique `sessionId`.
   - RO creates SDP Offer: `pc.createOffer()` ➔ `tuneSdp()` (injects Opus FEC, minptime=10) ➔ `pc.setLocalDescription()` ➔ `sendSignal({ type: 'offer' })`.
   - Student receives offer: `pc.setRemoteDescription(offer)` ➔ `pc.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true })` ➔ `tuneSdp()` ➔ `pc.setLocalDescription()` ➔ `sendSignal({ type: 'answer' })`.
   - RO receives answer: `pc.setRemoteDescription(answer)`.
   - Both sides exchange ICE candidates via `pc.onicecandidate` ➔ `pc.addIceCandidate()`.
4. **Media & Dual Audio Pipeline Connection (`src/components/VideoStreamPlayer.jsx`)**:
   - `pc.ontrack` fires for incoming video and audio tracks.
   - `remoteMediaStream` in `WebRtcMeetingSession` dispatches stream to `<VideoStreamPlayer />`.
   - Dedicated `<video ref={videoRef} playsInline autoPlay />` renders video feed.
   - Independent `<audio ref={audioRef} autoPlay playsInline />` decodes and outputs remote audio with separate play-retry logic.
   - `stream.addEventListener('addtrack')` immediately binds audio tracks that arrive asynchronously.
   - Web Audio API `AudioContext` + `AnalyserNode` computes real-time RMS voice energy:
     - Detects voice activity threshold (`volume > 8%`).
     - Activates emerald active-speaker boundary glow on the speaking participant's card.
     - Animates green wave equalizer (` ▂▃ `) and real-time audio meter percentage.
5. **End Point**: Full-duplex bi-directional, encrypted 30fps HD video and low-latency audio active between RO and Student with live voice feedback.

---

## 5. Host-Driven Meeting Termination & Session Auto-Recording Flow

```mermaid
sequenceDiagram
    autonumber
    participant RO as RO (Host)
    participant Student as Student UI
    participant Comp as CompositeMeetingRecorder
    participant WebRTC as WebRtcMeetingSession
    participant Ctx as DatabaseContext.jsx
    participant Server as server/server.js
    participant DB as PostgreSQL Database

    Note over RO,Student: Real-Time Dual-Stream Compositing (1280x720 Canvas @ 25fps)
    Comp->>Comp: Mixes RO mic + Student mic via Web Audio API (AudioContext)
    Comp->>Comp: Renders RO on Left Tile & Student on Right Tile with live HUD

    RO->>RO: Clicks "⏹️ End & Save Session" (or Student leaves/ends)
    RO->>Comp: compositeRecorder.stop()
    Comp->>Comp: Finalizes WebM blob containing BOTH RO & Student side-by-side
    RO->>WebRTC: sendSignal({ type: 'meeting-ended' })
    WebRTC->>Student: Broadcasts { type: 'meeting-ended' }
    Student->>Student: onMeetingEnded() triggers handleCloseStudentVideo()
    Student->>Student: Stops student camera/mic tracks & shows official notice

    RO->>Ctx: saveMeetingRecording(meetingId, issueId, duration, compositeVideoUrl, summary)
    Ctx->>Ctx: Appends dual-participant recording to db.recordings & ticket logs
    Ctx->>Ctx: localStorage.setItem('nitte_saved_recordings', ...)
    RO->>Ctx: saveMeetingRecording(meetingId, issueId, duration, compositeVideoUrl, summary)
    Ctx->>Ctx: Appends dual-participant recording to db.recordings & ticket logs
    Ctx->>Ctx: localStorage.setItem('nitte_saved_recordings', ...)
    RO->>RO: Automatically opens Post-Meeting Discussion & Feedback Modal
    RO->>RO: Enters discussions taken place, action items, and selects outcome
    RO->>Ctx: submitRoMeetingFeedback(meetingId, issueId, roId, { discussionSummary, actionItems, outcome })
    Ctx->>Ctx: Updates meeting discussion minutes & appends [RO POST-MEETING DISCUSSION RECORD] to ticket logs
    Ctx->>Server: PUT /api/meetings/:id { status: 'Completed', notes, discussionSummary, actionItems }
    Server->>DB: UPDATE meetings SET status = 'Completed', notes = ...
    RO->>RO: Displays Meeting Minutes & Ticket Updated Confirmation
```

### Detailed Function Call Trace:
1. **Entry Point & Dual-Party Initiation**:
   - Either RO or Student can launch/join the scheduled meeting.
   - When joining, `CompositeMeetingRecorder` is instantiated with the local stream and canvas compositor.
2. **Dual-Channel Live Compositing**:
   - Web Audio API `AudioContext.createMediaStreamDestination()` mixes local microphone audio and incoming remote peer audio into a single synchronized audio destination.
   - 1280x720 25fps canvas draws Relationship Officer on the Left tile and Student on the Right tile with official institutional branding, ticket ID badge, and live date/time.
3. **Termination Signal Dispatch**:
   - Executes `handleStopAndSaveRecording()`.
   - Calls `webrtcSessionRef.current.sendSignal({ type: 'meeting-ended' })`:
     - Posts on `BroadcastChannel` and server relay.
4. **Student Auto-Teardown**:
   - In `StudentDashboard.jsx`, the WebRTC session callback `onMeetingEnded` triggers.
   - Executes `handleCloseStudentVideo()`.
   - Closes student WebRTC connection (`webrtcSessionRef.current.close()`).
   - Stops all camera and microphone tracks: `studentStreamRef.current.getTracks().forEach(t => t.stop())`.
5. **Dual-Participant Recording Compilation**:
   - Stops composite recorder: `const { blob, videoUrl } = await compositeRecorderRef.current.stop()`.
   - Produces a playable and downloadable WebM video file containing **BOTH the Student and the Relationship Officer**.
6. **Database Archiving**:
   - Calls `saveMeetingRecording(meetingId, issueId, duration, videoUrl, summary)` in `DatabaseContext.jsx`.
   - Appends to `db.recordings` with timestamp, duration, and download link.
   - Updates ticket audit history: `[AUTO-RECORDED ONLINE MEETING STORED] Session recording saved...`.
7. **Post-Meeting RO Discussion & Feedback Record Modal**:
   - The RO is presented with the official **Post-Meeting Discussion & Feedback Record** form.
   - Asks for:
     - **Discussions Taken Place & Key Deliberations** (Required): Documents issues raised, student statements, and clarifications offered.
     - **Agreed Action Items & Responsibilities** (Optional): Documents student tasks and officer next steps.
     - **Meeting Outcome**: `In-Progress`, `Resolved`, or `Escalated`.
     - **Follow-Up Needed**: Checkbox to mark if follow-up conference is required.
   - Calls `submitRoMeetingFeedback(...)` to save discussion minutes to `db.meetings`, commit to PostgreSQL, and log to the ticket's permanent audit trail.
8. **End Point**: Session terminated cleanly on both ends; video recording and official discussion minutes are visible, playable, and downloadable from the ticket history in both the RO and Student dashboards.


---

## 6. Ticket Lifecycle State Transition Flow

```mermaid
stateDiagram-v2
    [*] --> Submitted: Student Submits Issue
    Submitted --> SelfResolved: Student views video & clicks "Close Ticket"
    SelfResolved --> [*]: Ticket Closed (Self-Help)

    Submitted --> AssignedToRO: Student clicks "Proceed with RO"
    AssignedToRO --> MeetingScheduled: RO schedules Offline / Online Meeting
    MeetingScheduled --> InProgress: Online Video Meeting Started
    MeetingScheduled --> OfflineRescheduled: RO declares Online Meeting Not Done (Files Minutes & Switches to Offline)
    OfflineRescheduled --> MeetingScheduled: Offline Session Active
    InProgress --> MeetingCompleted: RO concludes & saves video recording
    MeetingCompleted --> DiscussionMinutesFiled: RO logs official discussion minutes (Mandatory for Online)
    DiscussionMinutesFiled --> Resolved: RO logs Resolution Action Notes (or resolves via minutes form)
    MeetingScheduled --> Resolved: Offline Meeting completed & resolved

    Resolved --> Reopened: Student unsatisfied & submits Re-open Reason
    Reopened --> MeetingScheduled: RO reschedules follow-up session (Max 2 reassigns)
    Reopened --> Escalated: RO escalates ticket to Admin
    AssignedToRO --> Escalated: RO escalates ticket to Admin
    Escalated --> Resolved: Admin overrides & resolves ticket

    Resolved --> Closed: Student rates 1-5 stars & leaves feedback
    Closed --> [*]
```

### State Mapping Table:
| Status | Triggering Function | Associated Role | Next Valid Transitions |
| :--- | :--- | :--- | :--- |
| `Submitted` | `submitIssue()` | Student | `Assigned to RO`, `Resolved` |
| `Assigned to RO` | `submitIssue()` / `handleProceedToRO()` | System / Student | `Meeting Scheduled`, `Escalated`, `Resolved` |
| `Meeting Scheduled` | `scheduleRoMeeting()` | RO | `Started`, `Resolved`, `Escalated` |
| `Started` | `handleOpenOnlineMeeting()` | RO | `Completed` |
| `Completed` | `handleEndOnlineMeeting()` | RO | `Resolved`, `Escalated` |
| `Resolved` | `resolveIssue()` | RO / Student / Admin | `Re-opened by Student`, Closed |
| `Re-opened by Student` | `reopenIssue()` | Student | `Meeting Scheduled`, `Escalated` |
| `Escalated` | `escalateIssue()` | RO | `Resolved` (Admin only) |
