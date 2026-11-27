/**
 * Card changes played through the page's own controls, each guarding
 * against one fault. Each regression builds its conversation from the
 * recorded fixtures, answers the card changes from the recorded cards
 * (changes.ts), and asserts on what the reader sees and on the requests the
 * page sends.
 */
import assert from 'node:assert/strict';

import type { Page } from 'playwright-core';

import { refused, unitRedraw, yearsRedraw } from './changes.ts';
import type { Player } from './harness.ts';
import { type Layout, playTurn, type Session, settle } from './page.ts';
import { type Frame, loadScenario, type Manifest, type Scenario, type Turn } from './scenario.ts';

export type Regression = {
    name: string;
    layout: Layout;
    // Played by a signed-in reader (account.ts), whose page saves the
    // conversation and reads the harness's state.
    signedIn?: boolean;
    scenario: () => Scenario;
    run: (session: Session) => Promise<void>;
};

const CHART = 'cmp_replay_chart_c1';
const CHART_SPEC = 'spec_91d7345eec81a029629938b3d0ffd775';
const SHOW_MS = 10_000;

// The harness's sentences for the refusals the regressions draw.
const UNIT_STALE = 'This card has changed since its unit menu opened, so nothing changed.';
const PLAN_HOLDS = 'Approve or cancel the plan to change this card.';
const PLACES_OFF = "Changing a card's places is not enabled on this deployment.";

export const turnOf = (name: string, at = 0): Turn =>
    structuredClone(loadScenario(name).turns[at]!);

export const chartCanvas = (): Manifest =>
    loadScenario('chart').turns[0]!.segments[0]!.frames.findLast((frame) => frame.event === 'done')!
        .composition as Manifest;

/**
 * `turn` as it plays on a canvas that `before` left: every manifest the
 * turn sends is that canvas's own, a revision on, with the turn's cards
 * after `before`'s. The recordings each began on an empty canvas.
 */
export const onCanvas = (turn: Turn, before: Manifest): Turn => {
    let revision = before.revision;
    const moved = (manifest: Manifest): Manifest => {
        revision += 1;

        return {
            ...manifest,
            composition_id: before.composition_id,
            revision,
            blocks: [...before.blocks, ...manifest.blocks],
        };
    };

    for (const segment of turn.segments) {
        for (const frame of segment.frames) {
            if (frame.event === 'composition.updated') {
                frame.manifest = moved(frame.manifest as Manifest);
            } else if (frame.event === 'done' && frame.composition) {
                frame.composition = { ...moved(frame.composition as Manifest), revision };
            }
        }
    }

    return turn;
};

// The chart, then the plan's question on its canvas.
const chartThenPlan = (): Scenario => ({
    name: 'chart-then-plan',
    description: 'The chart, then the plan question on the same canvas.',
    turns: [turnOf('chart'), onCanvas(turnOf('plan'), chartCanvas())],
});

// The page's errors past those a scenario draws on purpose: a refusal's
// status, or a stream the harness broke (`net::ERR_INCOMPLETE_CHUNKED_ENCODING`).
const errorsBut = (session: Session, ...drawn: (number | string)[]) =>
    session.errors.filter(
        (error) =>
            !drawn.some((one) =>
                error.includes(
                    typeof one === 'number' ? `the server responded with a status of ${one}` : one,
                ),
            ),
    );

// The checks every regression ends on: no page error past those it drew
// (`drawn`), no unanswered request, no harness fault.
export const clean = (session: Session, ...drawn: (number | string)[]) =>
    assert.deepEqual(
        {
            errors: errorsBut(session, ...drawn),
            unanswered: session.unanswered,
            faults: session.player.faults,
        },
        { errors: [], unanswered: [], faults: [] },
    );

export const until = async (what: string, done: () => boolean, ms = SHOW_MS) => {
    for (let waited = 0; !done(); waited += 50) {
        if (waited > ms) throw new Error(`${what}: not within ${ms / 1000} s`);

        await new Promise((resolve) => setTimeout(resolve, 50));
    }
};

// Resolves with `promise`, or fails naming `what` after `ms`.
export const within = <T>(what: string, promise: Promise<T>, ms = 2 * SHOW_MS): Promise<T> =>
    Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${what}: not within ${ms / 1000} s`)), ms),
        ),
    ]);

// Resolves when the harness has ended the next `count` change turns.
export const changesEnd = (player: Player, count = 1) =>
    new Promise<void>((resolve) => {
        let left = count;
        const ended = () => {
            left -= 1;

            if (left === 0) {
                player.off('change-end', ended);
                resolve();
            }
        };

        player.on('change-end', ended);
    });

const cardChanges = (player: Player) =>
    player.requests.filter((request) => request.apply_change || request.apply_unit);

export const visible = (page: Page, text: string | RegExp) =>
    page.getByText(text).filter({ visible: true }).first();

export const shownCards = (page: Page) =>
    page.evaluate(() => [
        ...new Set(
            [...document.querySelectorAll<HTMLElement>('[data-card-id]')]
                .filter((card) => card.checkVisibility())
                .map((card) => card.dataset.cardId),
        ),
    ]);

// The Prompt layout's card page of the card titled `title` (the first card
// when none is named), opened from the card's source line.
export const openCardPage = async (page: Page, title?: string) => {
    const canvas = page.locator('[data-studio-canvas]');
    const card = title
        ? canvas.locator('[data-card-id]').filter({ hasText: title }).first()
        : canvas.locator('[data-card-id]').first();

    await card
        .getByRole('button', { name: /^Source/ })
        .first()
        .click();
    await page.getByRole('button', { name: 'Ask about this card' }).waitFor({ timeout: SHOW_MS });
};

// The card page's Change Years, with `from` and `to` picked and applied.
const changeYears = async (page: Page, from: number, to: number) => {
    await page.getByRole('button', { name: 'Change Years' }).click();

    const picker = page.getByRole('group', { name: 'Change Years' });
    const selects = picker.locator('select');

    await selects.nth(0).selectOption(String(from));
    await selects.nth(1).selectOption(String(to));
    await picker.getByRole('button', { name: 'Apply', exact: true }).click();
};

// The canvas card menu's Change unit, sent with currency `currency`.
export const changeCurrency = async (page: Page, currency: string) => {
    const card = page.locator('[data-card-id]').filter({ visible: true }).first();

    await card.getByRole('button', { name: 'Card menu' }).click();
    await page.getByRole('menuitem', { name: 'Change unit' }).click();
    await page.getByRole('button', { name: /^Currency,/ }).click();
    await page.getByText(currency, { exact: true }).filter({ visible: true }).first().click();
    await page
        .getByRole('button', { name: 'Send', exact: true })
        .filter({ visible: true })
        .last()
        .click();
};

// The lines under the card page's "Changed for:" label.
const changedFor = (page: Page) =>
    page
        .getByText('Changed for:')
        .filter({ visible: true })
        .evaluateAll((labels) =>
            labels.map((label) =>
                label.parentElement?.textContent?.replace('Changed for:', '').trim(),
            ),
        );

export const created = (frame: Frame) => frame.event === 'component.created';

// When each save the page made of its conversation (PUT
// /api/conversations/{id}) began, once the save is done, as a getter.
export const saves = (page: Page) => {
    const began: number[] = [];

    page.on('requestfinished', (request) => {
        if (request.method() === 'PUT' && request.url().includes('/api/conversations/')) {
            began.push(request.timing().startTime);
        }
    });

    return () => began;
};

// Reopens the conversation by its own URL, as a reload does, once a save
// that began after `after` (ms since the epoch) is done.
export const reopen = async (page: Page, saved: () => number[], after: number) => {
    await until('the conversation saved', () => saved().some((at) => at >= after), 2 * SHOW_MS);
    assert.match(new URL(page.url()).pathname, /^\/studio\/[\w-]+$/);
    await page.reload({ waitUntil: 'load' });
    // A reopened canvas draws its cards in well under this.
    await page.locator('[data-studio-canvas] [data-card-id]').first().waitFor({ timeout: 5000 });
    await settle(page);
};

// After a refused change while a plan waits, the approved plan leaves the
// earlier card on the canvas, as the harness's canvas keeps it. The Prompt
// layout checks the same within its fuller scenario below.
const refusedThenApproved = (layout: Layout): Regression => ({
    name: 'a card refused a change while a plan waits stays on the canvas once the plan is approved',
    layout,
    scenario: chartThenPlan,
    run: async (session) => {
        const { page, player } = session;

        player.answerChange = () => refused('scope_choice_stale', UNIT_STALE, '/apply_unit');
        await playTurn(session, 1);
        await playTurn(session, 2, { until: 2 });
        await changeCurrency(page, 'Euros');
        await until('the unit change sent', () => cardChanges(player).length === 1);
        await settle(page);

        const ended = new Promise<void>((resolve) =>
            player.on('segment-end', ({ turn, segment }) => {
                if (turn === 2 && segment === 3) resolve();
            }),
        );

        await page
            .getByRole('button', { name: /^approve/i })
            .filter({ visible: true })
            .first()
            .click();
        await within('the plan', ended);
        await settle(page);
        assert.deepEqual((await shownCards(page)).toSorted(), [
            CHART,
            'cmp_replay_plan_c1',
            'cmp_replay_plan_c2',
        ]);
        clean(session, 422);
    },
});

export const REGRESSIONS: Regression[] = [
    refusedThenApproved('classic'),
    {
        // A change queued behind another goes to the card that replaced its
        // card, also when the replacement and `done` arrive in one chunk.
        name: 'a queued change follows the card the change before it drew',
        layout: 'prompt',
        scenario: () => loadScenario('chart'),
        run: async (session) => {
            const { page, player } = session;
            let drawn = 0;

            player.answerChange = (request) => {
                drawn += 1;
                const id = `${CHART}_m${drawn}`;

                return request.apply_unit
                    ? unitRedraw(player, request, id, 'current euros')
                    : yearsRedraw(player, request, id);
            };
            await playTurn(session, 1);

            const release = player.holdNext(created);
            const ended = changesEnd(player, 2);

            await openCardPage(page);
            await changeYears(page, 2015, 2024);
            await until('the years change sent', () => cardChanges(player).length === 1);
            await changeCurrency(page, 'Euros');
            await settle(page);
            assert.equal(cardChanges(player).length, 1, 'the unit change waits in the queue');
            release();
            await within('the change turns', ended);
            await settle(page);

            const [, unit] = cardChanges(player);

            assert.deepEqual(
                {
                    component_id: (unit?.apply_unit as { component_id: string })?.component_id,
                    spec_id: (unit?.apply_unit as { spec_id: string })?.spec_id,
                },
                { component_id: `${CHART}_m1`, spec_id: `${CHART_SPEC}_${CHART}_m1` },
            );
            assert.deepEqual(await shownCards(page), [`${CHART}_m2`]);
            clean(session);
        },
    },
    {
        // A change queued on a card that the question before it takes off
        // the canvas leaves the queue unsent.
        name: 'a change queued on a card a question removes is dropped unsent',
        layout: 'prompt',
        scenario: () => {
            // The words turn's own canvas was empty. Here it is the chart's
            // canvas with the card taken off, a revision on, as a question
            // that removes the card leaves it.
            const words = turnOf('words');
            const before = chartCanvas();
            const emptied = {
                ...before,
                revision: before.revision + 1,
                blocks: [],
                counts: { ...(before.counts as object), all: 0, charts: 0 },
            };
            const frames = words.segments[0]!.frames;
            const done = frames.findIndex((frame) => frame.event === 'message.complete');

            frames.splice(done, 0, { event: 'composition.updated', seq: 0, manifest: emptied });
            frames.at(-1)!.composition = emptied;

            return {
                name: 'chart-then-removal',
                description: 'The chart, then a question that removes it.',
                turns: [turnOf('chart'), words],
            };
        },
        run: async (session) => {
            const { page, player } = session;

            player.answerChange = (request) => yearsRedraw(player, request, `${CHART}_m1`);
            await playTurn(session, 1);
            await openCardPage(page);

            const release = player.holdNext((frame) => frame.event === 'composition.updated');
            const asked = playTurn(session, 2);

            await until('the question sent', () => player.requests.length === 2);
            await changeYears(page, 2015, 2024);
            await visible(page, 'Changing').waitFor({ timeout: SHOW_MS });
            release();
            await within('the question', asked, 40_000);
            await settle(page);
            assert.deepEqual(cardChanges(player), [], 'no change request');
            assert.deepEqual(await shownCards(page), []);
            assert.equal(
                await page.getByText('Changing').filter({ visible: true }).count(),
                0,
                'no change shows as running',
            );
            clean(session);
        },
    },
    {
        // While a plan waits, the canvas card menu's Change unit and the card
        // page's Change rows are held with the reason, send no change, and
        // leave the plan approvable. The approved plan leaves the card on
        // the canvas.
        name: 'a waiting plan holds the card menu change unit with its reason, sends no change, and stays approvable',
        layout: 'prompt',
        scenario: chartThenPlan,
        run: async (session) => {
            const { page, player } = session;
            const plan = player.scenario.turns[1]!;
            const title = String(plan.segments[2]!.frames.at(-1)!.title);

            await playTurn(session, 1);
            await playTurn(session, 2, { until: 2 });
            await visible(page, title).waitFor({ timeout: SHOW_MS });

            const card = page.locator('[data-card-id]').filter({ visible: true }).first();

            await card.getByRole('button', { name: 'Card menu' }).click();

            const unitRow = page.getByRole('menuitem', { name: /^Change unit/ });

            await unitRow.waitFor({ timeout: SHOW_MS });
            assert.equal(await unitRow.getAttribute('aria-disabled'), 'true');
            assert.match((await unitRow.textContent()) ?? '', new RegExp(PLAN_HOLDS));
            // The row is aria-disabled, so the click goes past Playwright's
            // check for an enabled control.
            await unitRow.click({ force: true });
            await settle(page);
            assert.equal(
                await page.getByRole('dialog', { name: 'Change unit' }).count(),
                0,
                'Change unit opens no panel while the plan waits',
            );
            await page.keyboard.press('Escape');
            assert.equal(cardChanges(player).length, 0, 'no change request while the plan waits');

            await openCardPage(page);
            await visible(page, PLAN_HOLDS).waitFor({ timeout: SHOW_MS });
            // The row is aria-disabled, so the click goes past Playwright's
            // check for an enabled control.
            await page.getByRole('button', { name: 'Change Years' }).click({ force: true });
            assert.equal(
                await page.getByRole('group', { name: 'Change Years' }).count(),
                0,
                'Change Years opens no picker while the plan waits',
            );

            const interrupts = player.interrupts;
            const ended = new Promise<void>((resolve) =>
                player.on('segment-end', ({ turn, segment }) => {
                    if (turn === 2 && segment === 3) resolve();
                }),
            );

            await page
                .getByRole('button', { name: /^approve/i })
                .filter({ visible: true })
                .first()
                .click();
            await within('the plan', ended);
            await settle(page);
            assert.equal(player.interrupts, interrupts + 1);
            assert.deepEqual((await shownCards(page)).toSorted(), [
                CHART,
                'cmp_replay_plan_c1',
                'cmp_replay_plan_c2',
            ]);
            assert.equal(cardChanges(player).length, 0);
            clean(session);
        },
    },
    {
        // The card page's "Changed for" lists the changes that drew a card
        // of its chain, and leaves out the one the harness refused.
        name: 'Changed for names the admitted change alone, also once reopened',
        layout: 'prompt',
        signedIn: true,
        scenario: () => loadScenario('chart'),
        run: async (session) => {
            const { page, player } = session;
            const saved = saves(page);
            let asked = 0;

            player.answerChange = (request) => {
                asked += 1;

                // The recorded card holds no figures before 2010.
                return asked === 1
                    ? refused(
                          'change_no_data',
                          'The data holds no figures from 1973 to 1980.',
                          '/apply_change',
                      )
                    : yearsRedraw(player, request, `${CHART}_m1`);
            };
            await playTurn(session, 1);
            await openCardPage(page);
            await changeYears(page, 1973, 1980);
            await visible(page, 'The data holds no figures from 1973 to 1980.').waitFor({
                timeout: SHOW_MS,
            });

            const ended = changesEnd(player);

            await changeYears(page, 2015, 2024);
            await within('the change turns', ended);

            const changed = Date.now();

            await settle(page);
            assert.deepEqual(await shownCards(page), [`${CHART}_m1`]);
            assert.deepEqual(await changedFor(page), ['2015 to 2024']);

            await reopen(page, saved, changed);
            await openCardPage(page);
            assert.deepEqual(await shownCards(page), [`${CHART}_m1`]);
            assert.deepEqual(await changedFor(page), ['2015 to 2024']);
            clean(session, 422);
        },
    },
    {
        // A change runs on in the harness when its stream breaks. The page
        // that leaves mid-change and comes back resumes it, and a page whose
        // stream dropped and that reopens after the harness finished the
        // turn reads it back. Either way the redrawn card stands under the
        // answer that drew the card it replaced.
        name: 'a resumed or finished change keeps its card under its answer',
        layout: 'prompt',
        signedIn: true,
        scenario: () => loadScenario('chart'),
        run: async (session) => {
            const { page, player } = session;
            const saved = saves(page);
            const question = player.scenario.turns[0]!.question;
            const madeFor = async () =>
                assert.match(
                    (await visible(page, 'Made for:').locator('..').textContent()) ?? '',
                    new RegExp(question.slice(0, 30)),
                );
            let drawn = 0;

            player.answerChange = (request) => {
                drawn += 1;

                return yearsRedraw(player, request, `${CHART}_m${drawn}`);
            };
            await playTurn(session, 1);
            await until('the conversation saved', () => saved().length > 0);
            await openCardPage(page);

            let held = new Promise((resolve) => player.once('held', resolve));
            const ended = changesEnd(player);

            player.holdNext(created);
            await changeYears(page, 2015, 2024);
            await within('the change held', held);
            await page.reload({ waitUntil: 'load' });
            await within('the change resumed', ended);
            await settle(page);
            await openCardPage(page);
            assert.deepEqual(await shownCards(page), [`${CHART}_m1`]);
            await madeFor();

            held = new Promise((resolve) => player.once('held', resolve));
            player.holdNext(created, { drop: true })();
            await changeYears(page, 2018, 2024);
            await within('the second change held', held);
            await until('the stream broken', () => player.changeRunning);

            const broke = Date.now();

            player.finishRunning();
            await reopen(page, saved, broke);
            assert.deepEqual(await shownCards(page), [`${CHART}_m2`]);
            await openCardPage(page);
            await madeFor();
            clean(session, 'ERR_INCOMPLETE_CHUNKED_ENCODING');
        },
    },
    {
        // The reply's note says what its card shows since a change, and goes
        // once the card is changed back.
        name: 'the reply notes a change of years until it is changed back',
        layout: 'prompt',
        scenario: () => loadScenario('chart'),
        run: async (session) => {
            const { page, player } = session;
            let drawn = 0;
            const note = 'This card now shows 2015 to 2024.';

            player.answerChange = (request) => {
                drawn += 1;

                return yearsRedraw(player, request, `${CHART}_m${drawn}`);
            };
            await playTurn(session, 1);
            await openCardPage(page);

            let ended = changesEnd(player);

            await changeYears(page, 2015, 2024);
            await within('the change turns', ended);
            await settle(page);
            await page.getByRole('button', { name: 'Open the reply' }).click();
            await visible(page, note).waitFor({ timeout: SHOW_MS });
            await page.getByRole('button', { name: 'Fold the reply' }).click();

            ended = changesEnd(player);
            await changeYears(page, 2010, 2024);
            await within('the change turns', ended);
            await settle(page);
            await page.getByRole('button', { name: 'Open the reply' }).click();
            await settle(page);
            assert.equal(await page.getByText(note).filter({ visible: true }).count(), 0);
            clean(session);
        },
    },
    {
        // On the classic layout a unit change redraws the card in place, and a
        // change queued behind a question that pauses waits for the answer.
        name: 'a unit change redraws in place and a queued change waits for the plan',
        layout: 'classic',
        scenario: () => {
            // The plan's question comes after the unit change, so its canvas
            // holds the card that change drew.
            const before = chartCanvas();
            const changed = {
                ...before,
                revision: before.revision + 1,
                blocks: before.blocks.map((block) => ({ ...block, component_id: `${CHART}_m1` })),
            };

            return {
                name: 'chart-change-then-plan',
                description: 'The chart, its unit changed, then the plan question.',
                turns: [turnOf('chart'), onCanvas(turnOf('plan'), changed)],
            };
        },
        run: async (session) => {
            const { page, player } = session;
            let drawn = 0;

            player.answerChange = (request) => {
                drawn += 1;

                return unitRedraw(
                    player,
                    request,
                    `${CHART}_m${drawn}`,
                    drawn === 1 ? 'current euros' : 'current US dollars',
                );
            };
            await playTurn(session, 1);

            let ended = changesEnd(player);

            await changeCurrency(page, 'Euros');
            await within('the change turns', ended);
            await settle(page);
            assert.deepEqual(await shownCards(page), [`${CHART}_m1`]);

            const release = player.holdNext((frame) => frame.event === 'elicitation.request');
            let queued = false;
            const asked = playTurn(session, 2, {
                atPause: async (_, segment) => {
                    if (segment === 0) {
                        assert.ok(queued);
                    }

                    assert.equal(cardChanges(player).length, 1, 'the queued change waits');
                },
            });

            await until('the question sent', () => player.requests.length === 3);
            await changeCurrency(page, 'US dollars');
            queued = true;
            ended = changesEnd(player);
            release();
            await within('the question', asked, 40_000);
            await within('the change turns', ended);
            await settle(page);

            const [, unit] = cardChanges(player);

            assert.equal(
                (unit?.apply_unit as { component_id: string })?.component_id,
                `${CHART}_m1`,
            );
            assert.deepEqual((await shownCards(page)).toSorted(), [
                `${CHART}_m2`,
                'cmp_replay_plan_c1',
                'cmp_replay_plan_c2',
            ]);
            clean(session);
        },
    },
    {
        // A places list the deployment cannot give is final, so the card page offers no Try again.
        name: 'a disabled places capability offers no Try again',
        layout: 'prompt',
        scenario: () => loadScenario('plan'),
        run: async (session) => {
            const { page, player } = session;
            let reads = 0;

            player.answerPlaces = () => {
                reads += 1;

                return {
                    status: 503,
                    body: {
                        error: 'capability_unavailable',
                        retry: 'do_not_retry',
                        detail: PLACES_OFF,
                    },
                };
            };

            for (const at of player.scenario.turns.keys()) await playTurn(session, at + 1);

            await openCardPage(page, 'G7');
            await page.getByRole('button', { name: 'Change Providers' }).click();
            await visible(page, PLACES_OFF).waitFor({ timeout: SHOW_MS });
            assert.equal(await page.getByRole('button', { name: 'Try again' }).count(), 0);
            assert.equal(reads, 1);
            clean(session, 503);
        },
    },
];
