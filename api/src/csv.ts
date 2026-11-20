/** Spreadsheets run a cell that starts with one of these as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Byte order mark, so Excel reads the file as UTF-8. */
const BOM = String.fromCharCode(0xfeff);

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  let text = String(value);
  // Published names are untrusted text: stop them being run as formulas.
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Rows as CSV with a header line, readable by Excel (BOM and CRLF line ends). */
export function toCsv(rows: Record<string, unknown>[]): string {
  return toCsvWithin(rows, Infinity).csv;
}

/**
 * As toCsv, but stops before the file would exceed `maxBytes` (UTF-8, with the
 * BOM). Returns how many rows were written, so the caller can say the file was
 * cut short.
 */
export function toCsvWithin(
  rows: Record<string, unknown>[],
  maxBytes: number,
  preamble: string[] = [],
): { csv: string; written: number } {
  const first = rows[0];
  if (!first)
    return {
      csv: preamble.length ? `${BOM}${preamble.map(cell).join('\r\n')}\r\n` : '',
      written: 0,
    };
  const header = Object.keys(first);
  const lines = [`${BOM}${[...preamble.map(cell), header.join(',')].join('\r\n')}\r\n`];
  let bytes = Buffer.byteLength(lines[0]!);
  let written = 0;
  for (const row of rows) {
    const line = `${header.map((key) => cell(row[key])).join(',')}\r\n`;
    const size = Buffer.byteLength(line);
    if (bytes + size > maxBytes) break;
    lines.push(line);
    bytes += size;
    written += 1;
  }
  return { csv: lines.join(''), written };
}
