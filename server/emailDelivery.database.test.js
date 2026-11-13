import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailDelivery, initializeEmailSchema } from './emailDelivery.js';
import { createInboundEmailProcessor } from './emailInbound.js';

test('PostgreSQL saves truthful delivery status and deduplicates notifications without changing application records', {
  skip: process.env.EMAIL_DATABASE_TEST !== '1', timeout: 30000
}, async () => {
  const { getPool, shutdown } = await import('./db.js');
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TEMP TABLE email_logs (id SERIAL PRIMARY KEY, direction TEXT, sender TEXT, recipient TEXT,
      subject TEXT, body TEXT, event_type TEXT, issue_id TEXT, status TEXT, created_at TIMESTAMP DEFAULT NOW()) ON COMMIT DROP`);
    await client.query('CREATE TEMP TABLE students (id TEXT, email TEXT DEFAULT NULL) ON COMMIT DROP');
    await client.query('CREATE TEMP TABLE ros (id TEXT, email TEXT DEFAULT NULL) ON COMMIT DROP');
    let databaseFailure;
    const query = async (sql, params) => {
      try { return await client.query(sql, params); }
      catch (error) { databaseFailure = { code: error.code, message: error.message }; throw error; }
    };
    await initializeEmailSchema(query);
    const messages = [];
    const send = createEmailDelivery({ query, sender: 'portal@college.edu', enabled: () => true,
      getTransporter: () => ({ sendMail: async message => { messages.push(message); return { accepted: [message.to] }; } }) });
    const notice = { to: 'alice@college.edu', subject: 'Isolated database fixture', text: 'No external SMTP is used.', notificationKey: 'db-test-notice' };
    assert.equal((await send(notice)).status, 'DELIVERED_GMAIL', JSON.stringify(databaseFailure));
    assert.equal((await send(notice)).duplicate, true);
    assert.equal(messages.length, 1);
    const disabled = createEmailDelivery({ query, sender: 'portal@college.edu', enabled: () => false, getTransporter: () => { throw new Error('Disabled email must not create a transport'); } });
    assert.equal((await disabled({ ...notice, notificationKey: 'db-test-disabled' })).status, 'SKIPPED_DISABLED');
    const logs = (await client.query('SELECT status, recipient FROM email_logs ORDER BY id')).rows;
    assert.deepEqual(logs.map(row => row.status), ['DELIVERED_GMAIL', 'SKIPPED_DISABLED']);
    assert.ok(logs.every(row => row.recipient === 'alice@college.edu'));
    await client.query("CREATE TEMP TABLE issues (id TEXT PRIMARY KEY, student_id TEXT, ro_id TEXT, logs JSONB DEFAULT '[]') ON COMMIT DROP");
    await client.query("INSERT INTO students VALUES ('S-A', 'alice@college.edu'); INSERT INTO ros VALUES ('RO-A', 'officer-a@college.edu'); INSERT INTO issues (id, student_id, ro_id) VALUES ('ISS-A', 'S-A', 'RO-A')");
    const receive = createInboundEmailProcessor({ query, sender: 'portal@college.edu' });
    const reply = { senderEmail: 'alice@college.edu', issueId: 'ISS-A', replyText: 'Isolated inbound reply fixture', messageId: '<database-fixture@college.edu>' };
    assert.equal((await receive(reply)).duplicate, false);
    assert.equal((await receive(reply)).duplicate, true);
    assert.equal((await client.query('SELECT logs FROM issues')).rows[0].logs.length, 1);
    assert.equal((await client.query("SELECT COUNT(*)::integer AS count FROM email_logs WHERE direction = 'INBOUND'")).rows[0].count, 1);
  } finally { await client.query('ROLLBACK'); client.release(); await shutdown(); }
});
