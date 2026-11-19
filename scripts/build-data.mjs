// Builds public/data/app.json: everything the app shows.
// Runs on a schedule (see .github/workflows/update.yml). Nothing is downloaded or re-hosted:
// each class keeps the audio link from the teacher's own feed.
//
//   node scripts/build-data.mjs             live: reads feeds, the Google Sheet (if set) and erub sites
//   node scripts/build-data.mjs --fixtures  offline sample from scripts/fixtures (for development)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { parseFeed, applePodcastId, appleLookupUrl, feedFromAppleLookup } from './lib/rss.mjs';
import { topicFor, TOPICS } from './lib/topics.mjs';
import { parseBrooklyn, parseDeal } from './lib/erub.mjs';
import { parseCsv } from './lib/csv.mjs';
import { lock } from './lib/lock.mjs';
import { applyOverrides } from './lib/overrides.mjs';
import { channelIdFrom, feedUrl, parseYoutube, teacherForTitle } from './lib/youtube.mjs';

const FIXTURES = process.argv.includes('--fixtures');
const root = new URL('..', import.meta.url);
const json = async (p) => JSON.parse(await readFile(new URL(p, root), 'utf8'));
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(';').map((s) => s.trim()).filter(Boolean));

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; VirtualMidrash/1.0; +https://virtualmidrash.com)', 'accept-language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(30000) });
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
    } else {
      let feedUrl = t.feed;
      const appleId = applePodcastId(feedUrl);
      if (appleId) {
        feedUrl = feedFromAppleLookup(await get(appleLookupUrl(appleId)));
        if (!feedUrl) throw new Error('Apple Podcasts did not list a feed for this show');
        console.log(`  ${t.name}: Apple Podcasts link resolves to ${feedUrl}`);
      }
      xml = await get(feedUrl);
    }
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

// ---- Videos from YouTube channels ---------------------------------------------
// Each video is filed under the teacher named in its title; otherwise under the SCA itself.
for (const y of settings.youtube || []) {
  try {
    let xml;
    if (FIXTURES) {
      const f = new URL('scripts/fixtures/youtube.xml', root);
      if (!existsSync(f)) continue;
      xml = await readFile(f, 'utf8');
    } else {
      const channelId = y.channelId || channelIdFrom(await get(y.url));
      if (!channelId) throw new Error('could not find the channel id — set "channelId" in content/settings.json');
      xml = await get(feedUrl(channelId));
    }
    const videos = parseYoutube(xml).slice(0, settings.maxVideosPerChannel || 15);
    for (const v of videos) {
      // A teacher's own channel files everything under that teacher; a shared channel goes by the name in the title.
      let teacherId = (y.teacherId && teachers.some((t) => t.id === y.teacherId) ? y.teacherId : null) || teacherForTitle(v.title, teachers);
      if (!teacherId) {
        teacherId = 'sca';
        if (!teachers.some((t) => t.id === 'sca')) teachers.push({ id: 'sca', name: 'Sephardic Community Alliance', title: 'Classes and events from the SCA', bio: '', photo: '', affiliations: [], feed: '', defaultTopic: '' });
      }
      classes.push({ id: `yt:${v.youtubeId}`, teacherId, title: v.title, date: v.date, durationSec: 0, audioUrl: '', youtubeId: v.youtubeId, image: v.image, link: v.link, topic: topicFor(v.title, null), kind: 'video' });
    }
    console.log(`✓ YouTube ${y.url}: ${videos.length} videos` + (videos[0] ? ` — newest: "${videos[0].title.slice(0, 60)}" (${videos[0].date.slice(0, 10)})` : ''));
  } catch (e) {
    warnings.push(`YouTube failed for ${y.url}: ${e.message}`);
    console.warn(`! YouTube ${y.url}: ${e.message}`);
  }
}
classes.sort((a, b) => b.date.localeCompare(a.date));
// Staff corrections: fix a topic or hide a class.
{
  const fixed = applyOverrides(classes, await sheetOr('SHEET_OVERRIDES_URL', await json('content/overrides.json')));
  if (fixed.length !== classes.length) console.log(`✓ Overrides hid ${classes.length - fixed.length} classes`);
  classes.splice(0, classes.length, ...fixed);
}
// A short, link-safe id for each class's share page.
for (const c of classes) c.sid = createHash('sha1').update(c.id).digest('hex').slice(0, 10);

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
  console.log(`${r.status === 'unknown' ? '!' : '✓'} Erub ${e.short}: ${r.status}${r.date ? ' (' + r.date + ')' : ''}${r.fresh ? '' : ' — not shown as current'}`);
}

const out = {
  generatedAt: now.toISOString(), topics: TOPICS, teachers, classes, schedule, resources, erub,
  resourceCategories: settings.resourceCategories,
  analytics: settings.analytics || null,
  links: { giveLively: settings.giveLivelyUrl, officeEmail: settings.officeEmail, newsletter: settings.newsletterUrl, addressContact: settings.addressContact || null },
  hasLockedDetails: !!code,
};
await mkdir(new URL('public/data/', root), { recursive: true });
await writeFile(new URL('public/data/app.json', root), JSON.stringify(out));
console.log(`\nWrote public/data/app.json — ${teachers.length} teachers, ${classes.length} classes, ${schedule.weekly.length} weekly classes.`);
[...new Set(warnings)].forEach((w) => console.warn('! ' + w));
// A total wipe-out (every feed failed) should fail the run so the last good site stays up.
if (!FIXTURES && teachers.some((t) => t.feed) && classes.length === 0) { console.error('No classes from any feed — refusing to publish an empty app.'); process.exit(1); }
