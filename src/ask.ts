// "Ask a question": finds classes by what was said in them, using the AI summaries and the words of each class.
// Everything runs on the phone; the question is not sent anywhere.
import type { SearchEntry } from './types';
import { fold, skeleton } from './search';

const SKIP = new Set('a an the and or but of to in on at for from with about into by as is are was were be been am do does did can could should would may might must will shall have has had i me my we our you your he she it they them their this that these those there what which who whom whose why how when where if so not no yes any some all one im its class classes shiur shiurim lesson talk tell find deal deals dealing topic question want need know please allowed allow permitted'.split(' '));

type Field = { words: Set<string>; skels: Set<string>; stems: Set<string>; weight: number };
// clothes / clothing, vows / vow, donated / donate
const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|es|ed|s|e)$/, '') : w);
type Ready = { e: SearchEntry; fields: Field[]; parts: Field[] };

const field = (text: string, weight: number): Field => {
  const words = fold(text).split(' ').filter(Boolean);
  return { words: new Set(words), skels: new Set(words.map(skeleton)), stems: new Set(words.map(stem)), weight };
};
const has = (f: Field, token: string, sk: string) => f.words.has(token) || f.stems.has(stem(token)) || (sk.length >= 3 && f.skels.has(sk)) || (token.length >= 5 && [...f.words].some((w) => w.startsWith(token)));

export function prepare(entries: SearchEntry[], titleOf: (sid: string) => string): Ready[] {
  return entries.map((e) => ({
    e,
    fields: [field(titleOf(e.i), 5), field(e.s, 4), field(e.q, 3), field(e.c.join(' '), 3), field(e.m, 2), field(e.t, 1)],
    parts: e.c.map((c) => field(c, 1)),
  }));
}

export const questionWords = (query: string) => fold(query).split(' ').filter((w) => w.length > 1 && !SKIP.has(w) && !/^\d+$/.test(w));

export type Answer = { sid: string; score: number; summary: string; part: number };

// Classes that deal with the question, best first. `part` is the part of the class that matches best (-1 if none stands out).
export function ask(query: string, ready: Ready[], limit = 6): Answer[] {
  const tokens = questionWords(query);
  if (!tokens.length) return [];
  const sk = tokens.map(skeleton);
  const need = Math.max(1, Math.ceil(tokens.length * 0.6));
  const out: Answer[] = [];
  for (const r of ready) {
    let score = 0, hit = 0, strong = 0;
    tokens.forEach((t, i) => {
      const f = r.fields.find((x) => has(x, t, sk[i]));
      if (f) { score += f.weight; hit++; if (f.weight > 1) strong++; }
    });
    // Every class says thousands of words, so a match only in passing speech is not enough by itself.
    if (hit < need || strong === 0) continue;
    let part = -1, best = 0;
    r.parts.forEach((p, n) => { const m = tokens.filter((t, i) => has(p, t, sk[i])).length; if (m > best) { best = m; part = n; } });
    out.push({ sid: r.e.i, score: score / tokens.length + hit / tokens.length, summary: r.e.m, part });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
