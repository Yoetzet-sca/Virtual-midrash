import type { AppData, ClassItem } from '../types';
import { usePrefs } from '../store';
import { ClassRow } from '../ui';
import { clock } from '../util';

// Everything this person has set aside or is in the middle of. Stored on this phone only.
export function Library({ data }: { data: AppData }) {
  const prefs = usePrefs();
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
    </div>
  );
}
