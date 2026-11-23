import assert from 'node:assert/strict';
import test from 'node:test';

import { parsePrinted, PIPELINE_SCRIPT, runPipeline, type Spawn, spawnChild } from './pipeline.ts';

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

        return { stdout: '', stderr: '', code: 0, signal: null, stopped: null, ...result };
    };

test('runPipeline runs build.py under uv and returns the view with the versions read', async () => {
    const calls: unknown[] = [];
    const read = await runPipeline({
        timeout: 1000,
        run: stub({ stdout: `${JSON.stringify(printed)}\n` }, calls),
    });

    assert.deepEqual(calls, [
        ['uv', ['run', '--script', PIPELINE_SCRIPT], { timeout: 1000, signal: undefined }],
    ]);
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
        runPipeline({
            timeout: 2000,
            run: stub({ code: null, signal: 'SIGKILL', stopped: 'timeout' }),
        }),
        /stopped \(SIGKILL\) after 2 s/,
    );
    await assert.rejects(
        runPipeline({
            timeout: 2000,
            run: stub({ code: null, signal: 'SIGTERM', stopped: 'aborted' }),
        }),
        /stopped because the page's build was abandoned/,
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

/** A child that ignores SIGTERM and starts a grandchild that ignores it too, printing the
 *  grandchild's pid, as uv starts Python. */
const STUBBORN = `
const { spawn } = require('node:child_process');
process.on('SIGTERM', () => {});
const grandchild = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);"], { stdio: 'ignore' });
process.stdout.write(String(grandchild.pid));
setInterval(() => {}, 1000);
`;

const alive = (pid: number): boolean => {
    try {
        process.kill(pid, 0);

        return true;
    } catch {
        return false;
    }
};

/** Whether `pid` ends within a second, as the system reaps it. */
const ends = async (pid: number): Promise<boolean> => {
    for (let i = 0; i < 20 && alive(pid); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return !alive(pid);
};

test('spawnChild kills the whole process group at the timeout, SIGKILL after the grace', async () => {
    const ended = await spawnChild(process.execPath, ['-e', STUBBORN], {
        timeout: 300,
        grace: 200,
    });

    assert.equal(ended.stopped, 'timeout');
    assert.equal(ended.signal, 'SIGKILL');
    assert.equal(await ends(Number(ended.stdout)), true);
});

test('spawnChild kills the whole process group when its signal aborts', async () => {
    const abandon = new AbortController();
    const running = spawnChild(process.execPath, ['-e', STUBBORN], {
        timeout: 60_000,
        signal: abandon.signal,
        grace: 200,
    });

    setTimeout(() => abandon.abort(), 300);
    const ended = await running;

    assert.equal(ended.stopped, 'aborted');
    assert.equal(ended.signal, 'SIGKILL');
    assert.equal(await ends(Number(ended.stdout)), true);
});

test('spawnChild returns what a child that exits prints', async () => {
    const ended = await spawnChild(
        process.execPath,
        ['-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exit(3)'],
        { timeout: 60_000 },
    );

    assert.deepEqual(ended, { stdout: 'out', stderr: 'err', code: 3, signal: null, stopped: null });
});
