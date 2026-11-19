import { useMemo, useState } from 'react';
import type { AppData, WeeklyClass } from '../types';
import { usePrefs } from '../store';
import { CodeBox, ErubCard, useUnlocked } from '../ui';
import { shareLink } from '../util';
import { IChevron, IShare } from '../icons';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function LiveClass({ w, data }: { w: WeeklyClass; data: AppData }) {
  const { code } = usePrefs();
  const zoom = useUnlocked(w.lockedZoom);
  const address = useUnlocked(w.lockedAddress);
  const teacher = data.teachers.find((t) => t.id === w.teacherId);
  const locked = (w.lockedZoom && !zoom) || (w.lockedAddress && !address);
  const place = address || w.location;
  // No street address on screen (locked, or simply not listed): offer to text for it.
  const contact = data.links.addressContact;
  const needsAddress = w.mode !== 'zoom' && !/\d/.test(place);
  const who = teacher?.name || w.teacherName;
  const ask = contact ? `sms:${contact.sms}?&body=${encodeURIComponent(`Hi, can I please get the address for ${w.title}${who ? ' with ' + who : ''} on ${w.day} at ${w.time}? Thank you!`)}` : '';
  return (
    <div className="panel col">
      <div className="spread"><strong className="time">{w.time}</strong><span className="badge">{w.mode === 'zoom' ? 'ZOOM' : w.mode === 'both' ? 'IN PERSON + ZOOM' : 'IN PERSON'}</span></div>
      <div>
        <div className="panel-title">{w.title}</div>
        {(teacher || w.teacherName) && (teacher ? <a className="panel-sub link" href={'#/teacher/' + teacher.id}>{teacher.name}</a> : <div className="panel-sub">{w.teacherName}</div>)}
        {place && <div className="muted small">{place}</div>}
        {w.lockedAddress && !address && <div className="muted small">Address is locked</div>}
      </div>
      {locked && !code && <CodeBox data={data} what={w.lockedAddress ? 'the address' : 'the Zoom link'} />}
      <div className="actions">
        {needsAddress && contact && <a className="btn small grow" href={ask}>Text for address</a>}
        {zoom && <a className="btn small grow" href={zoom} target="_blank" rel="noreferrer">Join on Zoom</a>}
        {w.mode !== 'zoom' && place && !needsAddress && (!w.lockedAddress || address) && <a className={'btn small grow' + (zoom ? ' ghost' : '')} href={'https://maps.google.com/?q=' + encodeURIComponent(place.replace(/\s*·\s*/g, ', '))} target="_blank" rel="noreferrer">Get directions</a>}
        <button className="round line" aria-label="Share this class" onClick={() => shareLink(`${w.title} — ${w.day} ${w.time}`, '/week')}><IShare size={20} /></button>
      </div>
    </div>
  );
}

export function Week({ data }: { data: AppData }) {
  const days = useMemo(() => {
    const out: { key: string; date: Date; name: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      const name = DAYS[d.getDay()];
      if (i === 0 || data.schedule.weekly.some((w) => w.day === name)) out.push({ key: iso(d), date: d, name });
    }
    return out;
  }, [data]);
  const firstWithClasses = days.find((d) => data.schedule.weekly.some((w) => w.day === d.name)) || days[0];
  const [sel, setSel] = useState(firstWithClasses.key);
  const day = days.find((d) => d.key === sel) || days[0];
  const classes = data.schedule.weekly.filter((w) => w.day === day.name);
  const notices = data.schedule.notices.filter((n) => n.date === day.key);
  return (
    <div className="page">
      <div className="head"><div><h1>This Week</h1><p className="muted">Live classes around the community</p></div><img className="sca" src="./brand/sca-icon-white.png" alt="Sephardic Community Alliance" /></div>
      <ErubCard erub={data.erub} />
      <div className="days" style={{ gridTemplateColumns: `repeat(${Math.min(days.length, 5)}, minmax(0, 1fr))` }}>
        {days.map((d, i) => (
          <button key={d.key} className={'day' + (d.key === sel ? ' on' : '')} aria-pressed={d.key === sel} onClick={() => setSel(d.key)}>
            <span>{i === 0 ? 'TODAY' : d.name.toUpperCase()}</span><b>{d.date.getDate()}</b>
          </button>
        ))}
      </div>
      {notices.map((n, i) => (
        <div key={i}>
          {n.dedication && <div className="dedication"><span className="label">TODAY’S CLASSES ARE DEDICATED</span><b>{n.dedication}</b></div>}
          {n.text && <div className="notice">{n.text}</div>}
        </div>
      ))}
      {classes.length === 0 && <p className="muted">No live classes on this day.</p>}
      {classes.map((w, i) => <LiveClass key={day.key + i} w={w} data={data} />)}
      {data.links.newsletter && (
        <a className="panel live blue" href={data.links.newsletter} target="_blank" rel="noreferrer">
          <span><span className="label light">EVERY FRIDAY</span><b>Read this week’s newsletter</b></span><IChevron />
        </a>
      )}
      {(data.links.connect || []).length > 0 && <>
        <div className="label">STAY CONNECTED</div>
        {data.links.connect!.map((l) => (
          <a key={l.url} className="panel live" href={l.url} target="_blank" rel="noreferrer"><span><b>{l.label}</b><span className="muted small">{l.note}</span></span><IChevron /></a>
        ))}
      </>}
    </div>
  );
}
