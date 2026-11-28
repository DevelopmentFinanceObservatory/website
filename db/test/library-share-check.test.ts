import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';

import type { SharesBackend } from '../../src/lib/chat/apisShares.ts';
import { componentRead, DATASET_FRAME } from '../../src/lib/studio/test/fixtures/component-read.ts';
import { applyMigrations } from '../apply-migrations.ts';
import {
    beforeDeadline,
    checkArtifact,
    checkLibraryShares,
    FAILURE_EVENT,
    guardCheck,
    OK_EVENT,
    readLiveArtifacts,
    SUMMARY_EVENT,
    type Failure,
    type LiveArtifact,
} from '../library-share-check.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');
const APIS = 'https://apis.example';
const SHARE = 'Ab3dEf7h';
const ARTIFACT: LiveArtifact = { id: 'art_1', slug: 'health-oda', shareId: SHARE };

type Slot = {
    slot: number;
    card: { component_id: string; revision: number; frame: unknown } | null;
};

const FILLED: Slot[] = [
    { slot: 1, card: { component_id: 'cmp_a', revision: 2, frame: DATASET_FRAME } },
    { slot: 2, card: { component_id: 'cmp_b', revision: 1, frame: DATASET_FRAME } },
    { slot: 3, card: null },
];

// A canvas whose payload draws a chart from slot 1 and a text card. Slot 2
// holds a card the payload does not draw, and slot 3 is empty.
const record = ({
    id = SHARE,
    mode = 'live',
    slots = FILLED,
    payload = {
        widgets: [
            { id: 'c1', kind: 'chart', chartType: 'line', turn: 1, slot: 0 },
            { id: 'n1', kind: 'text', turn: 1, title: 'Note', body: 'Words' },
        ],
    },
}: { id?: string; mode?: 'live' | 'snapshot'; slots?: Slot[]; payload?: unknown } = {}) => ({
    id,
    kind: 'canvas',
    mode,
    title: 'Health ODA',
    revision: 1,
    slots,
    payload,
    created_at: '2026-11-01T10:00:00Z',
});

// dfo-apis' slot card: the recorded component read of a dataset chart.
// `undrawable` keeps the envelope and empties the component it resolves.
const card = ({ undrawable = false } = {}) => {
    const body = componentRead('cmp_a', 2, DATASET_FRAME);

    if (undrawable) {
        body['resolved_payload'].component = {};
    }

    return Response.json({ ...body, freshness: 'current', retention: null });
};

type Answer = Response | 'no answer' | 'hang';
type Route = 'share' | 'card' | 'data';
type Answers = {
    [route in Route]?: (slot: number | null, read: number, shareId: string) => Answer;
};

const routeOf = (url: URL): { route: Route; slot: number | null } => {
    const match = /\/slots\/(\d+)(\/data)?$/.exec(url.pathname);

    return match
        ? { route: match[2] ? 'data' : 'card', slot: Number(match[1]) }
        : { route: 'share', slot: null };
};

const problem = (status: number, code: string, retryable = false) =>
    Response.json({ code, retryable }, { status });
const rows = (count: number) =>
    Response.json({ rows: Array.from({ length: count }, (_, i) => ({ year: 2020 + i })) });

const DEFAULTS: { [route in Route]: (shareId: string) => Answer } = {
    share: (id) => Response.json(record({ id })),
    card: () => card(),
    data: () => rows(3),
};

// A request dfo-apis never answers, which ends when its signal aborts.
const hung = (signal: AbortSignal | null | undefined): Promise<Response> =>
    new Promise((_, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);
        }

        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    });

// A dfo-apis answering each route by `answers`, or by DEFAULTS. Each answer
// is told the slot, how many times this URL was read before, and the share.
// A request whose signal has aborted fails, as fetch's does.
const backendOf = (answers: Answers = {}) => {
    const reads: string[] = [];
    const backend: SharesBackend = {
        base: APIS,
        nameCaller: () => {},
        fetch: async (input, init) => {
            if (init?.signal?.aborted) {
                throw init.signal.reason;
            }

            const url = new URL(String(input));
            const { route, slot } = routeOf(url);
            const path = `${url.pathname}${url.search}`;
            const before = reads.filter((read) => read === path).length;
            const shareId = url.pathname.split('/')[4] ?? '';

            reads.push(path);

            const answer = answers[route]?.(slot, before, shareId) ?? DEFAULTS[route](shareId);

            if (answer === 'no answer') {
                throw new TypeError('fetch failed');
            }

            if (answer === 'hang') {
                return hung(init?.signal);
            }

            return answer;
        },
    };

    return { backend, reads: () => [...reads] };
};

// A body that starts and then fails: `name` is the error the read meets.
const brokenBody = (name: 'TimeoutError' | 'TypeError') =>
    new Response(
        new ReadableStream({
            start(controller) {
                controller.enqueue(new TextEncoder().encode('{"rows":['));
                controller.error(
                    name === 'TimeoutError'
                        ? new DOMException('The operation timed out.', 'TimeoutError')
                        : new TypeError('terminated'),
                );
            },
        }),
        { headers: { 'content-type': 'application/json' } },
    );

const shareRead = { read: 'share', slot: null, widget: null } as const;
const cardRead = { read: 'card', slot: 1, widget: 'c1' } as const;
const dataRead = { read: 'data', slot: 1, widget: null } as const;

test('each read is classified by what dfo-apis answers', async (t) => {
    const cases: { name: string; answers: Answers; failures: Failure[] }[] = [
        { name: 'a live slot with rows reads', answers: {}, failures: [] },
        {
            name: 'a snapshot slot with no rows reads',
            answers: {
                share: () => Response.json(record({ mode: 'snapshot' })),
                data: () => rows(0),
            },
            failures: [],
        },
        {
            name: 'a share dfo-apis does not hold is gone, with its code',
            answers: { share: () => problem(404, 'not_found') },
            failures: [
                {
                    ...shareRead,
                    class: 'share_gone',
                    status: 404,
                    code: 'not_found',
                    retryable: false,
                },
            ],
        },
        {
            name: 'a 404 without a problem body keeps the code it reads as',
            answers: { share: () => new Response('gone', { status: 404 }) },
            failures: [
                {
                    ...shareRead,
                    class: 'share_gone',
                    status: 404,
                    code: 'backend_refused',
                    retryable: false,
                },
            ],
        },
        {
            name: 'a card the page draws from an empty slot',
            answers: {
                share: () =>
                    Response.json(record({ slots: [{ slot: 1, card: null }, ...FILLED.slice(1)] })),
            },
            failures: [
                {
                    ...cardRead,
                    class: 'empty_slot',
                    status: null,
                    code: 'slot_empty',
                    retryable: false,
                },
            ],
        },
        {
            name: 'a live data card that names no slot',
            answers: {
                share: () =>
                    Response.json(
                        record({ payload: { widgets: [{ id: 't1', kind: 'table', turn: 1 }] } }),
                    ),
            },
            failures: [
                {
                    read: 'card',
                    slot: null,
                    widget: 't1',
                    class: 'empty_slot',
                    status: null,
                    code: 'no_slot',
                    retryable: false,
                },
            ],
        },
        {
            name: 'a card the canvas hides is not read, beside a shown card that fails',
            answers: {
                // An older live card the latest turn replaced holds no slot.
                share: () =>
                    Response.json(
                        record({
                            payload: {
                                widgets: [
                                    { id: 'old', kind: 'chart', chartType: 'line', turn: 1 },
                                    {
                                        id: 'c1',
                                        kind: 'chart',
                                        chartType: 'line',
                                        turn: 2,
                                        slot: 0,
                                    },
                                ],
                                pinnedIds: [],
                            },
                        }),
                    ),
                card: () => card({ undrawable: true }),
            },
            failures: [
                {
                    ...cardRead,
                    class: 'undrawable',
                    status: 200,
                    code: 'card_undrawable',
                    retryable: false,
                },
            ],
        },
        {
            name: 'a slot card the page cannot draw, beside rows that export',
            answers: { card: () => card({ undrawable: true }) },
            failures: [
                {
                    ...cardRead,
                    class: 'undrawable',
                    status: 200,
                    code: 'card_undrawable',
                    retryable: false,
                },
            ],
        },
        {
            name: 'a slot card outside the component read shape',
            answers: { card: () => Response.json({ component_id: 'cmp_a' }) },
            failures: [
                {
                    ...cardRead,
                    class: 'refused',
                    status: null,
                    code: 'backend_invalid',
                    retryable: false,
                },
            ],
        },
        {
            name: 'a slot card whose frame cannot be drawn, for now',
            answers: { card: () => problem(404, 'frame_unavailable', true) },
            failures: [
                {
                    ...cardRead,
                    class: 'frame_unavailable',
                    status: 404,
                    code: 'frame_unavailable',
                    retryable: true,
                },
            ],
        },
        {
            name: 'slot rows whose frame is revoked',
            answers: { data: () => problem(404, 'frame_unavailable', false) },
            failures: [
                {
                    ...dataRead,
                    class: 'frame_unavailable',
                    status: 404,
                    code: 'frame_unavailable',
                    retryable: false,
                },
            ],
        },
        {
            name: 'a live slot with no rows',
            answers: { data: () => rows(0) },
            failures: [
                { ...dataRead, class: 'no_rows', status: 200, code: 'no_rows', retryable: false },
            ],
        },
        {
            name: 'slot rows that arrive but are not JSON',
            answers: { data: () => new Response('<html>', { status: 200 }) },
            failures: [
                {
                    ...dataRead,
                    class: 'refused',
                    status: 200,
                    code: 'backend_invalid',
                    retryable: false,
                },
            ],
        },
        {
            name: 'slot rows that stop at the deadline',
            answers: { data: () => brokenBody('TimeoutError') },
            failures: [
                {
                    ...dataRead,
                    class: 'transient',
                    status: null,
                    code: 'backend_timeout',
                    retryable: true,
                },
            ],
        },
        {
            name: 'a slot card cut off mid-body',
            answers: { card: () => brokenBody('TypeError') },
            failures: [
                {
                    ...cardRead,
                    class: 'transient',
                    status: null,
                    code: 'backend_unreachable',
                    retryable: true,
                },
            ],
        },
        {
            name: 'a data card whose slot records no frame',
            answers: {
                share: () =>
                    Response.json(
                        record({
                            slots: [
                                {
                                    slot: 1,
                                    card: { component_id: 'cmp_a', revision: 2, frame: null },
                                },
                            ],
                        }),
                    ),
            },
            failures: [
                { ...dataRead, class: 'refused', status: null, code: 'no_frame', retryable: false },
            ],
        },
        {
            name: 'any other refusal of a slot',
            answers: { data: () => problem(404, 'not_found') },
            failures: [
                { ...dataRead, class: 'refused', status: 404, code: 'not_found', retryable: false },
            ],
        },
        {
            name: 'a passing server fault reading the share',
            answers: { share: () => problem(503, 'service_unavailable', true) },
            failures: [
                {
                    ...shareRead,
                    class: 'transient',
                    status: 503,
                    code: 'service_unavailable',
                    retryable: true,
                },
            ],
        },
        {
            name: 'a server fault dfo-apis marks lasting',
            answers: { data: () => problem(500, 'internal_error', false) },
            failures: [
                {
                    ...dataRead,
                    class: 'transient',
                    status: 500,
                    code: 'internal_error',
                    retryable: false,
                },
            ],
        },
        {
            name: "a gateway's 502 with no problem document",
            answers: { data: () => new Response('Bad Gateway', { status: 502 }) },
            failures: [
                {
                    ...dataRead,
                    class: 'transient',
                    status: 502,
                    code: 'backend_refused',
                    retryable: true,
                },
            ],
        },
        {
            name: 'a rate limit on a slot',
            answers: { data: () => problem(429, 'rate_limited') },
            failures: [
                {
                    ...dataRead,
                    class: 'transient',
                    status: 429,
                    code: 'rate_limited',
                    retryable: true,
                },
            ],
        },
        {
            name: 'no answer from a slot',
            answers: { card: () => 'no answer' },
            failures: [
                {
                    ...cardRead,
                    class: 'transient',
                    status: null,
                    code: 'backend_unreachable',
                    retryable: true,
                },
            ],
        },
    ];

    for (const { name, answers, failures } of cases) {
        await t.test(name, async () => {
            const { backend } = backendOf(answers);

            assert.deepEqual((await checkArtifact(backend, ARTIFACT)).failures, failures);
        });
    }
});

test("the reads are the page's: each card it draws from a slot, then each slot's rows", async (t) => {
    const share = `/api/presentation/shares/${SHARE}`;
    const cases: { name: string; answers: Answers; reads: string[] }[] = [
        {
            name: "the payload's slotted cards",
            answers: {},
            reads: [share, `${share}/slots/1`, `${share}/slots/1/data?format=json&bundle=false`],
        },
        {
            name: 'every filled slot when the payload holds no widgets',
            answers: { share: () => Response.json(record({ payload: null })) },
            reads: [
                share,
                `${share}/slots/1`,
                `${share}/slots/2`,
                `${share}/slots/1/data?format=json&bundle=false`,
                `${share}/slots/2/data?format=json&bundle=false`,
            ],
        },
    ];

    for (const { name, answers, reads: expected } of cases) {
        await t.test(name, async () => {
            const { backend, reads } = backendOf(answers);

            assert.deepEqual((await checkArtifact(backend, ARTIFACT)).failures, []);
            assert.deepEqual(reads(), expected);
        });
    }
});

const artifact = (n: number): LiveArtifact => ({
    id: `art_${n}`,
    slug: `artifact-${n}`,
    shareId: `Share00${n}`,
});

// Runs the check over `artifacts` against `answers`, with a clock that
// moves 5 ms each time it is read. `onWait` runs when the run waits to read
// again.
const run = async (
    artifacts: LiveArtifact[],
    answers: Answers,
    { deadline, onWait }: { deadline?: AbortSignal; onWait?: () => void } = {},
) => {
    const { backend, reads } = backendOf(answers);
    const lines: Record<string, unknown>[] = [];
    const waits: number[] = [];
    let clock = 0;
    const code = await checkLibraryShares({
        artifacts,
        backend,
        log: (line) => lines.push(JSON.parse(line)),
        deadline,
        retryDelayMs: 7,
        wait: async (ms) => {
            waits.push(ms);
            onWait?.();
        },
        now: () => (clock += 5),
    });

    return { code, reads: reads(), lines, waits };
};

const summaryOf = (lines: Record<string, unknown>[]) => {
    const summary = lines.at(-1);

    assert.equal(summary?.['event'], SUMMARY_EVENT);

    return summary ?? {};
};

test('a retryable failure is read again, alone, and the second read stands', async () => {
    // Slot 1's card is drawable on its second read only.
    const { code, reads, lines, waits } = await run([artifact(1)], {
        card: (_slot, before) => (before === 0 ? problem(404, 'frame_unavailable', true) : card()),
    });
    const share = '/api/presentation/shares/Share001';

    assert.equal(code, 0);
    assert.deepEqual(waits, [7]);
    assert.deepEqual(reads, [
        share,
        `${share}/slots/1`,
        `${share}/slots/1/data?format=json&bundle=false`,
        `${share}/slots/1`,
    ]);
    assert.deepEqual(
        lines.map((line) => line['event']),
        [OK_EVENT, SUMMARY_EVENT],
    );

    const summary = summaryOf(lines);

    assert.deepEqual(
        { ok: summary['ok'], failed: summary['failed'], retried: summary['retried'] },
        { ok: 1, failed: 0, retried: 1 },
    );
});

test('a failure no second read would change is logged at once and not read again', async () => {
    const { code, reads, lines, waits } = await run([artifact(1)], {
        data: () => problem(404, 'frame_unavailable', false),
    });

    assert.equal(code, 1);
    assert.deepEqual(waits, []);
    assert.equal(reads.length, 3);
    assert.deepEqual(
        lines.map((line) => [line['event'], line['class']]),
        [
            [FAILURE_EVENT, 'frame_unavailable'],
            [SUMMARY_EVENT, undefined],
        ],
    );
});

test('each artifact is logged as it finishes, and the summary counts the run', async () => {
    const { code, lines } = await run([artifact(1), artifact(2), artifact(3)], {});

    assert.equal(code, 0);

    const finished = lines.filter((line) => line['event'] === OK_EVENT);

    assert.deepEqual(finished.map((line) => line['slug']).toSorted(), [
        'artifact-1',
        'artifact-2',
        'artifact-3',
    ]);

    const summary = summaryOf(lines);

    assert.equal(summary['requests'], 9);
    assert.ok(typeof summary['bytes'] === 'number' && summary['bytes'] > 0);
    assert.equal(summary['durationMs'], 5);
});

test('a failure that remains is logged per failure and fails the run', async () => {
    const { code, lines } = await run([artifact(1), artifact(2)], {
        share: (_slot, before, id) =>
            before === 0
                ? 'no answer'
                : Response.json(record({ id, slots: [{ slot: 1, card: null }] })),
    });

    assert.equal(code, 1);

    // Two workers finish in either order.
    const failures = lines
        .filter((line) => line['event'] === FAILURE_EVENT)
        .toSorted((a, b) => String(a['artifact']).localeCompare(String(b['artifact'])));

    assert.deepEqual(
        failures.map(
            ({ severity, artifact: id, slug, result, read, slot, widget, class: kind, code }) => ({
                severity,
                id,
                slug,
                result,
                read,
                slot,
                widget,
                kind,
                code,
            }),
        ),
        ['art_1', 'art_2'].map((id, i) => ({
            severity: 'ERROR',
            id,
            slug: `artifact-${i + 1}`,
            result: 'failed',
            read: 'card',
            slot: 1,
            widget: 'c1',
            kind: 'empty_slot',
            code: 'slot_empty',
        })),
    );

    // No line carries a share id.
    assert.ok(lines.every((line) => !/Share00\d/.test(JSON.stringify(line))));

    const summary = summaryOf(lines);

    assert.equal(summary['severity'], 'ERROR');
    assert.deepEqual(
        { ok: summary['ok'], failed: summary['failed'], retried: summary['retried'] },
        { ok: 0, failed: 2, retried: 2 },
    );
});

test('a share whose canvas fields are malformed reads as the viewers read it, beside one that reads', async () => {
    const { code, lines } = await run([artifact(1), artifact(2)], {
        share: (_slot, _before, id) =>
            Response.json(
                id === 'Share002'
                    ? record({
                          id,
                          payload: {
                              widgets: [
                                  { id: 'c1', kind: 'chart', chartType: 'line', turn: 1, slot: 0 },
                              ],
                              pinnedIds: null,
                              canvas: { compositionId: 'cmp' },
                              textCards: 'none',
                          },
                      })
                    : record({ id }),
            ),
    });

    assert.equal(code, 0);
    assert.deepEqual(
        lines
            .filter((line) => line['event'] === OK_EVENT)
            .map((line) => line['slug'])
            .toSorted(),
        ['artifact-1', 'artifact-2'],
    );
});

test('a run past its deadline logs what it left unfinished, then its summary', async (t) => {
    type Outcome = [slug: unknown, result: unknown, kind: unknown];
    const cases: {
        name: string;
        artifacts: number[];
        answers: (abort: () => void) => Answers;
        abortOnWait?: boolean;
        outcomes: Outcome[];
        reads: number;
        summary: { ok: number; unfinished: number; retried: number };
    }[] = [
        {
            name: 'reads in flight are cut off, and an artifact not started is left',
            artifacts: [1, 2, 3, 4, 5, 6],
            // Artifact 1 reads; 2 to 4 wait on their shares, and the deadline
            // passes as 5, which starts once 1 is done, asks for its share.
            answers: (abort) => ({
                share: (_slot, _before, id) => {
                    if (id === 'Share001') {
                        return Response.json(record({ id }));
                    }

                    if (id === 'Share005') {
                        abort();
                    }

                    return 'hang';
                },
            }),
            outcomes: [
                ['artifact-1', 'ok', null],
                ...[2, 3, 4, 5, 6].map((n): Outcome => [
                    `artifact-${n}`,
                    'unfinished',
                    'unfinished',
                ]),
            ],
            // Artifact 1's three, and the shares of 2 to 5.
            reads: 7,
            summary: { ok: 1, unfinished: 5, retried: 0 },
        },
        {
            name: 'a deadline during the wait leaves the second reads unmade',
            artifacts: [1],
            answers: () => ({
                card: () => problem(404, 'frame_unavailable', true),
                data: () => problem(404, 'frame_unavailable', false),
            }),
            abortOnWait: true,
            // Both failures met before the deadline stand.
            outcomes: [
                ['artifact-1', 'failed', 'frame_unavailable'],
                ['artifact-1', 'failed', 'frame_unavailable'],
                ['artifact-1', 'unfinished', 'unfinished'],
            ],
            reads: 3,
            summary: { ok: 0, unfinished: 1, retried: 0 },
        },
        {
            name: 'a second read the deadline cuts off keeps its first, beside one that ended',
            artifacts: [1],
            answers: (abort) => ({
                card: () => problem(503, 'service_unavailable', true),
                data: (_slot, before) => {
                    if (before === 0) {
                        return problem(503, 'service_unavailable', true);
                    }

                    abort();

                    return 'hang';
                },
            }),
            outcomes: [
                ['artifact-1', 'failed', 'transient'],
                ['artifact-1', 'failed', 'transient'],
                ['artifact-1', 'unfinished', 'unfinished'],
            ],
            reads: 5,
            summary: { ok: 0, unfinished: 1, retried: 2 },
        },
    ];

    for (const { name, artifacts, answers, abortOnWait, outcomes, reads: made, summary } of cases) {
        await t.test(name, async () => {
            const deadline = new AbortController();
            const abort = () => deadline.abort();
            const { code, reads, lines } = await run(artifacts.map(artifact), answers(abort), {
                deadline: deadline.signal,
                onWait: abortOnWait ? abort : undefined,
            });

            assert.equal(code, 1);
            assert.equal(reads.length, made);
            assert.deepEqual(
                lines
                    .filter((line) => line['event'] !== SUMMARY_EVENT)
                    .map((line): Outcome => [line['slug'], line['result'], line['class'] ?? null])
                    .toSorted((a, b) => String(a[0]).localeCompare(String(b[0]))),
                outcomes,
            );

            const last = summaryOf(lines);

            assert.deepEqual(
                { ok: last['ok'], unfinished: last['unfinished'], retried: last['retried'] },
                summary,
            );
        });
    }
});

test('a Library with no published artifact reads nothing and passes', async () => {
    const { code, reads, waits, lines } = await run([], {});

    assert.equal(code, 0);
    assert.deepEqual(reads, []);
    assert.deepEqual(waits, []);
    assert.equal(lines.length, 1);
    assert.equal(summaryOf(lines)['artifacts'], 0);
});

test('a run that cannot run logs one failure line and fails', async (t) => {
    const cases: { name: string; error: unknown; code: string }[] = [
        {
            name: 'a database error keeps its code',
            error: Object.assign(new Error('password authentication failed'), { code: '28P01' }),
            code: '28P01',
        },
        {
            name: 'a missing setting is named by its error',
            error: new Error('missing required environment variable SEARCH_API_BASE'),
            code: 'Error',
        },
    ];

    for (const { name, error, code } of cases) {
        await t.test(name, async () => {
            const lines: Record<string, unknown>[] = [];
            const exit = await guardCheck(
                async () => {
                    throw error;
                },
                (line) => lines.push(JSON.parse(line)),
            );

            assert.equal(exit, 1);
            assert.equal(lines.length, 1);
            assert.deepEqual(
                {
                    severity: lines[0]?.['severity'],
                    event: lines[0]?.['event'],
                    class: lines[0]?.['class'],
                    code: lines[0]?.['code'],
                },
                { severity: 'ERROR', event: FAILURE_EVENT, class: 'check_failed', code },
            );
        });
    }

    await t.test('a step that outlasts the deadline fails as run_deadline', async () => {
        const lines: Record<string, unknown>[] = [];
        const exit = await guardCheck(
            () => beforeDeadline(new Promise<0 | 1>(() => {}), AbortSignal.abort()),
            (line) => lines.push(JSON.parse(line)),
        );

        assert.equal(exit, 1);
        assert.deepEqual(
            lines.map((line) => [line['class'], line['code']]),
            [['check_failed', 'run_deadline']],
        );
    });

    await t.test("a run that ends gives the run's exit code and logs nothing", async () => {
        const lines: string[] = [];

        assert.equal(
            await guardCheck(
                async () => 0,
                (line) => lines.push(line),
            ),
            0,
        );
        assert.deepEqual(lines, []);
    });
});

test('the runtime role lists every published artifact and no withdrawn one', async (t) => {
    const database = await createTestDatabase();

    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    const admin = database.adminPool();

    await admin.query(
        `insert into library_artifact
           (id, slug, publish_key, share_id, kind, mode, title, description, published_at, withdrawn_at)
         values
           ('art_b', 'second', 'key_b', 'Share002', 'chart', 'live', 'B', 'b', '2026-11-02', null),
           ('art_w', 'withdrawn', 'key_w', 'Share003', 'chart', 'live', 'W', 'w', '2026-11-01', now()),
           ('art_a', 'first', 'key_a', 'Share001', 'table', 'snapshot', 'A', 'a', '2026-11-01', null)`,
    );

    assert.deepEqual(await readLiveArtifacts(drizzle(database.runtimePool())), [
        { id: 'art_a', slug: 'first', shareId: 'Share001' },
        { id: 'art_b', slug: 'second', shareId: 'Share002' },
    ]);
});
