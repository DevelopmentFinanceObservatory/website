/**
 * `promptShell.ts`: the Prompt layout's shell reducer, when the session
 * panel shows, where the prompt box lands from the landing, and where the
 * canvas's view flies to.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    dockArrival,
    flyTarget,
    heldCard,
    initialShell,
    litCards,
    panelShows,
    type ShellAction,
    type ShellState,
    shellReducer,
} from '../promptShell.ts';

const run = (actions: ShellAction[], from: ShellState = initialShell): ShellState =>
    actions.reduce(shellReducer, from);

test('the panel shows once a card lands, unless the reader chose or focus mode is on', () => {
    for (const [actions, cards, overlay, shows] of [
        [[], 0, false, false],
        [[], 1, false, true],
        // A narrow window: the panel opens only when asked.
        [[], 1, true, false],
        [[{ type: 'panel.show', page: { kind: 'card', id: 'a' } }], 1, true, true],
        // The reader's own choice wins over the card rule, both ways.
        [[{ type: 'panel.toggle', shown: true }], 3, false, false],
        [[{ type: 'panel.toggle', shown: false }], 0, false, true],
        [[{ type: 'focus.set', on: true }], 3, false, false],
        // Dismissing an overlay records no choice: a wider window opens it
        // by the card rule again.
        [
            [{ type: 'panel.show', page: { kind: 'card', id: 'a' } }, { type: 'panel.dismiss' }],
            1,
            true,
            false,
        ],
        [
            [{ type: 'panel.show', page: { kind: 'card', id: 'a' } }, { type: 'panel.dismiss' }],
            1,
            false,
            true,
        ],
        // Leaving focus restores the choice made before it.
        [
            [
                { type: 'panel.toggle', shown: true },
                { type: 'focus.set', on: true },
                { type: 'focus.set', on: false },
            ],
            3,
            false,
            false,
        ],
    ] as const) {
        assert.equal(panelShows(run([...actions]), cards, overlay), shows, JSON.stringify(actions));
    }
});

test('the Session button in focus mode leaves focus and opens the panel', () => {
    const state = run([
        { type: 'panel.toggle', shown: true },
        { type: 'focus.set', on: true },
        { type: 'panel.toggle', shown: false },
    ]);

    assert.equal(state.focus, false);
    assert.equal(panelShows(state, 0), true);
});

test('a page pushes once, opens the panel, leaves focus, and back and home walk the trail', () => {
    const card = { kind: 'card', id: 'a' } as const;
    const plan = { kind: 'plan', turn: 2 } as const;
    const shown = run([
        { type: 'panel.toggle', shown: true },
        { type: 'focus.set', on: true },
        { type: 'panel.show', page: plan },
        { type: 'panel.show', page: card },
        { type: 'panel.show', page: { kind: 'card', id: 'a' } },
    ]);

    assert.deepEqual(shown.trail, [plan, card]);
    assert.equal(shown.focus, false);
    assert.equal(panelShows(shown, 0), true);
    assert.equal(heldCard(shown), 'a');

    const replaced = run([{ type: 'panel.replace', page: { kind: 'card', id: 'b' } }], shown);

    assert.deepEqual(replaced.trail, [plan, { kind: 'card', id: 'b' }]);
    assert.equal(heldCard(replaced), 'b');

    const back = run([{ type: 'panel.back' }], replaced);

    assert.deepEqual(back.trail, [plan]);
    assert.equal(heldCard(back), null);
    assert.deepEqual(run([{ type: 'panel.home' }], replaced).trail, []);
    assert.deepEqual(run([{ type: 'panel.back' }, { type: 'panel.back' }], back).trail, []);
    // Nothing to replace on the overview.
    assert.deepEqual(run([{ type: 'panel.replace', page: card }]).trail, []);
});

test('a sheet choice keeps the turn it was made for until another turn replaces it', () => {
    const chosen = run([{ type: 'sheet.set', sheet: 'open', turn: 3 }]);

    assert.deepEqual([chosen.sheet, chosen.sheetTurn], ['open', 3]);
    // A choice without a turn keeps the turn already held.
    const folded = run([{ type: 'sheet.set', sheet: 'folded' }], chosen);

    assert.deepEqual([folded.sheet, folded.sheetTurn], ['folded', 3]);
    const thread = run([{ type: 'sheet.set', sheet: 'thread', turn: 1 }], folded);

    assert.deepEqual([thread.sheet, thread.sheetTurn], ['thread', 1]);
});

test('a new question clears the sheet choice and keeps the panel page and the rest', () => {
    const before = run([
        { type: 'sheet.set', sheet: 'folded', turn: 2 },
        { type: 'panel.show', page: { kind: 'turn', turn: 1 } },
        { type: 'point', card: 'a' },
    ]);
    const after = run([{ type: 'question.sent' }], before);

    assert.equal(after.sheet, 'auto');
    assert.equal(after.sheetTurn, null);
    assert.deepEqual(after.trail, [{ kind: 'turn', turn: 1 }]);
    assert.equal(after.panelChoice, true);
    assert.equal(after.pointedCard, 'a');
});

test('a session reset returns the initial shell', () => {
    const state = run([
        { type: 'panel.show', page: { kind: 'source', id: 's' } },
        { type: 'focus.set', on: true },
        { type: 'sheet.set', sheet: 'thread', turn: 4 },
        { type: 'plan.light', turn: 2 },
        { type: 'session.reset' },
    ]);

    assert.deepEqual(state, initialShell);
});

test('the prompt box lands centred on the canvas frame, 30 above the foot, at most 600 wide', () => {
    // 1440 wide, panel closed: canvas 10..1430.
    assert.deepEqual(dockArrival({ width: 1440, height: 900, panelSpace: 10, unit: 1 }), {
        left: 420,
        top: 818,
        width: 600,
        height: 52,
    });
    // A narrow canvas takes its width less 40.
    assert.deepEqual(dockArrival({ width: 390, height: 844, panelSpace: 10, unit: 1 }), {
        left: 30,
        top: 762,
        width: 330,
        height: 52,
    });
    // Design px scale with the root font.
    assert.deepEqual(dockArrival({ width: 1440, height: 900, panelSpace: 20, unit: 2 }), {
        left: 120,
        top: 736,
        width: 1200,
        height: 104,
    });
});

test("lit cards: the pointed card's siblings, and the panel's plan while the panel shows", () => {
    const plans = [
        { turn: 1, cards: ['a', 'b', 'c'] },
        { turn: 3, cards: ['x', 'y'] },
    ];
    const planOf = (id: string) => plans.find((plan) => plan.cards.includes(id)) ?? null;
    const lit = (actions: ShellAction[], panelOpen = true) =>
        litCards({ state: run(actions), panelOpen, planOf, plans }).toSorted();

    assert.deepEqual(lit([]), []);
    assert.deepEqual(lit([{ type: 'point', card: 'b' }]), ['a', 'c']);
    // A card outside any plan lights nothing.
    assert.deepEqual(lit([{ type: 'point', card: 'z' }]), []);
    assert.deepEqual(lit([{ type: 'panel.show', page: { kind: 'plan', turn: 3 } }]), ['x', 'y']);
    assert.deepEqual(lit([{ type: 'plan.light', turn: 1 }]), ['a', 'b', 'c']);
    // The plan page wins over a plan line lit underneath it.
    assert.deepEqual(
        lit([
            { type: 'plan.light', turn: 1 },
            { type: 'panel.show', page: { kind: 'plan', turn: 3 } },
        ]),
        ['x', 'y'],
    );
    // A closed panel lights nothing of its own.
    assert.deepEqual(lit([{ type: 'plan.light', turn: 1 }], false), []);
    assert.deepEqual(
        lit(
            [
                { type: 'point', card: 'x' },
                { type: 'plan.light', turn: 1 },
            ],
            true,
        ),
        ['a', 'b', 'c', 'y'],
    );
});

test('a fly to a point near an edge of the sheet stops at that edge', () => {
    const view = { width: 1000, height: 600 };
    const max = { left: 2000, top: 3000 };

    assert.deepEqual(flyTarget({ cx: 200, cy: 100, view, max }), { left: 0, top: 0 });
    assert.deepEqual(flyTarget({ cx: 2900, cy: 3500, view, max }), { left: 2000, top: 3000 });
    assert.deepEqual(flyTarget({ cx: 1500, cy: 1300, view, max }), { left: 1000, top: 1000 });
});
