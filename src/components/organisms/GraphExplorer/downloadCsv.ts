import { downloadBlob } from '@/lib/download';
import { toCsv } from '@/lib/graphExplorer/sheet';

/** Saves rows as a UTF-8 CSV file; the byte-order mark keeps Excel from misreading accents. */
export const downloadCsv = (rows: readonly (readonly string[])[], fileName: string) =>
    downloadBlob(new Blob([`﻿${toCsv(rows)}\r\n`], { type: 'text/csv;charset=utf-8' }), fileName);
