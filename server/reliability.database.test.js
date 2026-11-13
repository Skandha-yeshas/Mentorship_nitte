import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createTicketActions } from './ticketActions.js';
import { createDashboardReader, initializeReliabilitySchema } from './dashboardState.js';
import { initializeEmailSchema, createEmailDelivery } from './emailDelivery.js';
import { createQueueCipher } from './security/queueCipher.js';
import { getMeetingReassignmentCount } from '../shared/meetingReassignments.js';
import { createMeetingExpiry } from './meetingExpiry.js';
import { createMeetingIceService } from './meetingIce.js';
import { ONLINE_MEETING_LIMIT_MS } from '../shared/meetingDuration.js';

test('ticket transactions roll back failed saves, preserve history, serialize quotas and return scoped dashboard snapshots', {
  skip: process.env.RELIABILITY_DATABASE_TEST !== '1', timeout: 90000
}, async () => {
  const { getPool, shutdown } = await import('./db.js');
  const root = getPool(); const schema = `reliability_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^reliability_test_[a-f0-9]{32}$/);
  let isolated;
  try {
    await root.query(`CREATE SCHEMA "${schema}"`);
    isolated = new pg.Pool({ ...root.options, max: 5, options: `-c search_path=${schema}` });
    const query = (sql, params) => isolated.query(sql, params);
    await query(`CREATE TABLE mentors(id TEXT PRIMARY KEY,name TEXT,email TEXT,dept TEXT,class TEXT);
      CREATE TABLE students(id TEXT PRIMARY KEY,name TEXT,email TEXT,mentor_id TEXT REFERENCES mentors(id),branch TEXT,sem INT);
      CREATE TABLE ros(id TEXT PRIMARY KEY,name TEXT,email TEXT,region TEXT);
      CREATE TABLE admins(id TEXT PRIMARY KEY,name TEXT,email TEXT);
      CREATE TABLE issues(id TEXT PRIMARY KEY,student_id TEXT REFERENCES students(id),student_name TEXT,ro_id TEXT REFERENCES ros(id),category TEXT,description TEXT,priority TEXT,status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,resolved_at TIMESTAMP,resolution_notes TEXT,feedback_rating INT,feedback_comments TEXT,logs JSONB NOT NULL DEFAULT '[]');
      CREATE TABLE meetings(id TEXT PRIMARY KEY,issue_id TEXT REFERENCES issues(id),student_id TEXT REFERENCES students(id),student_name TEXT,ro_id TEXT REFERENCES ros(id),date TEXT,time TEXT,mode TEXT,location TEXT,notes TEXT,status TEXT);
      CREATE TABLE system_logs(id SERIAL PRIMARY KEY,text TEXT,user_role TEXT,user_id TEXT,timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE email_logs(id SERIAL PRIMARY KEY,direction TEXT,sender TEXT,recipient TEXT,subject TEXT,body TEXT,event_type TEXT,issue_id TEXT,status TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE group_sessions(id TEXT,mentor_id TEXT,mentor_name TEXT,title TEXT,date_time TIMESTAMP,description TEXT,link TEXT);
      CREATE TABLE resources(id TEXT,mentor_id TEXT,title TEXT,type TEXT,content TEXT,date_shared TEXT);
      CREATE TABLE mentor_session_records(id SERIAL,mentor_id TEXT,session_date DATE,students_attended INT,topic TEXT,notes TEXT,which_class TEXT,location TEXT,status TEXT,created_at TIMESTAMP);
      CREATE TABLE mentor_feedbacks(id SERIAL,student_id TEXT,student_name TEXT,mentor_id TEXT,mentor_name TEXT,regularity_rating INT,clarity_rating INT,participation_rating INT,difficulties TEXT,created_at TIMESTAMP);
      CREATE TABLE category_videos(category TEXT,title TEXT,video_url TEXT,description TEXT,updated_by TEXT,updated_at TIMESTAMP);
      CREATE TABLE meeting_recordings(id TEXT,meeting_id TEXT,issue_id TEXT,ro_id TEXT,mime_type TEXT,byte_size BIGINT,duration_seconds INT,transcript_summary TEXT,recorded_at TIMESTAMPTZ)`);
    await initializeEmailSchema(query); await initializeReliabilitySchema(query);
    await query(`INSERT INTO mentors VALUES('M1','Mentor one','m1@college.edu','CSE','A'),('M2','Mentor two','m2@college.edu','ECE','B');
      INSERT INTO students VALUES('S1','Alice','s1@college.edu','M1','CSE',4),('S2','Bob','s2@college.edu','M2','ECE',4),('S3','Concurrent','s3@college.edu','M1','CSE',4);
      INSERT INTO ros VALUES('R1','RO one','r1@college.edu','Academic'),('R2','RO two','r2@college.edu','Hostel');
      INSERT INTO admins VALUES('ADMIN','Admin','admin@college.edu');
      INSERT INTO resources VALUES('RES1','M1','Own resource','Link','https://college.edu','2026-11-01'),('RES2','M2','Other resource','Link','https://college.edu','2026-11-01')`);
    const cipher = createQueueCipher(randomBytes(32));
    const createMailSender = q => createEmailDelivery({ query: q, sender: 'portal@college.edu', enabled: () => false, queueCipher: cipher });
    const make = failure => createTicketActions({ getClient: async () => {
      const client = await isolated.connect();
      return { query: async (sql, params) => {
        if (failure?.(sql)) return client.query('SELECT deliberately_missing_column');
        return client.query(sql, params);
      }, release: () => client.release() };
    }, createMailSender });
    const actions = make(); const s1 = { id: 'S1', name: 'Alice', role: 'Student' }; const s2 = { id: 'S2', name: 'Bob', role: 'Student' };
    const r1 = { id: 'R1', name: 'RO one', role: 'RO' }; const admin = { id: 'ADMIN', name: 'Admin', role: 'Admin' };
    const body = { category: 'Academic', description: 'Need guidance', priority: 'HIGH' };
    const first = await actions.submit(s1, body); const other = await actions.submit(s2, { ...body, category: 'Hostel' });
    const schedule = { issueId: first.id, date: '2026-11-02', time: '10:00', mode: 'Online', scheduleEventId: `schedule:${randomUUID()}` };
    const meeting = await actions.schedule(r1, schedule);
    const counts = async () => (await query('SELECT (SELECT COUNT(*) FROM system_logs)::int AS audit, (SELECT COUNT(*) FROM email_logs)::int AS mail')).rows[0];
    const before = await counts();
    await assert.rejects(make(sql => sql.includes('INSERT INTO meetings')).schedule(r1, { ...schedule, time: '11:00', scheduleEventId: `schedule:${randomUUID()}` }));
    assert.equal((await query('SELECT time FROM meetings WHERE id=$1', [meeting.id])).rows[0].time, '10:00');
    assert.deepEqual(await counts(), before);
    const start = await actions.updateMeeting(r1, meeting.id, { status: 'Started' }); assert.equal(start.status, 'Started');
    await assert.rejects(make(sql => sql.startsWith('INSERT INTO system_logs')).updateMeeting(r1, meeting.id, { status: 'Completed' }));
    assert.equal((await query('SELECT status FROM meetings WHERE id=$1', [meeting.id])).rows[0].status, 'Started');
    // A failed outbox insert must also roll back minutes and the selected resolution.
    await assert.rejects(make(sql => sql.includes('INSERT INTO email_logs')).updateMeeting(r1, meeting.id,
      { status: 'Completed', discussionSummary: 'Discussed the issue', outcome: 'Resolved' }));
    assert.equal((await query('SELECT status FROM issues WHERE id=$1', [first.id])).rows[0].status, 'Meeting Started');
    assert.equal((await query('SELECT discussion_summary FROM meetings WHERE id=$1', [meeting.id])).rows[0].discussion_summary, '');
    await Promise.all([actions.updateMeeting(r1, meeting.id, { status: 'Completed' }),
      actions.updateMeeting(r1, meeting.id, { discussionSummary: 'Saved minutes', actionItems: 'Follow up', outcome: 'In-Progress' })]);
    const saved = (await query('SELECT * FROM meetings WHERE id=$1', [meeting.id])).rows[0];
    assert.ok(saved.ended_at); assert.ok(saved.feedback_submitted_at); assert.equal(saved.discussion_summary, 'Saved minutes');
    const change = { ...schedule, time: '12:00', scheduleEventId: `schedule:${randomUUID()}` };
    await actions.schedule(r1, change); assert.equal((await actions.schedule(r1, change)).duplicate, true);
    let row = (await query('SELECT * FROM issues WHERE id=$1', [first.id])).rows[0];
    assert.equal(getMeetingReassignmentCount(row), 1);
    await actions.schedule(r1, { ...change, time: '13:00', scheduleEventId: `schedule:${randomUUID()}` });
    await assert.rejects(actions.schedule(r1, { ...change, time: '14:00', scheduleEventId: `schedule:${randomUUID()}` }), /Maximum two/);
    row = (await query('SELECT * FROM issues WHERE id=$1', [first.id])).rows[0];
    assert.equal(getMeetingReassignmentCount(row), 2);
    // Three connections compete for the last two quota slots.
    const concurrent = await Promise.allSettled([1, 2, 3].map(() => actions.submit({ id: 'S3', role: 'Student', name: 'Concurrent' }, body)));
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 2);
    assert.equal(concurrent.find(result => result.status === 'rejected').reason.status, 429);
    await actions.changeIssue(s1, first.id, 'resolve', { resolutionNotes: 'Self-help guidance worked' });
    await actions.changeIssue(s1, first.id, 'feedback', { rating: 5, comments: 'Helpful' });
    const second = await actions.submit(s1, body);
    await assert.rejects(actions.submit(s1, body), error => error.status === 429 && error.quota.usedCount === 2);
    // New service objects (server restart) still read the committed lifecycle/feedback.
    const read = createDashboardReader(query);
    for (const actor of [s1, r1, { id: 'M1', role: 'Mentor' }, admin]) {
      let calls = 0;
      const state = await createDashboardReader(async (...args) => { calls++; return query(...args); })(actor);
      assert.equal(calls, 1);
      if (actor.role !== 'Admin') {
        assert.ok(!state.issues.some(issue => issue.id === other.id));
        assert.ok(!state.users.students.some(student => student.id === 'S2'));
        assert.ok(!state.resources.some(resource => resource.id === 'RES2'));
      }
      if (actor.role === 'Student') assert.equal(state.issues.find(issue => issue.id === first.id).feedback.rating, 5);
    }
    const state = await read(s1); assert.ok(state.issues.some(issue => issue.id === second.id));
    assert.ok(state.issues.find(issue => issue.id === first.id).createdAt.endsWith('+00:00'));
    await assert.rejects(actions.updateMeeting({ id: 'R2', role: 'RO' }, meeting.id, { status: 'Started' }), /permission/);
    const hearing = await actions.schedule(admin, { ...schedule, issueId: second.id, scheduleEventId: `schedule:${randomUUID()}` });
    assert.equal((await read(admin)).meetings.find(meeting => meeting.id === hearing.id).isAdminHearing, true);
    assert.equal((await read(admin)).issues.find(issue => issue.id === second.id).adminMeetingScheduled, true);
    await assert.rejects(actions.schedule(admin, { ...schedule, issueId: second.id, scheduleEventId: `schedule:${randomUUID()}` }), /Only one/);
    // Exercise real PostgreSQL time, transactions, idempotence and recovery after
    // the browser/server was absent at the 30-minute boundary. No real mail sends.
    await query("INSERT INTO students VALUES('S4','Timed student','s4@college.edu','M1','CSE',4)");
    const timedIssue = await actions.submit({ id: 'S4', name: 'Timed student', role: 'Student' }, body);
    const timedMeeting = await actions.schedule(r1, { ...schedule, issueId: timedIssue.id, scheduleEventId: `schedule:${randomUUID()}` });
    await actions.updateMeeting(r1, timedMeeting.id, { status: 'Started' });
    const expiry = createMeetingExpiry({ query, getClient: () => isolated.connect() });
    assert.equal((await expiry.roomState(timedIssue.id)).active, true);
    const ice = createMeetingIceService({ query, env: { TURN_PROVIDER:'cloudflare', CLOUDFLARE_TURN_KEY_ID:'fixture', CLOUDFLARE_TURN_API_TOKEN:'fixture' },
      fetchImpl: async () => ({ok:true,json:async () => ({iceServers:[{urls:'turns:fixture.invalid:443?transport=tcp',username:'temporary',credential:'temporary'}]})}) });
    assert.equal((await ice.configuration({id:'S4',role:'Student'},timedIssue.id)).turnEnabled,true);
    await assert.rejects(ice.configuration(s1,timedIssue.id),error => error.status === 403);
    const initialStart = (await query('SELECT started_at FROM meetings WHERE id=$1', [timedMeeting.id])).rows[0].started_at;
    await actions.updateMeeting(r1, timedMeeting.id, { status: 'Started' });
    assert.equal((await query('SELECT started_at FROM meetings WHERE id=$1', [timedMeeting.id])).rows[0].started_at.getTime(), initialStart.getTime());
    await query("UPDATE meetings SET started_at = CURRENT_TIMESTAMP - INTERVAL '31 minutes' WHERE id=$1", [timedMeeting.id]);
    assert.equal((await expiry.roomState(timedIssue.id)).active, false);
    await assert.rejects(ice.configuration({id:'S4',role:'Student'},timedIssue.id),error => error.code === 'MEETING_ENDED');
    await assert.rejects(actions.updateMeeting(r1, timedMeeting.id, { status: 'Started' }), /Reschedule/);
    await assert.rejects(actions.updateMeeting(r1, timedMeeting.id, { status: 'Confirmed' }), /Reschedule/);
    const failingExpiry = createMeetingExpiry({ query, getClient: async () => {
      const client = await isolated.connect();
      return { query: (sql, params) => {
        if (sql.startsWith('INSERT INTO system_logs')) throw new Error('Fixture audit failure');
        return client.query(sql, params);
      }, release: () => client.release() };
    } });
    await assert.rejects(failingExpiry.tick(), /Fixture audit failure/);
    assert.equal((await query('SELECT status FROM meetings WHERE id=$1', [timedMeeting.id])).rows[0].status, 'Started');
    await Promise.all([expiry.tick(), expiry.tick()]);
    await expiry.tick();
    const ended = (await query('SELECT * FROM meetings WHERE id=$1', [timedMeeting.id])).rows[0];
    assert.equal(ended.status, 'Completed'); assert.equal(ended.ended_by_ro, false);
    assert.equal(ended.ended_at.getTime() - ended.started_at.getTime(), ONLINE_MEETING_LIMIT_MS);
    assert.equal(ended.feedback_submitted_at, null);
    const timedRow = (await query('SELECT status, logs FROM issues WHERE id=$1', [timedIssue.id])).rows[0];
    assert.equal(timedRow.status, 'In-Progress');
    assert.equal(timedRow.logs.filter(event => event.text.includes('30-minute time limit')).length, 1);
    assert.ok((await read(r1)).meetings.find(meeting => meeting.id === timedMeeting.id).endedAt);
    // Rescheduling is the intentional way to create a fresh session clock.
    await actions.schedule(r1, { ...schedule, issueId: timedIssue.id, time: '14:00', scheduleEventId: `schedule:${randomUUID()}` });
    await actions.updateMeeting(r1, timedMeeting.id, { status: 'Started' });
    assert.equal((await expiry.roomState(timedIssue.id)).active, true);
    // An RO completion racing the worker still records the same exact deadline.
    await query("UPDATE meetings SET started_at = CURRENT_TIMESTAMP - INTERVAL '31 minutes' WHERE id=$1", [timedMeeting.id]);
    await actions.updateMeeting(r1, timedMeeting.id, { status: 'Completed' });
    await expiry.tick();
    const raced = (await query('SELECT * FROM meetings WHERE id=$1', [timedMeeting.id])).rows[0];
    assert.equal(raced.ended_at.getTime() - raced.started_at.getTime(), ONLINE_MEETING_LIMIT_MS);
    await actions.updateMeeting(r1, timedMeeting.id, { discussionSummary: 'Minutes remain available after automatic expiry.', outcome: 'In-Progress' });
    assert.ok((await query('SELECT feedback_submitted_at FROM meetings WHERE id=$1', [timedMeeting.id])).rows[0].feedback_submitted_at);
    const offlineIssue = await actions.submit({ id: 'S4', name: 'Timed student', role: 'Student' }, body);
    const offlineMeeting = await actions.schedule(r1, { ...schedule, issueId: offlineIssue.id, mode: 'Offline', scheduleEventId: `schedule:${randomUUID()}` });
    await actions.updateMeeting(r1, offlineMeeting.id, { status: 'Started' });
    await query("UPDATE meetings SET started_at = CURRENT_TIMESTAMP - INTERVAL '1 hour' WHERE id=$1", [offlineMeeting.id]);
    await expiry.tick();
    assert.equal((await query('SELECT status FROM meetings WHERE id=$1', [offlineMeeting.id])).rows[0].status, 'Started');
    assert.ok((await query('SELECT status FROM email_logs')).rows.every(row => row.status === 'SKIPPED_DISABLED'));
  } finally {
    await isolated?.end();
    await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await shutdown();
  }
});
