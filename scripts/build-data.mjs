// Builds public/data/app.json: everything the app shows.
// Runs on a schedule (see .github/workflows/update.yml). Nothing is downloaded or re-hosted:
// each class keeps the audio link from the teacher's own feed.
//
//   node scripts/build-data.mjs             live: reads feeds, the Google Sheet (if set) and erub sites
//   node scripts/build-data.mjs --fixtures  offline sample from scripts/fixtures (for development)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseFeed } from './lib/rss.mjs';
import { topicFor, TOPICS } from './lib/topics.mjs';
import { parseBrooklyn, parseDeal } from './lib/erub.mjs';
import { parseCsv } from './lib/csv.mjs';
import { lock } from './lib/lock.mjs';

const FIXTURES = process.argv.includes('--fixtures');
const root = new URL('..', import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(';').map((s) => s.trim()).filter(Boolean));

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'VirtualMidrash/1.0 (+https://virtualmidrash.com)' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

// A tab of the Google Sheet (published as CSV) replaces the matching file in content/ when its link is set.
async function sheetOr(envName, fallback) {
  const url = process.env[envName];
  if (!url || FIXTURES) return fallback;
  try { return parseCsv(await get(url)); }
  catch (e) { console.warn(`! Sheet ${envName} unavailable, using content/ files: ${e.message}`); return fallback; }
}

const settings = await json('content/settings.json');
const warnings = [];

// ---- Teachers -------------------------------------------------------------
const teachers = (await sheetOr('SHEET_TEACHERS_URL', await json('content/teachers.json')))
  .filter((t) => t.id && t.name)
  .map((t) => ({ id: t.id, name: t.name, title: t.title || '', bio: t.bio || '', photo: t.photo || '', affiliations: list(t.affiliations), feed: t.feed || '', defaultTopic: t.defaultTopic || '' }));

// ---- Classes from each teacher's feed ---------------------------------------
const classes = [];
for (const t of teachers) {
  if (!t.feed) continue;
  try {
    let xml;
    if (FIXTURES) {
      const f = new URL(`scripts/fixtures/${t.id}.xml`, root);
      if (!existsSync(f)) continue;
      xml = await readFile(f, 'utf8');
    } else xml = await get(t.feed);
    const feed = parseFeed(xml);
    // Headshot supplied by SCA wins; otherwise fall back to the feed's profile picture.
    if (!t.photo) t.photo = feed.image;
    for (const it of feed.items.slice(0, settings.maxClassesPerTeacher)) {
      classes.push({
        id: `${t.id}:${it.guid}`, teacherId: t.id, title: it.title, date: it.date, durationSec: it.durationSec,
        audioUrl: it.audioUrl, image: it.image && it.image !== feed.image ? it.image : '', link: it.link,
        topic: topicFor(it.title, t.defaultTopic || null), kind: 'audio',
      });
    }
    console.log(`✓ ${t.name}: ${feed.items.length} classes`);
  } catch (e) {
    warnings.push(`Feed failed for ${t.name}: ${e.message}`);
    console.warn(`! ${t.name}: ${e.message}`);
  }
}
classes.sort((a, b) => b.date.localeCompare(a.date));

// ---- Weekly schedule --------------------------------------------------------
const code = process.env.COMMUNITY_CODE || '';
const sched = await json('content/schedule.json');
const weeklyRows = await sheetOr('SHEET_SCHEDULE_URL', sched.weekly);
const noticeRows = await sheetOr('SHEET_NOTICES_URL', sched.notices);
const secret = (v) => {
  if (!v) return '';
  if (!code) { warnings.push('A private address or Zoom link was left out because COMMUNITY_CODE is not set.'); return ''; }
  return lock(v, code);
};
const schedule = {
  series: settings.series,
  weekly: weeklyRows.filter((r) => r.day && r.title).map((r) => ({
    day: r.day, time: r.time || '', teacherId: r.teacherId || '', teacherName: r.teacherName || '', title: r.title,
    mode: r.mode || 'inperson', location: r.location || '',
    // Zoom links and home addresses never go out in the clear.
    lockedZoom: secret(r.zoomUrl), lockedAddress: secret(r.privateAddress),
  })),
  notices: noticeRows.filter((n) => n.date).map((n) => ({ date: n.date, text: n.text || '', dedication: n.dedication || '' })),
};

// ---- Community resources ------------------------------------------------------
const resources = (await sheetOr('SHEET_RESOURCES_URL', await json('content/resources.json')))
  .filter((r) => r.category && r.name)
  .map((r) => ({ category: r.category, name: r.name, area: r.area || '', note: r.note || '', lockedPhone: secret(r.phone) }));

// ---- Erub ---------------------------------------------------------------------
const now = new Date();
const erub = [];
for (const e of settings.erub) {
  let r = { status: 'unknown', date: null, fresh: false };
  if (!FIXTURES) {
    try { r = (e.id === 'brooklyn' ? parseBrooklyn : parseDeal)(await get(e.url), now); }
    catch (err) { warnings.push(`Erub check failed for ${e.name}: ${err.message}`); }
  }
  erub.push({ ...e, ...r });
}

const out = {
  generatedAt: now.toISOString(), topics: TOPICS, teachers, classes, schedule, resources, erub,
  resourceCategories: settings.resourceCategories,
  links: { giveLively: settings.giveLivelyUrl, officeEmail: settings.officeEmail, newsletter: settings.newsletterUrl },
  hasLockedDetails: !!code,
};
await mkdir(new URL('public/data/', root), { recursive: true });
await writeFile(new URL('public/data/app.json', root), JSON.stringify(out));
console.log(`\nWrote public/data/app.json — ${teachers.length} teachers, ${classes.length} classes, ${schedule.weekly.length} weekly classes.`);
[...new Set(warnings)].forEach((w) => console.warn('! ' + w));
// A total wipe-out (every feed failed) should fail the run so the last good site stays up.
if (!FIXTURES && teachers.some((t) => t.feed) && classes.length === 0) { console.error('No classes from any feed — refusing to publish an empty app.'); process.exit(1); }
