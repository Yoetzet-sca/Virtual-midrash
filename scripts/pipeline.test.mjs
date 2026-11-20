import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { parseFeed, durationToSeconds, applePodcastId, feedFromAppleLookup, isSpotifyShow, spotifyShowName, feedFromAppleSearch, feedFromPage, looksLikeFeed } from './lib/rss.mjs';
import { topicFor, matchesTopic } from './lib/topics.mjs';
import { parseBrooklyn, parseDeal } from './lib/erub.mjs';
import { parseCsv, resourceRows } from './lib/csv.mjs';
import { lock, normalizeCode } from './lib/lock.mjs';
import { channelIdFrom, parseYoutube, teacherForTitle } from './lib/youtube.mjs';
import { applyOverrides } from './lib/overrides.mjs';
import { dafFor, weekInfo, CYCLE_DAYS } from './lib/calendar.mjs';
import { searchTerms, parseModelJson, summaryPrompt, timedTranscript, parseTimedTranscript, unsupported, shortName, titleNames } from './lib/ai-text.mjs';
import { ask, prepare } from './.ask.mjs';

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
    ['"Shnayim Mikra..." - The Haftarah', null, 'Parasha'],
    ["Vayesse: Leah's Thanks", null, 'Parasha'],
    ['Noah 2026', null, 'Parasha'],
    ['Preparation for Rosh Hashana 2026 (Class #102)', null, 'Holidays'],
    ['Together Under One Succah', null, 'Holidays'],
    ['Yonah 2026', null, 'Nebiim and Ketubim'],
    ["Israel's Declaration of Independence: The Document", null, 'Land of Israel'],
    ['The Future of our Community', null, null],
    ['حاخام أوري لاطي. חכם אורי לאטי. פרשת חיי שרה תשפ״ז. باللغة العربية', null, 'Parasha'],
    ['הלכות שבת – חלק ג', null, 'Halakha'],
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

test('an Apple Podcasts link can stand in for a feed address', () => {
  assert.equal(applePodcastId('https://podcasts.apple.com/ca/podcast/torah-talks/id1471588127'), '1471588127');
  assert.equal(applePodcastId('https://podcasts.apple.com/us/podcast/x/id99?i=1000'), '99');
  assert.equal(applePodcastId('https://feeds.soundcloud.com/users/soundcloud:users:1/sounds.rss'), null);
  assert.equal(feedFromAppleLookup('{"resultCount":1,"results":[{"kind":"podcast","feedUrl":"https://anchor.fm/s/abc/podcast/rss"}]}'), 'https://anchor.fm/s/abc/podcast/rss');
  assert.equal(feedFromAppleLookup('{"resultCount":0,"results":[]}'), null);
});

test('a Spotify show link resolves by exact show name only', () => {
  assert.ok(isSpotifyShow('https://open.spotify.com/show/0RjG5OulsqGM8Ont6UUV9D?si=x'));
  assert.ok(!isSpotifyShow('https://anchor.fm/s/abc/podcast/rss'));
  assert.equal(spotifyShowName('<meta property="og:title" content="Perashah Gems with Rabbi Nathan Dweck | Podcast on Spotify"/>'), 'Perashah Gems with Rabbi Nathan Dweck');
  const results = JSON.stringify({ results: [{ collectionName: 'Weekly Parsha Gems', feedUrl: 'https://wrong.example/rss' }, { collectionName: 'Perashah Gems with Rabbi Nathan Dweck', feedUrl: 'https://right.example/rss' }] });
  assert.equal(feedFromAppleSearch(results, 'Perashah Gems with Rabbi Nathan Dweck'), 'https://right.example/rss');
  assert.equal(feedFromAppleSearch(results, 'Perashah Gems'), null);
});

test('finding a feed inside a podcast web page', () => {
  assert.equal(feedFromPage('<link rel="alternate" type="application/rss+xml" href="https://example.org/show/feed.xml?a=1&amp;b=2">'), 'https://example.org/show/feed.xml?a=1&b=2');
  assert.equal(feedFromPage('<audio src="https://anchor.fm/s/c85c814/podcast/play/123/https%3A%2F%2Fd3.cloudfront.net%2Fx.mp3">'), 'https://anchor.fm/s/c85c814/podcast/rss');
  assert.equal(feedFromPage('<a href="https://feeds.soundcloud.com/users/soundcloud:users:127279884/sounds.rss">RSS</a>'), 'https://feeds.soundcloud.com/users/soundcloud:users:127279884/sounds.rss');
  assert.equal(feedFromPage('<p>no feed here</p>'), null);
  assert.ok(looksLikeFeed('<?xml version="1.0"?><rss version="2.0">'));
  assert.ok(!looksLikeFeed('<!doctype html><html>'));
});

test('daf yomi follows the real cycle', () => {
  assert.equal(CYCLE_DAYS, 2711);
  assert.deepEqual(dafFor('2020-01-05'), { tractate: 'Berachot', page: 2 }); // start of the 14th cycle
  assert.deepEqual(dafFor('2026-11-18'), { tractate: 'Bechorot', page: 61 }); // matches the old site that day
  assert.deepEqual(dafFor('2026-11-19'), { tractate: 'Arachin', page: 2 });
  assert.deepEqual(dafFor('2027-06-07'), { tractate: 'Niddah', page: 73 }); // siyum of the cycle
  assert.deepEqual(dafFor('2027-06-08'), { tractate: 'Berachot', page: 2 });
});

test('this week\'s perasha and the next holiday', () => {
  const w = weekInfo('2026-11-19');
  assert.equal(w.perasha.name, 'Vayesse');
  assert.equal(w.perasha.shabbat, '2026-11-21');
  assert.equal(w.holiday.name, 'Hanukkah');
  assert.match(w.holiday.date, /^2026-12-0[45]$/);
  assert.equal(weekInfo('2026-03-09').perasha.name, 'Vayakhel – Pekudei'); // a double portion
  assert.equal(weekInfo('2026-10-19').perasha.name, 'Lech Lecha'); // a hyphenated single name is not split
});

test('search forgives spelling', async () => {
  const { matches } = await import('./.search.mjs');
  const yes = [
    ['parsha', 'Perashat Nisabim Episode 2 - Painfully Stubborn'], ['parasha vayetze', "Perasha — Vayesse: Leah's Thanks"], ['Vayetzei', "Vayesse: Leah's Thanks"],
    ['bechoros 61', 'Bekhorot 61 - The Tithe'], ['Bekhorot', 'Bechoros 12'], ['arachin 8', 'Arakhin 8 - Seven Eleven'], ['baba batra 8a', 'Bava Batra 8a (1)'],
    ['baba basra', 'Bava Batra 8a (1)'], ['brachos', 'Berakhot 12'], ['pinchas', 'Pinehas 2026'], ['toldot', 'Toledot 2026: Two Worlds'], ['chayei sarah', 'Haye Sarah 2026: The Angel'], ['shabbos', 'The Laws of Shabbat #11'],
    ['chanukah', 'Hanukkah: lighting at the door'], ['hidary', 'Torah Talks Mrs. Vivien Hidary'], ['fridge', 'When the Fridge Light is On'], ['פרשת', 'חכם אורי לאטי. פרשת חיי שרה'],
  ];
  const no = [
    ['arakhin 8', 'Arakhin 18 - Something'], ['arakhin 8', 'Arakhin 80'], ['bava batra 8', 'Bava Kamma 8'], ['perasha', 'The Laws of Shabbat'], ['harari', 'Rabbi Joey Soffer'], ['', 'anything'],
  ];
  for (const [q, text] of yes) assert.ok(matches(q, text), `"${q}" should find "${text}"`);
  for (const [q, text] of no) assert.ok(!matches(q, text), `"${q}" should not find "${text}"`);
});

test('AI step: search words and reading the model reply', () => {
  const terms = searchTerms('So the Gemara in Bava Batra says, you know, that the fridge light, the fridge, on Shabbat is a pesik reisha. שבת 12 12 the the');
  assert.deepEqual(terms.slice(0, 1), ['fridge']);
  for (const w of ['gemara', 'bava', 'batra', 'shabbat', 'pesik', 'reisha', 'שבת']) assert.ok(terms.includes(w), w);
  for (const w of ['the', 'you', 'know', 'so', '12']) assert.ok(!terms.includes(w), w);
  const r = parseModelJson('```json\n{"summary":" A class about X. ","subjects":["a","b",""],"questions":["q?"],"quality":"good","extra":1}\n```');
  assert.deepEqual(r, { summary: 'A class about X.', subjects: ['a', 'b'], questions: ['q?'], quality: 'good', topic: null, chapters: [] });
  const r2 = parseModelJson('{"summary":"s","topic":"Halakha","chapters":[{"at":"12:30","title":"Second","about":"x y"},{"at":"0:40","title":"First"},{"at":"0:50","title":"too close"},{"at":"59:00","title":"past the end"},{"at":"soon","title":"bad"}]}', 1800);
  assert.equal(r2.topic, 'Halakha');
  assert.deepEqual(r2.chapters, [{ at: 40, title: 'First', about: '' }, { at: 750, title: 'Second', about: 'x y' }]);
  assert.equal(parseModelJson('{"summary":"s","topic":"Cooking"}').topic, null);
  assert.equal(timedTranscript([{ start: 0, text: 'a' }, { start: 20, text: 'b' }, { start: 50, text: 'c' }, { start: 3725, text: 'd' }]), '[0:00] a b \n[0:50] c \n[62:05] d');
  assert.throws(() => parseModelJson('sorry, I cannot'));
  assert.throws(() => parseModelJson('{"subjects":[]}'));
  assert.match(summaryPrompt({ title: 'T', teacher: 'R', minutes: 5, transcript: 'hello' }), /Class title: T[\s\S]*Transcript:\nhello$/);
});

test('ask a question: finds the class by what was said, and the part to jump to', () => {
  const titles = { s1: 'Wearing the Shoes of Someone Who Passed Away', s2: 'Arakhin 10', s3: 'Arachin daf 2' };
  const ready = prepare([
    { i: 's1', m: 'Clothing and shoes of the deceased.', s: 'Sefer Hasidim; Sedaka; leather shoes', q: 'Can I donate the clothing of a deceased family member to charity?', c: ['custom question introduction', 'sefer hasidim source danger', 'donate charity clothing poor'], t: 'shoes dead clothing charity hallel family' },
    { i: 's2', m: 'Why full Hallel is not said on Purim.', s: 'Hallel; Purim; Rosh Hashana; Hasosrot', q: 'Why is Hallel not recited on Purim?', c: ['trumpets temple', 'hallel purim megilla'], t: 'hallel purim trumpets flute megilla charity' },
    { i: 's3', m: 'Who can make a valuation vow.', s: 'Erech vows; Hinukh; Megilla reading', q: 'Are children obligated in Sukkah?', c: ['mishna hakol', 'children hinukh sukkah'], t: 'vow children sukkah everyone' },
  ], (sid) => titles[sid]);
  const top = (q) => ask(q, ready).map((a) => a.sid);
  assert.deepEqual(top('Can I give a dead person\'s clothes to charity?').slice(0, 1), ['s1']);
  assert.equal(ask('donate clothing to charity', ready)[0].part, 2);
  assert.deepEqual(top('why no hallel on purim').slice(0, 1), ['s2']);
  assert.deepEqual(top('chinuch'), ['s3']);          // spelled the Ashkenazi way
  assert.deepEqual(top('chatzotzrot'), ['s2']);
  assert.deepEqual(top('what is the'), []);           // nothing but filler words
  assert.deepEqual(top('flute'), []);                // only said in passing: not enough
  assert.deepEqual(top('quantum physics'), []);
});

test('community resources sheet: title and heading rows are skipped, tab spelling is forgiven', () => {
  const cats = ['Tutors / Bar Mizva', 'Hebra Kadisha'];
  assert.deepEqual(resourceRows('"Community Resources","","",""\n"Category","Name","Phone","Email"\n"Hebra Kadisha","Some Shul","718-555-0100",""\n"Hebra Kadisha","","",""', cats), [{ category: 'Hebra Kadisha', name: 'Some Shul', phone: '718-555-0100', email: '' }]);
  assert.deepEqual(resourceRows('"Tutors/Bar Mitzva","A Person","","a@example.org"', cats), [{ category: 'Tutors / Bar Mizva', name: 'A Person', phone: '', email: 'a@example.org' }]);
});

test('AI summaries are checked against the transcript', () => {
  const said = "Okay, so today we are in Lech Lecha, Perek Tet Vav. Avram is worried he has no heir. Hashem takes him outside, tells him to count the stars, he is above the mazal. Then the brit bein habetarim, the animals, and Rashi explains each korban.";
  assert.deepEqual(unsupported('Rabbi Soffer goes through Lech Lecha with Rashi: Avram’s worry about an heir, counting the stars, being above the mazal, and the Berit Ben HaBetarim.', said, 'Lech Lecha Rashi 5 Rabbi Joey Soffer'), []);
  assert.deepEqual(unsupported('This class examines Genesis Chapter 15, where Avram is shown the stars from above the cosmos and his astrological destiny.', said), ['genesis', 'chapter', 'shown', 'cosmos', 'astrological', 'destiny']);
  assert.equal(shortName('Rabbi Dr. Richard Hidary'), 'Rabbi Hidary');
  assert.equal(shortName('Mrs. Vivien Hidary'), 'Mrs. Hidary');
  assert.equal(shortName('Rabbi Lati'), 'Rabbi Lati');
  const prompt = summaryPrompt({ title: 'T', teacher: 'Rabbi Joey Soffer', minutes: 5, transcript: 'hello', redo: 'genesis, cosmos' });
  assert.match(prompt, /Begin with the teacher, as "Rabbi Soffer \.\.\."/);
  assert.match(prompt, /not found in the transcript: genesis, cosmos\./);
  assert.match(prompt, /Transcript:\nhello$/);
});

test('a transcript with time marks is read back into timed pieces', () => {
  assert.deepEqual(parseTimedTranscript('Here it is:\n[0:00] Good morning everyone.\n[0:45] Today we begin\n a new perek.\n[1:02:10] Thank you.'),
    [{ start: 0, end: 0, text: 'Good morning everyone.' }, { start: 45, end: 45, text: 'Today we begin a new perek.' }, { start: 3730, end: 3730, text: 'Thank you.' }]);
});

test('the queue recognises a perasha or holiday in a title however it is spelled', () => {
  for (const title of ['Vayetze 2026:Leaving Footprints', 'Parashat VaYesse - Finding Your "Makom"', 'Perashat Vayesse']) assert.ok(titleNames(title, 'Vayesse'), title);
  for (const title of ['Lech Lecha Rashi 5', 'Perashat Lekh-Lekha']) assert.ok(titleNames(title, 'Lekh Lekha'), title);
  assert.ok(titleNames('Chanukah: lighting at the door', 'Hanukkah'));
  for (const title of ['Arakhin 10', 'Vayera 5787', 'The Laws of Shabbat #11', 'Bava Batra 8a (1)']) assert.ok(!titleNames(title, 'Vayesse') && !titleNames(title, 'Lekh Lekha'), title);
});

test('YouTube API: lengths, and which videos are left out', async () => {
  const { isoSeconds, videosFromApi } = await import('./lib/youtube.mjs');
  assert.equal(isoSeconds('PT1H2M3S'), 3723); assert.equal(isoSeconds('PT45S'), 45); assert.equal(isoSeconds('P0D'), 0); assert.equal(isoSeconds('PT12M'), 720);
  const item = (id, title) => ({ snippet: { title, publishedAt: '2025-11-01T10:00:00Z', thumbnails: { high: { url: 'https://i.ytimg.com/vi/' + id + '/hq.jpg' } } }, contentDetails: { videoId: id, videoPublishedAt: '2025-10-30T10:00:00Z' } });
  const detail = (id, duration, live = 'none') => ({ id, contentDetails: { duration }, snippet: { liveBroadcastContent: live } });
  const out = videosFromApi(
    [item('aaaaaaaaaaa', 'Perashat Lech Lecha 5786. Rabbi Uri Lati'), item('bbbbbbbbbbb', 'A short clip'), item('ccccccccccc', 'Private video'), item('ddddddddddd', 'Upcoming live class'), item('eeeeeeeeeee', 'Removed since')],
    [detail('aaaaaaaaaaa', 'PT38M10S'), detail('bbbbbbbbbbb', 'PT40S'), detail('ccccccccccc', 'PT5M'), detail('ddddddddddd', 'P0D', 'upcoming')]);
  assert.deepEqual(out, [{ youtubeId: 'aaaaaaaaaaa', title: 'Perashat Lech Lecha 5786. Rabbi Uri Lati', date: '2025-10-30T10:00:00.000Z', image: 'https://i.ytimg.com/vi/aaaaaaaaaaa/hq.jpg', link: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', durationSec: 2290 }]);
});

test('two teachers with one family name', async () => {
  const { teacherForTitle } = await import('./lib/youtube.mjs');
  const teachers = [{ id: 'avi-harari', name: 'Rabbi Avi Harari' }, { id: 'joey-harari', name: 'Joey Harari' }, { id: 'joseph-mosseri', name: 'Joseph Mosseri' }];
  assert.equal(teacherForTitle('Rabbi Harari on the Haftarah', teachers), null); // two people named Harari: never guess
  assert.equal(teacherForTitle('Joey Harari', teachers), 'joey-harari');
  assert.equal(teacherForTitle('Rabbi Avi Harari - Vayesse', teachers), 'avi-harari');
  assert.equal(teacherForTitle('Harari family dinner', teachers), null);
  assert.equal(teacherForTitle('Joseph Mosseri', teachers), 'joseph-mosseri');
});

test('a family name does not claim someone else with that name', async () => {
  const { teacherForTitle } = await import('./lib/youtube.mjs');
  const one = [{ id: 'nathan-dweck', name: 'Rabbi Nathan Dweck' }, { id: 'vivien-hidary', name: 'Mrs. Vivien Hidary' }, { id: 'richard-hidary', name: 'Rabbi Dr. Richard Hidary' }];
  assert.equal(teacherForTitle('"The Light in Being Jewish Right Now" Hanukkah Class by Rabbi Joseph Dweck', one), null);
  assert.equal(teacherForTitle('Hanukkah Class by Rabbi Dweck', one), 'nathan-dweck');
  assert.equal(teacherForTitle('Rabbi Nathan Dweck: Perasha Gems', one), 'nathan-dweck');
  assert.equal(teacherForTitle('Mrs. Vivien Hidary – Vayelech & the "Song"', one), 'vivien-hidary');
  assert.equal(teacherForTitle('Rabbi Dr. Richard Hidary on Purim', one), 'richard-hidary');
  const two = [...one, { id: 'joseph-dweck', name: 'Rabbi Joseph Dweck' }];
  assert.equal(teacherForTitle('"The Light in Being Jewish Right Now" Hanukkah Class by Rabbi Joseph Dweck', two), 'joseph-dweck');
  assert.equal(teacherForTitle('An evening with Rabbi Dweck', two), null);
});

test('videos are filed only under the person the title really names (checked against the SCA roster)', async () => {
  const { teacherForTitle, samePerson } = await import('./lib/youtube.mjs');
  const { readFileSync } = await import('node:fs');
  const roster = JSON.parse(readFileSync(new URL('../content/roster.json', import.meta.url), 'utf8')).map((r) => ({ id: r.name, name: r.name }));
  const who = (title) => teacherForTitle(title, roster);
  assert.equal(who('"The Light in Being Jewish Right Now" Hanukkah Class by Rabbi Joseph Dweck'), 'Rabbi Joseph Dweck');
  assert.equal(who('Rabbi Joey Dweck: Hanukkah'), 'Rabbi Joseph Dweck');
  assert.equal(who('Perasha Gems - Rabbi Nathan Dweck'), 'Rabbi Nathan Dweck');
  assert.equal(who('An evening with Rabbi Dweck'), null);            // four people named Dweck
  assert.equal(who('Rabbi Tawil on Shabbat'), null);                 // several rabbis named Tawil
  assert.equal(who('Rabbi Harari - Hilkhot Shabbat'), null);
  assert.equal(who('Rabbi Hidary: Purim'), null);                    // also Mrs. Esther, Simone and Vivien Hidary
  assert.equal(who('Mrs. Vivien Hidary – Vayelech & the "Song"'), 'Mrs. Vivien Hidary');
  assert.equal(who('Rabbi Ricky Hidary on the Megillah'), 'Rabbi Dr. Richard Hidary');
  assert.equal(who('Rabbi Lati - Perashat Noah'), 'Rabbi Uri Lati');  // the only Lati, and the title says Rabbi
  assert.equal(who('Mrs. Lati - a class'), null);                    // wrong title for him
  assert.equal(who('Lati Family Dinner'), null);                     // a bare family name is never enough
  assert.equal(who('Class by Mrs. Victoria Chabot Berman'), 'Mrs. Victoria Chabot Berman');
  assert.equal(who('Rabbi Ronnie Hasson: Tehillim'), 'Rabbi Dr. Henry (Ronnie) Hasson');
  assert.equal(who('Joseph Mosseri on the Arayat'), 'Mr. Joey Mosseri');
  assert.equal(who('SCA Minhag of the Week 309: "The Arayat"'), null);
  assert.equal(who('Rabbi Joseph Beyda and Rabbi Joseph Dweck in conversation'), null); // two people named: left with the SCA
  assert.ok(samePerson('Mr. Joseph Mosseri', 'Mr. Joey Mosseri') && samePerson('Mr. Joey Harari', 'Mr. Joseph Harari'));
  assert.ok(!samePerson('Rabbi Avi Harari', 'Mr. Joseph Harari') && !samePerson('Rabbi Nathan Dweck', 'Rabbi Joseph Dweck'));
});

test('the perasha filter finds the perasha and nothing else', async () => {
  const { namesIt, matches } = await import('./.search.mjs');
  for (const title of ['Vayetze 2025', 'VaYesse: Living With The Tension', 'Parashat VaYesse - Finding Your "Makom"', 'Perashat Vayesse 5786. Rabbi Uri Lati', 'Vayeitzei: the ladder', 'Vayetzei 2023']) assert.ok(namesIt('Vayesse', title), title);
  for (const title of ['Baba Batra 98 - Who Buys the House for the Newlyweds?', 'Vayishlach 2025', 'Vayelech 2025', 'Vayeshev: the pit', 'Vayera 5787', 'Voices of the community', 'Vows and Oaths']) {
    assert.ok(!namesIt('Vayesse', title), title);
    assert.ok(!matches('Vayesse', title), 'search: ' + title);
    assert.ok(!titleNames(title, 'Vayesse'), 'queue: ' + title);
  }
  for (const title of ['Chanukah: lighting at the door', 'Hanukah 5785', 'Hanukkah Class by Rabbi Joseph Dweck']) assert.ok(namesIt('Hanukkah', title), title);
  assert.ok(namesIt('Lekh Lekha', 'Lech Lecha Rashi 5') && namesIt('Vayishlah', 'Vayishlach 2025') && !namesIt('Vayishlah', 'Vayetze 2025'));
  assert.ok(matches('bava basra 8', 'Bava Batra 8a (1)') && matches('vayes', 'Perashat Vayesse')); // ordinary search is unchanged: other spellings, and part of a word while typing
});

test('meaning check: prompt and reading the reply', async () => {
  const { checkPrompt, parseCheck, summaryPrompt: sp, unsupported: un } = await import('./lib/ai-text.mjs');
  const pr = checkPrompt({ title: 'T', transcript: '[0:00] hello', summary: 'Rabbi X says Y.', parts: ['Intro', 'End'] });
  assert.match(pr, /Description to check:\nRabbi X says Y\.\nParts of the class, as listed: Intro \| End/);
  assert.match(pr, /Transcript:\n\[0:00\] hello$/);
  assert.deepEqual(parseCheck('```json\n{"unsupported": []}\n```'), { claims: [], badParts: [] });
  assert.deepEqual(parseCheck('{"unsupported": ["\\"cites the Rambam\\" - the Rambam is not mentioned", ""], "bad_parts": ["Conclusion and Rental Homes"]}'), { claims: ['"cites the Rambam" - the Rambam is not mentioned'], badParts: ['Conclusion and Rental Homes'] });
  assert.throws(() => parseCheck('looks fine to me'));
  assert.throws(() => parseCheck('{"ok": true}'));
  assert.match(sp({ title: 'T', teacher: 'Rabbi A B', minutes: 5, transcript: 'x', fix: ['cites the Rambam'] }), /found these statements are not supported by it:\n- cites the Rambam\n/);
  assert.deepEqual(un('Rabbi Yehuda and Rabbi Yehoshua on the Sidurim', 'so rabbi yehudah says, and rabbi yehoshuah, look in the siddurim'), []); // Hebrew spelled by ear
});

test('the fast search gives the same answers as the simple one, quickly', async () => {
  const { matches, namesIt, buildIndex, searchIndex } = await import('./.search.mjs');
  const base = ['Bava Batra 8a (1)', 'Baba Batra 98 - Who Buys the House for the Newlyweds?', 'Vayetze 2025', 'Vayishlach 2025', 'VaYesse: Living With The Tension', 'Perashat Lech Lecha 5786. Rabbi Uri Lati', 'Arachin daf 2', 'Arakhin 10 - Why Not Sing Hallel on Purim', 'Chanukah: lighting at the door', 'The Laws of Shabbat #11', 'Shemirat Halashon 28', 'Bekhorot 27 - Terumah Outside of Israel', 'Hullin 122 - The Kindest Babylonian'];
  const texts = Array.from({ length: 6000 }, (_, i) => `${base[i % base.length]} ${i % 7 === 0 ? 'Rabbi Avi Harari' : 'Mrs. Vivien Hidary'} part ${i}`);
  const ix = buildIndex(texts);
  for (const q of ['vayesse', 'bava basra 8', 'lech lecha', 'arakhin 2', 'hanukkah', 'israel', 'harari', 'shabbos laws', 'vayes', 'zzz']) {
    assert.deepEqual(searchIndex(ix, q), texts.map((x, i) => (matches(q, x) ? i : -1)).filter((i) => i >= 0), q);
  }
  for (const n of ['Vayesse', 'Hanukkah', 'Lekh Lekha']) assert.deepEqual(searchIndex(ix, n, true), texts.map((x, i) => (namesIt(n, x) ? i : -1)).filter((i) => i >= 0), n);
  const t0 = performance.now(); for (const q of ['v', 'va', 'vay', 'vaye', 'vayes', 'vayess', 'vayesse']) searchIndex(ix, q); const fast = (performance.now() - t0) / 7;
  const t1 = performance.now(); texts.filter((x) => matches('vayesse', x)); const slow = performance.now() - t1;
  console.log(`    search of 6,000 classes: ${fast.toFixed(1)} ms per keystroke with the index, ${slow.toFixed(0)} ms the old way`);
  assert.ok(fast < 40, `too slow: ${fast}`);
});

test('the old site\'s spellings are what the app shows, and they still find however a teacher spelled it', async () => {
  const { namesIt, matches } = await import('./.search.mjs');
  const { PERASHIYOT, MASEKHTOT } = await import('./lib/names.mjs');
  // every perasha the calendar can return is spelled the old site's way
  const seen = new Set();
  for (let d = new Date(Date.UTC(2026, 8, 1)); d < new Date(Date.UTC(2028, 9, 1)); d = new Date(d.getTime() + 7 * 86400000)) for (const n of weekInfo(d.toISOString().slice(0, 10)).perasha?.search || []) seen.add(n);
  for (const n of seen) assert.ok(PERASHIYOT.includes(n), `not the old site's spelling: ${n}`);
  assert.ok(seen.size >= 50);
  // the daf cycle uses the old site's tractate names
  for (const day of ['2020-01-05', '2021-06-01', '2023-03-03', '2025-08-08', '2026-11-20']) assert.ok(MASEKHTOT.includes(dafFor(day).tractate), dafFor(day).tractate);
  // and those spellings find the usual ones in titles
  for (const [name, title] of [['Hayei Sara', 'Chayei Sarah 2025'], ['Hayei Sara', 'Haye Sarah: the cave'], ['Teruma', 'Perashat Terumah'], ['Tessave', 'Tetzaveh 5785'], ['Aharei Mot', 'Acharei Mot - Kedoshim'], ['Behaalotekha', "Beha'alotcha 2024"], ['Vayelech', 'Vayelekh 2025'], ['Shemini Aseret', 'Shemini Atzeret and the rain'], ["Tish'a BeAb", "Tisha B'Av: Kinot"], ["Tu B'Shbat", 'Tu Bishvat seder'], ['Asarah BeTebet', "Asara B'Tevet"], ['Som Gedaliah', 'Tzom Gedalia'], ['Yom Haasmaut', "Yom HaAtzmaut 5785"]]) assert.ok(namesIt(name, title), `${name} / ${title}`);
  for (const [q, title] of [['Erubim 12', 'Eruvin 12 - Lehi'], ['Beisah 5', 'Beitzah 5'], ['Baba Kamma 30', 'Bava Kamma 30a'], ['Zebahim 2', 'Zevachim 2'], ['Abodah Zarah 10', 'Avodah Zarah 10'], ['Bechorot 8', 'Bekhorot 8 - The Wise Men of Athens'], ['Arachin 2', 'Arakhin 2'], ['Yebamot 4', 'Yevamot 4'], ['Berachot 12', 'Berakhot 12']]) assert.ok(matches(q, title), `${q} / ${title}`);
  const hol = weekInfo('2027-05-20').holiday; // just before Lag La'Omer
  assert.equal(hol.name, "Lag La'Omer"); assert.ok(hol.search.includes('Lag BaOmer'));
  assert.equal(weekInfo('2026-12-13').holiday.name, 'Asarah BeTebet');
});

test('old archive: the same recording is recognised, and Minhag episodes by their number', async () => {
  const { pairUp, playable, minhagNumber, youtubeIdOf } = await import('./lib/archive.mjs');
  assert.equal(minhagNumber('SCA Minhag of the week #302: "Hinukh Habit: The Reading".'), 302);
  assert.equal(minhagNumber('SCA Minhag of the Week 309: "The Arayat"'), 309);
  assert.equal(minhagNumber('Minhag of the Week- Introduction Video'), null);
  assert.equal(youtubeIdOf('https://www.youtube.com/watch?v=jxgvwksK7mI&list=PL'), 'jxgvwksK7mI');
  const classes = [
    { id: 'yt:a', youtubeId: 'aaaaaaaaaaa', title: 'SCA Minhag of the Week 297: "Tiqun Leil Shabuot"', date: '2026-05-21T10:00:00.000Z' },
    { id: 'yt:b', youtubeId: 'bbbbbbbbbbb', title: 'Tish’a Be’Ab', date: '2023-07-27T10:00:00.000Z' },
    { id: 'yt:c', youtubeId: 'ccccccccccc', title: 'Rabbi David Tawil: Bava Kama 77 (daf yomi)', date: '2024-01-19T10:00:00.000Z' },
  ];
  const old = [
    { id: 1, title: 'SCA Minhag of the Week 297: "Tiqun Leil Shabuot"', date: '2026-05-20', minhag: true, by: 'Mr. Joey Mosseri', link: '', file: '' },
    { id: 2, title: 'Tish’a Be’Ab', date: '2023-07-27', by: 'Rabbi Joseph Beyda', link: '', file: 'x.mp4' },
    { id: 3, title: 'Bava Kama 77', date: '2024-01-18', by: 'Rabbi David Tawil', link: '', file: 'y.mp4' },
    { id: 4, title: 'Bava Kama 32', date: '2023-12-04', by: 'Rabbi David Tawil', link: '', file: 'z.mp4', type: 'video', active: true },
    { id: 5, title: 'Something else entirely', date: '2021-01-01', by: 'Rabbi A', link: 'https://www.youtube.com/watch?v=ccccccccccc', file: '' },
  ];
  const pairs = pairUp(old, classes);
  assert.equal(pairs.get(old[0]).id, 'yt:a'); assert.equal(pairs.get(old[1]).id, 'yt:b'); assert.equal(pairs.get(old[2]).id, 'yt:c'); assert.equal(pairs.get(old[4]).id, 'yt:c');
  assert.ok(!pairs.has(old[3]));
  assert.ok(playable(old[3]) && !playable({ ...old[3], file: 'a.ogg' }) && !playable({ ...old[3], active: false }) && !playable({ ...old[3], type: 'document', file: 'a.pdf' }));
});

test('split: newest classes open first, every teacher keeps a class, nothing is lost', async () => {
  const { split } = await import('./split.mjs');
  const classes = [];
  for (let i = 0; i < 900; i++) classes.push({ id: 'n' + i, teacherId: 'busy', date: String(9000 - i) });
  classes.push({ id: 'q1', teacherId: 'quiet', date: '0003' }, { id: 'q2', teacherId: 'quiet', date: '0002' }, { id: 'q3', teacherId: 'quiet', date: '0001' });
  const { app, older } = split({ classes, docs: [{ id: 'd' }], topics: ['x'] });
  assert.equal(app.classes.length, 502);
  assert.equal(app.older, 401);
  assert.deepEqual(app.classes.slice(-2).map((c) => c.id), ['q1', 'q2']);
  assert.equal(app.classes.length + older.classes.length, classes.length);
  assert.equal(older.docs.length, 1);
  assert.equal(split({ classes: classes.slice(0, 10), docs: [] }).older, null);
});

test('staff sheet: tabs are read by their headings, and another tab is never mistaken for one', async () => {
  const { staffRows, applyTeacherEdits, isoDate, modeOf, dayOf } = await import('./lib/staff.mjs');
  const csv = '"How to use this tab: one row per fix","","","","",""\n"Class title contains","Only for this teacher","Hide","Change topic to","Move to teacher","Note"\n"Kidushin 44","Rabbi Labaton","","","Rabbi Dr. Richard Hidary","wrong name"\n"Sample class","","yes","","","Example - delete me"\n"Test upload","","yes","","",""\n';
  const rows = staffRows(csv, 'fixes');
  assert.equal(rows.length, 2); // the example row is ignored
  assert.equal(rows[0].moveTo, 'Rabbi Dr. Richard Hidary');
  assert.equal(staffRows('"Category","Name","Phone","Email"\n"Mohel","Someone","1","a@b.c"\n', 'fixes'), null);
  assert.equal(staffRows('"Category","Name","Phone","Email"\n"Mohel","Someone","1","a@b.c"\n', 'teachers'), null);
  assert.equal(isoDate('12/5/26'), '2026-12-05');
  assert.equal(isoDate('2026-12-05'), '2026-12-05');
  assert.equal(modeOf('In person'), 'inperson');
  assert.equal(modeOf('Zoom'), 'zoom');
  assert.equal(dayOf('Wednesday'), 'Wed');
  const teachers = [{ id: 'a-b', name: 'Rabbi A B', title: 'Old', bio: '', photo: '', feed: 'f' }, { id: 'c-d', name: 'Mrs. C D', title: '', bio: '', photo: '', feed: '' }];
  const same = (x, y) => x.replace(/^\S+ /, '') === y.replace(/^\S+ /, '');
  const hidden = applyTeacherEdits(teachers, [{ name: 'Rabbi A B', title: 'New', feed: '' }, { name: 'Mrs. C D', hide: 'yes' }, { name: 'Rabbi E F', feed: 'https://x/feed' }], same, (n) => n.toLowerCase().replace(/[^a-z]+/g, '-'));
  assert.equal(teachers[0].title, 'New');
  assert.equal(teachers[0].feed, 'f'); // a blank cell changes nothing
  assert.deepEqual(hidden, ['Mrs. C D']);
  assert.equal(teachers[2].feed, 'https://x/feed');
});

test('staff fixes: a class can be moved to the right teacher, and a fix that matches nothing is reported', () => {
  const classes = [{ id: '1', teacherId: 'labaton', title: 'Kidushin 44' }, { id: '2', teacherId: 'hidary', title: 'Kidushin 44' }, { id: '3', teacherId: 'labaton', title: 'Lonely Man of Faith' }];
  const names = { labaton: 'Rabbi Labaton', hidary: 'Rabbi Hidary' };
  const out = applyOverrides(classes, [{ match: 'kidushin 44', teacher: 'Rabbi Labaton', moveTo: 'Rabbi Hidary' }, { match: 'nothing like this', hide: 'yes' }, { match: 'Lonely', moveTo: 'Rabbi Nobody' }],
    (n) => Object.keys(names).find((k) => names[k] === n) || null, (a, b) => a === b, (id) => names[id]);
  assert.deepEqual(out.map((c) => c.teacherId), ['hidary', 'hidary', 'labaton']);
  assert.equal(out.moved, 1);
  assert.equal(out.problems.length, 2);
});

test('old archive: a video whose title names its speaker is not paired with someone else\'s talk of the same series', async () => {
  const { pairUp, namesSomeoneElse } = await import('./lib/archive.mjs');
  const classes = [
    { id: 'a', title: 'SCA "I Remember" Yom Yerushalayim 2020: Mr. Harry Catton', date: '2020-05-21T12:00:00Z' },
    { id: 'b', title: 'SCA "I Remember" Yom Yerushalayim 2020: Rabbi Moshe Shamah', date: '2020-05-22T12:00:00Z' },
  ];
  const old = [{ id: 3840, title: 'Yom Yerushalayim: I Remember', date: '2020-05-22', by: 'Rabbi Moshe Shamah' }];
  assert.equal(pairUp(old, classes).get(old[0]).id, 'b');
  assert.equal(pairUp(old, classes.slice(0, 1)).size, 0);
  assert.equal(namesSomeoneElse('Hilkhot Shabbat: Class 4', 'Rabbi Moshe Shamah'), false);
  assert.equal(namesSomeoneElse('Remembering Rabbi Dr. Ezra Labaton', 'Dr. Sara Labaton'), true);
});
