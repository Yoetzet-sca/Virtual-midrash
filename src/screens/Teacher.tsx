import { useState } from 'react';
import type { AppData } from '../types';
import { usePrefs, setPrefs, toggleIn } from '../store';
import { Avatar, Chips, ClassRow } from '../ui';
import { matchesTopic, shareLink } from '../util';
import { IBack, IShare } from '../icons';

export function TeacherPage({ data, id }: { data: AppData; id: string }) {
  const prefs = usePrefs();
  const [topic, setTopic] = useState('All');
  const t = data.teachers.find((x) => x.id === id);
  if (!t) return <div className="page"><h1>Teacher not found</h1><a className="btn" href="#/explore">Browse teachers</a></div>;
  const classes = data.classes.filter((c) => c.teacherId === id);
  const topics = ['All', ...data.topics.filter((k) => classes.some((c) => c.topic === k))];
  const shown = classes.filter((c) => topic === 'All' || matchesTopic(c.topic, topic));
  const live = data.schedule.weekly.filter((w) => w.teacherId === id);
  const following = prefs.following.includes(id);
  const hidden = prefs.hidden.includes(id);
  return (
    <div className="page flush">
      <div className="page-body top">
        <div className="spread">
          <button className="round line" onClick={() => history.back()} aria-label="Back"><IBack size={22} /></button>
          <button className="round line" onClick={() => shareLink(t.name + ' on Virtual Midrash', '/teacher/' + id)} aria-label="Share this page"><IShare size={20} /></button>
        </div>
        <div className="who"><Avatar t={t} size={104} ring /><h1>{t.name}</h1></div>
        {t.affiliations.length > 0 && (
          <div className="chips wrap">{t.affiliations.map((a) => <a key={a} className="chip outline" href={'#/explore/' + encodeURIComponent(a)}>{a}</a>)}</div>
        )}
        {t.title && <p className="italic">{t.title}</p>}
        {t.bio && <p className="muted">{t.bio}</p>}
        <div className="two">
          <button className={'btn' + (following ? ' ghost' : '')} aria-pressed={following} onClick={() => setPrefs({ following: toggleIn(prefs.following, id) })}>{following ? 'Following' : '+ Follow'}</button>
          <a className="btn ghost" href="#/give">Sponsor a class</a>
        </div>
{hidden
          ? <div className="notice spread"><span>Hidden from your feed.</span><button className="btn small" onClick={() => setPrefs({ hidden: prefs.hidden.filter((x) => x !== id) })}>Show again</button></div>
          : <p className="muted small">Follow to put {t.name.split(' ').slice(-1)[0]}’s new classes at the top of your feed. <button className="textlink" onClick={() => setPrefs({ hidden: [...prefs.hidden, id], following: prefs.following.filter((x) => x !== id) })}>Hide from my feed</button></p>}

        {live.length > 0 && <>
          <div className="label">LIVE EVERY WEEK</div>
          {live.map((w, i) => (
            <a key={i} className="panel live" href="#/week">
              <span><strong className="accent">{w.day} · {w.time}</strong><b>{w.title}</b><span className="muted small">{w.mode === 'zoom' ? 'On Zoom' : w.location}{w.mode === 'both' ? ' · and on Zoom' : ''}</span></span>
              <span className="pill">Details</span>
            </a>
          ))}
        </>}

        <div className="label">RECORDED CLASSES</div>
        {classes.length === 0 ? <p className="muted">No recorded classes yet.</p> : <>
          {topics.length > 2 && <Chips items={topics.map((k) => ({ id: k, label: k }))} value={topic} onPick={setTopic} />}
          <div className="rows">{shown.map((c) => <ClassRow key={c.id} c={c} showTeacher={false} />)}</div>
        </>}
      </div>
    </div>
  );
}
