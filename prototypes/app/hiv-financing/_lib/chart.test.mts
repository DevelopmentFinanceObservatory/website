import assert from 'node:assert/strict';
import test from 'node:test';

import { barTicks, labelledYears, providerLayers, stackExtent, valueTicks } from './chart.ts';
import { DATA } from './fixture.mts';
import { axisMoney } from './format.ts';

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

test('the bar axis reaches $1m, so a tiny series gets distinct tick labels', () => {
    assert.deepEqual(barTicks(0).map(axisMoney), ['0', '$250k', '$500k', '$750k', '$1m']);
    assert.deepEqual(barTicks(5_000).map(axisMoney), ['0', '$250k', '$500k', '$750k', '$1m']);
    assert.deepEqual(barTicks(6.447e9), valueTicks(0, 6.447e9));
});

test('year labels always include the first and the last year', () => {
    assert.deepEqual(
        [...labelledYears(10, 2)].sort((a, b) => a - b),
        [0, 3, 5, 7, 9],
    );
    assert.deepEqual(
        [...labelledYears(10, 4)].sort((a, b) => a - b),
        [0, 5, 9],
    );
    assert.deepEqual(
        [...labelledYears(10, 1)].sort((a, b) => a - b),
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    );
});
