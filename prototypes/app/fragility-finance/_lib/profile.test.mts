import assert from 'node:assert/strict';
import test from 'node:test';

import { context, flow, PROFILES } from './fixture.mts';
import {
    debtAboveOdaCount,
    debtPerOda,
    humanitarianShare,
    inflowShare,
    mostFragileDimensions,
} from './profile.ts';

test('mostFragileDimensions names every dimension tied on the lowest category', () => {
    assert.deepEqual(mostFragileDimensions(context()), ['hum', 'soc']);

    const all = context({
        dimensions: {
            eco: { score: -1, category: 1 },
            env: { score: -5, category: 1 },
            hum: { score: -2, category: 1 },
            pol: { score: -3, category: 1 },
            sec: { score: -6, category: 1 },
            soc: { score: -4, category: 1 },
        },
    });

    assert.deepEqual(mostFragileDimensions(all), ['sec', 'env', 'soc', 'pol', 'hum', 'eco']);
});

test('inflowShare counts OOF and a net FDI outflow as zero, and needs all four inflows', () => {
    assert.equal(inflowShare(flow(2024)), 100 / 220);
    assert.equal(inflowShare(flow(2024, { oof: 0 })), 0.5);
    assert.equal(inflowShare(flow(2024, { fdi: -80 })), 100 / 170);
    assert.equal(inflowShare(flow(2024, { oof: null })), null);
    assert.equal(inflowShare(flow(2024, { remittances: null })), null);
    assert.equal(inflowShare(flow(2024, { fdi: null })), null);
    assert.equal(inflowShare(flow(2024, { oda: null })), null);
    assert.equal(inflowShare(undefined), null);
});

test('debtPerOda and the count of contexts paying more than they receive', () => {
    const above = context({ iso3: 'BBB', flows: [flow(2024, { debtService: 150 })] });
    const noIds = context({
        iso3: 'CCC',
        debtService: [],
        flows: [flow(2024, { debtService: null })],
    });

    assert.equal(debtPerOda(above.flows[0]), 1.5);
    assert.equal(debtPerOda(noIds.flows[0]), null);
    assert.equal(debtPerOda(flow(2024, { oda: 0 })), null);
    assert.equal(debtAboveOdaCount([context(), above, noIds]), 1);
    assert.equal(debtAboveOdaCount(PROFILES), 13);
});

test('humanitarianShare is null without aid that year', () => {
    assert.equal(humanitarianShare(context(), 2024), 0.3);
    assert.equal(humanitarianShare(context(), 2023), null);
});
