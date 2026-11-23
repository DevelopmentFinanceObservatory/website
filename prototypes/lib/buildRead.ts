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
// PENDING_RETRY_MS until none is, ending by BUILD_PENDING_BOUND_S seconds from the first read's
// start (an environment variable, default 0: take what DFO serves), then takes what it has. A
// read again gets only the time left to that bound, and if it fails the build takes the last
// complete read.
//
// Build reads use their own anonymous client on the production API and their own lanes, at
// most READ_CONCURRENCY reads and ANALYSIS_CONCURRENCY recipes at once across every page, so a
// build from a shared runner address stays inside the gateway's allowances. This module runs on
// the server only. The client components of a page take its result as props.
//
// A page whose figures come only from stored reads here reads them through `readChecked`, which
// records DFO's stored versions of every spec the reads take (`client.storedVersions`), checked
// before the reads and again after, so a check in the browser can tell whether DFO has stored
// newer data since the build.
import { Client, type StoredVersions } from '@developmentfinance/client';
import type { StoredVersionsJson } from '@developmentfinance/client/types';

import {
    ANALYSIS_CONCURRENCY,
    type Derive,
    type Fetcher,
    type LiveSource,
    READ_CONCURRENCY,
    type ReadLanes,
    readStored,
    storedTargets,
} from './liveRead.ts';
import { createLane } from './pacing.ts';
import { recordOf } from './record.ts';
import { type BuildSource, versionsOf } from './versions.ts';

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

export {
    type BuildSource,
    checkOneVersionPerSpec,
    splitVersions,
    type StoredVersion,
    versionsOf,
} from './versions.ts';

export type BuildRead<K extends string, T> = {
    /** What the page's derivation made of the rows. */
    value: T;
    /** When the last read finished, in UTC, as an ISO 8601 time, for the page to print. */
    retrieved: string;
    /** Each source's versions and freshness, for the page to print and a later check to compare
     *  against DFO's newest. */
    sources: Record<K, BuildSource>;
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

/** The part of a client a build read uses: `fetch`, and `storedVersions` for `readChecked`. */
export type Checker = Pick<Client, 'fetch' | 'storedVersions'>;

export type BuildReadOptions = {
    /** Stands in for the build's client, as a test does. */
    client?: Checker;
    /** Stand in for the build's lanes. */
    lanes?: ReadLanes;
    timeout?: number;
    pendingBound?: number;
    retryDelay?: number;
    /** Stand in for the clock and the wait between reads. */
    now?: () => number;
    sleep?: (ms: number) => Promise<void>;
};

/** One complete read of a page's sources: what the page made of it, and each source's versions
 *  and freshness. */
export type SourcedRead<K extends string, T> = Omit<BuildRead<K, T>, 'retrieved'>;

export type SettleOptions = Pick<
    BuildReadOptions,
    'timeout' | 'pendingBound' | 'retryDelay' | 'now' | 'sleep'
>;

/**
 * Runs `readOnce` and runs it again while any source's freshness is `pending`, within
 * `pendingBound`, as `readSettled` does for a page's DFO reads. `readOnce` gets the time it may
 * take: `timeout`, or for a read again the time left to the bound when that is less. A read again
 * that fails or times out leaves the last complete read, which the build takes with a warning. A
 * page whose reads run outside `readStored`, such as in a child process, settles them here.
 *
 * @throws An error naming `page`, whose cause is the first read's failure.
 */
export const settle = async <K extends string, T>(
    page: string,
    readOnce: (timeout: number) => Promise<SourcedRead<K, T>>,
    {
        timeout = BUILD_TIMEOUT_MS,
        pendingBound = pendingBoundOf(process.env),
        retryDelay = PENDING_RETRY_MS,
        now = Date.now,
        sleep = (ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    }: SettleOptions = {},
): Promise<BuildRead<K, T>> => {
    const start = now();
    let read: SourcedRead<K, T>;

    try {
        read = await readOnce(timeout);
    } catch (error) {
        throw new Error(`The build read of ${page} failed, so the build stops.`, {
            cause: error,
        });
    }

    let retrieved = now();
    let retryFailure = '';

    for (;;) {
        // Object.entries widens the keys to string. These are the keys of `read.sources`.
        const pending = (Object.entries(read.sources) as [K, BuildSource][])
            .filter(([, source]) => source.freshness === 'pending')
            .map(([key]) => key);

        if (pending.length === 0) {
            break;
        }

        // The bound is a deadline: a read again starts after retryDelay and may take only the
        // time left to the bound, and one left less than retryDelay is not started.
        if (retryFailure !== '' || pendingBound - (now() - start) - retryDelay < retryDelay) {
            warnPending(
                `${page}: ${pending.join(', ')} still pending after ${Math.round((now() - start) / 1000)} s${retryFailure}; the build takes the versions it has.`,
            );
            break;
        }

        await sleep(retryDelay);

        try {
            read = await readOnce(Math.min(timeout, pendingBound - (now() - start)));
            retrieved = now();
        } catch (error) {
            retryFailure = `, and the read again failed (${error instanceof Error ? error.message : String(error)})`;
        }
    }

    return {
        value: read.value,
        retrieved: new Date(retrieved).toISOString(),
        sources: read.sources,
    };
};

/**
 * Reads `sources` at DFO's newest stored versions and derives the page's figures, reading again
 * while any dataset's freshness is `pending`, within `pendingBound` (`settle`).
 *
 * @throws An error naming `page`, whose cause is the first read's failure or the derivation's
 *  refusal.
 */
export const readSettled = <K extends string, T>(
    page: string,
    sources: Record<K, LiveSource>,
    derive: Derive<K, T>,
    {
        client = buildClient(),
        lanes = buildLanes,
        ...options
    }: Omit<BuildReadOptions, 'client'> & { client?: Fetcher } = {},
): Promise<BuildRead<K, T>> => {
    // Object.keys widens to string. These are the keys of `sources`.
    const keys = Object.keys(sources) as K[];

    return settle(
        page,
        async (timeout) => {
            const read = await readStored(sources, derive, { client, timeout, lanes });

            return {
                value: read.value,
                sources: recordOf(keys, (key) => ({
                    versions: versionsOf(read.datasets[key]),
                    freshness: read.datasets[key].freshness,
                })),
            };
        },
        options,
    );
};

/** How long the build's stored-versions check may take: one GET, which DFO answers from its
 *  database. */
export const CHECK_TIMEOUT_MS = 60_000;

/** The most times `readChecked` reads a page's sources: the first read, one read again when
 *  the check moved during it, and one more while the pending bound has time left. */
export const CHECKED_READS = 3;

/** A build read with DFO's stored versions of every spec it read, which the page compares with
 *  a check in the browser. */
export type CheckedRead<K extends string, T> = BuildRead<K, T> & {
    /** The check taken after the reads, as `StoredVersions.toJSON()` writes it, equal to the
     *  one taken before them. */
    stored: StoredVersionsJson;
};

/**
 * Reads `sources` as `readSettled` does, between two checks of DFO's stored versions of every
 * spec they read, and records the check. When the checks differ, DFO stored newer data during
 * the reads, so the read runs again between the second check and a third, at most
 * CHECKED_READS times in all: a second read always, a third only while the pending bound has
 * time left, which each read again shares with `readSettled`'s. When the checks still differ
 * after the last read, the build takes that read and records the check taken before it, with a
 * warning naming the specs that moved: the visitors' checks then see the newer versions and read
 * them again in the browser.
 *
 * @throws An error naming `page` when a check or a read fails.
 */
export const readChecked = async <K extends string, T>(
    page: string,
    sources: Record<K, LiveSource>,
    derive: Derive<K, T>,
    { client = buildClient(), lanes = buildLanes, ...options }: BuildReadOptions = {},
): Promise<CheckedRead<K, T>> => {
    const { pendingBound = pendingBoundOf(process.env), now = Date.now } = options;
    const targets = storedTargets(sources);
    const check = async (): Promise<StoredVersions> => {
        try {
            return await lanes.reads.run(() =>
                client.storedVersions(targets, { timeout: CHECK_TIMEOUT_MS }),
            );
        } catch (error) {
            throw new Error(`The stored-versions check of ${page} failed, so the build stops.`, {
                cause: error,
            });
        }
    };
    const start = now();
    let before = await check();

    for (let reads = 1; ; reads += 1) {
        const left = Math.max(0, pendingBound - (now() - start));
        const read = await readSettled(page, sources, derive, {
            ...options,
            client,
            lanes,
            pendingBound: left,
        });
        const after = await check();

        if (after.equals(before)) {
            return { ...read, stored: after.toJSON() };
        }

        const changed = after.changedSince(before).join(', ');

        if (reads >= CHECKED_READS || (reads > 1 && now() - start >= pendingBound)) {
            warnPending(
                `${page}: DFO stored newer data of ${changed} during each of ${reads} build reads; the build takes the last read and records the versions from before it, so the page reads the newer ones in the browser.`,
            );

            return { ...read, stored: before.toJSON() };
        }

        console.info(
            `${page}: DFO stored newer data of ${changed} during the read; reading again.`,
        );
        before = after;
    }
};

/** Warns that the build takes data DFO has not confirmed as its newest. */
const warnPending = (message: string): void => {
    console.warn(message);

    // A workflow command on stdout, which GitHub Actions shows on the run's summary, so a green
    // daily run that took unconfirmed data says so where people look.
    if (process.env.GITHUB_ACTIONS) {
        console.log(`::warning::${message}`);
    }
};

/** One build-read page: its name, which names its file in .build-data/, and the function that
 *  does all its build-time DFO work and returns JSON-serialisable data. `options` carries the
 *  lanes the build shares across pages, for `build` to pass to `readSettled`. */
export type BuildPage<T> = {
    name: string;
    build: (options?: BuildReadOptions) => Promise<T>;
};
