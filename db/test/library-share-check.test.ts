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

// A share with a data card in slot 1, a note in slot 2 and an empty slot 3.
const record = (mode: 'live' | 'snapshot') => ({
    id: SHARE,
    kind: 'canvas',
    mode,
    title: 'Health ODA',
    slots: [
        {
            slot: 1,
            card: {
                component_id: 'cmp_a',
                revision: 2,
                frame: { spec_id: 'spec_aid', content_version: 'cv_1' },
            },
        },
        { slot: 2, card: { component_id: 'cmp_note', revision: 1, frame: null } },
        { slot: 3, card: null },
    ],
    payload: { widgets: [] },
    created_at: '2026-11-01T10:00:00Z',
});

type Answer = Response | 'no answer';

const backendOf = (share: () => Answer, slot: () => Answer) => {
    const urls: string[] = [];
    const backend: SharesBackend = {
        base: APIS,
        nameCaller: () => {},
        fetch: async (input) => {
            const url = String(input);

            urls.push(url);

            const answer = url.includes('/slots/') ? slot() : share();

            if (answer === 'no answer') {
                throw new TypeError('fetch failed');
            }

            return answer;
        },
    };

    return { backend, urls };
};

const problem = (status: number, code: string) => Response.json({ code }, { status });
const rows = (count: number) =>
    Response.json({ rows: Array.from({ length: count }, (_, i) => ({ year: 2020 + i })) });

test('each read is classified by what dfo-apis answers', async (t) => {
    const cases: {
        name: string;
        share: () => Answer;
        slot?: () => Answer;
        failures: Failure[];
    }[] = [
        {
            name: 'a live slot with rows reads',
            share: () => Response.json(record('live')),
            slot: () => rows(3),
            failures: [],
        },
        {
            name: 'a snapshot slot with no rows reads',
            share: () => Response.json(record('snapshot')),
            slot: () => rows(0),
            failures: [],
        },
        {
            name: 'a share dfo-apis no longer holds is gone',
            share: () => problem(404, 'not_found'),
            failures: [{ class: 'share_gone', slot: null, status: 404, code: 'not_found' }],
        },
        {
            name: 'a slot whose frame cannot be drawn',
            share: () => Response.json(record('snapshot')),
            slot: () => problem(404, 'frame_unavailable'),
            failures: [
                { class: 'frame_unavailable', slot: 1, status: 404, code: 'frame_unavailable' },
            ],
        },
        {
            name: 'a live slot with no rows',
            share: () => Response.json(record('live')),
            slot: () => rows(0),
            failures: [{ class: 'no_rows', slot: 1, status: 200, code: 'no_rows' }],
        },
        {
            name: 'a slot answer that holds no rows array',
            share: () => Response.json(record('live')),
            slot: () => new Response('<html>', { status: 200 }),
            failures: [{ class: 'refused', slot: 1, status: 200, code: 'backend_invalid' }],
        },
        {
            name: 'any other refusal of a slot',
            share: () => Response.json(record('live')),
            slot: () => problem(404, 'not_found'),
            failures: [{ class: 'refused', slot: 1, status: 404, code: 'not_found' }],
        },
        {
            name: 'a server fault reading the share',
            share: () => problem(503, 'transient_unavailable'),
            failures: [
                { class: 'transient', slot: null, status: 503, code: 'transient_unavailable' },
            ],
        },
        {
            name: 'a rate limit on a slot',
            share: () => Response.json(record('live')),
            slot: () => problem(429, 'rate_limited'),
            failures: [{ class: 'transient', slot: 1, status: 429, code: 'rate_limited' }],
        },
        {
            name: 'no answer from a slot',
            share: () => Response.json(record('live')),
            slot: () => 'no answer',
            failures: [{ class: 'transient', slot: 1, status: null, code: 'backend_unreachable' }],
        },
    ];

    for (const { name, share, slot = () => rows(1), failures } of cases) {
        await t.test(name, async () => {
            const { backend } = backendOf(share, slot);

            assert.deepEqual(await checkArtifact(backend, ARTIFACT), {
                artifact: ARTIFACT,
                failures,
            });
        });
    }
});

test('only a slot that draws a frame has its rows read, as JSON', async () => {
    const { backend, urls } = backendOf(
        () => Response.json(record('live')),
        () => rows(1),
    );

    await checkArtifact(backend, ARTIFACT);

    assert.deepEqual(
        urls.map((url) => new URL(url)).map((url) => `${url.pathname}${url.search}`),
        [
            `/api/presentation/shares/${SHARE}`,
            `/api/presentation/shares/${SHARE}/slots/1/data?format=json&bundle=false`,
        ],
    );
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
