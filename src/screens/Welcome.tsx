import { useEffect } from 'react';
import type { AppData } from '../types';
import { usePrefs, setPrefs, toggleIn } from '../store';
import { Avatar } from '../ui';

// The SCA intro animation plays in full the first time the app is opened, and only then.
export function Splash({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 5400); return () => clearTimeout(t); }, [onDone]);
  return (
    <button className="splash" onClick={onDone} aria-label="Continue">
      <img src="./brand/intro.webp" alt="Sephardic Community Alliance" />
      <b>Virtual Midrash</b><span>Learn Torah, anytime, anywhere</span>
    </button>
  );
}

export function Welcome({ data, onDone }: { data: AppData; onDone: () => void }) {
  const prefs = usePrefs();
  const n = prefs.topics.length + prefs.following.length;
  // Whoever posted most recently comes first; teachers with nothing posted yet go last, by name.
  const latest = new Map<string, string>();
  for (const c of data.classes) if ((latest.get(c.teacherId) || '') < c.date) latest.set(c.teacherId, c.date);
  const teachers = [...data.teachers].sort((a, b) => (latest.get(b.id) || '').localeCompare(latest.get(a.id) || '') || a.name.localeCompare(b.name));
  return (
    <div className="welcome">
      <div className="welcome-scroll">
        <div className="welcome-top"><img className="sca-logo" src="./brand/sca-logo-white.png" alt="Sephardic Community Alliance" /><span className="grow" /><button className="skip" onClick={onDone}>Skip</button></div>
        <div><h1 className="huge">What do you want to learn?</h1><p className="muted">Tap a few. Your feed starts with these and gets better the more you listen.</p></div>
        <div className="label">TOPICS</div>
        <div className="chips wrap">{data.topics.map((t) => <button key={t} className={'chip pick' + (prefs.topics.includes(t) ? ' on' : '')} aria-pressed={prefs.topics.includes(t)} onClick={() => setPrefs({ topics: toggleIn(prefs.topics, t) })}>{t}</button>)}</div>
        <div><div className="label">TEACHERS TO FOLLOW</div><p className="muted small order-note">Listed by most recent class posted.</p></div>
        <div className="people grid">{teachers.map((t) => (
          <button key={t.id} className={'person' + (prefs.following.includes(t.id) ? ' on' : '')} aria-pressed={prefs.following.includes(t.id)} onClick={() => setPrefs({ following: toggleIn(prefs.following, t.id) })}><Avatar t={t} /><span>{t.name}</span></button>
        ))}</div>
      </div>
      <div className="welcome-foot"><button className="btn wide" onClick={onDone}>{n ? `Start learning (${n} picked)` : 'Start learning'}</button><span className="muted small">No sign-up. Your picks stay on this phone.</span></div>
    </div>
  );
}
