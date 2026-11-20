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

// A channel video belongs to a teacher when the title names them ("Mrs. Vivien Hidary – Vayelech").
export function teacherForTitle(title, teachers) {
  const t = ' ' + title.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
  const parts = (name) => name.toLowerCase().replace(/^(rabbi|mrs\.?|ms\.?|mr\.?|hacham)\s+/, '').replace(/^dr\.?\s+/, '').replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
  const has = (w) => t.includes(' ' + w + ' ');
  const byLast = teachers.filter((x) => { const p = parts(x.name); return p.length && has(p[p.length - 1]); });
  if (byLast.length === 1) return byLast[0].id;
  const byBoth = byLast.filter((x) => has(parts(x.name)[0]));
  return byBoth.length === 1 ? byBoth[0].id : null;
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
