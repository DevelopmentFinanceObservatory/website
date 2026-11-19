/** `sheet.ts`: CSV quoting and file names. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { csvFileName, toCsv } from '../sheet.ts';

test('CSV quotes fields with commas, quotes and line breaks and ends lines with CRLF', () => {
    assert.equal(
        toCsv([
            ['plain', 'a,b', 'say "hi"'],
            ['two\nlines', '', 'x'],
        ]),
        'plain,"a,b","say ""hi"""\r\n"two\nlines",,x',
    );
});

test('CSV writes a cell a spreadsheet would read as a formula as text, with a leading quote', () => {
    assert.equal(
        toCsv([['=HYPERLINK("x")', '+1', '-2', '@SUM(A1)', '\tx', 'a=b', '']]),
        `"'=HYPERLINK(""x"")",'+1,'-2,'@SUM(A1),'\tx,a=b,`,
    );
    assert.equal(toCsv([['\rx']]), `"'\rx"`);
});

test('a CSV file name is the label in lower case with hyphens', () => {
    assert.equal(csvFileName('Financial flow'), 'financial-flow.csv');
    assert.equal(csvFileName('  DAC 1 aid type (list)  '), 'dac-1-aid-type-list.csv');
    assert.equal(csvFileName('—'), 'sheet.csv');
});
