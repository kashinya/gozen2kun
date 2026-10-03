// Generate app icons.
import fs from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';
for (const size of [192, 512]) {
  const c = createCanvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = '#1f5fbf';
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${size * 0.34}px "Yu Gothic UI", "Meiryo", sans-serif`;
  g.fillText('午前', size / 2, size * 0.38);
  g.font = `bold ${size * 0.36}px "Segoe UI", sans-serif`;
  g.fillText('II', size / 2, size * 0.72);
  fs.writeFileSync(`icons/icon-${size}.png`, await c.encode('png'));
}
