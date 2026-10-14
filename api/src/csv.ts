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
  const first = rows[0];
  if (!first) return '';
  const header = Object.keys(first);
  const lines = [
    header.join(','),
    ...rows.map((row) => header.map((key) => cell(row[key])).join(',')),
  ];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
