import type { AppData, ClassItem } from './types';
import type { Prefs } from './store';

export const matchesTopic = (classTopic: string | null, chosen: string) => classTopic === chosen || (chosen === 'Gemara' && classTopic === 'Daf Yomi');

export function minutes(sec: number) {
  if (!sec) return '';
  const m = Math.max(1, Math.round(sec / 60));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} hr ${m % 60 ? `${m % 60} min` : ''}`.trim();
}
export const clock = (sec: number) => {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(r).padStart(2, '0')}`;
};
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const daysAgo = (iso: string, now = new Date()) => Math.round((dayStart(now) - dayStart(new Date(iso))) / 86400000);
export function when(iso: string, now = new Date()) {
  const d = daysAgo(iso, now);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d > 300 ? 'numeric' : undefined });
}
export const initials = (name: string) => {
  const w = name.replace(/^(Rabbi|Mrs\.|Ms\.|Mr\.|Dr\.|Hacham)\s+/i, '').replace(/^Dr\.\s+/i, '').split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
};

// Feed order: followed teachers' new classes, then picked or learned topics, then newest. Simple rules on purpose.
export function rank(data: AppData, prefs: Prefs, now = new Date()): ClassItem[] {
  const score = (c: ClassItem) => {
    const age = Math.max(0, daysAgo(c.date, now));
    let s = -Math.min(60, age * 2);
    if (age === 0) s += 15;
    if (prefs.following.includes(c.teacherId)) s += 50;
    if (c.topic && prefs.topics.some((t) => matchesTopic(c.topic, t))) s += 20;
    s += (prefs.learned['t:' + c.teacherId] || 0) + (c.topic ? prefs.learned['k:' + c.topic] || 0 : 0);
    return s;
  };
  return [...data.classes].map((c) => [score(c), c] as const).sort((a, b) => b[0] - a[0] || b[1].date.localeCompare(a[1].date)).map((x) => x[1]);
}

// `path` is either an in-app route ('/teacher/x') or a share page ('c/abc.html') that shows a preview in WhatsApp and Messages.
export async function shareLink(title: string, path: string) {
  const base = location.href.split('#')[0].replace(/[^/]*$/, '');
  const url = path.startsWith('/') ? base + '#' + path : base + path;
  try {
    if (navigator.share) { await navigator.share({ title, text: title, url }); return 'shared'; }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch { return 'cancelled'; }
}

export const classShare = (c: ClassItem) => (c.sid ? `c/${c.sid}.html` : '/class/' + encodeURIComponent(c.id));

// Classes posted by followed teachers since this person last checked.
export function newFromFollowed(data: AppData, prefs: Prefs) {
  const since = prefs.seenAt || new Date(new Date(data.generatedAt).getTime() - 3 * 86400000).toISOString();
  return data.classes.filter((c) => prefs.following.includes(c.teacherId) && c.date > since).slice(0, 30);
}

// Podcast artwork is often a 3000-pixel original. Phones (iPhones especially) run out of memory decoding many of those,
// so ask SoundCloud's image server for a size that fits the screen.
export const sized = (url: string | undefined, px: 200 | 500) =>
  url ? url.replace(/(sndcdn\.com\/.*)-(?:original|large|crop|t\d+x\d+)\.(jpe?g|png)/i, `$1-t${px}x${px}.$2`) : url;
