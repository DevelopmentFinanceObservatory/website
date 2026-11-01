import assert from 'node:assert/strict';
import test from 'node:test';

import { citeLinkOnce, type CiteLink } from '../infoPanel.ts';

test('a cite link whose snapshot throws settles as failed and can be made again', async (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const inFlight = new Map<string, Promise<CiteLink>>();
    let calls = 0;
    const make = async (): Promise<CiteLink> => {
        calls += 1;
        throw new Error('snapshot not saved');
    };

    assert.deepEqual(await citeLinkOnce(inFlight, 'w1', make), { refusal: 'failed' });
    assert.equal(warn.mock.calls[0]?.arguments[0], 'Studio: a cite link could not be made');
    assert.equal(inFlight.size, 0);

    assert.deepEqual(await citeLinkOnce(inFlight, 'w1', make), { refusal: 'failed' });
    assert.equal(calls, 2);
});
