// Extract official answers from the IPA answer PDFs (text layer) -> build/answers.json
import * as mupdf from 'mupdf';
import fs from 'node:fs';
const out = {};
for (const f of fs.readdirSync('raw').filter((f) => f.endsWith('_ans.pdf'))) {
  const exam = f.split('_')[0];
  const doc = mupdf.Document.openDocument(fs.readFileSync('raw/' + f), 'application/pdf');
  const text = doc.loadPage(0).toStructuredText().asText().normalize('NFKC');
  const header = text.match(/(令和\s*\S+?年度|平成\s*\d+\s*年度)\s*(春期|秋期)\s*(IT\s*ストラテジスト試験)/);
  const section = text.match(/午前\s*[ⅡII]+\s*試験/);
  const pairs = [...text.matchAll(/問\s*(\d+)\s*\n?\s*([アイウエ])/g)].map((m) => [+m[1], m[2]]);
  const answers = {};
  for (const [n, a] of pairs) {
    if (answers[n] && answers[n] !== a) throw new Error(`${exam} 問${n} conflict`);
    answers[n] = a;
  }
  out[exam] = { header: header && header.slice(1).map((s) => s.replace(/\s+/g, ' ')), section: section && section[0], answers };
  console.log(exam, out[exam].header, out[exam].section, Object.keys(answers).length, Object.values(answers).join(''));
}
fs.writeFileSync('data-src/answers.json', JSON.stringify(out, null, 1));
