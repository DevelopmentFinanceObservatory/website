/**
 * The server environment `unstable_cache` (next/cache) expects, so its own
 * code runs under `node --test`. Import this module before the module under
 * test. Like Next's server (next/dist/server/node-environment-baseline), it
 * puts AsyncLocalStorage on globalThis, which Next reads when its modules
 * load. It also installs an in-memory stand-in for the incremental cache Next
 * keeps at `globalThis.__incrementalCache`.
 *
 * Outside a render, `unstable_cache` reads an entry, runs the function when
 * there is none, and stores what the function returns. A function that throws
 * stores nothing. `stored` maps each key to its entry, revalidate period
 * included.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

type Entry = { kind: string; data: { body: string }; revalidate: number };

const stored = new Map<string, Entry>();

Object.assign(globalThis, {
    AsyncLocalStorage,
    __incrementalCache: {
        isOnDemandRevalidate: false,
        generateSimpleCacheKey: async (key: string) => key,
        get: async (key: string) => {
            const value = stored.get(key);

            return value ? { value, isStale: false } : null;
        },
        set: async (key: string, value: Entry) => {
            stored.set(key, value);
        },
    },
});

export const nextCache = { stored, clear: () => stored.clear() };
