// Search that forgives spelling. Hebrew words get written many ways in English
// (Perasha / Parsha / Parashat, Bekhorot / Bechoros, Vayesse / Vayetze), so words are compared
// by their consonant "skeleton" as well as letter for letter.
const WORDS: Record<string, string> = {
  parsha: 'perasha', parasha: 'perasha', parashat: 'perasha', perashat: 'perasha', parshat: 'perasha', parshas: 'perasha', parashah: 'perasha', perashah: 'perasha', sedra: 'perasha',
  shabbos: 'shabbat', shabat: 'shabbat', halacha: 'halakha', halachah: 'halakha', halakhah: 'halakha', halachot: 'halakha', halakhot: 'halakha',
  gemora: 'gemara', gemarah: 'gemara', talmud: 'gemara', mishnah: 'mishna', mishnayot: 'mishna',
  chanukah: 'hanukkah', chanuka: 'hanukkah', hanukah: 'hanukkah', hanuka: 'hanukkah', pesach: 'pesah', passover: 'pesah',
  basra: 'batra', kesubos: 'ketubot', kesubot: 'ketubot', taanis: 'taanit', bereishis: 'bereshit', breishis: 'bereshit', megilla: 'megillah', megila: 'megillah', sukka: 'sukkah',
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

export function matches(query: string, text: string) {
  const q = fold(query).split(' ').filter(Boolean);
  if (!q.length) return false;
  const plain = fold(text);
  const words = plain.split(' ');
  const skels = words.map(skeleton);
  return q.every((token) => {
    // A number must be that page, not part of a longer number: "8" finds "8" and "8a" but not "18" or "80".
    if (/^\d/.test(token)) return words.some((w) => w === token || (w.startsWith(token) && /^[ab]$/.test(w.slice(token.length))));
    if (plain.includes(token)) return true;
    const sk = skeleton(token);
    return sk.length >= 2 && skels.some((s) => s === sk || (sk.length >= 3 && s.startsWith(sk)));
  });
}
