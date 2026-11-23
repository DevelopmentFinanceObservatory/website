import assert from 'node:assert/strict';
import test from 'node:test';

import { isBrowserEventName } from '../events/browserEvents.ts';

// POST /api/events takes a name only when isBrowserEventName passes it.
test('POST /api/events takes the browser names and refuses server events', async (t) => {
    const cases: [unknown, boolean][] = [
        ['search.query', true],
        ['studio.download', true],
        ['data.view', false],
        ['share.copy', true],
        ['share.open', false],
        ['auth.signin', false],
        ['feedback.submit', false],
        ['search.legacy', false],
        [undefined, false],
    ];

    for (const [name, taken] of cases) {
        await t.test(String(name), () => {
            assert.equal(isBrowserEventName(name), taken);
        });
    }
});
