import assert from 'node:assert/strict';
import test from 'node:test';

import { citeLinkOnce, heldLabels, type CiteLink } from '../infoPanel.ts';
import type { HeldPeriod } from '../wire.ts';

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

const held = (patch: Partial<HeldPeriod>): HeldPeriod => ({
    status: 'partial',
    start: '2025',
    end: '2025',
    served: true,
    source_name: null,
    share: null,
    basis: null,
    against: null,
    ...patch,
});

test('heldLabels words a served partial value share, series share and projection', () => {
    assert.deepEqual(
        heldLabels(
            [
                held({ share: 0.001, basis: 'value', against: '2024' }),
                held({ share: 0.123, basis: 'series', against: '2024' }),
                held({ status: 'projected', start: '2026', end: '2030' }),
            ],
            '2025',
        ),
        [
            '2025 partial: 0.1% of 2024 value reported',
            '2025 partial: 12% of 2024 series reported',
            'Reported to 2025 · projected 2026 to 2030',
        ],
    );
});

test('heldLabels shows nothing for a held-back period or an absent list', () => {
    assert.deepEqual(
        heldLabels([held({ served: false, share: 0.5, against: '2024' })], '2024'),
        [],
    );
    assert.deepEqual(heldLabels(undefined, '2024'), []);
});
