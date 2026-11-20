// Headshots, made phone-sized. The SCA's originals are large files on the old site's storage; loading 88 of them made
// the first-open page slow. This makes two small square copies of each (for the round avatars and for the feed card)
// and points the app at those. It also means the photos no longer depend on the old site staying up.
// A photo that cannot be fetched or converted is left as it was.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = new URL('..', import.meta.url);
const file = new URL('public/data/app.json', root);
const data = JSON.parse(await readFile(file, 'utf8'));
const dir = new URL('public/people/', root);
await mkdir(dir, { recursive: true });
// Square, cropped around the most face-like part of the picture rather than its dead centre.
const square = (bytes, px) => sharp(bytes, { animated: false }).rotate().resize(px, px, { fit: 'cover', position: sharp.strategy.attention }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
let made = 0, reused = 0, failed = 0;
const todo = data.teachers.filter((t) => /^https:\/\/sca-platform\.s3\.amazonaws\.com\//.test(t.photo));
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let t; (t = todo.pop());) {
    const key = createHash('sha1').update(t.photo).digest('hex').slice(0, 12);
    const small = new URL(`${key}-s.jpg`, dir), medium = new URL(`${key}-m.jpg`, dir);
    try {
      if (!existsSync(small) || !existsSync(medium)) {
        const res = await fetch(t.photo, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`${res.status}`);
        const bytes = Buffer.from(await res.arrayBuffer());
        await writeFile(medium, await square(bytes, 480));
        await writeFile(small, await square(bytes, 160));
        made++;
      } else reused++;
      t.photo = `./people/${key}-m.jpg`; t.photoSmall = `./people/${key}-s.jpg`;
    } catch (e) { failed++; console.log(`  ! photo for ${t.name}: ${e.message.split('\n')[0]}`); }
  }
}));
await writeFile(file, JSON.stringify(data));
console.log(`✓ Photos: ${made} made, ${reused} already here${failed ? `, ${failed} left as the original` : ''}.`);
