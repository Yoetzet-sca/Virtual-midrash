import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { parseFeed, durationToSeconds } from './lib/rss.mjs';
import { topicFor, matchesTopic } from './lib/topics.mjs';
import { parseBrooklyn, parseDeal } from './lib/erub.mjs';
import { parseCsv } from './lib/csv.mjs';
import { lock, normalizeCode } from './lib/lock.mjs';
import { channelIdFrom, parseYoutube, teacherForTitle } from './lib/youtube.mjs';
import { applyOverrides } from './lib/overrides.mjs';

const fx = (n) => readFile(new URL(`fixtures/${n}`, import.meta.url), 'utf8');

test('SoundCloud feed: reads classes, skips items with no audio', async () => {
  const f = parseFeed(await fx('avi-harari.xml'));
  assert.equal(f.title, 'Rabbi Avi Harari');
  assert.equal(f.items.length, 2);
  assert.equal(f.items[0].title, '"Shnayim Mikra..." - The Haftarah');
  assert.equal(f.items[1].durationSec, 45 * 60 + 3);
  assert.match(f.items[1].audioUrl, /^https:\/\/feeds\.soundcloud\.com\/stream\/.*\.mp3$/);
  assert.equal(f.items[1].date, '2026-11-18T12:09:34.000Z');
  assert.match(f.image, /avatars/);
  assert.match(f.next, /before=/);
});

test('Spotify/Anchor feed: CDATA titles and encoded audio links', async () => {
  const f = parseFeed(await fx('richard-hidary.xml'));
  assert.equal(f.items[0].title, 'Arakhin 8 - Seven Eleven: Counting Niddah and Zavah Periods');
  assert.equal(f.items[0].durationSec, 2406);
  assert.match(f.items[0].audioUrl, /^https:\/\/anchor\.fm\//);
});

test('very long feeds with thousands of entities still parse', () => {
  const item = (i) => `<item><title>Tom &amp; Jerry &quot;${i}&quot; &#8211; caf&#xE9;</title><pubDate>Sun, 15 Nov 2026 19:25:24 GMT</pubDate><enclosure url="https://example.org/a.mp3?x=1&amp;y=${i}" type="audio/mpeg"/></item>`;
  const xml = `<rss><channel><title>Big</title>${Array.from({ length: 2500 }, (_, i) => item(i)).join('')}</channel></rss>`;
  const f = parseFeed(xml);
  assert.equal(f.items.length, 2500);
  assert.equal(f.items[7].title, 'Tom & Jerry "7" – café');
  assert.equal(f.items[7].audioUrl, 'https://example.org/a.mp3?x=1&y=7');
});

test('durations', () => {
  assert.equal(durationToSeconds('00:09:39'), 579);
  assert.equal(durationToSeconds('45:03'), 2703);
  assert.equal(durationToSeconds('2406'), 2406);
  assert.equal(durationToSeconds(''), 0);
});

test('topics from titles', () => {
  const cases = [
    ['Bava Batra 8a (1)', null, 'Gemara'],
    ['Bava Batra 7b (2)', null, 'Gemara'],
    ['Arakhin 8 - Seven Eleven: Counting Niddah and Zavah Periods', 'Daf Yomi', 'Daf Yomi'],
    ['The Laws of Shabbat #11 - "When the Fridge Light is On..." (2)', null, 'Halakha'],
    ['Hadlakat Nerot - On a Bathroom Light', null, 'Halakha'],
    ['"Shnayim Mikra..." - The Haftarah', null, 'Perasha'],
    ["Vayesse: Leah's Thanks", null, 'Perasha'],
    ['Noah 2026', null, 'Perasha'],
    ['Preparation for Rosh Hashana 2026 (Class #102)', null, 'Holidays'],
    ['Together Under One Succah', null, 'Holidays'],
    ['Yonah 2026', null, 'Nebiim and Ketubim'],
    ["Israel's Declaration of Independence: The Document", null, 'Land of Israel'],
    ['The Future of our Community', null, null],
  ];
  for (const [title, def, want] of cases) assert.equal(topicFor(title, def), want, title);
});

test('Daf Yomi is a subset of Gemara', () => {
  assert.ok(matchesTopic('Daf Yomi', 'Gemara'));
  assert.ok(!matchesTopic('Gemara', 'Daf Yomi'));
});

test('erub: Brooklyn status only counts when it is this week', () => {
  const html = '<h2>Erub is UP</h2><p>Shabbat Toledot</p><p>November 14, 2026</p><p>Candle lighting 4:22pm</p>';
  assert.deepEqual(parseBrooklyn(html, new Date('2026-11-13T18:00:00Z')), { status: 'up', date: '2026-11-14', fresh: true });
  assert.equal(parseBrooklyn(html, new Date('2026-11-14T22:00:00Z')).fresh, true); // Shabbat afternoon
  assert.equal(parseBrooklyn(html, new Date('2026-11-15T14:00:00Z')).fresh, false); // Sunday morning
  assert.equal(parseBrooklyn(html, new Date('2026-11-18T17:00:00Z')).fresh, false); // midweek
  assert.equal(parseBrooklyn('<h2>Erub is DOWN</h2> November 14, 2026', new Date('2026-11-13T18:00:00Z')).status, 'down');
  assert.deepEqual(parseBrooklyn('<p>nothing here</p>'), { status: 'unknown', date: null, fresh: false });
});

test('erub: Deal reads the checked date and the up/down image', () => {
  const html = '<table><tr><td><img src="images/erub-up.gif"></td><td>11/13/2026 THE ERUB HAS BEEN CHECKED.</td></tr></table><p>3/11/22 THE ERUB IS DOWN.</p>';
  assert.deepEqual(parseDeal(html, new Date('2026-11-13T20:00:00Z')), { status: 'up', date: '2026-11-13', fresh: true });
  assert.equal(parseDeal(html, new Date('2026-11-16T15:00:00Z')).fresh, false); // Monday after
  assert.equal(parseDeal(html, new Date('2026-11-25T20:00:00Z')).fresh, false);
  assert.equal(parseDeal('<td>11/13/2026 THE ERUB HAS BEEN CHECKED.</td>', new Date('2026-11-13T20:00:00Z')).status, 'checked');
});

test('csv', () => {
  const rows = parseCsv('id,name,affiliations\r\na,"Hidary, Vivien","X; Y"\n\nb,"He said ""hi""",\n');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, 'Hidary, Vivien');
  assert.equal(rows[1].name, 'He said "hi"');
});

test('community code: locked text opens with the code (same method the app uses) and not without it', async () => {
  const open = async (blob, code) => {
    const [salt, iv, body] = blob.split('.').map((p) => Buffer.from(p, 'base64'));
    const base = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(normalizeCode(code)), 'PBKDF2', false, ['deriveKey']);
    const key = await webcrypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return new TextDecoder().decode(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body));
  };
  const blob = lock('1853 East 8th Street', 'Shalom26');
  assert.ok(!blob.includes('East'));
  assert.equal(await open(blob, ' shalom26 '), '1853 East 8th Street');
  await assert.rejects(open(blob, 'wrong'));
});

test('YouTube: channel id, videos, and matching a video to its teacher', async () => {
  assert.equal(channelIdFrom('<link rel="alternate" type="application/rss+xml" href="https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv">'), 'UCabcdefghijklmnopqrstuv');
  assert.equal(channelIdFrom('{"externalId":"UC1234567890123456789012"}'), 'UC1234567890123456789012');
  assert.equal(channelIdFrom('<p>nothing</p>'), null);
  const vids = parseYoutube(await fx('youtube.xml'));
  assert.equal(vids.length, 2);
  assert.deepEqual(vids[0], { youtubeId: 'dQw4w9WgXcQ', title: 'Mrs. Vivien Hidary – Vayelech & the "Song"', date: '2026-11-09T18:00:00.000Z', image: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
  const teachers = [{ id: 'rh', name: 'Rabbi Dr. Richard Hidary' }, { id: 'vh', name: 'Mrs. Vivien Hidary' }, { id: 'nb', name: 'Rabbi Naftali Besser' }];
  assert.equal(teacherForTitle(vids[0].title, teachers), 'vh');
  assert.equal(teacherForTitle('Staying Inspired with Rabbi Besser', teachers), 'nb');
  assert.equal(teacherForTitle('The Hidary family dinner', teachers), null); // two Hidarys, no first name
  assert.equal(teacherForTitle('SCA Annual Dinner Highlights', teachers), null);
});

test('overrides: staff can fix a topic or hide a class', () => {
  const classes = [
    { id: '1', teacherId: 'a', title: 'The Future of our Community', topic: null },
    { id: '2', teacherId: 'a', title: 'Test recording please ignore', topic: null },
    { id: '3', teacherId: 'b', title: 'Community Dinner', topic: 'Holidays' },
  ];
  const out = applyOverrides(classes, [
    { match: 'future of our community', topic: 'land of israel' },
    { match: 'please ignore', hide: 'yes' },
    { match: 'community', topic: 'Mishna', teacherId: 'zzz' }, // other teacher: no effect
    { match: '', topic: 'Halakha' }, // empty row: ignored
    { match: 'dinner', topic: 'Not A Topic' }, // unknown topic: ignored
  ]);
  assert.deepEqual(out.map((c) => [c.id, c.topic]), [['1', 'Land of Israel'], ['3', 'Holidays']]);
  assert.equal(applyOverrides(classes, []).length, 3);
});
