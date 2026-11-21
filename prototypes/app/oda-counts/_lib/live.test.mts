import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Client } from '@developmentfinance/client';
import { RateLimitError } from '@developmentfinance/client/errors';
import type { ObservationPoint, SpecObservations } from '@developmentfinance/client/wire';

import { createLane, createPacer } from '#lib/pacing.ts';

import type { CountsData, Donor, LiveData, SeriesKey } from '../_data/types.ts';

import { findDonor } from './counts.ts';
import {
    basisKey,
    currencyMatches,
    fetchBasis,
    isCommitted,
    liveDonor,
    maskTo,
    pickCurrency,
    priceBases,
    resolveRequests,
    SearchRefusalError,
    seriesFromResponse,
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

    // One entry a request for the basis a reader waits for, and never more than Search takes.
    assert.deepEqual(
        resolveRequests(live, 'country/FRA', EUR_2023, 1).flatMap(({ keys }) => keys),
        live.identities.map(({ key }) => key),
    );
    assert.equal(resolveRequests(live, 'country/FRA', EUR_2023, 1).length, 9);
    assert.equal(resolveRequests(live, 'country/FRA', EUR_2023, 50).length, 2);

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

const points = (values: Record<string, number>): ObservationPoint[] =>
    Object.entries(values).map(([date, value]) => ({ date, value }));

/** One of a part's series, as Search's SpecObservations holds it. */
const series = (values: Record<string, number>): SpecObservations['series'][number] => ({
    stat_var: { ref: 'dcid:ODA' },
    entities: [{ role: 'origin', ref: 'dcid:country/FRA' }],
    points: points(values),
    total_obs: Object.keys(values).length,
});

/** Observations as Search's SpecObservations holds them: the gross headline's two series. */
const observed = (over: Partial<SpecObservations> = {}): SpecObservations => ({
    series: [
        series({ 2016: 9_506_000_000, 2017: 10_097_000_000 }),
        series({ 2018: 11_733_000_000, 1999: 1 }),
    ],
    total_obs: 4,
    truncated: false,
    ...over,
});

/** A definite part in `currency`, its observations in its `spec.resolved` as Search's JSON
 *  response holds them, unless `observations` is null. */
const part = (currency = 'EUR', observations: SpecObservations | null = observed()) => ({
    status: 'definite',
    spec: {
        spec_id: 'spec_a',
        resolved: {
            facets: { unit: { currency } },
            ...(observations === null ? {} : { observations }),
        },
    },
});

/** A resolve response for gross (with two series, as the headline arrives) and refugee costs. */
const response = (first: unknown = part()) => ({
    kind: 'resolution',
    parts: [first, { status: 'no_data' }],
});

test('seriesFromResponse reads each part by year in millions, joining split series', () => {
    const series = seriesFromResponse(
        response(),
        ['gross', 'refugeeCosts'],
        [2015, 2016, 2017, 2018],
        'EUR',
    );

    assert.deepEqual(series, {
        gross: [null, 9506, 10097, 11733],
        refugeeCosts: [null, null, null, null],
    });
});

/** A check that a call threw a SearchRefusalError with `code`. */
const refused = (code: SearchRefusalError['code']) => (error: unknown) =>
    error instanceof SearchRefusalError && error.code === code;

test('seriesFromResponse refuses another currency, a missing part, and missing, omitted, empty, truncated or doubled observations', () => {
    const years = [2016, 2017];
    const keys: SeriesKey[] = ['gross', 'refugeeCosts'];
    const refuses = (body: unknown, code: SearchRefusalError['code'], asked = keys) =>
        assert.throws(() => seriesFromResponse(body, asked, years, 'EUR'), refused(code));

    refuses(response(part('USD')), 'currency');
    refuses(response(), 'part_count', ['gross']);
    refuses(response({ status: 'choice' }), 'not_definite');
    refuses(response(part('EUR', null)), 'no_observations');
    refuses(
        response(
            part(
                'EUR',
                observed({
                    series: [],
                    total_obs: 0,
                    omitted: {
                        reason: 'observations_no_points',
                        message: 'No points in the requested years.',
                    },
                }),
            ),
        ),
        'omitted',
    );
    refuses(response(part('EUR', observed({ series: [], total_obs: 0 }))), 'empty');
    refuses(response(part('EUR', observed({ truncated: true }))), 'truncated');
    refuses(
        response(part('EUR', observed({ series: [series({ 2016: 1 }), series({ 2016: 2 })] }))),
        'two_values',
    );
});

type Sent = { method: string; url: URL; accept: string | null; body: Body };

/**
 * The page's client on a stand-in network that answers each resolve body with a part per
 * entry, or `refusal`, through a pacer bounded at `limit` whose `fetch` the client uses.
 */
const resolveOver = ({ limit = 4, refusal }: { limit?: number; refusal?: Response } = {}) => {
    const sent: Sent[] = [];
    let running = 0;
    let most = 0;
    const pacer = createPacer({
        limit,
        fetch: async (input, init) => {
            const request = new Request(input, init);
            sent.push({
                method: request.method,
                url: new URL(request.url),
                accept: request.headers.get('accept'),
                body: (await request.json()) as Body,
            });
            running += 1;
            most = Math.max(most, running);
            await new Promise((resolve) => setTimeout(resolve, 1));
            running -= 1;

            if (refusal) {
                return refusal;
            }

            const { entries } = sent.at(-1)!.body.input;

            return Response.json(
                { kind: 'resolution', parts: entries.map(() => part()) },
                { headers: { 'x-ratelimit-remaining': '80', 'x-ratelimit-reset': '30' } },
            );
        },
    });
    const client = new Client({ apiKey: false, fetch: pacer.fetch, maxRetries: 0 });

    return { client, pacer, sent, most: () => most };
};

const FRANCE_EUR = {
    live,
    timeoutMs: 30_000,
    donorId: 'country/FRA',
    unit: EUR_2023,
    years: [2016, 2017, 2018],
    signal: new AbortController().signal,
};

test('fetchBasis posts each one-entry resolve body through the client, within the pacer bound', async () => {
    const { client, pacer, sent, most } = resolveOver({ limit: 3 });

    const basis = await fetchBasis({ ...FRANCE_EUR, client, lane: pacer, perRequest: 1 });

    const requests = resolveRequests(live, 'country/FRA', EUR_2023, 1);

    assert.equal(sent.length, requests.length);
    assert.equal(most(), 3);
    assert.ok(
        sent.every(
            ({ method, url, accept }) =>
                method === 'POST' &&
                url.href === 'https://developmentfinance.org/api/v1/search/resolve' &&
                accept === 'application/json',
        ),
    );
    assert.deepEqual(
        sent.map(({ body }) => body),
        requests.map(({ body }) => body),
    );
    assert.deepEqual(
        Object.keys(basis),
        live.identities.map(({ key }) => key),
    );
    assert.ok(Object.values(basis).every((values) => values.join() === '9506,10097,11733'));
    assert.equal(pacer.allowance()?.remaining, 80);
});

test("fetchBasis rejects a gateway 429 as the client's RateLimitError, with the allowance it reports", async () => {
    const refusal = Response.json(
        { code: 'rate_limited', detail: 'Too many requests.', retryable: true },
        {
            status: 429,
            headers: {
                'retry-after': '12',
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': '12',
            },
        },
    );
    const { client, pacer, sent } = resolveOver({ refusal });

    await assert.rejects(
        fetchBasis({ ...FRANCE_EUR, client, lane: pacer, perRequest: live.maxEntries }),
        RateLimitError,
    );
    assert.equal(pacer.allowance()?.remaining, 0);
    // No retry: each request went out once.
    assert.equal(sent.length, resolveRequests(live, 'country/FRA', EUR_2023).length);
});

test('fetchBasis rejects a redirect the client returns', async () => {
    const redirect = {
        request: async () => ({ status: 302, json: () => ({}) }),
    };

    await assert.rejects(
        fetchBasis({
            ...FRANCE_EUR,
            client: redirect,
            lane: createLane(4),
            perRequest: 1,
        }),
        refused('status'),
    );
});

/** A resolver that answers each request after `ms`, or fails the `failAt`th request it sends. */
const timedResolver = ({ ms = 1, failAt }: { ms?: number; failAt?: number } = {}) => {
    const sent: AbortSignal[] = [];

    return {
        sent,
        client: {
            request: async (
                _method: 'POST',
                _path: string,
                { json, signal }: { json: unknown; signal: AbortSignal },
            ) => {
                sent.push(signal);
                const index = sent.length;

                await new Promise<void>((resolve, reject) => {
                    const timer = setTimeout(resolve, ms);

                    signal.addEventListener('abort', () => {
                        clearTimeout(timer);
                        reject(signal.reason);
                    });
                });

                if (index === failAt) {
                    throw new Error('connection reset');
                }

                const { entries } = (json as Body).input;

                return {
                    status: 200,
                    json: () => ({ kind: 'resolution', parts: entries.map(() => part()) }),
                };
            },
        },
    };
};

test('fetchBasis sends none of its queued requests after one fails, and aborts those in flight', async () => {
    const { client, sent } = timedResolver({ ms: 5, failAt: 1 });

    await assert.rejects(
        fetchBasis({ ...FRANCE_EUR, client, lane: createLane(2), perRequest: 1 }),
        /connection reset/,
    );
    // Nine requests, two at a time: the first fails, the second is aborted, and the queued
    // seven never go out.
    assert.equal(sent.length, 2);
    assert.ok(sent.every((signal) => signal.aborted));
});

test("fetchBasis times each request from when it leaves the lane's queue", async () => {
    const lane = createLane(1);
    let release = () => {};
    const held = lane.run(
        () =>
            new Promise<void>((resolve) => {
                release = resolve;
            }),
    );
    const { client } = timedResolver({ ms: 1 });
    const fetched = fetchBasis({ ...FRANCE_EUR, client, lane, perRequest: 6, timeoutMs: 20 });

    // Queued for longer than the timeout, each request still has its whole 20 ms.
    await new Promise((resolve) => setTimeout(resolve, 40));
    release();
    await held;

    const basis = await fetched;

    assert.deepEqual(
        Object.keys(basis),
        live.identities.map(({ key }) => key),
    );

    // A request that outlasts its own timeout fails the pick.
    const slow = timedResolver({ ms: 50 });

    await assert.rejects(
        fetchBasis({ ...FRANCE_EUR, client: slow.client, lane, perRequest: 6, timeoutMs: 10 }),
        (error) => error instanceof DOMException && error.name === 'TimeoutError',
    );
});

test('fetchBasis takes an aborted pick out of the queue at once', async () => {
    const lane = createLane(1);
    let release = () => {};
    const held = lane.run(
        () =>
            new Promise<void>((resolve) => {
                release = resolve;
            }),
    );
    const { client, sent } = timedResolver();
    const controller = new AbortController();
    const fetched = fetchBasis({
        ...FRANCE_EUR,
        client,
        lane,
        perRequest: 1,
        signal: controller.signal,
    });
    const reason = new Error('superseded');

    controller.abort(reason);
    await assert.rejects(fetched, (error) => error === reason);

    release();
    await held;
    assert.equal(sent.length, 0);
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
    assert.deepEqual(pickCurrency({ ...EUR_2023, baseYear: 1965 }, 'HUF', offer), {
        currency: 'HUF',
        prices: 'constant',
        baseYear: 2003,
    });
    assert.deepEqual(pickCurrency({ ...EUR_2023, prices: 'current' }, 'GBP', offer), {
        currency: 'GBP',
        prices: 'current',
        baseYear: 2023,
    });

    // A currency that converts only at constant prices moves a current-price pick there.
    const krona = offer.currencies.find(({ code }) => code === 'SEK');

    assert.ok(krona);

    const constantOnly = {
        ...offer,
        currencies: [...offer.currencies, { ...krona, code: 'XCO', current_years: null }],
    };

    assert.equal(priceBases(constantOnly, 'XCO').current, false);
    assert.equal(
        pickCurrency({ ...EUR_2023, prices: 'current' }, 'XCO', constantOnly)?.prices,
        'constant',
    );
    assert.equal(pickCurrency(EUR_2023, 'XYZ', offer), null);
});

test('currencyMatches finds a currency by name or code, by name', () => {
    assert.deepEqual(currencyMatches(offer, 'eur')[0], { code: 'EUR', name: 'Euros' });
    assert.ok(currencyMatches(offer, 'kronur').some(({ code }) => code === 'ISK'));
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
