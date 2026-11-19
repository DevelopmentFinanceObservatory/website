/** Delimited text as spreadsheets copy and save it, read with RFC 4180 quotes. */

export type Scan = {
    readonly records: string[][];
    /** The delimiters that ended a cell outside quotes. */
    readonly split: ReadonlySet<string>;
};

/**
 * Reads `text` into records, each cell ended by any character of
 * `delimiters` or by a line end. A cell that opens with a quote may hold
 * delimiters, line breaks and doubled quotes. Its closing quote counts only
 * when a delimiter, a line end or the end of the text follows it. When
 * anything else follows, or the quote does not close, the cell is read again
 * from its opening quote as plain text, so the rows after it stay rows.
 * Stops after `limit` records.
 */
export const scan = (text: string, delimiters: string, limit = Infinity): Scan => {
    const records: string[][] = [];
    const split = new Set<string>();
    let record: string[] = [];
    let cell = '';
    let quoted = false;
    let cellStart = true;
    // Where the open quoted cell began, and the records finished before it.
    let opened: { at: number; records: number; record: string[] } = {
        at: 0,
        records: 0,
        record: [],
    };

    const endCell = () => {
        record.push(cell);
        cell = '';
        cellStart = true;
    };
    const endRecord = () => {
        endCell();
        records.push(record);
        record = [];
    };
    const closes = (next: string): boolean =>
        next === '' || next === '\n' || next === '\r' || delimiters.includes(next);

    for (let i = 0; i <= text.length && records.length < limit; i += 1) {
        const char = text.charAt(i);
        const unclosed = i === text.length && quoted;
        const stray =
            quoted && char === '"' && text.charAt(i + 1) !== '"' && !closes(text.charAt(i + 1));
        if (unclosed || stray) {
            // Read the quoted cell again from its opening quote, unquoted.
            records.length = opened.records;
            record = [...opened.record];
            cell = '"';
            quoted = false;
            cellStart = false;
            i = opened.at;
            continue;
        }
        if (i === text.length) break;
        if (quoted) {
            if (char !== '"') cell += char;
            else if (text.charAt(i + 1) === '"') {
                cell += '"';
                i += 1;
            } else quoted = false;
        } else if (char === '"' && cellStart) {
            opened = { at: i, records: records.length, record: [...record] };
            quoted = true;
            cellStart = false;
        } else if (delimiters.includes(char)) {
            split.add(char);
            endCell();
        } else if (char === '\n') endRecord();
        else if (char === '\r') {
            if (text.charAt(i + 1) === '\n') i += 1;
            endRecord();
        } else {
            cell += char;
            cellStart = false;
        }
    }
    if (records.length < limit && (cell !== '' || record.length > 0)) endRecord();
    return { records, split };
};
