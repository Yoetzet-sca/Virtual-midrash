// Fetches the SCA's own folder of headshots (a Google Drive folder shared by link) into headshot-drive/, with an
// index of the file names, so each photo can be matched to its teacher by name and restyled.
//   node scripts/headshot-drive.mjs FOLDER_ID
import { writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const root = new URL('..', import.meta.url);
const out = new URL('headshot-drive/', root);
await mkdir(out, { recursive: true });
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const index = [];

async function list(folder, path = '', depth = 0) {
  const html = await (await fetch(`https://drive.google.com/embeddedfolderview?id=${folder}#list`, { signal: AbortSignal.timeout(30000) })).text();
  const entries = [...html.matchAll(/<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g)];
  if (!entries.length) console.log(`! Nothing listed in ${path || 'the folder'} (${html.length} characters returned; is the folder shared with "anyone with the link"?)`);
  for (const [, id, href, title] of entries) {
    const name = decode(title).trim();
    if (/\/folders\//.test(href)) { if (depth < 3) await list(id, `${path}${name}/`, depth + 1); continue; }
    index.push({ id, name: path + name });
  }
}
await list(process.argv[2]);
console.log(`Listed ${index.length} files.`);
let ok = 0;
for (const [i, f] of index.entries()) {
  if (!/\.(jpe?g|png|webp|heic|tiff?|gif|bmp)$/i.test(f.name)) { f.skipped = 'not a picture'; continue; }
  try {
    const res = await fetch(`https://drive.usercontent.google.com/download?id=${f.id}&export=download&confirm=t`, { signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(String(res.status));
    const bytes = Buffer.from(await res.arrayBuffer());
    f.file = `${String(i).padStart(3, '0')}.jpg`;
    await writeFile(new URL(f.file, out), await sharp(bytes, { failOn: 'none' }).rotate().resize(1400, 1400, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer());
    ok++;
  } catch (e) { f.skipped = e.message.split('\n')[0]; console.log(`! ${f.name}: ${f.skipped}`); }
}
await writeFile(new URL('index.json', out), JSON.stringify(index, null, 1));
console.log(`✓ ${ok} pictures fetched.`);
for (const f of index) console.log(`  ${f.file || '   —   '}  ${f.name}${f.skipped ? `  (${f.skipped})` : ''}`);
