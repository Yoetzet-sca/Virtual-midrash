// Everything personal (picks, follows, likes, the community code) lives on this phone only. No sign-in.
import { useSyncExternalStore } from 'react';

export type Prefs = {
  onboarded: boolean;
  topics: string[];
  following: string[];
  liked: string[];
  saved: string[];
  code: string;
  // Quiet learning: small scores per topic and teacher, nudged by what people listen to, like and skip.
  learned: Record<string, number>;
};
const KEY = 'vm.prefs.v1';
const empty: Prefs = { onboarded: false, topics: [], following: [], liked: [], saved: [], code: '', learned: {} };

function read(): Prefs {
  try { return { ...empty, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return empty; }
}
let state = read();
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
