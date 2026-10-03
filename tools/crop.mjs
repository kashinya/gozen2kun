// Split each question PDF into per-question images by detecting "問N" header lines.
// Output: build/crops/<exam>_qNN.png and build/segments.json
import * as mupdf from 'mupdf';
import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { pageBands } from './bands.mjs';

const SCALE = 2;
const START_MAX_LEFT = 135;
fs.mkdirSync('build/crops', { recursive: true });
const result = {};

for (const f of fs.readdirSync('raw').filter((f) => f.endsWith('_qs.pdf'))) {
  const exam = f.split('_')[0];
  const doc = mupdf.Document.openDocument(fs.readFileSync('raw/' + f), 'application/pdf');
  const questions = [];
  let cur = null;
  const pageImgs = {};
  for (let i = 2; i < doc.countPages() - 1; i++) {
    const { w, h, bands, pix } = pageBands(doc.loadPage(i), SCALE);
    pageImgs[i] = pix.asPNG();
    const content = bands.filter((b) => b.y0 < h * 0.93 && b.y0 > h * 0.03 && b.y1 - b.y0 >= 6);
    // Skip blank pages ("この頁は白紙" etc.): only centered text, no body lines.
    if (!content.some((b) => b.left < 300)) continue;
    for (const b of content) {
      const isStart = b.left < START_MAX_LEFT && b.y1 - b.y0 >= 12 && b.y1 - b.y0 < 30 && b.right - b.left > 100;
      if (isStart) {
        if (questions.length === 25) break;
        cur = { no: questions.length + 1, segs: [] };
        questions.push(cur);
      }
      if (!cur) continue;
      let seg = cur.segs.at(-1);
      if (!seg || seg.page !== i + 1) { seg = { page: i + 1, y0: b.y0, y1: b.y1, x0: b.left, x1: b.right }; cur.segs.push(seg); }
      else { seg.y1 = b.y1; seg.x0 = Math.min(seg.x0, b.left); seg.x1 = Math.max(seg.x1, b.right); }
    }
  }
  // Crop and stack segments.
  for (const q of questions) {
    const pad = 12;
    const x0 = Math.max(0, Math.min(...q.segs.map((s) => s.x0)) - pad);
    const x1 = Math.max(...q.segs.map((s) => s.x1)) + pad;
    const heights = q.segs.map((s) => s.y1 - s.y0 + pad * 2);
    const gap = 16;
    const canvas = createCanvas(x1 - x0, heights.reduce((a, b) => a + b, 0) + gap * (q.segs.length - 1));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    let y = 0;
    for (const [k, s] of q.segs.entries()) {
      const img = await loadImage(pageImgs[s.page - 1]);
      ctx.drawImage(img, x0, s.y0 - pad, x1 - x0, heights[k], 0, y, x1 - x0, heights[k]);
      y += heights[k] + gap;
    }
    q.file = `${exam}_q${String(q.no).padStart(2, '0')}.png`;
    q.size = [canvas.width, canvas.height];
    fs.writeFileSync('build/crops/' + q.file, await canvas.encode('png'));
  }
  result[exam] = questions;
  const multi = questions.filter((q) => q.segs.length > 1).map((q) => `${q.no}(p${q.segs.map((s) => s.page).join('+')})`);
  console.log(exam, questions.length, 'multi-page:', multi.join(' ') || '-');
}
fs.writeFileSync('build/segments.json', JSON.stringify(result, null, 1));
