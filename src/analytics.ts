// Anonymous listening numbers (which teachers and topics get played), with no personal data and no cookies.
// Off until an account code is set in content/settings.json → analytics.goatcounter.
type GC = { count: (o: { path: string; title?: string; event?: boolean }) => void };
let ready = false;

export function startAnalytics(code?: string) {
  if (!code || ready) return;
  ready = true;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  document.head.appendChild(s);
}

export function track(event: string, detail: string) {
  if (!ready) return;
  try { (window as unknown as { goatcounter?: GC }).goatcounter?.count({ path: `${event}/${detail}`.slice(0, 180), title: detail, event: true }); } catch { /* never let counting break the app */ }
}

// How long people stay: time with the app on screen. Each visit is counted as it passes 1, 5, 15, 30 and 60 minutes,
// so the numbers read as "how many visits lasted at least this long".
const STAY = [1, 5, 15, 30, 60];
let onScreen = 0, stayMark = 0;
setInterval(() => {
  if (document.visibilityState !== 'visible') return;
  onScreen += 5;
  while (stayMark < STAY.length && onScreen >= STAY[stayMark] * 60) track('stayed', `${STAY[stayMark++]} min or more`);
}, 5000);

// How long people listen: counted at 5, 15, 30 and 45 minutes of actual listening to one class.
const heard = new Map<string, { sec: number; marks: number }>();
const MARKS = [5, 15, 30, 45];
export function listened(classId: string, teacher: string, seconds: number) {
  const h = heard.get(classId) || { sec: 0, marks: 0 };
  h.sec += seconds;
  while (h.marks < MARKS.length && h.sec >= MARKS[h.marks] * 60) track(`listened-${MARKS[h.marks++]}-min`, teacher);
  heard.set(classId, h);
}
