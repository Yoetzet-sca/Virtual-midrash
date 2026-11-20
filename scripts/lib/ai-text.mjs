import { TOPICS } from './topics.mjs';

// Text helpers for the AI step: the search words kept from a transcript, and reading the model's reply.
const STOP = new Set(('a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its just like me more most my no nor not now of off on once only or other our ours out over own really right said same say says she so some such than that the their theirs them then there these they thing things think this those through to too under until up us very was we well were what when where which while who whom why will with would yeah yes you your yours know going gonna okay ok get got one two let lets see want mean kind sort lot little bit much many way actually basically maybe something anything everything').split(' '));

// The distinct meaningful words of a transcript, most frequent first. This is what search runs on;
// the transcript itself is never sent to phones.
export function searchTerms(text, limit = 1200) {
  const counts = new Map();
  for (const w of String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').split(/[^a-z0-9֐-׿]+/)) {
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map((e) => e[0]);
}

const clock = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const seconds = (s) => { const m = String(s).match(/^\[?\s*(\d+(?::\d+){1,2})\s*\]?$/); return m ? m[1].split(':').map(Number).reduce((a, b) => a * 60 + b, 0) : NaN; };

// The transcript with a time mark about every 45 seconds, so the model can say where each part starts.
export function timedTranscript(segments, every = 45) {
  let out = '', last = -Infinity;
  for (const s of segments || []) {
    if (s.start - last >= every) { out += `\n[${clock(s.start)}] `; last = s.start; }
    out += s.text + ' ';
  }
  return out.trim();
}

// The reverse: a transcript written with [m:ss] marks, back into timed pieces.
export function parseTimedTranscript(text) {
  const out = [];
  for (const m of String(text).matchAll(/\[(\d+(?::\d+){1,2})\]\s*([^\[]*)/g)) {
    const words = m[2].replace(/\s+/g, ' ').trim();
    if (words) out.push({ start: seconds(m[1]), end: seconds(m[1]), text: words });
  }
  return out.filter((s, i) => Number.isFinite(s.start) && (i === 0 || s.start >= out[i - 1].start));
}

// Models sometimes wrap JSON in a code fence or add a stray sentence; take the outermost object.
export function parseModelJson(reply, durationSec = Infinity) {
  const s = String(reply);
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('the model did not return JSON');
  const o = JSON.parse(s.slice(a, b + 1));
  const list = (v, n) => (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean).slice(0, n);
  const summary = String(o.summary || '').trim();
  if (!summary) throw new Error('the model returned no summary');
  const chapters = (Array.isArray(o.chapters) ? o.chapters : [])
    .map((c) => ({ at: seconds(c?.at), title: String(c?.title || '').trim().slice(0, 90), about: String(c?.about || '').trim().slice(0, 160) }))
    .filter((c) => c.title && Number.isFinite(c.at) && c.at >= 0 && c.at < durationSec - 20)
    .sort((x, y) => x.at - y.at).filter((c, i, all) => i === 0 || c.at - all[i - 1].at >= 30).slice(0, 12);
  return { summary: summary.slice(0, 600), subjects: list(o.subjects, 14), questions: list(o.questions, 8), quality: o.quality === 'poor' ? 'poor' : 'good', topic: TOPICS.includes(o.topic) ? o.topic : o.topic === 'Perasha' ? 'Parasha' : null, chapters };
}

// "Rabbi Dr. Richard Hidary" → "Rabbi Hidary"; "Mrs. Vivien Hidary" → "Mrs. Hidary"
export const shortName = (name) => { const w = String(name).trim().split(/\s+/); return w.length > 2 ? `${w[0]} ${w[w.length - 1]}` : w.join(' '); };

// ---- Checking a summary against the transcript -------------------------------------------------
// Words a summary may use to describe a class without the teacher having said them.
const FRAME = new Set('class classes lesson teacher rabbi explains explain explaining discusses discuss discussing examines examine examining explores explore exploring analyzes analyze analyzing covers cover covering goes going through reviews review reviewing looks looking addresses address addressing presents present presenting describes describe describing compares compare comparing focuses focus focusing considers consider considering teaches teach teaching including include includes various different several whether between their these those which while also then first second third final finally begins begin beginning ends concludes conclude concluding continues continue continuing section part parts topic topics subject subjects question questions answer answers source sources opinion opinions view views reason reasons meaning meanings explanation explanations discussion discussions detail details related based according regarding during along well such each other how what why when where who introduction overview summary practical conclusion conclusions'.split(' '));
const foldWord = (w) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'`]s?$/, '').replace(/[^a-z0-9\u0590-\u05ff]/g, '');
const stemWord = (w) => (w.length > 4 ? w.replace(/(ing|ied|ies|es|ed|ly|s|e|y)$/, '') : w);
// Speech recognition spells Hebrew by ear ("Masichet", "D'af"), so words are also compared by their consonants.
const bones = (w) => w.replace(/h$/, '').replace(/ch|kh/g, 'h').replace(/tz|ts|ss|z/g, 's').replace(/ph/g, 'f').replace(/ck|q|c/g, 'k').replace(/w|b/g, 'v').replace(/(.)\1+/g, '$1').replace(/(?!^)[aeiouy]/g, '');
const wordsOf = (text) => String(text).split(/[\s\-–—/]+/).map(foldWord).filter(Boolean);

// Does a class title name this perasha or holiday, however it is spelled? ("Vayetze 2026", "Parashat VaYesse" ↔ "Vayesse")
export function titleNames(title, name) {
  const opening = (w) => w.replace(/^(ch|kh)/, 'h').replace(/^(tz|ts)/, 's')[0];
  const same = (a, b) => a === b || (bones(a) === bones(b) && opening(a) === opening(b) && Math.abs(a.length - b.length) <= 3); // not consonants alone: "Vayesse" is not "Buys"
  const have = wordsOf(title), want = wordsOf(name);
  return want.length > 0 && want.every((n) => have.some((w) => same(n, w)));
}

// The meaningful words in `written` that cannot be found in the transcript (or the class title / teacher's name).
export function unsupported(written, transcript, alsoAllowed = '') {
  const said = wordsOf(transcript + ' ' + alsoAllowed);
  const exact = new Set(said), stems = new Set(said.map(stemWord)), skels = new Set(said.filter((w) => w.length >= 4).map(bones));
  const missing = new Set();
  for (const w of wordsOf(written)) {
    if (w.length < 4 || /^\d/.test(w) || STOP.has(w) || FRAME.has(w)) continue;
    if (exact.has(w) || stems.has(stemWord(w)) || (w.length >= 5 && skels.has(bones(w)))) continue;
    // "HaBetarim" said as "betarim", "Hallel" inside a longer run-together word
    if (w.length >= 6 && said.some((s) => s.length >= 5 && (s.includes(w.replace(/^(ha|ve|be|le)/, '')) || w.includes(s)))) continue;
    missing.add(w);
  }
  return [...missing];
}

// ---- The meaning check ----------------------------------------------------------------------------
// A second, separate request: given the transcript and what was written about it, list anything written that the
// transcript does not support. Wording is not its business (the word check above handles that); substance is.
export const checkPrompt = ({ title, transcript, summary, parts }) => `You are checking a short description of a recorded Torah class against the transcript of that class. The transcript was made by speech-recognition software, so Hebrew words and names are often misspelled.

Your only job is to find statements in the description that the transcript does not support. Flag:
- a person, book, source, law, custom, story, date or number that does not come up in the transcript;
- a statement that says something different from what the teacher said, or attributes to the teacher a view or conclusion the teacher did not give;
- anything that reads as background knowledge added by the writer.
Do not flag: paraphrase, an English word used for a Hebrew term, a different spelling of the same word or name, or the description leaving things out.

Judge the description's sentences and the list of parts separately. A part title is only a label for a stretch of the class: flag one only if that subject does not come up in the class at all, not because it is brief, loosely worded, or sits at a slightly different point.

Reply with one JSON object and nothing else: {"unsupported": [each unsupported statement from the description's sentences, quoted, with a few words saying why], "bad_parts": [the exact title of each part whose subject is not in the class]}. If everything is supported, reply {"unsupported": [], "bad_parts": []}.

Class title: ${title}

Description to check:
${summary}
${parts.length ? `Parts of the class, as listed: ${parts.join(' | ')}` : ''}

Transcript:
${transcript}`;

export function parseCheck(reply) {
  const s = String(reply), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('the checker did not return JSON');
  const o = JSON.parse(s.slice(a, b + 1));
  if (!Array.isArray(o.unsupported)) throw new Error('the checker returned no list');
  const list = (v, n) => (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter(Boolean).slice(0, n);
  return { claims: list(o.unsupported, 8), badParts: list(o.bad_parts, 12) };
}

export const summaryPrompt = ({ title, teacher, minutes, transcript, redo = '', fix = [] }) => `You are helping a synagogue community organization index recorded Torah classes so people can find them.

Below is an automatic transcript of a class, with time marks in square brackets like [12:30] (minutes:seconds from the start). It was made by speech-recognition software, so Hebrew and Aramaic words, names of rabbis and names of books are often misspelled or garbled. Use the title and context to work out what was meant.

Class title: ${title}
Teacher: ${teacher || 'not known — see the title and the recording'}
Length: about ${minutes} minutes

Wording, for everything you write: use the names this community uses, which are the ones the teacher uses in the class. The books of the Torah are Beresheet, Shemot, Vayikra, Bemidbar and Debarim, never Genesis, Exodus, Leviticus, Numbers or Deuteronomy; likewise Yehoshua, Shofetim, Shemuel, Melachim, Yeshayahu, Yirmiyahu, Yehezkel, Tehillim, Mishle, Iyob, Rut, Eicha, Kohelet rather than Joshua, Judges, Samuel, Kings, Isaiah, Jeremiah, Ezekiel, Psalms, Proverbs, Job, Ruth, Lamentations, Ecclesiastes. Tractates are spelled Berachot, Erubim, Pesahim, Beisah, Yebamot, Baba Kamma, Baba Metzia, Baba Batra, Shebuot, Abodah Zarah, Zebahim, Menahot, Hullin, Bechorot, Arachin. Holidays are Pesah, Shabuot, Sukkot, Shemini Aseret, Simhat Torah, Hanukkah, Tish'a BeAb. Weekly portions are spelled as in: Beresheet, Noah, Lech Lecha, Hayei Sara, Toledot, Vayesse, Vayishlah, Vayesheb, Mikess, Vayehi, Beshalah, Teruma, Tessave, Ki Tisa, Pekudei, Sav, Mesora, Aharei Mot, Behukotai, Behaalotekha, Shelah, Korah, Hukat, Pinehas, Debarim, Vaethanan, Ekeb, Shofetim, Ki Tesse, Ki Tabo, Nissabim. Say Hashem, Parasha, Bet HaMikdash, Berit. Call people what the teacher calls them (Abraham Abinu or Avraham Avinu, Moshe Rabbenu). Do not introduce English or academic terms the teacher did not use.

The most important rule: report only what is said in this transcript. Every source, person, book, chapter, law, story and idea you mention must be one the teacher actually speaks about in the recording, named with the teacher's own word for it. Do not add background, context, explanations, sources or conclusions from your own knowledge, even if they are correct and even if they would make the summary clearer. Do not guess at what a garbled passage "probably" covers; leave it out. A shorter summary that is entirely from the transcript is better than a fuller one that is not.
${redo ? `\nYour previous attempt used these words, which are not found in the transcript: ${redo}. Write it again without anything the teacher did not say.\n` : ''}${fix.length ? `\nA reviewer compared your previous attempt with the transcript and found these statements are not supported by it:\n${fix.map((x) => '- ' + x).join('\n')}\nWrite it again with those removed or corrected, and add nothing new in their place.\n` : ''}
Reply with one JSON object and nothing else, with these keys:
- "summary": 2 to 3 plain sentences (same spelling rules as below) saying what this class covers, written for someone deciding whether to listen. ${teacher ? `Begin with the teacher, as "${shortName(teacher)} ..." (for example "${shortName(teacher)} goes through ...").` : `Begin with the speaker's name if the title or the recording itself says who is teaching (for example "Rabbi Cohen goes through ..."); if it does not, begin "This class ...". Never begin with the name of the organization.`} Describe the topics; do not give halakhic rulings or conclusions as fact.
- "subjects": 6 to 12 short phrases naming the specific subjects, sources, people, laws or stories discussed. Spell Hebrew words the way the Sephardic community of Brooklyn does: "h" not "ch" for het (Hodesh, Hakhamim, Hinukh, Hasidim, Hasosrot), "t" not "s" for tav (Shabbat, Berakhot, Bet Din), "s" not "tz" for sadi (Misva, Sedaka), and Parasha, Halakha, Mishna, Masekhet, Bet HaMikdash. Keep the usual English spelling of people's names (Rabbi Chaim Kanievsky).
- "questions": 3 to 6 questions, in everyday language, that a person might ask and that this class addresses.
- "topic": exactly one of ${TOPICS.map((x) => `"${x}"`).join(', ')}, or null if none fits. Use "Daf Yomi" only for a class going through a page of Gemara as part of the daily daf; other Talmud classes are "Gemara". Practical law is "Halakha".
- "chapters": 3 to 10 parts of the class, in order, each {"at": the time mark where that part begins, copied from the transcript (for example "12:30"), "title": a short plain title for that part (under 60 characters), "about": a few key words for what is discussed there}. The first part starts where the teaching starts.
- "quality": "good", or "poor" if the transcript is too garbled or too short to summarize with confidence.

Transcript:
${transcript}`;
