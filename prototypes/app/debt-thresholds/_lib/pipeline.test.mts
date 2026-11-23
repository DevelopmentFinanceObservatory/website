import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePrinted, PIPELINE_SCRIPT, runPipeline, type Spawn } from './pipeline.ts';

import { createLane } from '#lib/pacing.ts';

const printed = {
    view: { year: 2025, vintage: {}, countries: [] },
    defaultYear: 2025,
    sources: {
        service: { versions: [{ specId: 's', contentVersion: 'cv' }], freshness: 'pending' },
    },
};

const stub =
    (result: Partial<Awaited<ReturnType<Spawn>>>, calls: unknown[] = []): Spawn =>
    async (command, args, options) => {
        calls.push([command, args, options]);

        return { stdout: '', stderr: '', code: 0, signal: null, ...result };
    };

test('runPipeline runs build.py under uv and returns the view with the versions read', async () => {
    const calls: unknown[] = [];
    const read = await runPipeline({
        timeout: 1000,
        run: stub({ stdout: `${JSON.stringify(printed)}\n` }, calls),
    });

    assert.deepEqual(calls, [['uv', ['run', '--script', PIPELINE_SCRIPT], { timeout: 1000 }]]);
    assert.deepEqual(read, {
        value: { view: printed.view, defaultYear: 2025 },
        sources: printed.sources,
    });
});

test('runPipeline holds one slot of the reads lane while the child runs', async () => {
    const reads = createLane(1);
    let release = () => {};
    const held = reads.run(() => new Promise<void>((resolve) => (release = resolve)));
    let ran = false;
    const run = runPipeline({
        timeout: 1000,
        reads,
        run: async (...args) => {
            ran = true;

            return stub({ stdout: JSON.stringify(printed) })(...args);
        },
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(ran, false);
    release();
    await held;
    await run;
    assert.equal(ran, true);
});

test('runPipeline fails with the end of the log when the child fails or is stopped', async () => {
    const stderr = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n');

    await assert.rejects(
        runPipeline({
            timeout: 1000,
            run: stub({ code: 1, stderr: `${stderr}\nbuild.py: refused` }),
        }),
        (error: Error) =>
            /exited 1/.test(error.message) &&
            /build\.py: refused/.test(error.message) &&
            !/line 5\n/.test(error.message),
    );
    await assert.rejects(
        runPipeline({ timeout: 2000, run: stub({ code: null, signal: 'SIGTERM' }) }),
        /stopped \(SIGTERM\) after 2 s/,
    );
    await assert.rejects(
        runPipeline({
            timeout: 1000,
            run: async () => {
                throw Object.assign(new Error('spawn uv ENOENT'), { code: 'ENOENT' });
            },
        }),
        /Could not start uv/,
    );
});

test('parsePrinted refuses output that is not the view, the year and the sources', () => {
    assert.throws(() => parsePrinted('Traceback'), /no JSON/);
    assert.throws(() => parsePrinted(JSON.stringify({ ...printed, sources: {} })), /sources/);
    assert.throws(() => parsePrinted(JSON.stringify({ view: printed.view })), /default year/);
});
