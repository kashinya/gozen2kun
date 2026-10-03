// End-to-end check at phone width (390px). Usage: node tests/e2e.mjs [baseUrl]
// Without baseUrl a local static server is started on port 8080.
import { chromium } from 'playwright';
import fs from 'node:fs';

const shots = process.env.SHOTS || 'build/shots';
fs.mkdirSync(shots, { recursive: true });
let base = process.argv[2];
let server;
if (!base) {
  server = (await import('../tools/serve.mjs')).server;
  base = 'http://localhost:8080/';
}
const data = JSON.parse(fs.readFileSync('data/questions.json', 'utf8'));
const byId = new Map(data.questions.map((q) => [q.id, q]));
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'light' });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('gozen2kun.v1') || 'null'));
const wrongOf = (a) => ['ア', 'イ', 'ウ', 'エ'].find((x) => x !== a);

await page.goto(base);
await page.waitForSelector('#start-exam');
await page.screenshot({ path: `${shots}/01-home.png`, fullPage: true });

// --- Exam mode: newest year, answer the first 3 wrong and the rest correctly, then score.
const examId = data.exams[0].id;
await page.selectOption('#exam-sel', examId);
await page.click('#start-exam');
const n = (await store()).session.qids.length;
check('exam starts with all active questions of the year', n === data.questions.filter((q) => q.exam === examId && !q.needs_review).length, `${n} questions`);
const timerText = (await page.textContent('.timer')).trim();
check('timer starts at 40 minutes', /^(40:00|39:5\d)$/.test(timerText), timerText);
const wrongIds = [];
for (let i = 0; i < n; i++) {
  const s = (await store()).session;
  const q = byId.get(s.qids[s.cur]);
  const pick = i < 3 ? wrongOf(q.answer) : q.answer;
  if (i < 3) wrongIds.push(q.id);
  await page.click(`[data-ans="${pick}"]`);
  if (i === 0) await page.screenshot({ path: `${shots}/02-exam-q1.png`, fullPage: true });
  await page.click('#next');
}
await page.waitForSelector('#finish');
await page.screenshot({ path: `${shots}/03-overview.png`, fullPage: true });
await page.click('#finish');
await page.waitForSelector('.score');
const scoreText = await page.textContent('.score');
check('score is n-3 correct', scoreText.includes(`${n - 3} / ${n}`), scoreText);
check('verdict shows the 60% line', (await page.textContent('.verdict')).includes('60%'));
await page.screenshot({ path: `${shots}/04-result.png`, fullPage: true });

// --- Records persist after reload.
await page.reload();
await page.waitForSelector('#go-stats');
await page.click('#go-stats');
const statsText = await page.textContent('#app');
check('stats persist after reload', statsText.includes(`${n - 3} / ${n}`) && statsText.includes(`${n - 3}/${n}`));
await page.screenshot({ path: `${shots}/05-stats.png`, fullPage: true });
let st = await store();
check('wrong answers are in the notebook', wrongIds.every((id) => st.wrong[id]) && Object.keys(st.wrong).length === 3, Object.keys(st.wrong).join(','));

// --- Mistake notebook: graduates only after 2 consecutive correct answers.
async function runNotebook(decide) {
  await page.click('#btn-home');
  await page.click('#start-nb');
  for (;;) {
    const s = (await store()).session;
    if (!s) break;
    const q = byId.get(s.qids[s.cur]);
    await page.click(`[data-ans="${decide(q)}"]`);
    await page.click('#next');
    if (await page.$('#home')) {
      await page.click('#home');
      break;
    }
  }
}
const target = wrongIds[0];
await runNotebook((q) => q.answer);
st = await store();
check('one correct answer does not graduate', Object.keys(st.wrong).length === 3 && st.wrong[target].streak === 1);
await runNotebook((q) => (q.id === target ? wrongOf(q.answer) : q.answer));
st = await store();
check('a wrong answer resets the streak; others graduate', st.wrong[target]?.streak === 0 && !st.wrong[wrongIds[1]] && !st.wrong[wrongIds[2]], JSON.stringify(st.wrong));
await runNotebook((q) => q.answer);
st = await store();
check('still in notebook after 1 correct following a reset', st.wrong[target]?.streak === 1);
await runNotebook((q) => q.answer);
st = await store();
check('graduates after 2 consecutive correct answers', Object.keys(st.wrong).length === 0);
const nbBtn = await page.textContent('#start-nb');
check('notebook button shows 0', nbBtn.includes('0問'), nbBtn);

// --- One-by-one mode: immediate feedback.
await page.selectOption('#drill-sel', 'all');
await page.click('#start-drill');
const dq = byId.get((await store()).session.qids[0]);
await page.click(`[data-ans="${wrongOf(dq.answer)}"]`);
const fb = await page.textContent('.feedback');
check('drill shows result and correct answer immediately', fb.includes('不正解') && fb.includes(`正解：${dq.answer}`), fb.replace(/\s+/g, ' '));
await page.screenshot({ path: `${shots}/06-drill.png`, fullPage: true });
await page.click('#quit');
await page.click('#home');

// --- Image question screenshot.
const imgQ = data.questions.find((q) => q.display === 'image' && !q.needs_review);
if (imgQ) {
  await page.selectOption('#drill-sel', imgQ.exam);
  await page.click('#start-drill');
  for (;;) {
    const s = (await store()).session;
    if (s.qids[s.cur] === imgQ.id) break;
    await page.click(`[data-ans="${byId.get(s.qids[s.cur]).answer}"]`);
    await page.click('#next');
  }
  const ok = await page.$eval('.qimg', (img) => (img.complete ? img.naturalWidth > 0 : new Promise((r) => { img.onload = () => r(img.naturalWidth > 0); img.onerror = () => r(false); })));
  check('figure question shows its image', ok, imgQ.id);
  await page.screenshot({ path: `${shots}/07-image-question.png`, fullPage: true });
  await page.click('#quit');
  await page.click('#home');
}

// --- Offline: after the service worker is active, go offline, reload, and finish a mixed exam.
await page.evaluate(() => navigator.serviceWorker.ready);
await page.reload();
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
await ctx.setOffline(true);
await page.reload();
await page.waitForSelector('#start-exam');
await page.selectOption('#exam-sel', 'mix');
await page.click('#start-exam');
const ms = (await store()).session;
check('offline: mixed exam has 25 questions', ms.qids.length === 25, `${ms.qids.length}`);
let imgsOk = true;
for (let i = 0; i < ms.qids.length; i++) {
  const s = (await store()).session;
  const q = byId.get(s.qids[s.cur]);
  if (q.display === 'image') {
    const ok = await page.$eval('.qimg', (img) => (img.complete ? img.naturalWidth > 0 : new Promise((r) => { img.onload = () => r(img.naturalWidth > 0); img.onerror = () => r(false); })));
    if (!ok) imgsOk = false;
  }
  await page.click(`[data-ans="${q.answer}"]`);
  await page.click('#next');
}
await page.click('#finish');
await page.waitForSelector('.score');
check('offline: exam completes and scores 25/25', (await page.textContent('.score')).includes('25 / 25'));
check('offline: figure images load', imgsOk);
await ctx.setOffline(false);

// --- Dark mode screenshot.
const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, colorScheme: 'dark' });
const dp = await dark.newPage();
await dp.goto(base);
await dp.waitForSelector('#start-exam');
await dp.click('#start-exam');
await dp.screenshot({ path: `${shots}/08-dark-exam.png` });
await dark.close();

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
server?.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
