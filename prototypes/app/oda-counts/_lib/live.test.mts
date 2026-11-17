import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { CountsData, Donor, LiveData } from '../_data/types.ts';

import { findDonor } from './counts.ts';
import {
    basisKey,
    currencyMatches,
    isCommitted,
    liveDonor,
    maskTo,
    pickCurrency,
    priceBases,
    resolveRequests,
    seriesFromEvents,
    streamEvents,
    unitPhrase,
    validBaseYear,
    type Unit,
} from './live.ts';

const read = <T,>(name: string): T =>
    JSON.parse(readFileSync(new URL(`../_data/${name}`, import.meta.url), 'utf8')).data as T;

const counts = read<CountsData>('counts.json');
const live = read<LiveData>('live.json');
const { offer } = live;

const france = (): Donor => {
    const donor = findDonor(counts, 'country/FRA');
    assert.ok(donor);
    return donor;
};

const EUR_2023: Unit = { currency: 'EUR', prices: 'constant', baseYear: 2023 };

type Entry = {
    entry_kind: string;
    variable_text: string;
    identity: { entities: unknown; facets: Record<string, unknown> };
};
type Body = {
    input: { kind: string; entries: Entry[] };
    response_options: Record<string, boolean>;
};

test('resolveRequests binds the donor and the unit on every series, six entries a request', () => {
    const requests = resolveRequests(live, 'country/FRA', EUR_2023);

    assert.deepEqual(
        requests.map(({ keys }) => keys.length),
        [6, 3],
    );
    assert.deepEqual(
        requests.flatMap(({ keys }) => keys),
        live.identities.map(({ key }) => key),
    );

    for (const { body } of requests) {
        const { input, response_options } = body as Body;

        assert.equal(input.kind, 'dataset_resubmit');
        assert.equal(response_options.include_observations, true);

        for (const entry of input.entries) {
            assert.equal(entry.entry_kind, 'identity');
            assert.deepEqual(entry.identity.entities, { origin: ['country/FRA'] });
            assert.deepEqual(entry.identity.facets.unit, {
                state: 'value',
                request: { currency: 'EUR', prices: 'constant', base_year: 2023 },
            });
            assert.ok(entry.identity.facets.provenance, 'keeps the provenance facet');
        }
    }

    const [current] = resolveRequests(live, 'DACCountriesTotal', {
        ...EUR_2023,
        prices: 'current',
    });
    const [entry] = (current?.body as Body).input.entries;

    assert.deepEqual(entry?.identity.facets.unit, {
        state: 'value',
        request: { currency: 'EUR', prices: 'current' },
    });
    assert.deepEqual(entry?.identity.entities, { origin: ['DACCountriesTotal'] });
});

/** A server-sent event frame for one event, as Search writes it. */
const frame = (event: { kind: string } & Record<string, unknown>): string =>
    `event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;

const part = (status: string, specId: string, currency = 'EUR') => ({
    status,
    spec: { spec_id: specId, resolved: { facets: { unit: { currency } } } },
});

const points = (values: Record<string, number>) =>
    Object.entries(values).map(([date, value]) => ({ date, value }));

/** A resolve stream for gross (with two series, as the headline arrives) and refugee costs. */
const stream = (currency = 'EUR'): string =>
    ': ping\n\n' +
    frame({ kind: 'sentence', spec_id: 'spec_a' }) +
    frame({
        kind: 'response',
        response: {
            kind: 'resolution',
            parts: [part('definite', 'spec_a', currency), { status: 'no_data' }],
        },
    }) +
    frame({
        kind: 'observations',
        spec_id: 'spec_a',
        observations: {
            series: [
                { points: points({ 2016: 9_506_000_000, 2017: 10_097_000_000 }) },
                { points: points({ 2018: 11_733_000_000, 1999: 1 }) },
            ],
        },
    }) +
    frame({ kind: 'done', elapsed_ms: 2400 });

test('seriesFromEvents reads each part by year in millions, joining split series', () => {
    const series = seriesFromEvents(
        streamEvents(stream()),
        ['gross', 'refugeeCosts'],
        [2015, 2016, 2017, 2018],
        'EUR',
    );

    assert.deepEqual(series, {
        gross: [null, 9506, 10097, 11733],
        refugeeCosts: [null, null, null, null],
    });
});

test('seriesFromEvents refuses an error, another currency, a missing part or observations', () => {
    const years = [2016];
    const keys = ['gross', 'refugeeCosts'] as const;

    assert.throws(
        () => seriesFromEvents([{ kind: 'error', detail: 'stalled' }], [...keys], years, 'EUR'),
        /stalled/,
    );
    assert.throws(
        () => seriesFromEvents(streamEvents(stream('USD')), [...keys], years, 'EUR'),
        /in USD, not EUR/,
    );
    assert.throws(
        () => seriesFromEvents(streamEvents(stream()), ['gross'], years, 'EUR'),
        /2 parts for 1 series/,
    );

    const noObservations = streamEvents(stream()).filter(
        (event) => (event as { kind: string }).kind !== 'observations',
    );

    assert.throws(
        () => seriesFromEvents(noObservations, [...keys], years, 'EUR'),
        /no observations for gross/,
    );
});

test('maskTo and liveDonor keep every null counts.json holds, at each price basis', () => {
    assert.deepEqual(maskTo([1, null, 3], [10, 20, null]), [10, null, null]);

    const committed = france();
    const index = counts.years.indexOf(2025);
    const ones = counts.years.map(() => 1);
    const basis = Object.fromEntries(
        Object.keys(committed.series).map((key) => [key, ones]),
    ) as Parameters<typeof liveDonor>[1]['current'];
    const donor = liveDonor(committed, { constant: basis });

    // France publishes no 2025 commitments, so the live 1 stays blank.
    assert.equal(committed.series.commitments.constant[index], null);
    assert.equal(donor.series.commitments.constant[index], null);
    assert.equal(donor.series.gross.constant[index], 1);
    assert.ok(
        donor.series.gross.current.every((value) => value === null),
        'unfetched basis',
    );
    assert.deepEqual(donor.odaGni, committed.odaGni);
});

test('isCommitted and basisKey tell committed units from live ones', () => {
    const usd = (prices: 'current' | 'constant', baseYear: number): Unit => ({
        currency: 'USD',
        prices,
        baseYear,
    });

    assert.equal(isCommitted(usd('current', 2010), counts), true);
    assert.equal(isCommitted(usd('constant', counts.baseYear), counts), true);
    assert.equal(isCommitted(usd('constant', 2010), counts), false);
    assert.equal(isCommitted(EUR_2023, counts), false);
    assert.equal(basisKey('country/FRA', EUR_2023), 'country/FRA EUR constant 2023');
    assert.equal(
        basisKey('country/FRA', { ...EUR_2023, prices: 'current' }),
        'country/FRA EUR current',
    );
});

test('the picker offers each currency at the bases and base years Search converts it at', () => {
    assert.deepEqual(priceBases(offer, 'EUR'), {
        current: true,
        baseYears: { min: 1973, max: 2025 },
    });
    assert.deepEqual(priceBases(offer, 'XYZ'), { current: false, baseYears: null });

    const euro = priceBases(offer, 'EUR');

    assert.equal(validBaseYear(' 2023 ', euro), 2023);
    assert.equal(validBaseYear('1972', euro), null);
    assert.equal(validBaseYear('20', euro), null);

    // A pick keeps the basis and moves the base year inside the currency's run.
    assert.deepEqual(pickCurrency({ ...EUR_2023, baseYear: 1965 }, 'BRL', offer), {
        currency: 'BRL',
        prices: 'constant',
        baseYear: 1986,
    });
    assert.deepEqual(pickCurrency({ ...EUR_2023, prices: 'current' }, 'GBP', offer), {
        currency: 'GBP',
        prices: 'current',
        baseYear: 2023,
    });

    // Syrian pounds convert only at constant prices, so a current-price pick moves there.
    assert.equal(priceBases(offer, 'SYP').current, false);
    assert.equal(
        pickCurrency({ ...EUR_2023, prices: 'current' }, 'SYP', offer)?.prices,
        'constant',
    );
    assert.equal(pickCurrency(EUR_2023, 'XYZ', offer), null);
});

test('currencyMatches finds a currency by name or code, by name', () => {
    assert.deepEqual(currencyMatches(offer, 'eur')[0], { code: 'EUR', name: 'Euros' });
    assert.ok(currencyMatches(offer, 'reais').some(({ code }) => code === 'BRL'));
    assert.equal(currencyMatches(offer, '').length, offer.currencies.length);
    assert.deepEqual(currencyMatches(offer, 'zzzz'), []);

    const names = currencyMatches(offer, 'dollar').map(({ name }) => name);

    assert.deepEqual(
        names,
        names.toSorted((a, b) => a.localeCompare(b, 'en-GB')),
    );
    assert.equal(unitPhrase(EUR_2023, offer), 'constant 2023 euros');
    assert.equal(
        unitPhrase({ ...EUR_2023, currency: 'USD', prices: 'current' }, offer),
        'current US dollars',
    );
});
