// Opens details locked with the community code. Must match scripts/lib/lock.mjs.
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function unlock(blob: string, code: string): Promise<string | null> {
  try {
    const [salt, iv, body] = blob.split('.').map(b64);
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(code.trim().toLowerCase()), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body));
  } catch {
    return null; // wrong code
  }
}
