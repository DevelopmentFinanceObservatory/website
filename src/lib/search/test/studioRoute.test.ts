/**
 * `studioRoute.ts`: reading the search API's Studio route, and the page's
 * move for it.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { routeMove, studioRoute } from '../studioRoute.ts';
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

test('routeMove moves on an auto decline, and offers Studio otherwise', async (t) => {
    const auto: StudioRoute = { target: 'studio', mode: 'auto', probability: 0.95 };
    const offer: StudioRoute = { target: 'studio', mode: 'offer', probability: 0.7 };
    const cases: [string, Parameters<typeof routeMove>[0], ReturnType<typeof routeMove>][] = [
        ['no route', { route: null, kind: 'declined', guestOutOfPrompts: false }, null],
        ['auto decline', { route: auto, kind: 'declined', guestOutOfPrompts: false }, 'auto'],
        [
            'auto decline for a guest with no prompt left',
            { route: auto, kind: 'declined', guestOutOfPrompts: true },
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
