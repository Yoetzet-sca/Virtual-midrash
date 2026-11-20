// Everything personal (picks, follows, likes, the community code) lives on this phone only. No sign-in.
import { useSyncExternalStore } from 'react';

export type Prefs = {
  onboarded: boolean;
  topics: string[];
  following: string[];
  hidden: string[]; // teachers this person doesn't want in their feed
  liked: string[];
  saved: string[];
  code: string;
  seenAt: string; // when this person last looked at "new from teachers you follow"
  visits: number;
  installAsked: boolean; // the add-to-home-screen card was answered or dismissed
  rate: number; // playback speed
  positions: Record<string, [number, number]>; // class id -> [seconds in, when saved] for classes not finished
  swiped: boolean; // has learned the swipe directions, so the hint can go away
  // Quiet learning: small scores per topic and teacher, nudged by what people listen to, like and skip.
  learned: Record<string, number>;
};
const KEY = 'vm.prefs.v1';
const empty: Prefs = { onboarded: false, topics: [], following: [], hidden: [], liked: [], saved: [], code: '', seenAt: '', visits: 0, installAsked: false, rate: 1, positions: {}, swiped: false, learned: {} };

function read(): Prefs {
  try {
    const p: Prefs = { ...empty, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    // The topic once called "Perasha" is now "Parasha": carry over what this phone picked and learned under the old name.
    p.topics = [...new Set(p.topics.map((x) => (x === 'Perasha' ? 'Parasha' : x)))];
    if (p.learned['k:Perasha'] != null) { const { 'k:Perasha': old, ...rest } = p.learned; p.learned = { ...rest, 'k:Parasha': (rest['k:Parasha'] || 0) + old }; }
    return p;
  } catch { return empty; }
}
let state = read();
// Count app opens (used to time the add-to-home-screen suggestion).
try { state = { ...state, visits: (state.visits || 0) + 1 }; localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
const subs = new Set<() => void>();

export function setPrefs(patch: Partial<Prefs> | ((p: Prefs) => Partial<Prefs>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: keep in memory */ }
  subs.forEach((f) => f());
}
export const getPrefs = () => state;
export const usePrefs = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => state);

export const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export function learn(keys: (string | null | undefined)[], by: number) {
  setPrefs((p) => {
    const learned = { ...p.learned };
    for (const k of keys) if (k) learned[k] = Math.max(-10, Math.min(10, (learned[k] || 0) + by));
    return { learned };
  });
}

// Remember how far into a class someone is, so it can pick up there. Keeps the 60 most recent.
export function savePosition(id: string, seconds: number | null) {
  setPrefs((p) => {
    const positions = { ...p.positions };
    if (seconds === null) delete positions[id]; else positions[id] = [Math.floor(seconds), Date.now()];
    const keep = Object.entries(positions).sort((a, b) => b[1][1] - a[1][1]).slice(0, 60);
    return { positions: Object.fromEntries(keep) };
  });
}
