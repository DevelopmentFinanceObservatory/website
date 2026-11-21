// `pnpm check:live <base-url>`: loads each live prototype page in Chromium, waits for its island's
// `data-read-tier` to leave `loading`, and checks the tier the page's live-read flag implies:
// `stored` with the flag on, `committed` with it off. The flags are read from the pages' source
// (READ_LIVE in fragility-finance's useFigures.ts, READ_AID_LIVE in hiv-financing's useAid.ts), so
// the check follows a switch with no edit here. oda-counts has no switch: its read is always on.
// Exits 1 on a mismatch, a page that never settles, or a script error on the page.
//
//   pnpm check:live https://developmentfinance.org/prototypes/
//   pnpm check:live http://localhost:8123/prototypes/ --insecure-local
//
// `--insecure-local` runs Chromium with web security off, so a page served from localhost can read
// DFO's API across origins. It is refused for any host but localhost.
//
// It needs playwright-core (a root dependency) and a Chromium: `pnpm exec playwright-core install
// chromium` at the repository root.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const APP = path.join(import.meta.dirname, '..');
const SETTLE_TIMEOUT_MS = 45_000;
const ISLAND = '[data-read-tier]';
const SETTLED = '[data-read-tier]:not([data-read-tier="loading"])';

export type Check = {
    slug: string;
    /** the source file holding the page's switch, or null when the page reads live always */
    flag: { file: string; name: string } | null;
};

export const CHECKS: Check[] = [
    { slug: 'oda-counts', flag: null },
    {
        slug: 'fragility-finance',
        flag: { file: 'app/fragility-finance/_components/useFigures.ts', name: 'READ_LIVE' },
    },
    {
        slug: 'hiv-financing',
        flag: { file: 'app/hiv-financing/_components/useAid.ts', name: 'READ_AID_LIVE' },
    },
];

/** The value of `export const <name> = true|false;` in a source file's text. */
export const readFlag = (source: string, name: string): boolean => {
    const match = new RegExp(`export const ${name}\\s*=\\s*(true|false)\\b`).exec(source);

    if (match === null) {
        throw new Error(`No \`export const ${name} = true|false\` found.`);
    }

    return match[1] === 'true';
};

/** The tier a page's flag implies: `stored` when it reads live, else `committed`. */
export const expectedTier = (live: boolean): 'stored' | 'committed' =>
    live ? 'stored' : 'committed';

export type Result = {
    slug: string;
    expected: string;
    /** the settled `data-read-tier`, or null when the page never settled */
    tier: string | null;
    ms: number;
    errors: string[];
};

/** The problems in one result, empty when the page passes. */
export const problems = (result: Result): string[] => [
    ...(result.tier === null
        ? [`never left \`loading\` within ${SETTLE_TIMEOUT_MS / 1000} s`]
        : result.tier === result.expected
          ? []
          : [`tier \`${result.tier}\`, expected \`${result.expected}\``]),
    ...result.errors.map((error) => `page error: ${error}`),
];

/** The exit code for a run: 1 when any result has a problem or there are none. */
export const exitCode = (results: Result[]): 0 | 1 =>
    results.length > 0 && results.every((result) => problems(result).length === 0) ? 0 : 1;

/** The part of a Playwright page the check uses. */
export type PageLike = {
    on(event: 'pageerror', handler: (error: Error) => void): unknown;
    goto(url: string): Promise<unknown>;
    waitForSelector(selector: string, options: { timeout: number }): Promise<unknown>;
    getAttribute(selector: string, name: string): Promise<string | null>;
};

/** Loads one page and times how long its island takes to settle. */
export const checkPage = async (
    page: PageLike,
    url: string,
    slug: string,
    expected: string,
    timeout = SETTLE_TIMEOUT_MS,
): Promise<Result> => {
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));

    const start = performance.now();
    let tier: string | null = null;

    try {
        await page.goto(url);
        await page.waitForSelector(SETTLED, { timeout });
        tier = await page.getAttribute(ISLAND, 'data-read-tier');
    } catch (error) {
        errors.push(error instanceof Error && error.name === 'TimeoutError' ? '' : String(error));
    }

    return {
        slug,
        expected,
        tier,
        ms: Math.round(performance.now() - start),
        errors: errors.filter((message) => message !== ''),
    };
};

const main = async () => {
    const args = process.argv.slice(2);
    const insecure = args.includes('--insecure-local');
    const base = args.find((arg) => !arg.startsWith('--'));

    if (base === undefined) {
        console.error('Usage: check-live.mts <base-url> [--insecure-local]');
        process.exit(2);
    }

    const root = new URL(base.endsWith('/') ? base : `${base}/`);

    if (insecure && !['localhost', '127.0.0.1'].includes(root.hostname)) {
        console.error('--insecure-local is for localhost only.');
        process.exit(2);
    }

    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({
        args: insecure ? ['--disable-web-security'] : [],
    });
    const results: Result[] = [];

    try {
        for (const { slug, flag } of CHECKS) {
            const live =
                flag === null
                    ? true
                    : readFlag(readFileSync(path.join(APP, flag.file), 'utf8'), flag.name);
            const page = await browser.newPage();

            results.push(
                await checkPage(
                    page as unknown as PageLike,
                    new URL(`${slug}/`, root).href,
                    slug,
                    expectedTier(live),
                ),
            );
            await page.close();
        }
    } finally {
        await browser.close();
    }

    for (const result of results) {
        const found = problems(result);

        console.log(
            `${found.length === 0 ? 'ok  ' : 'FAIL'} ${result.slug}: tier ${result.tier ?? 'none'} ` +
                `(expected ${result.expected}) settled in ${result.ms} ms`,
        );

        for (const problem of found) {
            console.log(`     ${problem}`);
        }
    }

    process.exit(exitCode(results));
};

if (import.meta.main) {
    await main();
}
