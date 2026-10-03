// Render every page of every question PDF to grayscale PNG: node tools/pages.mjs outDir scale
import * as mupdf from 'mupdf';
import fs from 'node:fs';
import path from 'node:path';
const [outDir, scale = '2'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync('raw').filter((f) => f.endsWith('_qs.pdf'))) {
  const doc = mupdf.Document.openDocument(fs.readFileSync(path.join('raw', f)), 'application/pdf');
  const id = f.split('_')[0];
  for (let i = 0; i < doc.countPages(); i++) {
    const pix = doc.loadPage(i).toPixmap(mupdf.Matrix.scale(+scale, +scale), mupdf.ColorSpace.DeviceGray, false, true);
    fs.writeFileSync(path.join(outDir, `${id}_p${String(i + 1).padStart(2, '0')}.png`), pix.asPNG());
  }
  console.log(f, doc.countPages());
}
