import { useMemo, useState } from 'react';
import type { AppData } from '../types';
import { Avatar, ClassRow } from '../ui';
import { ISearch } from '../icons';
import { matches } from '../search';

export function Explore({ data, place: startPlace, pickTopic }: { data: AppData; place?: string; pickTopic: (t: string) => void }) {
  const [q, setQ] = useState('');
  const [place, setPlace] = useState(startPlace || 'All');
  const places = useMemo(() => ['All', ...[...new Set(data.teachers.flatMap((t) => t.affiliations))].sort()], [data]);
  const teachers = data.teachers.filter((t) => place === 'All' || t.affiliations.includes(place));
  const teacher = (id: string) => data.teachers.find((t) => t.id === id);
  const needle = q.trim();
  const found = needle ? data.classes.filter((c) => matches(needle, c.title + ' ' + (teacher(c.teacherId)?.name || '') + ' ' + (c.topic || ''))).slice(0, 60) : [];
  const foundTeachers = needle ? data.teachers.filter((t) => matches(needle, t.name)) : [];
  // This week's shortcuts
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const sc = data.shortcuts;
  const daf = sc?.daf[todayKey];
  const holidayIn = sc?.holiday ? Math.round((new Date(sc.holiday.date + 'T12:00:00').getTime() - now.getTime()) / 86400000) : 0;
  const shortcuts = [
    daf && { label: 'Today’s daf', value: `${daf.tractate} ${daf.page}`, go: () => setQ(`${daf.tractate} ${daf.page}`) },
    sc?.perasha && { label: 'This week’s perasha', value: sc.perasha.name, go: () => setQ(sc.perasha!.search[0]) },
    sc?.holiday && { label: holidayIn <= 0 ? 'Holiday now' : `Holiday in ${holidayIn} day${holidayIn === 1 ? '' : 's'}`, value: sc.holiday.name, go: () => setQ(sc.holiday!.name) },
  ].filter(Boolean) as { label: string; value: string; go: () => void }[];
  return (
    <div className="page">
      <div className="head"><h1>Explore</h1><span className="grow" /><a className="chip outline" href="#/saved">Your classes</a><img className="sca" src="./brand/sca-icon-white.png" alt="Sephardic Community Alliance" /></div>
      <label className="search"><ISearch size={20} /><span className="sr">Search</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search classes or teachers" />
      </label>
      {needle ? (
        <>
          {foundTeachers.length > 0 && <div className="people one">{foundTeachers.map((t) => <a key={t.id} className="person" href={'#/teacher/' + t.id}><Avatar t={t} /><span>{t.name}</span></a>)}</div>}
          <div className="rows">{found.map((c) => <ClassRow key={c.id} c={c} teacher={teacher(c.teacherId)} />)}</div>
          {found.length + foundTeachers.length === 0 && <p className="muted">No classes found for “{q}” yet.</p>}
          <button className="chip" onClick={() => setQ('')}>Clear search</button>
        </>
      ) : (
        <>
          {shortcuts.length > 0 && <>
            <div className="label">THIS WEEK</div>
            <div className="shortcuts">{shortcuts.map((s) => <button key={s.label} onClick={s.go}><span>{s.label}</span><b>{s.value}</b></button>)}</div>
          </>}
          <div className="label">TOPICS</div>
          <div className="chips wrap">{data.topics.map((t) => <button key={t} className="chip" onClick={() => pickTopic(t)}>{t === 'Daf Yomi' ? 'Gemara › Daf Yomi' : t}</button>)}</div>

          <div className="label">RABBIS &amp; TEACHERS · BY SCHOOL OR SHUL</div>
          <div className="chips scroll bleed">{places.map((pl) => <button key={pl} className={'chip' + (pl === place ? ' on' : '')} aria-pressed={pl === place} onClick={() => setPlace(pl)}>{pl}</button>)}</div>
          <div className={'people' + (teachers.length <= 4 ? ' one' : '')}>{teachers.map((t) => <a key={t.id} className="person" href={'#/teacher/' + t.id}><Avatar t={t} /><span>{t.name}</span></a>)}</div>

          <div className="label">NEWEST CLASSES</div>
          <div className="rows">{data.classes.slice(0, 8).map((c) => <ClassRow key={c.id} c={c} teacher={teacher(c.teacherId)} />)}</div>
        </>
      )}
    </div>
  );
}
