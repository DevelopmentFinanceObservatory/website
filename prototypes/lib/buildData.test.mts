import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildDataFile, readBuilt, readPages } from './buildData.ts';
import type { BuildPage } from './buildRead.ts';
import { createLane } from './pacing.ts';

const scratch = () => mkdtempSync(path.join(tmpdir(), 'build-data-'));

/** A stand-in page whose build gives `data`, counting its calls. */
const standIn = <T,>(name: string, data: T) => {
    const page = {
        calls: 0,
        name,
        build: async () => {
            page.calls += 1;

            return data;
        },
    };

    return page;
};

test('readPages writes one file per page, holding what the page built', async () => {
    const dir = scratch();
    const pages = [standIn('one', { value: [1, 2] }), standIn('two', { retrieved: 't' })];

    const timings = await readPages(pages, { dir, now: () => 0 });

    assert.deepEqual(readdirSync(dir).toSorted(), ['one.json', 'two.json']);
    assert.deepEqual(JSON.parse(readFileSync(buildDataFile(dir, 'one'), 'utf8')), {
        value: [1, 2],
    });
    assert.deepEqual(timings, [
        { page: 'one', ms: 0 },
        { page: 'two', ms: 0 },
    ]);
});

test('readPages fails naming the page whose read failed, with the failure as cause', async () => {
    const dir = scratch();

    writeFileSync(buildDataFile(dir, 'bad'), '{"old":true}');

    const cause = new Error('analysis refused');
    const bad: BuildPage<unknown> = {
        name: 'bad',
        build: async () => {
            throw cause;
        },
    };

    await assert.rejects(
        readPages([standIn('good', {}), bad], { dir }),
        (error: Error) => /^bad: /.test(error.message) && error.cause === cause,
    );
    assert.equal(existsSync(buildDataFile(dir, 'bad')), false);
});

test('readPages refuses data JSON cannot carry', async () => {
    await assert.rejects(
        readPages([standIn('map', { byIso: new Map([['KEN', 1]]) })], { dir: scratch() }),
        /Error: map: the build read failed/,
    );
});

test("readPages runs every page's reads through one set of lanes", async () => {
    const limit = 2;
    const seen = { now: 0, most: 0 };
    const page = (name: string): BuildPage<number> => ({
        name,
        build: async (options) => {
            const lane = options?.lanes?.reads;

            assert.ok(lane);

            await Promise.all(
                Array.from({ length: limit * 2 }, () =>
                    lane.run(async () => {
                        seen.now += 1;
                        seen.most = Math.max(seen.most, seen.now);
                        await new Promise((resolve) => setTimeout(resolve, 2));
                        seen.now -= 1;
                    }),
                ),
            );

            return 1;
        },
    });

    await readPages([page('a'), page('b')], {
        dir: scratch(),
        lanes: { reads: createLane(limit), recipes: createLane(1) },
    });

    assert.equal(seen.most, limit);
});

test('readBuilt reads the page from its file', async () => {
    const dir = scratch();
    const page = standIn('p', { value: 'fresh' });

    writeFileSync(buildDataFile(dir, 'p'), '{"value":"from the file"}');

    assert.deepEqual(await readBuilt(page, { dir, dev: false }), { value: 'from the file' });
    assert.equal(page.calls, 0);
});

test('under next build, a missing file fails naming the read step', async () => {
    const page = standIn('p', { value: 1 });

    await assert.rejects(readBuilt(page, { dir: scratch(), dev: false }), /pnpm read/);
    assert.equal(page.calls, 0);
});

test('under next dev, a missing file builds the page once and writes the file', async () => {
    const dir = scratch();
    const page = standIn('dev-page', { value: 1 });

    const [first, second] = await Promise.all([
        readBuilt(page, { dir, dev: true }),
        readBuilt(page, { dir, dev: true }),
    ]);
    const third = await readBuilt(page, { dir, dev: true });

    assert.deepEqual([first, second, third], [{ value: 1 }, { value: 1 }, { value: 1 }]);
    assert.equal(page.calls, 1);
    assert.deepEqual(JSON.parse(readFileSync(buildDataFile(dir, 'dev-page'), 'utf8')), {
        value: 1,
    });
});
