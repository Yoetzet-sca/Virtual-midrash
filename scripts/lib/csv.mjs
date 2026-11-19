// Minimal CSV reader for Google Sheets "publish to web" CSV links. First row is the header.
export function csvRows(textIn) {
  const rows = [];
  let row = [], cell = '', q = false;
  const s = textIn.replace(/\r\n?/g, '\n');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

export function parseCsv(textIn) {
  const [head, ...body] = csvRows(textIn);
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

// "Tutors/Bar Mitzva" and "Tutors / Bar Mizva" are the same category.
export const sameName = (s) => String(s).toLowerCase().replace(/tz/g, 'z').replace(/[^a-z]/g, '');

// One tab of the Community Resources sheet: Category, Name, Phone, Email. Title and heading rows are skipped
// by only keeping rows whose first cell is a known category.
export function resourceRows(textIn, categories) {
  const known = new Map(categories.map((c) => [sameName(c), c]));
  return csvRows(textIn)
    .map((r) => r.map((v) => v.trim()))
    .filter((r) => known.has(sameName(r[0])) && r[1])
    .map((r) => ({ category: known.get(sameName(r[0])), name: r[1], phone: r[2] || '', email: r[3] || '' }));
}
