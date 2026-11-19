/** CSV output: the RFC 4180 writer and the file name for a download. */

/**
 * A field as CSV. A value starting with `=`, `+`, `-`, `@`, a tab or a
 * carriage return gains a leading `'`, so a spreadsheet opening the file
 * shows it as text and does not run it as a formula.
 */
const csvField = (raw: string): string => {
    const value = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
};

/**
 * RFC 4180. Fields with a comma, quote or line break are quoted with quotes
 * doubled, lines end CRLF, and a field that could run as a formula starts
 * with `'`.
 */
export const toCsv = (rows: readonly (readonly string[])[]): string =>
    rows.map((row) => row.map(csvField).join(',')).join('\r\n');

/** A file name from a label: lower case, runs of other characters as one hyphen. */
export const csvFileName = (label: string): string => {
    const stem = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    return `${stem || 'sheet'}.csv`;
};
