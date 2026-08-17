/* ============================================================
   MAZE ROOM — report export

   Excel: a real .xlsx is written here by hand. The alternatives were
   worse — a CSV is not a spreadsheet (no types, no column widths, and
   Indian number formats get mangled), and an HTML table saved as .xls
   makes Excel show a "the file format and extension don't match"
   warning that looks broken to whoever you send it to. A genuine xlsx
   is a ZIP of small XML parts, so this file contains a tiny ZIP writer
   (stored, no compression) and the four parts Excel actually needs.
   No library, no CDN, no build step — same as the rest of the project.

   PDF: the browser's own print engine, which every browser can save as
   PDF. That gives real selectable text and correct page breaks, which
   a canvas-to-image PDF library would not.
   ============================================================ */

/* ---------- CRC32, needed by the ZIP format ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ---------- minimal ZIP (stored) ---------- */
function zipFiles(files) {
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;

  const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF];
  const u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

  files.forEach(f => {
    const name = enc.encode(f.name);
    const data = enc.encode(f.data);
    const crc = crc32(data);
    /* a fixed timestamp keeps the same report byte-identical run to run */
    const time = 0, date = 0x5721;                 // 2023-09-01, arbitrary but valid

    const local = [].concat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(time), u16(date),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)
    );
    chunks.push(new Uint8Array(local), name, data);

    central.push([].concat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(time), u16(date),
      u32(crc), u32(data.length), u32(data.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)
    ), name);

    offset += local.length + name.length + data.length;
  });

  const cdParts = [];
  let cdSize = 0;
  for (let i = 0; i < central.length; i += 2) {
    const head = new Uint8Array(central[i]), nm = central[i + 1];
    cdParts.push(head, nm);
    cdSize += head.length + nm.length;
  }
  const eocd = new Uint8Array([].concat(
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(cdSize), u32(offset), u16(0)
  ));

  const all = chunks.concat(cdParts, [eocd]);
  const total = all.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  all.forEach(a => { out.set(a, p); p += a.length; });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/* ---------- xlsx ---------- */
const xesc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

const colName = n => {                       // 0 -> A, 26 -> AA
  let s = '';
  n++;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
  return s;
};

/* Excel counts days from 1899-12-30. Dates are written as real numbers
   with a date format so they sort and filter properly in the sheet. */
const excelDate = v => {
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return null;
  return (d.getTime() - d.getTimezoneOffset() * 60000) / 86400000 + 25569;
};

/* sheet = { name, columns:[{header, key, type}], rows:[…] }
   type: 'text' (default) | 'number' | 'money' | 'date' */
function sheetXML(sheet) {
  const cols = sheet.columns;
  const widths = cols.map((c, i) => {
    let w = String(c.header || '').length + 4;
    sheet.rows.forEach(r => {
      const v = r[c.key];
      w = Math.max(w, Math.min(46, String(v ?? '').length + 2));
    });
    return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
  }).join('');

  const head = `<row r="1">` + cols.map((c, i) =>
    `<c r="${colName(i)}1" s="1" t="inlineStr"><is><t>${xesc(c.header)}</t></is></c>`).join('') + `</row>`;

  const body = sheet.rows.map((r, ri) => {
    const cells = cols.map((c, i) => {
      const ref = colName(i) + (ri + 2);
      const v = r[c.key];
      if (v === null || v === undefined || v === '') return '';
      if (c.type === 'money')  return `<c r="${ref}" s="2"><v>${Number(v) || 0}</v></c>`;
      if (c.type === 'number') return `<c r="${ref}"><v>${Number(v) || 0}</v></c>`;
      if (c.type === 'date') {
        const d = excelDate(v);
        return d === null ? `<c r="${ref}" t="inlineStr"><is><t>${xesc(v)}</t></is></c>`
                          : `<c r="${ref}" s="3"><v>${d}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t>${xesc(v)}</t></is></c>`;
    }).join('');
    return `<row r="${ri + 2}">${cells}</row>`;
  }).join('');

  const last = colName(Math.max(0, cols.length - 1)) + (sheet.rows.length + 1);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><outlinePr/></sheetPr>
<dimension ref="A1:${last}"/>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${widths}</cols>
<sheetData>${head}${body}</sheetData>
<autoFilter ref="A1:${colName(Math.max(0, cols.length - 1))}1"/>
</worksheet>`;
}

function exportXLSX(filename, sheets) {
  const safe = s => String(s).replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31) || 'Sheet';
  const names = sheets.map((s, i) => safe(s.name || 'Sheet' + (i + 1)));

  const files = [
    { name: '[Content_Types].xml', data:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>` },

    { name: '_rels/.rels', data:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>` },

    { name: 'xl/workbook.xml', data:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((n, i) => `<sheet name="${xesc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>` },

    { name: 'xl/_rels/workbook.xml.rels', data:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>` },

    /* s=1 bold header · s=2 rupees · s=3 date */
    { name: 'xl/styles.xml', data:
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2">
<numFmt numFmtId="164" formatCode="&quot;₹&quot;#,##0"/>
<numFmt numFmtId="165" formatCode="dd-mmm-yyyy hh:mm"/>
</numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1A1A2E"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>` }
  ].concat(sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXML(s) })));

  downloadBlob(zipFiles(files), filename.replace(/\.xlsx$/i, '') + '.xlsx');
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ---------- PDF, via the browser's print engine ---------- */
function exportPDF(title, sheets, note) {
  const w = window.open('', '_blank', 'width=1000,height=900');
  if (!w) { toast('Allow pop-ups to save a PDF', true); return; }

  const money0 = n => '₹' + Number(n || 0).toLocaleString('en-IN');
  const cell = (v, c) =>
    c.type === 'money' ? money0(v)
    : c.type === 'date' ? (v ? new Date(v).toLocaleString('en-IN',
        { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
    : (v ?? '');

  const tables = sheets.map(s => `
    <h2>${esc(s.name)}</h2>
    ${s.summary ? `<div class="sum">${s.summary.map(x =>
      `<div><b>${esc(x.v)}</b><span>${esc(x.k)}</span></div>`).join('')}</div>` : ''}
    <table>
      <thead><tr>${s.columns.map(c =>
        `<th class="${c.type === 'money' || c.type === 'number' ? 'n' : ''}">${esc(c.header)}</th>`).join('')}</tr></thead>
      <tbody>${s.rows.map(r => `<tr>${s.columns.map(c =>
        `<td class="${c.type === 'money' || c.type === 'number' ? 'n' : ''}">${esc(cell(r[c.key], c))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
    ${!s.rows.length ? '<p class="none">Nothing to report for this period.</p>' : ''}`).join('');

  w.document.write(`<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#14141f;padding:28px 30px}
  .rh{display:flex;align-items:flex-start;gap:14px;border-bottom:2px solid #14141f;padding-bottom:12px;margin-bottom:18px}
  .rh img{width:42px;height:42px;object-fit:contain}
  .rh h1{font-size:1.35rem;letter-spacing:.02em;text-transform:uppercase}
  .rh p{color:#55556b;font-size:11.5px;margin-top:2px}
  .rh .meta{margin-left:auto;text-align:right;color:#55556b;font-size:11.5px}
  h2{font-size:1rem;text-transform:uppercase;letter-spacing:.04em;margin:22px 0 9px;
     padding-bottom:5px;border-bottom:1px solid #d8d8e2}
  h2:first-of-type{margin-top:0}
  .sum{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}
  .sum div{border:1px solid #d8d8e2;border-radius:8px;padding:8px 14px;min-width:118px}
  .sum b{display:block;font-size:1.15rem}
  .sum span{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:#8a8a9e;font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:11.5px}
  th{text-align:left;background:#f2f2f7;border-bottom:1px solid #c8c8d4;padding:6px 8px;
     font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#55556b}
  td{padding:6px 8px;border-bottom:1px solid #ececf2;vertical-align:top}
  .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  tr{break-inside:avoid}
  thead{display:table-header-group}
  .none{color:#8a8a9e;font-style:italic;padding:10px 0}
  .ft{margin-top:26px;padding-top:10px;border-top:1px solid #d8d8e2;
      color:#8a8a9e;font-size:10px;display:flex;justify-content:space-between}
  @page{margin:14mm}
  @media print{body{padding:0}}
</style></head><body>
<div class="rh">
  <img src="${location.origin}/images/logo/toss-mark-192.png" alt="">
  <div><h1>Toss Sports</h1><p>${esc(title)}</p></div>
  <div class="meta">Generated ${new Date().toLocaleString('en-IN',
    { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}<br>
    by ${esc((ME && ME.name) || '')}</div>
</div>
${note ? `<p style="color:#55556b;font-size:11.5px;margin-bottom:14px">${esc(note)}</p>` : ''}
${tables}
<div class="ft"><span>Toss Sports — internal report</span><span>Maze Room</span></div>
</body></html>`);
  w.document.close();
  /* the image must land before the print dialog measures the page */
  w.onload = () => setTimeout(() => { w.focus(); w.print(); }, 250);
}

/* ---------- the buttons ----------
   One helper so every report screen offers the same pair. `build()` is
   called at click time, so an export always reflects what is on screen
   right now rather than what was there when the page rendered. */
function exportBar(id) {
  return `<button class="btn ghost sm" data-xls="${id}">Excel</button>
          <button class="btn ghost sm" data-pdf="${id}">PDF</button>`;
}

function wireExport(id, title, build, note) {
  const go = (fn) => () => {
    try {
      const sheets = build();
      const any = sheets.some(s => s.rows.length);
      if (!any) { toast('Nothing to export yet', true); return; }
      fn(sheets);
    } catch (e) { toast('Export failed: ' + e.message, true); }
  };
  const x = $(`[data-xls="${id}"]`), p = $(`[data-pdf="${id}"]`);
  const stamp = new Date().toISOString().slice(0, 10);
  if (x) x.onclick = go(sheets => {
    exportXLSX(`toss-${id}-${stamp}`, sheets);
    toast('Excel file downloaded');
  });
  if (p) p.onclick = go(sheets => {
    exportPDF(title, sheets, note);
    toast('Choose "Save as PDF" in the print dialog');
  });
}
