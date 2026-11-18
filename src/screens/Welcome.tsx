import { useEffect, useState } from 'react';
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
  const [showAll, setShowAll] = useState(false);
  const n = prefs.topics.length + prefs.following.length;
  const teachers = showAll ? data.teachers : data.teachers.slice(0, 8);
  return (
    <div className="welcome">
      <div className="welcome-scroll">
        <div className="welcome-top"><span className="mark big"><img src="./brand/vm-mark.png" alt="" /></span><img className="sca" src="./brand/sca-icon-white.png" alt="Sephardic Community Alliance" /><span className="grow" /><button className="skip" onClick={onDone}>Skip</button></div>
        <div><h1 className="huge">What do you want to learn?</h1><p className="muted">Tap a few. Your feed starts with these and gets better the more you listen.</p></div>
        <div className="label">TOPICS</div>
        <div className="chips wrap">{data.topics.map((t) => <button key={t} className={'chip pick' + (prefs.topics.includes(t) ? ' on' : '')} aria-pressed={prefs.topics.includes(t)} onClick={() => setPrefs({ topics: toggleIn(prefs.topics, t) })}>{t}</button>)}</div>
        <div className="label">TEACHERS TO FOLLOW</div>
        <div className="grid4">{teachers.map((t) => (
          <button key={t.id} className={'person' + (prefs.following.includes(t.id) ? ' on' : '')} aria-pressed={prefs.following.includes(t.id)} onClick={() => setPrefs({ following: toggleIn(prefs.following, t.id) })}><Avatar t={t} /><span>{t.name}</span></button>
        ))}</div>
        {!showAll && data.teachers.length > 8 && <button className="chip" onClick={() => setShowAll(true)}>Show all {data.teachers.length} teachers</button>}
      </div>
      <div className="welcome-foot"><button className="btn wide" onClick={onDone}>{n ? `Start learning (${n} picked)` : 'Start learning'}</button><span className="muted small">No sign-up. Your picks stay on this phone.</span></div>
    </div>
  );
}
