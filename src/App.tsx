import { useEffect, useState } from 'react';
import type { AppData, ClassItem } from './types';
import { usePrefs, setPrefs, getPrefs } from './store';
import { PlayerProvider, usePlayer } from './player';
import { Feed } from './screens/Feed';
import { TeacherPage } from './screens/Teacher';
import { Explore } from './screens/Explore';
import { Week } from './screens/Week';
import { Resources } from './screens/Resources';
import { Give } from './screens/Give';
import { Library } from './screens/Library';
import { Welcome } from './screens/Welcome';
import { Privacy } from './screens/Privacy';
import { ICal, IHeart, IHome, IPause, IPeople, IPlay, ISearch } from './icons';
import { go } from './ui';
import { startAnalytics } from './analytics';
import { InstallPrompt } from './install';

const useHash = () => {
  const [h, setH] = useState(location.hash.replace(/^#\/?/, ''));
  useEffect(() => { const f = () => setH(location.hash.replace(/^#\/?/, '')); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h;
};

function MiniPlayer({ data }: { data: AppData }) {
  const p = usePlayer();
  if (!p.cls) return null;
  const t = data.teachers.find((x) => x.id === p.cls!.teacherId);
  return (
    <div className="mini">
      <button className="mini-btn" onClick={() => p.toggle(p.cls!)} aria-label={p.playing ? 'Pause' : 'Play'}>{p.playing ? <IPause size={20} /> : <IPlay size={20} />}</button>
      <a className="mini-text" href={'#/class/' + encodeURIComponent(p.cls.id)}><b>{p.cls.title}</b><span>{t?.name}</span></a>
      <div className="mini-bar" style={{ width: `${(p.duration ? p.time / p.duration : 0) * 100}%` }} />
    </div>
  );
}

const TABS = [
  { id: '', label: 'Feed', icon: IHome },
  { id: 'week', label: 'This Week', icon: ICal },
  { id: 'explore', label: 'Explore', icon: ISearch },
  { id: 'resources', label: 'Resources', icon: IPeople },
  { id: 'give', label: 'Give', icon: IHeart },
];

function Shell({ data }: { data: AppData }) {
  const prefs = usePrefs();
  const hash = useHash();
  const [topic, setTopic] = useState('For You');
  const [route, ...rest] = hash.split('/');
  const arg = rest.length ? decodeURIComponent(rest.join('/')) : undefined;

  if (!prefs.onboarded) {
    return <Welcome data={data} onDone={() => { setPrefs({ onboarded: true }); location.hash = '/'; }} />;
  }
  const isFeed = route === '' || route === 'class';
  const tab = isFeed || route === 'saved' || route === 'privacy' ? '' : route === 'teacher' ? 'explore' : route;
  return (
    <div className="shell">
      <main className={isFeed ? 'main feed-main' : 'main'}>
        {isFeed && <Feed data={data} startId={route === 'class' ? arg : undefined} topic={topic} setTopic={setTopic} />}
        {route === 'teacher' && <TeacherPage data={data} id={arg || ''} />}
        {route === 'explore' && <Explore data={data} place={arg} pickTopic={(t) => { setTopic(t); go('/'); }} />}
        {route === 'week' && <Week data={data} />}
        {route === 'resources' && <Resources data={data} />}
        {route === 'give' && <Give data={data} />}
        {route === 'saved' && <Library data={data} />}
        {route === 'privacy' && <Privacy data={data} />}
      </main>
      {!isFeed && <MiniPlayer data={data} />}
      {!isFeed && <InstallPrompt />}
      <nav className="nav">
        {TABS.map((t) => <a key={t.id} href={'#/' + t.id} className={t.id === tab ? 'on' : ''} aria-current={t.id === tab ? 'page' : undefined}><t.icon />{t.label}</a>)}
      </nav>
    </div>
  );
}

export function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch('./data/app.json', { cache: 'no-cache' }).then((r) => r.json()).then((d: AppData) => {
      startAnalytics(d.analytics?.goatcounter);
      setData(d);
      if (!d.older) return;
      // The newest classes are on screen; the rest of the archive follows. Three tries, then carry on with what there is.
      const rest = (tries: number): Promise<void> => fetch('./data/older.json', { cache: 'no-cache' }).then((r) => r.json())
        .then((o: { classes: ClassItem[]; docs: AppData['docs'] }) => setData({ ...d, classes: [...d.classes, ...o.classes].sort((a, b) => b.date.localeCompare(a.date)), docs: o.docs, older: 0 }))
        .catch(() => (tries > 1 ? new Promise<void>((ok) => setTimeout(ok, 4000)).then(() => rest(tries - 1)) : setData({ ...d, older: 0 })));
      rest(3);
    }).catch(() => setFailed(true));
  }, []);
  if (failed) return <div className="state"><h1>Can’t load classes right now</h1><p>Check your connection and try again.</p><button className="btn" onClick={() => location.reload()}>Try again</button></div>;
  // Someone arriving at one particular class (a shared link, or the class they were in the middle of) waits the extra
  // moment for the archive when that class is in it, so the feed opens on the right card.
  const wanted = data?.older ? [(location.hash.match(/^#\/class\/(.+)/) || [])[1], Object.entries(getPrefs().positions).sort((a, b) => b[1][1] - a[1][1])[0]?.[0]].filter(Boolean).map((x) => { try { return decodeURIComponent(x as string); } catch { return x; } }) : [];
  const waiting = wanted.some((id) => !data!.classes.some((c) => c.id === id));
  if (!data || waiting) return <div className="state"><img src="./brand/sca-icon-white.png" alt="" width={96} /></div>;
  return <PlayerProvider teachers={data.teachers} classes={data.classes}><Shell data={data} /></PlayerProvider>;
}
