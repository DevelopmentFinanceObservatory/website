import assert from 'node:assert/strict';
import test from 'node:test';

import { isBrowserEventName } from '../events/browserEvents.ts';
import { type LayoutEventName, layoutEventProblem } from '../events/studioLayoutEvents.ts';

// POST /api/events takes a name only when isBrowserEventName passes it.
test('POST /api/events takes the browser names and refuses server events', async (t) => {
    const cases: [unknown, boolean][] = [
        ['search.query', true],
        ['studio.download', true],
        ['page.view', true],
        ['data.view', false],
        ['share.copy', true],
        ['share.open', false],
        ['auth.signin', false],
        ['feedback.submit', false],
        ['search.legacy', false],
        ['studio.panel', true],
        ['studio.change', true],
        ['studio.layout', false],
        [undefined, false],
    ];

    for (const [name, taken] of cases) {
        await t.test(String(name), () => {
            assert.equal(isBrowserEventName(name), taken);
        });
    }
});

// POST /api/events refuses a Prompt layout event whose props layoutEventProblem points at.
test('a Prompt layout event takes its listed members and nothing else', async (t) => {
    const prompt = { variant: 'prompt' };
    const cases: [LayoutEventName, Record<string, unknown>, string | null][] = [
        ['studio.panel', { action: 'open', how: 'card', ...prompt }, null],
        ['studio.panel_page', { view: 'overview', from: 'panel', ...prompt }, null],
        ['studio.card_select', { selected: false, ...prompt }, null],
        ['studio.focus', { on: true, how: 'button', ...prompt }, null],
        ['studio.change', { step: 'open', kind: 'years', ...prompt }, null],
        ['studio.change', { step: 'refused', kind: 'places', why: 'queue', ...prompt }, null],
        [
            'studio.change',
            { step: 'refused', kind: 'places', why: 'change_not_offered', ...prompt },
            null,
        ],
        ['studio.change', { step: 'refused', kind: 'years', why: 'assistant', ...prompt }, null],
        ['studio.sheet', { sheet: 'conversation', action: 'fold', how: 'canvas', ...prompt }, null],
        ['studio.plan', { decision: 'cancel', from: 'full_plan', ...prompt }, null],
        ['studio.new_session', { how: 'back', variant: 'classic' }, null],
        // An extra member, even one another event takes.
        ['studio.new_session', { how: 'button', title: 'Aid to Kenya', ...prompt }, '/title'],
        ['studio.card_select', { selected: true, cardId: 'w-1', ...prompt }, '/cardId'],
        // Free text in a listed member.
        ['studio.change', { step: 'refused', kind: 'unit', why: 'No data', ...prompt }, '/why'],
        ['studio.panel_page', { view: '/studio/abc', from: 'panel', ...prompt }, '/view'],
        ['studio.focus', { on: 'yes', how: 'button', ...prompt }, '/on'],
        // A member missing, the variant included.
        ['studio.sheet', { sheet: 'reply', action: 'open', ...prompt }, '/how'],
        ['studio.plan', { decision: 'approve', from: 'dock' }, '/variant'],
        ['studio.plan', { decision: 'approve', from: 'dock', variant: 'beta' }, '/variant'],
    ];

    for (const [name, props, problem] of cases) {
        await t.test(`${name} ${JSON.stringify(props)}`, () => {
            assert.equal(layoutEventProblem(name, props), problem);
        });
    }
});
