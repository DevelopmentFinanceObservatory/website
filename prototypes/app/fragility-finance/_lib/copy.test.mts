import assert from 'node:assert/strict';
import test from 'node:test';

import {
    contextHeadline,
    debtTitle,
    dotLabel,
    groupHeadline,
    odaNote,
    PROSE_FIGURES,
    SOURCES,
    stripSummary,
} from './copy.ts';
import { context, flow, SAMPLE } from './fixture.mts';
import { scopeDebt, scopeFlows } from './groups.ts';
import { inIds } from './profile.ts';
import { findContext, groupContexts, type Scope } from './scope.ts';
import { buildStrip, scalePosition, STRIPS, stripMedian } from './strip.ts';

const figures = (text: string): string[] =>
    text.match(/\$[\d.]+(?:bn|m|k)?|\d+(?:st|nd|rd|th)|\d[\d.]*bn/g) ?? [];

test("the group headline reads the money chart's summed series in 2024", () => {
    assert.deepEqual(figures(groupHeadline(SAMPLE, 'all')), [
        '$7.5bn',
        '$38m',
        '$5.3bn',
        '$4.4bn',
        '$4.9bn',
    ]);
    assert.match(groupHeadline(SAMPLE, 'all'), /^In 2024 the 5 contexts, home to 109m people, /);
    // A figure over fewer contexts than the group says how many.
    for (const [key, text] of [
        ['all', '$5.3bn in remittances (3 of the 5)'],
        ['all', '$4.9bn in public external debt service (4 of the 5)'],
        ['high', 'in remittances (1 of the 3)'],
    ] as const) {
        assert.ok(groupHeadline(SAMPLE, key).includes(text), text);
    }
    assert.doesNotMatch(groupHeadline(SAMPLE, 'all'), /in ODA \(/);
    assert.doesNotMatch(groupHeadline(SAMPLE, 'extreme'), /\(\d+ of the/);
});

test('a dot off the axis reads as under the minimum or over the maximum', () => {
    const dot = (value: number) => {
        const { x, clipped } = scalePosition(STRIPS.debtPerOda.scale, value);

        return {
            ...buildStrip(SAMPLE, 'debtPerOda', 0.01).dots[0],
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
    const text = (sample: typeof SAMPLE) =>
        odaNote(sample)
            .map((part) => (typeof part === 'string' ? part : part.name))
            .join('');

    assert.match(text(SAMPLE), /came to \$7\.5bn in 2024\. .*\$44\.5bn/);

    const halved = SAMPLE.map((item) => ({
        ...item,
        flows: item.flows.map((year) => ({
            ...year,
            oda: year.oda === null ? null : year.oda / 2,
        })),
    }));

    assert.match(text(halved), /came to \$3\.8bn in 2024/);
});

test("a context's strip summary names its tier's median and its own value", () => {
    const moz = findContext(SAMPLE, 'MOZ');

    assert.ok(moz);

    const strip = buildStrip(SAMPLE, 'odaShare', 0.01);
    const median = stripMedian(groupContexts(SAMPLE, moz.tier), 'odaShare');
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
    const moz = findContext(SAMPLE, 'MOZ');

    assert.ok(moz);
    assert.match(
        contextHeadline(moz, 5),
        /^Mozambique is the 2nd most fragile of 5, in extreme fragility since the 2026 update, /,
    );
    assert.deepEqual(figures(contextHeadline(moz, 5)), [
        '2nd',
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
    const title = (scope: Scope) => debtTitle(SAMPLE, scope, scopeDebt(SAMPLE, scope), years);

    assert.match(title({ kind: 'group', key: 'all' }), /^2 of the 5 contexts, 2015 to 2033, /);
    assert.match(
        title({ kind: 'group', key: 'extreme' }),
        /^1 of the 2 contexts in extreme fragility, /,
    );
    assert.match(title({ kind: 'context', iso3: 'MOZ' }), /^Mozambique, /);
});

test('every source links over https, the fragility list to the 2026 update', () => {
    assert.ok(SOURCES.every((source) => new URL(source.url).protocol === 'https:'));
    assert.ok(SOURCES.some((source) => source.url.includes('states-of-fragility-2026-update')));
});

test("the prose outside the island follows the figures it is given, the island's", () => {
    // Figures with half the ODA, and the context outside IDS dropped.
    const dropped = SAMPLE.find((each) => !inIds(each))?.iso3;
    const other = SAMPLE.filter((each) => each.iso3 !== dropped).map((each) => ({
        ...each,
        flows: each.flows.map((year) => ({
            ...year,
            oda: year.oda === null ? null : year.oda / 2,
        })),
    }));

    for (const [part, text] of Object.entries(PROSE_FIGURES)) {
        assert.notEqual(text(other), text(SAMPLE), part);
    }
    assert.equal(PROSE_FIGURES.contextCount(other), String(SAMPLE.length - 1));
    assert.deepEqual(
        [PROSE_FIGURES.debtAboveOda(SAMPLE), PROSE_FIGURES.debtAboveOda(other)],
        ['2', '3'],
    );
    assert.equal(PROSE_FIGURES.withoutIds(SAMPLE), 'South Sudan');
    assert.notDeepEqual(odaNote(other), odaNote(SAMPLE));
});
