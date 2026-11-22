import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { BigQuery, Table } from '@google-cloud/bigquery';
import {
    type ExportBigQuery,
    exportBigQuery,
    type ExportDb,
    exportDb,
    exportPool,
    type Load,
    loadWithin,
} from '../bounded.ts';
import { createTestDatabase } from './harness.ts';

type JobState = { status: { state: string; errorResult?: { reason: string } } };

const RUNNING: JobState = { status: { state: 'RUNNING' } };
const DONE: JobState = { status: { state: 'DONE' } };
const FAILED: JobState = { status: { state: 'DONE', errorResult: { reason: 'stopped' } } };
// BigQuery's answer for a job id it does not know.
const NOT_FOUND = 'not found';

const never = () => new Promise<never>(() => undefined);
const reject = async () => Promise.reject(new Error('boom'));
// A request that failed with no answer from BigQuery, as Node's error with `code`.
const failWith = (code: string) => async () =>
    Promise.reject(Object.assign(new Error(code), { code }));
// BigQuery's answer to a job insert it refuses, as the client's ApiError.
const refuse = (code: number) => async () =>
    Promise.reject(Object.assign(new Error('Refused'), { code }));

type Fake = {
    /** The client's credentials: a rejection is a failure before any request. */
    auth?: () => Promise<unknown>;
    /**
     * BigQuery's answer to the upload once its body has ended: a rejection
     * is a client error before the job.
     */
    upload?: () => Promise<unknown>;
    /** The upload takes no bytes, as over a stalled connection. */
    stall?: boolean;
    /** The upload fails on its first bytes, as over a reset connection. */
    failWrite?: boolean;
    /** The file the load sends, FILE unless given. */
    file?: string;
    /** The client's wait for the created job. */
    promise?: () => Promise<unknown>;
    cancel?: () => Promise<unknown>;
    /** The job id's states, read by read, the last repeated. */
    states?: (JobState | typeof NOT_FOUND | 'hang')[];
    /** The job's state once BigQuery accepted a cancel, when the cancel stops it. */
    afterCancel?: JobState;
};

/**
 * A table whose load runs as `fake` says, the calls it gets (`load`,
 * `abort` of its upload, `cancel`, `state`), and the job ids it was given
 * and looked up. Its upload stream emits `job` and `complete` as the
 * client's does.
 */
const fakeTable = ({
    auth = async () => 'token',
    upload = async () => undefined,
    stall = false,
    failWrite = false,
    promise = never,
    cancel = async () => [{}],
    states = [RUNNING],
    afterCancel,
}: Fake) => {
    const calls: string[] = [];
    const jobIds: { created?: string; looked?: string; location?: string } = {};
    let cancelled = false;
    const table = {
        location: 'EU',
        bigQuery: {
            authClient: { getAccessToken: auth },
            job: (id: string, { location }: { location?: string }) => {
                jobIds.looked = id;
                jobIds.location = location;
                return {
                    cancel: async () => {
                        calls.push('cancel');
                        const answer = await cancel();

                        cancelled = true;
                        return answer;
                    },
                    getMetadata: async () => {
                        calls.push('state');
                        const state =
                            afterCancel !== undefined && cancelled
                                ? afterCancel
                                : states.length > 1
                                  ? states.shift()!
                                  : states[0]!;

                        if (state === 'hang') {
                            return never();
                        }

                        if (state === NOT_FOUND) {
                            throw Object.assign(new Error('Not found'), { code: 404 });
                        }

                        return [state];
                    },
                };
            },
        },
        createWriteStream: (metadata: { jobId?: string }) => {
            calls.push('load');
            jobIds.created = metadata.jobId;

            const stream: Writable = new Writable({
                write: (_chunk, _encoding, done) => {
                    if (failWrite) {
                        done(new Error('socket hang up'));
                    } else if (!stall) {
                        done();
                    }
                },
                final: () => {
                    void (async () => {
                        try {
                            await upload();
                            stream.emit('job', {});
                            await promise();
                            stream.emit('complete', {});
                        } catch (error) {
                            stream.destroy(error as Error);
                        }
                    })();
                },
                destroy: (error, done) => {
                    if (error === null) {
                        calls.push('abort');
                    }

                    done(error);
                },
            });

            return stream;
        },
    } as unknown as Table;

    return { table, calls, jobIds };
};

const BOUNDS = { timeoutMs: 40, cancelTimeoutMs: 20, confirmTimeoutMs: 60, pollMs: 5 };

// Each step has its own bound, so one call never outlasts their sum, with slack for the timers.
const SLOT_MS = BOUNDS.timeoutMs + BOUNDS.cancelTimeoutMs + BOUNDS.confirmTimeoutMs + 200;

const count = (calls: string[], call: string) => calls.filter((made) => made === call).length;

// A file the loads can send. A file that cannot be read sends nothing.
const FILE = path.join(os.tmpdir(), `bounded-test-${randomBytes(4).toString('hex')}.ndjson`);
// A file larger than a stalled upload's buffers, so it is never read to its end.
const LARGE_FILE = `${FILE}.large`;
// A path that stats but fails on its first read (EISDIR), so its read never ends.
const UNREADABLE = `${FILE}.dir`;

test.before(async () => {
    await fs.writeFile(FILE, '{}\n');
    await fs.writeFile(LARGE_FILE, '{}\n'.repeat(400_000));
    await fs.mkdir(UNREADABLE);
});
test.after(async () => {
    await fs.rm(FILE, { force: true });
    await fs.rm(LARGE_FILE, { force: true });
    await fs.rm(UNREADABLE, { recursive: true, force: true });
});

test(
    'loadWithin resolves a load BigQuery confirms DONE without an error as replaced',
    { timeout: 5_000 },
    async (t) => {
        const cases: [string, Fake, (Load & { outcome: 'replaced' })['late'], string[]][] = [
            ['a load that finishes in time', { promise: async () => [{}] }, null, ['load']],
            [
                'a load past its timeout whose cancel is refused and that then finishes',
                { cancel: reject, states: [RUNNING, DONE] },
                'timeout',
                ['load', 'cancel', 'state', 'state'],
            ],
            [
                'a load whose client fails while its job runs on and finishes',
                { promise: reject, states: [RUNNING, DONE] },
                'failure',
                ['load', 'state', 'state'],
            ],
            [
                'an upload whose client fails before BigQuery shows the job it then finishes',
                { upload: reject, states: [NOT_FOUND, DONE] },
                'failure',
                ['load', 'state', 'state'],
            ],
        ];

        for (const [label, fake, late, calls] of cases) {
            await t.test(label, async () => {
                const { table, calls: made } = fakeTable(fake);
                const started = performance.now();

                assert.deepEqual(await loadWithin({ table, file: FILE, metadata: {}, ...BOUNDS }), {
                    outcome: 'replaced',
                    late,
                });
                assert.ok(performance.now() - started < SLOT_MS);
                assert.deepEqual(made, calls);
            });
        }
    },
);

test(
    'loadWithin returns what BigQuery confirms a failed load left',
    { timeout: 5_000 },
    async (t) => {
        const cases: [string, Fake, 'kept' | 'unknown', (calls: string[], ms: number) => void][] = [
            [
                'a load job that fails',
                { promise: reject, states: [FAILED] },
                'kept',
                (calls) => assert.deepEqual(calls, ['load', 'state']),
            ],
            [
                'a job insert BigQuery refuses as unauthorised',
                { upload: refuse(403), states: [RUNNING] },
                'kept',
                (calls, ms) => {
                    assert.deepEqual(calls, ['load']);
                    assert.ok(ms < BOUNDS.timeoutMs);
                },
            ],
            [
                'a job insert BigQuery refuses as invalid, whose job id it does not know',
                { upload: refuse(400), states: [NOT_FOUND] },
                'kept',
                (calls, ms) => {
                    assert.deepEqual(calls, ['load', 'state']);
                    assert.ok(ms < BOUNDS.timeoutMs);
                },
            ],
            [
                'a job insert BigQuery refuses as invalid, whose job runs on past the load bound',
                { upload: refuse(400), states: [RUNNING] },
                'unknown',
                (calls) => {
                    assert.equal(count(calls, 'cancel'), 1);
                    assert.ok(calls.indexOf('cancel') > 2);
                },
            ],
            [
                'a load whose client fails while its job runs past the load bound',
                { promise: reject, states: [RUNNING] },
                'unknown',
                (calls) => {
                    assert.equal(count(calls, 'cancel'), 1);
                    assert.ok(calls.indexOf('cancel') > 2);
                },
            ],
            [
                'a load whose client fails while its job runs past the load bound, then its cancel stops it',
                { promise: reject, states: [RUNNING], afterCancel: FAILED },
                'kept',
                (calls) => {
                    assert.equal(count(calls, 'cancel'), 1);
                    assert.equal(calls.at(-1), 'state');
                },
            ],
            [
                'credentials the client cannot get, before any request',
                { auth: reject, states: [RUNNING] },
                'kept',
                (calls) => assert.deepEqual(calls, []),
            ],
            [
                'an upload whose host is not found, after its file was read to its end',
                { upload: failWith('ENOTFOUND'), states: [RUNNING] },
                'kept',
                (calls, ms) => {
                    assert.deepEqual(calls, ['load']);
                    assert.ok(ms < BOUNDS.timeoutMs);
                },
            ],
            [
                'an upload whose connection resets after its file was read to its end',
                { upload: failWith('ECONNRESET'), states: [NOT_FOUND] },
                'unknown',
                (calls) => {
                    assert.equal(count(calls, 'cancel'), 1);
                    assert.ok(count(calls, 'state') > 1);
                },
            ],
            [
                'an upload that fails with no answer and its job id unknown to BigQuery',
                { upload: reject, states: [NOT_FOUND] },
                'unknown',
                (calls) => {
                    assert.equal(count(calls, 'cancel'), 1);
                    assert.ok(count(calls, 'state') > 1);
                },
            ],
            [
                'an upload that fails with its job state unreadable',
                { upload: reject, states: ['hang'] },
                'unknown',
                (calls) => assert.deepEqual(calls, ['load', 'state', 'cancel', 'state']),
            ],
            [
                'a load past its timeout that its cancel stops',
                { states: [RUNNING, FAILED] },
                'kept',
                (calls) => assert.deepEqual(calls, ['load', 'cancel', 'state', 'state']),
            ],
            [
                'a load past its timeout whose cancel hangs and whose job never ends',
                { cancel: never, states: [RUNNING] },
                'unknown',
                (calls) => {
                    assert.equal(count(calls, 'cancel'), 1);
                    assert.ok(count(calls, 'state') > 1);
                },
            ],
            [
                'a load past its timeout whose upload never creates its job',
                { upload: never, states: [NOT_FOUND] },
                'unknown',
                (calls) => {
                    assert.equal(count(calls, 'cancel'), 1);
                    assert.ok(count(calls, 'state') > 1);
                },
            ],
            [
                'an upload stalled past the load bound before its file was read to its end',
                { stall: true, file: LARGE_FILE, states: [NOT_FOUND] },
                'kept',
                (calls) => assert.deepEqual(calls, ['load', 'abort']),
            ],
            [
                'a file whose read fails before its end',
                { file: UNREADABLE, states: [RUNNING] },
                'kept',
                (calls, ms) => {
                    assert.deepEqual(calls, ['load', 'abort']);
                    assert.ok(ms < BOUNDS.timeoutMs);
                },
            ],
            [
                'an upload that fails before its file was read to its end',
                { failWrite: true, file: LARGE_FILE, states: [RUNNING] },
                'kept',
                (calls, ms) => {
                    assert.deepEqual(calls, ['load']);
                    assert.ok(ms < BOUNDS.timeoutMs);
                },
            ],
            [
                'an upload stalled past the load bound after its body ended, whose job BigQuery creates after refusing its cancel',
                {
                    stall: true,
                    cancel: (() => {
                        let sent = 0;

                        return async () => (sent++ === 0 ? refuse(404)() : [{}]);
                    })(),
                    states: [NOT_FOUND, RUNNING],
                    afterCancel: FAILED,
                },
                'kept',
                (calls) =>
                    assert.deepEqual(calls, [
                        'load',
                        'abort',
                        'cancel',
                        'state',
                        'state',
                        'cancel',
                        'state',
                    ]),
            ],
            [
                'a load whose cancel BigQuery refuses for a job it knows, while the job runs on',
                { cancel: reject, states: [RUNNING] },
                'unknown',
                (calls) => assert.equal(count(calls, 'cancel'), 1),
            ],
            [
                'an upload stalled past the load bound after its body ended',
                { stall: true, states: [NOT_FOUND] },
                'unknown',
                (calls) => assert.deepEqual(calls.slice(0, 3), ['load', 'abort', 'cancel']),
            ],
        ];

        for (const [label, fake, outcome, checkCalls] of cases) {
            await t.test(label, async () => {
                const { table, calls } = fakeTable(fake);
                const started = performance.now();
                const load = await loadWithin({
                    table,
                    file: fake.file ?? FILE,
                    metadata: {},
                    ...BOUNDS,
                });
                const ms = performance.now() - started;

                assert.equal(load.outcome, outcome);
                assert.ok('error' in load && load.error instanceof Error);
                assert.ok(ms < SLOT_MS);
                checkCalls(calls, ms);
            });
        }
    },
);

test('loadWithin keeps the table without a request when its file cannot be read', async () => {
    const { table, calls } = fakeTable({ promise: async () => [{}] });
    const load = await loadWithin({ table, file: `${FILE}.missing`, metadata: {}, ...BOUNDS });

    assert.equal(load.outcome, 'kept');
    assert.deepEqual(calls, []);
});

test('loadWithin reads back the job id it created the load under, in the table location', async () => {
    const { table, jobIds } = fakeTable({ promise: reject, states: [FAILED] });

    assert.equal(
        (await loadWithin({ table, file: FILE, metadata: {}, ...BOUNDS })).outcome,
        'kept',
    );
    assert.equal(typeof jobIds.created, 'string');
    assert.equal(jobIds.looked, jobIds.created);
    assert.equal(jobIds.location, 'EU');
});

test(
    'each exportBigQuery call but a load fails once its bound passes unanswered',
    { timeout: 5_000 },
    async (t) => {
        const table = { exists: never, getMetadata: never };
        const bigquery = {
            dataset: () => ({ table: () => table, createTable: never }),
            query: never,
        } as unknown as BigQuery;
        const callMs = 20;
        const dataset = await exportBigQuery({
            projectId: 'p',
            datasetId: 'd',
            location: 'EU',
            bigquery,
            callMs,
        });
        const cases: [string, (dataset: ExportBigQuery) => Promise<unknown>][] = [
            ['tableExists', (d) => d.tableExists('event')],
            ['createTable', (d) => d.createTable('event', {})],
            ['tableFields', (d) => d.tableFields('event')],
            ['query', (d) => d.query('SELECT 1')],
        ];

        for (const [label, call] of cases) {
            await t.test(label, async () => {
                const started = performance.now();

                await assert.rejects(call(dataset));
                assert.ok(performance.now() - started < callMs + 200);
            });
        }
    },
);

test('exportBigQuery queries its dataset by default, in the location it is given, else in the one the dataset names', async (t) => {
    /** A client whose dataset names `named`, and the calls it gets. */
    const client = (named?: string) => {
        const calls: unknown[] = [];
        const bigquery = {
            dataset: (id: string, options?: { location?: string }) => {
                calls.push(['dataset', id, options?.location]);
                return {
                    getMetadata: async () => {
                        calls.push(['getMetadata']);
                        return [{ location: named }];
                    },
                };
            },
            query: async ({
                location,
                defaultDataset,
            }: {
                location?: string;
                defaultDataset?: unknown;
            }) => {
                calls.push(['query', location, defaultDataset]);
                return [[]];
            },
        } as unknown as BigQuery;

        return { bigquery, calls };
    };
    const DATASET = { projectId: 'p', datasetId: 'd' };
    const cases: [string, string | undefined, string | undefined, unknown[]][] = [
        [
            'a location given',
            'EU',
            'US',
            [
                ['dataset', 'd', 'EU'],
                ['query', 'EU', DATASET],
            ],
        ],
        [
            'no location given',
            undefined,
            'EU',
            [
                ['dataset', 'd', undefined],
                ['getMetadata'],
                ['dataset', 'd', 'EU'],
                ['query', 'EU', DATASET],
            ],
        ],
    ];

    for (const [label, location, named, expected] of cases) {
        await t.test(label, async () => {
            const { bigquery, calls } = client(named);
            const dataset = await exportBigQuery({
                projectId: 'p',
                datasetId: 'd',
                location,
                bigquery,
            });

            await dataset.query('SELECT 1');
            assert.equal(dataset.location, 'EU');
            assert.deepEqual(calls, expected);
        });
    }

    await t.test('no location given or named', async () => {
        const { bigquery } = client(undefined);

        await assert.rejects(exportBigQuery({ projectId: 'p', datasetId: 'd', bigquery }));
    });
});

/**
 * A TCP proxy to the test Postgres that forwards until told to stall, then
 * holds every byte in both directions, as a network that stops answering
 * without closing the connection. `stall(at)` stalls from the first client
 * message holding `at`, before it reaches the server, and `stall(at,
 * { after: true })` once that message has reached it, so its answer is
 * held. `stall()` stalls at once. `resume()` forwards everything held.
 */
const stallProxy = async (target: { host: string; port: number }) => {
    let trigger: { at: string; after: boolean } | null = null;
    let stalled = false;
    const held: (() => void)[] = [];
    const sockets = new Set<net.Socket>();

    const server = net.createServer((client) => {
        const upstream = net.connect(target.port, target.host);

        for (const socket of [client, upstream]) {
            sockets.add(socket);
            socket.on('error', () => undefined);
            socket.on('close', () => {
                sockets.delete(socket);
                client.destroy();
                upstream.destroy();
            });
        }

        const send = (to: net.Socket, chunk: Buffer) => {
            if (stalled) {
                held.push(() => to.write(chunk));
            } else {
                to.write(chunk);
            }
        };

        client.on('data', (chunk: Buffer) => {
            const hit = trigger !== null && chunk.includes(trigger.at, 0, 'utf8');

            if (hit && !trigger!.after) {
                stalled = true;
            }

            send(upstream, chunk);

            if (hit) {
                stalled = true;
            }
        });
        upstream.on('data', (chunk: Buffer) => send(client, chunk));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    return {
        port: (server.address() as net.AddressInfo).port,
        stall(at?: string, { after = false }: { after?: boolean } = {}) {
            trigger = at === undefined ? null : { at, after };
            stalled = at === undefined;
        },
        resume() {
            trigger = null;
            stalled = false;

            for (const write of held.splice(0)) {
                write();
            }
        },
        async close() {
            for (const socket of sockets) {
                socket.destroy();
            }

            await new Promise((resolve) => server.close(resolve));
        },
    };
};

const PG_HOST = process.env.PGHOST ?? 'localhost';
const PG_PORT = Number(process.env.PGPORT ?? 5433);

test(
    'an export pool fails each statement over a stalled connection inside its bound, destroys the connection, and connects afresh',
    { timeout: 20_000 },
    async (t) => {
        const database = await createTestDatabase();
        const proxy = await stallProxy({ host: PG_HOST, port: PG_PORT });

        t.after(async () => {
            await proxy.close();
            await database.teardown();
        });

        const bounds = { statementMs: 300, graceMs: 100, connectionMs: 300 };
        const statementBound = bounds.statementMs + bounds.graceMs;
        const sql = 'SELECT pg_sleep(0.01)::text AS slept, 1 AS one';
        const calls = {
            query: (db: ExportDb) => db.query(sql),
            snapshot: (db: ExportDb) => db.snapshot((query) => query(sql)),
        };
        // [call, where the connection stalls, the stall, the bound that stops the call]
        const cases: [keyof typeof calls, string, () => void, number][] = [
            ['query', 'before connect', () => proxy.stall(), bounds.connectionMs],
            [
                'query',
                'during a SELECT',
                () => proxy.stall('pg_sleep', { after: true }),
                statementBound,
            ],
            ['snapshot', 'before connect', () => proxy.stall(), bounds.connectionMs],
            ['snapshot', 'before BEGIN', () => proxy.stall('BEGIN'), statementBound],
            [
                'snapshot',
                'during a SELECT',
                () => proxy.stall('pg_sleep', { after: true }),
                statementBound,
            ],
            ['snapshot', 'before COMMIT', () => proxy.stall('COMMIT'), statementBound],
        ];

        for (const [call, point, stall, boundMs] of cases) {
            await t.test(`${call}, stalled ${point}`, async () => {
                const pool = exportPool(
                    {
                        DATABASE_URL: `postgres://${database.runtimeUser}:${database.runtimePassword}@127.0.0.1:${proxy.port}/${database.databaseName}`,
                    },
                    bounds,
                );
                const db = exportDb(pool);

                try {
                    stall();

                    const started = performance.now();

                    await assert.rejects(calls[call](db));
                    assert.ok(performance.now() - started < boundMs + 500);
                    assert.equal(pool.totalCount, 0);

                    proxy.resume();
                    assert.deepEqual(await calls[call](db), [{ slept: '', one: 1 }]);
                } finally {
                    proxy.resume();
                    await pool.end();
                }
            });
        }
    },
);

test('an export pool stops a statement on the server at its bound', async (t) => {
    const database = await createTestDatabase();
    const pool = exportPool(
        {
            DATABASE_URL: `postgres://${database.runtimeUser}:${database.runtimePassword}@${PG_HOST}:${PG_PORT}/${database.databaseName}`,
        },
        { statementMs: 50 },
    );

    t.after(async () => {
        await pool.end();
        await database.teardown();
    });

    // query_canceled comes from the server. The Job's own timer, 5 s later, carries no code.
    await assert.rejects(exportDb(pool).query('SELECT pg_sleep(1)'), { code: '57014' });
});
