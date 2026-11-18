// Reads the erub status from the two community erub websites.
// Safety rule: a status only counts as current if it was checked for the coming Shabbat
// (see isFresh below). Otherwise the app shows "Not yet checked this week".
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

const MONTHS = 'january february march april may june july august september october november december'.split(' ');

export function findDate(textBlock, now) {
  // 11/13/2026 or 11/13/26
  let m = textBlock.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(Date.UTC(y, Number(m[1]) - 1, Number(m[2])));
  }
  // November 14, 2026
  m = textBlock.match(new RegExp(`(${MONTHS.join('|')})\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i'));
  if (m) return new Date(Date.UTC(Number(m[3]), MONTHS.indexOf(m[1].toLowerCase()), Number(m[2])));
  return null;
}

// A check covers the Shabbat on or after its date. Once that Shabbat ends (Saturday night, Eastern time),
// the status is stale until the next Friday check is posted.
const isFresh = (date, now) => {
  if (!date) return false;
  const shabbat = new Date(date.getTime() + ((6 - date.getUTCDay() + 7) % 7) * 86400000);
  const ends = shabbat.getTime() + 86400000 + 5 * 3600000; // midnight after Shabbat, Eastern
  return now.getTime() < ends && now.getTime() > date.getTime() - 2 * 86400000;
};

export function parseBrooklyn(html, now = new Date()) {
  const t = strip(html);
  const m = t.match(/erub\s+is\s+(up|down)/i);
  const at = m ? t.slice(m.index, m.index + 300) : '';
  const date = findDate(at, now);
  return { status: m ? m[1].toLowerCase() : 'unknown', date: date ? date.toISOString().slice(0, 10) : null, fresh: !!m && isFresh(date, now) };
}

export function parseDeal(html, now = new Date()) {
  const t = strip(html);
  const m = t.match(/the\s+erub\s+has\s+been\s+checked/i);
  const at = m ? t.slice(Math.max(0, m.index - 120), m.index + 200) : '';
  const date = findDate(at, now);
  // The site shows up/down with an image near the status text (erub-up.gif / erub-down.gif).
  const img = html.match(/erub[-_ ]?(up|down)[^"']*\.(gif|png|jpe?g)/i);
  const status = img ? img[1].toLowerCase() : m ? 'checked' : 'unknown';
  return { status, date: date ? date.toISOString().slice(0, 10) : null, fresh: !!m && isFresh(date, now) };
}
