// Runs last, on the built site. Splits the class list in two so a phone opens quickly:
//   dist/data/app.json    the newest classes (and at least the newest two from every teacher) plus everything else the app shows
//   dist/data/older.json  the rest of the archive and the written Torah, fetched in the background once the app is open
// Nothing is dropped — the two files together are exactly what build-data wrote.
import { readFile, writeFile } from 'node:fs/promises';

const NEWEST = 500, PER_TEACHER = 2;
export function split(data) {
  const seen = new Map(), first = [], rest = [];
  data.classes.forEach((c, i) => {
    const n = seen.get(c.teacherId) || 0;
    seen.set(c.teacherId, n + 1);
    (i < NEWEST || n < PER_TEACHER ? first : rest).push(c);
  });
  if (!rest.length) return { app: data, older: null };
  return { app: { ...data, classes: first, docs: [], older: rest.length }, older: { classes: rest, docs: data.docs || [] } };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const root = new URL('../dist/data/', import.meta.url);
  const data = JSON.parse(await readFile(new URL('app.json', root), 'utf8'));
  const { app, older } = split(data);
  if (older) {
    await writeFile(new URL('app.json', root), JSON.stringify(app));
    await writeFile(new URL('older.json', root), JSON.stringify(older));
    console.log(`✓ Split: ${app.classes.length} classes open first (${Math.round(JSON.stringify(app).length / 1024)} KB), ${older.classes.length} follow in the background (${Math.round(JSON.stringify(older).length / 1024)} KB).`);
  } else console.log('✓ Split: few enough classes to send in one file.');
}
