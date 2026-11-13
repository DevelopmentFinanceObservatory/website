/**
 * `check.ts`: the chunked check protocol over a scripted fetch, a message
 * for every finding code, closest value-list members and the example sheet
 * over the test documents, the result sentence and the findings CSV rows.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CHECK_URL,
    CheckError,
    checkRows,
    closestMembers,
    editDistance,
    exampleSheet,
    findingMessage,
    findingsCsvRows,
    messageText,
    resultSentence,
    type CheckProgress,
} from '../check.ts';
import { buildModel } from '../model.ts';
import { mapHeaders, parsePasted, rowsToCheck } from '../pasted.ts';
import {
    FINDING_CODES,
    readOntology,
    readProvenances,
    type OntologyCheckRow,
    type OntologyFinding,
} from '../wire.ts';
import { ontologyBody, provenancesBody } from './fixtures.ts';

const model = buildModel(readOntology(ontologyBody()), readProvenances(provenancesBody()));

const rowsOf = (n: number): OntologyCheckRow[] =>
    Array.from({ length: n }, (_, at) => ({ ref: String(at + 2), measured_property: 'amount' }));

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
    });

/** One finding per row, so a test can count which rows came back. */
const answer = (rows: readonly OntologyCheckRow[]) =>
    json(200, {
        generation: 'g1',
        row_count: rows.length,
        findings: rows.map((row) => ({
            ref: row.ref,
            field: 'measured_property',
            value: 'amount',
            code: 'not_a_property',
            severity: 'error',
        })),
    });

/** A fetch answering `respond` for each request body, recording the chunk sizes and waits. */
const rig = (respond: (rows: OntologyCheckRow[], call: number) => Response) => {
    const sizes: number[] = [];
    const waits: number[] = [];
    const progress: CheckProgress[] = [];
    let clock = 0;
    const options = {
        fetch: async (url: string | URL | Request, init?: RequestInit) => {
            assert.equal(String(url), CHECK_URL);
            assert.equal(init?.method, 'POST');
            const { rows } = JSON.parse(String(init?.body)) as { rows: OntologyCheckRow[] };
            sizes.push(rows.length);
            return respond(rows, sizes.length);
        },
        sleep: async (ms: number) => {
            waits.push(ms);
            clock += ms;
        },
        now: () => clock,
        onProgress: (step: CheckProgress) => progress.push(step),
    };
    return { options, sizes, waits, progress };
};

test('every chunk answering 200 gathers the findings and reports progress per chunk', async () => {
    const { options, sizes, progress } = rig((rows) => answer(rows));
    const result = await checkRows(rowsOf(5), { ...options, chunkRows: 2 });
    assert.deepEqual(sizes, [2, 2, 1]);
    assert.deepEqual(
        result.findings.map((finding) => finding.ref),
        ['2', '3', '4', '5', '6'],
    );
    assert.equal(result.rowCount, 5);
    assert.equal(result.generation, 'g1');
    assert.deepEqual(result.refused, []);
    assert.deepEqual(
        progress.map((step) => step.checked),
        [0, 2, 4, 5],
    );
    assert.ok(progress.every((step) => step.total === 5));
});

test('a 400 on a chunk of 8 halves down to the one bad row, and later chunks keep the size', async () => {
    const bad = '7';
    const { options, sizes, progress } = rig((rows) =>
        rows.some((row) => row.ref === bad)
            ? json(400, { code: 'request_invalid', detail: 'too many ids to read' })
            : answer(rows),
    );
    const result = await checkRows(rowsOf(10), { ...options, chunkRows: 8 });
    assert.deepEqual(sizes, [8, 4, 4, 2, 1, 1, 2, 1, 1]);
    assert.deepEqual(result.refused, [{ ref: bad, detail: 'too many ids to read' }]);
    assert.equal(result.findings.length, 9);
    assert.ok(!result.findings.some((finding) => finding.ref === bad));
    assert.equal(progress.at(-1)?.checked, 10);
});

test('a 503 with Retry-After waits, then the 200 is read', async () => {
    const { options, sizes, waits } = rig((rows, call) =>
        call === 1 ? json(503, {}, { 'retry-after': '3' }) : answer(rows),
    );
    const result = await checkRows(rowsOf(2), options);
    assert.deepEqual(waits, [3000]);
    assert.deepEqual(sizes, [2, 2]);
    assert.equal(result.findings.length, 2);
});

test('a 502 stops the check with a CheckError naming the status and the problem', async () => {
    const { options, sizes } = rig(() => json(502, { detail: 'the graph did not answer' }));
    await assert.rejects(checkRows(rowsOf(3), options), (error: unknown) => {
        assert.ok(error instanceof CheckError);
        assert.match(error.message, /502 \(the graph did not answer\)/);
        return true;
    });
    assert.deepEqual(sizes, [3]);
});

test('a 200 out of shape stops the check with a CheckError', async () => {
    const { options } = rig(() => json(200, { findings: [] }));
    await assert.rejects(checkRows(rowsOf(1), options), CheckError);
});

const finding = (overrides: Partial<OntologyFinding>): OntologyFinding => ({
    ref: '4',
    field: 'constraint_properties.dac1AidType',
    value: 'DAC1AidTpye1020',
    code: 'node_not_held',
    severity: 'error',
    ...overrides,
});

test('every finding code has its own message', () => {
    const messages = FINDING_CODES.map((code) =>
        messageText(findingMessage(model, finding({ code }))),
    );
    for (const [at, message] of messages.entries()) {
        assert.ok(message.length > 0, `${FINDING_CODES[at]} has no message`);
    }
    assert.equal(new Set(messages).size, FINDING_CODES.length);
});

test('a value outside the range links the property and its value list', () => {
    const parts = findingMessage(model, finding({ code: 'value_outside_range' }));
    const terms = parts.flatMap((part) => (part.kind === 'term' ? [part.id] : []));
    assert.deepEqual(terms, ['dac1AidType', 'DAC1AidTypeEnum']);
});

test('a constraint key the graph lacks is named as a property, the value as typed', () => {
    const parts = findingMessage(
        model,
        finding({ field: 'constraint_properties.crsPurpos', value: 'crsPurpos' }),
    );
    assert.deepEqual(parts[0], { kind: 'value', text: 'crsPurpos' });
    assert.match(messageText(parts), /is no property on the graph/);
});

test('edit distance counts single-character edits', () => {
    assert.equal(editDistance('kitten', 'sitting'), 3);
    assert.equal(editDistance('', 'abc'), 3);
    assert.equal(editDistance('same', 'same'), 0);
});

test('the closest members to a misspelt value come from the property’s value list', () => {
    assert.deepEqual(
        closestMembers(model, finding({ value: 'DAC1AidTpye1020' }))[0],
        'DAC1AidType1020',
    );
    assert.deepEqual(
        closestMembers(
            model,
            finding({ value: 'gros', field: 'constraint_properties.nettingBasis' }),
        ),
        ['Gross', 'Net'],
    );
});

test('a label or code close to the value finds its member', () => {
    const byLabel = finding({
        code: 'value_outside_range',
        value: 'official development asistance (DAC 1 aid type)',
    });
    assert.equal(closestMembers(model, byLabel)[0], 'DAC1AidType1010');
});

test('no members are offered for other codes, definition fields or an unknown property', () => {
    assert.deepEqual(closestMembers(model, finding({ code: 'node_untyped' })), []);
    assert.deepEqual(
        closestMembers(model, finding({ field: 'population_type', value: 'FinancialFlo' })),
        [],
    );
    assert.deepEqual(
        closestMembers(
            model,
            finding({ field: 'constraint_properties.crsPurpos', value: 'crsPurpos' }),
        ),
        [],
    );
});

test('the example sheet follows a dataset pattern with one misspelt value', () => {
    const example = exampleSheet(model);
    assert.ok(example);
    const { header, rows } = parsePasted(example.text);
    const mapping = mapHeaders(model, header);
    assert.deepEqual(
        mapping.map((column) => column.target.kind),
        [
            'ignored',
            'ignored',
            'definition',
            'definition',
            'definition',
            'definition',
            'property',
            'property',
            'property',
        ],
    );
    const checkRows = rowsToCheck(mapping, rows);
    assert.equal(checkRows.length, 5);
    const values = checkRows.flatMap((row) => Object.values(row.constraint_properties ?? {}));
    const unheld = values.filter((value) => typeof value === 'string' && !model.node(value));
    assert.equal(unheld.length, 1);
    assert.equal(example.misspelt, 'dac1AidType');
    assert.equal(checkRows[2]?.constraint_properties?.dac1AidType, unheld[0]);
});

test('the result sentence counts errors, warnings and rows and names the generation', () => {
    const result = {
        generation: 'g7',
        rowCount: 6,
        findings: [
            finding({}),
            finding({ code: 'value_outside_range' }),
            finding({ code: 'property_outside_domain', severity: 'warning' }),
        ],
        refused: [{ ref: '9', detail: 'too many' }],
    };
    assert.equal(
        resultSentence(result, 6),
        '3 errors and 1 warning in 6 rows, checked against the graph at generation g7.',
    );
    assert.equal(
        resultSentence({ generation: null, rowCount: 1, findings: [], refused: [] }, 1),
        'No problems in 1 row.',
    );
});

test('the findings CSV has a row per finding and per refused row, under the column header', () => {
    const mapping = mapHeaders(model, ['source_code', 'populationType', 'dac1AidType']);
    const rows = findingsCsvRows(model, mapping, {
        findings: [
            finding({}),
            finding({ field: 'dcid', value: 'X', code: 'definition_differs', severity: 'warning' }),
        ],
        refused: [{ ref: '9', detail: 'too many ids' }],
    });
    assert.deepEqual(rows[0], ['row', 'column', 'value', 'code', 'message']);
    assert.deepEqual(rows[1]?.slice(0, 4), [
        '4',
        'dac1AidType',
        'DAC1AidTpye1020',
        'node_not_held',
    ]);
    assert.match(rows[1]?.[4] ?? '', /DAC1AidTpye1020 is no value on the graph/);
    assert.deepEqual(rows[2]?.slice(0, 4), ['4', 'dcid', 'X', 'definition_differs']);
    assert.deepEqual(rows[3], ['9', '', '', 'request_invalid', 'too many ids']);
});
