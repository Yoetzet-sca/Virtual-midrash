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
