// One audio player for the whole app. Audio streams straight from the teacher's own feed link.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ClassItem, Teacher } from './types';
import { learn, getPrefs, setPrefs, savePosition } from './store';
import { track, listened } from './analytics';

type Player = {
  cls: ClassItem | null; playing: boolean; time: number; duration: number; error: string;
  rate: number;
  play: (c: ClassItem) => void; pause: () => void; toggle: (c: ClassItem) => void; seek: (t: number) => void; skip: (by: number) => void; cycleRate: () => void;
};
const Ctx = createContext<Player | null>(null);
export const usePlayer = () => useContext(Ctx)!;

// The next class in a series: the same teacher's next-posted class in the same topic (Arakhin 7 → Arakhin 8).
export function nextInSeries(c: ClassItem, classes: ClassItem[]) {
  return classes
    .filter((x) => x.kind === 'audio' && x.teacherId === c.teacherId && x.topic === c.topic && x.date > c.date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
}

export function PlayerProvider({ teachers, classes, children }: { teachers: Teacher[]; classes: ClassItem[]; children: React.ReactNode }) {
  const playRef = useRef<(c: ClassItem) => void>(() => {});
  const audio = useRef<HTMLAudioElement | null>(null);
  const counted = useRef(new Set<string>());
  const [cls, setCls] = useState<ClassItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [rate, setRate] = useState(getPrefs().rate || 1);
  const lastSaved = useRef(0);
  const lastTick = useRef(0);
  const resumeAt = useRef(0);
  const clsRef = useRef<ClassItem | null>(null);

  useEffect(() => {
    const a = new Audio();
    a.preload = 'none';
    audio.current = a;
    const on = (e: string, f: () => void) => a.addEventListener(e, f);
    on('play', () => setPlaying(true));
    on('pause', () => { setPlaying(false); const c = clsRef.current; if (c && a.currentTime > 10 && !a.ended) savePosition(c.id, a.currentTime); });
    on('ended', () => {
      setPlaying(false);
      const done = clsRef.current;
      if (!done) return;
      savePosition(done.id, null);
      // Carry on to the next class in the series, and move the feed to it if the feed is showing.
      const next = nextInSeries(done, classes);
      if (next) {
        playRef.current(next);
        if (/^#?\/?(class\/.*)?$/.test(location.hash)) location.hash = '/class/' + encodeURIComponent(next.id);
      }
    });
    on('loadedmetadata', () => {
      setDuration(Number.isFinite(a.duration) ? a.duration : 0);
      // Pick up where they left off.
      if (resumeAt.current > 10 && (!Number.isFinite(a.duration) || resumeAt.current < a.duration - 30)) a.currentTime = resumeAt.current;
      resumeAt.current = 0;
      a.playbackRate = getPrefs().rate || 1;
    });
    on('timeupdate', () => {
      setTime(a.currentTime);
      const c = clsRef.current;
      // Real listening time (ignores skipping ahead): only small forward steps while playing count.
      const step = a.currentTime - lastTick.current; lastTick.current = a.currentTime;
      if (c && step > 0 && step < 2) listened(c.id, teachers.find((x) => x.id === c.teacherId)?.name || c.teacherId, step / (a.playbackRate || 1));
      if (c && Math.abs(a.currentTime - lastSaved.current) > 5) {
        lastSaved.current = a.currentTime;
        const nearEnd = Number.isFinite(a.duration) && a.currentTime > a.duration - 30;
        savePosition(c.id, nearEnd || a.currentTime < 10 ? null : a.currentTime);
      }
      // Listening for a full minute counts as interest in that teacher and topic.
      if (c && a.currentTime > 60 && !counted.current.has(c.id)) {
        counted.current.add(c.id);
        learn(['t:' + c.teacherId, c.topic && 'k:' + c.topic], 2);
        track('listen', `${teachers.find((x) => x.id === c.teacherId)?.name || c.teacherId} / ${c.topic || 'No topic'}`);
      }
    });
    on('error', () => { setPlaying(false); setError('This class could not be played. It may have been removed by the teacher.'); });
    return () => { a.pause(); a.src = ''; };
  }, []);

  const play = useCallback((c: ClassItem) => {
    const a = audio.current!;
    setError('');
    if (clsRef.current?.id !== c.id) {
      clsRef.current = c;
      setCls(c); setTime(0); setDuration(c.durationSec || 0);
      resumeAt.current = getPrefs().positions[c.id]?.[0] || 0;
      lastSaved.current = resumeAt.current;
      if (resumeAt.current) setTime(resumeAt.current);
      a.src = c.audioUrl;
      if ('mediaSession' in navigator) {
        const t = teachers.find((x) => x.id === c.teacherId);
        const art = c.image || t?.photo;
        navigator.mediaSession.metadata = new MediaMetadata({ title: c.title, artist: t?.name || 'Virtual Midrash', album: 'Virtual Midrash', artwork: art ? [{ src: art }] : [] });
      }
    }
    a.play().catch(() => setPlaying(false));
  }, [teachers]);
  playRef.current = play;
  const pause = useCallback(() => audio.current?.pause(), []);
  const toggle = useCallback((c: ClassItem) => {
    if (clsRef.current?.id === c.id && !audio.current!.paused) audio.current!.pause(); else play(c);
  }, [play]);
  const seek = useCallback((t: number) => { if (audio.current) audio.current.currentTime = t; }, []);
  const skip = useCallback((by: number) => { const a = audio.current; if (a) a.currentTime = Math.max(0, Math.min(a.duration || Infinity, a.currentTime + by)); }, []);
  const cycleRate = useCallback(() => {
    const steps = [1, 1.25, 1.5, 2];
    const next = steps[(steps.indexOf(getPrefs().rate || 1) + 1) % steps.length];
    setPrefs({ rate: next }); setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  }, []);

  // Lock-screen and headphone buttons
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const set = (a: MediaSessionAction, f: (() => void) | null) => { try { navigator.mediaSession.setActionHandler(a, f); } catch { /* not supported on this phone */ } };
    set('seekbackward', () => skip(-15));
    set('seekforward', () => skip(30));
    const next = cls ? nextInSeries(cls, classes) : undefined;
    set('nexttrack', next ? () => play(next) : null);
  }, [cls, classes, skip, play]);

  const value = useMemo(() => ({ cls, playing, time, duration, error, rate, play, pause, toggle, seek, skip, cycleRate }), [cls, playing, time, duration, error, rate, play, pause, toggle, seek, skip, cycleRate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
