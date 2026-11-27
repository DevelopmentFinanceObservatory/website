/**
 * Plays every recorded Studio conversation (fixtures/) to its end on both
 * layouts against the production build, with no network beyond localhost
 * and no model. A run fails on a console error, a page error, a request no
 * route answers, a request the scenario did not expect, or a page that does
 * not show what the recording says: the plan or question at each pause, and
 * at the end as many cards as the last canvas holds and the start of the
 * last reply. Run with `pnpm test:studio-replay` after `pnpm build`.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { type Browser, chromium } from 'playwright-core';

import { makeReader, postgresAt, type Reader } from './account.ts';
import { type Layout, openStudio, play, type Session } from './page.ts';
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
            } finally {
                await session.close();
            }
        });
    }
}

for (const regression of REGRESSIONS) {
    test(`${regression.name} on ${regression.layout}`, { timeout: 60_000 }, async () => {
        if (regression.signedIn && reader instanceof Error) {
            throw new Error(
                `This regression signs a reader in, which needs Postgres at ${postgresAt()} (PGHOST, PGPORT, PGUSER, PGPASSWORD): ${reader.message}`,
            );
        }

        const session = await openStudio(
            browser,
            site.url,
            regression.scenario(),
            regression.layout,
            regression.signedIn && !(reader instanceof Error) ? reader.cookie : undefined,
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

    if (end.words) {
        const words = end.words;

        await step(() =>
            session.page
                .getByText(words, { exact: false })
                .filter({ visible: true })
                .first()
                .waitFor({ timeout: SHOW_MS }),
        );
    }

    // Each card on the canvas carries its id once.
    const cards = await session.page.evaluate(
        () =>
            new Set(
                [...document.querySelectorAll<HTMLElement>('[data-card-id]')]
                    .filter((card) => card.checkVisibility())
                    .map((card) => card.dataset.cardId),
            ).size,
    );

    assert.deepEqual(
        {
            cards,
            errors: session.errors,
            unanswered: session.unanswered,
            faults: session.player.faults,
        },
        { cards: end.cards, errors: [], unanswered: [], faults: [] },
    );
};
