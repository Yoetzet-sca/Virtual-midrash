// Reads a podcast RSS feed (SoundCloud, Spotify/Anchor, or any standard feed) into plain class records.
import { XMLParser } from 'fast-xml-parser';

// Entities are decoded here rather than by the parser: long feeds (2,000+ episodes) exceed the parser's built-in entity limit.
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', cdataPropName: '#cdata', trimValues: true, processEntities: false, parseTagValue: false, parseAttributeValue: false });

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s) => String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return NAMED[e.toLowerCase()] ?? m;
});

const text = (v) => {
  if (v == null) return '';
  // CDATA is already literal text; everything else may carry entities.
  if (typeof v === 'object') return v['#cdata'] != null ? String(v['#cdata']).trim() : decode(v['#text'] ?? '').trim();
  return decode(v).trim();
};

export function durationToSeconds(v) {
  const s = text(v);
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  const parts = s.split(':').map(Number);
  if (parts.some(Number.isNaN)) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function parseFeed(xml) {
  const doc = parser.parse(xml);
  const ch = doc?.rss?.channel;
  if (!ch) throw new Error('Not an RSS feed');
  const items = [].concat(ch.item ?? []);
  const links = [].concat(ch['atom:link'] ?? []);
  return {
    title: text(ch.title),
    image: decode(ch['itunes:image']?.['@href'] || '') || text(ch.image?.url) || '',
    next: decode(links.find((l) => l['@rel'] === 'next')?.['@href'] || ''),
    items: items
      .map((it) => ({
        guid: text(it.guid) || text(it.link),
        title: text(it.title),
        date: new Date(text(it.pubDate)).toISOString(),
        durationSec: durationToSeconds(it['itunes:duration']),
        audioUrl: decode(it.enclosure?.['@url'] || ''),
        image: decode(it['itunes:image']?.['@href'] || ''),
        link: text(it.link),
      }))
      // Publish rule: title, date and audio are enough. Anything missing audio is skipped.
      .filter((it) => it.title && it.audioUrl),
  };
}

// Staff can paste an Apple Podcasts link instead of a raw feed address; Apple's directory tells us the real feed.
export const applePodcastId = (url) => String(url || '').match(/podcasts\.apple\.com\/.*?\/id(\d+)/)?.[1] || null;
export const appleLookupUrl = (id) => `https://itunes.apple.com/lookup?id=${id}&entity=podcast`;
export const feedFromAppleLookup = (jsonText) => JSON.parse(jsonText)?.results?.find((x) => x.feedUrl)?.feedUrl || null;
