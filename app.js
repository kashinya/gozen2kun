'use strict';

// ---- Constants -------------------------------------------------------------
const STORE_KEY = 'gozen2kun.v1';
const EXAM_COUNT = 25;          // 科目A-2: 25 questions
const EXAM_SECONDS = 40 * 60;   // 40 minutes
const PASS_RATE = 0.6;          // 基準点 60点 / 100点
const GRADUATE_STREAK = 2;      // consecutive correct answers to leave the mistake notebook
const LABELS = ['ア', 'イ', 'ウ', 'エ'];

// ---- Persistence -----------------------------------------------------------
function emptyStore() {
  return { qstats: {}, wrong: {}, history: [], session: null };
}
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyStore();
    return Object.assign(emptyStore(), JSON.parse(raw));
  } catch (e) {
    return emptyStore();
  }
}
function saveStore() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch (e) {
    // Storage full or blocked: keep running in memory.
  }
}

// ---- App state -------------------------------------------------------------
let data = null;          // questions.json
let byId = new Map();     // question id -> question
let examById = new Map(); // exam id -> exam
let store = loadStore();
let timerHandle = null;

const $app = document.getElementById('app');
const $info = document.getElementById('topbar-info');

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function pct(c, n) {
  return n ? Math.round((c / n) * 1000) / 10 : 0;
}
function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Questions that may be asked (needs_review ones are excluded until fixed).
function activeQuestions(examId) {
  return data.questions.filter((q) => !q.needs_review && (!examId || q.exam === examId));
}
function excludedCount(examId) {
  return data.questions.filter((q) => q.needs_review && q.exam === examId).length;
}
function sourceLabel(q) {
  const e = examById.get(q.exam);
  return `出典：${e.label} ${e.title} ${e.section} 問${q.no}`;
}

// ---- Recording answers -----------------------------------------------------
function recordAnswer(qid, ok) {
  const s = store.qstats[qid] || { n: 0, c: 0 };
  s.n += 1;
  if (ok) s.c += 1;
  s.last = ok ? 1 : 0;
  store.qstats[qid] = s;
  if (!ok) {
    store.wrong[qid] = { streak: 0, at: Date.now() };
  } else if (store.wrong[qid]) {
    store.wrong[qid].streak += 1;
    if (store.wrong[qid].streak >= GRADUATE_STREAK) delete store.wrong[qid];
  }
}
function notebookIds() {
  return Object.keys(store.wrong).filter((id) => byId.has(id) && !byId.get(id).needs_review);
}

// ---- Rendering helpers -----------------------------------------------------
function setInfo(html) {
  $info.innerHTML = html;
}
function stopTimer() {
  if (timerHandle) clearInterval(timerHandle);
  timerHandle = null;
}
function render(html) {
  $app.innerHTML = html;
  window.scrollTo(0, 0);
}

function questionBody(q) {
  const img = `<div class="qimg-wrap" data-zoom><img class="qimg" src="${esc(q.img)}" alt="問${q.no}の原文画像" loading="lazy"></div>`;
  if (q.display === 'image') {
    return `${img}<p class="muted">図表を含むため原文の画像で表示しています。画像をタップすると拡大します。</p>`;
  }
  const choices = LABELS.map((l) => `<li><span class="lbl">${l}</span><span>${esc(q.choices[l])}</span></li>`).join('');
  return `<p class="stem">${esc(q.stem)}</p>
    <ul class="choices-text">${choices}</ul>
    <button class="linkish" type="button" data-toggle-img>原文の画像を見る</button>
    <div class="orig" hidden>${img}</div>`;
}
function questionHead(q, label) {
  return `<div class="qhead"><span class="qno">${esc(label)}</span></div>
    <div class="source">${esc(sourceLabel(q))}</div>`;
}
function bindQuestionEvents() {
  $app.querySelectorAll('[data-toggle-img]').forEach((b) =>
    b.addEventListener('click', () => {
      const box = b.nextElementSibling;
      box.hidden = !box.hidden;
      b.textContent = box.hidden ? '原文の画像を見る' : '原文の画像を閉じる';
    })
  );
  $app.querySelector('[data-goto-expl]')?.addEventListener('click', () => document.getElementById('expl')?.scrollIntoView({ behavior: 'smooth' }));
  $app.querySelectorAll('[data-zoom]').forEach((w) => w.addEventListener('click', () => w.classList.toggle('zoom')));
}
// Shown only after a wrong answer. Explanations are AI-written and unverified (IPA publishes none).
function explanationCard(q, mine) {
  const ex = q.explanation;
  if (!ex) return '';
  const items = LABELS.map((l) => {
    const tag = l === q.answer ? '<small class="tag ok">正解</small>' : l === mine ? '<small class="tag ng">あなたの解答</small>' : '';
    return `<li><span class="lbl">${l}</span><span>${tag}${esc(ex.choices[l])}</span></li>`;
  }).join('');
  return `<section class="card expl" id="expl">
    <div class="expl-head"><b>解説</b><span class="badge">AI作成・未検証</span></div>
    <p>${esc(ex.correct)}</p>
    <ul class="choices-text">${items}</ul>
    <p class="muted">IPAは午前の解説を公表していないため、この解説はAIが作成したもので、誤りを含む可能性があります。正解はIPAの解答例に基づいています。</p>
  </section>`;
}
function explanationHint(q, ok) {
  return !ok && q.explanation ? '<br><button class="linkish" type="button" data-goto-expl>解説を見る ↓</button>' : '';
}
function answerButtons(selected, reveal) {
  return `<div class="answers">${LABELS.map((l) => {
    let cls = 'ans';
    if (reveal) {
      if (l === reveal.answer) cls += ' correct';
      else if (l === selected) cls += ' wrong';
    } else if (l === selected) cls += ' selected';
    return `<button class="${cls}" type="button" data-ans="${l}" ${reveal ? 'disabled' : ''}>${l}</button>`;
  }).join('')}</div>`;
}

// ---- Home ------------------------------------------------------------------
function viewHome() {
  stopTimer();
  setInfo('');
  const examOpts = data.exams
    .map((e) => {
      const ex = excludedCount(e.id);
      return `<option value="${esc(e.id)}">${esc(e.label)}${ex ? `（${ex}問除外）` : ''}</option>`;
    })
    .join('');
  const s = store.session;
  const resume =
    s && !s.finished
      ? `<div class="card"><h2>中断中の${s.kind === 'exam' ? '本番' : '演習'}があります</h2>
         <div class="btn-row"><button class="btn primary" id="resume">続きから</button><button class="btn" id="discard">破棄</button></div></div>`
      : '';
  const nb = notebookIds().length;
  render(`
    ${resume}
    <div class="card stack">
      <h2>本番モード</h2>
      <p class="muted">${EXAM_COUNT}問・${EXAM_SECONDS / 60}分。最後に採点して正答率と60%ラインを表示します。</p>
      <select id="exam-sel"><option value="mix">全年度からランダム${EXAM_COUNT}問</option>${examOpts}</select>
      <button class="btn primary" id="start-exam">本番を始める</button>
    </div>
    <div class="card stack">
      <h2>1問ずつモード</h2>
      <p class="muted">答えるとすぐに正誤と正解を表示します。</p>
      <select id="drill-sel"><option value="all">全年度（ランダム順）</option>${examOpts}</select>
      <button class="btn primary" id="start-drill">1問ずつ解く</button>
    </div>
    <div class="card stack">
      <h2>間違いノート</h2>
      <p class="muted">間違えた問題だけを出します。${GRADUATE_STREAK}回続けて正解すると卒業。</p>
      <button class="btn" id="start-nb" ${nb ? '' : 'disabled'}>間違いノートを解く（${nb}問）</button>
    </div>
    <button class="btn" id="go-stats">成績を見る</button>
    <p class="footer-note">問題・正解の出典：独立行政法人情報処理推進機構（IPA）公表の過去問題（各問題に年度・期・試験区分・問番号を表示）。収録 ${activeQuestions().length}問${data.questions.length - activeQuestions().length ? `（確認待ちで除外 ${data.questions.length - activeQuestions().length}問）` : ''}。データ版 ${esc(data.version)}</p>
  `);
  document.getElementById('start-exam').onclick = () => startExam(document.getElementById('exam-sel').value);
  document.getElementById('start-drill').onclick = () => startDrill(document.getElementById('drill-sel').value);
  document.getElementById('start-nb').onclick = startNotebook;
  document.getElementById('go-stats').onclick = viewStats;
  if (resume) {
    document.getElementById('resume').onclick = resumeSession;
    document.getElementById('discard').onclick = () => {
      if (!confirm('中断中の問題を破棄しますか？')) return;
      store.session = null;
      saveStore();
      viewHome();
    };
  }
}

function confirmReplaceSession() {
  const s = store.session;
  if (s && !s.finished) return confirm('中断中の問題があります。破棄して新しく始めますか？');
  return true;
}
function resumeSession() {
  const s = store.session;
  if (!s) return viewHome();
  if (s.kind === 'exam') return viewExam();
  return viewDrill();
}

// ---- Exam mode (本番) ------------------------------------------------------
function startExam(sel) {
  if (!confirmReplaceSession()) return;
  let qids;
  if (sel === 'mix') {
    qids = shuffle(activeQuestions()).slice(0, EXAM_COUNT).map((q) => q.id);
  } else {
    qids = activeQuestions(sel).sort((a, b) => a.no - b.no).map((q) => q.id);
  }
  if (!qids.length) return alert('出題できる問題がありません。');
  store.session = { kind: 'exam', examId: sel, qids, answers: {}, cur: 0, start: Date.now(), limit: EXAM_SECONDS, finished: false };
  saveStore();
  viewExam();
}
function examRemaining() {
  const s = store.session;
  return s.limit - (Date.now() - s.start) / 1000;
}
function tickExam() {
  const s = store.session;
  if (!s || s.kind !== 'exam' || s.finished) return stopTimer();
  const rem = examRemaining();
  const answered = Object.keys(s.answers).length;
  setInfo(`<span class="timer ${rem < 300 ? 'low' : ''}">${fmtTime(rem)}</span><br>${answered}/${s.qids.length} 解答済`);
  if (rem <= 0) {
    stopTimer();
    alert('時間切れです。採点します。');
    finishExam();
  }
}
function viewExam() {
  const s = store.session;
  if (examRemaining() <= 0) return finishExam();
  stopTimer();
  tickExam();
  timerHandle = setInterval(tickExam, 1000);
  const q = byId.get(s.qids[s.cur]);
  const sel = s.answers[s.cur];
  const last = s.cur === s.qids.length - 1;
  render(`
    ${questionHead(q, `第${s.cur + 1}問 / ${s.qids.length}`)}
    <div class="card">${questionBody(q)}</div>
    <div class="pad">
      ${answerButtons(sel)}
      <div class="nav">
        <button class="btn small" id="prev" ${s.cur === 0 ? 'disabled' : ''}>前へ</button>
        <button class="btn small" id="overview">一覧</button>
        <button class="btn small ${last ? 'primary' : ''}" id="next">${last ? '一覧・採点' : '次へ'}</button>
      </div>
    </div>
  `);
  bindQuestionEvents();
  $app.querySelectorAll('[data-ans]').forEach((b) =>
    b.addEventListener('click', () => {
      const v = b.dataset.ans;
      if (s.answers[s.cur] === v) delete s.answers[s.cur];
      else s.answers[s.cur] = v;
      saveStore();
      $app.querySelectorAll('[data-ans]').forEach((x) => x.classList.toggle('selected', x.dataset.ans === s.answers[s.cur]));
      tickExam();
    })
  );
  document.getElementById('prev').onclick = () => { s.cur -= 1; saveStore(); viewExam(); };
  document.getElementById('overview').onclick = viewExamOverview;
  document.getElementById('next').onclick = () => {
    if (last) return viewExamOverview();
    s.cur += 1;
    saveStore();
    viewExam();
  };
}
function viewExamOverview() {
  const s = store.session;
  const unanswered = s.qids.length - Object.keys(s.answers).length;
  render(`
    <h2>解答状況</h2>
    <p class="muted">番号をタップするとその問題に戻ります。</p>
    <div class="grid">${s.qids.map((_, i) => `<button type="button" data-go="${i}" class="${s.answers[i] ? 'answered' : ''} ${i === s.cur ? 'current' : ''}">${i + 1}<br><small>${s.answers[i] || '－'}</small></button>`).join('')}</div>
    <div class="stack" style="margin-top:20px">
      <p>${unanswered ? `未解答が <b>${unanswered}問</b> あります。` : 'すべて解答済みです。'}</p>
      <button class="btn primary" id="finish">採点する</button>
      <button class="btn" id="back">問題に戻る</button>
    </div>
  `);
  $app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { s.cur = +b.dataset.go; saveStore(); viewExam(); }));
  document.getElementById('back').onclick = viewExam;
  document.getElementById('finish').onclick = () => {
    if (!confirm(unanswered ? `未解答が${unanswered}問あります。採点しますか？` : '採点しますか？')) return;
    finishExam();
  };
}
function finishExam() {
  stopTimer();
  const s = store.session;
  if (!s || s.kind !== 'exam') return viewHome();
  let correct = 0;
  s.qids.forEach((id, i) => {
    const ok = s.answers[i] === byId.get(id).answer;
    if (ok) correct += 1;
    recordAnswer(id, ok);
  });
  const result = {
    examId: s.examId,
    correct,
    total: s.qids.length,
    date: Date.now(),
    sec: Math.min(s.limit, Math.round((Date.now() - s.start) / 1000)),
    qids: s.qids,
    answers: s.answers,
  };
  store.history.unshift(result);
  store.history = store.history.slice(0, 50);
  store.session = null;
  saveStore();
  viewResult(0);
}
function examName(examId) {
  return examId === 'mix' ? '全年度ランダム' : examById.get(examId).label;
}
function viewResult(idx) {
  stopTimer();
  setInfo('');
  const r = store.history[idx];
  const rate = r.correct / r.total;
  const pass = rate >= PASS_RATE;
  const need = Math.ceil(r.total * PASS_RATE);
  render(`
    <div class="card">
      <div class="muted">${esc(examName(r.examId))}・${fmtDate(r.date)}・${fmtTime(r.sec)}</div>
      <div class="score">${r.correct} / ${r.total}　${pct(r.correct, r.total)}%</div>
      <div class="verdict ${pass ? 'pass' : 'fail'}">${pass ? '基準点クリア' : '基準点に届かず'}（60%＝${need}問）</div>
      <div class="bar" aria-hidden="true"><div class="fill" style="width:${rate * 100}%"></div><div class="line" style="left:${PASS_RATE * 100}%"><span>60%</span></div></div>
      ${r.total !== EXAM_COUNT ? `<p class="notice">確認待ちの問題を除いた${r.total}問で採点しています。</p>` : ''}
    </div>
    <h2>問題ごとの結果</h2>
    <p class="muted">タップすると問題と正解を確認できます。</p>
    <div class="grid">${r.qids.map((id, i) => {
      const ok = r.answers[i] === byId.get(id)?.answer;
      return `<button type="button" data-rev="${i}" class="${ok ? 'ok' : 'ng'}">${i + 1}<br><small>${ok ? '○' : '×'}</small></button>`;
    }).join('')}</div>
    <div class="stack" style="margin-top:20px">
      <button class="btn primary" id="home">ホームへ</button>
    </div>
  `);
  $app.querySelectorAll('[data-rev]').forEach((b) => b.addEventListener('click', () => viewReview(idx, +b.dataset.rev)));
  document.getElementById('home').onclick = viewHome;
}
function viewReview(idx, i) {
  const r = store.history[idx];
  const q = byId.get(r.qids[i]);
  if (!q) return viewResult(idx);
  const mine = r.answers[i];
  const ok = mine === q.answer;
  render(`
    ${questionHead(q, `第${i + 1}問 / ${r.qids.length}`)}
    <div class="feedback ${ok ? 'ok' : 'ng'}">${ok ? '正解' : '不正解'}　正解：${q.answer}　あなた：${mine || '未解答'}${explanationHint(q, ok)}</div>
    <div class="card">${questionBody(q)}</div>
    ${ok ? '' : explanationCard(q, mine)}
    <div class="pad">
      ${answerButtons(mine, { answer: q.answer })}
      <div class="nav">
        <button class="btn small" id="prev" ${i === 0 ? 'disabled' : ''}>前へ</button>
        <button class="btn small" id="list">結果へ</button>
        <button class="btn small" id="next" ${i === r.qids.length - 1 ? 'disabled' : ''}>次へ</button>
      </div>
    </div>
  `);
  bindQuestionEvents();
  document.getElementById('prev').onclick = () => viewReview(idx, i - 1);
  document.getElementById('next').onclick = () => viewReview(idx, i + 1);
  document.getElementById('list').onclick = () => viewResult(idx);
}

// ---- Drill mode (1問ずつ) and mistake notebook ----------------------------
function startDrill(sel) {
  if (!confirmReplaceSession()) return;
  const qs = sel === 'all' ? shuffle(activeQuestions()) : activeQuestions(sel).sort((a, b) => a.no - b.no);
  store.session = { kind: 'drill', title: sel === 'all' ? '全年度' : examById.get(sel).label, qids: qs.map((q) => q.id), cur: 0, results: {}, finished: false };
  saveStore();
  viewDrill();
}
function startNotebook() {
  if (!confirmReplaceSession()) return;
  const ids = shuffle(notebookIds());
  if (!ids.length) return viewHome();
  store.session = { kind: 'notebook', title: '間違いノート', qids: ids, cur: 0, results: {}, finished: false };
  saveStore();
  viewDrill();
}
function viewDrill() {
  stopTimer();
  const s = store.session;
  if (s.cur >= s.qids.length) return viewDrillEnd();
  const q = byId.get(s.qids[s.cur]);
  const res = s.results[s.cur];
  const done = Object.values(s.results);
  const correct = done.filter((r) => r.ok).length;
  setInfo(`${esc(s.title)}<br>${correct}/${done.length} 正解`);
  const nbState = store.wrong[q.id];
  let feedback = '';
  if (res) {
    const nbMsg = s.kind === 'notebook' || nbState || !res.ok
      ? (!res.ok ? '間違いノートに入りました。' : nbState ? `卒業まであと${GRADUATE_STREAK - nbState.streak}回。` : '間違いノートから卒業！')
      : '';
    feedback = `<div class="feedback ${res.ok ? 'ok' : 'ng'}">${res.ok ? '正解' : '不正解'}　正解：${q.answer}${nbMsg ? `<br><small>${nbMsg}</small>` : ''}${explanationHint(q, res.ok)}</div>`;
  }
  render(`
    ${questionHead(q, `${s.cur + 1} / ${s.qids.length}`)}
    ${feedback}
    <div class="card">${questionBody(q)}</div>
    ${res && !res.ok ? explanationCard(q, res.choice) : ''}
    <div class="pad">
      ${answerButtons(res ? res.choice : null, res ? { answer: q.answer } : null)}
      <div class="nav">
        <button class="btn small" id="quit">やめる</button>
        <button class="btn small primary" id="next" ${res ? '' : 'disabled'}>${s.cur === s.qids.length - 1 ? '結果へ' : '次へ'}</button>
      </div>
    </div>
  `);
  bindQuestionEvents();
  if (!res) {
    $app.querySelectorAll('[data-ans]').forEach((b) =>
      b.addEventListener('click', () => {
        const ok = b.dataset.ans === q.answer;
        s.results[s.cur] = { choice: b.dataset.ans, ok };
        recordAnswer(q.id, ok);
        saveStore();
        viewDrill();
        document.querySelector('.feedback')?.scrollIntoView({ block: 'nearest' });
      })
    );
  }
  document.getElementById('next').onclick = () => { s.cur += 1; saveStore(); viewDrill(); };
  document.getElementById('quit').onclick = viewDrillEnd;
}
function viewDrillEnd() {
  const s = store.session;
  const done = Object.values(s.results);
  const correct = done.filter((r) => r.ok).length;
  store.session = null;
  saveStore();
  setInfo('');
  render(`
    <div class="card">
      <div class="muted">${esc(s.title)}</div>
      <div class="score">${correct} / ${done.length}　${pct(correct, done.length)}%</div>
      <p class="muted">間違いノート：${notebookIds().length}問</p>
    </div>
    <button class="btn primary" id="home">ホームへ</button>
  `);
  document.getElementById('home').onclick = viewHome;
}

// ---- Stats -----------------------------------------------------------------
function viewStats() {
  stopTimer();
  setInfo('');
  let allN = 0, allC = 0;
  const rows = data.exams.map((e) => {
    let n = 0, c = 0, seen = 0;
    const qs = data.questions.filter((q) => q.exam === e.id);
    for (const q of qs) {
      const st = store.qstats[q.id];
      if (st) { n += st.n; c += st.c; seen += 1; }
    }
    allN += n; allC += c;
    return `<tr><td>${esc(e.label)}</td><td>${n ? pct(c, n) + '%' : '－'}</td><td>${c}/${n}</td><td>${seen}/${qs.length}</td></tr>`;
  }).join('');
  const hist = store.history.map((r, i) => `<tr><td><button class="linkish" data-hist="${i}">${fmtDate(r.date)}</button></td><td>${esc(examName(r.examId))}</td><td>${r.correct}/${r.total}</td><td>${pct(r.correct, r.total)}%</td></tr>`).join('');
  render(`
    <div class="card">
      <h2>全体の正答率</h2>
      <div class="score">${allN ? pct(allC, allN) + '%' : '－'}</div>
      <p class="muted">${allC} / ${allN} 解答（本番・1問ずつ・間違いノートの合計）</p>
    </div>
    <div class="card">
      <h2>年度ごと</h2>
      <table class="stats"><thead><tr><th>年度</th><th>正答率</th><th>正解/解答</th><th>解いた問題</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <div class="card">
      <h2>本番モードの履歴</h2>
      ${hist ? `<table class="stats"><thead><tr><th>日時</th><th>回</th><th>点</th><th>率</th></tr></thead><tbody>${hist}</tbody></table>` : '<p class="muted">まだありません。</p>'}
    </div>
    <button class="btn" id="home">ホームへ</button>
    <p class="footer-note"><button class="linkish" id="reset">記録をすべて消す</button></p>
  `);
  $app.querySelectorAll('[data-hist]').forEach((b) => b.addEventListener('click', () => viewResult(+b.dataset.hist)));
  document.getElementById('home').onclick = viewHome;
  document.getElementById('reset').onclick = () => {
    if (!confirm('成績・間違いノート・履歴をすべて消します。元に戻せません。よろしいですか？')) return;
    store = emptyStore();
    saveStore();
    viewStats();
  };
}

// ---- Boot ------------------------------------------------------------------
document.getElementById('btn-home').addEventListener('click', () => {
  const s = store.session;
  if (s && s.kind === 'exam' && !s.finished) saveStore();
  viewHome();
});

async function boot() {
  try {
    const res = await fetch('data/questions.json', { cache: 'no-cache' });
    data = await res.json();
  } catch (e) {
    render('<p>問題データを読み込めませんでした。通信できる場所で一度開いてください。</p>');
    return;
  }
  byId = new Map(data.questions.map((q) => [q.id, q]));
  examById = new Map(data.exams.map((e) => [e.id, e]));
  viewHome();
}
boot();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
