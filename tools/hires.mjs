// Re-render question crops at a higher scale using build/segments.json (scale-2 coordinates).
// node tools/hires.mjs <scale> [exam] [no]  -> build/hires/<exam>_qNN.png
import * as mupdf from 'mupdf';
import fs from 'node:fs';
const [scale = '4', onlyExam, onlyNo] = process.argv.slice(2);
const k = +scale / 2;
const segs = JSON.parse(fs.readFileSync('build/segments.json', 'utf8'));
fs.mkdirSync('build/hires', { recursive: true });
for (const [exam, qs] of Object.entries(segs)) {
  if (onlyExam && exam !== onlyExam) continue;
  const file = fs.readdirSync('raw').find((f) => f.startsWith(exam) && f.endsWith('_qs.pdf'));
  const doc = mupdf.Document.openDocument(fs.readFileSync('raw/' + file), 'application/pdf');
  for (const q of qs) {
    if (onlyNo && q.no !== +onlyNo) continue;
    q.segs.forEach((s, i) => {
      const page = doc.loadPage(s.page - 1);
      const pix = page.toPixmap(mupdf.Matrix.scale(+scale, +scale), mupdf.ColorSpace.DeviceGray, false, true);
      const pad = 12 * k;
      const x0 = Math.max(0, Math.round(s.x0 * k - pad)), y0 = Math.max(0, Math.round(s.y0 * k - pad));
      const x1 = Math.min(pix.getWidth(), Math.round(s.x1 * k + pad)), y1 = Math.min(pix.getHeight(), Math.round(s.y1 * k + pad));
      const w = x1 - x0, h = y1 - y0, src = pix.getPixels(), dst = new Uint8ClampedArray(w * h);
      for (let y = 0; y < h; y++) dst.set(src.subarray((y0 + y) * pix.getWidth() + x0, (y0 + y) * pix.getWidth() + x1), y * w);
      const out = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, w, h], false);
      out.getPixels().set(dst);
      fs.writeFileSync(`build/hires/${exam}_q${String(q.no).padStart(2, '0')}${q.segs.length > 1 ? '_' + i : ''}.png`, out.asPNG());
    });
  }
}
