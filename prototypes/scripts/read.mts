// `pnpm read`: every build-read page's DFO reads, in one process through one set of lanes, each
// page's result written to .build-data/<page>.json (lib/buildData.ts). `pnpm build` runs it
// before `next build`; a failed read stops the build there, naming the page and the cause.
// BUILD_PENDING_BOUND_S bounds how long a read waits while DFO's freshness is `pending`
// (lib/buildRead.ts): unset, the build takes what DFO serves.
//
// A page is build-read when it has `_lib/build.ts`, whose default export is its `BuildPage`,
// named after the page's directory. A page with no such file reads nothing here.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { BUILD_DATA_DIR, readPages } from '../lib/buildData.ts';
import type { BuildPage } from '../lib/buildRead.ts';

const APP = path.join(import.meta.dirname, '..');
const PAGES_DIR = path.join(APP, 'app');

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const isBuildPage = (value: unknown): value is BuildPage<unknown> =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { name?: unknown }).name === 'string' &&
    typeof (value as { build?: unknown }).build === 'function';

/**
 * Every page's BuildPage, from the default export of app/<page>/_lib/build.ts.
 *
 * @throws When a build.ts has no BuildPage as its default export, or names another page.
 */
const findPages = async (): Promise<BuildPage<unknown>[]> => {
    const dirs = readdirSync(PAGES_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => existsSync(path.join(PAGES_DIR, name, '_lib', 'build.ts')))
        .sort();

    return Promise.all(
        dirs.map(async (dir) => {
            const file = path.join(PAGES_DIR, dir, '_lib', 'build.ts');
            const page: unknown = (await import(pathToFileURL(file).href)).default;

            if (!isBuildPage(page)) {
                throw new Error(
                    `app/${dir}/_lib/build.ts must export its BuildPage (lib/buildRead.ts) as the default export.`,
                );
            }

            if (page.name !== dir) {
                throw new Error(
                    `app/${dir}/_lib/build.ts names its page "${page.name}"; the name must be the directory, "${dir}".`,
                );
            }

            return page;
        }),
    );
};

const started = Date.now();

try {
    const timings = await readPages(await findPages(), { dir: path.join(APP, BUILD_DATA_DIR) });

    for (const { page, ms } of timings) {
        console.log(`read: ${page} in ${seconds(ms)}`);
    }

    console.log(
        `read: ${timings.length} pages to ${BUILD_DATA_DIR}/ in ${seconds(Date.now() - started)}`,
    );
} catch (error) {
    console.error('read:', error);
    process.exit(1);
}
