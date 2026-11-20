// Staff corrections from the "App - Fix a class" tab: fix a class's topic, move it to the right teacher, or hide it.
// Each row: match (text found in the title), teacher (optional: only that teacher's classes), topic, moveTo, hide.
// `who` turns a teacher's name into the app's id for them (or null); `nameOf` gives the name shown for an id.
import { TOPICS, topicName } from './topics.mjs';

const yes = (v) => /^(y|yes|true|1|x|✓)$/i.test(String(v || '').trim());

export function applyOverrides(classes, rows, who = () => null, same = (a, b) => a === b, nameOf = () => '') {
  const problems = [];
  const rules = (rows || []).filter((r) => String(r.match || '').trim()).map((r) => {
    const moveName = String(r.moveTo || '').trim(), moveTo = moveName ? who(moveName) : '';
    if (moveName && !moveTo) problems.push(`"${r.match}": no teacher called "${moveName}", so nothing was moved`);
    const topicIn = topicName(String(r.topic || '').trim());
    const topic = TOPICS.find((t) => t.toLowerCase() === String(topicIn || '').toLowerCase()) || '';
    if (String(r.topic || '').trim() && !topic) problems.push(`"${r.match}": "${r.topic}" is not one of the app's topics`);
    return { match: String(r.match).trim().toLowerCase(), teacherId: String(r.teacherId || '').trim(), teacher: String(r.teacher || '').trim(), topic, hide: yes(r.hide), moveTo, used: false, label: r.match };
  });
  const out = [];
  let moved = 0;
  for (const c of classes) {
    const hit = rules.filter((r) => c.title.toLowerCase().includes(r.match) && (!r.teacherId || r.teacherId === c.teacherId) && (!r.teacher || same(nameOf(c.teacherId), r.teacher)));
    hit.forEach((r) => { r.used = true; });
    if (hit.some((r) => r.hide)) continue;
    const topic = hit.find((r) => r.topic)?.topic, moveTo = hit.find((r) => r.moveTo)?.moveTo;
    if (moveTo && moveTo !== c.teacherId) moved++;
    out.push(topic || moveTo ? { ...c, ...(topic ? { topic } : {}), ...(moveTo ? { teacherId: moveTo } : {}) } : c);
  }
  for (const r of rules) if (!r.used) problems.push(`"${r.label}": no class title contains this`);
  out.problems = problems;
  out.moved = moved;
  return out;
}
