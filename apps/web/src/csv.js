export const normHeader = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();

// Parse pasted CSV / TSV / spreadsheet text. Returns { headers, rows } with raw cell strings.
export function parseTable(text) {
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const delim = ['\t', ';', ','].find((d) => lines[0].includes(d)) || ',';
  const split = (line) => {
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delim) { cells.push(cur.trim()); cur = ''; } else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };
  return { headers: split(lines[0]), rows: lines.slice(1).map(split) };
}

// Map raw headers to field names using [field, regex-on-normalized-header] pairs.
export function mapHeaders(headers, spec) {
  return headers.map((h) => spec.find(([, re]) => re.test(normHeader(h)))?.[0] || null);
}

export const toNumber = (s) => {
  const str = String(s ?? '').replace(/[^\d.,-]/g, '');
  if (!str) return 0;
  // "1.290.000₫" / "1,290,000" -> 1290000 ; "12.5" / "12,5" -> 12.5
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(str)) return Number(str.replace(/[.,]/g, ''));
  return Number(str.replace(',', '.')) || 0;
};

export function toCsv(rows) {
  return '\uFEFF' + rows.map((r) => r.map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function downloadCsv(filename, rows) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
