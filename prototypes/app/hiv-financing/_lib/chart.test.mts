import assert from 'node:assert/strict';
import test from 'node:test';

import { providerLayers, stackExtent, valueTicks } from './chart.ts';
import { DATA } from './fixture.mts';

test('provider layers stack US, Global Fund, then others, with the shared colours', () => {
    const layers = providerLayers(DATA.allocated);

    assert.deepEqual(
        layers.map(({ key, colour }) => [key, colour]),
        [
            ['us', '#6467de'],
            ['globalFund', '#2a9d8f'],
            ['other', '#c9a227'],
        ],
    );
    assert.deepEqual(stackExtent(layers), { low: 0, high: 6.447e9 });
    assert.deepEqual(valueTicks(0, 6.447e9), [0, 2e9, 4e9, 6e9, 8e9]);
});
