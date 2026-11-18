import { useEffect, useState } from 'react';
import type { AppData, ClassItem, Erub, Teacher } from './types';
import { usePrefs, setPrefs } from './store';
import { unlock } from './lock';
import { usePlayer } from './player';
import { initials, minutes, when } from './util';
import { IPause, IPlay } from './icons';

export const go = (hash: string) => { location.hash = hash; };

export function Avatar({ t, size = 68, ring = false }: { t?: Teacher; size?: number; ring?: boolean }) {
  const [bad, setBad] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.3 };
  return (
    <span className={'avatar' + (ring ? ' ring' : '')} style={style}>
      {initials(t?.name || '?')}
      {t?.photo && !bad && <img src={t.photo} alt="" loading="lazy" onError={() => setBad(true)} />}
    </span>
  );
}

export function Chips({ items, value, onPick }: { items: { id: string; label: string }[]; value: string; onPick: (id: string) => void }) {
  return (
    <div className="chips">
      {items.map((i) => (
        <button key={i.id} className={'chip' + (i.id === value ? ' on' : '')} aria-pressed={i.id === value} onClick={() => onPick(i.id)}>{i.label}</button>
      ))}
    </div>
  );
}

export function ClassRow({ c, teacher, showTeacher = true }: { c: ClassItem; teacher?: Teacher; showTeacher?: boolean }) {
  const p = usePlayer();
  const active = p.cls?.id === c.id && p.playing;
  return (
    <button className="row" onClick={() => p.toggle(c)} aria-label={(active ? 'Pause ' : 'Play ') + c.title}>
      <span className="row-play">{active ? <IPause size={18} /> : <IPlay size={18} />}</span>
      <span className="row-text">
        <span className="row-title">{c.title}</span>
        <span className="row-meta">{[showTeacher && teacher?.name, c.topic, when(c.date), minutes(c.durationSec)].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  );
}

// A detail locked with the community code. Shows the real value once the right code is saved on this phone.
export function useUnlocked(blob: string) {
  const { code } = usePrefs();
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (!blob || !code) { setValue(null); return; }
    unlock(blob, code).then((v) => live && setValue(v));
    return () => { live = false; };
  }, [blob, code]);
  return value;
}

export function CodeBox({ data, what }: { data: AppData; what: string }) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const sample = data.schedule.weekly.map((w) => w.lockedAddress || w.lockedZoom).find(Boolean) || data.resources.map((r) => r.lockedPhone).find(Boolean) || '';
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sample) return;
    const ok = await unlock(sample, text);
    if (ok === null) setMsg('That code didn’t work. Check the code from the SCA office and try again.');
    else setPrefs({ code: text.trim().toLowerCase() });
  };
  return (
    <form className="codebox" onSubmit={submit}>
      <label htmlFor="vm-code">Enter the community code to see {what}</label>
      <div className="codebox-row">
        <input id="vm-code" value={text} onChange={(e) => { setText(e.target.value); setMsg(''); }} autoComplete="off" autoCapitalize="none" placeholder="Code" />
        <button className="btn small" disabled={!text.trim()}>Unlock</button>
      </div>
      {msg && <div className="codebox-msg" role="alert">{msg}</div>}
    </form>
  );
}

export function erubLabel(e: Erub) {
  if (!e.fresh) return { text: 'Not yet checked this week', good: false };
  if (e.status === 'up') return { text: 'UP', good: true };
  if (e.status === 'down') return { text: 'DOWN', good: false };
  if (e.status === 'checked') return { text: 'CHECKED', good: true };
  return { text: 'Not yet checked this week', good: false };
}

export function ErubCard({ erub, compact = false }: { erub: Erub[]; compact?: boolean }) {
  return (
    <div className={compact ? 'erub compact' : 'erub'}>
      {!compact && <div className="erub-head"><span className="label">ERUB STATUS</span><span className="muted small">Checked every Friday</span></div>}
      <div className="erub-grid">
        {erub.map((e) => {
          const l = erubLabel(e);
          return (
            <a key={e.id} className="erub-item" href={e.url} target="_blank" rel="noreferrer">
              <span className="erub-name"><span className={'dot' + (l.good ? ' good' : e.fresh ? ' bad' : '')} />{compact ? e.name : e.short}{e.fresh ? ` · ${l.text}` : ''}</span>
              <span className="muted small">{e.fresh && e.date ? `Checked ${new Date(e.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })}` : l.text}</span>
            </a>
          );
        })}
      </div>
      <div className="muted tiny">In severe weather do not rely on the erub. Tap to confirm on the erub’s own site.</div>
    </div>
  );
}
