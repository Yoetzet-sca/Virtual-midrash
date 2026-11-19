// One audio player for the whole app. Audio streams straight from the teacher's own feed link.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ClassItem, Teacher } from './types';
import { learn, getPrefs, setPrefs, savePosition } from './store';

type Player = {
  cls: ClassItem | null; playing: boolean; time: number; duration: number; error: string;
  rate: number;
  play: (c: ClassItem) => void; pause: () => void; toggle: (c: ClassItem) => void; seek: (t: number) => void; skip: (by: number) => void; cycleRate: () => void;
};
const Ctx = createContext<Player | null>(null);
export const usePlayer = () => useContext(Ctx)!;

export function PlayerProvider({ teachers, children }: { teachers: Teacher[]; children: React.ReactNode }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const counted = useRef(new Set<string>());
  const [cls, setCls] = useState<ClassItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [rate, setRate] = useState(getPrefs().rate || 1);
  const lastSaved = useRef(0);
  const resumeAt = useRef(0);
  const clsRef = useRef<ClassItem | null>(null);

  useEffect(() => {
    const a = new Audio();
    a.preload = 'none';
    audio.current = a;
    const on = (e: string, f: () => void) => a.addEventListener(e, f);
    on('play', () => setPlaying(true));
    on('pause', () => { setPlaying(false); const c = clsRef.current; if (c && a.currentTime > 10 && !a.ended) savePosition(c.id, a.currentTime); });
    on('ended', () => { setPlaying(false); if (clsRef.current) savePosition(clsRef.current.id, null); });
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
      if (c && Math.abs(a.currentTime - lastSaved.current) > 5) {
        lastSaved.current = a.currentTime;
        const nearEnd = Number.isFinite(a.duration) && a.currentTime > a.duration - 30;
        savePosition(c.id, nearEnd || a.currentTime < 10 ? null : a.currentTime);
      }
      // Listening for a full minute counts as interest in that teacher and topic.
      if (c && a.currentTime > 60 && !counted.current.has(c.id)) {
        counted.current.add(c.id);
        learn(['t:' + c.teacherId, c.topic && 'k:' + c.topic], 2);
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

  const value = useMemo(() => ({ cls, playing, time, duration, error, rate, play, pause, toggle, seek, skip, cycleRate }), [cls, playing, time, duration, error, rate, play, pause, toggle, seek, skip, cycleRate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
