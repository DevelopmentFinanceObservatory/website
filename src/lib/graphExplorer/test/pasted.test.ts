/**
 * `pasted.ts`: reading a pasted range, mapping its headers against the test
 * documents, building check rows and placing findings.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildModel } from '../model.ts';
import {
    chunkRows,
    locateFinding,
    mapHeaders,
    parsePasted,
    rowsToCheck,
    switchColumn,
} from '../pasted.ts';
import { CHECK_MAX_ROWS, readOntology, readProvenances } from '../wire.ts';
import type { OntologyFinding } from '../wire.ts';
import { ontologyBody, provenancesBody } from './fixtures.ts';

const model = buildModel(readOntology(ontologyBody()), readProvenances(provenancesBody()));

test('a pasted range keeps quoted tabs, line breaks and quotes and drops trailing blank rows', () => {
    const text =
        'code\tlabel\tnote\r\n' +
        'A1\tFirst\t"has a\ttab and a\nline break and ""quotes"""\r\n' +
        'A2\tSecond\t\r\n' +
        '\t\t\r\n' +
        '\r\n';
    const { header, rows } = parsePasted(text);
    assert.deepEqual(header, ['code', 'label', 'note']);
    assert.deepEqual(rows, [
        ['A1', 'First', 'has a\ttab and a\nline break and "quotes"'],
        ['A2', 'Second', ''],
    ]);
});

test('an empty paste has no header and no rows', () => {
    assert.deepEqual(parsePasted(''), { header: [], rows: [] });
});

const target = (mapping: ReturnType<typeof mapHeaders>, index: number) => mapping[index]?.target;

test('headers map to definition fields in either case, to properties, or to nothing', () => {
    const mapping = mapHeaders(model, [
        'source_code',
        'measured_property',
        'populationType',
        'observation_properties',
        'nettingBasis',
        'netting_basis',
        'dac_1_aid_type',
        'financialFlowType ',
        'dcid',
    ]);
    assert.deepEqual(target(mapping, 0), { kind: 'ignored' });
    assert.deepEqual(target(mapping, 1), { kind: 'definition', field: 'measuredProperty' });
    assert.deepEqual(target(mapping, 2), { kind: 'definition', field: 'populationType' });
    assert.deepEqual(target(mapping, 3), { kind: 'definition', field: 'observationProperties' });
    assert.deepEqual(target(mapping, 4), { kind: 'property', property: 'nettingBasis' });
    assert.deepEqual(target(mapping, 5), { kind: 'property', property: 'nettingBasis' });
    assert.deepEqual(target(mapping, 6), { kind: 'ignored' });
    assert.deepEqual(target(mapping, 7), { kind: 'property', property: 'financialFlowType' });
    assert.deepEqual(target(mapping, 8), { kind: 'definition', field: 'dcid' });
    assert.deepEqual(
        mapping.map((column) => column.index),
        [0, 1, 2, 3, 4, 5, 6, 7, 8],
    );
});

test('a column switches between property and ignored without touching the others', () => {
    const mapping = mapHeaders(model, ['measuredProperty', 'netting_basis', 'Region']);
    const ignored = switchColumn(mapping, 1, 'ignored');
    assert.deepEqual(target(ignored, 1), { kind: 'ignored' });
    assert.deepEqual(target(ignored, 0), target(mapping, 0));

    const property = switchColumn(mapping, 2, 'property');
    assert.deepEqual(target(property, 2), { kind: 'property', property: 'Region' });
    assert.deepEqual(target(mapping, 2), { kind: 'ignored' });
});

test('rows to check number rows as the sheet shows them and apply the empty-cell rules', () => {
    const mapping = mapHeaders(model, [
        'source_code',
        'populationType',
        'measuredProperty',
        'observationProperties',
        'nettingBasis',
        'financialFlowType',
    ]);
    const rows = rowsToCheck(mapping, [
        ['X1', 'FinancialFlow', 'amount', 'financingProvider, financingRecipient', 'Gross', ''],
        ['X2', 'FinancialFlow', '', '', '', 'Buyback'],
        ['', '', '', '', '', ''],
        ['X4', '', 'amount', '', 'Net', 'Buyback'],
    ]);
    assert.equal(rows.length, 3);
    assert.deepEqual(rows[0], {
        ref: '2',
        dcid: null,
        population_type: 'FinancialFlow',
        measured_property: 'amount',
        stat_type: null,
        measurement_qualifier: null,
        measurement_denominator: null,
        constraint_properties: { nettingBasis: 'Gross' },
        observation_properties: ['financingProvider', 'financingRecipient'],
    });
    assert.equal(rows[1]?.ref, '3');
    assert.equal(rows[1]?.measured_property, '');
    assert.deepEqual(rows[1]?.constraint_properties, { financialFlowType: 'Buyback' });
    assert.deepEqual(rows[1]?.observation_properties, []);
    assert.equal(rows[2]?.ref, '5');
    assert.equal(rows[2]?.population_type, null);
});

const finding = (field: string, ref: string | null = '3'): OntologyFinding => ({
    ref,
    field,
    value: 'x',
    code: 'node_not_held',
    severity: 'error',
});

test('a finding locates to the column of its constraint property or definition field', () => {
    const mapping = mapHeaders(model, ['source_code', 'measured_property', 'nettingBasis']);
    assert.deepEqual(locateFinding(mapping, finding('constraint_properties.nettingBasis')), {
        row: 3,
        column: 2,
    });
    assert.deepEqual(locateFinding(mapping, finding('measured_property')), { row: 3, column: 1 });
});

test('a finding whose field has no column locates to its row alone', () => {
    const mapping = mapHeaders(model, ['measured_property']);
    assert.deepEqual(locateFinding(mapping, finding('constraint_properties.nettingBasis')), {
        row: 3,
        column: null,
    });
    assert.deepEqual(locateFinding(mapping, finding('stat_type')), { row: 3, column: null });
    assert.equal(locateFinding(mapping, finding('measured_property', null)), null);
    assert.equal(locateFinding(mapping, finding('measured_property', 'row 2')), null);
});

test('rows split into chunks of at most the request limit', () => {
    const rows = Array.from({ length: CHECK_MAX_ROWS + 1 }, (_, index) => index);
    const chunks = chunkRows(rows);
    assert.deepEqual(
        chunks.map((chunk) => chunk.length),
        [CHECK_MAX_ROWS, 1],
    );
    assert.equal(chunkRows(rows.slice(0, CHECK_MAX_ROWS)).length, 1);
    assert.deepEqual(chunkRows([1, 2, 3], 2), [[1, 2], [3]]);
    assert.deepEqual(chunkRows([]), []);
});
