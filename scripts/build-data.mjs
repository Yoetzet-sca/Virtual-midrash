// Builds public/data/app.json: everything the app shows.
// Runs on a schedule (see .github/workflows/update.yml). Nothing is downloaded or re-hosted:
// each class keeps the audio link from the teacher's own feed.
//
//   node scripts/build-data.mjs             live: reads feeds, the Google Sheet (if set) and erub sites
//   node scripts/build-data.mjs --fixtures  offline sample from scripts/fixtures (for development)
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { parseFeed, applePodcastId, appleLookupUrl, feedFromAppleLookup, isSpotifyShow, spotifyShowName, appleSearchUrl, feedFromAppleSearch, feedFromPage, looksLikeFeed } from './lib/rss.mjs';
import { topicFor, TOPICS, topicName } from './lib/topics.mjs';
import { parseBrooklyn, parseDeal } from './lib/erub.mjs';
import { parseCsv, resourceRows, sameName } from './lib/csv.mjs';
import { lock } from './lib/lock.mjs';
import { applyOverrides } from './lib/overrides.mjs';
import { dafFor, weekInfo } from './lib/calendar.mjs';
import { channelIdFrom, feedUrl, parseYoutube, teacherForTitle, allVideos, samePerson } from './lib/youtube.mjs';

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
  .map((t) => ({ id: t.id, name: t.name, title: t.title || '', bio: t.bio || '', photo: t.photo || '', affiliations: list(t.affiliations), feed: t.feed || '', podcastName: t.podcastName || '', defaultTopic: t.defaultTopic || '' }));

// ---- The SCA's full list of rabbis and teachers (content/roster.json, from virtualmidrash.com) --------------------
// Used for two things: headshots and titles for the teachers above, and knowing exactly who a video's title names.
// Someone on the list who is not a teacher in the app yet gets a page the first time one of their classes turns up.
const roster = await json('content/roster.json').catch(() => []);
const slug = (name) => name.toLowerCase().replace(/\b(rabbi|mrs|ms|mr|dr)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const people = teachers.map((t) => ({ id: t.id, name: t.name }));
const waiting = new Map(); // id → roster entry, for people not in the app yet
for (const r of roster) {
  const t = teachers.find((x) => samePerson(x.name, r.name));
  if (t) { if (!t.photo) t.photo = r.photo; if (!t.title) t.title = r.title; continue; }
  const id = slug(r.name);
  if (!id || people.some((x) => x.id === id)) continue;
  people.push({ id, name: r.name }); waiting.set(id, r);
}
// Names a title or a video gives → the teacher's id, adding that person to the app if this is their first class.
function whoIs(text) {
  const id = teacherForTitle(text, people);
  if (id && waiting.has(id)) { const r = waiting.get(id); waiting.delete(id); teachers.push({ id, name: r.name, title: r.title, bio: '', photo: r.photo, affiliations: [], feed: '', podcastName: '', defaultTopic: '' }); }
  return id;
}

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
      if (isSpotifyShow(feedUrl)) {
        const name = t.podcastName || spotifyShowName(await get(feedUrl.split('?')[0]));
        if (!name) throw new Error('could not read the show name from Spotify');
        let found = await get(appleSearchUrl(name));
        feedUrl = feedFromAppleSearch(found, name);
        if (!feedUrl) {
          // Try a shorter search, and list what Apple has so a person can pick the right one.
          found = await get(appleSearchUrl(name.split(/\s+/).slice(0, 2).join(' ') + ' ' + t.name.split(/\s+/).slice(-2).join(' ')));
          feedUrl = feedFromAppleSearch(found, name);
          const names = (JSON.parse(found).results || []).map((x) => `${x.collectionName} — ${x.artistName}`).slice(0, 8);
          if (!feedUrl) console.warn(`  ${t.name}: Apple lists these similar shows: ${names.join(' | ') || 'none'}`);
        }
        if (!feedUrl) throw new Error(`no podcast named "${name}" found in Apple's directory — paste the Apple Podcasts link or feed address instead`);
        console.log(`  ${t.name}: Spotify show "${name}" resolves to ${feedUrl}`);
      }
      xml = await get(feedUrl);
      // A link to a web page about the podcast rather than the feed itself: find the feed inside the page.
      if (!looksLikeFeed(xml)) {
        const inner = feedFromPage(xml);
        if (!inner) throw new Error('that link is a web page with no podcast feed in it');
        console.log(`  ${t.name}: page link resolves to ${inner}`);
        xml = await get(inner);
      }
    }
    const feed = parseFeed(xml);
    // Headshot supplied by SCA wins; otherwise fall back to the feed's profile picture.
    if (!t.photo) t.photo = feed.image;
    for (const it of feed.items.slice(0, settings.maxClassesPerTeacher || Infinity)) {
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
    let all, whole = false;
    if (FIXTURES) {
      const f = new URL('scripts/fixtures/youtube.xml', root);
      if (!existsSync(f)) continue;
      all = parseYoutube(await readFile(f, 'utf8'));
    } else {
      const channelId = y.channelId || channelIdFrom(await get(y.url));
      if (!channelId) throw new Error('could not find the channel id — set "channelId" in content/settings.json');
      // With a YouTube API key the whole channel is listed; without one (or if the API fails) the public feed's 15 newest.
      if (process.env.YOUTUBE_API_KEY) {
        try { all = await allVideos(channelId, process.env.YOUTUBE_API_KEY); whole = true; }
        catch (e) { warnings.push(`YouTube ${y.url}: ${e.message} — showing only the newest videos`); }
      }
      if (!all) all = parseYoutube(await get(feedUrl(channelId)));
    }
    // Videos titled in Arabic are left out for now (SCA's choice).
    const kept = settings.skipArabicTitles ? all.filter((v) => !/[\u0600-\u06FF\u0750-\u077F]/.test(v.title)) : all;
    if (kept.length < all.length) console.log(`  (left out ${all.length - kept.length} videos with Arabic titles)`);
    const videos = whole ? kept : kept.slice(0, settings.maxVideosPerChannel || 15);
    for (const v of videos) {
      // A teacher's own channel files everything under that teacher; a shared channel goes by the name in the title.
      let teacherId = (y.teacherId && teachers.some((t) => t.id === y.teacherId) ? y.teacherId : null) || whoIs(v.title);
      if (!teacherId) {
        teacherId = 'sca';
        if (!teachers.some((t) => t.id === 'sca')) teachers.push({ id: 'sca', name: 'Sephardic Community Alliance', title: 'Classes and events from the SCA', bio: '', photo: '', affiliations: [], feed: '', defaultTopic: '' });
      }
      classes.push({ id: `yt:${v.youtubeId}`, teacherId, title: v.title, date: v.date, durationSec: v.durationSec || 0, audioUrl: '', youtubeId: v.youtubeId, image: v.image, link: v.link, topic: topicFor(v.title, null), kind: 'video', ...(y.aiSummaries ? { ai: true } : {}) });
    }
    if (!y.teacherId) {
      const mine = classes.filter((c) => c.kind === 'video' && videos.some((v) => `yt:${v.youtubeId}` === c.id));
      const by = new Map(); for (const c of mine) by.set(c.teacherId, (by.get(c.teacherId) || 0) + 1);
      const named = [...by.entries()].filter(([id]) => id !== 'sca').sort((a, b) => b[1] - a[1]);
      console.log(`  Filed by the name in the title: ${mine.length - (by.get('sca') || 0)} videos under ${named.length} people; ${by.get('sca') || 0} left with the SCA (no single name in the title).`);
      console.log(`  ${named.map(([id, n]) => `${teachers.find((x) => x.id === id)?.name} ${n}`).join(' · ')}`);
    }
    console.log(`✓ YouTube ${y.url}: ${videos.length} videos${whole ? ' (whole channel)' : ' (newest only)'}` + (videos[0] ? ` — newest: "${videos[0].title.slice(0, 60)}" (${videos[0].date.slice(0, 10)})` : ''));
  } catch (e) {
    warnings.push(`YouTube failed for ${y.url}: ${e.message}`);
    console.warn(`! YouTube ${y.url}: ${e.message}`);
  }
}
// Links being checked before they are assigned to a teacher (content/settings.json → probe). Nothing here reaches the app.
for (const url of FIXTURES ? [] : settings.probe || []) {
  try {
    let text = await get(url), feedUrl = url;
    if (!looksLikeFeed(text)) { feedUrl = feedFromPage(text); if (!feedUrl) throw new Error('no feed found in the page'); text = await get(feedUrl); }
    const f = parseFeed(text);
    console.log(`? Probe ${url} → ${feedUrl} — "${f.title}", ${f.items.length} classes, newest "${f.items[0]?.title}" (${f.items[0]?.date.slice(0, 10)})`);
  } catch (e) { console.log(`? Probe ${url} failed: ${e.message}`); }
}
classes.sort((a, b) => b.date.localeCompare(a.date));
// AI summaries (made by scripts/ai.mjs): a topic where the title gave none, the parts of the class, and the search index.
const sidOf = (id) => createHash('sha1').update(id).digest('hex').slice(0, 10);
const search = [];
{
  const ai = new Map();
  for (const f of await readdir(new URL('content/ai/', root)).catch(() => [])) {
    if (f.endsWith('.json')) try { ai.set(f.slice(0, -5), JSON.parse(await readFile(new URL('content/ai/' + f, root), 'utf8'))); } catch { warnings.push(`Could not read content/ai/${f}`); }
  }
  let topics = 0, moved = 0;
  for (const c of classes) {
    const a = ai.get(sidOf(c.id));
    if (!a || a.quality === 'poor') continue;
    // A channel video filed under the SCA itself moves to its teacher once the video has named who is teaching.
    if (c.teacherId === 'sca' && a.speaker) { const who = whoIs(a.speaker); if (who) { c.teacherId = who; moved++; } }
    if (!c.topic && TOPICS.includes(topicName(a.topic))) { c.topic = topicName(a.topic); topics++; }
    c.summary = a.summary;
    if (a.chapters?.length) c.chapters = a.chapters.map((x) => [x.at, x.title]);
    search.push({ i: sidOf(c.id), m: a.summary, s: (a.subjects || []).join('; '), q: (a.questions || []).join(' '), c: (a.chapters || []).map((x) => x.about || ''), t: a.terms || '' });
  }
  if (moved) console.log(`✓ ${moved} SCA-channel videos filed under the teacher named in the video`);
  if (ai.size) console.log(`✓ AI summaries: ${search.length} classes searchable by what was said; ${topics} given a topic the title did not show`);
}
// Staff corrections: fix a topic or hide a class.
{
  const fixed = applyOverrides(classes, await sheetOr('SHEET_OVERRIDES_URL', await json('content/overrides.json')));
  if (fixed.length !== classes.length) console.log(`✓ Overrides hid ${classes.length - fixed.length} classes`);
  classes.splice(0, classes.length, ...fixed);
}
for (const c of classes) c.topic = topicName(c.topic);
// A short, link-safe id for each class's share page.
for (const c of classes) c.sid = sidOf(c.id);

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
  weekly: weeklyRows.filter((r) => r.day && r.title).map((r) => ({
    day: r.day, time: r.time || '', teacherId: r.teacherId || '', teacherName: r.teacherName || '', title: r.title,
    mode: r.mode || 'inperson', location: r.location || '',
    // Zoom links and home addresses never go out in the clear.
    lockedZoom: secret(r.zoomUrl), lockedAddress: secret(r.privateAddress),
  })),
  notices: noticeRows.filter((n) => n.date).map((n) => ({ date: n.date, text: n.text || '', dedication: n.dedication || '' })),
};

// ---- Community resources ------------------------------------------------------
// Listed in content/resources.json (organizations with public numbers) and, when SHEET_RESOURCES_URL is set, read from
// the SCA Community Resources Google Sheet, one tab per category. People's own numbers and emails are never stored in
// this repository: they come from the Sheet at build time and are locked with the community code.
async function resourceSheet() {
  const link = process.env.SHEET_RESOURCES_URL;
  if (!link || FIXTURES) return [];
  const id = link.match(/\/spreadsheets\/d\/([\w-]+)/)?.[1];
  if (!id || /\/pub\?|output=csv/.test(link)) return parseCsv(await get(link)); // a single published CSV tab
  const rows = [];
  for (const tab of settings.resourceSheetTabs || settings.resourceCategories) {
    try { rows.push(...resourceRows(await get(`https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(tab)}`), settings.resourceCategories)); }
    catch (e) { warnings.push(`Resources tab "${tab}" could not be read: ${e.message.replace(id, '…')}`); }
  }
  return rows;
}
const open = new Set((settings.openResourceCategories || []).map(sameName));
const seenResource = new Set();
const resources = [...(await resourceSheet().catch((e) => { warnings.push('Resources sheet unavailable: ' + e.message.split(' ')[0]); return []; })), ...(await json('content/resources.json'))]
  .filter((r) => r.category && r.name)
  .filter((r) => { const k = sameName(r.category) + '|' + sameName(r.name); if (seenResource.has(k)) return false; seenResource.add(k); return true; })
  .map((r) => {
    // Until SCA sets a community code, every listing is shown openly (SCA's choice); with a code, people's own details are locked.
    const isOpen = !code || open.has(sameName(r.category));
    return { category: r.category, name: r.name, area: r.area || '', note: r.note || '', open: isOpen,
      phone: isOpen ? r.phone || '' : '', email: isOpen ? r.email || '' : '', lockedPhone: isOpen ? '' : secret(r.phone), lockedEmail: isOpen ? '' : secret(r.email) };
  });
console.log(`✓ Community resources: ${resources.length} listings (${resources.filter((r) => !r.open).length} with details locked by the community code)`);

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

// ---- This week's shortcuts ------------------------------------------------------
// Dates are New York calendar dates. The daf is listed for several days so the app is right at midnight between rebuilds.
const nyDate = (offset = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(now.getTime() + offset * 86400000));
let shortcuts = { daf: {}, perasha: null, holiday: null };
try {
  for (let i = -1; i <= 4; i++) shortcuts.daf[nyDate(i)] = dafFor(nyDate(i));
  Object.assign(shortcuts, weekInfo(nyDate(0)));
  console.log(`✓ Shortcuts: daf ${shortcuts.daf[nyDate(0)].tractate} ${shortcuts.daf[nyDate(0)].page}, perasha ${shortcuts.perasha?.name}, next holiday ${shortcuts.holiday?.name} (${shortcuts.holiday?.date})`);
} catch (e) { warnings.push(`Shortcuts failed: ${e.message}`); }

// ---- Schools and shuls -----------------------------------------------------------------------------
// A teacher with no affiliations listed gets them from their title ("Rabbi, Congregation Beth Torah"), named the way
// the old site's affiliates list names them. Yeshivah of Flatbush is not an SCA affiliate but is where many teach.
const AFFILIATION = [
  [/beth torah/i, 'Beth Torah'], [/mikdash eliyahu/i, 'Mikdash Eliyahu'], [/barkai/i, 'Barkai Yeshivah'], [/kol israel/i, 'Kol Israel Congregation'],
  [/b[e]?nei yitz?c?hak/i, 'Bnei Yitzhak'], [/ahaba ve ahva/i, 'Ahaba Ve Ahva'], [/moreshet yerushalayim/i, 'Yeshivat Moreshet Yerushalayim'],
  [/sephardic rabbinical college/i, 'Sephardic Rabbinical College'], [/sephardic synagogue(?! of elberon)/i, 'Sephardic Synagogue'], [/hillel yeshiva/i, 'Hillel Yeshivah'],
  [/magen david yeshiva/i, 'Magen David Yeshivah'], [/magen david,? (of )?west deal/i, 'Magen David of West Deal'], [/magen david of manhattan/i, 'Magen David of Manhattan'],
  [/safra synagogue of nj/i, 'Edmond J. Safra Synagogue of Deal'], [/edmond j\.? safra synagogue nyc/i, 'Congregation Beit Edmond'], [/midreshet eshel/i, 'Eshel Sephardic Midrasha'],
  [/allegra franco/i, 'Allegra Franco Bet Midrash & Career Fellowship'], [/ohel (shlomo and david|david and shlomo)/i, 'Ohel David and Shlomo Congregation of Manhattan Beach'],
  [/bet rachel/i, 'Bet Rachel'], [/tanach study/i, 'Tanach Study'], [/sam school|sephardic academy of manhattan/i, 'Sephardic Academy of Manhattan'],
  [/yeshivah? of flatbush|flatbush (high school|hs|es|middle)/i, 'Yeshivah of Flatbush'],
];
for (const t of teachers) if (!t.affiliations.length && t.title) t.affiliations = [...new Set(AFFILIATION.filter(([re]) => re.test(t.title)).map((x) => x[1]))];

const out = {
  shortcuts,
  generatedAt: now.toISOString(), topics: TOPICS, teachers, classes, schedule, resources, erub,
  resourceCategories: settings.resourceCategories,
  analytics: settings.analytics || null,
  links: { giveLively: settings.giveLivelyUrl, officeEmail: settings.officeEmail, newsletter: settings.newsletterUrl, addressContact: settings.addressContact || null, connect: settings.connect || [] },
  hasLockedDetails: !!code,
};
await mkdir(new URL('public/data/', root), { recursive: true });
await writeFile(new URL('public/data/app.json', root), JSON.stringify(out));
// Loaded by the phone only when someone searches.
await writeFile(new URL('public/data/search.json', root), JSON.stringify(search.filter((s) => classes.some((c) => c.sid === s.i))));
console.log(`\nWrote public/data/app.json — ${teachers.length} teachers, ${classes.length} classes, ${schedule.weekly.length} weekly classes.`);
[...new Set(warnings)].forEach((w) => console.warn('! ' + w));
// A total wipe-out (every feed failed) should fail the run so the last good site stays up.
if (!FIXTURES && teachers.some((t) => t.feed) && classes.length === 0) { console.error('No classes from any feed — refusing to publish an empty app.'); process.exit(1); }
