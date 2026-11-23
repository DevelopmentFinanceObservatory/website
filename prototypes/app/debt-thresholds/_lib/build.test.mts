import assert from 'node:assert/strict';
import test from 'node:test';

import { debtBuild } from './build.ts';
import type { Spawn } from './pipeline.ts';

import type { Checker } from '#lib/buildRead.ts';
import { createLane } from '#lib/pacing.ts';

test('a failed transfers read stops the pipeline child and fails the build', async () => {
    let stopped = false;
    // A child that runs until the build abandons it.
    const run: Spawn = (_command, _args, { signal }) =>
        new Promise((resolve) => {
            signal?.addEventListener('abort', () => {
                stopped = true;
                resolve({
                    stdout: '',
                    stderr: '',
                    code: null,
                    signal: 'SIGTERM',
                    stopped: 'aborted',
                });
            });
        });
    const client = {
        fetch: async () => {
            throw new Error('gateway refused');
        },
    } as unknown as Checker;

    await assert.rejects(
        debtBuild.build({
            client,
            run,
            lanes: { reads: createLane(2), recipes: createLane(1) },
            pendingBound: 0,
        }),
        /debt-thresholds failed/,
    );
    assert.equal(stopped, true);
});
