import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export function createQueueCipher(key) {
  if (!Buffer.isBuffer(key) || key.length !== 32) throw new Error('The queue encryption key must contain 32 bytes.');
  return {
    fingerprint: createHash('sha256').update(key).digest('hex'),
    seal(value) {
      const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
    },
    open(value) {
      const [version, iv, tag, data] = String(value).split('.');
      if (version !== 'v1') throw new Error('Unsupported encrypted queue payload.');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8'));
    }
  };
}
let cached;
export function loadQueueCipher() {
  cached ||= (async () => {
    if (process.env.QUEUE_ENCRYPTION_KEY) {
      const key = Buffer.from(process.env.QUEUE_ENCRYPTION_KEY, 'base64');
      return createQueueCipher(key);
    }
    if (process.env.NODE_ENV === 'production') throw new Error('QUEUE_ENCRYPTION_KEY is required in production. Configure a private 32-byte base64 secret and keep it backed up.');
    const folder = fileURLToPath(new URL('../../.local/', import.meta.url));
    const path = fileURLToPath(new URL('../../.local/queue-encryption.key', import.meta.url));
    await mkdir(folder, { recursive: true });
    let key;
    try { key = await readFile(path); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      try { await writeFile(path, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
      catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; }
      key = await readFile(path);
    }
    return createQueueCipher(key);
  })();
  return cached;
}

export async function verifyQueueKey(query, cipher) {
  await query("INSERT INTO app_settings(key,value) VALUES('queue_key_fingerprint',$1) ON CONFLICT(key) DO NOTHING", [cipher.fingerprint]);
  const saved = (await query("SELECT value FROM app_settings WHERE key='queue_key_fingerprint'")).rows[0];
  if (saved.value !== cipher.fingerprint) throw new Error('Queue encryption key does not match this database. Restore the original private key before starting workers.');
}
