// After the site is built, writes one small page per class at dist/c/<id>.html.
// When a class is shared, WhatsApp and Messages read this page to show the title and picture,
// and anyone who taps the link is sent straight to that class in the app.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const dataFile = new URL('dist/data/app.json', root);
if (!existsSync(dataFile)) { console.log('No data yet; skipping share pages.'); process.exit(0); }
const site = (process.env.SITE_URL || 'https://yoetzet-sca.github.io/Virtual-midrash/').replace(/\/?$/, '/');
const data = JSON.parse(await readFile(dataFile, 'utf8'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sharePage(c, teacher, siteUrl) {
  const title = c.title;
  const by = [...new Set([teacher?.name, c.topic, 'Virtual Midrash', 'Sephardic Community Alliance'].filter(Boolean))].join(' · ');
  // WhatsApp and iMessage show about two lines: the summary of the class if there is one, then who and where.
  const short = c.summary && (c.summary.length > 180 ? c.summary.slice(0, 180).replace(/\s+\S*$/, '') + '…' : c.summary);
  const about = short ? `${short} — ${teacher?.name || 'Virtual Midrash'}` : by;
  const own = teacher?.photo?.startsWith('./') ? siteUrl + teacher.photo.slice(2) : teacher?.photo; // a link preview needs a full address
  const image = c.image || own || siteUrl + 'brand/icon-512.png';
  const target = '../#/class/' + encodeURIComponent(c.id);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="Virtual Midrash">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(about)}">
<meta name="description" content="${esc(about)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(siteUrl + 'c/' + c.sid + '.html')}">
<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)})</script>
</head><body style="background:#0b2540;color:#fff;font-family:sans-serif;padding:24px"><p>${esc(title)}</p><p><a style="color:#f26a2e" href="${esc(target)}">Open in Virtual Midrash</a></p></body></html>`;
}

await mkdir(new URL('dist/c/', root), { recursive: true });
let n = 0;
for (const c of data.classes) {
  if (!c.sid) continue;
  await writeFile(new URL(`dist/c/${c.sid}.html`, root), sharePage(c, data.teachers.find((t) => t.id === c.teacherId), site));
  n++;
}
console.log(`Wrote ${n} share pages.`);
