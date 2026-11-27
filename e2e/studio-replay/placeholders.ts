/**
 * Placeholders for coming cards, played from recorded streams with the
 * contract's placeholder members added (coming.ts). The Prompt layout draws
 * each placeholder (`data-coming`) from its drawing line's running frame
 * until its card lands in its place, the line closes or the stream ends.
 * The classic layout draws none and behaves as it does without the members.
 */
import assert from 'node:assert/strict';

import type { Page } from 'playwright-core';

import { withComing } from './coming.ts';
import { openStudio, playTurn, type Session, settle } from './page.ts';
import { clean, created, type Regression, shownCards, visible, within } from './regressions.ts';
import { loadScenario } from './scenario.ts';

const SHOW_MS = 10_000;

// The placeholders on the page: id, label and place in the canvas.
const ghosts = (page: Page) =>
    page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-coming]')].map((ghost) => ({
            id: ghost.dataset.coming!,
            label: ghost.querySelector('[class*="comingKind"]')?.textContent ?? '',
            left: ghost.offsetLeft,
            top: ghost.offsetTop,
        })),
    );

// Where card `id` stands in the canvas.
const placeOf = (page: Page, id: string) =>
    page.evaluate((card) => {
        const element = document.querySelector<HTMLElement>(`[data-card-id="${card}"]`);

        return element ? { left: element.offsetLeft, top: element.offsetTop } : null;
    }, id);

// Counts every placeholder the page ever draws, from now on.
const countGhosts = (page: Page) =>
    page.evaluate(() => {
        const seen = new Set<string>();
        const watch = new MutationObserver(() => {
            for (const ghost of document.querySelectorAll<HTMLElement>('[data-coming]')) {
                seen.add(ghost.dataset.coming ?? '');
            }
        });

        watch.observe(document.body, { childList: true, subtree: true, attributes: true });
        Object.assign(window, { replayGhosts: seen });
    });

const ghostsSeen = (page: Page) =>
    page.evaluate(() => (window as unknown as { replayGhosts: Set<string> }).replayGhosts.size);

// A placeholder leaves with a fade (comingLeaving) and is gone after it.
const LEAVE_MS = 3000;

const noGhosts = async (page: Page) => {
    await page
        .waitForFunction(() => !document.querySelector('[data-coming]'), null, {
            timeout: LEAVE_MS,
        })
        .catch(() => {});
    assert.deepEqual(await ghosts(page), []);
};

// Plays turn 1 with the stream held at its first card, runs `atHold`, then
// lets the rest go.
const heldAtFirstCard = async (session: Session, atHold: () => Promise<void>) => {
    const held = new Promise((resolve) => session.player.once('held', resolve));
    const release = session.player.holdNext(created);
    const played = playTurn(session, 1);

    await within('the first card held', held);
    await settle(session.page);
    await atHold();
    release();
    await within('the turn', played, 40_000);
    await settle(session.page);
};

const FIVE = ['cmp_replay_five_c1', 'cmp_replay_five_c2', 'cmp_replay_five_c3'];

// The scroll position of the classic canvas, and whether card `id` is in view.
export const canvasView = (page: Page, id: string) =>
    page.evaluate((card) => {
        const canvas = document.querySelector<HTMLElement>('[class*="canvasContent"]');
        const box = canvas?.getBoundingClientRect();
        const at = document.querySelector(`[data-card-id="${card}"]`)?.getBoundingClientRect();

        return {
            scrollTop: canvas?.scrollTop ?? null,
            inView: !!box && !!at && at.top < box.bottom && at.bottom > box.top,
        };
    }, id);

/** The card `eight`'s last turn draws below the view. */
export const EIGHT_LAST = 'cmp_replay_eight_c7';

/** The classic canvas once `eight` has played without placeholder members, as
 *  "eight plays on classic" leaves it; read anew when that test did not
 *  run first. */
export const todayView: { eight?: Awaited<ReturnType<typeof canvasView>> } = {};

export const PLACEHOLDERS: Regression[] = [
    {
        // The classic layout draws no placeholder, and scrolls to a card that
        // lands off view as it does without the members.
        name: 'placeholders leave today’s canvas as it was',
        layout: 'classic',
        scenario: () => withComing(loadScenario('eight')),
        run: async (session) => {
            const { page, player } = session;

            await countGhosts(page);

            for (const at of player.scenario.turns.keys()) await playTurn(session, at + 1);

            const shown = await canvasView(page, EIGHT_LAST);
            const ghostCount = await ghostsSeen(page);

            if (!todayView.eight) {
                const plain = await openStudio(
                    session.browser,
                    session.siteUrl,
                    loadScenario('eight'),
                    'classic',
                );

                try {
                    for (const at of plain.player.scenario.turns.keys()) {
                        await playTurn(plain, at + 1);
                    }

                    todayView.eight = await canvasView(plain.page, EIGHT_LAST);
                } finally {
                    await plain.close();
                }
            }

            assert.deepEqual(
                { ghosts: ghostCount, ...shown },
                { ghosts: 0, ...todayView.eight, inView: true },
            );
            clean(session);
        },
    },
    {
        // The running line's placeholders show, each card lands where its
        // placeholder stood, and none is left once the turn ends.
        name: 'each card lands in its placeholder and none is left',
        layout: 'prompt',
        scenario: () => withComing(loadScenario('five')),
        run: async (session) => {
            const { page } = session;
            let stood: Awaited<ReturnType<typeof ghosts>> = [];

            await heldAtFirstCard(session, async () => {
                stood = await ghosts(page);
            });
            assert.deepEqual(
                stood.map((ghost) => ghost.id),
                ['s13.0', 's13.1', 's13.2'],
            );

            for (const [index, ghost] of stood.entries()) {
                assert.deepEqual(await placeOf(page, FIVE[index]!), {
                    left: ghost.left,
                    top: ghost.top,
                });
            }

            await noGhosts(page);
            clean(session);
        },
    },
    {
        name: 'Stop leaves no placeholder',
        layout: 'prompt',
        scenario: () => withComing(loadScenario('five')),
        run: async (session) => {
            const { page, player } = session;
            const held = new Promise((resolve) => player.once('held', resolve));

            player.holdNext(created);
            void playTurn(session, 1).catch(() => {});
            await within('the first card held', held);
            await visible(page, 'Stop').waitFor({ timeout: SHOW_MS });
            assert.equal((await ghosts(page)).length, 3);
            await page.getByRole('button', { name: 'Stop', exact: true }).click();
            await settle(page);
            await noGhosts(page);
            clean(session);
        },
    },
    {
        name: 'an error frame leaves no placeholder',
        layout: 'prompt',
        scenario: () => {
            // The five question's stream to its first drawing line, then the
            // error the error recording ended on.
            const five = withComing(loadScenario('five'));
            const frames = five.turns[0]!.segments[0]!.frames;
            const drawing = frames.findIndex(
                (frame) => frame.event === 'activity.step' && frame.coming,
            );
            const error = loadScenario('error').turns[0]!.segments[0]!.frames.find(
                (frame) => frame.event === 'error',
            )!;

            return {
                ...five,
                name: 'five-error',
                turns: [
                    {
                        question: five.turns[0]!.question,
                        segments: [
                            { frames: [...frames.slice(0, drawing + 1), { ...error, seq: 99 }] },
                        ],
                    },
                ],
            };
        },
        run: async (session) => {
            const { page, player } = session;
            const held = new Promise((resolve) => player.once('held', resolve));
            const release = player.holdNext((frame) => frame.event === 'error');
            const played = playTurn(session, 1);

            await within('the error held', held);
            await settle(page);
            assert.equal((await ghosts(page)).length, 3);
            release();
            await within('the turn', played);
            await settle(page);
            await noGhosts(page);
            clean(session);
        },
    },
    {
        // A waiting plan shows one Planned placeholder; once its drawing line
        // opens, the line's own placeholders stand in its place.
        name: 'a plan’s Planned placeholder gives way to its drawing ones',
        layout: 'prompt',
        scenario: () => withComing(loadScenario('plan')),
        run: async (session) => {
            const { page, player } = session;
            const labels = async () => (await ghosts(page)).map((ghost) => ghost.label);
            let waiting: string[] = [];
            let drawing: string[] = [];

            await playTurn(session, 1, {
                atPause: async (_, segment) => {
                    if (segment !== 2) return;

                    await settle(page);
                    waiting = await labels();

                    const held = new Promise((resolve) => player.once('held', resolve));
                    const release = player.holdNext(created);

                    void held.then(async () => {
                        await settle(page);
                        drawing = await labels();
                        release();
                    });
                },
            });

            assert.deepEqual(waiting, ['Planned']);
            assert.ok(drawing.length > 0, 'the drawing placeholders show');
            assert.deepEqual(
                drawing.filter((label) => label === 'Planned'),
                [],
                `no Planned placeholder beside the drawing ones: ${drawing.join(', ')}`,
            );
            assert.deepEqual((await shownCards(page)).length, 2);
            await noGhosts(page);
            clean(session);
        },
    },
];
