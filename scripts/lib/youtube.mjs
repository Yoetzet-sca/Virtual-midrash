// Reads a YouTube channel's public video feed. Videos play in YouTube's own player; nothing is copied.
import { XMLParser } from 'fast-xml-parser';
import { decode } from './rss.mjs';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', processEntities: false, parseTagValue: false, parseAttributeValue: false });

// A channel page (youtube.com/c/Name or /@name) names its channel id in a few places.
export function channelIdFrom(html) {
  const m = html.match(/feeds\/videos\.xml\?channel_id=(UC[\w-]{22})/) || html.match(/"(?:channelId|externalId|browseId)":"(UC[\w-]{22})"/) || html.match(/youtube\.com\/channel\/(UC[\w-]{22})/);
  return m ? m[1] : null;
}
export const feedUrl = (channelId) => `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

export function parseYoutube(xml) {
  const feed = parser.parse(xml)?.feed;
  if (!feed) throw new Error('Not a YouTube feed');
  return [].concat(feed.entry ?? []).map((e) => {
    const id = String(e['yt:videoId'] || '').trim();
    return { youtubeId: id, title: decode(e.title ?? '').trim(), date: new Date(e.published).toISOString(), image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, link: `https://www.youtube.com/watch?v=${id}` };
  }).filter((v) => /^[\w-]{11}$/.test(v.youtubeId) && v.title);
}

// ---- Whose class is it? ------------------------------------------------------------------------
// A channel video is filed under a person only when its title names that person. Getting this wrong puts a class under
// the wrong rabbi, so the rule is strict:
//   • first name and family name together always count ("by Rabbi Joseph Dweck"), allowing for everyday forms of a
//     first name (Joey / Joseph) and for middle names (Victoria Chabot Berman);
//   • a family name alone counts only straight after a title ("Rabbi Lati"), only if that title fits the person, and
//     only if nobody else on the whole SCA list of rabbis and teachers has that family name;
//   • anything else is left under the SCA itself.
const HONORIFIC = new Set(['rabbi', 'rav', 'hacham', 'haham', 'mrs', 'ms', 'mr', 'dr', 'hazzan', 'professor', 'prof', 'capt', 'idf']);
const SAME_FIRST = [['joey', 'joe', 'joseph'], ['ike', 'ikey', 'isaac'], ['ricky', 'richard'], ['abe', 'abraham', 'avraham'], ['moey', 'moe', 'moses']];
const sameFirst = (a, b) => a === b || SAME_FIRST.some((g) => g.includes(a) && g.includes(b));
const clean = (s) => s.toLowerCase().replace(/\ba"?h\b|r\.n\.|m\.s\./g, ' ').replace(/[^a-z\s()]/g, ' ');
// "Rabbi Dr. Henry (Ronnie) Hasson" → firsts [henry, ronnie], rest [], last hasson, titles [rabbi, dr]
export function nameParts(name) {
  const all = clean(name).replace(/[()]/g, ' ').split(/\s+/).filter(Boolean);
  const nick = (clean(name).match(/\(([^)]+)\)/)?.[1] || '').trim().split(/\s+/).filter(Boolean);
  const titles = all.filter((w) => HONORIFIC.has(w));
  const p = all.filter((w) => !HONORIFIC.has(w) && !nick.includes(w));
  if (!p.length) return null;
  return { firsts: p.length > 1 ? [p[0], ...nick] : nick, middle: p.slice(1, -1), last: p[p.length - 1], titles };
}
export const samePerson = (a, b) => {
  const x = nameParts(a), y = nameParts(b);
  return !!x && !!y && x.last === y.last && x.firsts.some((f) => y.firsts.some((g) => sameFirst(f, g)));
};
const fits = (said, titles) => (said === 'rabbi' || said === 'rav' || said === 'hacham' || said === 'haham' ? titles.some((t) => ['rabbi', 'rav', 'hacham', 'haham'].includes(t))
  : said === 'mrs' || said === 'ms' ? titles.some((t) => t === 'mrs' || t === 'ms')
  : said === 'mr' ? titles.includes('mr') || !titles.length
  : said === 'dr' ? titles.includes('dr') : true);

export function teacherForTitle(title, people) {
  const words = clean(title).replace(/[()]/g, ' ').split(/\s+/).filter(Boolean);
  const known = people.map((x) => ({ x, n: nameParts(x.name) })).filter((k) => k.n);
  const full = new Set(), alone = new Set();
  words.forEach((w, i) => {
    for (const k of known) {
      if (w !== k.n.last) continue;
      const before = words[i - 1];
      const withMiddle = k.n.middle.length && k.n.middle.every((m, j) => words[i - k.n.middle.length + j] === m) ? words[i - k.n.middle.length - 1] : undefined;
      if ([before, withMiddle].some((f) => f && k.n.firsts.some((g) => sameFirst(f, g)))) full.add(k.x.id);
      else if (before && HONORIFIC.has(before) && fits(before, k.n.titles)) alone.add(k.x.id);
    }
  });
  if (full.size === 1) return [...full][0];
  if (full.size > 1) return null;
  if (alone.size !== 1) return null;
  const id = [...alone][0], last = known.find((k) => k.x.id === id).n.last;
  return known.filter((k) => k.n.last === last).length === 1 ? id : null; // someone else shares the family name: do not guess
}

// ---- The whole channel, through YouTube's own Data API (needs a free API key) -------------------
// The public feed above only ever lists a channel's 15 newest videos; the API lists every one, with its length.
export const isoSeconds = (d) => {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(d || '');
  return m ? (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + +(m[4] || 0) : 0;
};

// One page of a channel's uploads + the matching details → the app's video records.
// Left out: private or deleted videos, live streams that have not happened yet, and Shorts-length clips (under a minute).
export function videosFromApi(items, details) {
  const info = new Map(details.map((d) => [d.id, d]));
  return items.map((it) => {
    const id = it.contentDetails?.videoId || it.snippet?.resourceId?.videoId || '';
    const d = info.get(id);
    const thumbs = it.snippet?.thumbnails || {};
    return {
      youtubeId: id, title: String(it.snippet?.title || '').trim(),
      date: new Date(it.contentDetails?.videoPublishedAt || it.snippet?.publishedAt || 0).toISOString(),
      image: (thumbs.high || thumbs.medium || thumbs.default)?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      link: `https://www.youtube.com/watch?v=${id}`,
      durationSec: isoSeconds(d?.contentDetails?.duration), live: d?.snippet?.liveBroadcastContent || 'none', found: !!d,
    };
  }).filter((v) => /^[\w-]{11}$/.test(v.youtubeId) && v.found && v.title && !/^(Private|Deleted) video$/.test(v.title) && v.live === 'none' && v.durationSec >= 60)
    .map(({ live, found, ...v }) => v);
}

export async function allVideos(channelId, key, { maxPages = 100 } = {}) {
  const call = async (path, params) => {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...params, key })}`, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      let why = ''; try { why = (await res.json()).error?.message || ''; } catch { /* no details */ }
      throw new Error(`YouTube API ${res.status} on ${path}${why ? ': ' + why.replaceAll(key, '…') : ''}`); // never put the key in a log
    }
    return res.json();
  };
  const uploads = 'UU' + channelId.slice(2); // every channel's "uploads" playlist has the channel's id with UU in front
  const out = [];
  let pageToken;
  for (let page = 0; page < maxPages; page++) {
    const list = await call('playlistItems', { part: 'snippet,contentDetails', playlistId: uploads, maxResults: '50', ...(pageToken ? { pageToken } : {}) });
    const ids = (list.items || []).map((it) => it.contentDetails?.videoId).filter(Boolean);
    const details = ids.length ? (await call('videos', { part: 'contentDetails,snippet', id: ids.join(','), maxResults: '50' })).items || [] : [];
    out.push(...videosFromApi(list.items || [], details));
    pageToken = list.nextPageToken;
    if (!pageToken) break;
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
