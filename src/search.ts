// Search that forgives spelling. Hebrew words get written many ways in English
// (Perasha / Parsha / Parashat, Bekhorot / Bechoros, Vayesse / Vayetze), so words are compared
// by their consonant "skeleton" as well as letter for letter.
const WORDS: Record<string, string> = {
  parsha: 'perasha', parasha: 'perasha', parashat: 'perasha', perashat: 'perasha', parshat: 'perasha', parshas: 'perasha', parashah: 'perasha', perashah: 'perasha', sedra: 'perasha',
  shabbos: 'shabbat', shabat: 'shabbat', halacha: 'halakha', halachah: 'halakha', halakhah: 'halakha', halachot: 'halakha', halakhot: 'halakha',
  gemora: 'gemara', gemarah: 'gemara', talmud: 'gemara', mishnah: 'mishna', mishnayot: 'mishna',
  chanukah: 'hanukkah', chanuka: 'hanukkah', hanukah: 'hanukkah', hanuka: 'hanukkah', pesach: 'pesah', passover: 'pesah',
  basra: 'batra', kesubos: 'ketubot', kesubot: 'ketubot', taanis: 'taanit', bereishis: 'bereshit', breishis: 'bereshit', megilla: 'megillah', megila: 'megillah', sukka: 'sukkah',
  erubim: 'eruvin', erubin: 'eruvin', eiruvin: 'eruvin', beisah: 'betzah', beitzah: 'betzah', besah: 'betzah', beitza: 'betzah',
  shavuot: 'shabuot', shavuos: 'shabuot', succot: 'sukkot', sukkos: 'sukkot', succos: 'sukkot', succah: 'sukkah', tanach: 'tanakh',
};

export const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`"“”״׳]/g, '').replace(/[^a-z0-9֐-׿]+/g, ' ').trim();

export function skeleton(word: string) {
  let t = WORDS[word] || word;
  if (/[֐-׿]/.test(t) || /^\d/.test(t)) return t;
  t = t.replace(/os$/, 'ot').replace(/ch|kh/g, 'h').replace(/tz|ts|ss|z/g, 's').replace(/ph/g, 'f').replace(/ck|q/g, 'k').replace(/w/g, 'v').replace(/b/g, 'v');
  t = t.replace(/(.)\1+/g, '$1'); // doubled letters first, so "bava" keeps both its v's
  return t[0] + t.slice(1).replace(/[aeiou]/g, '');
}

// Two spellings of one word: the same consonants, the same opening sound and about the same length.
// Consonants alone are not enough: "Vayesse" and "Buys" share theirs.
const opening = (w: string) => (WORDS[w] || w).replace(/^(ch|kh)/, 'h').replace(/^(tz|ts)/, 's')[0];
// A final h comes and goes (Sara / Sarah, Teruma / Terumah, Vayishlah / Vayishlach), so it is ignored here.
const ends = (w: string) => { const s = skeleton(w); return s.length > 2 ? s.replace(/h$/, '') : s; };
export const sameWord = (a: string, b: string) => a === b || (ends(a) === ends(b) && ends(a).length >= 2 && opening(a) === opening(b) && Math.abs((WORDS[a] || a).length - (WORDS[b] || b).length) <= 3);

export function matches(query: string, text: string) {
  const q = fold(query).split(' ').filter(Boolean);
  if (!q.length) return false;
  const plain = fold(text);
  const words = plain.split(' ');
  return q.every((token) => {
    // A number must be that page, not part of a longer number: "8" finds "8" and "8a" but not "18" or "80".
    if (/^\d/.test(token)) return words.some((w) => w === token || (w.startsWith(token) && /^[ab]$/.test(w.slice(token.length))));
    if (plain.includes(token)) return true;
    const sk = skeleton(token);
    // Another spelling of the word, or the start of a longer word while it is still being typed.
    return words.some((w) => sameWord(token, w) || (sk.length >= 3 && w.length > token.length && opening(token) === opening(w) && [-1, 0, 1, 2].some((d) => skeleton(w.slice(0, token.length + d)) === sk)));
  });
}

// Stricter, for names the app looks up by itself (this week's perasha, a holiday): every word of the name must be in the
// title as a whole word, in some spelling. No part-words: "Vayesse" must not find "Vayishlah".
export function namesIt(name: string, title: string) {
  const want = fold(name).split(' ').filter(Boolean);
  const have = fold(title).split(' ').filter(Boolean);
  return want.length > 0 && want.every((n) => have.some((w) => sameWord(n, w)));
}

// ---- Searching thousands of classes quickly -------------------------------------------------------
// Comparing every search word with every word of every title on each keystroke was slow once the app held the whole
// archive. Titles reuse a few thousand distinct words, so each search word is compared once with that vocabulary,
// and each class is then only asked "do you contain one of these words?".
export type Index = { docs: string[][]; vocab: string[] };
export function buildIndex(texts: string[]): Index {
  const docs = texts.map((x) => fold(x).split(' ').filter(Boolean));
  return { docs, vocab: [...new Set(docs.flat())] };
}
const typed = (token: string, w: string) => {
  if (w.includes(token) || sameWord(token, w)) return true;
  const sk = skeleton(token);
  return sk.length >= 3 && w.length > token.length && opening(token) === opening(w) && [-1, 0, 1, 2].some((d) => skeleton(w.slice(0, token.length + d)) === sk);
};
// The positions of the texts that match. `whole` is the strict rule used for names the app looks up itself (namesIt).
export function searchIndex(ix: Index, query: string, whole = false): number[] {
  const tokens = fold(query).split(' ').filter(Boolean);
  if (!tokens.length) return [];
  const tests = tokens.map((token) => {
    if (!whole && /^\d/.test(token)) return (words: string[]) => words.some((w) => w === token || (w.startsWith(token) && /^[ab]$/.test(w.slice(token.length))));
    const hits = new Set(ix.vocab.filter((w) => (whole ? sameWord(token, w) : typed(token, w))));
    return (words: string[]) => words.some((w) => hits.has(w));
  });
  const out: number[] = [];
  ix.docs.forEach((words, i) => { if (tests.every((f) => f(words))) out.push(i); });
  return out;
}
