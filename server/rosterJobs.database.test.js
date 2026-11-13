import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createQueueCipher, verifyQueueKey } from './security/queueCipher.js';
import { hashPassword, verifyPassword } from './security/passwords.js';
import { initializeJobSchema } from './jobSchema.js';
import { initializeEmailSchema, createEmailDelivery } from './emailDelivery.js';
import { createRosterJobs } from './rosterJobs.js';
import { createMailWorker } from './mailQueue.js';

test('durable roster jobs resume without resetting passwords; queued mail respects quotas, retries safely and survives restart', {
  skip: process.env.ROSTER_DATABASE_TEST !== '1', timeout: 90000
}, async () => {
  const { getPool, shutdown } = await import('./db.js');
  const client = await getPool().connect();
  const schema = `roster_test_${randomUUID().replaceAll('-', '')}`;
  assert.match(schema, /^roster_test_[a-f0-9]{32}$/);
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`CREATE TABLE students(id VARCHAR(50) PRIMARY KEY,name VARCHAR(100),email VARCHAR(150),branch VARCHAR(50),sem INTEGER,mentor_id VARCHAR(50),phone TEXT,password VARCHAR(255));
      CREATE TABLE mentors(id VARCHAR(50) PRIMARY KEY,name VARCHAR(100),email VARCHAR(150),dept VARCHAR(100),class VARCHAR(100),password VARCHAR(255));
      CREATE TABLE ros(id VARCHAR(50) PRIMARY KEY,name VARCHAR(100),email VARCHAR(150),region VARCHAR(100),password VARCHAR(255));
      CREATE TABLE system_logs(id SERIAL PRIMARY KEY,text TEXT,user_role TEXT,user_id TEXT);
      CREATE TABLE app_settings(key TEXT PRIMARY KEY,value TEXT);
      CREATE TABLE email_logs(id SERIAL PRIMARY KEY,direction TEXT,sender TEXT,recipient TEXT,subject TEXT,body TEXT,event_type TEXT,issue_id TEXT,status TEXT,created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE issues(id TEXT PRIMARY KEY,student_id TEXT,ro_id TEXT)`);
    const query = (sql, params) => client.query(sql, params);
    const getClient = async () => ({ query, release() {} });
    const cipher = createQueueCipher(randomBytes(32));
    await initializeEmailSchema(query); await initializeJobSchema(query); await verifyQueueKey(query, cipher);
    await assert.rejects(verifyQueueKey(query, createQueueCipher(randomBytes(32))), /does not match/);
    const originalPassword = 'Existing-Password-Works!'; const originalHash = await hashPassword(originalPassword);
    await client.query("INSERT INTO students(id,name,email,branch,sem,password) VALUES('OLD','Old user','old@college.edu','CSE',4,$1)", [originalHash]);
    const createMailSender = query => createEmailDelivery({ query, sender: 'portal@college.edu', enabled: () => true, queueCipher: cipher });
    const dependencies = { query, getClient, cipher, createMailSender, portalUrl: 'https://portal.college.edu' };
    const jobs = createRosterJobs(dependencies);
    const rows = [{ id: 'NEW', name: 'New student', email: 'new@college.edu', branch: 'CSE', sem: 4, password: 'New-Student-Password-42!' },
      { id: 'OLD', name: 'Updated user', email: 'old@college.edu', branch: 'CSE', sem: 5, password: 'Should-Never-Replace-Old!' }];
    const request = randomUUID(); const actor = { id: 'ADMIN-FIXTURE', role: 'Admin' };
    const job = await jobs.enqueue('students', rows, actor, request);
    assert.equal((await jobs.enqueue('students', rows, actor, request)).jobId, job.jobId);
    await assert.rejects(jobs.enqueue('students', [{ ...rows[0], name: 'Changed payload' }], actor, request), /different roster/);
    assert.equal((await jobs.get(job.jobId)).processed, 0);
    assert.equal(await jobs.tick(), true);
    // A fresh service object represents a worker that restarted mid-import.
    const restarted = createRosterJobs(dependencies);
    assert.equal(await restarted.tick(), true);
    const completed = await restarted.get(job.jobId, true);
    assert.equal(completed.status, 'COMPLETED'); assert.equal(completed.successCount, 2);
    assert.equal(completed.emailsWaiting, 1);
    assert.equal(completed.results[1].passwordStatus, 'UNCHANGED'); assert.equal(completed.results[1].password, '');
    const preserved = (await client.query("SELECT password,sem FROM students WHERE id='OLD'")).rows[0];
    assert.equal(preserved.password, originalHash); assert.equal(preserved.sem, 5);
    assert.equal(await verifyPassword(originalPassword, preserved.password), true);
    const stored = JSON.stringify((await client.query('SELECT * FROM roster_import_rows')).rows);
    assert.ok(!stored.includes(rows[0].password));
    assert.ok(!(await client.query('SELECT body FROM email_logs')).rows[0].body.includes(rows[0].password));
    const again = await jobs.enqueue('students', rows, actor);
    await jobs.tick(); await jobs.tick();
    assert.equal((await jobs.get(again.jobId, true)).results[0].passwordStatus, 'UNCHANGED');
    assert.equal((await client.query('SELECT COUNT(*)::integer AS count FROM email_logs')).rows[0].count, 1);

    const sent = []; let failNext = false;
    const options = { getClient, cipher, sender: 'portal@college.edu', enabled: () => true, perMinute: 1, perDay: 10,
      getTransporter: () => ({ sendMail: async message => { if (failNext) { failNext = false; throw Object.assign(new Error('Temporary SMTP fixture'), { responseCode: 450 }); } sent.push(message); return { accepted: [message.to] }; } }) };
    const worker = createMailWorker(options);
    assert.equal(await worker.tick(), true); assert.equal(sent.length, 1);
    const mail = await createMailSender(query)({ to: 'new@college.edu', text: 'Second notice', subject: 'Notice', eventType: 'MANUAL_DISPATCH', notificationKey: 'second-mail', recipientBinding: { role: 'Student', id: 'NEW' } });
    assert.equal(mail.status, 'QUEUED');
    await worker.tick();
    assert.equal((await client.query('SELECT status FROM email_logs WHERE id=$1', [mail.id])).rows[0].status, 'DEFERRED'); assert.equal(sent.length, 1);
    await client.query("UPDATE mail_sending_attempts SET attempted_at=NOW()-INTERVAL '2 minutes'; UPDATE email_logs SET next_attempt_at=NOW() WHERE status='DEFERRED'");
    failNext = true; await createMailWorker(options).tick();
    assert.equal((await client.query('SELECT status FROM email_logs WHERE id=$1', [mail.id])).rows[0].status, 'RETRY');
    await client.query("UPDATE mail_sending_attempts SET attempted_at=NOW()-INTERVAL '2 minutes'; UPDATE email_logs SET next_attempt_at=NOW() WHERE status='RETRY'");
    await createMailWorker(options).tick(); assert.equal(sent.length, 2);
    assert.equal((await client.query('SELECT status FROM email_logs WHERE id=$1', [mail.id])).rows[0].status, 'DELIVERED_GMAIL');
    const stale = await createMailSender(query)({ to: 'new@college.edu', text: 'Stale credentials', subject: 'Credentials', eventType: 'BULK_STUDENT_ONBOARDING', notificationKey: 'stale', recipientBinding: { role: 'Student', id: 'NEW', passwordHash: 'old-password-verifier' } });
    await client.query("UPDATE mail_sending_attempts SET attempted_at=NOW()-INTERVAL '2 minutes'");
    await worker.tick(); assert.equal((await client.query('SELECT status FROM email_logs WHERE id=$1', [stale.id])).rows[0].status, 'CANCELLED'); assert.equal(sent.length, 2);
    const uncertain = await createMailSender(query)({ to: 'new@college.edu', text: 'In-flight fixture', subject: 'Notice', notificationKey: 'uncertain' });
    await client.query("UPDATE email_logs SET status='SENDING',lease_until=NOW()-INTERVAL '1 minute' WHERE id=$1", [uncertain.id]);
    await worker.tick(); assert.equal((await client.query('SELECT status FROM email_logs WHERE id=$1', [uncertain.id])).rows[0].status, 'DELIVERY_UNKNOWN'); assert.equal(sent.length, 2);
    assert.equal(await createMailWorker({ ...options, enabled: () => false }).tick(), false);

    await createMailSender(query)({ to: 'new@college.edu', subject: 'Parallel one', text: 'Fixture', notificationKey: 'parallel-one', recipientBinding: { role: 'Student', id: 'NEW' } });
    await createMailSender(query)({ to: 'new@college.edu', subject: 'Parallel two', text: 'Fixture', notificationKey: 'parallel-two', recipientBinding: { role: 'Student', id: 'NEW' } });
    const independentClient = async () => { const connection = await getPool().connect(); await connection.query(`SET search_path TO "${schema}"`); return connection; };
    const beforeConcurrent = sent.length;
    const concurrent = { ...options, getClient: independentClient, quotaAccount: 'parallel-fixture' };
    await Promise.all([createMailWorker(concurrent).tick(), createMailWorker(concurrent).tick()]);
    assert.equal(sent.length, beforeConcurrent + 1, 'Two workers must share the same minute allowance');

    const thousand = Array.from({ length: 1000 }, (_, index) => ({ id: `BATCH-${index}`, name: `Student ${index}`, email: `student${index}@college.edu`, branch: 'CSE', sem: 4 }));
    const large = await jobs.enqueue('students', thousand, actor);
    const progress = await jobs.get(large.jobId);
    assert.equal(progress.total, 1000); assert.equal(progress.processed, 0);
    assert.equal((await client.query('SELECT COUNT(*)::integer AS count FROM roster_import_rows WHERE job_id=$1', [large.jobId])).rows[0].count, 1000);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release(); await shutdown();
  }
});
