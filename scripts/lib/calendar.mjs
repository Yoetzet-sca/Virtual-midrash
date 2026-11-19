// "This week" shortcuts: today's daf, this week's perasha, and the next holiday.
import { HebrewCalendar, flags } from '@hebcal/core';

// ---- Daf Yomi ---------------------------------------------------------------
// The cycle: each tractate with the number of days it takes (its last page minus one, since each starts on page 2).
// Meilah's volume also holds Kinnim, Tamid and Middot.
const CYCLE = [['Berakhot', 63], ['Shabbat', 156], ['Eruvin', 104], ['Pesahim', 120], ['Shekalim', 21], ['Yoma', 87], ['Sukkah', 55], ['Betzah', 39], ['Rosh Hashanah', 34], ['Taanit', 30], ['Megillah', 31], ['Moed Katan', 28], ['Hagigah', 26], ['Yevamot', 121], ['Ketubot', 111], ['Nedarim', 90], ['Nazir', 65], ['Sotah', 48], ['Gittin', 89], ['Kiddushin', 81], ['Bava Kamma', 118], ['Bava Metzia', 118], ['Bava Batra', 175], ['Sanhedrin', 112], ['Makkot', 23], ['Shevuot', 48], ['Avodah Zarah', 75], ['Horayot', 13], ['Zevahim', 119], ['Menahot', 109], ['Hullin', 141], ['Bekhorot', 60], ['Arakhin', 33], ['Temurah', 33], ['Keritot', 27], ['Meilah', 36], ['Niddah', 72]];
export const CYCLE_DAYS = CYCLE.reduce((n, [, d]) => n + d, 0); // 2,711
const CYCLE_14_START = Date.UTC(2020, 0, 5); // Berakhot 2

// `ymd` is a calendar date, 'YYYY-MM-DD'.
export function dafFor(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  let n = Math.round((Date.UTC(y, m - 1, d) - CYCLE_14_START) / 86400000) % CYCLE_DAYS;
  if (n < 0) n += CYCLE_DAYS;
  for (const [name, days] of CYCLE) {
    if (n < days) {
      const page = n + 2;
      if (name === 'Meilah' && page > 22) return { tractate: page <= 25 ? 'Kinnim' : page <= 33 ? 'Tamid' : 'Middot', page };
      return { tractate: name, page };
    }
    n -= days;
  }
  throw new Error('unreachable');
}

// ---- Perasha and holidays ----------------------------------------------------
// The calendar library's spellings → the community's spellings.
const PERASHA = { Bereshit: 'Beresheet', Noach: 'Noah', 'Lech-Lecha': 'Lekh Lekha', Vayera: 'Vayera', 'Chayei Sara': 'Haye Sarah', Toldot: 'Toledot', Vayetzei: 'Vayesse', Vayishlach: 'Vayishlah', Vayeshev: 'Vayesheb', Miketz: 'Mikess', Vayigash: 'Vayigash', Vayechi: 'Vayehi', Shemot: 'Shemot', Vaera: 'Vaera', Bo: 'Bo', Beshalach: 'Beshalah', Yitro: 'Yitro', Mishpatim: 'Mishpatim', Terumah: 'Terumah', Tetzaveh: 'Tessaveh', 'Ki Tisa': 'Ki Tissa', Vayakhel: 'Vayakhel', Pekudei: 'Pekude', Vayikra: 'Vayikra', Tzav: 'Sav', Shmini: 'Shemini', Tazria: 'Tazria', Metzora: 'Mesora', 'Achrei Mot': 'Ahare Mot', Kedoshim: 'Kedoshim', Emor: 'Emor', Behar: 'Behar', Bechukotai: 'Behukotai', Bamidbar: 'Bemidbar', Nasso: 'Naso', "Beha'alotcha": 'Behaalotekha', "Sh'lach": 'Shelah', Korach: 'Korah', Chukat: 'Hukat', Balak: 'Balak', Pinchas: 'Pinehas', Matot: 'Matot', Masei: 'Masei', Devarim: 'Debarim', Vaetchanan: 'Vaethanan', Eikev: 'Ekeb', "Re'eh": 'Reeh', Shoftim: 'Shofetim', 'Ki Teitzei': 'Ki Tesse', 'Ki Tavo': 'Ki Tabo', Nitzavim: 'Nissabim', Vayeilech: 'Vayelekh', "Ha'azinu": 'Haazinu', 'Vezot Haberakhah': 'Vezot Haberakha' };
const HOLIDAY = { 'Rosh Hashana': 'Rosh Hashanah', 'Yom Kippur': 'Yom Kippur', Sukkot: 'Sukkot', 'Shmini Atzeret': 'Shemini Atzeret', Chanukah: 'Hanukkah', 'Tu BiShvat': 'Tu Bishvat', Purim: 'Purim', Pesach: 'Pesah', 'Lag BaOmer': 'Lag LaOmer', Shavuot: 'Shabuot', "Tish'a B'Av": 'Tisha B’Ab' };
const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// `ymd` is today's calendar date in New York.
export function weekInfo(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const events = HebrewCalendar.calendar({ start, end: new Date(y, m - 1, d + 120), sedrot: true, il: false });
  let perasha = null, holiday = null;
  for (const ev of events) {
    const date = ymdOf(ev.getDate().greg());
    if (ev.getFlags() & flags.PARSHA_HASHAVUA) {
      if (!perasha) {
        // A double portion comes as "Vayakhel-Pekudei": translate each half.
        const raw = ev.getDesc().replace(/^Parashat\s+/, '');
        const names = PERASHA[raw] ? [PERASHA[raw]] : raw.split('-').map((p) => PERASHA[p] || p);
        perasha = { name: [...new Set(names)].join(' – '), search: [...new Set(names)], shabbat: date };
      }
    } else if (!holiday && HOLIDAY[ev.basename()]) {
      holiday = { name: HOLIDAY[ev.basename()], date };
    }
    if (perasha && holiday) break;
  }
  return { perasha, holiday };
}
