import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { drizzle } from 'drizzle-orm/node-postgres';

import type { SharesBackend } from '../../src/lib/chat/apisShares.ts';
import { applyMigrations } from '../apply-migrations.ts';
import {
    checkArtifact,
    checkLibraryShares,
    FAILURE_EVENT,
    guardCheck,
    readLiveArtifacts,
    SUMMARY_EVENT,
    type ArtifactCheck,
    type Failure,
    type LiveArtifact,
} from '../library-share-check.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');
const APIS = 'https://apis.example';
const SHARE = 'Ab3dEf7h';
const ARTIFACT: LiveArtifact = { id: 'art_1', slug: 'health-oda', shareId: SHARE };
const FRAME = { spec_id: 'spec_aid', content_version: 'cv_1' };

type Slot = {
    slot: number;
    card: { component_id: string; revision: number; frame: unknown } | null;
};

// A canvas whose payload draws a chart from slot 1 and a text widget. Slot
// 2 holds a card the payload does not draw, and slot 3 is empty.
const record = ({
    mode = 'live',
    slots = [
        { slot: 1, card: { component_id: 'cmp_a', revision: 2, frame: FRAME } },
        { slot: 2, card: { component_id: 'cmp_b', revision: 1, frame: FRAME } },
        { slot: 3, card: null },
    ],
    payload = {
        widgets: [
            { id: 'w1', kind: 'chart', turn: 1, slot: 0 },
            { id: 'w2', kind: 'text', turn: 1 },
        ],
    },
}: { mode?: 'live' | 'snapshot'; slots?: Slot[]; payload?: unknown } = {}) => ({
    id: SHARE,
    kind: 'canvas',
    mode,
    title: 'Health ODA',
    slots,
    payload,
    created_at: '2026-11-01T10:00:00Z',
});

// A slot card in dfo-apis' component read shape, of card type `type`.
const card = (type = 'line_chart') =>
    Response.json({
        component_id: 'cmp_a',
        revision: 2,
        stored_intent: { type, frame_ref: FRAME },
        resolved_payload: { component: {} },
        fact_summary: { changed: [], series: [] },
        freshness: 'current',
    });

type Answer = Response | 'no answer';
type Route = 'share' | 'card' | 'data';

const routeOf = (url: URL): { route: Route; slot: number | null } => {
    const match = /\/slots\/(\d+)(\/data)?$/.exec(url.pathname);

    return match
        ? { route: match[2] ? 'data' : 'card', slot: Number(match[1]) }
        : { route: 'share', slot: null };
};

const backendOf = (answers: { [route in Route]?: (slot: number | null) => Answer }) => {
    const reads: string[] = [];
    const backend: SharesBackend = {
        base: APIS,
        nameCaller: () => {},
        fetch: async (input) => {
            const url = new URL(String(input));
            const { route, slot } = routeOf(url);

            reads.push(`${url.pathname}${url.search}`);

            const answer = (answers[route] ?? (() => DEFAULTS[route]()))(slot);

            if (answer === 'no answer') {
                throw new TypeError('fetch failed');
            }

            return answer;
        },
    };

    return { backend, reads };
};

const problem = (status: number, code: string) => Response.json({ code }, { status });
const rows = (count: number) =>
    Response.json({ rows: Array.from({ length: count }, (_, i) => ({ year: 2020 + i })) });

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

const DEFAULTS: { [route in Route]: () => Answer } = {
    share: () => Response.json(record()),
    card: () => card(),
    data: () => rows(3),
};

test('each read is classified by what dfo-apis answers', async (t) => {
    const cases: {
        name: string;
        answers: { [route in Route]?: (slot: number | null) => Answer };
        failures: Failure[];
    }[] = [
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
            failures: [{ class: 'share_gone', slot: null, status: 404, code: 'not_found' }],
        },
        {
            name: 'a 404 without a problem body keeps the code it reads as',
            answers: { share: () => new Response('gone', { status: 404 }) },
            failures: [{ class: 'share_gone', slot: null, status: 404, code: 'backend_refused' }],
        },
        {
            name: 'a slot card whose frame cannot be drawn',
            answers: { card: () => problem(404, 'frame_unavailable') },
            failures: [
                { class: 'frame_unavailable', slot: 1, status: 404, code: 'frame_unavailable' },
            ],
        },
        {
            name: 'slot rows whose frame cannot be drawn',
            answers: { data: () => problem(404, 'frame_unavailable') },
            failures: [
                { class: 'frame_unavailable', slot: 1, status: 404, code: 'frame_unavailable' },
            ],
        },
        {
            name: 'a live slot with no rows',
            answers: { data: () => rows(0) },
            failures: [{ class: 'no_rows', slot: 1, status: 200, code: 'no_rows' }],
        },
        {
            name: 'slot rows that arrive but are not JSON',
            answers: { data: () => new Response('<html>', { status: 200 }) },
            failures: [{ class: 'refused', slot: 1, status: 200, code: 'backend_invalid' }],
        },
        {
            name: 'slot rows that stop at the deadline',
            answers: { data: () => brokenBody('TimeoutError') },
            failures: [{ class: 'transient', slot: 1, status: null, code: 'backend_timeout' }],
        },
        {
            name: 'slot rows cut off mid-body',
            answers: { data: () => brokenBody('TypeError') },
            failures: [{ class: 'transient', slot: 1, status: null, code: 'backend_unreachable' }],
        },
        {
            name: 'a slot card cut off mid-body',
            answers: { card: () => brokenBody('TypeError') },
            failures: [{ class: 'transient', slot: 1, status: null, code: 'backend_unreachable' }],
        },
        {
            name: 'a slot card the page cannot draw',
            answers: { card: () => Response.json({ component_id: 'cmp_a' }) },
            failures: [{ class: 'refused', slot: 1, status: null, code: 'backend_invalid' }],
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
            failures: [{ class: 'refused', slot: 1, status: null, code: 'no_frame' }],
        },
        {
            name: 'any other refusal of a slot',
            answers: { data: () => problem(404, 'not_found') },
            failures: [{ class: 'refused', slot: 1, status: 404, code: 'not_found' }],
        },
        {
            name: 'a server fault reading the share',
            answers: { share: () => problem(503, 'transient_unavailable') },
            failures: [
                { class: 'transient', slot: null, status: 503, code: 'transient_unavailable' },
            ],
        },
        {
            name: 'a rate limit on a slot',
            answers: { data: () => problem(429, 'rate_limited') },
            failures: [{ class: 'transient', slot: 1, status: 429, code: 'rate_limited' }],
        },
        {
            name: 'no answer from a slot',
            answers: { card: () => 'no answer' },
            failures: [{ class: 'transient', slot: 1, status: null, code: 'backend_unreachable' }],
        },
    ];

    for (const { name, answers, failures } of cases) {
        await t.test(name, async () => {
            const { backend } = backendOf(answers);

            assert.deepEqual(await checkArtifact(backend, ARTIFACT), {
                artifact: ARTIFACT,
                failures,
            });
        });
    }
});

test('the slots the page draws are read, each card and then its rows as JSON', async (t) => {
    const share = `/api/presentation/shares/${SHARE}`;
    const cases: { name: string; answers: Parameters<typeof backendOf>[0]; reads: string[] }[] = [
        {
            name: "the payload's slotted widgets",
            answers: {},
            reads: [share, `${share}/slots/1`, `${share}/slots/1/data?format=json&bundle=false`],
        },
        {
            name: 'every filled slot when the payload holds no widgets',
            answers: { share: () => Response.json(record({ payload: null })) },
            reads: [
                share,
                `${share}/slots/1`,
                `${share}/slots/1/data?format=json&bundle=false`,
                `${share}/slots/2`,
                `${share}/slots/2/data?format=json&bundle=false`,
            ],
        },
        {
            name: 'a note card by its type, with no rows read',
            answers: { card: () => card('note_narration') },
            reads: [share, `${share}/slots/1`],
        },
        {
            name: 'a source card by its type, with no rows read',
            answers: { card: () => card('source_card') },
            reads: [share, `${share}/slots/1`],
        },
    ];

    for (const { name, answers, reads: expected } of cases) {
        await t.test(name, async () => {
            const { backend, reads } = backendOf(answers);
            const result = await checkArtifact(backend, ARTIFACT);

            assert.deepEqual(result.failures, []);
            assert.deepEqual(reads, expected);
        });
    }
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

const artifact = (n: number): LiveArtifact => ({
    id: `art_${n}`,
    slug: `artifact-${n}`,
    shareId: `Share00${n}`,
});

const transient: Failure = {
    class: 'transient',
    slot: 1,
    status: 503,
    code: 'transient_unavailable',
};
const gone: Failure = { class: 'share_gone', slot: null, status: 404, code: 'not_found' };

// Runs the check over `artifacts` with each read answering the next of
// `answers[id]`, the last answer repeating.
const run = async (artifacts: LiveArtifact[], answers: Record<string, Failure[][]>) => {
    const reads: string[] = [];
    const lines: Record<string, unknown>[] = [];
    const waits: number[] = [];
    const code = await checkLibraryShares({
        artifacts,
        check: async (a): Promise<ArtifactCheck> => {
            const seen = reads.filter((id) => id === a.id).length;
            const list = answers[a.id] ?? [[]];

            reads.push(a.id);

            return { artifact: a, failures: list[Math.min(seen, list.length - 1)] };
        },
        log: (line) => lines.push(JSON.parse(line)),
        retryDelayMs: 7,
        wait: async (ms) => waits.push(ms),
    });

    return { code, reads, lines, waits };
};

test('a transient failure is read again once, and the second read stands', async () => {
    const { code, reads, lines, waits } = await run([artifact(1), artifact(2)], {
        art_1: [[transient], []],
    });

    assert.equal(code, 0);
    assert.deepEqual(reads.toSorted(), ['art_1', 'art_1', 'art_2']);
    assert.deepEqual(waits, [7]);
    assert.deepEqual(lines, [
        {
            severity: 'INFO',
            event: SUMMARY_EVENT,
            message: lines[0]?.['message'],
            artifacts: 2,
            ok: 2,
            failed: 0,
            retried: 1,
            failures: { share_gone: 0, frame_unavailable: 0, no_rows: 0, refused: 0, transient: 0 },
        },
    ]);
});

test('a failure that remains is logged per failure and fails the run', async () => {
    const { code, reads, lines } = await run([artifact(1), artifact(2), artifact(3)], {
        art_1: [[transient]],
        art_2: [[gone]],
    });

    assert.equal(code, 1);
    // The share that is gone is not read again.
    assert.deepEqual(reads.toSorted(), ['art_1', 'art_1', 'art_2', 'art_3']);

    const failures = lines.filter((line) => line['event'] === FAILURE_EVENT);

    assert.deepEqual(
        failures.map(
            ({ severity, artifact: id, slug, share, slot, class: kind, status, code }) => ({
                severity,
                id,
                slug,
                share,
                slot,
                kind,
                status,
                code,
            }),
        ),
        [
            {
                severity: 'ERROR',
                id: 'art_1',
                slug: 'artifact-1',
                share: 'Share001',
                slot: 1,
                kind: 'transient',
                status: 503,
                code: 'transient_unavailable',
            },
            {
                severity: 'ERROR',
                id: 'art_2',
                slug: 'artifact-2',
                share: 'Share002',
                slot: null,
                kind: 'share_gone',
                status: 404,
                code: 'not_found',
            },
        ],
    );

    const summary = lines.at(-1);

    assert.equal(summary?.['event'], SUMMARY_EVENT);
    assert.equal(summary?.['severity'], 'ERROR');
    assert.deepEqual(
        { ok: summary?.['ok'], failed: summary?.['failed'], failures: summary?.['failures'] },
        {
            ok: 1,
            failed: 2,
            failures: { share_gone: 1, frame_unavailable: 0, no_rows: 0, refused: 0, transient: 1 },
        },
    );
});

test('a Library with no published artifact reads nothing and passes', async () => {
    const { code, reads, waits, lines } = await run([], {});

    assert.equal(code, 0);
    assert.deepEqual(reads, []);
    assert.deepEqual(waits, []);
    assert.equal(lines.length, 1);
    assert.equal(lines[0]?.['artifacts'], 0);
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
