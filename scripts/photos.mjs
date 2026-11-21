// Headshots, made phone-sized. The SCA's originals are large files on the old site's storage; loading 88 of them made
// the first-open page slow. This makes two small square copies of each (for the round avatars and for the feed card)
// and points the app at those. It also means the photos no longer depend on the old site staying up.
// A photo that cannot be fetched or converted is left as it was.
import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const root = new URL('..', import.meta.url);
const file = new URL('public/data/app.json', root);
const data = JSON.parse(await readFile(file, 'utf8'));
// The small copies are kept in the repository (content/people) so they survive the old site being switched off,
// and copied into the published site from there.
const dir = new URL('content/people/', root);
const pub = new URL('public/people/', root);
await mkdir(dir, { recursive: true });
await mkdir(pub, { recursive: true });
// Square. A tall picture keeps its top, where the head is; a wide one keeps its middle. (An automatic "find the
// interesting part" crop was tried first and too often chose a shirt or a tie over the face.)
async function square(bytes, px) {
  const img = sharp(bytes, { animated: false, failOn: 'none' }).rotate();
  const { width = 1, height = 1, orientation = 1 } = await sharp(bytes, { failOn: 'none' }).metadata();
  const tall = orientation >= 5 ? width > height : height > width; // a sideways-stored photo has its sides swapped
  return img.resize(px, px, { fit: 'cover', position: tall ? 'top' : 'centre' }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
}
let made = 0, reused = 0, failed = 0, restyled = 0;
const todo = data.teachers.filter((t) => /^https:\/\/sca-platform\.s3\.amazonaws\.com\//.test(t.photo));
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let t; (t = todo.pop());) {
    const key = createHash('sha1').update(t.photo).digest('hex').slice(0, 12);
    const small = new URL(`${key}-s2.jpg`, dir), medium = new URL(`${key}-m2.jpg`, dir);
    try {
      if (!existsSync(small) || !existsSync(medium)) {
        const res = await fetch(t.photo, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`${res.status}`);
        const bytes = Buffer.from(await res.arrayBuffer());
        await writeFile(medium, await square(bytes, 480));
        await writeFile(small, await square(bytes, 160));
        made++;
      } else reused++;
      // The restyled copy (cut out onto white, face centred — made by scripts/headshots.py) is used when there is one.
      const styled = existsSync(new URL(`${key}-m3.jpg`, dir)) && existsSync(new URL(`${key}-s3.jpg`, dir)) ? 3 : 2;
      if (styled === 3) restyled++;
      t.photo = `./people/${key}-m${styled}.jpg`; t.photoSmall = `./people/${key}-s${styled}.jpg`;
    } catch (e) { failed++; console.log(`  ! photo for ${t.name}: ${e.message.split('\n')[0]}`); }
  }
}));
for (const f of await readdir(dir)) if (f.endsWith('.jpg')) await copyFile(new URL(f, dir), new URL(f, pub));
await writeFile(file, JSON.stringify(data));
console.log(`✓ Photos: ${made} made, ${reused} already here, ${restyled} in the house style${failed ? `, ${failed} left as the original` : ''}.`);
