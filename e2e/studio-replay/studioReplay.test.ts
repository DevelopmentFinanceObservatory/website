/**
 * Plays every recorded Studio conversation (fixtures/) to its end on both
 * layouts against the production build, with no network beyond localhost
 * and no model. A run fails on a console error, a page error, a request no
 * route answers, a request the scenario did not expect, or a page that does
 * not show what the recording says: the plan or question at each pause, and
 * at the end as many cards as the last canvas holds and the start of the
 * last reply. The card-change regressions (regressions.ts) play after
 * them. The signed-in ones need Postgres (account.ts). Run with
 * `pnpm test:studio-replay` after `pnpm build`.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { type Browser, chromium } from 'playwright-core';

import { makeReader, postgresAt, type Reader } from './account.ts';
import { type Layout, openStudio, play, type Session } from './page.ts';
import { canvasView, EIGHT_LAST, PLACEHOLDERS, todayView } from './placeholders.ts';
import { REGRESSIONS } from './regressions.ts';
import { endState, loadScenario, pauseWords, type Scenario, SCENARIOS } from './scenario.ts';
import { startSite } from './site.ts';

const LAYOUTS: Layout[] = ['classic', 'prompt'];
const SHOW_MS = 10_000;

let site: Awaited<ReturnType<typeof startSite>>;
let browser: Browser;
// The signed-in reader, or why there is none.
let reader: Reader | Error;

before(async () => {
    // A refused connection to every address of the host is an
    // AggregateError with no message of its own.
    reader = await makeReader().catch(
        (error: unknown) =>
            new Error(
                error instanceof AggregateError
                    ? error.errors.map((one: Error) => one.message).join('; ')
                    : String(error),
            ),
    );
    site = await startSite(reader instanceof Error ? undefined : reader);
    browser = await chromium.launch({ headless: true });
});

after(async () => {
    await browser?.close();
    await site?.stop();

    if (reader && !(reader instanceof Error)) {
        await reader.close();
    }
});

for (const layout of LAYOUTS) {
    for (const name of SCENARIOS) {
        test(`${name} plays on ${layout}`, async () => {
            const scenario = loadScenario(name);
            const session = await openStudio(browser, site.url, scenario, layout);

            try {
                await playScenario(session, scenario);

                // The placeholder scenario on the classic layout compares its
                // canvas with this one's.
                if (name === 'eight' && layout === 'classic') {
                    todayView.eight = await canvasView(session.page, EIGHT_LAST);
                }
            } finally {
                await session.close();
            }
        });
    }
}

// The chart on the Prompt layout at a phone's width, and with reduced
// motion, which draw the dock, the sheet and the canvas by other rules.
const VARIANTS = {
    'at phone width': { viewport: { width: 390, height: 844 } },
    'with reduced motion': { reducedMotion: 'reduce' },
} as const;

for (const [variant, options] of Object.entries(VARIANTS)) {
    test(`chart plays on prompt ${variant}`, async () => {
        const scenario = loadScenario('chart');
        const session = await openStudio(browser, site.url, scenario, 'prompt', options);

        try {
            await playScenario(session, scenario);
        } finally {
            await session.close();
        }
    });
}

// The top bar's session title, renamed with each of the keys that end the
// edit. Tab leaves focus where it went, and Enter and Escape return it to
// Rename.
test('a session rename ends on Tab, Enter and Escape with focus where the reader sent it', async () => {
    const scenario = loadScenario('words');
    const session = await openStudio(browser, site.url, scenario, 'prompt');
    const { page } = session;
    const rename = page.getByRole('button', { name: 'Rename', exact: true });
    const field = page.getByRole('textbox', { name: 'Session title' });
    // The focused element's name a frame after the edit ends, when Rename
    // takes focus back, and the title the top bar shows.
    const after = async (key: string, text: string) => {
        await rename.click();
        await field.fill(text);
        await field.press(key);
        await field.waitFor({ state: 'detached', timeout: SHOW_MS });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        await page.evaluate(() => new Promise(requestAnimationFrame));

        return {
            focused: await page.evaluate(() => document.activeElement?.getAttribute('aria-label')),
            title: await rename.evaluate((button) => button.previousElementSibling?.textContent),
        };
    };

    try {
        await explained(session, async () => {
            await play(session, async () => {});
            await rename.waitFor({ timeout: SHOW_MS });

            assert.deepEqual(await after('Tab', 'Kept by Tab'), {
                focused: 'Focus canvas',
                title: 'Kept by Tab',
            });
            assert.deepEqual(await after('Enter', 'Kept by Enter'), {
                focused: 'Rename',
                title: 'Kept by Enter',
            });
            assert.deepEqual(await after('Escape', 'Dropped'), {
                focused: 'Rename',
                title: 'Kept by Enter',
            });
            assert.deepEqual(await after('Enter', ' '), {
                focused: 'Rename',
                title: 'Kept by Enter',
            });
            assert.deepEqual(
                { errors: session.errors, faults: session.player.faults },
                { errors: [], faults: [] },
            );
        });
    } finally {
        await session.close();
    }
});

for (const regression of [...REGRESSIONS, ...PLACEHOLDERS]) {
    test(`${regression.name} on ${regression.layout}`, { timeout: 60_000 }, async (t) => {
        if (regression.signedIn && reader instanceof Error) {
            if (process.env.STUDIO_REPLAY_NO_DB === '1') {
                t.skip(`no Postgres at ${postgresAt()}, and STUDIO_REPLAY_NO_DB=1`);

                return;
            }

            throw new Error(
                `This regression signs a reader in, which needs Postgres at ${postgresAt()} (PGHOST, PGPORT, PGUSER, PGPASSWORD), or STUDIO_REPLAY_NO_DB=1 to skip it: ${reader.message}`,
            );
        }

        const session = await openStudio(
            browser,
            site.url,
            regression.scenario(),
            regression.layout,
            regression.signedIn && !(reader instanceof Error) ? { cookie: reader.cookie } : {},
        );

        try {
            await explained(session, () => regression.run(session));
        } finally {
            await session.close();
        }
    });
}

// Runs `what`, and when it fails names the page's errors, unanswered
// requests and harness faults, which say why far more often than the step
// does.
const explained = async (session: Session, what: () => Promise<void>) => {
    try {
        await what();
    } catch (error) {
        const why = [
            ...session.errors,
            ...session.unanswered.map((one) => `unanswered: ${one}`),
            ...session.player.faults.map((one) => `fault: ${one}`),
        ];
        const message = error instanceof Error ? error.message : String(error);

        throw new Error(`${message}${why.length ? `\n${why.join('\n')}` : ''}`);
    }
};

// Plays `scenario` and checks what the page shows.
const playScenario = async (session: Session, scenario: Scenario) => {
    const step = (what: () => Promise<void>) =>
        explained(session, async () => {
            try {
                await what();
            } catch (error) {
                throw new Error(
                    error instanceof Error ? error.message.split('\n')[0] : String(error),
                );
            }
        });

    await step(() =>
        play(session, async (turn, segment) => {
            const words = pauseWords(scenario.turns[turn - 1]!.segments[segment]!);

            if (words) {
                await session.page
                    .getByText(words, { exact: false })
                    .filter({ visible: true })
                    .first()
                    .waitFor({ timeout: SHOW_MS });
            }
        }),
    );

    const end = endState(scenario);

    // The last reply shows once, and a reply drawn twice is a fault. A live
    // region's announcement of it is not a reply.
    let replies = 0;

    if (end.words) {
        const words = end.words;
        const shown = session.page.getByText(words, { exact: false }).filter({ visible: true });

        await step(() => shown.first().waitFor({ timeout: SHOW_MS }));
        replies = await shown.evaluateAll(
            (matches) =>
                matches.filter(
                    (match) => !match.closest('[aria-live], [role="alert"], [role="status"]'),
                ).length,
        );
    }

    // Each card on the canvas carries its id once. A placeholder carries
    // `data-coming`, and none outlives the turn once its fade is over.
    await session.page
        .waitForFunction(() => !document.querySelector('[data-coming]'), null, { timeout: 3000 })
        .catch(() => {});

    const { cards, coming } = await session.page.evaluate(() => ({
        cards: new Set(
            [...document.querySelectorAll<HTMLElement>('[data-card-id]')]
                .filter((card) => card.checkVisibility())
                .map((card) => card.dataset.cardId),
        ).size,
        coming: document.querySelectorAll('[data-coming]').length,
    }));

    assert.deepEqual(
        {
            cards,
            replies,
            coming,
            errors: session.errors,
            unanswered: session.unanswered,
            faults: session.player.faults,
        },
        {
            cards: end.cards,
            replies: end.words ? 1 : 0,
            coming: 0,
            errors: [],
            unanswered: [],
            faults: [],
        },
    );
};
