# Virtual Midrash

The Sephardic Community Alliance's Torah learning app: a swipeable feed of classes, teacher pages,
this week's live classes, erub status, community resources and giving.

**SCA hosts no media.** Each class plays straight from the teacher's own podcast feed (SoundCloud,
Spotify/Anchor, or any standard RSS feed). If a teacher edits or removes a class, the app follows.

## How it works

1. Four times a day a scheduled job (`.github/workflows/update.yml`) runs `scripts/build-data.mjs`. It:
   - reads every teacher's RSS feed and sorts each class into a topic from its title (`scripts/lib/topics.mjs`);
   - reads the teachers, weekly schedule, notices and community resources from the Google Sheet
     (or from the files in `content/` until the sheet is connected);
   - checks the two erub websites (`scripts/lib/erub.mjs`);
   - writes one file, `public/data/app.json`.
2. The website (`src/`) is built and published to GitHub Pages. There is no server and no database.

Personal things (topic picks, follows, likes, the community code) are stored on each person's phone. There is no sign-in.

## Staff: what to edit

| To change | Edit |
|---|---|
| Teachers (name, title, bio, headshot link, schools/shuls, feed link) | `Teachers` tab of the sheet, or `content/teachers.json` |
| Weekly live classes | `Schedule` tab, or `content/schedule.json` → `weekly` |
| Dedications, cancellations, one-day notes | `Notices` tab, or `content/schedule.json` → `notices` |
| Community resources | `Resources` tab, or `content/resources.json` |
| Give Lively link, office email, newsletter link | `content/settings.json` |

Sheet columns (first row of each tab, exactly as written):

- **Teachers:** `id, name, title, bio, photo, affiliations, feed, defaultTopic` — separate several affiliations with `;`.
  Set `defaultTopic` to `Daf Yomi` for a Daf Yomi feed.
- **Schedule:** `day, time, teacherId, teacherName, title, mode, location, zoomUrl, privateAddress` —
  `day` is `Sun`…`Sat`; `mode` is `zoom`, `inperson` or `both`.
- **Notices:** `date, text, dedication` — `date` as `2026-11-18`.
- **Resources:** `category, name, area, note, phone`.
- **Overrides** (optional): `match, topic, teacherId, hide` — any class whose title contains `match` gets that
  `topic`; put `yes` under `hide` to remove a class from the app. `teacherId` limits a row to one teacher.

Publish each tab with File → Share → Publish to web → CSV, and save the links as repository secrets
`SHEET_TEACHERS_URL`, `SHEET_SCHEDULE_URL`, `SHEET_NOTICES_URL`, `SHEET_RESOURCES_URL`, `SHEET_OVERRIDES_URL`.

## The community code

Home addresses, Zoom links and resource phone numbers are **locked**: the build encrypts them with the
community code, and they only open on a phone where someone types that code. Set the code as the repository
secret `COMMUNITY_CODE`. Without it, locked details are left out entirely. Never put a home address or a
Zoom link in `content/` files — the repository and website are public.

## Erub safety rules

A status is shown only if the erub site shows it was checked for the coming Shabbat. Otherwise the app says
"Not yet checked this week". Every status links to the erub's own website.

## Developing

```
npm install
npm test             # checks the feed reader, topic rules, erub reader and code lock
npm run data:sample  # offline sample data from scripts/fixtures
npm run dev          # run the site locally
npm run data         # live data (needs internet)
npm run build
```

## Other settings

- **Videos:** YouTube channels are listed in `content/settings.json` → `youtube`.
- **Listening numbers:** open a free GoatCounter account and put its code in `content/settings.json` →
  `analytics.goatcounter`. It counts anonymous listens by teacher and topic; no cookies, no personal data.
- **Site address:** when the site moves to its own domain, set the repository variable `SITE_URL`
  (for example `https://virtualmidrash.com/`) so share links use it.
- **A dedication for today:** add a row to Notices with today's date and the `dedication` text. It shows on
  the feed and on This Week.

## Not built yet

- Phone notifications when a followed teacher posts (planned: Firebase Cloud Messaging, in the store apps).
- Captions (on hold).
- The archive of older recordings.
- App Store / Google Play packaging.
