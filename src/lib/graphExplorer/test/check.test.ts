/**
 * `check.ts`: the chunked check protocol over a scripted fetch, a line for
 * every finding code, closest value-list members, the cell marks and the
 * rows the result shows, the example sheet over the test documents, the
 * result counts and the findings CSV rows.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CHECK_URL,
    cellKey,
    checkRows,
    closestLookup,
    closestMembers,
    editDistance,
    editDistanceWithin,
    exampleSheet,
    findingLines,
    findingMessage,
    findingsCsvRows,
    messageText,
    FLAGGED_ROWS_STEP,
    flaggedShownFor,
    QUIET_ROWS_STEP,
    resultCounts,
    flaggedRowCount,
    resultSentence,
    sheetMarks,
    shownRows,
    CheckError,
    type CheckProgress,
    type RowFinding,
} from '../check.ts';
import type { WaitCause } from '../load.ts';
import { buildModel, openLiterals } from '../model.ts';
import { mapHeaders, parsePasted, rowsToCheck } from '../pasted.ts';
import {
    CHECK_MAX_ROWS,
    FINDING_CODES,
    readSchema,
    readUsage,
    type SchemaCheckRow,
    type SchemaFinding,
} from '../wire.ts';
import { schemaBody, usageBody } from './fixtures.ts';
import { withListedParties } from './sheetFixtures.ts';

const model = buildModel(readSchema(schemaBody()), readUsage(usageBody()));

/** `n` rows, each told apart by its dcid. */
const rowsOf = (n: number): SchemaCheckRow[] =>
    Array.from({ length: n }, (_, at) => ({ dcid: `r${at}`, measured_property: 'amount' }));

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
    });

/** A wire finding about request row `row`, whose value is the row's dcid. */
const wireFinding = (row: number, dcid: string | null | undefined): SchemaFinding => ({
    row,
    field: 'dcid',
    property: null,
    subject: 'value',
    value: dcid ?? null,
    served: null,
    code: 'definition_differs',
    severity: 'error',
});

/** An answer checking the first `count` of `rows` (all by default), one finding per checked row. */
const answer = (rows: readonly SchemaCheckRow[], count = rows.length) =>
    json(200, {
        generation: 'g1',
        rows_checked: count,
        findings: rows.slice(0, count).map((row, at) => wireFinding(at, row.dcid)),
    });

/** A fetch answering `respond` for each request body, recording the rows sent and the waits. */
const rig = (respond: (rows: SchemaCheckRow[], call: number) => Response) => {
    const sent: (string | null | undefined)[][] = [];
    const waits: number[] = [];
    const progress: CheckProgress[] = [];
    let clock = 0;
    const options = {
        fetch: async (url: string | URL | Request, init?: RequestInit) => {
            assert.equal(String(url), CHECK_URL);
            assert.equal(init?.method, 'POST');
            const { rows } = JSON.parse(String(init?.body)) as { rows: SchemaCheckRow[] };
            assert.ok(rows.every((row) => !('ref' in row)));
            sent.push(rows.map((row) => row.dcid));
            return respond(rows, sent.length);
        },
        sleep: async (ms: number) => {
            waits.push(ms);
            clock += ms;
        },
        now: () => clock,
        onProgress: (step: CheckProgress) => progress.push(step),
    };
    return { options, sent, waits, progress };
};

/** Each finding's index and the dcid it names, which must be the dcid of the row at that index. */
const placed = (findings: readonly RowFinding[]) =>
    findings.map(({ index, finding }) => [index, finding.value]);

test('a paste past the request cap goes in requests of CHECK_MAX_ROWS rows, findings by row', async () => {
    const { options, sent, progress } = rig((rows) => answer(rows));
    const rows = rowsOf(CHECK_MAX_ROWS + 5);
    const result = await checkRows(rows, options);
    assert.deepEqual(
        sent.map((refs) => refs.length),
        [CHECK_MAX_ROWS, 5],
    );
    assert.equal(result.rowCount, CHECK_MAX_ROWS + 5);
    assert.deepEqual(
        placed(result.findings),
        rows.map((row, at) => [at, row.dcid]),
    );
    assert.deepEqual(result.generations, ['g1']);
    assert.deepEqual(result.refused, []);
    assert.deepEqual(
        progress.map((step) => step.checked),
        [0, CHECK_MAX_ROWS, CHECK_MAX_ROWS + 5],
    );
});

test('an answer checking a prefix resumes at rows_checked and maps findings by start + row', async () => {
    // The route checks three rows of each request, as it does when its read budget runs out.
    const { options, sent } = rig((rows) => answer(rows, Math.min(3, rows.length)));
    const rows = rowsOf(8);
    const result = await checkRows(rows, options);
    assert.deepEqual(sent, [
        ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'],
        ['r3', 'r4', 'r5', 'r6', 'r7'],
        ['r6', 'r7'],
    ]);
    assert.equal(result.rowCount, 8);
    assert.deepEqual(
        placed(result.findings),
        rows.map((row, at) => [at, row.dcid]),
    );
});

/** A route refusing any request that holds a row with dcid `bad`, naming it by its pointer. */
const refusing = (bad: string) => (rows: SchemaCheckRow[]) => {
    const at = rows.findIndex((row) => row.dcid === bad);
    return at === -1
        ? answer(rows)
        : json(400, {
              code: 'request_invalid',
              detail: 'too many constraint properties',
              pointer: `/rows/${at}/constraint_properties`,
          });
};

test('a 400 naming a row refuses that row and checks the rest without it', async () => {
    const { options, sent, progress } = rig(refusing('r4'));
    const rows = rowsOf(7);
    const result = await checkRows(rows, options);
    assert.deepEqual(sent, [
        ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
        ['r0', 'r1', 'r2', 'r3', 'r5', 'r6'],
    ]);
    assert.deepEqual(result.refused, [{ index: 4, detail: 'too many constraint properties' }]);
    assert.equal(result.rowCount, 6);
    assert.deepEqual(
        placed(result.findings),
        rows.flatMap((row, at) => (at === 4 ? [] : [[at, row.dcid]])),
    );
    assert.equal(progress.at(-1)?.checked, 7);
});

test('a 400 naming a row after a partial answer refuses the right row of the whole paste', async () => {
    const { options, sent } = rig((rows, call) =>
        call === 1 ? answer(rows, 2) : refusing('r3')(rows),
    );
    const result = await checkRows(rowsOf(5), options);
    assert.deepEqual(sent.slice(1), [
        ['r2', 'r3', 'r4'],
        ['r2', 'r4'],
    ]);
    assert.deepEqual(
        result.refused.map(({ index }) => index),
        [3],
    );
    assert.deepEqual(
        placed(result.findings).map(([index]) => index),
        [0, 1, 2, 4],
    );
});

for (const [name, body] of [
    ['a 400 with no pointer', { code: 'request_invalid', detail: 'rows is empty' }],
    ['a 400 naming the request', { code: 'request_invalid', detail: 'x', pointer: '/rows' }],
] as const) {
    test(`${name} stops the check with its detail`, async () => {
        const { options, sent } = rig(() => json(400, body));
        await assert.rejects(checkRows(rowsOf(3), options), {
            name: 'CheckError',
            reason: 'status',
            status: 400,
            detail: body.detail,
        });
        assert.equal(sent.length, 1);
    });
}

test('a 400 naming a row that was not sent stops the check', async () => {
    const { options } = rig(() =>
        json(400, { code: 'request_invalid', detail: 'x', pointer: '/rows/9/dcid' }),
    );
    await assert.rejects(checkRows(rowsOf(3), options), { name: 'CheckError', reason: 'pointer' });
});

/** A 503 problem with `Retry-After`, naming `code` as its cause when given. */
const unavailable = (code?: string, retryAfter = '3') =>
    json(
        503,
        { code: 'service_unavailable', retryable: true, ...(code ? { cause: { code } } : {}) },
        { 'retry-after': retryAfter },
    );

for (const [code, cause] of [
    ['check_busy', 'check_busy'],
    ['schema_building', 'schema_building'],
    ['some_new_cause', 'unavailable'],
    [undefined, 'unavailable'],
] as const) {
    test(`a 503 with Retry-After and cause ${code ?? 'none'} waits as ${cause}, then the 200 is read`, async () => {
        const causes: WaitCause[] = [];
        const { options, sent, waits } = rig((rows, call) =>
            call === 1 ? unavailable(code) : answer(rows),
        );
        const result = await checkRows(rowsOf(2), {
            ...options,
            onWait: (_ms, waitCause) => causes.push(waitCause),
        });
        assert.deepEqual(waits, [3000]);
        assert.deepEqual(causes, [cause]);
        assert.equal(sent.length, 2);
        assert.equal(result.findings.length, 2);
    });
}

for (const [code, reason, words] of [
    ['check_busy', 'unavailable', /still busy with other checks/],
    ['schema_building', 'build_timeout', /still building the schema/],
    [undefined, 'unavailable', /not ready to answer/],
] as const) {
    test(`a 503 with cause ${code ?? 'none'} still answering after a minute stops the check as ${reason}`, async () => {
        const { options } = rig(() => unavailable(code, '20'));
        await assert.rejects(checkRows(rowsOf(1), options), (error: unknown) => {
            assert.ok(error instanceof CheckError);
            assert.equal(error.reason, reason);
            assert.match(error.message, words);
            return true;
        });
    });
}

for (const [name, response] of [
    [
        'a 503 saying retryable: false',
        json(
            503,
            { code: 'service_unavailable', detail: 'no schema to check against', retryable: false },
            { 'retry-after': '3' },
        ),
    ],
    [
        'a 500',
        json(500, {
            code: 'internal_error',
            detail: 'no schema to check against',
            retryable: false,
        }),
    ],
] as const) {
    test(`${name} stops the check at once with its detail`, async () => {
        const { options, sent, waits } = rig(() => response.clone());
        await assert.rejects(checkRows(rowsOf(2), options), {
            name: 'CheckError',
            reason: 'status',
            detail: 'no schema to check against',
        });
        assert.deepEqual(waits, []);
        assert.equal(sent.length, 1);
    });
}

test('a 429 from the site’s proxy with Retry-After waits, then the 200 is read', async () => {
    const { options, sent, waits } = rig((rows, call) =>
        call === 1
            ? json(429, { title: 'Too Many Requests' }, { 'retry-after': '12' })
            : answer(rows),
    );
    const result = await checkRows(rowsOf(2), options);
    assert.deepEqual(waits, [12_000]);
    assert.equal(sent.length, 2);
    assert.equal(result.findings.length, 2);
});

test('a 502 stops the check with a CheckError carrying the status and the problem', async () => {
    const { options, sent } = rig(() => json(502, { detail: 'the graph did not answer' }));
    await assert.rejects(checkRows(rowsOf(3), options), {
        name: 'CheckError',
        reason: 'status',
        status: 502,
        detail: 'the graph did not answer',
    });
    assert.equal(sent.length, 1);
});

test('a 200 out of shape stops the check with a CheckError', async () => {
    const { options } = rig(() => json(200, { findings: [] }));
    await assert.rejects(checkRows(rowsOf(1), options), { name: 'CheckError', reason: 'shape' });
});

for (const [name, count, row] of [
    ['no rows checked', 0, 0],
    ['more rows checked than sent', 4, 0],
    ['a finding past the rows checked', 2, 2],
] as const) {
    test(`an answer with ${name} stops the check`, async () => {
        const { options } = rig(() =>
            json(200, {
                generation: 'g1',
                rows_checked: count,
                findings: [wireFinding(row, null)],
            }),
        );
        await assert.rejects(checkRows(rowsOf(3), options), {
            name: 'CheckError',
            reason: 'rows_checked',
        });
    });
}

test('requests answered at different generations name every generation', async () => {
    const { options } = rig((rows, call) =>
        json(200, {
            generation: `g${Math.min(call, 2)}`,
            rows_checked: Math.min(2, rows.length),
            findings: [],
        }),
    );
    const result = await checkRows(rowsOf(6), options);
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
        checkRows(rowsOf(4), { ...options, signal: controller.signal }),
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

test('a 400 whose body outlasts the request bound stops as a timeout, not a refused row', async () => {
    // The body never arrives; it errors when the request's signal fires.
    const slowRefusal = async (_url: string | URL | Request, init?: RequestInit) => {
        const body = new ReadableStream({
            start(controller) {
                init?.signal?.addEventListener('abort', () =>
                    controller.error(init.signal?.reason),
                );
            },
        });
        return new Response(body, { status: 400 });
    };
    await assert.rejects(checkRows(rowsOf(1), { fetch: slowRefusal, requestTimeoutMs: 10 }), {
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

const finding = (overrides: Partial<SchemaFinding>): SchemaFinding => ({
    row: 0,
    field: 'constraint_properties',
    property: 'dac1AidType',
    subject: 'value',
    value: 'DAC1AidTpye1020',
    served: null,
    code: 'node_not_held',
    severity: 'error',
    ...overrides,
});

/** The sheet row of each checked row: the paste's rows 2 to 9. */
const SHEET_ROWS = [2, 3, 4, 5, 6, 7, 8, 9];

/** Findings about the checked row at `index`, sheet row 4 by default. */
const at = (findings: readonly SchemaFinding[], index = 2): RowFinding[] =>
    findings.map((found) => ({ index, finding: found }));

test('every finding code, and a code this page does not know, reads as a line about its row, column and value', () => {
    const mapping = mapHeaders(model, ['source_code', 'populationType', 'dac1AidType']);
    const findings = [...FINDING_CODES, 'some_new_code'].map((code) =>
        finding(
            code === 'value_missing'
                ? { code, value: null }
                : code === 'property_outside_domain'
                  ? { code, subject: 'property', value: 'dac1AidType' }
                  : code === 'definition_differs'
                    ? { code, served: 'DAC1AidType1020' }
                    : { code },
        ),
    );
    const lines = findingLines(model, mapping, SHEET_ROWS, at(findings));
    const messages = new Set<string>();
    for (const line of lines) {
        const { code, value, served } = line.finding;
        assert.equal(line.row, 4, code);
        assert.equal(line.column, 2, code);
        assert.equal(line.columnLabel, 'dac1AidType', code);

        const named = line.parts.flatMap((part) =>
            part.kind === 'term' ? [part.id] : part.kind === 'value' ? [part.text] : [],
        );
        // A message names the value at fault, the property when the cell is empty, or the
        // served value when the definition differs.
        const expected = served ?? value ?? 'dac1AidType';
        assert.ok(named.includes(String(expected)), code);
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

test('a value outside the range links its value list, and its closest members are offered', () => {
    const [line] = findingLines(
        model,
        mapHeaders(model, ['dac1AidType']),
        SHEET_ROWS,
        at([finding({ code: 'value_outside_range' })]),
    );
    assert.ok(line);
    const terms = line.parts.flatMap((part) => (part.kind === 'term' ? [part.id] : []));
    assert.deepEqual(terms, ['DAC1AidTypeEnum']);
    assert.equal(closestLookup(model)(line.finding)[0], 'DAC1AidType1020');
});

test('a value outside a range of several lists links each list, and the closest member comes from any', () => {
    const listed = withListedParties();
    const outside = finding({
        property: 'financingProvider',
        value: 'Unspecified donr',
        code: 'value_outside_range',
    });
    const parts = findingMessage(listed, outside);
    assert.deepEqual(
        parts.flatMap((part) => (part.kind === 'term' ? [part.id] : [])),
        ['DACUnspecifiedParty', 'Grouping'],
    );
    assert.deepEqual(closestMembers(listed, outside, 1), ['UnspecifiedDonor']);
});

test('the closest values are worked out only when asked, once per field and value', () => {
    // Each closestMembers call asks for the property's value list once.
    let lookups = 0;
    const counting = {
        ...model,
        valueListOfProperty: (id: string) => {
            lookups += 1;
            return model.valueListOfProperty(id);
        },
    };
    const findings = [
        finding({}),
        finding({ row: 1 }),
        finding({ row: 2, code: 'value_outside_range' }),
        finding({ row: 3, value: 'DAC1AidTpye1010' }),
    ];
    findingLines(counting, mapHeaders(model, ['dac1AidType']), SHEET_ROWS, at(findings));
    const closest = closestLookup(counting);
    const before = lookups;
    const offered = findings.map(closest);
    assert.equal(lookups - before, 2);
    assert.deepEqual(offered[1], offered[0]);
    assert.equal(offered[0]?.[0], 'DAC1AidType1020');
});

test('a constraint key the graph lacks is named as typed, with no term link', () => {
    const parts = findingMessage(
        model,
        finding({ property: 'crsPurpos', subject: 'property', value: 'crsPurpos' }),
    );
    assert.ok(parts.some((part) => part.kind === 'value' && part.text === 'crsPurpos'));
    assert.ok(!parts.some((part) => part.kind === 'term'));
});

test('a literal where a node belongs says it is not an id, apart from a dcid the graph lacks', () => {
    const notANode = messageText(
        findingMessage(model, finding({ code: 'not_a_node', value: 1020 })),
    );
    const notHeld = messageText(findingMessage(model, finding({ code: 'node_not_held' })));
    assert.match(notANode, /^1020 is not an id, and the dac1AidType takes a node/);
    assert.match(notHeld, /^The graph has no value DAC1AidTpye1020\./);
});

test('a field, subject or severity this page does not know reads in plain words', () => {
    const odd = finding({
        field: 'some_new_field',
        property: null,
        subject: 'cell',
        severity: 'info',
        code: 'value_missing',
        value: null,
    });
    assert.match(
        messageText(findingMessage(model, odd)),
        /^This row has no some_new_field, and every row needs one\./,
    );
    assert.deepEqual(resultCounts({ findings: at([odd]), refused: [] }), {
        errors: 0,
        warnings: 1,
    });
    const lines = findingLines(model, mapHeaders(model, ['dac1AidType']), SHEET_ROWS, at([odd]));
    assert.deepEqual(
        lines.map(({ row, column }) => [row, column]),
        [[4, null]],
    );
    assert.deepEqual([...sheetMarks(lines, [], SHEET_ROWS).flaggedRows], [4]);
    const marked = findingLines(
        model,
        mapHeaders(model, ['dac1AidType']),
        SHEET_ROWS,
        at([finding({ severity: 'info', subject: 'cell' })]),
    );
    assert.deepEqual([...sheetMarks(marked, [], SHEET_ROWS).cells], [[cellKey(4, 0), 'warning']]);
    assert.deepEqual(closestLookup(model)(marked[0]!.finding), []);
});

test('edit distance counts single-character edits', () => {
    assert.equal(editDistance('kitten', 'sitting'), 3);
    assert.equal(editDistance('', 'abc'), 3);
    assert.equal(editDistance('same', 'same'), 0);
});

/** The full Levenshtein table, as the reference the bounded count must agree with. */
const fullDistance = (a: string, b: string): number => {
    const table = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
    );
    for (let i = 1; i <= a.length; i += 1) {
        for (let j = 1; j <= b.length; j += 1) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            table[i]![j] = Math.min(
                table[i - 1]![j]! + 1,
                table[i]![j - 1]! + 1,
                table[i - 1]![j - 1]! + cost,
            );
        }
    }
    return table[a.length]![b.length]!;
};

test('the bounded edit distance is exact within its bound and one past it beyond', () => {
    const words = ['', 'a', 'gross', 'gros', 'net', 'dac1aidtype1020', 'dac1aidtpye1020', 'kitten'];
    let pairs = 0;
    for (const a of words) {
        for (const b of words) {
            const exact = fullDistance(a, b);
            for (const bound of [0, 1, 2, 3, 20]) {
                assert.equal(
                    editDistanceWithin(a, b, bound),
                    Math.min(exact, bound + 1),
                    `${a}|${b}|${bound}`,
                );
                pairs += 1;
            }
        }
    }
    assert.equal(pairs, words.length * words.length * 5);
});

test('the closest members match a full ranking of every member, ties in list order', () => {
    // Every value list property of the fixture, each against a few typed values.
    const properties = model.nodes
        .map((node) => node.ref)
        .filter((id) => model.valueListOfProperty(id) !== undefined);
    assert.ok(properties.length > 5);
    let checked = 0;
    for (const property of properties) {
        const members = model.valueListOfProperty(property)?.members ?? [];
        for (const typed of ['x', 'Gros', 'DAC1AidTpye1020', 'ODA', members[0] ?? 'none']) {
            const found = finding({ property, value: typed });
            const lower = typed.toLowerCase();
            const expected = members
                .filter((id) => id !== typed)
                .map((id, order) => {
                    const names = [
                        id,
                        model.label(id),
                        ...(model.node(id)?.classification_code ?? []),
                        ...openLiterals(model.node(id)),
                    ];
                    const score = Math.min(
                        ...names.map((name) => fullDistance(lower, name.toLowerCase())),
                    );
                    return { id, order, score };
                })
                .sort((a, b) => a.score - b.score || a.order - b.order)
                .slice(0, 3)
                .map(({ id }) => id);
            assert.deepEqual(closestMembers(model, found), expected, `${property}|${typed}`);
            checked += 1;
        }
    }
    assert.equal(checked, properties.length * 5);
});

test('the closest members to a misspelt value come from the property’s value list', () => {
    assert.deepEqual(
        closestMembers(model, finding({ value: 'DAC1AidTpye1020' }))[0],
        'DAC1AidType1020',
    );
    assert.deepEqual(closestMembers(model, finding({ value: 'gros', property: 'nettingBasis' })), [
        'Gross',
        'Net',
    ]);
});

test('a literal open property value finds the member that carries it, as a code does', () => {
    const body = schemaBody();
    const nodes = (body as { nodes: { ref: string; other_properties: unknown }[] }).nodes;
    const carry = (dcid: string, other: unknown) => {
        const member = nodes.find((node) => node.ref === dcid);
        assert.ok(member);
        member.other_properties = other;
    };
    carry('DAC1AidType1020', { wbCode: [{ value: 'Q7' }] });
    carry('DAC1AidType1030', { sameAs: [{ ref: 'Q8' }] });
    const carried = buildModel(readSchema(body), readUsage(usageBody()));
    assert.equal(closestMembers(carried, finding({ value: 'q7' }))[0], 'DAC1AidType1020');
    // A ref value names a node, not a code, so Q8 does not match the member that points to it.
    assert.equal(closestMembers(carried, finding({ value: 'q8' }))[0], 'DAC1AidType1020');
    assert.notEqual(closestMembers(model, finding({ value: 'q7' }))[0], 'DAC1AidType1020');
});

test('an ISO code in a currency cell points to the member that carries it', () => {
    for (const [value, expected] of [
        ['CHF', 'CurrencyCHF'],
        ['756', 'CurrencyCHF'],
        ['EUR', 'CurrencyEUR'],
    ]) {
        const found = finding({
            property: 'currencyOfDenomination',
            code: 'value_outside_range',
            value,
        });
        assert.equal(closestMembers(model, found)[0], expected, value);
    }
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
        closestMembers(
            model,
            finding({ field: 'population_type', property: null, value: 'FinancialFlo' }),
        ),
        [],
    );
    assert.deepEqual(
        closestMembers(
            model,
            finding({ property: 'crsPurpos', subject: 'property', value: 'crsPurpos' }),
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
    const checkRows = rowsToCheck(mapping, rows).rows;
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
        findings: at([
            finding({}),
            finding({ code: 'value_outside_range' }),
            finding({ code: 'property_outside_domain', severity: 'warning' }),
        ]),
        refused: [{ index: 7, detail: 'too many' }],
    };
    assert.deepEqual(resultCounts(result), { errors: 3, warnings: 1 });
    assert.ok(resultSentence(result, 6).includes('g7'));
    assert.deepEqual(resultCounts({ findings: [], refused: [] }), { errors: 0, warnings: 0 });
});

test('the result sentence counts the rows with findings out of the rows checked', () => {
    const result = (findings: RowFinding[], refused: { index: number; detail: string }[] = []) => ({
        generations: [],
        rowCount: 11,
        findings,
        refused,
    });
    const errorsOn = (rows: number[]) => rows.flatMap((index) => at([finding({})], index));
    // Eleven errors on eight of eleven rows, one row refused.
    const eight = result(errorsOn([2, 3, 5, 6, 7, 8, 9, 9, 9, 10]), [{ index: 10, detail: 'no' }]);
    assert.equal(flaggedRowCount(eight), 8);
    assert.equal(resultSentence(eight, 11), '11 errors in 8 of 11 rows.');
    assert.equal(resultSentence(result(errorsOn([0])), 3), '1 error in 1 of 3 rows.');
    assert.equal(resultSentence(result(errorsOn([0, 1])), 2), '2 errors in all 2 rows.');
    assert.equal(resultSentence(result(errorsOn([0, 0])), 1), '2 errors in 1 row.');
    assert.equal(flaggedRowCount(result([])), 0);
    assert.equal(resultSentence(result([]), 3), 'No problems in 3 rows.');
});

test('the findings CSV has a row per finding and per refused row, under the column header', () => {
    const mapping = mapHeaders(model, ['source_code', 'populationType', 'dac1AidType']);
    const lines = findingLines(
        model,
        mapping,
        SHEET_ROWS,
        at([
            finding({}),
            finding({
                field: 'dcid',
                property: null,
                value: 'X',
                served: 'Y',
                code: 'definition_differs',
                severity: 'warning',
            }),
        ]),
    );
    const rows = findingsCsvRows(lines, [{ index: 7, detail: 'too many ids' }], SHEET_ROWS);
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
    const lines = findingLines(model, mapping, SHEET_ROWS, [
        ...at([finding({}), finding({ severity: 'warning', code: 'property_outside_domain' })]),
        ...at([finding({ severity: 'warning', code: 'property_outside_domain' })], 4),
        ...at([finding({ field: 'stat_type', property: null })], 5),
        // An index past the checked rows places on no row.
        ...at([finding({})], 99),
    ]);
    const marks = sheetMarks(
        lines,
        [
            { index: 7, detail: 'too many' },
            { index: 99, detail: 'too many' },
        ],
        SHEET_ROWS,
    );
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
