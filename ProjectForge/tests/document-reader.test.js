'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { readFileRaw, readFileAsContent } = require('../fileKit/reader');

function simplePdf(text) {
    const stream = `BT /F1 12 Tf 40 100 Td (${text}) Tj ET`;
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ];
    let result = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, i) => { offsets.push(Buffer.byteLength(result)); result += `${i + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = Buffer.byteLength(result);
    result += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
    result += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(result);
}
test('real PDF v2, Word, Excel, CSV and image reader fixtures', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-doc-'));
    try {
        const pdf = path.join(tmp, 'sample.pdf');
        await fs.writeFile(pdf, simplePdf('ProjectForge PDF'));
        assert.match((await readFileRaw(pdf)).text, /ProjectForge PDF/);

        const Excel = require('exceljs');
        const workbook = new Excel.Workbook();
        workbook.addWorksheet('Data').addRow(['ProjectForge', 42]);
        const xlsx = path.join(tmp, 'sample.xlsx');
        await workbook.xlsx.writeFile(xlsx);
        assert.match((await readFileRaw(xlsx)).text, /ProjectForge\t42/);
        const csv = path.join(tmp, 'sample.csv');
        await fs.writeFile(csv, 'name,value\nProjectForge,42\n');
        assert.match((await readFileRaw(csv)).text, /ProjectForge\t42/);

        // JSZip is an explicit test-only dependency.
        const JSZip = require('jszip');
        const zip = new JSZip();
        zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
        zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
        zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>ProjectForge Word</w:t></w:r></w:p></w:body></w:document>');
        const docx = path.join(tmp, 'sample.docx');
        await fs.writeFile(docx, await zip.generateAsync({ type: 'nodebuffer' }));
        assert.match((await readFileRaw(docx)).text, /ProjectForge Word/);

        const png = path.join(tmp, 'pixel.png');
        await fs.writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9i0AAAAASUVORK5CYII=', 'base64'));
        const image = await readFileAsContent(png);
        assert.match(image.parts[1].image_url.url, /^data:image\/png;base64,/);

        const xls = path.join(tmp, 'legacy.xls');
        await fs.writeFile(xls, 'not xlsx');
        await assert.rejects(readFileRaw(xls), /\.xls.*暂不支持/);
    } finally { await fs.rm(tmp, { recursive: true, force: true }); }
});