// A checked-out connection keeps every statement on the same transaction.
export async function withTransaction(getClient, work) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout = '8s'");
    await client.query("SET LOCAL statement_timeout = '15s'");
    const result = await work((sql, params) => client.query(sql, params));
    const committed = await client.query('COMMIT');
    // PostgreSQL answers ROLLBACK if a swallowed SQL error aborted the transaction.
    if (committed.command !== 'COMMIT') throw new Error('The database transaction did not commit.');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally { client.release(); }
}
