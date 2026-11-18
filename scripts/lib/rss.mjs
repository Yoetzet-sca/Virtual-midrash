// Reads a podcast RSS feed (SoundCloud, Spotify/Anchor, or any standard feed) into plain class records.
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', cdataPropName: '#cdata', trimValues: true });

const text = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') return String(v['#cdata'] ?? v['#text'] ?? '').trim();
  return String(v).trim();
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
    image: ch['itunes:image']?.['@href'] || text(ch.image?.url) || '',
    next: links.find((l) => l['@rel'] === 'next')?.['@href'] || '',
    items: items
      .map((it) => ({
        guid: text(it.guid) || text(it.link),
        title: text(it.title),
        date: new Date(text(it.pubDate)).toISOString(),
        durationSec: durationToSeconds(it['itunes:duration']),
        audioUrl: it.enclosure?.['@url'] || '',
        image: it['itunes:image']?.['@href'] || '',
        link: text(it.link),
      }))
      // Publish rule: title, date and audio are enough. Anything missing audio is skipped.
      .filter((it) => it.title && it.audioUrl),
  };
}
