import { randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(derive);
const settings = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
export const isPasswordHash = value => /^scrypt\$32768\$8\$3\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/.test(String(value || ''));
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw Object.assign(new Error('Use a password containing 12 to 128 characters.'), { status: 400 });
}
export async function hashPassword(password) {
  if (typeof password !== 'string' || !password || password.length > 128) throw new Error('Invalid password.');
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32, settings);
  return `scrypt$32768$8$3$${salt.toString('base64url')}$${key.toString('base64url')}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128 || !isPasswordHash(encoded)) return false;
  const parts = encoded.split('$');
  const key = await scrypt(password, Buffer.from(parts[4], 'base64url'), 32, settings);
  return timingSafeEqual(key, Buffer.from(parts[5], 'base64url'));
}
