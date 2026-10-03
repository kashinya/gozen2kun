// Print text-line bands (y range, leftmost ink x) for a page, for calibration.
import * as mupdf from 'mupdf';
import fs from 'node:fs';
export function pageBands(page, scale = 2) {
  const pix = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceGray, false, true);
  const w = pix.getWidth(), h = pix.getHeight(), px = pix.getPixels();
  const rows = [];
  for (let y = 0; y < h; y++) {
    let left = -1, right = -1, n = 0;
    for (let x = 0; x < w; x++) if (px[y * w + x] < 140) { if (left < 0) left = x; right = x; n++; }
    rows.push({ left, right, n });
  }
  const bands = [];
  let cur = null;
  for (let y = 0; y < h; y++) {
    const r = rows[y];
    if (r.n > 0) {
      if (!cur) cur = { y0: y, y1: y, left: r.left, right: r.right };
      else { cur.y1 = y; cur.left = Math.min(cur.left, r.left); cur.right = Math.max(cur.right, r.right); }
    } else if (cur && y - cur.y1 > 3) { bands.push(cur); cur = null; }
  }
  if (cur) bands.push(cur);
  return { w, h, bands, pix };
}
if (process.argv[1].endsWith('bands.mjs')) {
  const [file, p] = process.argv.slice(2);
  const doc = mupdf.Document.openDocument(fs.readFileSync(file), 'application/pdf');
  const { w, h, bands } = pageBands(doc.loadPage(+p - 1));
  console.log(w, h);
  for (const b of bands) console.log(b.y0, b.y1, b.y1 - b.y0, b.left, b.right);
}
