// Detect question start bands on every page; report counts per PDF.
import * as mupdf from 'mupdf';
import fs from 'node:fs';
import { pageBands } from './bands.mjs';
for (const f of fs.readdirSync('raw').filter((f) => f.endsWith('_qs.pdf'))) {
  const doc = mupdf.Document.openDocument(fs.readFileSync('raw/' + f), 'application/pdf');
  const out = [];
  for (let i = 0; i < doc.countPages(); i++) {
    const { h, bands } = pageBands(doc.loadPage(i));
    const lefts = bands.filter((b) => b.y0 < h * 0.93 && b.y1 - b.y0 >= 12).map((b) => b.left);
    const starts = bands.filter((b) => b.y0 < h * 0.93 && b.left < 135 && b.y1 - b.y0 >= 12 && b.y1 - b.y0 < 30 && b.right - b.left > 100);
    out.push(`p${i + 1}:${starts.length}[minL=${Math.min(...lefts)}]`);
  }
  console.log(f, out.join(' '));
}
