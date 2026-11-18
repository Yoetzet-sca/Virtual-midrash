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
