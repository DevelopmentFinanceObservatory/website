/**
 * `useSlots`, driven through hookRuntime.ts: a card's fitted height and a
 * placement that start in the same task both survive. The hook is bundled
 * with `react` aliased to hookRuntime.ts and `@` to `src`.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, before, test } from 'node:test';

import { build } from 'esbuild';

import type { useSlots as UseSlots } from '../../../components/organisms/Studio/canvas/useSlots.ts';
import type { Widget } from '../../chat/widgets.ts';
import type { renderHook as RenderHook, useState as UseState } from './hookRuntime.ts';

const REPO = join(import.meta.dirname, '../../../..');

let out: string;
let useSlots: typeof UseSlots;
let renderHook: typeof RenderHook;
let useState: typeof UseState;

before(async () => {
    out = await mkdtemp(join(tmpdir(), 'use-slots-'));

    const file = join(out, 'useSlots.mjs');

    await build({
        stdin: {
            contents: [
                "export { useSlots } from '@/components/organisms/Studio/canvas/useSlots';",
                "export { renderHook, useState } from './src/lib/studio/test/hookRuntime.ts';",
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

    // The browser's timers, which the hook reads off `window`.
    Object.assign(globalThis, {
        window: globalThis,
        requestAnimationFrame: (run: () => void) => setImmediate(run),
        cancelAnimationFrame: (id: NodeJS.Immediate) => clearImmediate(id),
    });

    ({ useSlots, renderHook, useState } = await import(pathToFileURL(file).href));
});

after(async () => {
    await rm(out, { recursive: true, force: true });
});

const stat = (id: string): Widget =>
    ({ kind: 'key_number', id, label: id, value: '1', turn: 1 }) as Widget;

test('a card fit and a placement that start in one task both survive', async () => {
    const pinnedIds: string[] = [];
    const views = {};
    const props = { widgets: [stat('a')] };
    const tick = () => new Promise((resolve) => setImmediate(resolve));
    const hook = renderHook(
        () => {
            const [, bump] = useState(0);

            return {
                bump,
                slots: useSlots({
                    widgets: props.widgets,
                    pinnedIds,
                    views,
                    viewCols: 60,
                    placement: 'blocks',
                }),
            };
        },
        { rendersLater: true },
    );

    await hook.settle();

    const spawned = hook.result().slots.slots['a']!.h;

    // A new card is announced, and its placement frame is queued; before it
    // runs, the first card reports its fitted height.
    props.widgets = [stat('a'), stat('b')];
    hook.result().bump(1);
    await tick();
    hook.result().slots.fitRows('a', spawned + 3);
    await hook.settle();

    const { slots } = hook.result().slots;

    assert.equal(slots['a']?.h, spawned + 3);
    assert.ok(slots['b']);
    hook.unmount();
});
