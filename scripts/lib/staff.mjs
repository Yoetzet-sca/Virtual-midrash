// The staff tabs of the SCA Google Sheet: "App - Fix a class", "App - Teachers", "App - This Week", "App - Notices",
// "App - Instagram".
// Staff type plain words under plain headings; this turns each tab into what the build uses.
import { csvRows, sameName } from './csv.mjs';

export const STAFF_TABS = {
  fixes: { tab: 'App - Fix a class', columns: { match: 'Class title contains', teacher: 'Only for this teacher', hide: 'Hide', topic: 'Change topic to', moveTo: 'Move to teacher', note: 'Note' }, needs: ['match'] },
  teachers: { tab: 'App - Teachers', columns: { name: 'Name', title: 'Title', bio: 'Bio', photo: 'Photo link', feed: 'Podcast link', hide: 'Hide', note: 'Note' }, needs: ['name', 'feed'] },
  week: { tab: 'App - This Week', columns: { day: 'Day', time: 'Time', teacher: 'Teacher', title: 'Class', mode: 'Zoom / In person / Both', location: 'Location', note: 'Note' }, needs: ['day', 'title'] },
  instagram: { tab: 'App - Instagram', columns: { link: 'Instagram link', teacher: 'Teacher', title: 'Title', date: 'Date', note: 'Note' }, needs: ['link', 'teacher'] },
  notices: { tab: 'App - Notices', columns: { date: 'Date', text: 'Announcement', dedication: 'Dedication', note: 'Note' }, needs: ['date', 'text'] },
};

// Rows of one tab, keyed the build's way. Returns null when the text is not that tab at all — Google hands back the
// sheet's first tab when the one asked for does not exist, and that must never be mistaken for staff instructions.
export function staffRows(csvText, kind) {
  const { columns, needs } = STAFF_TABS[kind];
  const rows = csvRows(csvText).map((r) => r.map((v) => v.trim()));
  const want = Object.entries(columns).map(([key, label]) => [key, sameName(label)]);
  const at = rows.findIndex((r) => needs.every((k) => r.some((v) => sameName(v) === sameName(columns[k]))));
  if (at < 0) return null;
  const col = Object.fromEntries(want.map(([key, label]) => [key, rows[at].findIndex((v) => sameName(v) === label)]));
  return rows.slice(at + 1)
    .map((r) => Object.fromEntries(Object.keys(columns).map((k) => [k, col[k] >= 0 ? r[col[k]] || '' : ''])))
    .filter((r) => needs.some((k) => r[k]) && !/^example\b/i.test(r.note || ''));
}

export const yes = (v) => /^(y|yes|true|1|x|✓)$/i.test(String(v || '').trim());

// "12/25/2026", "12/25/26" and "2026-12-25" are all the same day.
export function isoDate(v) {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  return m ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : '';
}

// The short code in an Instagram post or reel link (or in Instagram's pasted embed code): instagram.com/reel/DgNW…/
export const instagramCode = (v) => (/instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p|tv)\/([\w-]{5,})/.exec(String(v || '')) || [])[1] || '';

export const modeOf = (v) => (/both/i.test(v) ? 'both' : /zoom|online/i.test(v) ? 'zoom' : 'inperson');
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dayOf = (v) => DAYS.find((d) => String(v || '').trim().toLowerCase().startsWith(d.toLowerCase())) || '';

// Edits on top of the app's own teacher list. A blank cell changes nothing; a name the app does not have adds a teacher.
// Returns the names staff asked to hide. `same` says whether two names are one person; `slug` makes an id from a name.
export function applyTeacherEdits(teachers, rows, same, slug) {
  const hidden = [];
  for (const r of rows || []) {
    if (!r.name) continue;
    if (yes(r.hide)) { hidden.push(r.name); continue; }
    let t = teachers.find((x) => same(x.name, r.name));
    if (!t) {
      const id = slug(r.name);
      if (!id || teachers.some((x) => x.id === id)) continue;
      t = { id, name: r.name, title: '', bio: '', photo: '', affiliations: [], feed: '', podcastName: '', defaultTopic: '' };
      teachers.push(t);
    }
    for (const k of ['title', 'bio', 'photo', 'feed']) if (r[k]) t[k] = r[k];
  }
  return hidden;
}
