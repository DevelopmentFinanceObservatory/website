/**
 * `studioRoute.ts`: reading the search API's Studio route, and the page's
 * move for it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
    clickLeavesPage,
    guestPromptsSeen,
    routeMove,
    studioRoute,
    visitorIsGuest,
} from '../studioRoute.ts';
import type { StudioRoute } from '../types.ts';

test('studioRoute reads a Studio route and refuses anything else', async (t) => {
    const cases: [string, unknown, StudioRoute | null][] = [
        [
            'auto with a probability',
            { target: 'studio', mode: 'auto', probability: 0.93 },
            { target: 'studio', mode: 'auto', probability: 0.93 },
        ],
        [
            'auto from the question read',
            { target: 'studio', mode: 'auto', probability: null },
            { target: 'studio', mode: 'auto', probability: null },
        ],
        [
            'offer with no probability key',
            { target: 'studio', mode: 'offer' },
            { target: 'studio', mode: 'offer', probability: null },
        ],
        ['null', null, null],
        ['another target', { target: 'search', mode: 'auto', probability: 0.9 }, null],
        ['an unknown mode', { target: 'studio', mode: 'later', probability: 0.9 }, null],
        ['a probability above 1', { target: 'studio', mode: 'offer', probability: 1.2 }, null],
        ['a probability as text', { target: 'studio', mode: 'offer', probability: '0.7' }, null],
    ];

    for (const [name, value, expected] of cases) {
        await t.test(name, () => assert.deepEqual(studioRoute(value), expected));
    }
});

test('routeMove moves on an auto decline, holds it for a guest out of prompts, and offers Studio otherwise', async (t) => {
    const auto: StudioRoute = { target: 'studio', mode: 'auto', probability: 0.95 };
    const offer: StudioRoute = { target: 'studio', mode: 'offer', probability: 0.7 };
    const cases: [string, Parameters<typeof routeMove>[0], ReturnType<typeof routeMove>][] = [
        ['no route', { route: null, kind: 'declined', guestOutOfPrompts: false }, null],
        ['auto decline', { route: auto, kind: 'declined', guestOutOfPrompts: false }, 'auto'],
        [
            'auto decline for a guest with no prompt left',
            { route: auto, kind: 'declined', guestOutOfPrompts: true },
            'out_of_prompts',
        ],
        [
            'offer decline for a guest with no prompt left',
            { route: offer, kind: 'declined', guestOutOfPrompts: true },
            'offer',
        ],
        [
            'auto on a resolution',
            { route: auto, kind: 'resolution', guestOutOfPrompts: false },
            'offer',
        ],
        [
            'offer before the response',
            { route: offer, kind: null, guestOutOfPrompts: false },
            'offer',
        ],
        [
            'offer on a resolution',
            { route: offer, kind: 'resolution', guestOutOfPrompts: true },
            'offer',
        ],
    ];

    for (const [name, input, expected] of cases) {
        await t.test(name, () => assert.equal(routeMove(input), expected));
    }
});

test('clickLeavesPage reads a plain click on a link to another page in this tab', async (t) => {
    const here = 'https://example.org/data?q=aid&routing=off';
    const plain = { button: 0, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false };
    const link = (href: string, target = '') => ({ href, target });
    const cases: [string, Parameters<typeof clickLeavesPage>, boolean][] = [
        ['a header link to another path', [plain, link('https://example.org/about'), here], true],
        ['a relative link to Studio', [plain, link('/studio'), here], true],
        ['a link to another origin', [plain, link('https://other.org/data'), here], true],
        ['a link with target _self', [plain, link('/about', '_self'), here], true],
        ['a link to the same page with other params', [plain, link('/data?q=debt'), here], false],
        ['an in-page anchor', [plain, link('#results'), here], false],
        ['no link', [plain, null, here], false],
        ['a link that opens a new tab', [plain, link('/about', '_blank'), here], false],
        ['a link into a named window', [plain, link('/about', 'docs'), here], false],
        ['a middle click', [{ ...plain, button: 1 }, link('/about'), here], false],
        ['a right click', [{ ...plain, button: 2 }, link('/about'), here], false],
        ['a click with Meta', [{ ...plain, metaKey: true }, link('/about'), here], false],
        ['a click with Ctrl', [{ ...plain, ctrlKey: true }, link('/about'), here], false],
        ['a click with Shift', [{ ...plain, shiftKey: true }, link('/about'), here], false],
        ['a click with Alt', [{ ...plain, altKey: true }, link('/about'), here], false],
    ];

    for (const [name, args, expected] of cases) {
        await t.test(name, () => assert.equal(clickLeavesPage(...args), expected));
    }
});

test('guestPromptsSeen reads a guest count, leaves storage alone for an account, and survives blocked storage', () => {
    const reads: string[] = [];
    const storage = () => ({
        getItem: (key: string) => {
            reads.push(key);

            return '3';
        },
    });
    const blocked = () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
    };

    assert.deepEqual(
        [
            guestPromptsSeen({ guest: true, storage }),
            guestPromptsSeen({ guest: false, storage }),
            guestPromptsSeen({ guest: true, storage: blocked }),
        ],
        [3, 0, 0],
    );
    assert.equal(reads.length, 1);
});

test('visitorIsGuest counts a failed session read as a guest', async (t) => {
    const cases: [string, () => Promise<unknown>, boolean][] = [
        ['no session', async () => null, true],
        ['a session', async () => ({ user: { id: 'u1' } }), false],
        ['a failed read', async () => Promise.reject(new Error('auth database down')), true],
    ];

    for (const [name, read, expected] of cases) {
        await t.test(name, async () => {
            t.mock.method(console, 'error', () => {});
            assert.equal(await visitorIsGuest(read), expected);
        });
    }
});
