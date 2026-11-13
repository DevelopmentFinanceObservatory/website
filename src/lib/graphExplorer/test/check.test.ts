/**
 * `check.ts`: the chunked check protocol over a scripted fetch, a line for
 * every finding code, closest value-list members, the cell marks and the
 * rows the result shows, the example sheet over the test documents, the
 * result counts and the findings CSV rows.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CHECK_CHUNK_ROWS,
    CHECK_URL,
    cellKey,
    checkRows,
    closestMembers,
    editDistance,
    exampleSheet,
    findingLines,
    findingMessage,
    findingsCsvRows,
    messageText,
    FLAGGED_ROWS_STEP,
    flaggedShownFor,
    QUIET_ROWS_STEP,
    resultCounts,
    resultSentence,
    sheetMarks,
    shownRows,
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
    assert.deepEqual(result.generations, ['g1']);
    assert.deepEqual(result.refused, []);
    assert.deepEqual(
        progress.map((step) => step.checked),
        [0, 2, 4, 5],
    );
    assert.ok(progress.every((step) => step.total === 5));
});

/** A route refusing any chunk that holds row `bad`, as it does a row with too many ids to read. */
const refusing = (bad: string) => (rows: OntologyCheckRow[]) =>
    rows.some((row) => row.ref === bad)
        ? json(400, { code: 'request_invalid', detail: 'too many ids to read' })
        : answer(rows);

test('a 400 on a chunk of 8 halves down to the one bad row; each answered new chunk doubles the size back', async () => {
    const bad = '7';
    const { options, sizes, progress } = rig(refusing(bad));
    const result = await checkRows(rowsOf(20), { ...options, chunkRows: 8 });
    assert.deepEqual(sizes, [8, 4, 4, 2, 1, 1, 2, 1, 2, 4, 5]);
    assert.deepEqual(result.refused, [{ ref: bad, detail: 'too many ids to read' }]);
    assert.equal(result.findings.length, 19);
    assert.ok(!result.findings.some((finding) => finding.ref === bad));
    assert.equal(progress.at(-1)?.checked, 20);
});

test('one bad row in a long paste costs its own split and a short climb back to full size', async () => {
    const { options, sizes } = rig(refusing('5'));
    const result = await checkRows(rowsOf(5000), options);
    assert.equal(result.refused.length, 1);
    assert.equal(result.findings.length, 4999);
    assert.ok(sizes.length <= 40, `${sizes.length} requests`);
    assert.equal(sizes.at(-2), CHECK_CHUNK_ROWS);
});

/**
 * A route refusing any chunk that names more than `limit` distinct values it
 * does not know, as it refuses a request with too many ids to read.
 */
const refusingUnknown = (limit: number) => (rows: OntologyCheckRow[]) => {
    const unknown = new Set(rows.map((row) => row.constraint_properties?.crsPurpose));
    return unknown.size > limit
        ? json(400, { code: 'request_invalid', detail: 'too many ids to read' })
        : answer(rows);
};

test('a paste where every row names an unknown value keeps a small chunk size', async () => {
    const limit = 20;
    const rows = rowsOf(3000).map((row, at) => ({
        ...row,
        constraint_properties: { crsPurpose: `Unknown${at}` },
    }));
    const { options, sizes } = rig(refusingUnknown(limit));
    const result = await checkRows(rows, options);
    assert.equal(result.findings.length, 3000);
    assert.deepEqual(result.refused, []);
    // 150 requests at best; starting each chunk at the full size again takes
    // 378, and doubling after every answered half takes 337.
    assert.ok(sizes.length <= 300, `${sizes.length} requests`);
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

test('a 502 stops the check with a CheckError carrying the status and the problem', async () => {
    const { options, sizes } = rig(() => json(502, { detail: 'the graph did not answer' }));
    await assert.rejects(checkRows(rowsOf(3), options), {
        name: 'CheckError',
        reason: 'status',
        status: 502,
        detail: 'the graph did not answer',
    });
    assert.deepEqual(sizes, [3]);
});

test('a 200 out of shape stops the check with a CheckError', async () => {
    const { options } = rig(() => json(200, { findings: [] }));
    await assert.rejects(checkRows(rowsOf(1), options), { name: 'CheckError', reason: 'shape' });
});

test('an answer counting other rows than were sent stops the check', async () => {
    const { options } = rig((rows) =>
        json(200, { generation: 'g1', row_count: rows.length - 1, findings: [] }),
    );
    await assert.rejects(checkRows(rowsOf(3), options), {
        name: 'CheckError',
        reason: 'row_count',
    });
});

test('chunks answered at different generations name every generation', async () => {
    const { options } = rig((rows, call) =>
        json(200, { generation: `g${Math.min(call, 2)}`, row_count: rows.length, findings: [] }),
    );
    const result = await checkRows(rowsOf(6), { ...options, chunkRows: 2 });
    assert.deepEqual(result.generations, ['g1', 'g2']);
    const sentence = resultSentence(result, 6);
    assert.ok(sentence.includes('g1') && sentence.includes('g2'));
});

test('an answer arriving after an abort reports no progress and rejects with the reason', async () => {
    const controller = new AbortController();
    const reason = new DOMException('stopped', 'AbortError');
    const { options, progress } = rig((rows) => {
        controller.abort(reason);
        return answer(rows);
    });
    await assert.rejects(
        checkRows(rowsOf(4), { ...options, chunkRows: 2, signal: controller.signal }),
        (error: unknown) => error === reason,
    );
    assert.deepEqual(
        progress.map((step) => step.checked),
        [0],
    );
});

/** A fetch that answers only when its signal aborts, rejecting with the signal's reason. */
const stalled = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> =>
    new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) return reject(signal.reason);
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });

test('a request with no answer stops the check as a timeout', async () => {
    await assert.rejects(checkRows(rowsOf(2), { fetch: stalled, requestTimeoutMs: 10 }), {
        name: 'CheckError',
        reason: 'timeout',
    });
});

test('a check that outlasts its overall bound stops as a timeout', async () => {
    await assert.rejects(
        checkRows(rowsOf(2), { fetch: stalled, requestTimeoutMs: 60_000, limitMs: 10 }),
        { name: 'CheckError', reason: 'timeout' },
    );
});

const finding = (overrides: Partial<OntologyFinding>): OntologyFinding => ({
    ref: '4',
    field: 'constraint_properties.dac1AidType',
    value: 'DAC1AidTpye1020',
    code: 'node_not_held',
    severity: 'error',
    ...overrides,
});

test('every finding code, and a code this page does not know, reads as a line about its row, column and value', () => {
    const mapping = mapHeaders(model, ['source_code', 'populationType', 'dac1AidType']);
    const findings = [...FINDING_CODES, 'some_new_code'].map((code) =>
        finding(
            code === 'value_missing'
                ? { code, value: null }
                : code === 'property_outside_domain'
                  ? { code, value: 'dac1AidType' }
                  : { code },
        ),
    );
    const lines = findingLines(model, mapping, findings);
    const messages = new Set<string>();
    for (const line of lines) {
        const { code, value } = line.finding;
        assert.equal(line.row, 4, code);
        assert.equal(line.column, 2, code);
        assert.equal(line.columnLabel, 'dac1AidType', code);

        const named = line.parts.flatMap((part) =>
            part.kind === 'term' ? [part.id] : part.kind === 'value' ? [part.text] : [],
        );
        // A message names the value at fault, or the property when the cell is empty.
        assert.ok(named.includes(value === null ? 'dac1AidType' : String(value)), code);
        // No term or value is named twice, so a property and its value list sharing a label read once.
        const labels = line.parts.flatMap((part) =>
            part.kind === 'term' ? [part.label] : part.kind === 'value' ? [part.text] : [],
        );
        assert.equal(new Set(labels).size, labels.length, code);
        messages.add(messageText(line.parts));
    }
    assert.equal(messages.size, lines.length);
    const unknown = lines.at(-1)?.parts ?? [];
    assert.ok(unknown.some((part) => part.kind === 'value' && part.text === 'some_new_code'));
});

test('a value outside the range links its value list, and the closest members come with it', () => {
    const [line] = findingLines(model, mapHeaders(model, ['dac1AidType']), [
        finding({ code: 'value_outside_range' }),
    ]);
    const terms = line?.parts.flatMap((part) => (part.kind === 'term' ? [part.id] : []));
    assert.deepEqual(terms, ['DAC1AidTypeEnum']);
    assert.equal(line?.closest[0], 'DAC1AidType1020');
});

test('a constraint key the graph lacks is named as typed, with no term link', () => {
    const parts = findingMessage(
        model,
        finding({ field: 'constraint_properties.crsPurpos', value: 'crsPurpos' }),
    );
    assert.ok(parts.some((part) => part.kind === 'value' && part.text === 'crsPurpos'));
    assert.ok(!parts.some((part) => part.kind === 'term'));
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

test('the result counts a refused row as an error, and the sentence names the generation', () => {
    const result = {
        generations: ['g7'],
        rowCount: 6,
        findings: [
            finding({}),
            finding({ code: 'value_outside_range' }),
            finding({ code: 'property_outside_domain', severity: 'warning' }),
        ],
        refused: [{ ref: '9', detail: 'too many' }],
    };
    assert.deepEqual(resultCounts(result), { errors: 3, warnings: 1 });
    assert.ok(resultSentence(result, 6).includes('g7'));
    assert.deepEqual(resultCounts({ findings: [], refused: [] }), { errors: 0, warnings: 0 });
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
    assert.equal(rows[1]?.[4], messageText(findingMessage(model, finding({}))));
    assert.deepEqual(rows[2]?.slice(0, 4), ['4', 'dcid', 'X', 'definition_differs']);
    assert.deepEqual(rows[3], ['9', '', '', 'request_invalid', 'too many ids']);
});

test('a cell with an error and a warning is marked as an error; refused rows are flagged', () => {
    const mapping = mapHeaders(model, ['source_code', 'populationType', 'dac1AidType']);
    const lines = findingLines(model, mapping, [
        finding({}),
        finding({ severity: 'warning', code: 'property_outside_domain' }),
        finding({ ref: '6', severity: 'warning', code: 'property_outside_domain' }),
        finding({ ref: '7', field: 'stat_type' }),
        finding({ ref: null }),
    ]);
    const marks = sheetMarks(lines, [
        { ref: '9', detail: 'too many' },
        { ref: null, detail: 'too many' },
    ]);
    assert.deepEqual(
        [...marks.cells],
        [
            [cellKey(4, 2), 'error'],
            [cellKey(6, 2), 'warning'],
        ],
    );
    assert.deepEqual([...marks.flaggedRows].toSorted(), [4, 6, 7, 9]);
});

test('the result table shows flagged rows and rows without findings in bounded steps', () => {
    const flagged = new Set([3, 900]);
    const first = shownRows(1000, flagged, { flagged: FLAGGED_ROWS_STEP, quiet: QUIET_ROWS_STEP });
    assert.equal(first.rows.length, QUIET_ROWS_STEP + 2);
    assert.ok(first.rows.some(({ row }) => row === 900));
    assert.equal(first.hiddenQuiet, 1000 - 2 - QUIET_ROWS_STEP);
    assert.equal(first.hiddenFlagged, 0);
    assert.deepEqual(first.rows.slice(0, 2), [
        { dataIndex: 0, row: 2 },
        { dataIndex: 1, row: 3 },
    ]);
    const rows = first.rows.map(({ row }) => row);
    assert.deepEqual(
        rows,
        rows.toSorted((a, b) => a - b),
    );

    const all = shownRows(1000, flagged, { flagged: 2, quiet: 1000 });
    assert.equal(all.rows.length, 1000);
    assert.equal(all.hiddenQuiet, 0);
});

test('a paste with thousands of flagged rows shows them a step at a time', () => {
    const flagged = new Set(Array.from({ length: 5000 }, (_, at) => at + 2));
    const first = shownRows(5000, flagged, { flagged: FLAGGED_ROWS_STEP, quiet: QUIET_ROWS_STEP });
    assert.equal(first.rows.length, FLAGGED_ROWS_STEP);
    assert.equal(first.hiddenFlagged, 5000 - FLAGGED_ROWS_STEP);
    assert.equal(first.hiddenQuiet, 0);

    // A finding on a hidden row reveals the steps up to it.
    assert.equal(flaggedShownFor(flagged, 2, FLAGGED_ROWS_STEP), FLAGGED_ROWS_STEP);
    const revealed = flaggedShownFor(flagged, 1000, FLAGGED_ROWS_STEP);
    assert.equal(revealed, 4 * FLAGGED_ROWS_STEP);
    const shown = shownRows(5000, flagged, { flagged: revealed, quiet: 0 });
    assert.ok(shown.rows.some(({ row }) => row === 1000));
});
