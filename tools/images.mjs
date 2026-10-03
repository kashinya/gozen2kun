// Convert question crops to WebP for the app: build/crops/*.png -> img/st/*.webp
import fs from 'node:fs';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const MAX_W = 960;
fs.mkdirSync('img/st', { recursive: true });
let total = 0;
for (const f of fs.readdirSync('build/crops').filter((f) => f.endsWith('.png'))) {
  const img = await loadImage(fs.readFileSync('build/crops/' + f));
  const s = Math.min(1, MAX_W / img.width);
  const c = createCanvas(Math.round(img.width * s), Math.round(img.height * s));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const buf = await c.encode('webp', 70);
  fs.writeFileSync('img/st/' + f.replace('.png', '.webp'), buf);
  total += buf.length;
}
console.log('total KB', Math.round(total / 1024));
