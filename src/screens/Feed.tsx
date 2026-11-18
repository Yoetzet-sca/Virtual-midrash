import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppData, ClassItem } from '../types';
import { usePrefs, setPrefs, toggleIn, learn } from '../store';
import { usePlayer } from '../player';
import { Avatar, erubLabel, go } from '../ui';
import { clock, matchesTopic, minutes, rank, shareLink, daysAgo } from '../util';
import { IGift, IHeart, IPause, IPlay, ISave, ISearch, IShare } from '../icons';

export function Feed({ data, startId, topic, setTopic }: { data: AppData; startId?: string; topic: string; setTopic: (t: string) => void }) {
  const prefs = usePrefs();
  const p = usePlayer();
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState('');
  const [toast, setToast] = useState('');

  // The order is fixed when the feed opens so cards don't jump around while someone is swiping.
  const order = useMemo(() => {
    const ranked = rank(data, prefs);
    if (!startId) return ranked;
    const first = ranked.find((c) => c.id === startId);
    return first ? [first, ...ranked.filter((c) => c.id !== startId)] : ranked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, startId]);
  const cards = useMemo(() => (topic === 'For You' ? order : order.filter((c) => matchesTopic(c.topic, topic))), [order, topic]);
  const teacher = (id: string) => data.teachers.find((t) => t.id === id);

  // Two directions: up/down stays with one teacher (newest first); left/right moves to another teacher.
  // Teachers are ordered by how well their best class ranks for this person.
  const columns = useMemo(() => {
    const by = new Map<string, ClassItem[]>();
    for (const c of cards) { if (!by.has(c.teacherId)) by.set(c.teacherId, []); by.get(c.teacherId)!.push(c); }
    return [...by.entries()].map(([teacherId, list]) => {
      const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
      // A shared link opens on that exact class.
      const first = startId ? sorted.find((c) => c.id === startId) : undefined;
      return { teacherId, list: first ? [first, ...sorted.filter((c) => c !== first)] : sorted };
    });
  }, [cards, startId]);
  const activeCol = Math.max(0, columns.findIndex((col) => col.list.some((c) => c.id === active)));

  useEffect(() => { scroller.current?.scrollTo({ left: 0 }); setActive(''); }, [topic]);

  // Which card is on screen
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive((e.target as HTMLElement).dataset.id || '')), { root, threshold: 0.6 });
    root.querySelectorAll('[data-id]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [columns, activeCol]);

  // Swiping moves on: if a class was playing, the next one starts; otherwise nothing plays until tapped.
  const started = useRef(0);
  const moves = useRef(0);
  useEffect(() => {
    if (active && ++moves.current === 4 && !prefs.swiped) setPrefs({ swiped: true });
    if (!active || !p.cls || p.cls.id === active || !p.playing) return;
    const next = cards.find((c) => c.id === active);
    if (!next) return;
    if (Date.now() - started.current < 5000) learn(['t:' + p.cls.teacherId, p.cls.topic && 'k:' + p.cls.topic], -1); // swiped away within seconds
    started.current = Date.now();
    p.play(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200); };
  const like = (c: ClassItem) => {
    if (!prefs.liked.includes(c.id)) learn(['t:' + c.teacherId, c.topic && 'k:' + c.topic], 3);
    setPrefs({ liked: toggleIn(prefs.liked, c.id) });
  };
  const erubUp = data.erub.filter((e) => e.fresh && erubLabel(e).good);
  const topics = ['For You', ...data.topics];
  const current = p.cls && p.cls.id === active ? p : null;

  return (
    <div className="feed">
      <div className="feed-x" ref={scroller}>
        {columns.map((col, ci) => (
          <div className="feed-col" key={col.teacherId} data-col={ci}>
            {/* Only the teacher on screen and the ones beside it are drawn in full. */}
            {Math.abs(ci - activeCol) > 1 ? <section className="card" /> : col.list.map((c, i) => {
          const t = teacher(c.teacherId);
          const mine = p.cls?.id === c.id;
          const playing = mine && p.playing;
          const img = c.image || t?.photo;
          return (
            <section key={c.id} data-id={c.id} className="card">
              <div className="card-bg none" />
              {img && <img className="card-bg" src={img} alt="" loading={i < 2 ? 'eager' : 'lazy'} onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
              <div className="card-shade" />
              <button className="card-tap" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { started.current = Date.now(); p.toggle(c); }} />
              <button className="card-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => { started.current = Date.now(); p.toggle(c); }}>
                {playing ? <IPause size={30} /> : <IPlay size={30} />}
              </button>
              <div className="card-info">
                <div className="tags">
                  {daysAgo(c.date) <= 0 && <span className="tag new">NEW TODAY</span>}
                  {c.topic && <span className="tag">{c.topic.toUpperCase()}</span>}
                  {c.durationSec > 0 && <span className="tag">{(c.durationSec < 660 ? 'QUICK · ' : '') + minutes(c.durationSec).toUpperCase()}</span>}
                </div>
                <h2 className="card-title">{c.title}</h2>
                <div className="card-by">
                  <a href={'#/teacher/' + c.teacherId}>{t?.name}</a>
                  <button className={'follow' + (prefs.following.includes(c.teacherId) ? ' on' : '')} aria-pressed={prefs.following.includes(c.teacherId)} onClick={() => setPrefs({ following: toggleIn(prefs.following, c.teacherId) })}>
                    {prefs.following.includes(c.teacherId) ? 'Following' : '+ Follow'}
                  </button>
                </div>
                {!prefs.swiped && <div className="card-hint">Swipe up for more from {t?.name.split(' ').slice(-1)[0]} · swipe sideways for another teacher</div>}
                {mine && <div className="card-time">{clock(p.time)} / {clock(p.duration || c.durationSec)}</div>}
                {mine && p.error && <div className="card-error" role="alert">{p.error}</div>}
              </div>
              <div className="rail">
                <a href={'#/teacher/' + c.teacherId} aria-label={t?.name + ' page'}><Avatar t={t} size={52} ring /></a>
                <button onClick={() => like(c)} aria-pressed={prefs.liked.includes(c.id)} className={prefs.liked.includes(c.id) ? 'hot' : ''}>
                  <IHeart size={30} fill={prefs.liked.includes(c.id) ? 'currentColor' : 'none'} />{prefs.liked.includes(c.id) ? 'Liked' : 'Like'}
                </button>
                <button onClick={() => setPrefs({ saved: toggleIn(prefs.saved, c.id) })} aria-pressed={prefs.saved.includes(c.id)}>
                  <ISave size={28} fill={prefs.saved.includes(c.id) ? 'currentColor' : 'none'} />{prefs.saved.includes(c.id) ? 'Saved' : 'Save'}
                </button>
                <button onClick={async () => { const r = await shareLink(`${c.title} — ${t?.name}`, '/class/' + encodeURIComponent(c.id)); if (r === 'copied') say('Link copied'); }}>
                  <IShare size={28} />Share
                </button>
                <a href="#/give" className="hot"><IGift size={28} />Sponsor</a>
              </div>
            </section>
          );
        })}
          </div>
        ))}
        {cards.length === 0 && (
          <div className="feed-empty">
            <h2>Nothing here yet</h2>
            <p>No classes in {topic} right now. New ones appear as soon as a teacher posts.</p>
            <button className="btn" onClick={() => setTopic('For You')}>Back to For You</button>
          </div>
        )}
      </div>

      <header className="feed-top">
        <div className="feed-brand">
          <span className="mark"><img src="./brand/vm-mark.png" alt="" /></span>
          <span><strong>Virtual Midrash</strong><small>Sephardic Community Alliance</small></span>
          <span className="grow" />
          {erubUp.length > 0 && <a className="erub-pill" href="#/week"><span className="dot good" />ERUB {erubUp.length === data.erub.length ? 'UP' : erubUp[0].short.toUpperCase() + ' UP'}</a>}
          <a className="icon-btn" href="#/explore" aria-label="Search"><ISearch /></a>
        </div>
        <div className="chips scroll">
          {topics.map((t) => <button key={t} className={'chip' + (t === topic ? ' on' : '')} aria-pressed={t === topic} onClick={() => setTopic(t)}>{t}</button>)}
        </div>
      </header>
      {columns.length > 1 && <div className="feed-dots" aria-hidden="true">{columns.slice(0, 12).map((col, i) => <span key={col.teacherId} className={i === activeCol ? 'on' : ''} />)}</div>}
      {current && <div className="feed-progress" style={{ width: `${(current.duration ? current.time / current.duration : 0) * 100}%` }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
