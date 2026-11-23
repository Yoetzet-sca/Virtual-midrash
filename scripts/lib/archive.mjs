// The old Virtual Midrash's own archive: classes that were uploaded straight into the old system (content/old-archive.json,
// from SCA's export of 2026-11-20, with the teacher of each class read from the old back end). Two uses:
//   • telling who gave a class that the new app already has from YouTube but could not attribute from its title;
//   • listing the classes that exist nowhere else, played from the old system's storage exactly as the old site plays them.
import { samePerson } from './youtube.mjs';

export const STORAGE = 'https://sca-platform.s3.amazonaws.com/uploads/content/media_content/';
const norm = (s) => String(s).toLowerCase().replace(/\(class #?\d+\)/g, ' ').replace(/\bsca\b/g, ' ').replace(/[^a-z0-9֐-׿]+/g, ' ').trim();
const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2));
// "SCA Minhag of the week #302: ..." → 302
export const minhagNumber = (title) => { const m = /minhag of the week\D{0,4}(\d{1,3})\b/i.exec(title); return m ? Number(m[1]) : null; };
export const youtubeIdOf = (link) => (/[?&]v=([\w-]{11})/.exec(link || '') || /youtu\.be\/([\w-]{11})/.exec(link || '') || [])[1] || null;

// "SCA 'I Remember' Yom Yerushalayim 2020: Mr. Harry Catton" names its speaker. An old item by someone else with a
// similar title ("Yom Yerushalayim: I Remember", Rabbi Moshe Shamah) is a different talk in the same series, not this one.
const NAMED = /\b(?:Rabbi|Hacham|Mr\.|Mrs\.|Ms\.|Dr\.)(?:\s+Dr\.)?((?:\s+[A-Z][\w’'-]+){2,3})/g;
export const namesSomeoneElse = (title, by) => {
  const found = [...String(title).matchAll(NAMED)].map((m) => m[0]);
  return found.length > 0 && (!by || !found.some((n) => samePerson(n, by)));
};

// Pairs each old item with the class in `classes` that is the same recording, if there is one.
// `otherTeacher(c, by)` says the class is already filed under someone who is not `by` (two teachers each gave
// "Bava Kama 104"; they are different classes however alike the titles and lengths).
export function pairUp(old, classes, otherTeacher = () => false) {
  const byTitle = new Map(), byDay = new Map(), byYoutube = new Map(), byEpisode = new Map();
  for (const c of classes) {
    byTitle.set(norm(c.title), c);
    const d = c.date.slice(0, 10); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(c);
    if (c.youtubeId) byYoutube.set(c.youtubeId, c);
    const n = minhagNumber(c.title); if (n != null) byEpisode.set(n, c);
  }
  const near = (o) => {
    if (!o.date) return null;
    const mine = words(o.title); if (mine.size < 2) return null;
    for (let k = -3; k <= 3; k++) {
      const d = new Date(Date.parse(o.date + 'T12:00:00Z') + k * 86400000).toISOString().slice(0, 10);
      for (const c of byDay.get(d) || []) { if (namesSomeoneElse(c.title, o.by)) continue; const w = words(c.title); const both = [...mine].filter((x) => w.has(x)).length; if (both / Math.min(mine.size, w.size) >= 0.75) return c; }
    }
    return null;
  };
  // The old site often re-uploaded a YouTube video years later under a shorter title ("The Unsung Hero of Hanukkah" for
  // "Mrs. Adele Tawil: The Unsung Hero of Hanukkah"). The dates are far apart, but two things give it away:
  // the uploaded file still carries the video's title, or the titles share their words and the two run the same length.
  const byWord = new Map();
  for (const c of classes) for (const w of words(c.title)) { if (!byWord.has(w)) byWord.set(w, []); byWord.get(w).push(c); }
  const fileTitle = (o) => norm(decodeURIComponent(String(o.file || '').split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '').replace(/_+/g, ' '));
  const sameLength = (o) => {
    if (!o.sec || o.sec < 60) return null;
    const who = words(o.by || '');
    const mine = new Set([...words(o.title)].filter((w) => !who.has(w))); if (mine.size < 2) return null;
    const seen = new Set();
    for (const w of mine) for (const c of byWord.get(w) || []) {
      if (seen.has(c)) continue; seen.add(c);
      if (!c.durationSec || Math.abs(c.durationSec - o.sec) > Math.max(3, o.sec * 0.01)) continue;
      if (namesSomeoneElse(c.title, o.by) || otherTeacher(c, o.by)) continue;
      const theirs = new Set([...words(c.title)].filter((x) => !who.has(x)));
      const both = [...mine].filter((x) => theirs.has(x)).length;
      if (both >= 2 && both / Math.min(mine.size, theirs.size) >= 0.75) return c;
    }
    return null;
  };
  const pairs = new Map(); // old item → class
  for (const o of old) {
    const n = o.minhag ? minhagNumber(o.title) : null;
    const ft = fileTitle(o);
    const hit = byYoutube.get(youtubeIdOf(o.link)) || (n != null && byEpisode.get(n)) || byTitle.get(norm(o.title)) || [ft.split(' ').length >= 3 && byTitle.get(ft)].find((c) => c && !otherTeacher(c, o.by)) || near(o) || sameLength(o);
    if (hit) pairs.set(o, hit);
  }
  return pairs;
}
// Can a phone play it? (.ogg and .3gp do not play on iPhones, so they are left out for now.)
export const playable = (o) => o.active && (o.type === 'audio' || o.type === 'video') && /\.(mp3|m4a|mp4|m4v|wav|aac)$/i.test(o.file || '');
