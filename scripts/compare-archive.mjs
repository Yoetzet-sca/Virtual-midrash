// How much of the old Virtual Midrash's own archive (content/old-archive.json, exported 2026-11-20) is already in the
// new app from YouTube and the teachers' feeds? Prints a report; changes nothing.
import { readFile } from 'node:fs/promises';
const root = new URL('..', import.meta.url);
const old = JSON.parse(await readFile(new URL('content/old-archive.json', root), 'utf8'));
const app = JSON.parse(await readFile(new URL('public/data/app.json', root), 'utf8'));
const norm = (s) => s.toLowerCase().replace(/\(class #?\d+\)/g, ' ').replace(/\bsca\b/g, ' ').replace(/[^a-z0-9֐-׿]+/g, ' ').trim();
const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2));
const byTitle = new Map(), byDay = new Map();
for (const c of app.classes) {
  byTitle.set(norm(c.title), c);
  const d = c.date.slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(c);
}
const near = (o) => {
  if (!o.date) return null;
  const mine = words(o.title); if (mine.size < 2) return null;
  for (let k = -3; k <= 3; k++) {
    const d = new Date(Date.parse(o.date + 'T12:00:00Z') + k * 86400000).toISOString().slice(0, 10);
    for (const c of byDay.get(d) || []) { const w = words(c.title); const both = [...mine].filter((x) => w.has(x)).length; if (both / Math.min(mine.size, w.size) >= 0.75) return c; }
  }
  return null;
};
const kinds = {};
const missing = [];
for (const o of old) {
  const k = o.type || 'unknown'; kinds[k] ||= { all: 0, here: 0, hours: 0, missingHours: 0 };
  kinds[k].all++; kinds[k].hours += o.sec / 3600;
  const hit = byTitle.get(norm(o.title)) || near(o);
  if (hit) kinds[k].here++; else { kinds[k].missingHours += o.sec / 3600; missing.push(o); }
}
console.log(`Old archive: ${old.length} items uploaded to the old site.`);
for (const [k, v] of Object.entries(kinds)) console.log(`  ${k}: ${v.all} items (${Math.round(v.hours)} h) — ${v.here} already in the new app, ${v.all - v.here} only on the old site (${Math.round(v.missingHours)} h)`);
const byYear = {}; for (const o of missing) { const y = (o.date || '????').slice(0, 4); byYear[y] = (byYear[y] || 0) + 1; }
console.log(`  Only on the old site, by year: ${Object.entries(byYear).sort().map(([y, n]) => `${y}:${n}`).join(' ')}`);
console.log(`  Most played of those: ${missing.filter((o) => o.type !== 'document').sort((a, b) => b.plays - a.plays).slice(0, 12).map((o) => `"${o.title.slice(0, 50)}" (${o.date}, ${o.type}, ${o.plays} plays)`).join(' | ')}`);
console.log(`  A sample of those: ${missing.filter((o) => o.type !== 'document').filter((_, i) => i % 97 === 0).slice(0, 25).map((o) => `"${o.title.slice(0, 50)}" (${o.date}, ${o.type})`).join(' | ')}`);
