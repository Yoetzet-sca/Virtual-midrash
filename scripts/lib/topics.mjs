// Sorts a class into a topic from its title. A class that matches nothing still publishes (topic = null).
export const TOPICS = ['Perasha', 'Nebiim and Ketubim', 'Minhag of the Week', 'Holidays', 'Mishna', 'Halakha', 'Land of Israel', 'Gemara', 'Daf Yomi'];

const MASECHTOT = ['Berakhot', 'Berachot', 'Shabbat', 'Eruvin', 'Erubin', 'Pesahim', 'Pesachim', 'Shekalim', 'Yoma', 'Sukkah', 'Succah', 'Betzah', 'Beitzah', 'Rosh Hashanah', 'Taanit', 'Megillah', 'Moed Katan', 'Hagigah', 'Chagigah', 'Yevamot', 'Yebamot', 'Ketubot', 'Ketuvot', 'Nedarim', 'Nazir', 'Sotah', 'Gittin', 'Kiddushin', 'Bava Kamma', 'Baba Kamma', 'Bava Metzia', 'Baba Metzia', 'Bava Batra', 'Baba Batra', 'Sanhedrin', 'Makkot', 'Shevuot', 'Avodah Zarah', 'Horayot', 'Zevahim', 'Zevachim', 'Menahot', 'Menachot', 'Hullin', 'Ḥullin', 'Chullin', 'Bekhorot', 'Bechorot', 'Bechoros', 'Arakhin', 'Arachin', 'Temurah', 'Keritot', 'Meilah', 'Tamid', 'Niddah', 'Erubim', 'Beisah', 'Shebuot', 'Abodah Zarah', 'Zebahim', 'Kinnim', 'Middot', 'Eduyot', 'Pirkei Abot'];
const PARASHIYOT = ['Bereshit', 'Beresheet', 'Noah', 'Noach', 'Lekh Lekha', 'Lech Lecha', 'Vayera', 'Haye Sarah', 'Chayei Sarah', 'Toledot', 'Toldot', 'Vayesse', 'Vayetze', 'Vayishlah', 'Vayishlach', 'Vayesheb', 'Vayeshev', 'Mikess', 'Miketz', 'Vayigash', 'Vayehi', 'Vayechi', 'Shemot', 'Vaera', 'Beshalah', 'Beshalach', 'Yitro', 'Mishpatim', 'Terumah', 'Tessaveh', 'Tetzaveh', 'Ki Tissa', 'Ki Tisa', 'Vayakhel', 'Pekude', 'Pekudei', 'Vayikra', 'Shemini', 'Tazria', 'Mesora', 'Metzora', 'Ahare Mot', 'Acharei Mot', 'Kedoshim', 'Emor', 'Behar', 'Behukotai', 'Bechukotai', 'Bemidbar', 'Bamidbar', 'Behaalotekha', 'Behaalotcha', 'Shelah', 'Shelach', 'Korah', 'Korach', 'Hukat', 'Chukat', 'Balak', 'Pinehas', 'Pinchas', 'Matot', 'Masei', 'Debarim', 'Devarim', 'Vaethanan', 'Vaetchanan', 'Ekeb', 'Ekev', 'Shofetim', 'Shoftim', 'Ki Tesse', 'Ki Tetze', 'Ki Tabo', 'Ki Tavo', 'Nissabim', 'Nitzavim', 'Vayelekh', 'Vayelech', 'Haazinu', 'Hazinu', 'Vezot Haberakha', 'Hayei Sara', 'Teruma', 'Tessave', 'Aharei Mot', 'Naso', 'Sav', 'Reeh', 'Bo'];
const HOLIDAYS = ['Rosh Hashana', 'Yom Kippur', 'Kippur', 'Sukkot', 'Succot', 'Succah', 'Shemini Atzeret', 'Simhat Torah', 'Simchat Torah', 'Hanukkah', 'Hanukah', 'Chanukah', 'Purim', 'Pesah', 'Pesach', 'Passover', 'Haggadah', 'Shabuot', 'Shavuot', 'Tisha B', '9 Ab', 'Three Weeks', 'Omer', 'Selihot', 'Tu Bishvat', 'Shemini Aseret', 'Tu B\'Shbat', 'Lag La\'Omer', 'Lag BaOmer', 'Tish\'a BeAb', 'Tu BeAb', 'Asarah BeTebet', 'BeTamuz', 'Yom Yerushalayim', 'Yom Haasmaut', 'Yom Hazikaron', 'Yom HaShoah', 'Som Gedaliah', 'Shushan Purim'];
const NAKH = ['Yehoshua', 'Joshua', 'Shemuel', 'Samuel', 'Melakhim', 'Kings', 'Yeshayahu', 'Isaiah', 'Yirmiyahu', 'Jeremiah', 'Yehezkel', 'Ezekiel', 'Tehillim', 'Psalms', 'Mishle', 'Proverbs', 'Iyob', 'Job', 'Shir Hashirim', 'Ruth', 'Ekha', 'Eikha', 'Kohelet', 'Esther', 'Daniel', 'Ezra', 'Nehemiah', 'Yonah', 'Jonah', 'Tanakh', 'Tanach', 'Nebiim', 'Ketubim', 'Haftarah', 'Shofetim', 'Melachim', 'Hoshea', 'Yoel', 'Amos', 'Obadiah', 'Micha', 'Nahum', 'Habakuk', 'Sephaniah', 'Haggai', 'Zecharia', 'Malachi', 'Rut', 'Eicha', 'Dibrei Hayamim', 'Nehemia'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const any = (list) => new RegExp(`(^|[^a-z])(${list.map(esc).join('|')})([^a-z]|$)`, 'i');
const RE = {
  dafYomi: /daf\s*yomi/i,
  // A tractate name followed by a page number, e.g. "Bava Batra 8a" or "Arakhin 8"
  gemara: new RegExp(`(^|[^a-z])(${MASECHTOT.map(esc).join('|')})\\s+\\d{1,3}[ab]?([^a-z0-9]|$)`, 'i'),
  gemaraWord: /(^|[^a-z])(gemara|talmud|masekhet|masechet)([^a-z]|$)/i,
  halakha: /(the laws of|laws of|halakh|halach|hilkhot|hilchot|hadlakat nerot|kashrut|berakhot on|shulhan arukh)/i,
  mishna: /(^|[^a-z])(mishna|mishnah|mishnayot|pirke abot|pirkei avot)([^a-z]|$)/i,
  minhag: /minhag/i,
  israel: /(land of israel|eretz yisrael|state of israel|israel's|zionis|yom haatzmaut|jerusalem)/i,
  perashaWord: /(parash|perash|parsha|shnayim mikra)/i,
  perasha: any(PARASHIYOT),
  holidays: any(HOLIDAYS),
  nakh: any(NAKH),
};

// Titles written in Hebrew
const HEB = [
  [/דף\s*(ה)?יומי/, 'Daf Yomi'], [/פרש[תה]|פרשיות/, 'Perasha'], [/הלכ(ה|ות)|דיני/, 'Halakha'], [/מנהג/, 'Minhag of the Week'],
  [/משנ(ה|יות)|פרקי אבות/, 'Mishna'], [/גמרא|מסכת|תלמוד/, 'Gemara'], [/ארץ ישראל/, 'Land of Israel'],
  [/ראש השנה|יום (ה)?כיפור|סוכות|חנוכה|פורים|פסח|שבועות|תשעה באב/, 'Holidays'], [/הפטר(ה|ת)|תהלים|נביא/, 'Nebiim and Ketubim'],
];

export function topicFor(title, defaultTopic = null) {
  const t = String(title || '');
  for (const [re, topic] of HEB) if (re.test(t)) return topic;
  if (RE.dafYomi.test(t)) return 'Daf Yomi';
  if (RE.gemara.test(t)) return defaultTopic === 'Daf Yomi' ? 'Daf Yomi' : 'Gemara';
  if (RE.halakha.test(t)) return 'Halakha';
  if (RE.minhag.test(t)) return 'Minhag of the Week';
  if (RE.mishna.test(t)) return 'Mishna';
  if (RE.perashaWord.test(t)) return 'Perasha';
  if (RE.holidays.test(t)) return 'Holidays';
  if (RE.israel.test(t)) return 'Land of Israel';
  if (RE.perasha.test(t)) return 'Perasha';
  if (RE.nakh.test(t)) return 'Nebiim and Ketubim';
  if (RE.gemaraWord.test(t)) return 'Gemara';
  return defaultTopic;
}

// Daf Yomi is a subset of Gemara: choosing Gemara includes Daf Yomi classes.
export const matchesTopic = (classTopic, chosen) => classTopic === chosen || (chosen === 'Gemara' && classTopic === 'Daf Yomi');
