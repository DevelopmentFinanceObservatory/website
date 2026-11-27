/**
 * `useArrivals`, driven through hookRuntime.ts: which card of a batch draws
 * the arrival wave. The hook is bundled with `react` aliased to
 * hookRuntime.ts and `@` to `src`.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';

import { build } from 'esbuild';

import type { Slot, Slots } from '../../../components/organisms/Studio/canvas/layout.ts';
import type { useArrivals as UseArrivals } from '../../../components/organisms/Studio/canvas/useArrivals.ts';
import type { Widget } from '../../chat/widgets.ts';
import type { renderHook as RenderHook } from './hookRuntime.ts';

const REPO = join(import.meta.dirname, '../../../..');

let out: string;
let useArrivals: typeof UseArrivals;
let renderHook: typeof RenderHook;

before(async () => {
    out = await mkdtemp(join(tmpdir(), 'use-arrivals-'));

    const file = join(out, 'useArrivals.mjs');

    await build({
        stdin: {
            contents: [
                "export { useArrivals } from '@/components/organisms/Studio/canvas/useArrivals';",
                "export { renderHook } from './src/lib/studio/test/hookRuntime.ts';",
            ].join('\n'),
            resolveDir: REPO,
            loader: 'ts',
        },
        absWorkingDir: REPO,
        bundle: true,
        platform: 'node',
        format: 'esm',
        outfile: file,
        alias: { '@': './src', react: './src/lib/studio/test/hookRuntime.ts' },
        logLevel: 'error',
    });

    ({ useArrivals, renderHook } = await import(pathToFileURL(file).href));
});

after(async () => {
    await rm(out, { recursive: true, force: true });
});

const slot = (id: string, col: number): Slot => ({
    col,
    row: 0,
    w: 4,
    h: 2,
    z: 1,
    widget: { kind: 'key_number', id, label: id, value: '1', turn: 1 } as Widget,
});

// Two cards land in one batch: `free` with no placeholder, then `seated` in
// one, which `quiet` marks as the Prompt canvas does.
const waves = (quiet: (slot: Slot) => boolean): number[][] => {
    const slots: Slots = { free: slot('free', 0), seated: slot('seated', 10) };
    const centres: number[][] = [];
    const hook = renderHook(() =>
        useArrivals({
            boardRef: { current: null },
            slots,
            origin: { x: 0, y: 0 },
            CELL: 20,
            spawnWave: (col, row) => centres.push([col, row]),
            busy: () => false,
            quiet,
        }),
    );

    hook.unmount();

    return centres;
};

test('a card with no placeholder keeps its wave beside one seated in its placeholder', () => {
    assert.deepEqual(
        waves((one) => one.widget.id === 'seated'),
        [[2, 1]],
    );
});
