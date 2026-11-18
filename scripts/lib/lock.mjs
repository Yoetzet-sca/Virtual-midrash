// Locks private details (home addresses, Zoom links) with the community code.
// The website is public, so these are encrypted here and only unlock on a phone
// where someone types the right code. Must match src/lock.ts.
import { pbkdf2Sync, randomBytes, createCipheriv } from 'node:crypto';

export const normalizeCode = (code) => String(code).trim().toLowerCase();

export function lock(plain, code) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = pbkdf2Sync(normalizeCode(code), salt, 150000, 32, 'sha256');
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(String(plain), 'utf8'), c.final(), c.getAuthTag()]);
  return [salt, iv, body].map((b) => b.toString('base64')).join('.');
}
