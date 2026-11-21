// "This week" shortcuts: today's daf, this week's perasha, and the next holiday.
import { HebrewCalendar, Location, flags } from '@hebcal/core';

// ---- Daf Yomi ---------------------------------------------------------------
// The cycle: each tractate with the number of days it takes (its last page minus one, since each starts on page 2).
// Meilah's volume also holds Kinnim, Tamid and Middot.
const CYCLE = [['Berachot', 63], ['Shabbat', 156], ['Erubim', 104], ['Pesahim', 120], ['Shekalim', 21], ['Yoma', 87], ['Sukkah', 55], ['Beisah', 39], ['Rosh Hashanah', 34], ['Taanit', 30], ['Megillah', 31], ['Moed Katan', 28], ['Hagigah', 26], ['Yebamot', 121], ['Ketubot', 111], ['Nedarim', 90], ['Nazir', 65], ['Sotah', 48], ['Gittin', 89], ['Kiddushin', 81], ['Baba Kamma', 118], ['Baba Metzia', 118], ['Baba Batra', 175], ['Sanhedrin', 112], ['Makkot', 23], ['Shebuot', 48], ['Abodah Zarah', 75], ['Horayot', 13], ['Zebahim', 119], ['Menahot', 109], ['Hullin', 141], ['Bechorot', 60], ['Arachin', 33], ['Temurah', 33], ['Keritot', 27], ['Meilah', 36], ['Niddah', 72]];
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
const PERASHA = { Bereshit: 'Beresheet', Noach: 'Noah', 'Lech-Lecha': 'Lech Lecha', Vayera: 'Vayera', 'Chayei Sara': 'Hayei Sara', Toldot: 'Toledot', Vayetzei: 'Vayesse', Vayishlach: 'Vayishlah', Vayeshev: 'Vayesheb', Miketz: 'Mikess', Vayigash: 'Vayigash', Vayechi: 'Vayehi', Shemot: 'Shemot', Vaera: 'Vaera', Bo: 'Bo', Beshalach: 'Beshalah', Yitro: 'Yitro', Mishpatim: 'Mishpatim', Terumah: 'Teruma', Tetzaveh: 'Tessave', 'Ki Tisa': 'Ki Tisa', Vayakhel: 'Vayakhel', Pekudei: 'Pekudei', Vayikra: 'Vayikra', Tzav: 'Sav', Shmini: 'Shemini', Tazria: 'Tazria', Metzora: 'Mesora', 'Achrei Mot': 'Aharei Mot', Kedoshim: 'Kedoshim', Emor: 'Emor', Behar: 'Behar', Bechukotai: 'Behukotai', Bamidbar: 'Bemidbar', Nasso: 'Naso', "Beha'alotcha": 'Behaalotekha', "Sh'lach": 'Shelah', Korach: 'Korah', Chukat: 'Hukat', Balak: 'Balak', Pinchas: 'Pinehas', Matot: 'Matot', Masei: 'Masei', Devarim: 'Debarim', Vaetchanan: 'Vaethanan', Eikev: 'Ekeb', "Re'eh": 'Reeh', Shoftim: 'Shofetim', 'Ki Teitzei': 'Ki Tesse', 'Ki Tavo': 'Ki Tabo', Nitzavim: 'Nissabim', Vayeilech: 'Vayelech', "Ha'azinu": 'Haazinu', 'Vezot Haberakhah': 'Vezot Haberakha' };
// Holidays and fast days, in the old site's spelling. `also` lists other names a teacher's title may use.
const HOLIDAY = { 'Rosh Hashana': 'Rosh Hashanah', 'Tzom Gedaliah': 'Som Gedaliah', 'Yom Kippur': 'Yom Kippur', Sukkot: 'Sukkot', 'Shmini Atzeret': 'Shemini Aseret', 'Simchat Torah': 'Simhat Torah', Chanukah: 'Hanukkah', "Asara B'Tevet": 'Asarah BeTebet', 'Tu BiShvat': "Tu B'Shbat", Purim: 'Purim', Pesach: 'Pesah', 'Yom HaShoah': 'Yom HaShoah', 'Yom HaZikaron': 'Yom Hazikaron', "Yom HaAtzma'ut": 'Yom Haasmaut', 'Lag BaOmer': "Lag La'Omer", 'Yom Yerushalayim': 'Yom Yerushalayim', Shavuot: 'Shabuot', 'Tzom Tammuz': '17 BeTamuz', "Tish'a B'Av": "Tish'a BeAb", "Tu B'Av": 'Tu BeAb' };
const ALSO = { "Lag La'Omer": ['Lag BaOmer'], '17 BeTamuz': ['Shiba Asar BeTamuz', 'Tammuz fast'], 'Som Gedaliah': ['Fast of Gedaliah'], 'Asarah BeTebet': ['10 Tebet'], 'Pesah': ['Passover', 'Haggadah'], "Tish'a BeAb": ['9 Ab', 'Tisha BAb'], 'Yom Haasmaut': ['Yom HaAzmaut', 'Israel Independence'] };
const ymdOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// When Shabbat ends in New York on that date (nightfall, the sun 8.5° below the horizon), as an exact moment.
// The app moves on to the next perasha then. When Shabbat runs straight into a festival the time is that evening's
// candle lighting, which is the same nightfall.
export function shabbatEnds(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const evs = HebrewCalendar.calendar({ start: day, end: day, candlelighting: true, location: Location.lookup('New York'), il: false });
  const when = evs.filter((e) => e.eventTime && (e.getFlags() & (flags.LIGHT_CANDLES_TZEIS | flags.YOM_TOV_ENDS))).map((e) => e.eventTime)[0];
  return when ? when.toISOString() : null;
}

// `ymd` is today's calendar date in New York.
export function weekInfo(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const events = HebrewCalendar.calendar({ start, end: new Date(y, m - 1, d + 120), sedrot: true, il: false });
  let perasha = null, perashaNext = null, holiday = null;
  for (const ev of events) {
    const date = ymdOf(ev.getDate().greg());
    if (ev.getFlags() & flags.PARSHA_HASHAVUA) {
      if (!perasha || !perashaNext) {
        // A double portion comes as "Vayakhel-Pekudei": translate each half.
        const raw = ev.getDesc().replace(/^Parashat\s+/, '');
        const names = PERASHA[raw] ? [PERASHA[raw]] : raw.split('-').map((p) => PERASHA[p] || p);
        const found = { name: [...new Set(names)].join(' – '), search: [...new Set(names)], shabbat: date };
        if (!perasha) perasha = { ...found, ends: shabbatEnds(date) }; else perashaNext = found;
      }
    } else if (!holiday && HOLIDAY[ev.basename()]) {
      holiday = { name: HOLIDAY[ev.basename()], date, search: [HOLIDAY[ev.basename()], ...(ALSO[HOLIDAY[ev.basename()]] || [])] };
    }
    if (perasha && perashaNext && holiday) break;
  }
  return { perasha, perashaNext, holiday };
}
