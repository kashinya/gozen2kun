// Assemble data/questions.json from transcriptions, official answers and review decisions,
// then run the automatic checks. Usage: node tools/build.mjs
import fs from 'node:fs';

const LABELS = ['ア', 'イ', 'ウ', 'エ'];
const exams = JSON.parse(fs.readFileSync('data-src/exams.json', 'utf8'));
const answers = JSON.parse(fs.readFileSync('data-src/answers.json', 'utf8'));
// Manual decisions: { "<qid>": { "fix": { "stem"|"ア".. : "text" }, "display": "image", "needs_review": "reason" } }
const review = JSON.parse(fs.readFileSync('data-src/review.json', 'utf8'));
// AI-written explanations that passed the cross-check: { "<qid>": { "correct": "...", "choices": { "ア": "..", .. } } }
const explanations = fs.existsSync('data-src/explanations.json') ? JSON.parse(fs.readFileSync('data-src/explanations.json', 'utf8')) : {};

// Characters allowed in transcribed text; anything else is reported as possible garbling.
const ALLOWED = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆ヶ\x20-\x7E，。、・：；？！「」『』（）［］〔〕｛｝【】＜＞≦≧＝＋－×÷／％～…“”‘’―\n　①②③④⑤⑥⑦⑧⑨⑩ⅠⅡⅢⅣⅤ→←↑↓○●△▲□■◎※〜＿｜＆＃＄＊＠Ａ-Ｚａ-ｚ０-９]*$/u;

const out = { version: '', exams: [], questions: [] };
const problems = [];

for (const e of exams) {
  const tx = JSON.parse(fs.readFileSync(`data-src/transcripts/${e.src}.json`, 'utf8'));
  const ans = answers[e.src]?.answers || {};
  const verify = fs.existsSync(`data-src/verify/${e.src}.json`) ? JSON.parse(fs.readFileSync(`data-src/verify/${e.src}.json`, 'utf8')) : null;
  out.exams.push({ id: e.id, category: e.category, label: e.label, title: e.title, section: e.section });
  if (tx.length !== 25) problems.push(`${e.id}: ${tx.length} questions (expected 25)`);

  for (const t of tx) {
    const id = `${e.id}-${String(t.no).padStart(2, '0')}`;
    const r = review[id] || {};
    const q = {
      id,
      exam: e.id,
      no: t.no,
      display: r.display || t.display,
      stem: t.stem,
      choices: { ...t.choices },
      img: `img/st/${e.src}_q${String(t.no).padStart(2, '0')}.webp`,
      answer: ans[t.no],
    };
    for (const [k, v] of Object.entries(r.fix || {})) {
      if (k === 'stem') q.stem = v;
      else q.choices[k] = v;
    }
    const ex = explanations[id];
    if (ex) {
      const okEx = ex.correct?.trim() && LABELS.every((l) => ex.choices?.[l]?.trim()) && !/�/.test(JSON.stringify(ex));
      if (okEx) q.explanation = { correct: ex.correct, choices: Object.fromEntries(LABELS.map((l) => [l, ex.choices[l]])) };
      else problems.push(`${id}: explanation is incomplete, not used`);
    }
    const reasons = [];
    if (r.needs_review) reasons.push(r.needs_review);
    if (!LABELS.includes(q.answer)) reasons.push(`正解が取れていない（${q.answer}）`);
    if (!fs.existsSync(q.img)) reasons.push('画像がない');
    if (q.display === 'text') {
      if (!q.stem || !q.stem.trim()) reasons.push('問題文が空');
      for (const l of LABELS) if (!q.choices[l] || !q.choices[l].trim()) reasons.push(`選択肢${l}が空`);
      const all = [q.stem, ...LABELS.map((l) => q.choices[l])].join('\n');
      if (/�/.test(all)) reasons.push('文字化け（U+FFFD）');
      const bad = [...all].filter((c) => !ALLOWED.test(c));
      if (bad.length) reasons.push(`想定外の文字: ${[...new Set(bad)].join(' ')}`);
    }
    // Proofreading issues not settled in review.json keep the question out.
    const open = (verify?.issues || []).filter((i) => i.no === t.no && !(r.resolved || []).includes(i.field));
    if (q.display === 'text' && open.length) reasons.push(`校正で指摘あり（未判定）: ${open.map((i) => i.field).join(',')}`);
    if (!verify) reasons.push('校正未実施');
    if (reasons.length) {
      q.needs_review = true;
      q.review_reason = reasons.join(' / ');
    }
    out.questions.push(q);
  }
}

// Answer-count sanity check against the answer PDF.
for (const e of exams) {
  const n = Object.keys(answers[e.src]?.answers || {}).length;
  if (n !== 25) problems.push(`${e.id}: answer key has ${n} entries`);
}

const stamp = new Date();
out.version = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}`;
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/questions.json', JSON.stringify(out, null, 1));

const nr = out.questions.filter((q) => q.needs_review);
console.log(`questions: ${out.questions.length}, active: ${out.questions.length - nr.length}, needs_review: ${nr.length}, explanations: ${out.questions.filter((q) => q.explanation).length}`);
for (const e of out.exams) {
  const qs = out.questions.filter((q) => q.exam === e.id);
  console.log(`  ${e.label}: ${qs.length}問 (text ${qs.filter((q) => q.display === 'text').length}, image ${qs.filter((q) => q.display === 'image').length}, needs_review ${qs.filter((q) => q.needs_review).length})`);
}
for (const q of nr) console.log(`  needs_review ${q.id}: ${q.review_reason}`);
for (const p of problems) console.log('  PROBLEM', p);
if (problems.length) process.exitCode = 1;
