import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppData, ClassItem } from '../types';
import { usePrefs, getPrefs, setPrefs, toggleIn, learn } from '../store';
import { usePlayer } from '../player';
import { Avatar, erubLabel, go } from '../ui';
import { classShare, clock, initials, matchesTopic, minutes, newFromFollowed, rank, shareLink, daysAgo, sized, findClasses, classesNaming } from '../util';
import { matches } from '../search';
import { IHeart, IPause, IPlay, ISave, ISaved, ISearch, IShare, IInfo } from '../icons';

export function Feed({ data, startId: linkId, topic, setTopic }: { data: AppData; startId?: string; topic: string; setTopic: (t: string) => void }) {
  const prefs = usePrefs();
  const p = usePlayer();
  // With no class asked for, open on the class this person was last in the middle of.
  const [resumeId] = useState(() => Object.entries(getPrefs().positions).sort((a, b) => b[1][1] - a[1][1])[0]?.[0]);
  const startId = linkId ?? (data.classes.some((c) => c.id === resumeId) ? resumeId : undefined);
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState('');
  const [toast, setToast] = useState('');
  const [video, setVideo] = useState(''); // the class whose YouTube player is open
  const [videoPaused, setVideoPaused] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  // YouTube's player takes play/pause commands as messages, and reports its state back the same way.
  const tellVideo = (func: string, args: unknown[] = []) => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
  // Where the open video is, as YouTube's player reports it, so videos get the same bar as audio classes.
  const [vTime, setVTime] = useState(0);
  const [vDur, setVDur] = useState(0);
  const [vRate, setVRate] = useState(1);
  const vSeek = (to: number) => { const s = Math.max(0, vDur ? Math.min(vDur - 1, to) : to); setVTime(s); tellVideo('seekTo', [s, true]); };
  const vCycleRate = () => { const steps = [1, 1.25, 1.5, 2]; const next = steps[(steps.indexOf(vRate) + 1) % steps.length]; setVRate(next); tellVideo('setPlaybackRate', [next]); };
  const toggleVideo = () => { tellVideo(videoPaused ? 'playVideo' : 'pauseVideo'); setVideoPaused(!videoPaused); };
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!/^https:\/\/www\.youtube(-nocookie)?\.com$/.test(e.origin) || typeof e.data !== 'string') return;
      try {
        const info = JSON.parse(e.data)?.info;
        if (typeof info?.currentTime === 'number') setVTime(info.currentTime);
        if (typeof info?.duration === 'number' && info.duration > 0) setVDur(info.duration);
        if (typeof info?.playbackRate === 'number') setVRate(info.playbackRate);
        const state = info?.playerState;
        if (state === 1) setVideoPaused(false); // playing
        if (state === 2 || state === 0) setVideoPaused(true); // paused or ended (e.g. from YouTube's own controls)
      } catch { /* not a player message */ }
    };
    addEventListener('message', onMessage);
    return () => removeEventListener('message', onMessage);
  }, []);

  // The order is fixed when the feed opens so cards don't jump around while someone is swiping.
  const order = useMemo(() => {
    const ranked = rank(data, prefs);
    if (!startId) return ranked;
    const first = ranked.find((c) => c.id === startId);
    return first ? [first, ...ranked.filter((c) => c.id !== startId)] : ranked;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, startId]);
  // Timely filters beside the topics: this week's perasha, a holiday coming within six weeks, and today's daf.
  // They look through every year's classes by title, however the teacher spelled it.
  const timely = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const sc = data.shortcuts;
    const daf = sc?.daf[key];
    const days = sc?.holiday ? (new Date(sc.holiday.date + 'T12:00:00').getTime() - now.getTime()) / 86400000 : 99;
    const ids = (list: ClassItem[]) => new Set(list.map((c) => c.id));
    return ([
      sc?.perasha && { id: 'wk:perasha', label: `Parasha: ${sc.perasha.name}`, ids: ids(sc.perasha.search.flatMap((n) => classesNaming(data, n))) },
      sc?.holiday && days <= 42 && { id: 'wk:holiday', label: sc.holiday.name, ids: ids((sc.holiday.search || [sc.holiday.name]).flatMap((n) => classesNaming(data, n))) },
      daf && { id: 'wk:daf', label: `Today’s daf: ${daf.tractate} ${daf.page}`, ids: ids(findClasses(data, `${daf.tractate} ${daf.page}`).filter((c) => matches(`${daf.tractate} ${daf.page}`, c.title))) },
    ].filter(Boolean) as { id: string; label: string; ids: Set<string> }[]).filter((x) => x.ids.size > 0); // no chip that leads nowhere
  }, [data]);
  // A search from Explore can be opened in the feed too: its chip is 'q:' followed by what was searched.
  const labelOf = (id: string) => (id.startsWith('q:') ? `“${id.slice(2)}”` : timely.find((x) => x.id === id)?.label || id);
  // Hidden teachers stay out of the feed, unless someone opens one of their classes directly.
  const cards = useMemo(() => {
    const direct = startId ? order.find((c) => c.id === startId)?.teacherId : undefined;
    const shown = order.filter((c) => !prefs.hidden.includes(c.teacherId) || c.teacherId === direct);
    if (topic.startsWith('q:')) { const hits = new Set(findClasses(data, topic.slice(2)).map((c) => c.id)); return shown.filter((c) => hits.has(c.id)); }
    const special = timely.find((x) => x.id === topic);
    if (special) return shown.filter((c) => special.ids.has(c.id));
    return topic === 'For You' ? shown : shown.filter((c) => matchesTopic(c.topic, topic));
  }, [order, topic, prefs.hidden, startId, timely]);

  // Press and hold Follow to hide a teacher from the feed.
  const [hideAsk, setHideAsk] = useState('');
  const [about, setAbout] = useState(''); // the class whose AI summary and parts are open
  const hold = useRef<{ timer?: number; fired?: boolean }>({});
  const holdStart = (teacherId: string) => { hold.current.fired = false; hold.current.timer = window.setTimeout(() => { hold.current.fired = true; setHideAsk(teacherId); }, 550); };
  const holdEnd = () => window.clearTimeout(hold.current.timer);
  const hide = (teacherId: string) => {
    setPrefs({ hidden: [...prefs.hidden.filter((x) => x !== teacherId), teacherId], following: prefs.following.filter((x) => x !== teacherId) });
    setHideAsk('');
    scroller.current?.scrollTo({ left: 0 });
    say('Hidden from your feed');
  };
  const teacher = (id: string) => data.teachers.find((t) => t.id === id);

  // Two directions: up/down stays with one teacher (newest first); left/right moves to another teacher.
  // Teachers are ordered by how well their best class ranks for this person.
  const columns = useMemo(() => {
    const by = new Map<string, ClassItem[]>();
    for (const c of cards) { if (!by.has(c.teacherId)) by.set(c.teacherId, []); by.get(c.teacherId)!.push(c); }
    const startTeacher = startId ? cards.find((c) => c.id === startId)?.teacherId : undefined;
    return [...by.entries()].sort((a, b) => Number(b[0] === startTeacher) - Number(a[0] === startTeacher)).map(([teacherId, list]) => {
      const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
      // A shared link opens on that exact class.
      const first = startId ? sorted.find((c) => c.id === startId) : undefined;
      // The feed is for what is new: each teacher's column holds their newest 60. Everything older is in search, topics
      // and the teacher's page, and still opens here when someone taps or shares it.
      return { teacherId, list: (first ? [first, ...sorted.filter((c) => c !== first)] : sorted).slice(0, 60) };
    });
  }, [cards, startId]);
  const activeCol = Math.max(0, columns.findIndex((col) => col.list.some((c) => c.id === active)));
  // Only a few cards are drawn in full at a time: the one on screen, the ones just above and below it, and the top of the
  // teachers on either side. The rest are empty placeholders of the same size. Drawing hundreds of cards with photos
  // made iPhones run out of memory and reload the page.
  const place = useRef(new Map<string, number>()); // teacher → index of the card last on screen
  columns.forEach((col) => { const i = col.list.findIndex((c) => c.id === active); if (i >= 0) place.current.set(col.teacherId, i); });

  useEffect(() => { place.current.clear(); scroller.current?.scrollTo({ left: 0 }); scroller.current?.querySelectorAll('.feed-col').forEach((el) => el.scrollTo({ top: 0 })); setActive(''); }, [topic]);
  // Coming back to a class (tapping the player bar, or a shared link): show that class, in any topic.
  const pending = useRef(startId);
  useEffect(() => { pending.current = startId; }, [startId]);
  useEffect(() => {
    if (!pending.current) return;
    // Only a class someone asked for by link pulls the feed back to For You. The class they were last in the middle of
    // must not: it used to undo a filter chosen from Explore before it could show.
    if (!cards.some((c) => c.id === pending.current)) { if (topic !== 'For You' && linkId && pending.current === linkId) setTopic('For You'); else pending.current = undefined; return; }
    pending.current = undefined;
    // Wait for the list to settle, then go to the top-left, where that class now sits.
    const id = requestAnimationFrame(() => requestAnimationFrame(() => {
      scroller.current?.scrollTo({ left: 0 });
      scroller.current?.querySelector('.feed-col')?.scrollTo({ top: 0 });
    }));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startId, columns]);

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
    if (video && video !== active) setVideo(''); // swiping away closes the video
    if (!active || !p.cls || p.cls.id === active || !p.playing) return;
    const next = cards.find((c) => c.id === active);
    if (!next) return;
    if (Date.now() - started.current < 5000) learn(['t:' + p.cls.teacherId, p.cls.topic && 'k:' + p.cls.topic], -1); // swiped away within seconds
    if (next.kind === 'video') { p.pause(); return; } // videos start when tapped
    started.current = Date.now();
    p.play(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2200); };
  const like = (c: ClassItem) => {
    if (!prefs.liked.includes(c.id)) learn(['t:' + c.teacherId, c.topic && 'k:' + c.topic], 3);
    setPrefs({ liked: toggleIn(prefs.liked, c.id) });
  };
  // Today's dedication (from the Notices tab) shows on the feed and leads to Give.
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const dedication = data.schedule.notices.find((n) => n.date === todayKey && n.dedication)?.dedication;
  const fresh = newFromFollowed(data, prefs).length;
  const erubUp = data.erub.filter((e) => e.fresh && erubLabel(e).good);
  const topics = ['For You', ...(topic.startsWith('q:') ? [topic] : []), ...timely.map((x) => x.id), ...data.topics];
  const current = p.cls && p.cls.id === active ? p : null;

  return (
    <div className={'feed' + (dedication ? ' has-ded' : '')}>
      <div className="feed-x" ref={scroller}>
        {columns.map((col, ci) => (
          <div className="feed-col" key={col.teacherId} data-col={ci}>
            {/* Only the teacher on screen and the ones beside it are drawn in full. */}
            {Math.abs(ci - activeCol) > 1 ? <section className="card" /> : col.list.map((c, i) => {
          if (Math.abs(i - (place.current.get(col.teacherId) ?? 0)) > 1) return <section key={c.id} data-id={c.id} className="card" />;
          const t = teacher(c.teacherId);
          const mine = p.cls?.id === c.id;
          const playing = mine && p.playing;
          const img = c.image || t?.photo;
          const isVideo = c.kind === 'video' && !!c.youtubeId;
          const tap = () => {
            if (!isVideo) { started.current = Date.now(); p.toggle(c); }
            else if (video === c.id) toggleVideo(); // already open: the whole screen pauses and resumes it
            else { p.pause(); setVideo(c.id); setVideoPaused(false); setVTime(0); setVDur(0); setVRate(1); }
          };
          return (
            <section key={c.id} data-id={c.id} className="card">
              <div className="card-bg none" />
              {img && <img className="card-bg blur" src={sized(img, 200)} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
              <div className="card-shade" />
              <button className="card-tap" aria-label={playing ? 'Pause' : 'Play'} onClick={tap} />
              <div className="card-stage">
                <div className={'card-photo' + (isVideo ? ' video' : '')}>
                  <span>{isVideo ? '' : initials(t?.name || '')}</span>
                  {img && <img src={sized(img, 500)} alt="" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                  {isVideo && video === c.id
                    ? <>
                      <iframe ref={frame} title={c.title} src={`https://www.youtube-nocookie.com/embed/${c.youtubeId}?autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
                        onLoad={() => frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*')} />
                      {/* Covers the video except its bottom strip, where YouTube's own bar (seek, full screen) stays reachable. */}
                      <button className="video-tap" aria-label={videoPaused ? 'Play' : 'Pause'} onClick={tap}>{videoPaused && <span className="disc"><IPlay size={28} /></span>}</button>
                    </>
                    : <button className="card-play" aria-label={playing ? 'Pause' : 'Play'} onClick={tap}><span className="disc">{playing ? <IPause size={28} /> : <IPlay size={28} />}</span></button>}
                </div>
              </div>
              <div className="card-info">
                <div className="tags">
                  {!mine && prefs.positions[c.id] && <span className="tag new">CONTINUE · {clock(prefs.positions[c.id][0])}</span>}
                  {daysAgo(c.date) <= 0 && <span className="tag new">NEW TODAY</span>}
                  {isVideo && <span className="tag">VIDEO</span>}
                  {c.topic && <span className="tag">{c.topic.toUpperCase()}</span>}
                  {c.durationSec > 0 && <span className="tag">{(c.durationSec < 660 ? 'QUICK · ' : '') + minutes(c.durationSec).toUpperCase()}</span>}
                </div>
                <h2 className={'card-title' + (c.title.length > 100 ? ' xlong' : c.title.length > 55 ? ' long' : '')}>{c.title}</h2>
                {c.summary && prefs.swiped && c.title.length <= 100 && (
                  <button className={'card-sum' + (c.title.length > 55 ? ' one' : '')} onClick={() => setAbout(c.id)} aria-label="AI summary of this class. Open to read it all.">
                    <span className="ai-tag">AI summary</span>{c.summary}
                  </button>
                )}
                <div className="card-by">
                  <a href={'#/teacher/' + c.teacherId}>{t?.name}</a>
                  <button className={'follow' + (prefs.following.includes(c.teacherId) ? ' on' : '')} aria-pressed={prefs.following.includes(c.teacherId)}
                    onPointerDown={() => holdStart(c.teacherId)} onPointerUp={holdEnd} onPointerLeave={holdEnd} onPointerCancel={holdEnd} onContextMenu={(e) => e.preventDefault()}
                    onClick={() => { if (hold.current.fired) { hold.current.fired = false; return; } setPrefs({ following: toggleIn(prefs.following, c.teacherId) }); }}>
                    {prefs.following.includes(c.teacherId) ? 'Following' : '+ Follow'}
                  </button>
                </div>
                {!prefs.swiped && <div className="card-hint">Swipe up for more from {t?.name.split(' ').slice(-1)[0]} · swipe sideways for another teacher · hold Follow to hide a teacher</div>}
                {mine && p.error && <div className="card-error" role="alert">{p.error}</div>}
              </div>
              {!isVideo && (
                <div className={'scrub' + (mine ? '' : ' idle')}>
                  {!mine && <button className="scrub-cover" aria-label="Play" onClick={tap} />}
                  <button disabled={!mine} onClick={() => p.skip(-15)} aria-label="Back 15 seconds">−15</button>
                  <span className="scrub-time">{clock(mine ? p.time : prefs.positions[c.id]?.[0] || 0)}</span>
                  <input type="range" disabled={!mine} aria-label="Position in class" min={0} max={Math.max(1, Math.floor((mine && p.duration) || c.durationSec))} value={Math.floor(mine ? p.time : prefs.positions[c.id]?.[0] || 0)} onChange={(e) => p.seek(Number(e.target.value))} />
                  <span className="scrub-time">{clock((mine && p.duration) || c.durationSec)}</span>
                  <button disabled={!mine} onClick={() => p.skip(30)} aria-label="Forward 30 seconds">+30</button>
                  <button disabled={!mine} onClick={p.cycleRate} aria-label={'Speed ' + p.rate + ' times'} className="rate">{p.rate}×</button>
                </div>
              )}
              {isVideo && (() => {
                // The same bar for a video. It comes alive once the video is open; before that it shows the length.
                const open = video === c.id;
                const length = (open && vDur) || c.durationSec;
                return (
                  <div className={'scrub' + (open ? '' : ' idle')}>
                    {!open && <button className="scrub-cover" aria-label="Play" onClick={tap} />}
                    <button disabled={!open} onClick={() => vSeek(vTime - 15)} aria-label="Back 15 seconds">−15</button>
                    <span className="scrub-time">{clock(open ? vTime : 0)}</span>
                    <input type="range" disabled={!open} aria-label="Position in video" min={0} max={Math.max(1, Math.floor(length))} value={Math.floor(open ? vTime : 0)} onChange={(e) => vSeek(Number(e.target.value))} />
                    <span className="scrub-time">{length ? clock(length) : ''}</span>
                    <button disabled={!open} onClick={() => vSeek(vTime + 30)} aria-label="Forward 30 seconds">+30</button>
                    <button disabled={!open} onClick={vCycleRate} aria-label={'Speed ' + vRate + ' times'} className="rate">{open ? vRate : 1}×</button>
                  </div>
                );
              })()}
              <div className={'rail' + (isVideo ? ' no-who' : '')}>
                <a className="rail-who" href={'#/teacher/' + c.teacherId} aria-label={t?.name + ' page'}><Avatar t={t} size={52} ring /></a>
                <button onClick={() => like(c)} aria-pressed={prefs.liked.includes(c.id)} className={prefs.liked.includes(c.id) ? 'hot' : ''}>
                  <IHeart size={30} fill={prefs.liked.includes(c.id) ? 'currentColor' : 'none'} />{prefs.liked.includes(c.id) ? 'Liked' : 'Like'}
                </button>
                <button onClick={() => setPrefs({ saved: toggleIn(prefs.saved, c.id) })} aria-pressed={prefs.saved.includes(c.id)}>
                  <ISave size={28} fill={prefs.saved.includes(c.id) ? 'currentColor' : 'none'} />{prefs.saved.includes(c.id) ? 'Saved' : 'Save'}
                </button>
                {c.summary && <button onClick={() => setAbout(c.id)} aria-label="About this class"><IInfo size={28} />About</button>}
                <button onClick={async () => { const r = await shareLink(`${c.title} — ${t?.name}`, classShare(c)); if (r === 'copied') say('Link copied'); }}>
                  <IShare size={28} />Share
                </button>
              </div>
            </section>
          );
        })}
          </div>
        ))}
        {cards.length === 0 && (
          <div className="feed-empty">
            <h2>Nothing here yet</h2>
            <p>No classes for {labelOf(topic)} right now. New ones appear as soon as a teacher posts.</p>
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
          <a className="icon-btn has-badge" href="#/saved" aria-label={fresh > 0 ? `Your classes: ${fresh} new from teachers you follow` : 'Your classes'}><ISaved />{fresh > 0 && <span className="badge-dot">{fresh > 9 ? '9+' : fresh}</span>}</a>
          <a className="icon-btn" href="#/explore" aria-label="Search"><ISearch /></a>
        </div>
        <div className="chips scroll">
          {topics.map((t) => <button key={t} className={'chip' + (t === topic ? ' on' : '')} aria-pressed={t === topic} onClick={() => setTopic(t)}>{labelOf(t)}</button>)}
        </div>
        {dedication && <a className="ded" href="#/give"><span>Today’s learning is dedicated</span><b>{dedication}</b></a>}
      </header>
      {columns.length > 1 && <div className="feed-dots" aria-hidden="true">{columns.slice(0, 12).map((col, i) => <span key={col.teacherId} className={i === activeCol ? 'on' : ''} />)}</div>}
      {current && <div className="feed-progress" style={{ width: `${(current.duration ? current.time / current.duration : 0) * 100}%` }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      {about && (() => {
        const c = data.classes.find((x) => x.id === about);
        if (!c) return null;
        const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
        return (
          <div className="sheet-back" onClick={() => setAbout('')}>
            <div className="sheet about" role="dialog" aria-label="About this class" onClick={(e) => e.stopPropagation()}>
              <h2>{c.title}</h2>
              <p className="answer-sum flush"><span className="ai-tag">AI summary</span> {c.summary}</p>
              {c.kind === 'audio' && (c.chapters || []).length > 0 && <>
                <div className="label">JUMP TO A PART</div>
                <div className="parts">{c.chapters!.map(([at, title]) => <button key={at} className="part" onClick={() => { p.play(c, at); setAbout(''); }}><IPlay size={12} /><b>{clock(at)}</b><span>{title}</span></button>)}</div>
              </>}
              <button className="btn wide ghost" onClick={() => setAbout('')}>Close</button>
            </div>
          </div>
        );
      })()}
      {hideAsk && (
        <div className="sheet-back" onClick={() => setHideAsk('')}>
          <div className="sheet" role="dialog" aria-label="Hide teacher" onClick={(e) => e.stopPropagation()}>
            <h2>Hide {teacher(hideAsk)?.name} from your feed?</h2>
            <p className="muted">You won’t see their classes while swiping. You can still find them in Explore, and bring them back from their page.</p>
            <button className="btn wide" onClick={() => hide(hideAsk)}>Hide from my feed</button>
            <button className="btn wide ghost" onClick={() => setHideAsk('')}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
