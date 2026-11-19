import type { AppData, ClassItem } from '../types';
import { useState } from 'react';
import { usePrefs, setPrefs, toggleIn } from '../store';
import { Avatar, ClassRow } from '../ui';
import { clock } from '../util';

// Everything this person has set aside or is in the middle of. Stored on this phone only.
export function Library({ data }: { data: AppData }) {
  const prefs = usePrefs();
  const [ask, setAsk] = useState(false);
  const people = (ids: string[]) => data.teachers.filter((t) => ids.includes(t.id));
  const byId = new Map(data.classes.map((c) => [c.id, c]));
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean) as ClassItem[];
  const teacher = (id: string) => data.teachers.find((t) => t.id === id);
  const inProgress = pick(Object.entries(prefs.positions).sort((a, b) => b[1][1] - a[1][1]).map((e) => e[0]));
  const saved = pick([...prefs.saved].reverse());
  const liked = pick([...prefs.liked].reverse());
  const Section = ({ title, list, empty, note }: { title: string; list: ClassItem[]; empty: string; note?: (c: ClassItem) => string }) => (
    <>
      <div className="label">{title}</div>
      {list.length === 0 ? <p className="muted small">{empty}</p> : (
        <div className="rows">{list.map((c) => <div key={c.id}>{note && <div className="muted tiny rownote">{note(c)}</div>}<ClassRow c={c} teacher={teacher(c.teacherId)} /></div>)}</div>
      )}
    </>
  );
  return (
    <div className="page">
      <div className="head"><div><h1>Your classes</h1><p className="muted">Kept on this phone</p></div><img className="sca" src="./brand/sca-icon-white.png" alt="Sephardic Community Alliance" /></div>
      <Section title="CONTINUE LISTENING" list={inProgress} empty="Classes you start and don’t finish will wait for you here." note={(c) => `You’re ${clock(prefs.positions[c.id][0])} in`} />
      <Section title="SAVED" list={saved} empty="Tap Save on a class to keep it here." />
      <Section title="LIKED" list={liked} empty="Classes you like show up here." />

      <h2 className="sub">Your preferences</h2>
      <div className="label">TOPICS YOU PICKED</div>
      <div className="chips wrap">{data.topics.map((t) => <button key={t} className={'chip pick' + (prefs.topics.includes(t) ? ' on' : '')} aria-pressed={prefs.topics.includes(t)} onClick={() => setPrefs({ topics: toggleIn(prefs.topics, t) })}>{t}</button>)}</div>

      <div className="label">TEACHERS YOU FOLLOW</div>
      {prefs.following.length === 0 ? <p className="muted small">You’re not following anyone yet.</p> : people(prefs.following).map((t) => (
        <div className="pref" key={t.id}><a href={'#/teacher/' + t.id}><Avatar t={t} size={44} /><b>{t.name}</b></a><button className="btn small ghost" onClick={() => setPrefs({ following: prefs.following.filter((x) => x !== t.id) })}>Unfollow</button></div>
      ))}

      <div className="label">HIDDEN FROM YOUR FEED</div>
      {prefs.hidden.length === 0 ? <p className="muted small">No hidden teachers. Press and hold Follow on a class to hide a teacher.</p> : people(prefs.hidden).map((t) => (
        <div className="pref" key={t.id}><a href={'#/teacher/' + t.id}><Avatar t={t} size={44} /><b>{t.name}</b></a><button className="btn small" onClick={() => setPrefs({ hidden: prefs.hidden.filter((x) => x !== t.id) })}>Show again</button></div>
      ))}

      <div className="label">START FRESH</div>
      <div className="two">
        <button className="btn small ghost" disabled={!prefs.liked.length} onClick={() => setPrefs({ liked: [] })}>Clear liked</button>
        <button className="btn small ghost" disabled={!prefs.saved.length} onClick={() => setPrefs({ saved: [] })}>Clear saved</button>
      </div>
      <button className="btn small ghost" onClick={() => setPrefs({ onboarded: false })}>Choose topics and teachers again</button>
      {ask
        ? <div className="notice"><p>Reset everything on this phone? This clears your topics, follows, hidden teachers, likes, saved classes and your place in each class. It can’t be undone.</p>
            <div className="two" style={{ marginTop: 10 }}><button className="btn small" onClick={() => { setPrefs({ topics: [], following: [], hidden: [], liked: [], saved: [], positions: {}, learned: {}, onboarded: false }); setAsk(false); }}>Yes, reset</button><button className="btn small ghost" onClick={() => setAsk(false)}>Cancel</button></div></div>
        : <button className="textlink" onClick={() => setAsk(true)}>Reset everything</button>}
    </div>
  );
}
