export async function initializeJobSchema(query) {
  await query(`CREATE TABLE IF NOT EXISTS roster_imports (id UUID PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('students','mentors','ros')),
    created_by VARCHAR(50) NOT NULL, request_key UUID NOT NULL, payload_digest CHAR(64) NOT NULL,
    total INTEGER NOT NULL CHECK (total BETWEEN 1 AND 2000), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (created_by, request_key))`);
  await query(`CREATE TABLE IF NOT EXISTS roster_import_rows (job_id UUID REFERENCES roster_imports(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL, input_cipher TEXT, result_cipher TEXT, status TEXT NOT NULL DEFAULT 'PENDING',
    error TEXT, mail_log_id TEXT, processed_at TIMESTAMPTZ, PRIMARY KEY(job_id,row_number))`);
  await query('CREATE INDEX IF NOT EXISTS roster_pending_idx ON roster_import_rows (status, job_id, row_number)');
  await query('CREATE TABLE IF NOT EXISTS mail_sending_limits (sender TEXT PRIMARY KEY, blocked_until TIMESTAMPTZ)');
  await query('ALTER TABLE mail_sending_limits ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ');
  await query(`CREATE TABLE IF NOT EXISTS mail_sending_attempts (id BIGSERIAL PRIMARY KEY, sender TEXT NOT NULL,
    mail_log_id TEXT NOT NULL, attempt_number INTEGER NOT NULL DEFAULT 1, attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(sender,mail_log_id,attempt_number))`);
  await query('CREATE INDEX IF NOT EXISTS mail_attempts_sender_time_idx ON mail_sending_attempts (sender, attempted_at)');
  await query(`INSERT INTO mail_sending_attempts(sender,mail_log_id,attempt_number,attempted_at)
    SELECT LOWER(sender),id::text,0,created_at FROM email_logs
    WHERE attempts=0 AND status IN ('DELIVERED_GMAIL','DELIVERED','SENT','DELIVERY_UNKNOWN')
      AND created_at>NOW()-INTERVAL '24 hours' ON CONFLICT DO NOTHING`);
  for (const table of ['students', 'mentors', 'ros']) await query(`ALTER TABLE ${table} ALTER COLUMN email TYPE VARCHAR(150)`);
}
