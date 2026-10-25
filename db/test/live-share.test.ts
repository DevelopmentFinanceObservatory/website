import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { SavedConversation } from '../../src/lib/chat/history.ts';
import { deleteOwnedShare, insertStudioShare } from '../../src/lib/chat/shareWrites.ts';
import { dataResponse, refreshResponse, type LiveDeps } from '../../src/lib/studio/liveShare.ts';
import {
    ShareGone,
    leasedResult,
    snapshotLiveShare,
    storeResult,
    storedResult,
    takeLease,
} from '../../src/lib/studio/liveShareResults.ts';
import {
    APIS,
    DATASET_FRAME,
    DERIVED_FRAME,
    ENV,
    MOVED_FRAME,
    PRINCIPAL,
    REPLAYED_FRAME,
    aiPending,
    aiRedrawn,
    aiRefusal,
    frameAnswer,
    json,
    pendingAnswer,
    refusal,
    renderReply,
    stalled,
    stubBackend,
    type StubScript,
} from '../../src/lib/studio/test/fixtures/live-backend-stub.ts';
import { pairOf } from '../../src/lib/studio/test/fixtures/recorded-wire.ts';
import { applyMigrations } from '../apply-migrations.ts';
import { share, shareCardResult, user } from '../schema.ts';
import { createTestDatabase } from './harness.ts';

const MIGRATIONS_FOLDER = path.resolve(import.meta.dirname, '../migrations');

const CONCURRENT = 6;

const recordedHeaders = pairOf('render_data.csv').response.headers;

// The row is the browser's JSON: its `frame` names a frame no back end
// knows, and its numbers are not the stored revision's.
const ROW_FRAME = { spec_id: 'spec_from_the_browser', content_version: 'cv_row' };

const chart = (id: string, componentId?: string) => ({
    kind: 'chart' as const,
    id,
    turn: 1,
    chartType: 'line' as const,
    title: id,
    categories: ['2024'],
    series: [{ label: 'Kenya', values: [999] }],
    frame: ROW_FRAME,
    ...(componentId ? { ref: { component_id: componentId, revision: 3 } } : {}),
});

const saved = {
    id: 'conv-1',
    sessionId: null,
    title: 'Aid to Kenya',
    updatedAt: 1,
    messages: [],
    widgets: [
        chart('data', 'cmp_data'),
        chart('derived', 'cmp_derived'),
        chart('no-ref'),
        chart('removed', 'cmp_data'),
    ],
    activity: [],
    turnCount: 1,
    pinnedIds: [],
    removedIds: ['removed'],
    layout: {},
    textCards: [{ kind: 'text', id: 'note', title: 'Note', body: 'Body' }],
} as SavedConversation;

const COMPONENTS = { cmp_data: DATASET_FRAME, cmp_derived: DERIVED_FRAME };

/**
 * `refreshResponse` and `dataResponse` (src/lib/studio/liveShare.ts) on the
 * migrated tables as the runtime role, over a stubbed dfo-apis and dfo-ai:
 * which shares and cards the routes serve, the answer each back-end verdict
 * becomes, the lease that bounds back-end calls per card, the rows a card's
 * download streams, and that the credential stays on the server.
 */
test('live share routes', async (t) => {
    const database = await createTestDatabase();
    t.after(() => database.teardown());

    await applyMigrations(database.migratorPool(), {
        migrationsFolder: MIGRATIONS_FOLDER,
        runtimeDbUser: database.runtimeUser,
        migratorDbUser: database.migratorUser,
    });

    // One pool per concurrent request, since each test pool holds one
    // connection and the lease must hold across connections.
    const handles = Array.from({ length: CONCURRENT }, () => drizzle(database.runtimePool()));
    const db = handles[0]!;

    await db.insert(user).values([{ id: 'owner', name: 'Owner', email: 'owner@example.org' }]);

    const liveShare = async (kind: 'canvas' | 'card' = 'canvas', cardId?: string) =>
        (await insertStudioShare(db, { userId: 'owner', kind, mode: 'live', saved, cardId })).id;

    const over = (script: Partial<StubScript>, handle = db) => {
        const stub = stubBackend({ components: COMPONENTS, ...script });
        const deps: LiveDeps = { db: handle, env: ENV, fetch: stub.fetch };

        return { stub, deps };
    };

    const rows = (shareId: string) =>
        db.select().from(shareCardResult).where(eq(shareCardResult.shareId, shareId));

    // Move the card's stored answer past its window.
    const age = (shareId: string) =>
        db
            .update(shareCardResult)
            .set({ freshUntil: sql`now() - interval '1 second'` })
            .where(eq(shareCardResult.shareId, shareId));

    // Every response a test collects, for the credential check at the end.
    const seen: Response[] = [];
    const refresh = async (deps: LiveDeps, shareId: string, cardId: string) => {
        const res = await refreshResponse(deps, shareId, cardId);

        seen.push(res.clone());

        return { status: res.status, body: await res.json() };
    };
    const download = async (deps: LiveDeps, shareId: string, cardId: string, query = '') => {
        const res = await dataResponse(deps, shareId, cardId, new URLSearchParams(query));

        seen.push(res.clone());

        return res;
    };

    await t.test('404 unless the share is live and holds the card as a data card', async () => {
        const live = await liveShare();
        const snapshot = (
            await insertStudioShare(db, {
                userId: 'owner',
                kind: 'canvas',
                mode: 'snapshot',
                saved,
            })
        ).id;
        const conversation = (
            await insertStudioShare(db, {
                userId: 'owner',
                kind: 'conversation',
                mode: 'snapshot',
                saved,
            })
        ).id;

        await db.insert(share).values([
            { id: 'nomode00', userId: 'owner', kind: 'canvas', title: 'Old', data: saved },
            { id: 'srch0000', kind: 'search', mode: 'live', title: 'aid', data: { query: 'aid' } },
        ]);

        const { stub, deps } = over({});
        const cases: [string, string, string][] = [
            ['no such share', 'missing0', 'data'],
            ['a malformed id', 'not-an-id', 'data'],
            ['a snapshot', snapshot, 'data'],
            ['a share with no mode', 'nomode00', 'data'],
            ['a conversation share', conversation, 'data'],
            ['a live search share', 'srch0000', 'data'],
            ['no such card', live, 'elsewhere'],
            ['a text card', live, 'note'],
            ['a data card with no ref', live, 'no-ref'],
            ['a removed card', live, 'removed'],
        ];

        for (const [name, shareId, cardId] of cases) {
            const answer = await refresh(deps, shareId, cardId);

            assert.equal(answer.status, 404, name);
            assert.equal(answer.body.code, 'not_found', name);
            assert.equal(answer.body.retryable, false, name);
            assert.equal((await download(deps, shareId, cardId)).status, 404, name);
        }

        assert.equal(stub.calls.length, 0);
        assert.deepEqual(await rows(live), []);
    });

    await t.test('a card share serves its one card', async () => {
        const id = await liveShare('card', 'data');
        const { deps } = over({
            refreshFrame: () => frameAnswer('current', DATASET_FRAME),
        });

        assert.equal((await refresh(deps, id, 'data')).body.status, 'current');
        assert.equal((await refresh(deps, id, 'derived')).status, 404);
    });

    await t.test('current: the card is the stored revision’s read, not the row', async () => {
        const id = await liveShare();
        const { stub, deps } = over({
            refreshFrame: () => frameAnswer('current', DATASET_FRAME),
        });

        const answer = await refresh(deps, id, 'data');

        assert.equal(answer.status, 200);
        assert.deepEqual(Object.keys(answer.body).sort(), ['card', 'status']);
        assert.equal(answer.body.status, 'current');
        assert.deepEqual(answer.body.card.payload.provenance.inputs, [DATASET_FRAME]);
        // The frame dfo-apis checks comes from the stored intent.
        assert.deepEqual(stub.to('/frames/refresh')[0]?.body, DATASET_FRAME);
        assert.ok(!JSON.stringify(answer.body).includes(ROW_FRAME.spec_id));
        assert.ok(!JSON.stringify(answer.body).includes('999'));
    });

    await t.test('redrawn, pending, and error answers', async () => {
        const id = await liveShare();

        const moved = over({
            refreshFrame: () => frameAnswer('moved', MOVED_FRAME),
            render: () => json(renderReply('cmp_data', 3, MOVED_FRAME)),
        });
        const redrawn = await refresh(moved.deps, id, 'data');

        assert.equal(redrawn.status, 200);
        assert.equal(redrawn.body.status, 'redrawn');
        assert.deepEqual(redrawn.body.card.payload.provenance.inputs, [MOVED_FRAME]);
        assert.equal(redrawn.body.card.payload.provenance.refreshed_from, 3);
        assert.deepEqual(Object.keys(redrawn.body.card).sort(), [
            'component_id',
            'fact_summary',
            'payload',
            'revision',
        ]);

        const queued = over({
            refreshDerived: () => aiPending(7),
        });

        assert.deepEqual(await refresh(queued.deps, id, 'derived'), {
            status: 200,
            body: { status: 'pending', retry_after_s: 7 },
        });

        await age(id);

        const refused = over({
            refreshDerived: (call) => aiRefusal('recipe_missing', call),
        });

        assert.deepEqual(await refresh(refused.deps, id, 'derived'), {
            status: 200,
            body: { status: 'error', code: 'recipe_missing', retry_after_s: 30 },
        });
    });

    await t.test('pending: the recorded fractional wait is served as whole seconds', async () => {
        const id = await liveShare();
        const { deps } = over({ refreshFrame: () => pendingAnswer() });

        // dfo-apis answers 1.5; the stored answer, the route's answer, and
        // the Retry-After header of a download all hold 2.
        assert.deepEqual(await refresh(deps, id, 'data'), {
            status: 200,
            body: { status: 'pending', retry_after_s: 2 },
        });
        assert.equal((await rows(id))[0]?.retryAfterS, 2);

        const waiting = await download(deps, id, 'data');

        assert.equal(waiting.status, 503);
        assert.equal(waiting.headers.get('retry-after'), '2');
        assert.equal((await waiting.json()).retry_after_s, 2);
    });

    await t.test('no credential: an error answer and no back-end call', async () => {
        const id = await liveShare();
        const { stub, deps } = over({});
        const unset = { ...deps, env: { ...ENV, LIVE_REFRESH_PRINCIPAL: '' } };

        assert.deepEqual(await refresh(unset, id, 'data'), {
            status: 200,
            body: { status: 'error', code: 'live_unavailable' },
        });

        const file = await download(unset, id, 'data');

        assert.equal(file.status, 502);
        assert.equal((await file.json()).code, 'live_unavailable');
        assert.equal(stub.calls.length, 0);
        assert.deepEqual(await rows(id), []);
    });

    await t.test('concurrent requests for one card make one back-end call', async () => {
        const id = await liveShare();
        let gate = Promise.withResolvers<void>();
        const stub = stubBackend({
            components: COMPONENTS,
            refreshFrame: async () => {
                await gate.promise;

                return frameAnswer('current', DATASET_FRAME);
            },
        });
        const together = () =>
            handles.map((handle) =>
                refresh({ db: handle, env: ENV, fetch: stub.fetch }, id, 'data'),
            );

        // First open: one request holds the lease and waits on dfo-apis. The
        // others have no stored answer to give and are told to come back.
        const leased = async () => {
            const answers = together();
            const early = await Promise.race([
                Promise.all(answers),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 500)),
            ]);

            assert.equal(early, null, 'the lease holder is still waiting on the back end');
            gate.resolve();

            return (await Promise.all(answers))
                .map((answer) => answer.body)
                .sort((a, b) => a.status.localeCompare(b.status));
        };
        const waiting = Array(CONCURRENT - 1).fill({ status: 'pending', retry_after_s: 2 });

        assert.deepEqual(
            (await leased()).map((body) => body.status),
            ['current', ...waiting.map(({ status }) => status)],
        );
        assert.equal(stub.to('/frames/refresh').length, 1);
        assert.equal(stub.to('/components/cmp_data').length, 1);

        // Inside the window every request answers from the row.
        for (const answer of await Promise.all(together())) {
            assert.equal(answer.body.status, 'current');
        }

        assert.equal(stub.calls.length, 2);

        // Past the window one request asks again. The others are told to
        // come back rather than handed the expired card, which a viewer
        // would keep as final.
        await age(id);
        gate = Promise.withResolvers<void>();

        const [holder, ...others] = await leased();

        assert.equal(holder.status, 'current');
        assert.deepEqual(others, waiting);
        assert.equal(stub.to('/frames/refresh').length, 2);
        assert.equal(stub.to('/components/cmp_data').length, 2);
    });

    await t.test('pending and error answers stand for a short window', async () => {
        const id = await liveShare();
        const { stub, deps } = over({
            refreshFrame: () => pendingAnswer(4),
            refreshDerived: (call) => aiRefusal('recipe_missing', call),
        });
        const freshFor = async (cardId: string) => {
            const { rows: found } = await db.execute<{ seconds: number }>(
                sql`select extract(epoch from fresh_until - checked_at)::float as seconds
                    from share_card_result where share_id = ${id} and card_id = ${cardId}`,
            );

            return Math.round(found[0]!.seconds);
        };

        await refresh(deps, id, 'data');
        await refresh(deps, id, 'data');
        await refresh(deps, id, 'derived');
        await refresh(deps, id, 'derived');

        // A second request inside the window reaches no back end.
        assert.equal(stub.to('/frames/refresh').length, 1);
        assert.equal(stub.to('/api/studio/refresh').length, 1);
        assert.equal(await freshFor('data'), 4);
        assert.equal(await freshFor('derived'), 30);

        // The viewer's retry after the wait reaches the back end again.
        await age(id);
        await refresh(deps, id, 'data');
        assert.equal(stub.to('/frames/refresh').length, 2);
    });

    await t.test(
        'dfo-ai’s transient and credential refusals stand for the error window',
        async () => {
            for (const code of ['upstream_unavailable', 'unauthorized', 'refresh_not_configured']) {
                const id = await liveShare();
                const { stub, deps } = over({
                    refreshDerived: (call) => aiRefusal(code, call),
                });
                const answer = { status: 200, body: { status: 'error', code, retry_after_s: 30 } };

                assert.deepEqual(await refresh(deps, id, 'derived'), answer, code);
                assert.deepEqual(await refresh(deps, id, 'derived'), answer, code);
                assert.equal(stub.to('/api/studio/refresh').length, 1, code);

                const [{ seconds }] = (
                    await db.execute<{ seconds: number }>(
                        sql`select extract(epoch from fresh_until - checked_at)::float as seconds
                        from share_card_result where share_id = ${id} and card_id = 'derived'`,
                    )
                ).rows as [{ seconds: number }];

                assert.equal(Math.round(seconds), 30, code);

                await age(id);
                await refresh(deps, id, 'derived');
                assert.equal(stub.to('/api/studio/refresh').length, 2, code);
            }
        },
    );

    await t.test('a lease left by a request that died lapses', async () => {
        const id = await liveShare();
        const { stub, deps } = over({
            refreshFrame: () => frameAnswer('current', DATASET_FRAME),
        });

        await db.insert(shareCardResult).values({
            shareId: id,
            cardId: 'data',
            leaseUntil: sql`now() + interval '60 seconds'`,
        });

        assert.deepEqual((await refresh(deps, id, 'data')).body, {
            status: 'pending',
            retry_after_s: 2,
        });
        assert.equal(stub.calls.length, 0);

        await db
            .update(shareCardResult)
            .set({ leaseUntil: sql`now() - interval '1 second'` })
            .where(eq(shareCardResult.shareId, id));

        assert.equal((await refresh(deps, id, 'data')).body.status, 'current');
    });

    await t.test('data: a redrawn card streams the export on the refreshed frame', async () => {
        const id = await liveShare();
        const { stub, deps } = over({
            refreshFrame: () => frameAnswer('moved', MOVED_FRAME),
            render: () => json(renderReply('cmp_data', 3, MOVED_FRAME)),
        });

        // No stored answer yet, so the download refreshes the card first.
        const file = await download(
            deps,
            id,
            'data',
            'format=csv&bundle=false&spec_id=spec_other&content_version=cv_other&extra=1',
        );

        assert.equal(file.status, 200);
        assert.ok((await file.text()).startsWith(pairOf('render_data.csv').response.body_starts!));
        assert.equal(file.headers.get('content-type'), recordedHeaders['content-type']);
        assert.equal(
            file.headers.get('content-disposition'),
            recordedHeaders['content-disposition'],
        );
        assert.equal(file.headers.get('set-cookie'), null);

        const [call] = stub.to('/render/data');
        const sent = new URL(call!.url);

        assert.equal(
            sent.pathname,
            '/api/presentation/components/cmp_data/revisions/3/render/data',
        );
        // The frame is the one the refresh returned, whatever the caller names.
        assert.deepEqual(Object.fromEntries(sent.searchParams), {
            format: 'csv',
            bundle: 'false',
            spec_id: MOVED_FRAME.spec_id,
            content_version: MOVED_FRAME.content_version,
        });
        assert.equal(call?.headers.get('x-dfo-principal'), PRINCIPAL);

        // A second download serves from the stored answer.
        await download(deps, id, 'data', 'format=xlsx');
        assert.equal(stub.to('/frames/refresh').length, 1);
        assert.equal(new URL(stub.to('/render/data')[1]!.url).searchParams.get('format'), 'xlsx');
    });

    await t.test('data: a derived redraw exports the frame its render names', async () => {
        const id = await liveShare();
        const { stub, deps } = over({
            refreshDerived: () => aiRedrawn(renderReply('cmp_derived', 3, REPLAYED_FRAME)),
        });

        assert.equal((await download(deps, id, 'derived')).status, 200);
        assert.equal(
            stub.to('/render/data')[0]?.url,
            `${APIS}/api/presentation/components/cmp_derived/revisions/3/render/data?spec_id=${REPLAYED_FRAME.spec_id}&content_version=${REPLAYED_FRAME.content_version}`,
        );
    });

    await t.test('data: a current card streams the stored revision’s public export', async () => {
        const id = await liveShare();
        const { stub, deps } = over({
            refreshFrame: () => frameAnswer('current', DATASET_FRAME),
        });

        const file = await download(deps, id, 'data', 'format=parquet&bundle=true');

        assert.equal(file.headers.get('content-disposition'), 'attachment; filename="stored.csv"');

        const [call] = stub.to('/revisions/3/data');

        assert.equal(
            call?.url,
            `${APIS}/api/presentation/components/cmp_data/revisions/3/data?format=parquet&bundle=true`,
        );
        assert.equal(call?.headers.get('x-dfo-principal'), null);
        assert.equal(stub.to('/render/data').length, 0);
    });

    // Node's fetch decodes a gzipped export and keeps its compressed length.
    await t.test(
        'data: a gzipped export streams every row without its compressed length',
        async () => {
            const id = await liveShare();
            const { deps } = over({
                refreshFrame: () => frameAnswer('current', DATASET_FRAME),
                storedExport: () =>
                    new Response('year,value\n2024,1\n', {
                        headers: {
                            'content-type': 'text/csv',
                            'content-encoding': 'gzip',
                            'content-length': '9',
                        },
                    }),
            });

            const file = await download(deps, id, 'data', 'format=csv&bundle=false');

            assert.equal(file.headers.get('content-length'), null);
            assert.equal(await file.text(), 'year,value\n2024,1\n');
        },
    );

    await t.test('data: no file while pending, on an error, or on a refused export', async () => {
        const id = await liveShare();
        const queued = over({
            refreshFrame: () => pendingAnswer(9),
        });
        const waiting = await download(queued.deps, id, 'data');

        assert.equal(waiting.status, 503);
        assert.equal(waiting.headers.get('retry-after'), '9');
        const pending = await waiting.json();

        assert.equal(waiting.headers.get('content-type'), 'application/problem+json');
        assert.equal(pending.code, 'refresh_pending');
        assert.equal(pending.retryable, true);
        assert.equal(pending.retry_after_s, 9);

        const failed = over({ refreshDerived: (call) => aiRefusal('recipe_missing', call) });
        const none = await download(failed.deps, id, 'derived');

        assert.equal(none.status, 502);
        const missing = await none.json();

        assert.equal(none.headers.get('content-type'), 'application/problem+json');
        assert.equal(missing.code, 'recipe_missing');
        assert.equal(missing.retryable, false);
        assert.equal(missing.retry_after_s, 30);

        await age(id);

        const refusing = over({
            refreshFrame: () => frameAnswer('moved', MOVED_FRAME),
            render: () => json(renderReply('cmp_data', 3, MOVED_FRAME)),
            renderedExport: (call) =>
                call.url.includes('format=xlsx')
                    ? refusal('request_invalid', 400, call)
                    : refusal('unauthorized', 401, call),
        });
        const badFormat = await download(refusing.deps, id, 'data', 'format=xlsx');

        assert.equal(badFormat.status, 400);
        assert.equal((await badFormat.json()).code, 'request_invalid');

        // A refusal of the server's own credential is not the caller's error.
        const badCredential = await download(refusing.deps, id, 'data', 'format=csv');

        assert.equal(badCredential.status, 502);
        assert.equal((await badCredential.json()).code, 'unauthorized');
    });

    await t.test('stored answers go with the share and with a switch to snapshot', async () => {
        const { deps } = over({
            refreshFrame: () => frameAnswer('current', DATASET_FRAME),
        });
        const deleted = await liveShare();
        const switched = await liveShare();
        const kept = await liveShare();

        for (const id of [deleted, switched, kept]) {
            await refresh(deps, id, 'data');
            assert.equal((await rows(id)).length, 1);
        }

        assert.equal(await deleteOwnedShare(db, deleted, 'owner'), 'done');
        assert.deepEqual(await rows(deleted), []);

        assert.equal(await snapshotLiveShare(db, switched, 'other'), 'not_found');
        assert.equal((await rows(switched)).length, 1);
        assert.equal(await snapshotLiveShare(db, switched, 'owner'), 'done');
        assert.deepEqual(await rows(switched), []);
        assert.equal((await refresh(deps, switched, 'data')).status, 404);

        assert.equal((await rows(kept)).length, 1);
    });

    await t.test(
        'a stored error answers how long it stands and what the back end said',
        async () => {
            const id = await liveShare();
            const { deps } = over({
                refreshFrame: () => frameAnswer('moved', MOVED_FRAME),
                render: (call) => refusal('release_mismatch', 409, call, true),
            });
            const fresh = await refresh(deps, id, 'data');

            assert.deepEqual(fresh.body, {
                status: 'error',
                code: 'release_mismatch',
                retryable: true,
                retry_after_s: 30,
            });
            assert.equal((await rows(id))[0]?.retryable, true);

            // Five seconds before the stored answer lapses, a viewer who asks again is
            // told so, with the same code and the same word on retrying.
            await db
                .update(shareCardResult)
                .set({ freshUntil: sql`now() + interval '5 seconds'` })
                .where(eq(shareCardResult.shareId, id));

            const stored = await refresh(deps, id, 'data');

            assert.deepEqual(
                { ...stored.body, retry_after_s: undefined },
                {
                    status: 'error',
                    code: 'release_mismatch',
                    retryable: true,
                    retry_after_s: undefined,
                },
            );
            assert.ok([4, 5].includes(stored.body.retry_after_s), `${stored.body.retry_after_s}`);

            const file = await download(deps, id, 'data');

            assert.equal(file.status, 502);
            assert.equal((await file.json()).retryable, true);
        },
    );

    await t.test('a stalled export ends at its deadline as a visible backend_timeout', async () => {
        const id = await liveShare();
        const { deps } = over({
            refreshFrame: () => frameAnswer('current', DATASET_FRAME),
            storedExport: stalled,
        });

        await refresh(deps, id, 'data');

        const res = await Promise.race([
            download({ ...deps, exportDeadlineMs: 30 }, id, 'data'),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('the export was never ended')), 3000),
            ),
        ]);

        assert.equal(res.status, 502);
        assert.equal((await res.json()).code, 'backend_timeout');
    });

    await t.test('a share deleted mid-refresh answers 404, not a foreign-key failure', async () => {
        const id = await liveShare();
        const { deps } = over({ refreshFrame: () => frameAnswer('current', DATASET_FRAME) });
        // The share is found live, then deleted before the card's lease is taken.
        const gated = <T extends object>(query: T): T =>
            new Proxy(query, {
                get: (target, prop, receiver) => {
                    if (prop === 'then') {
                        return (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
                            deleteOwnedShare(db, id, 'owner').then(
                                () =>
                                    (target as unknown as PromiseLike<unknown>).then(
                                        resolve,
                                        reject,
                                    ),
                                reject,
                            );
                    }

                    const value = Reflect.get(target, prop, receiver);

                    return typeof value === 'function'
                        ? (...args: unknown[]) => gated(value.apply(target, args))
                        : value;
                },
            });
        const racing = new Proxy(db, {
            get: (target, prop) =>
                prop === 'execute'
                    ? (...args: unknown[]) =>
                          gated((target.execute as (...a: unknown[]) => object)(...args))
                    : Reflect.get(target, prop, target),
        });

        const answer = await refresh({ ...deps, db: racing }, id, 'data');

        assert.equal(answer.status, 404);
        assert.equal(answer.body.code, 'not_found');
        assert.deepEqual(await rows(id), []);
    });

    await t.test('a share switched to snapshot takes no lease and keeps no result', async () => {
        const id = await liveShare();
        const key = { shareId: id, cardId: 'data' };

        assert.equal(await takeLease(db, key), 'taken');
        assert.equal(await takeLease(db, key), 'held');
        assert.equal(await snapshotLiveShare(db, id, 'owner'), 'done');

        // A request that found the share live before the switch finishes after
        // it: it can neither take a lease nor store its answer.
        assert.equal(await takeLease(db, key), 'gone');
        await storeResult(db, key, { status: 'error', code: 'refresh_failed' }, 300);
        assert.deepEqual(await rows(id), []);
        assert.equal(await storedResult(db, key), null);
        await assert.rejects(
            leasedResult(db, key, 300, async () => ({ status: 'error', code: 'x' })),
            ShareGone,
        );
        assert.deepEqual(await rows(id), []);
    });

    await t.test('no response carries the credential', async () => {
        assert.ok(seen.length > 40, `${seen.length} responses collected`);

        for (const res of seen) {
            const headers = [...res.headers].flat().join('\n');

            assert.ok(!headers.includes(PRINCIPAL), 'a response header carries the credential');
            assert.ok(
                !(await res.text()).includes(PRINCIPAL),
                'a response body carries the credential',
            );
        }
    });
});
