// Generate sw.js: precache list + cache name derived from a content hash, so every
// deploy with changed files gets a new cache and old caches are deleted.
import fs from 'node:fs';
import crypto from 'node:crypto';
const files = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'data/questions.json', 'icons/icon-192.png', 'icons/icon-512.png',
  ...fs.readdirSync('img/st').filter((f) => f.endsWith('.webp')).sort().map((f) => `img/st/${f}`)];
const h = crypto.createHash('sha256');
for (const f of files) if (f !== './') h.update(f).update(fs.readFileSync(f));
const version = h.digest('hex').slice(0, 12);
const tpl = fs.readFileSync('tools/sw.template.js', 'utf8')
  .replace('__VERSION__', version)
  .replace('__FILES__', JSON.stringify(files, null, 2));
fs.writeFileSync('sw.js', tpl);
console.log('sw.js version', version, 'files', files.length);
