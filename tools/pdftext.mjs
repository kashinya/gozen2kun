// Dump the text layer of a PDF: node tools/pdftext.mjs file.pdf
import * as mupdf from 'mupdf';
import fs from 'node:fs';
const d = mupdf.Document.openDocument(fs.readFileSync(process.argv[2]), 'application/pdf');
for (let i = 0; i < d.countPages(); i++) console.log(`[p${i + 1}]\n` + d.loadPage(i).toStructuredText().asText());
