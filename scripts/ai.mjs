// The AI step: transcribe classes and write a summary, subjects and questions for each, for search.
//
//   1. Reads the class list (public/data/app.json — run `npm run data` first).
//   2. For classes not done yet: downloads the audio to this machine only for the moment it takes to
//      shrink it, sends it to Groq (Whisper) for a transcript, then sends the transcript text to Gemini.
//   3. Saves what the site publishes in content/ai/<id>.json (summary, subjects, questions, search words).
//      The full transcripts go to ai-transcripts/ (kept in the job's private cache, not in the repository).
//
// It stops cleanly when a service says "slow down" (rate limit); the next run carries on from there.
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { searchTerms, parseModelJson, summaryPrompt, timedTranscript, parseTimedTranscript, unsupported, titleNames, checkPrompt, parseCheck } from './lib/ai-text.mjs';
import { weekInfo } from './lib/calendar.mjs';
import { samePerson } from './lib/youtube.mjs';

const VERSION = 5; // 5: every summary passes a separate meaning check against the transcript, or is not shown
// was 4: // 4: only what the teacher said (checked against the transcript), and the summary names the teacher
// was 3: // 3: the community's own names for books and people (Bereshit, not Genesis)
// was 2: // 2 adds the topic and the parts of the class; older files are redone from the saved transcript

const run = promisify(execFile);
const root = new URL('..', import.meta.url);
const GROQ = process.env.GROQ_API_KEY, GEMINI = process.env.GEMINI_API_KEY;
const MAX_CLASSES = Number(process.env.AI_MAX_CLASSES || 20);
const MAX_MINUTES = Number(process.env.AI_MAX_MINUTES || 600);
const ONLY_UNDER_MIN = Number(process.env.AI_ONLY_UNDER_MINUTES || 75);
const TOTAL_CAP = Number(process.env.AI_TOTAL_CAP || 0); // stop once this many classes have summaries in all (0 = no cap)
console.log(`Keys present — Groq: ${GROQ ? 'yes' : 'NO'}, Gemini: ${GEMINI ? 'yes' : 'NO'}`);
if (!GROQ || !GEMINI) { console.error('Both GROQ_API_KEY and GEMINI_API_KEY must be set as repository secrets.'); process.exit(1); }

const data = JSON.parse(await readFile(new URL('public/data/app.json', root), 'utf8'));
const settings = JSON.parse(await readFile(new URL('content/settings.json', root), 'utf8'));
await mkdir(new URL('content/ai/', root), { recursive: true });
await mkdir(new URL('ai-transcripts/', root), { recursive: true });
await mkdir(new URL('.ai-tmp/', root), { recursive: true });
const teacherName = (id) => data.teachers.find((t) => t.id === id)?.name || id;
const aiFile = (c) => new URL(`content/ai/${c.sid}.json`, root);
// Videos filed under the SCA itself (no teacher matched) are redone once more so the summary names the speaker, not the organization.
const need = (c) => (c.teacherId === 'sca' ? VERSION + 2 : VERSION);
// Who is teaching: the teacher the class is filed under, or for an SCA-channel video the name the video itself gives.
const speakerOf = (c, tx) => (c.teacherId === 'sca' ? tx.speaker || '' : teacherName(c.teacherId));
// A series with known presenters (Minhag of the Week): a name the video step reports is kept only if it is one of them.
// Anything else — a person mentioned in the class, or a mistake — is dropped, so a summary never names the wrong person.
const seriesOf = (c) => (settings.videoSeries || []).find((s) => c.title.toLowerCase().includes(s.titleHas.toLowerCase()));
const presenter = (c, name) => { const s = seriesOf(c); if (!s || !name) return name || ''; return s.presenters.find((p) => samePerson(p, name)) || ''; };
const upToDate = (c) => { try { const f = JSON.parse(readFileSync(aiFile(c), 'utf8')); return (f.v || 1) >= need(c) && (f.speaker || '') === presenter(c, f.speaker); } catch { return false; } };
const txFile = (c) => new URL(`ai-transcripts/${c.sid}.json`, root);

// Take turns between teachers, newest first, so a small run covers a mix.
const todo = data.classes.filter((c) => c.kind === 'audio' && !c.film && c.sid && c.audioUrl && !upToDate(c) && c.durationSec > 120 && c.durationSec <= ONLY_UNDER_MIN * 60);
const todoAll = data.classes.filter((c) => c.kind === 'audio' && !c.film && c.sid && c.audioUrl && c.durationSec > 120 && c.durationSec <= ONLY_UNDER_MIN * 60).length;
// The order classes are done in. The free transcription allowance is small next to the whole archive, so it goes first
// to what people are about to look for:
//   0. classes already transcribed on an earlier run (only the summary is left to write)
//   1. this week's and next week's perasha, from any year
//   2. a holiday coming in the next six weeks
//   3. everything else
// and within each group, newest first, taking turns between teachers.
const nyDay = (plus = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() + plus * 86400000));
const soon = [];
try {
  const a = weekInfo(nyDay(0)), b = weekInfo(nyDay(7));
  for (const p of [a.perasha, b.perasha]) for (const name of p?.search || []) soon.push({ name, tier: 1 });
  if (a.holiday && (new Date(a.holiday.date) - Date.now()) / 86400000 <= 42) soon.push({ name: a.holiday.name, tier: 2 });
  console.log(`Doing first: classes on ${soon.map((s) => s.name).join(', ') || 'nothing in particular'}.`);
} catch (e) { console.log(`(could not read the calendar, so going newest first: ${e.message})`); }
const tierOf = (c) => (existsSync(txFile(c)) ? 0 : soon.find((s) => titleNames(c.title, s.name))?.tier ?? 3);
const queue = [];
for (const tier of [0, 1, 2, 3]) {
  const byTeacher = new Map();
  for (const c of todo) if (tierOf(c) === tier) { if (!byTeacher.has(c.teacherId)) byTeacher.set(c.teacherId, []); byTeacher.get(c.teacherId).push(c); }
  const size = [...byTeacher.values()].reduce((n, l) => n + l.length, 0);
  if (tier > 0 && tier < 3 && size) console.log(`  ${size} waiting classes match ${tier === 1 ? 'the perasha' : 'the holiday'}.`);
  for (let i = 0, added = 0; added < size; i++) for (const list of byTeacher.values()) if (list[i]) { queue.push(list[i]); added++; }
}
console.log(`${todo.length} classes waiting; this run will try up to ${MAX_CLASSES} (or ${MAX_MINUTES} minutes of audio).`);

class SlowDown extends Error {}

async function transcribe(c) {
  const src = new URL(`.ai-tmp/${c.sid}.src`, root), small = new URL(`.ai-tmp/${c.sid}.mp3`, root);
  const res = await fetch(c.audioUrl, { signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`audio download ${res.status}`);
  await writeFile(src, Buffer.from(await res.arrayBuffer()));
  // Speech only needs a small file: mono, 16 kHz. Keeps every class under the service's 25 MB limit.
  const kbps = Math.max(12, Math.min(24, Math.floor((23 * 8 * 1024) / Math.max(60, c.durationSec))));
  await run('ffmpeg', ['-v', 'error', '-y', '-i', src.pathname, '-ac', '1', '-ar', '16000', '-b:a', `${kbps}k`, small.pathname]);
  const bytes = (await stat(small)).size;
  const form = new FormData();
  form.append('file', new Blob([await readFile(small)], { type: 'audio/mpeg' }), 'class.mp3');
  form.append('model', process.env.GROQ_MODEL || 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  form.append('prompt', 'A Torah class from the Sephardic community of Brooklyn. Words that may come up: Parasha, Halakha, Gemara, Mishna, Rashi, Rambam, Shulhan Arukh, Berakhot, Shabbat, Bava Batra, Arakhin, Tosafot, pasuk, Hashem, misvah, tefillah, Hakhamim.');
  const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${GROQ}` }, body: form, signal: AbortSignal.timeout(300000) });
  await rm(src, { force: true }); await rm(small, { force: true });
  if (r.status === 429) throw new SlowDown(`Groq rate limit: ${(await r.text()).slice(0, 200)}`);
  if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { text: j.text || '', language: j.language || '', sentMb: +(bytes / 1048576).toFixed(1), segments: (j.segments || []).map((s) => ({ start: +s.start.toFixed(1), end: +s.end.toFixed(1), text: s.text.trim() })) };
}

// Gemini model names change often, so ask the service what it offers and prefer the newest "flash" text model.
let models = null;
async function geminiModels() {
  if (process.env.GEMINI_MODEL) return [process.env.GEMINI_MODEL.replace(/^models\//, '')];
  if (models) return models;
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': GEMINI } });
  if (!r.ok) throw new Error(`Gemini model list ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const all = ((await r.json()).models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
  const version = (n) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || 0);
  const plain = all.filter((n) => /^gemini-[\d.]+-flash(-lite)?$/.test(n)).sort((a, b) => version(b) - version(a) || a.length - b.length);
  const rest = all.filter((n) => /flash/.test(n) && !/(tts|image|live|audio|embedding|thinking)/.test(n) && !plain.includes(n)).sort((a, b) => version(b) - version(a));
  models = [...plain, ...rest].slice(0, 6);
  console.log(`Gemini models to try, in order: ${models.join(', ') || 'none found'}`);
  return models;
}

const drop = (model) => { if (models) models = models.filter((m) => m !== model); };

// Writing a summary, in three steps:
//   1. Ask for it. Check every meaningful word against the transcript; if it used words the teacher never said,
//      ask once more naming those words, and keep the attempt with fewer of them. (This keeps it in the teacher's terms.)
//   2. A separate request checks the meaning: does the transcript support every statement? (A different model, if there is one.)
//   3. If the checker lists anything, the summary is rewritten once with that list and checked again. If it still fails,
//      it is saved as not fit to show, and the app shows no summary for that class.
async function summarize(c, tx) {
  const shown = (ai) => [ai.summary, ...ai.chapters.map((x) => x.title)].join(' ');
  const allowed = `${c.title} ${teacherName(c.teacherId)} ${tx.speaker || ''}`;
  const words = (ai) => { ai.unsupported = unsupported(shown(ai), tx.text, allowed); return ai; };
  let best = words(await askGemini(c, tx));
  if (best.unsupported.length) {
    console.log(`  (first attempt used words not in the transcript: ${best.unsupported.join(', ')}; asking again)`);
    try { const again = words(await askGemini(c, tx, { redo: best.unsupported.join(', ') })); if (again.unsupported.length < best.unsupported.length) best = again; }
    catch (e) { if (e instanceof SlowDown) throw e; }
  }
  best.claims = await checkMeaning(c, tx, best);
  if (best.claims.length) {
    console.log(`  (meaning check found ${best.claims.length} unsupported: ${best.claims.join(' / ').slice(0, 300)}; rewriting)`);
    const again = words(await askGemini(c, tx, { fix: best.claims }));
    again.claims = await checkMeaning(c, tx, again);
    if (again.claims.length <= best.claims.length) best = again;
  }
  if (best.claims.length) best.quality = 'poor'; // not shown
  return best;
}

async function checkMeaning(c, tx, ai) {
  const transcript = (tx.segments?.length ? timedTranscript(tx.segments) : tx.text).slice(0, 140000);
  return gemini([{ text: checkPrompt({ title: c.title, transcript, summary: ai.summary, parts: ai.chapters.map((x) => x.title) }) }], (text) => parseCheck(text), { notFirst: ai.model });
}

// One request to Gemini, trying its models in turn. `accept` turns the reply into the result, or throws to try the next model.
async function gemini(parts, accept, { json = true, seconds = 90, extra = {}, notFirst = '' } = {}) {
  const body = { contents: [{ role: 'user', parts }], generationConfig: { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}), ...extra } };
  let last = 'no model available';
  const order = [...(await geminiModels())];
  if (notFirst && order.length > 1 && order[0] === notFirst) order.push(order.shift()); // a checker should not be the writer when another model is on hand
  for (const model of order) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': GEMINI, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(seconds * 1000) });
    } catch (e) { last = `${model}: no answer in ${seconds} seconds`; console.log(`  (${last}; trying the next model)`); drop(model); continue; }
    if (r.ok) {
      const text = (await r.json()).candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      try { const out = accept(text, model); if (models) models = [model, ...models.filter((m) => m !== model)]; /* ask the one that answered first next time */ return out; } catch (e) { last = `${model}: ${e.message}`; console.log(`  (${last})`); continue; }
    }
    last = `${model} ${r.status}: ${(await r.text()).replace(/\s+/g, ' ').slice(0, 160)}`;
    console.log(`  (${last})`);
    if (r.status === 429 || r.status === 404) drop(model); // no free allowance, or not available: stop asking it this run
  }
  if (/ 429:/.test(last)) throw new SlowDown(`Gemini rate limit: ${last}`);
  throw new Error(`Gemini: ${last}`);
}

const lengthOf = (c, tx) => c.durationSec || (tx.segments?.length ? tx.segments[tx.segments.length - 1].start + 60 : 0);

async function askGemini(c, tx, { redo = '', fix = [] } = {}) {
  const transcript = tx.segments?.length ? timedTranscript(tx.segments) : tx.text;
  const secs = lengthOf(c, tx);
  const prompt = summaryPrompt({ title: c.title, teacher: speakerOf(c, tx), minutes: Math.round(secs / 60), transcript: transcript.slice(0, 140000), redo, fix });
  return gemini([{ text: prompt }], (text, model) => ({ ...parseModelJson(text, secs || Infinity), model }));
}

// A YouTube video has no audio file to send for transcription. Gemini is given the public link and writes the transcript
// itself; the summary is then made from that transcript exactly as for audio classes.
async function transcribeVideo(c) {
  // A series with known presenters: the names and their spelling are given, but which one it is must still come from the video.
  const series = seriesOf(c);
  const hint = series ? ` This series is always presented by one of: ${series.presenters.join(', ')}. Use that spelling. Name one of them only if the video shows or says which; if it does not, write "SPEAKER: unknown".` : '';
  const ask = `Transcribe the speech in this video word for word, in the language spoken. Do not summarize, tidy, translate or add anything; write what is said. Begin a new line about every 45 seconds, and start each line with the time in the video in square brackets, like [0:00] or [12:30]. Before the transcript, write one line: "SPEAKER: " followed by the name of the person teaching, but only if the video shows the name in writing (a title card or caption) or the name is said aloud; otherwise write "SPEAKER: unknown". Never work out who it is from how a person looks. ${hint} After that line, reply with the transcript only.`;
  // Sound is what matters here, so the picture is sampled sparsely to keep the request small.
  const parts = [{ fileData: { fileUri: `https://www.youtube.com/watch?v=${c.youtubeId}` }, videoMetadata: { fps: 0.1 } }, { text: ask }];
  return gemini(parts, (text) => {
    const segments = parseTimedTranscript(text);
    const words = segments.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
    if (segments.length < 3 || words < 150) throw new Error(`the transcript came back too short (${words} words)`);
    const named = (text.match(/^\s*SPEAKER:\s*(.+)$/m)?.[1] || '').trim();
    const speaker = /^unknown\b|^n\/?a$|^none$/i.test(named) ? '' : named.slice(0, 60);
    return { text: segments.map((s) => s.text).join(' '), language: '', segments, by: 'gemini', speaker };
  }, { json: false, seconds: 420, extra: { mediaResolution: 'MEDIA_RESOLUTION_LOW', maxOutputTokens: 60000 } });
}

const already = todoAll - todo.length;
if (TOTAL_CAP && already >= TOTAL_CAP) { console.log(`Trial cap reached: ${already} classes have summaries (cap ${TOTAL_CAP}). Nothing to do.`); process.exit(0); }
let done = 0, minutes = 0, failed = 0, groqResting = false, stoppedByGemini = false;
for (const c of queue) {
  if (done >= MAX_CLASSES || minutes >= MAX_MINUTES || (TOTAL_CAP && already + done >= TOTAL_CAP)) break;
  if (groqResting && !existsSync(txFile(c))) continue; // only finish ones already transcribed
  const mins = Math.round(c.durationSec / 60);
  try {
    let tx = existsSync(txFile(c)) ? JSON.parse(await readFile(txFile(c), 'utf8')) : null; // already transcribed on an earlier run
    if (!tx) { tx = await transcribe(c); await writeFile(txFile(c), JSON.stringify({ id: c.id, title: c.title, ...tx })); minutes += mins; }
    const ai = await summarize(c, tx);
    await writeFile(aiFile(c), JSON.stringify({ v: need(c), id: c.id, title: c.title, topic: ai.topic, chapters: ai.chapters, unsupported: ai.unsupported, claims: ai.claims, summary: ai.summary, subjects: ai.subjects, questions: ai.questions, quality: ai.quality, terms: searchTerms(tx.text).join(' '), words: tx.text.split(/\s+/).length, language: tx.language, made: new Date().toISOString().slice(0, 10), by: `groq whisper + ${ai.model}` }, null, 1));
    done++;
    console.log(`\n✓ ${teacherName(c.teacherId)} — ${c.title} (${mins} min, ${tx.text.split(/\s+/).length} words${tx.sentMb ? ', sent ' + tx.sentMb + ' MB' : ''}, ${ai.model}${ai.quality === 'poor' ? ', marked POOR' : ''})`);
    console.log(`  Summary: ${ai.summary}`);
    console.log(`  Subjects: ${ai.subjects.join('; ')}`);
    console.log(`  Questions: ${ai.questions.join(' | ')}`);
    console.log(`  Meaning check: ${ai.claims.length ? 'FAILED, summary will not be shown — ' + ai.claims.join(' / ') : 'passed'}`);
    console.log(`  Words not found in the transcript: ${ai.unsupported.length ? ai.unsupported.join(', ') : 'none'}`);
    console.log(`  Topic: ${ai.topic || 'none'} (title rules said: ${c.topic || 'none'})`);
    console.log(`  Parts: ${ai.chapters.map((x) => `${Math.floor(x.at / 60)}:${String(x.at % 60).padStart(2, '0')} ${x.title}`).join(' | ')}`);
    console.log(`  Transcript opens: ${tx.text.slice(0, 220).replace(/\s+/g, ' ')}…`);
  } catch (e) {
    if (e instanceof SlowDown && /^Groq/.test(e.message) && !groqResting) { groqResting = true; console.log(`\n⏸ Transcription paused — ${e.message}`); continue; }
    if (e instanceof SlowDown) { stoppedByGemini = true; console.log(`\n⏸ Stopping for now — ${e.message}`); break; }
    failed++;
    console.log(`\n! ${teacherName(c.teacherId)} — ${c.title}: ${e.message}`);
    if (failed >= 4) { console.log('Too many failures in a row; stopping.'); break; }
  }
}
// ---- Videos (YouTube channels marked "aiSummaries" in content/settings.json) --------------------
const MAX_VIDEOS = Number(process.env.AI_MAX_VIDEOS || 3);
const videos = data.classes.filter((c) => c.kind === 'video' && c.ai && c.youtubeId && c.sid && !upToDate(c));
let videosDone = 0;
if (videos.length && !stoppedByGemini) console.log(`\n${videos.length} videos waiting; this run will try up to ${MAX_VIDEOS}.`);
for (const c of stoppedByGemini ? [] : videos) {
  if (videosDone >= MAX_VIDEOS) break;
  try {
    let tx = existsSync(txFile(c)) ? JSON.parse(await readFile(txFile(c), 'utf8')) : null;
    if (tx && tx.speaker === undefined) tx = null; // made before the speaker's name was recorded
    if (tx) tx.speaker = presenter(c, tx.speaker);
    if (!tx) { tx = await transcribeVideo(c); tx.speaker = presenter(c, tx.speaker); await writeFile(txFile(c), JSON.stringify({ id: c.id, title: c.title, ...tx })); }
    const ai = await summarize(c, tx);
    await writeFile(aiFile(c), JSON.stringify({ v: need(c), id: c.id, title: c.title, topic: ai.topic, chapters: ai.chapters, unsupported: ai.unsupported, claims: ai.claims, summary: ai.summary, subjects: ai.subjects, questions: ai.questions, quality: ai.quality, terms: searchTerms(tx.text).join(' '), words: tx.text.split(/\s+/).length, language: '', speaker: tx.speaker || '', made: new Date().toISOString().slice(0, 10), by: `gemini (video) + ${ai.model}` }, null, 1));
    videosDone++;
    console.log(`\n✓ VIDEO ${speakerOf(c, tx) || 'speaker not named'} — ${c.title} (about ${Math.round(lengthOf(c, tx) / 60)} min, ${tx.text.split(/\s+/).length} words, ${ai.model}${ai.quality === 'poor' ? ', marked POOR' : ''})`);
    console.log(`  Summary: ${ai.summary}`);
    console.log(`  Meaning check: ${ai.claims.length ? 'FAILED, summary will not be shown — ' + ai.claims.join(' / ') : 'passed'}`);
    console.log(`  Words not found in the transcript: ${ai.unsupported.length ? ai.unsupported.join(', ') : 'none'}`);
    console.log(`  Topic: ${ai.topic || 'none'} (title rules said: ${c.topic || 'none'})`);
    console.log(`  Parts: ${ai.chapters.map((x) => `${Math.floor(x.at / 60)}:${String(x.at % 60).padStart(2, '0')} ${x.title}`).join(' | ')}`);
    console.log(`  Transcript opens: ${tx.text.slice(0, 220).replace(/\s+/g, ' ')}…`);
  } catch (e) {
    console.log(`\n! VIDEO ${c.title}: ${e.message}`);
    if (e instanceof SlowDown) break;
  }
}
await rm(new URL('.ai-tmp/', root), { recursive: true, force: true });
if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, `waiting=${todo.length - done}\n`, { flag: 'a' });
console.log(`\nDone this run: ${done} classes (${minutes} minutes transcribed) and ${videosDone} videos. Still waiting: ${todo.length - done} classes, ${videos.length - videosDone} videos.`);
