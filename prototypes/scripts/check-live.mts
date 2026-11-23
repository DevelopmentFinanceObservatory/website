// `pnpm check:live <base-url> --commit <id> [--run <id>]` loads each live prototype page in
// Chromium, waits for its island's `data-read-tier` to leave `loading`, and checks two things. The
// page must carry the build it was asked for, in `<meta name="dfo-build">`, which the build stamps
// from DEPLOY_COMMIT and, in CI, GITHUB_RUN_ID (lib/buildStamp.ts). Then the tier must match the
// island's `data-read-live`, which each island renders from its read switch: `stored` with the
// switch on, `committed` with it off, and `built` for figures the build read from DFO.
// Every page in PAGES renders `built`: the build reads its figures (lib/buildRead.ts) and the
// browser reads nothing.
//
// After a deploy the edge can serve the previous build for a while, and that build passes its own
// tier check, so only the expected build counts. A scheduled rebuild of an unchanged commit
// differs from the previous deploy only in its run, so CI passes both. A run that finds another
// build, or none, is tried again, ATTEMPTS times in all, RETRY_DELAY_MS apart. Exits 1 when the
// last attempt finds a page that does not load, carries no island, never settles, serves another
// build, settles on the wrong tier, or throws. Exits 2 when no expected commit is given.
//
// The commit comes from `--commit <id>` or the EXPECTED_COMMIT environment variable, and the run
// from `--run <id>` or EXPECTED_RUN. Without a run, any build of the commit passes. A local build
// without DEPLOY_COMMIT stamps `local`.
//
//   pnpm check:live https://developmentfinance.org/prototypes/ --commit "$GITHUB_SHA" --run "$GITHUB_RUN_ID"
//   pnpm check:live http://localhost:8123/prototypes/ --insecure-local --commit local
//
// `--insecure-local` runs Chromium with web security off, so a page served from localhost can read
// DFO's API across origins. It is refused for any host but localhost.
//
// It needs playwright-core (a root dependency) and a Chromium: `pnpm exec playwright-core install
// chromium-headless-shell` at the repository root.

import { matchesBuild } from '../lib/buildStamp.ts';

/** How long a page may take to load. */
const NAVIGATION_TIMEOUT_MS = 30_000;
/** How long an island may take to leave `loading` once its page has loaded. */
const SETTLE_TIMEOUT_MS = 45_000;
/** How many times a failing run is tried in all, and how long apart. */
export const ATTEMPTS = 4;
export const RETRY_DELAY_MS = 20_000;

const ISLAND = '[data-read-tier]';
const BUILD_MARKER = 'meta[name="dfo-build"]';
const SETTLED = '[data-read-tier]:not([data-read-tier="loading"])';

/** The product token the check's browser adds to its User-Agent, so DFO's analytics counts the
 *  check's page reads as internal traffic and not as a new website visitor. */
export const CHECK_USER_AGENT_TOKEN = 'dfo-prototypes-check/1';

/** The check's User-Agent: the browser's own with the check's product token appended. */
export const checkUserAgent = (browserUserAgent: string): string =>
    `${browserUserAgent} ${CHECK_USER_AGENT_TOKEN}`;

/** The live prototype pages, by slug. */
export const PAGES = ['oda-counts', 'fragility-finance', 'hiv-financing', 'debt-thresholds'];

/** An island's `data-read-live`: true when it reads in the browser, false when it shows its
 *  committed figures, and `built` when its figures come from the build's read of DFO. */
export type LiveSwitch = boolean | 'built';

/** The tier a page's switch implies: `stored` when it reads live, `built` when the build read
 *  its figures, else `committed`. */
export const expectedTier = (live: LiveSwitch): 'stored' | 'committed' | 'built' =>
    live === 'built' ? 'built' : live ? 'stored' : 'committed';

/** An island's `data-read-live` as a switch, or null when it carries none or another value. */
export const liveSwitch = (attribute: string | null): LiveSwitch | null =>
    attribute === 'true'
        ? true
        : attribute === 'false'
          ? false
          : attribute === 'built'
            ? 'built'
            : null;

/**
 * Why a page gave no settled tier:
 *
 * - `navigation_timeout`: the page did not load within NAVIGATION_TIMEOUT_MS.
 * - `navigation_failed`: the page did not load, for the reason in `errors`.
 * - `no_island`: the loaded page holds no `[data-read-tier]`.
 * - `not_settled`: the island did not leave `loading` within SETTLE_TIMEOUT_MS.
 */
export type Failure = 'navigation_timeout' | 'navigation_failed' | 'no_island' | 'not_settled';

export type Result = {
    slug: string;
    /** the island's `data-read-live`, or null when it carries none or the page gave no island */
    live: LiveSwitch | null;
    /** the build the page was asked to serve: its commit, and its run or null for any run */
    expected: { commit: string; run: string | null };
    /** the build stamp the page serves, or null when it carries no marker */
    build: string | null;
    /** the settled `data-read-tier`, or null when the page gave none */
    tier: string | null;
    ms: number;
    failure: Failure | null;
    errors: string[];
};

const FAILURES: Record<Failure, string> = {
    navigation_timeout: `did not load within ${NAVIGATION_TIMEOUT_MS / 1000} s`,
    navigation_failed: 'did not load',
    no_island: 'holds no [data-read-tier] after load',
    not_settled: `never left \`loading\` within ${SETTLE_TIMEOUT_MS / 1000} s`,
};

/** The problems in one result, empty when the page passes. */
export const problems = (result: Result): string[] => {
    const errors = result.errors.map((error) => `page error: ${error}`);

    if (result.failure !== null) {
        return [FAILURES[result.failure], ...errors];
    }

    if (!matchesBuild(result.build, result.expected)) {
        const { commit, run } = result.expected;

        return [
            result.build === null
                ? 'the page carries no build marker'
                : `serves build \`${result.build}\`, expected \`${commit}${run === null ? '' : `+${run}`}\``,
            ...errors,
        ];
    }

    if (result.live === null) {
        return ['the island carries no data-read-live="true|false|built"', ...errors];
    }

    const expected = expectedTier(result.live);

    return [
        ...(result.tier === expected ? [] : [`tier \`${result.tier}\`, expected \`${expected}\``]),
        ...errors,
    ];
};

/** The exit code for a run: 1 when any result has a problem or there are none. */
export const exitCode = (results: Result[]): 0 | 1 =>
    results.length > 0 && results.every((result) => problems(result).length === 0) ? 0 : 1;

/** The part of a Playwright page the check uses. */
export type PageLike = {
    on(event: 'pageerror', handler: (error: Error) => void): unknown;
    goto(url: string, options: { timeout: number }): Promise<unknown>;
    $(selector: string): Promise<unknown>;
    waitForSelector(selector: string, options: { timeout: number }): Promise<unknown>;
    getAttribute(selector: string, name: string): Promise<string | null>;
};

const isTimeout = (error: unknown): boolean =>
    error instanceof Error && error.name === 'TimeoutError';

/** Loads one page and times how long its island takes to settle. */
export const checkPage = async (
    page: PageLike,
    url: string,
    slug: string,
    expected: { commit: string; run: string | null },
    { navigation = NAVIGATION_TIMEOUT_MS, settle = SETTLE_TIMEOUT_MS } = {},
): Promise<Result> => {
    const errors: string[] = [];

    page.on('pageerror', (error) => errors.push(error.message));

    const start = performance.now();
    const result = (over: Partial<Result>): Result => ({
        slug,
        live: null,
        build: null,
        tier: null,
        failure: null,
        ...over,
        expected,
        ms: Math.round(performance.now() - start),
        errors,
    });

    try {
        await page.goto(url, { timeout: navigation });
    } catch (error) {
        if (isTimeout(error)) {
            return result({ failure: 'navigation_timeout' });
        }

        errors.push(String(error));

        return result({ failure: 'navigation_failed' });
    }

    if ((await page.$(ISLAND)) === null) {
        return result({ failure: 'no_island' });
    }

    try {
        await page.waitForSelector(SETTLED, { timeout: settle });
    } catch (error) {
        if (!isTimeout(error)) {
            errors.push(String(error));
        }

        return result({ failure: 'not_settled' });
    }

    return result({
        build: await page.getAttribute(BUILD_MARKER, 'content'),
        tier: await page.getAttribute(ISLAND, 'data-read-tier'),
        live: liveSwitch(await page.getAttribute(ISLAND, 'data-read-live')),
    });
};

/**
 * Runs `attempt` until it passes or `attempts` runs are done, `sleep`ing `delayMs` between them,
 * and returns the last run's results. `onRetry` hears each failed run before the next.
 */
export const withRetries = async (
    attempt: () => Promise<Result[]>,
    {
        attempts = ATTEMPTS,
        delayMs = RETRY_DELAY_MS,
        sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
        onRetry = () => {},
    }: {
        attempts?: number;
        delayMs?: number;
        sleep?: (ms: number) => Promise<void>;
        onRetry?: (results: Result[], run: number) => void;
    } = {},
): Promise<Result[]> => {
    for (let run = 1; ; run += 1) {
        const results = await attempt();

        if (exitCode(results) === 0 || run >= attempts) {
            return results;
        }

        onRetry(results, run);
        await sleep(delayMs);
    }
};

const report = (result: Result): string[] => {
    const found = problems(result);
    const expected = result.live === null ? 'none' : expectedTier(result.live);

    return [
        `${found.length === 0 ? 'ok  ' : 'FAIL'} ${result.slug}: build ${result.build ?? 'none'}, ` +
            `tier ${result.tier ?? 'none'} (data-read-live ${result.live ?? 'none'}, expected ${expected}) in ${result.ms} ms`,
        ...found.map((problem) => `     ${problem}`),
    ];
};

const main = async () => {
    const args = process.argv.slice(2);
    const insecure = args.includes('--insecure-local');
    const flag = args.indexOf('--commit');
    const runFlag = args.indexOf('--run');
    const expectedCommit =
        (flag === -1 ? undefined : args[flag + 1]) || process.env.EXPECTED_COMMIT;
    const expectedRun =
        (runFlag === -1 ? undefined : args[runFlag + 1]) || process.env.EXPECTED_RUN;
    const values = [flag, runFlag].filter((at) => at !== -1).map((at) => at + 1);
    const base = args.find((arg, index) => !arg.startsWith('--') && !values.includes(index));

    if (base === undefined || !expectedCommit) {
        console.error(
            'Usage: check-live.mts <base-url> --commit <id> [--run <id>] [--insecure-local]\n' +
                'The commit may also come from EXPECTED_COMMIT and the run from EXPECTED_RUN.',
        );
        process.exit(2);
    }

    const expected = { commit: expectedCommit, run: expectedRun || null };

    const root = new URL(base.endsWith('/') ? base : `${base}/`);

    if (insecure && !['localhost', '127.0.0.1'].includes(root.hostname)) {
        console.error('--insecure-local is for localhost only.');
        process.exit(2);
    }

    const { chromium } = await import('playwright-core');
    const browser = await chromium.launch({
        args: insecure ? ['--disable-web-security'] : [],
    });

    const probe = await browser.newPage();
    const browserUserAgent = await probe.evaluate(() => navigator.userAgent);

    await probe.close();

    const context = await browser.newContext({ userAgent: checkUserAgent(browserUserAgent) });

    const attempt = async (): Promise<Result[]> => {
        const results: Result[] = [];

        for (const slug of PAGES) {
            const page = await context.newPage();

            results.push(
                await checkPage(
                    page as unknown as PageLike,
                    new URL(`${slug}/`, root).href,
                    slug,
                    expected,
                ),
            );
            await page.close();
        }

        return results;
    };

    let results: Result[];

    try {
        results = await withRetries(attempt, {
            onRetry: (failed, run) => {
                console.log(
                    `Attempt ${run} of ${ATTEMPTS} failed; trying again in ${RETRY_DELAY_MS / 1000} s.`,
                );

                for (const result of failed.filter((each) => problems(each).length > 0)) {
                    console.log(report(result).join('\n'));
                }
            },
        });
    } finally {
        await browser.close();
    }

    console.log(results.flatMap(report).join('\n'));
    process.exit(exitCode(results));
};

if (import.meta.main) {
    await main();
}
