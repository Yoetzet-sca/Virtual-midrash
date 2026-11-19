// Staff corrections from the "Overrides" tab: fix a class's topic or hide a class.
// Each row: match (text found in the title), topic (optional), teacherId (optional), hide (yes to remove).
import { TOPICS } from './topics.mjs';

const yes = (v) => /^(y|yes|true|1|x)$/i.test(String(v || '').trim());

export function applyOverrides(classes, rows) {
  const rules = (rows || []).filter((r) => String(r.match || '').trim()).map((r) => ({
    match: String(r.match).trim().toLowerCase(), teacherId: String(r.teacherId || '').trim(),
    topic: TOPICS.find((t) => t.toLowerCase() === String(r.topic || '').trim().toLowerCase()) || '', hide: yes(r.hide),
  }));
  const out = [];
  for (const c of classes) {
    const hit = rules.filter((r) => c.title.toLowerCase().includes(r.match) && (!r.teacherId || r.teacherId === c.teacherId));
    if (hit.some((r) => r.hide)) continue;
    const topic = hit.find((r) => r.topic)?.topic;
    out.push(topic ? { ...c, topic } : c);
  }
  return out;
}
