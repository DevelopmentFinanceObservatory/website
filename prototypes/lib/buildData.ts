// The files the build's reads leave for `next build`. `pnpm read` (scripts/read.mts) runs every
// build-read page's `build` (./buildRead.ts) in one process through one set of lanes and writes
// each result to .build-data/<page>.json, which git ignores. A page's server components read
// their file through `readBuilt`. Under `next build` a missing file fails the build. Under
// `next dev` it runs the page's `build` once per process and writes the file, so `pnpm dev`
// needs no separate step. Delete .build-data/ or run `pnpm read` again for newer figures.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { ANALYSIS_CONCURRENCY, READ_CONCURRENCY, type ReadLanes } from './liveRead.ts';
import { type BuildPage, buildLanes } from './buildRead.ts';
import { createLane } from './pacing.ts';

/** The directory under `prototypes/` the build's reads write to. */
export const BUILD_DATA_DIR = '.build-data';

/** The command that writes the files. */
export const READ_COMMAND = 'pnpm read';

/** The file `page`'s data goes to under `dir`. */
export const buildDataFile = (dir: string, page: string): string => path.join(dir, `${page}.json`);

/**
 * `data` as JSON, and what a reader of the file gets back.
 *
 * @throws When the JSON reads back as anything but `data`, such as a Map, a Date or an
 *  undefined field, which the file would lose.
 */
const serialised = <T>(data: T): { text: string; data: T } => {
    const text = JSON.stringify(data);
    // The text is `data`'s own JSON, checked equal to it below.
    const parsed = JSON.parse(text) as T;

    if (!isDeepStrictEqual(parsed, data)) {
        throw new Error('The data does not survive JSON: it holds a value JSON cannot carry.');
    }

    return { text, data: parsed };
};

/** Writes `page`'s data to its file under `dir`, and returns what a reader of the file gets. */
const writeBuilt = <T>(dir: string, page: string, data: T): T => {
    const out = serialised(data);

    mkdirSync(dir, { recursive: true });
    writeFileSync(buildDataFile(dir, page), `${out.text}\n`);

    return out.data;
};

export type ReadPagesOptions = {
    /** Where the files go. */
    dir: string;
    /** The lanes every page's reads share. */
    lanes?: ReadLanes;
    /** Stands in for the clock that times each page. */
    now?: () => number;
};

/** How long one page's build took, in milliseconds. */
export type PageTiming = { page: string; ms: number };

/**
 * Runs every page's `build` at once through one set of lanes, so the gateway's allowances hold
 * across pages, and writes each result to `dir`. Clears `dir` first, so no file outlives a
 * failed read.
 *
 * @throws An error naming each page that failed, whose cause is the failure, or an
 *  AggregateError of the failures when more than one page failed.
 */
export const readPages = async (
    pages: readonly BuildPage<unknown>[],
    {
        dir,
        lanes = { reads: createLane(READ_CONCURRENCY), recipes: createLane(ANALYSIS_CONCURRENCY) },
        now = Date.now,
    }: ReadPagesOptions,
): Promise<PageTiming[]> => {
    rmSync(dir, { recursive: true, force: true });

    const results = await Promise.allSettled(
        pages.map(async ({ name, build }) => {
            const started = now();

            writeBuilt(dir, name, await build({ lanes }));

            return { page: name, ms: now() - started };
        }),
    );
    const failed = results.flatMap((result, index) =>
        result.status === 'rejected' ? [{ page: pages[index]!.name, error: result.reason }] : [],
    );

    if (failed.length > 0) {
        const [first] = failed;

        throw new Error(
            `${failed.map(({ page }) => page).join(', ')}: the build read failed, so the build stops.`,
            {
                cause:
                    failed.length === 1
                        ? first!.error
                        : new AggregateError(failed.map(({ error }) => error)),
            },
        );
    }

    return results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
};

const building = new Map<string, Promise<unknown>>();

export type ReadBuiltOptions = {
    /** Where the files are. */
    dir?: string;
    /** Whether a missing file runs the page's `build`, as under `next dev`. */
    dev?: boolean;
};

/**
 * `page`'s data from its file in .build-data/. Under `next dev`, a missing file runs the page's
 * `build` once per process and writes the file; a failed build is dropped, so the next request
 * tries again.
 *
 * @throws When the file is missing outside `next dev`, naming the command that writes it.
 */
export const readBuilt = async <T>(
    page: BuildPage<T>,
    {
        dir = path.join(process.cwd(), BUILD_DATA_DIR),
        dev = process.env.NODE_ENV === 'development',
    }: ReadBuiltOptions = {},
): Promise<T> => {
    const file = buildDataFile(dir, page.name);
    let text: string;

    try {
        text = readFileSync(file, 'utf8');
    } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
            throw error;
        }

        if (!dev) {
            throw new Error(
                `${path.relative(process.cwd(), file)} is missing. Run \`${READ_COMMAND}\` in prototypes/ before next build; \`pnpm build\` runs it first.`,
                { cause: error },
            );
        }

        const held = building.get(page.name);

        if (held !== undefined) {
            // `page.name` names one page, whose `build` stored this promise.
            return held as Promise<T>;
        }

        const read = page
            .build({ lanes: buildLanes })
            .then((data) => writeBuilt(dir, page.name, data));

        building.set(page.name, read);
        read.then(
            () => building.delete(page.name),
            () => building.delete(page.name),
        );

        return read;
    }

    // The file is the JSON `readPages` or the dev path wrote for this page.
    return JSON.parse(text) as T;
};
