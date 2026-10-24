import assert from 'node:assert/strict';
import test from 'node:test';
import type { Table } from '@google-cloud/bigquery';
import { loadWithin } from '../bounded.ts';

// A table whose load job settles as `promise` does and whose cancel as `cancel` does.
const fakeTable = (promise: () => Promise<unknown>, cancel: () => Promise<unknown>) => {
    const calls: string[] = [];
    const table = {
        createLoadJob: async () => {
            calls.push('load');
            return [
                {
                    promise,
                    cancel: () => {
                        calls.push('cancel');
                        return cancel();
                    },
                },
            ];
        },
    } as unknown as Table;

    return { table, calls };
};

const never = () => new Promise(() => undefined);

test('loadWithin bounds a load and its cancel', { timeout: 5_000 }, async (t) => {
    const cases: [string, () => Promise<unknown>, () => Promise<unknown>, RegExp | null][] = [
        ['a load that finishes', async () => [{}], async () => [{}], null],
        [
            'a load that fails',
            async () => Promise.reject(new Error('load job failed')),
            never,
            /load job failed/,
        ],
        ['a load past its timeout', never, async () => [{}], /ran past/],
        ['a load past its timeout whose cancel hangs', never, never, /ran past/],
    ];

    for (const [label, promise, cancel, error] of cases) {
        await t.test(label, async () => {
            const { table, calls } = fakeTable(promise, cancel);
            const load = loadWithin({
                table,
                file: '/tmp/day.ndjson',
                metadata: {},
                timeoutMs: 20,
                cancelTimeoutMs: 20,
            });

            if (error === null) {
                await load;
            } else {
                await assert.rejects(load, error);
            }

            assert.deepEqual(calls, /ran past/.test(String(error)) ? ['load', 'cancel'] : ['load']);
        });
    }
});
