// Compare two independent transcriptions (A/B) per exam; write build/diff.json
import fs from 'node:fs';
const norm = (s) => (s || '').normalize('NFKC').replace(/\s+/g, '').replace(/[－−‐–—―ー]/g, (c) => (c === 'ー' ? 'ー' : '-')).replace(/[～〜~]/g, '~').replace(/[“”"]/g, '"').replace(/[‘’']/g, "'");
const exams = [...new Set(fs.readdirSync('build/tx').map((f) => f.split('_')[0]))].sort();
const out = {};
let total = 0, diffs = 0;
for (const ex of exams) {
  const A = JSON.parse(fs.readFileSync(`build/tx/${ex}_A.json`, 'utf8'));
  const B = JSON.parse(fs.readFileSync(`build/tx/${ex}_B.json`, 'utf8'));
  out[ex] = [];
  for (let i = 0; i < 25; i++) {
    const a = A[i], b = B[i], d = [];
    total++;
    if (a.no !== i + 1 || b.no !== i + 1) d.push('numbering');
    if (!a.header_ok || !b.header_ok) d.push('header');
    if (norm(a.stem) !== norm(b.stem)) d.push('stem');
    for (const l of ['ア', 'イ', 'ウ', 'エ']) if (norm(a.choices?.[l]) !== norm(b.choices?.[l])) d.push('choice' + l);
    if (a.has_figure !== b.has_figure) d.push('has_figure');
    if (a.choices_layout !== b.choices_layout) d.push('layout');
    if (d.length) { diffs++; out[ex].push({ no: i + 1, fields: d }); }
  }
  console.log(ex, out[ex].map((x) => `${x.no}:${x.fields.join(',')}`).join(' | '));
}
console.log('questions', total, 'with differences', diffs);
fs.writeFileSync('build/diff.json', JSON.stringify(out, null, 1));
