// Fetches every teacher's original photo from the old site's storage into headshot-src/<key>.jpg (longest side 1100),
// for scripts/headshots.py to restyle. <key> is the same one scripts/photos.mjs uses.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = new URL('..', import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const urls = new Set([...(await json('content/roster.json')), ...(await json('content/teachers.json'))].map((t) => t.photo).filter((u) => /^https:\/\/sca-platform\.s3\.amazonaws\.com\//.test(u || '')));
await mkdir(new URL('headshot-src/', root), { recursive: true });
let ok = 0;
for (const url of urls) {
  const key = createHash('sha1').update(url).digest('hex').slice(0, 12);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(String(res.status));
    const out = await sharp(Buffer.from(await res.arrayBuffer()), { failOn: 'none' }).rotate().resize(1100, 1100, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer();
    await writeFile(new URL(`headshot-src/${key}.jpg`, root), out);
    ok++;
  } catch (e) { console.log(`! ${url.split('/').pop()}: ${e.message}`); }
}
console.log(`✓ ${ok} of ${urls.size} originals fetched`);
