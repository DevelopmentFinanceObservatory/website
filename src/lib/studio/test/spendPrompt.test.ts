import assert from 'node:assert/strict';
import test from 'node:test';

import { admitTurn, meterTurn, studioRoute } from '../spendPrompt.ts';
import type { ToolError } from '../wire.ts';

test('studioRoute passes only the routes the browser calls, by exact name', () => {
    for (const route of ['turn', 'interrupt', 'cancel', 'composition']) {
        assert.equal(studioRoute([route]), route);
    }

    // Next decodes the catch-all once, so `%2574urn` arrives as `%74urn`,
    // which uvicorn would decode to `turn`.
    for (const path of [['%74urn'], ['cancel', '..', 'turn'], ['turn', 'x'], ['refresh'], []]) {
        assert.equal(studioRoute(path), null, path.join('/'));
    }
});

const REFUSAL: ToolError = {
    error: 'resource_exhausted',
    retry: 'do_not_retry',
    detail: 'spent',
    retry_after_seconds: 120,
};

test('admitTurn answers a turn from its allowance', async (t) => {
    await t.test('a prompt within the allowance is forwarded', async () => {
        assert.equal(await admitTurn(async () => null), null);
    });

    await t.test('a spent allowance is refused with 429 and Retry-After', async () => {
        const response = await admitTurn(async () => REFUSAL);

        assert.equal(response?.status, 429);
        assert.equal(response?.headers.get('retry-after'), '120');
        assert.equal(((await response?.json()) as ToolError).error, 'resource_exhausted');
    });

    await t.test('an allowance that cannot be read refuses the turn with 503', async () => {
        const error = t.mock.method(console, 'error', () => {});
        const failed = await admitTurn(async () => {
            throw new Error('connection refused');
        });
        const stalled = await admitTurn(() => new Promise<null>(() => {}), 20);

        for (const response of [failed, stalled]) {
            assert.equal(response?.status, 503);
            assert.equal(((await response?.json()) as ToolError).error, 'transient_unavailable');
        }
        assert.equal(error.mock.callCount(), 2);
    });
});

test('meterTurn gives a prompt back only for a turn that did not start', async (t) => {
    const prompter = { userId: 'u1' };
    const spends =
        (refusal: ToolError | null = null) =>
        async () => ({ prompter, refusal });
    // The turn the harness answers with `status` once the prompt is admitted.
    const answers = (status: number) => async (admit: () => Promise<Response | null>) =>
        (await admit()) ?? new Response(null, { status });

    await t.test('a successful turn refunds nothing', async () => {
        const refunds: unknown[] = [];
        const response = await meterTurn(spends(), async (p) => void refunds.push(p), answers(200));

        assert.equal(response.status, 200);
        assert.deepEqual(refunds, []);
    });

    await t.test('a turn the harness answers with an error refunds once', async () => {
        const refunds: unknown[] = [];
        const response = await meterTurn(spends(), async (p) => void refunds.push(p), answers(502));

        assert.equal(response.status, 502);
        assert.deepEqual(refunds, [prompter]);
    });

    await t.test('a refused spend returns its 429 and refunds nothing', async () => {
        const refunds: unknown[] = [];
        const response = await meterTurn(
            spends(REFUSAL),
            async (p) => void refunds.push(p),
            answers(200),
        );

        assert.equal(response.status, 429);
        assert.deepEqual(refunds, []);
    });

    await t.test('a spend that lands after the deadline refunds itself once', async () => {
        const error = t.mock.method(console, 'error', () => {});
        const events: string[] = [];
        let landed!: () => void;
        const spent = new Promise<void>((resolve) => (landed = resolve));
        const late = async () => {
            await new Promise((resolve) => setTimeout(resolve, 60));
            events.push('spent');
            landed();

            return { prompter, refusal: null };
        };
        const response = await meterTurn(
            late,
            async () => void events.push('refunded'),
            answers(200),
            10,
        );

        assert.equal(response.status, 503);
        assert.deepEqual(events, []);

        await spent;
        // The refund runs in the spend's own continuation, after it resolves.
        await new Promise((resolve) => setTimeout(resolve, 10));

        assert.deepEqual(events, ['spent', 'refunded']);
        assert.equal(error.mock.callCount(), 1);
    });
});
