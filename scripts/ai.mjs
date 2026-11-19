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
import { searchTerms, parseModelJson, summaryPrompt } from './lib/ai-text.mjs';

const run = promisify(execFile);
const root = new URL('..', import.meta.url);
const GROQ = process.env.GROQ_API_KEY, GEMINI = process.env.GEMINI_API_KEY;
const MAX_CLASSES = Number(process.env.AI_MAX_CLASSES || 20);
const MAX_MINUTES = Number(process.env.AI_MAX_MINUTES || 600);
const ONLY_UNDER_MIN = Number(process.env.AI_ONLY_UNDER_MINUTES || 75);
console.log(`Keys present — Groq: ${GROQ ? 'yes' : 'NO'}, Gemini: ${GEMINI ? 'yes' : 'NO'}`);
if (!GROQ || !GEMINI) { console.error('Both GROQ_API_KEY and GEMINI_API_KEY must be set as repository secrets.'); process.exit(1); }

const data = JSON.parse(await readFile(new URL('public/data/app.json', root), 'utf8'));
await mkdir(new URL('content/ai/', root), { recursive: true });
await mkdir(new URL('ai-transcripts/', root), { recursive: true });
await mkdir(new URL('.ai-tmp/', root), { recursive: true });
const teacherName = (id) => data.teachers.find((t) => t.id === id)?.name || id;
const aiFile = (c) => new URL(`content/ai/${c.sid}.json`, root);
const txFile = (c) => new URL(`ai-transcripts/${c.sid}.json`, root);

// Take turns between teachers, newest first, so a small run covers a mix.
const todo = data.classes.filter((c) => c.kind === 'audio' && c.sid && c.audioUrl && !existsSync(aiFile(c)) && c.durationSec > 120 && c.durationSec <= ONLY_UNDER_MIN * 60);
const byTeacher = new Map();
for (const c of todo) { if (!byTeacher.has(c.teacherId)) byTeacher.set(c.teacherId, []); byTeacher.get(c.teacherId).push(c); }
const queue = [];
for (let i = 0; queue.length < todo.length; i++) for (const list of byTeacher.values()) if (list[i]) queue.push(list[i]);
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
  form.append('prompt', 'A Torah class from the Sephardic community of Brooklyn. Words that may come up: Perasha, Halakha, Gemara, Mishna, Rashi, Rambam, Shulhan Arukh, Berakhot, Shabbat, Bava Batra, Arakhin, Tosafot, pasuk, Hashem, misvah, tefillah, Hakhamim.');
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

async function summarize(c, transcript) {
  const body = { contents: [{ role: 'user', parts: [{ text: summaryPrompt({ title: c.title, teacher: teacherName(c.teacherId), minutes: Math.round(c.durationSec / 60), transcript: transcript.slice(0, 120000) }) }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } };
  let last = 'no model available';
  for (const model of [...(await geminiModels())]) {
    let r;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'x-goog-api-key': GEMINI, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(90000) });
    } catch (e) { last = `${model}: no answer in 90 seconds`; console.log(`  (${last}; trying the next model)`); drop(model); continue; }
    if (r.ok) {
      const text = (await r.json()).candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      try { return { ...parseModelJson(text), model }; } catch (e) { last = `${model}: ${e.message}`; console.log(`  (${last})`); continue; }
    }
    last = `${model} ${r.status}: ${(await r.text()).replace(/\s+/g, ' ').slice(0, 160)}`;
    console.log(`  (${last})`);
    if (r.status === 429 || r.status === 404 || r.status === 503) drop(model); // no free allowance, or not available: stop asking it this run
  }
  if (/ 429:/.test(last)) throw new SlowDown(`Gemini rate limit: ${last}`);
  throw new Error(`Gemini: ${last}`);
}

let done = 0, minutes = 0, failed = 0, groqResting = false;
for (const c of queue) {
  if (done >= MAX_CLASSES || minutes >= MAX_MINUTES) break;
  if (groqResting && !existsSync(txFile(c))) continue; // only finish ones already transcribed
  const mins = Math.round(c.durationSec / 60);
  try {
    let tx = existsSync(txFile(c)) ? JSON.parse(await readFile(txFile(c), 'utf8')) : null; // already transcribed on an earlier run
    if (!tx) { tx = await transcribe(c); await writeFile(txFile(c), JSON.stringify({ id: c.id, title: c.title, ...tx })); minutes += mins; }
    const ai = await summarize(c, tx.text);
    await writeFile(aiFile(c), JSON.stringify({ id: c.id, title: c.title, summary: ai.summary, subjects: ai.subjects, questions: ai.questions, quality: ai.quality, terms: searchTerms(tx.text).join(' '), words: tx.text.split(/\s+/).length, language: tx.language, made: new Date().toISOString().slice(0, 10), by: `groq whisper + ${ai.model}` }, null, 1));
    done++;
    console.log(`\n✓ ${teacherName(c.teacherId)} — ${c.title} (${mins} min, ${tx.text.split(/\s+/).length} words${tx.sentMb ? ', sent ' + tx.sentMb + ' MB' : ''}, ${ai.model}${ai.quality === 'poor' ? ', marked POOR' : ''})`);
    console.log(`  Summary: ${ai.summary}`);
    console.log(`  Subjects: ${ai.subjects.join('; ')}`);
    console.log(`  Questions: ${ai.questions.join(' | ')}`);
    console.log(`  Transcript opens: ${tx.text.slice(0, 220).replace(/\s+/g, ' ')}…`);
  } catch (e) {
    if (e instanceof SlowDown && /^Groq/.test(e.message) && !groqResting) { groqResting = true; console.log(`\n⏸ Transcription paused — ${e.message}`); continue; }
    if (e instanceof SlowDown) { console.log(`\n⏸ Stopping for now — ${e.message}`); break; }
    failed++;
    console.log(`\n! ${teacherName(c.teacherId)} — ${c.title}: ${e.message}`);
    if (failed >= 4) { console.log('Too many failures in a row; stopping.'); break; }
  }
}
await rm(new URL('.ai-tmp/', root), { recursive: true, force: true });
console.log(`\nDone this run: ${done} classes (${minutes} minutes transcribed). Still waiting: ${todo.length - done}.`);
