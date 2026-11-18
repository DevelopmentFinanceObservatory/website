import assert from 'node:assert/strict';
import test from 'node:test';

import {
    contextHeadline,
    debtTitle,
    dotLabel,
    groupHeadline,
    odaNote,
    SOURCES,
    stripSummary,
} from './copy.ts';
import { context, flow, PROFILES } from './fixture.mts';
import { scopeDebt, scopeFlows } from './groups.ts';
import { findContext, groupContexts, type Scope } from './scope.ts';
import { buildStrip, scalePosition, STRIPS, stripMedian } from './strip.ts';

const figures = (text: string): string[] =>
    text.match(/\$[\d.]+(?:bn|m|k)?|\d+(?:st|nd|rd|th)|\d[\d.]*bn/g) ?? [];

test("the group headline reads the money chart's summed series in 2024", () => {
    const flows = scopeFlows(PROFILES, { kind: 'group', key: 'all' });

    // Remittances sum the 48 contexts holding all ten years: $183bn, against $185bn for
    // the 51 that hold 2024.
    assert.equal(flows.remittances.counts.at(-1), 48);
    assert.deepEqual(figures(groupHeadline(PROFILES, 'all')), [
        '2.05bn',
        '$106bn',
        '$17bn',
        '$183bn',
        '$51bn',
        '$64bn',
    ]);
    // A figure over fewer contexts than the group says how many.
    for (const [key, text] of [
        ['all', '$183bn in remittances (48 of the 62)'],
        ['extreme', '(15 of the 20)'],
        ['high', '(35 of the 42)'],
    ] as const) {
        assert.ok(groupHeadline(PROFILES, key).includes(text));
    }
    assert.doesNotMatch(groupHeadline(PROFILES, 'all'), /in ODA \(/);
});

test('a dot off the axis reads as under the minimum or over the maximum', () => {
    const dot = (value: number) => {
        const { x, clipped } = scalePosition(STRIPS.debtPerOda.scale, value);

        return {
            ...buildStrip(PROFILES, 'debtPerOda', 0.01).dots[0],
            value,
            x,
            clipped,
            year: 2024,
        };
    };

    assert.equal(dotLabel(STRIPS.debtPerOda, dot(0.0001)), 'under 1 cent, 2024');
    assert.equal(dotLabel(STRIPS.debtPerOda, dot(1000)), 'over $100, 2024');
    assert.equal(dotLabel(STRIPS.debtPerOda, dot(0.3)), '30 cents, 2024');
});

test("the ODA note's total comes from the data", () => {
    const text = (sample: typeof PROFILES) =>
        odaNote(sample)
            .map((part) => (typeof part === 'string' ? part : part.name))
            .join('');

    assert.match(text(PROFILES), /came to \$106bn in 2024\. .*\$44\.5bn/);

    const halved = PROFILES.map((item) => ({
        ...item,
        flows: item.flows.map((year) => ({
            ...year,
            oda: year.oda === null ? null : year.oda / 2,
        })),
    }));

    assert.match(text(halved), /came to \$53bn in 2024/);
});

test("a context's strip summary names its tier's median and its own value", () => {
    const moz = findContext(PROFILES, 'MOZ');

    assert.ok(moz);

    const strip = buildStrip(PROFILES, 'odaShare', 0.01);
    const median = stripMedian(groupContexts(PROFILES, moz.tier), 'odaShare');
    const dot = strip.dots.find((item) => item.iso3 === 'MOZ') ?? null;
    const summary = stripSummary({
        spec: STRIPS.odaShare,
        count: strip.dots.length,
        median: median.value,
        group: moz.tier,
        chosen: { name: moz.name, dot },
    });

    assert.match(summary, /Extreme fragility median \d+%\. Mozambique: \d+%, 2024\.$/);
    assert.match(
        stripSummary({
            spec: STRIPS.water,
            count: 61,
            median: 70,
            group: 'all',
            chosen: { name: 'South Sudan', dot: null },
        }),
        /Median 70%\. South Sudan: no data\.$/,
    );
});

test('the context headline carries rank and the figures held', () => {
    const moz = findContext(PROFILES, 'MOZ');

    assert.ok(moz);
    assert.deepEqual(figures(contextHeadline(moz, 62)), [
        '19th',
        '$3.0bn',
        '$23m',
        '$267m',
        '$3.6bn',
        '$917m',
    ]);

    // Outside IDS, without remittances and with no OOF: only ODA and FDI are stated.
    const sparse = context({
        flows: [flow(2024, { oof: 0, remittances: null, debtService: null, fdi: 5e6 })],
    });

    assert.deepEqual(figures(contextHeadline(sparse, 62)), ['$100', '$5.0m']);
    assert.match(contextHeadline(sparse, 62), /^\S+ is the most fragile of the 62, /);
    assert.match(contextHeadline({ ...sparse, rank: 2 }, 62), / is the 2nd most fragile of 62, /);
});

test('the debt title names the set a group sum covers', () => {
    const years = { first: 2015, last: 2033 };
    const title = (scope: Scope) => debtTitle(PROFILES, scope, scopeDebt(PROFILES, scope), years);

    assert.match(title({ kind: 'group', key: 'all' }), /^53 of the 62 contexts, 2015 to 2033, /);
    assert.match(
        title({ kind: 'group', key: 'extreme' }),
        /^15 of the 20 contexts in extreme fragility, /,
    );
    assert.match(title({ kind: 'context', iso3: 'MOZ' }), /^Mozambique, /);
});

test('every source links over https, the fragility list to the 2026 update', () => {
    assert.ok(SOURCES.every((source) => new URL(source.url).protocol === 'https:'));
    assert.ok(SOURCES.some((source) => source.url.includes('states-of-fragility-2026-update')));
});
