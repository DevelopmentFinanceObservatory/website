import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { type Readable, Writable } from 'node:stream';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { BigQuery, type Table } from '@google-cloud/bigquery';
import {
    type ExportBigQuery,
    exportBigQuery,
    type ExportDb,
    exportDb,
    exportPool,
    type Load,
    loadWithin,
} from '../bounded.ts';
import { type LoadRequest, loadUpload } from '../load-upload.ts';
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
    /** The request headers with credentials: a rejection is a failure before any request. */
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
    /** How long each read of the job's state takes, 0 unless given. */
    readMs?: number;
    /** The job id's states, read by read, the last repeated. */
    states?: (JobState | typeof NOT_FOUND | 'hang')[];
    /** The job's state once BigQuery accepted a cancel, when the cancel stops it. */
    afterCancel?: JobState;
    /**
     * The wall clock stands still while timers run, as on a loaded runner
     * whose timers fire before Date.now() reaches their due time.
     */
    frozenWallClock?: boolean;
};

/**
 * A table and an upload (`send`) whose load runs as `fake` says, the calls
 * they get (`load`, `abort` of its upload, `cancel`, `state`), and the job
 * ids the upload was given and the table looked up. Its upload stream emits
 * `job` and `complete` as loadUpload's does. `read` resolves once the file
 * piped into the upload has ended, failed, or paused on a full upload, when
 * no more of it is read before the upload moves.
 */
const fakeTable = ({
    auth = async () => new Headers({ authorization: 'Bearer token' }),
    upload = async () => undefined,
    stall = false,
    failWrite = false,
    promise = never,
    cancel = async () => [{}],
    states = [RUNNING],
    afterCancel,
    readMs = 0,
}: Fake) => {
    const calls: string[] = [];
    const jobIds: { created?: string; looked?: string; location?: string } = {};
    let cancelled = false;
    const { promise: read, resolve: readDone } = Promise.withResolvers<void>();
    const table = {
        id: 't',
        location: 'EU',
        dataset: { id: 'd', projectId: 'p' },
        bigQuery: {
            apiEndpoint: 'https://bigquery.invalid',
            authClient: { getRequestHeaders: auth },
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
                        if (readMs > 0) {
                            await sleep(readMs);
                        }

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
    } as unknown as Table;
    const send = ({ jobId }: LoadRequest) => {
        calls.push('load');
        jobIds.created = jobId;

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

        stream.on('pipe', (source: Readable) => {
            for (const event of ['end', 'error', 'pause']) {
                source.once(event, () => readDone());
            }
        });

        return stream;
    };

    return { table, send, calls, jobIds, read };
};

const BOUNDS = { timeoutMs: 40, cancelTimeoutMs: 20, confirmTimeoutMs: 60, pollMs: 5 };

// Each step has its own bound, so one call never outlasts their sum.
const SLOT_MS = BOUNDS.timeoutMs + BOUNDS.cancelTimeoutMs + BOUNDS.confirmTimeoutMs;

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * loadWithin over `fake`'s table and upload, on mocked timers and wall
 * clock that stand still until the upload's file read is done (fakeTable),
 * so no bound passes while a real read of the file is pending however slow
 * the machine. They then move 1 ms per turn of the event loop until the
 * load settles, which must be within SLOT_MS. Returns the load, the calls
 * and job ids, and the mocked ms it took.
 */
const loadOnMockedClock = async (
    t: TestContext,
    fake: Fake,
    options: Partial<typeof BOUNDS> = {},
) => {
    const faked = fakeTable(fake);
    const start = Date.now();

    t.mock.timers.enable({
        apis: fake.frozenWallClock ? ['setTimeout'] : ['setTimeout', 'Date'],
        ...(fake.frozenWallClock ? {} : { now: start }),
    });
    // loadWithin and the fake hold node:timers/promises' setTimeout as an
    // ES module binding, which follows the mock only once synced.
    syncBuiltinESMExports();

    const wallClock = fake.frozenWallClock ? t.mock.method(Date, 'now', () => start) : undefined;

    try {
        let settled = false;
        const load = loadWithin({
            table: faked.table,
            send: faked.send,
            file: fake.file ?? FILE,
            metadata: {},
            ...BOUNDS,
            ...options,
        }).finally(() => {
            settled = true;
        });

        await Promise.race([load, faked.read]);

        let ms = 0;

        for (await nextTurn(); !settled; await nextTurn()) {
            assert.ok(ms < SLOT_MS, `load unsettled after ${ms} mocked ms`);
            t.mock.timers.tick(1);
            ms += 1;
        }

        return { ...faked, load: await load, ms };
    } finally {
        wallClock?.mock.restore();
        t.mock.timers.reset();
        syncBuiltinESMExports();
    }
};

const count = (calls: string[], call: string) => calls.filter((made) => made === call).length;

// A file the loads can send. A file that cannot be read sends nothing.
const FILE = path.join(os.tmpdir(), `bounded-test-${randomBytes(4).toString('hex')}.ndjson`);
// A file larger than a stalled upload's buffers, so it is never read to its end.
const LARGE_FILE = `${FILE}.large`;
// A file larger than any socket buffers between a real client and a server that stops reading.
const HUGE_FILE = `${FILE}.huge`;
// A path that stats but fails on its first read (EISDIR), so its read never ends.
const UNREADABLE = `${FILE}.dir`;

test.before(async () => {
    await fs.writeFile(FILE, '{}\n');
    await fs.writeFile(LARGE_FILE, '{}\n'.repeat(400_000));
    await fs.writeFile(HUGE_FILE, '{}\n'.repeat(10_000_000));
    await fs.mkdir(UNREADABLE);
});
test.after(async () => {
    await fs.rm(FILE, { force: true });
    await fs.rm(LARGE_FILE, { force: true });
    await fs.rm(HUGE_FILE, { force: true });
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
                ['load', 'abort', 'cancel', 'state', 'state'],
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
            await t.test(label, async (t) => {
                const { load, calls: made } = await loadOnMockedClock(t, fake);

                assert.deepEqual(load, { outcome: 'replaced', late });
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
                'a credentials client that throws as it is asked, before any request',
                {
                    auth: () => {
                        throw new Error('no credentials');
                    },
                    states: [RUNNING],
                },
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
                'an upload that fails with its job state unreadable, its reads timed out before the wall clock reaches their bound',
                { upload: reject, states: ['hang'], frozenWallClock: true },
                'unknown',
                (calls) => assert.deepEqual(calls, ['load', 'state', 'cancel', 'state']),
            ],
            [
                'a load past its timeout that its cancel stops',
                { states: [RUNNING, FAILED] },
                'kept',
                (calls) => assert.deepEqual(calls, ['load', 'abort', 'cancel', 'state', 'state']),
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
            await t.test(label, async (t) => {
                const { load, calls, jobIds, ms } = await loadOnMockedClock(t, fake);

                assert.equal(load.outcome, outcome);
                assert.ok('error' in load && load.error instanceof Error);

                // An unknown outcome names the job it leaves to reconcile.
                if (outcome === 'unknown') {
                    assert.ok(load.error.message.includes(`job p:EU.${jobIds.created}`));
                }
                checkCalls(calls, ms);
            });
        }
    },
);

test(
    'a job BigQuery creates after refusing its cancel, then stops at a re-sent cancel left unanswered, is read once more and replaced',
    { timeout: 5_000 },
    async (t) => {
        const states: Fake['states'] = [RUNNING];
        let sent = 0;
        // Polls slower than the window, so only the read straight after the
        // re-sent cancel can see the job DONE.
        const { load, calls } = await loadOnMockedClock(
            t,
            {
                stall: true,
                states,
                readMs: 5,
                cancel: async () => {
                    sent += 1;

                    if (sent === 1) {
                        return refuse(404)();
                    }

                    // BigQuery stops the job but never answers the cancel.
                    states.splice(0, states.length, DONE);
                    return never();
                },
            },
            { pollMs: 1_000 },
        );

        assert.deepEqual(load, { outcome: 'replaced', late: 'timeout' });
        assert.deepEqual(calls, ['load', 'abort', 'cancel', 'state', 'cancel', 'state']);
    },
);

test(
    "a small file's upload past its bound, unanswered by a server that reads none of it, is unknown",
    { timeout: 5_000 },
    async () => {
        // The real client against a server that takes the connection and
        // never reads the upload or answers it, and knows no job id.
        const requests: string[] = [];
        const server = http.createServer((request, response) => {
            requests.push(`${request.method} ${request.url?.split('?')[0]?.split('/').at(-1)}`);

            if (request.url?.startsWith('/upload/')) {
                request.pause();
                return;
            }

            response.writeHead(404, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ error: { code: 404, message: 'Not found' } }));
        });

        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

        try {
            const { port } = server.address() as net.AddressInfo;
            const bigquery = new BigQuery({
                projectId: 'p',
                apiEndpoint: `http://127.0.0.1:${port}`,
                // Credentials that never leave the process.
                authClient: {
                    getRequestHeaders: async () => new Headers({ authorization: 'Bearer token' }),
                } as never,
            });
            const table = bigquery.dataset('d', { location: 'EU' }).table('t');
            const load = await loadWithin({ table, file: FILE, metadata: {}, ...BOUNDS });

            // The client took the file whole before any of it was read, so
            // the send may have completed.
            assert.equal(load.outcome, 'unknown');
            // The upload started, then its job id was cancelled.
            assert.equal(requests[0], 'POST jobs');
            assert.ok(requests.includes('POST cancel'));
        } finally {
            server.closeAllConnections();
            server.close();
        }
    },
);

test(
    'an upload past its bound before its body ended closes its connection to a server that stopped reading',
    { timeout: 5_000 },
    async () => {
        // The server takes the upload's connection and stops reading it.
        const uploads: http.IncomingMessage[] = [];
        const server = http.createServer((request) => {
            if (request.url?.startsWith('/upload/')) {
                request.pause();
                uploads.push(request);
            }
        });

        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

        try {
            const { port } = server.address() as net.AddressInfo;
            const bigquery = new BigQuery({
                projectId: 'p',
                apiEndpoint: `http://127.0.0.1:${port}`,
                authClient: {
                    getRequestHeaders: async () => new Headers({ authorization: 'Bearer token' }),
                } as never,
            });
            const table = bigquery.dataset('d', { location: 'EU' }).table('t');
            const load = await loadWithin({ table, file: HUGE_FILE, metadata: {}, ...BOUNDS });

            assert.equal(load.outcome, 'kept');
            assert.equal(uploads.length, 1);

            // The server reads again, so it sees what the client did to the
            // connection: closed, before this test closes anything, or the
            // rest of the body arriving on it.
            const upload = uploads[0]!;
            const closed = new Promise<boolean>((resolve) =>
                upload.socket.once('close', () => resolve(true)),
            );

            upload.socket.on('error', () => undefined);
            upload.resume();
            assert.ok(
                await Promise.race([closed, sleep(1_000).then(() => false)]),
                'the upload connection is still open',
            );
        } finally {
            server.closeAllConnections();
            server.close();
        }
    },
);

test(
    'loadWithin sends the job insert and the file in one multipart upload and reads the job BigQuery answers with',
    { timeout: 5_000 },
    async (t) => {
        const cases: [string, number, Load['outcome']][] = [
            ['an insert BigQuery accepts, whose job finishes', 200, 'replaced'],
            ['an insert BigQuery refuses for its caller', 403, 'kept'],
        ];

        for (const [label, status, outcome] of cases) {
            await t.test(label, async () => {
                // BigQuery as the upload and the job reads see it.
                const requests: string[] = [];
                let insert: { jobReference?: { jobId?: string; location?: string } } = {};
                let file = '';
                const server = http.createServer(async (request, response) => {
                    const path = request.url?.split('?')[0] ?? '';
                    const chunks: Buffer[] = [];

                    for await (const chunk of request) {
                        chunks.push(chunk as Buffer);
                    }

                    requests.push(`${request.method} ${path}`);
                    response.setHeader('content-type', 'application/json');

                    if (path.startsWith('/upload/')) {
                        const contentType = request.headers['content-type'] ?? '';
                        const boundary = contentType.slice(
                            contentType.indexOf('boundary=') + 'boundary='.length,
                        );
                        const parts = Buffer.concat(chunks).toString('utf8').split(`--${boundary}`);

                        insert = JSON.parse(parts[1]!.split('\r\n\r\n')[1]!);
                        file = parts[2]!.split('\r\n\r\n')[1]!.slice(0, -2);
                        response.writeHead(status);
                        response.end(
                            JSON.stringify(
                                status === 200
                                    ? { jobReference: { ...insert.jobReference, projectId: 'p' } }
                                    : { error: { code: status, message: 'Forbidden' } },
                            ),
                        );
                        return;
                    }

                    response.end(
                        JSON.stringify({
                            jobReference: { ...insert.jobReference, projectId: 'p' },
                            ...DONE,
                        }),
                    );
                });

                await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

                try {
                    const { port } = server.address() as net.AddressInfo;
                    const bigquery = new BigQuery({
                        projectId: 'p',
                        apiEndpoint: `http://127.0.0.1:${port}`,
                        authClient: {
                            getRequestHeaders: async () =>
                                new Headers({ authorization: 'Bearer token' }),
                        } as never,
                    });
                    const table = bigquery.dataset('d', { location: 'EU' }).table('t');
                    const load = await loadWithin({
                        table,
                        file: FILE,
                        metadata: { sourceFormat: 'NEWLINE_DELIMITED_JSON' },
                        ...BOUNDS,
                        timeoutMs: 2_000,
                    });

                    assert.equal(load.outcome, outcome);
                    assert.equal(requests[0], 'POST /upload/bigquery/v2/projects/p/jobs');
                    assert.match(insert.jobReference?.jobId ?? '', /^website_export_/);
                    assert.equal(insert.jobReference?.location, 'EU');
                    assert.deepEqual(insert, {
                        ...insert,
                        configuration: {
                            load: {
                                sourceFormat: 'NEWLINE_DELIMITED_JSON',
                                destinationTable: { projectId: 'p', datasetId: 'd', tableId: 't' },
                            },
                        },
                    });
                    assert.equal(file, '{}\n');

                    if (status !== 200) {
                        assert.deepEqual(requests, ['POST /upload/bigquery/v2/projects/p/jobs']);
                    }
                } finally {
                    server.closeAllConnections();
                    server.close();
                }
            });
        }
    },
);

/**
 * A local BigQuery that answers every upload with its job and each read of
 * that job with `readJob`'s answer, after `readMs`, and accepts every
 * cancel. `requests` lists each request's method and path, as it arrives.
 */
const jobServer = async ({ readJob, readMs = 0 }: { readJob: JobState; readMs?: number }) => {
    const requests: string[] = [];
    let jobReference: unknown;
    const server = http.createServer(async (request, response) => {
        const path = request.url?.split('?')[0] ?? '';

        requests.push(`${request.method} ${path}`);

        for await (const chunk of request) {
            if (path.startsWith('/upload/')) {
                const insert = /"jobReference":(\{[^}]*\})/.exec(String(chunk))?.[1];

                jobReference ??= insert === undefined ? undefined : JSON.parse(insert);
            }
        }

        response.setHeader('content-type', 'application/json');

        if (request.method === 'GET') {
            await sleep(readMs);
        }

        const job = { jobReference, ...(request.method === 'GET' ? readJob : RUNNING) };

        response.end(JSON.stringify(path.endsWith('/cancel') ? { job } : job));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    const { port } = server.address() as net.AddressInfo;
    const bigquery = new BigQuery({
        projectId: 'p',
        apiEndpoint: `http://127.0.0.1:${port}`,
        authClient: {
            getRequestHeaders: async () => new Headers({ authorization: 'Bearer token' }),
        } as never,
    });

    return {
        table: bigquery.dataset('d', { location: 'EU' }).table('t'),
        requests,
        close() {
            server.closeAllConnections();
            server.close();
        },
    };
};

test(
    'an upload destroyed while a read of its job is in flight leaves no unhandled rejection when the read fails',
    { timeout: 5_000 },
    async (t) => {
        // The read answers 100 ms after the upload is destroyed, with a job
        // DONE with an error, which the client reports as a failed read.
        const bigquery = await jobServer({ readJob: FAILED, readMs: 120 });
        const rejections: unknown[] = [];
        const onRejection = (reason: unknown) => rejections.push(reason);

        process.on('unhandledRejection', onRejection);
        t.after(() => {
            process.off('unhandledRejection', onRejection);
            bigquery.close();
        });

        const upload = loadUpload({
            table: bigquery.table,
            metadata: {},
            jobId: 'website_export_test',
            headers: new Headers(),
        });

        upload.on('error', () => undefined);
        upload.once('job', () => setTimeout(() => upload.destroy(), 20));
        upload.end('{}\n');

        await sleep(400);
        assert.equal(bigquery.requests.filter((request) => request.startsWith('GET')).length, 1);
        assert.deepEqual(rejections, []);
    },
);

test(
    'a load past its bound with its job inserted reads the job no more once it returns',
    { timeout: 5_000 },
    async (t) => {
        const bigquery = await jobServer({ readJob: RUNNING });

        t.after(() => bigquery.close());

        const load = await loadWithin({
            table: bigquery.table,
            file: FILE,
            metadata: {},
            ...BOUNDS,
        });
        const reads = () => bigquery.requests.filter((request) => request.startsWith('GET')).length;
        const returned = reads();

        assert.equal(load.outcome, 'unknown');
        // The client reads a job it waits on every 500 ms.
        await sleep(700);
        assert.equal(reads(), returned);
    },
);

test('loadWithin keeps the table without a request when its file cannot be read', async () => {
    const { table, send, calls } = fakeTable({ promise: async () => [{}] });
    const load = await loadWithin({
        table,
        send,
        file: `${FILE}.missing`,
        metadata: {},
        ...BOUNDS,
    });

    assert.equal(load.outcome, 'kept');
    assert.deepEqual(calls, []);
});

test('a load that faults once its upload may have started is unknown and names its job', async () => {
    const { table, jobIds } = fakeTable({});
    const load = await loadWithin({
        table,
        send: ({ jobId }) => {
            jobIds.created = jobId;
            throw new Error('boom');
        },
        file: FILE,
        metadata: {},
        ...BOUNDS,
    });

    assert.equal(load.outcome, 'unknown');
    assert.ok('error' in load && load.error.message.includes(`job p:EU.${jobIds.created}`));
});

test('loadWithin reads back the job id it created the load under, in the table location', async () => {
    const { table, send, jobIds } = fakeTable({ promise: reject, states: [FAILED] });

    assert.equal(
        (await loadWithin({ table, send, file: FILE, metadata: {}, ...BOUNDS })).outcome,
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
