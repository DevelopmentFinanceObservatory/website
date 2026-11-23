// How a page reads DFO data at build time. Each build-read page exports a `BuildPage`, whose
// `build` does all the page's DFO work, mostly through `readSettled`, which runs the page's
// sources through `readStored` (./liveRead.ts) at DFO's newest stored versions, with no fallback.
// `pnpm read` (scripts/read.mts) runs every page's `build` in one Node process before
// `next build` and writes each result to .build-data/ (./buildData.ts), which the page's server
// components render with `data-read-tier="built"`. Any failed read or refused derivation throws,
// so the build stops and production keeps the last good deploy.
//
// The build is often the first reader after DFO takes in new data, so it meets cold computes,
// which the client waits through. Each read may take BUILD_TIMEOUT_MS. While any dataset's
// `freshness` is `pending`, DFO is checking for newer data, so the read runs again every
// PENDING_RETRY_MS until none is, for at most BUILD_PENDING_BOUND_S seconds (an environment
// variable, default 0: take what DFO serves), then takes what it has.
//
// Build reads use their own anonymous client on the production API and their own lanes, at
// most READ_CONCURRENCY reads and ANALYSIS_CONCURRENCY recipes at once across every page, so a
// build from a shared runner address stays inside the gateway's allowances. This module runs on
// the server only; the client components of a page take its result as props.
import { Client, type Dataset } from '@developmentfinance/client';
import { type Freshness, isDerived } from '@developmentfinance/client/types';

import {
    ANALYSIS_CONCURRENCY,
    type Derive,
    type Fetcher,
    type LiveSource,
    READ_CONCURRENCY,
    type ReadLanes,
    readStored,
    type StoredRead,
} from './liveRead.ts';
import { createLane } from './pacing.ts';
import { recordOf } from './record.ts';

/** How long each build read may take, a cold compute included. */
export const BUILD_TIMEOUT_MS = 5 * 60_000;

/** The environment variable that bounds, in seconds, how long the build reads again while a
 *  dataset's freshness is `pending`, from the first read's start. Unset means 0. */
export const PENDING_BOUND_VARIABLE = 'BUILD_PENDING_BOUND_S';

/**
 * The pending bound in milliseconds from `env`'s BUILD_PENDING_BOUND_S, 0 when it is unset or
 * empty.
 *
 * @throws When the variable holds anything but a whole number of seconds.
 */
export const pendingBoundOf = (env: Readonly<Record<string, string | undefined>>): number => {
    const value = env[PENDING_BOUND_VARIABLE] ?? '';

    if (value === '') {
        return 0;
    }

    if (!/^\d+$/.test(value)) {
        throw new Error(
            `${PENDING_BOUND_VARIABLE} must be a whole number of seconds, not "${value}".`,
        );
    }

    return Number(value) * 1000;
};

/** How long the build waits before reading again while a dataset's freshness is `pending`. */
export const PENDING_RETRY_MS = 30_000;

/** One dataset version a read took: the spec and the content version DFO served. */
export type StoredVersion = { specId: string; contentVersion: string };

/** What the build read for one source: the dataset versions it took and how new DFO says they
 *  are. A ref's versions are its members'; a recipe's are the roots DFO resolved it on. */
export type BuildSource = { versions: StoredVersion[]; freshness: Freshness | null };

export type BuildRead<K extends string, T> = {
    /** What the page's derivation made of the rows. */
    value: T;
    /** When the last read finished, in UTC, as an ISO 8601 time, for the page to print. */
    retrieved: string;
    /** Each source's versions and freshness, for the page to print and a later check to compare
     *  against DFO's newest. */
    sources: Record<K, BuildSource>;
};

/** The dataset versions a read took, each once: a dataset member's own version, or for a
 *  derived member each root its recipe ran on. */
export const versionsOf = (dataset: Dataset): StoredVersion[] => {
    const seen = new Map<string, StoredVersion>();

    for (const member of dataset.ref.members) {
        const versions = isDerived(member)
            ? member.roots.map(({ specId, contentVersion }) => ({ specId, contentVersion }))
            : [{ specId: member.spec.spec_id, contentVersion: member.contentVersion }];

        for (const version of versions) {
            seen.set(`${version.specId}@${version.contentVersion}`, version);
        }
    }

    return [...seen.values()];
};

let client: Client | undefined;

/** The build's anonymous client on the production API. Built on first use. */
const buildClient = (): Client => {
    client ??= new Client({ apiKey: false });

    return client;
};

/** The build's lanes, apart from the browser pages' pacer, which every page's reads share. */
export const buildLanes: ReadLanes = {
    reads: createLane(READ_CONCURRENCY),
    recipes: createLane(ANALYSIS_CONCURRENCY),
};

export type BuildReadOptions = {
    /** Stands in for the build's client, as a test does. */
    client?: Fetcher;
    /** Stand in for the build's lanes. */
    lanes?: ReadLanes;
    timeout?: number;
    pendingBound?: number;
    retryDelay?: number;
    /** Stand in for the clock and the wait between reads. */
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
};

/**
 * Reads `sources` at DFO's newest stored versions and derives the page's figures, reading again
 * while any dataset's freshness is `pending`, within `pendingBound`.
 *
 * @throws An error naming `page`, whose cause is the failed read or the derivation's refusal.
 */
export const readSettled = async <K extends string, T>(
    page: string,
    sources: Record<K, LiveSource>,
    derive: Derive<K, T>,
    {
        client = buildClient(),
        lanes = buildLanes,
        timeout = BUILD_TIMEOUT_MS,
        pendingBound = pendingBoundOf(process.env),
        retryDelay = PENDING_RETRY_MS,
        now = Date.now,
        sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    }: BuildReadOptions = {},
): Promise<BuildRead<K, T>> => {
    const start = now();

    for (;;) {
        let read: StoredRead<K, T>;

        try {
            read = await readStored(sources, derive, { client, timeout, lanes });
        } catch (error) {
            throw new Error(`The build read of ${page} failed, so the build stops.`, {
                cause: error,
            });
        }

        // Object.keys widens to string. These are the keys of `sources`.
        const keys = Object.keys(sources) as K[];
        const pending = keys.filter((key) => read.datasets[key].freshness === 'pending');

        if (pending.length > 0 && now() - start + retryDelay <= pendingBound) {
            await sleep(retryDelay);
            continue;
        }

        if (pending.length > 0) {
            console.warn(
                `${page}: ${pending.join(', ')} still pending after ${Math.round((now() - start) / 1000)} s; the build takes the versions it has.`,
            );
        }

        return {
            value: read.value,
            retrieved: new Date(now()).toISOString(),
            sources: recordOf(keys, (key) => ({
                versions: versionsOf(read.datasets[key]),
                freshness: read.datasets[key].freshness,
            })),
        };
    }
};

/** One build-read page: its name, which names its file in .build-data/, and the function that
 *  does all its build-time DFO work and returns JSON-serialisable data. `options` carries the
 *  lanes the build shares across pages, for `build` to pass to `readSettled`. */
export type BuildPage<T> = {
    name: string;
    build: (options?: BuildReadOptions) => Promise<T>;
};
