// The live half of the page: the unit a reader picks, the Search requests that fetch one
// donor in it, the reading of their responses into the page's series, and the picker's offer.
// Only type imports and web APIs Node also has, so `node --test` loads the module.
import type { BaseIdentity, IdentityUnitRequest } from '@developmentfinance/client/wire';

import type { Lane } from '#lib/pacing.ts';

import type {
    ByYear,
    CountsData,
    Donor,
    LiveData,
    Offer,
    Prices,
    SeriesKey,
} from '../_data/types.ts';

/** A currency and price basis, with the base year constant prices are in. */
export type Unit = { currency: string; prices: Prices; baseYear: number };

/** The currency counts.json holds, at current prices and constant prices of its base year. */
export const COMMITTED_CURRENCY = 'USD';

/** The unit the page opens in. */
export const committedUnit = (data: CountsData): Unit => ({
    currency: COMMITTED_CURRENCY,
    prices: 'current',
    baseYear: data.baseYear,
});

/** Whether counts.json holds `unit`'s figures, so the page needs no request for them. */
export const isCommitted = (unit: Unit, data: CountsData): boolean =>
    unit.currency === COMMITTED_CURRENCY &&
    (unit.prices === 'current' || unit.baseYear === data.baseYear);

/** One price basis of a unit's pair: the unit's own, or the other one at the same base year. */
export const withPrices = (unit: Unit, prices: Prices): Unit => ({ ...unit, prices });

/** The key a donor's figures in one currency at one price basis are cached under. */
export const basisKey = (donorId: string, unit: Unit): string =>
    unit.prices === 'current'
        ? `${donorId} ${unit.currency} current`
        : `${donorId} ${unit.currency} constant ${unit.baseYear}`;

/** The unit request a Search identity carries for `unit`. */
export const unitRequest = (unit: Unit): IdentityUnitRequest =>
    unit.prices === 'current'
        ? { currency: unit.currency, prices: 'current' }
        : { currency: unit.currency, prices: 'constant', base_year: unit.baseYear };

/** `identity` for one provider in one unit. */
const boundIdentity = (identity: BaseIdentity, donorId: string, unit: Unit): BaseIdentity => ({
    ...identity,
    entities: { origin: [donorId] },
    facets: { ...identity.facets, unit: { state: 'value', request: unitRequest(unit) } },
});

/** One resolve request: the series keys its entries are, in order, and its body. */
export type ResolveRequest = { keys: SeriesKey[]; body: unknown };

/**
 * The resolve requests that fetch every monetary series for one donor in one unit, each
 * entry a series' identity with the donor bound as provider and the unit as its unit
 * request. Each request carries `perRequest` entries, at most `live.maxEntries` (two
 * requests for nine series by default). Search answers one-entry requests sent together
 * sooner than a full one, so the page fetches the basis a reader waits for that way.
 */
export const resolveRequests = (
    live: LiveData,
    donorId: string,
    unit: Unit,
    perRequest = live.maxEntries,
): ResolveRequest[] => {
    const size = Math.max(1, Math.min(perRequest, live.maxEntries));
    const requests: ResolveRequest[] = [];

    for (let start = 0; start < live.identities.length; start += size) {
        const batch = live.identities.slice(start, start + size);

        requests.push({
            keys: batch.map(({ key }) => key),
            body: {
                schema_version: 1,
                input: {
                    kind: 'dataset_resubmit',
                    entries: batch.map(({ sentence, identity }) => ({
                        entry_kind: 'identity',
                        variable_text: sentence,
                        identity: boundIdentity(identity, donorId, unit),
                    })),
                },
                response_options: { include_option_coverage: false, include_observations: true },
            },
        });
    }

    return requests;
};

/**
 * Why the page refused a resolve answer:
 *
 * - `status`: the client returned a response other than 200, such as a redirect it did not
 *   follow.
 * - `part_count`: the answer holds another number of parts than the request had entries.
 * - `not_definite`: a part is neither definite nor no data.
 * - `currency`: a definite part is served in another currency than the one asked for.
 * - `no_observations`: a definite part carries no observations.
 * - `omitted`: Search left a definite part's observations out, and says why in `omitted`.
 * - `empty`: a definite part's observations hold no series.
 * - `truncated`: Search cut a definite part's observations to their latest points.
 * - `two_values`: two series of one part hold a value in the same year.
 */
export type RefusalCode =
    | 'status'
    | 'part_count'
    | 'not_definite'
    | 'currency'
    | 'no_observations'
    | 'omitted'
    | 'empty'
    | 'truncated'
    | 'two_values';

/** A resolve answer the page will not show as figures, with the reason as `code`. */
export class SearchRefusalError extends Error {
    readonly code: RefusalCode;

    constructor(code: RefusalCode, message: string) {
        super(message);
        this.name = 'SearchRefusalError';
        this.code = code;
    }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const recordAt = (value: unknown, ...path: string[]): Record<string, unknown> | null => {
    let at: unknown = value;

    for (const key of path) {
        at = isRecord(at) ? at[key] : undefined;
    }

    return isRecord(at) ? at : null;
};

const listAt = (value: unknown, key: string): unknown[] => {
    const list = isRecord(value) ? value[key] : undefined;

    return Array.isArray(list) ? list : [];
};

/**
 * Reads each series in `keys` by year of `years`, in millions, from one resolve response's
 * JSON body, which holds each definite part's observations in its `spec.resolved`. A part
 * Search answers with no data is null in every year. Throws a `SearchRefusalError` on a part
 * that is neither definite nor no data, on a part served in another currency than `currency`,
 * and on a definite part whose observations are missing, omitted, empty or truncated, so a
 * response the page cannot read never shows as figures.
 */
export const seriesFromResponse = (
    body: unknown,
    keys: SeriesKey[],
    years: number[],
    currency: string,
): Partial<Record<SeriesKey, ByYear>> => {
    const parts = listAt(body, 'parts');

    if (parts.length !== keys.length) {
        throw new SearchRefusalError(
            'part_count',
            `Search answered ${parts.length} parts for ${keys.length} series.`,
        );
    }

    const out: Partial<Record<SeriesKey, ByYear>> = {};

    keys.forEach((key, index) => {
        const part = recordAt(parts[index]);
        const values: ByYear = years.map(() => null);

        out[key] = values;

        if (part?.status === 'no_data') {
            return;
        }

        const resolved = recordAt(part, 'spec', 'resolved');

        if (part?.status !== 'definite' || resolved === null) {
            throw new SearchRefusalError(
                'not_definite',
                `Search answered ${String(part?.status)} for ${key}.`,
            );
        }

        const served = recordAt(resolved, 'facets', 'unit')?.currency;

        if (served !== currency) {
            throw new SearchRefusalError(
                'currency',
                `Search served ${key} in ${String(served)}, not ${currency}.`,
            );
        }

        const observations = recordAt(resolved, 'observations');

        if (observations === null) {
            throw new SearchRefusalError(
                'no_observations',
                `Search sent no observations for ${key}.`,
            );
        }

        // Search sets `omitted` with an empty `series` when it left the observations out.
        if (observations.omitted != null) {
            throw new SearchRefusalError('omitted', `Search left out the observations for ${key}.`);
        }

        const series = listAt(observations, 'series');

        if (series.length === 0) {
            throw new SearchRefusalError('empty', `Search sent no series for ${key}.`);
        }

        if (observations.truncated === true) {
            throw new SearchRefusalError('truncated', `Search truncated the series for ${key}.`);
        }

        // The OECD headline arrives as two series, net flows to 2017 and grant
        // equivalents from 2018, whose years are disjoint.
        for (const points of series.map((each) => listAt(each, 'points'))) {
            for (const point of points) {
                const at = years.indexOf(Number(recordAt(point)?.date));
                const value = recordAt(point)?.value;

                if (at === -1 || typeof value !== 'number') {
                    continue;
                }

                if (values[at] != null) {
                    throw new SearchRefusalError(
                        'two_values',
                        `Search sent two values for ${key} in ${years[at]}.`,
                    );
                }

                values[at] = value / 1e6;
            }
        }
    });

    return out;
};

/** The Search route a resolve request posts to, under the client's base URL. */
const RESOLVE_PATH = '/search/resolve';

/** The client call a resolve request makes, `Client.request`, as far as the page reads it. */
export type Resolver = {
    request: (
        method: 'POST',
        path: string,
        options: { json: unknown; signal: AbortSignal },
    ) => Promise<{ status: number; json: () => unknown }>;
};

/**
 * Fetches `donorId`'s series in `unit` with the resolve requests `resolveRequests` gives for
 * `perRequest`, sent together, each through `lane` and posted by `client`. Each request may take
 * `timeoutMs` from the moment it leaves the lane's queue. Rejects with the first request's
 * error, as the client raises it (`RateLimitError` when the gateway refused the address), or as
 * `seriesFromResponse` refuses a body. That first failure, or an abort of `signal`, aborts the
 * other requests and takes those still queued out of the lane, so none goes out after it.
 */
export const fetchBasis = async ({
    client,
    lane,
    live,
    donorId,
    unit,
    perRequest,
    years,
    timeoutMs,
    signal,
}: {
    client: Resolver;
    lane: Lane;
    live: LiveData;
    donorId: string;
    unit: Unit;
    perRequest: number;
    years: number[];
    timeoutMs: number;
    signal: AbortSignal;
}): Promise<LiveBasis> => {
    // One controller for the pick's requests, so the page needs no AbortSignal.any, which older
    // browsers lack.
    const pick = new AbortController();
    const abortPick = () => pick.abort(signal.reason);

    if (signal.aborted) {
        abortPick();
    } else {
        signal.addEventListener('abort', abortPick, { once: true });
    }

    const send = async (keys: SeriesKey[], body: unknown) => {
        const request = new AbortController();
        const abortRequest = () => request.abort(pick.signal.reason);
        const timer = setTimeout(
            () =>
                request.abort(
                    new DOMException(`No answer within ${timeoutMs} ms.`, 'TimeoutError'),
                ),
            timeoutMs,
        );

        pick.signal.addEventListener('abort', abortRequest, { once: true });

        try {
            const response = await client.request('POST', RESOLVE_PATH, {
                json: body,
                signal: request.signal,
            });

            // The client returns a redirect it did not follow as the response.
            if (response.status !== 200) {
                throw new SearchRefusalError('status', `Search answered ${response.status}.`);
            }

            return seriesFromResponse(response.json(), keys, years, unit.currency);
        } catch (error) {
            // Before the lane passes this slot on, so no queued sibling starts.
            pick.abort(error);
            throw error;
        } finally {
            clearTimeout(timer);
            pick.signal.removeEventListener('abort', abortRequest);
        }
    };

    try {
        const parts = await Promise.all(
            resolveRequests(live, donorId, unit, perRequest).map(({ keys, body }) =>
                lane.run(() => send(keys, body), pick.signal),
            ),
        );

        return Object.assign({}, ...parts) as LiveBasis;
    } finally {
        signal.removeEventListener('abort', abortPick);
    }
};

/** A donor's live series at one price basis, each by year. */
export type LiveBasis = Record<SeriesKey, ByYear>;

/** `live` with null wherever `committed` is null, so a converted figure never appears for a
 * donor-year counts.json leaves blank, such as a group total that sums only some members. */
export const maskTo = (committed: ByYear, live: ByYear): ByYear =>
    committed.map((value, index) => (value === null ? null : (live[index] ?? null)));

/**
 * `donor` in a live unit: each series at each price basis from `bases`, masked to the
 * committed figures at that basis. A basis not yet fetched is null in every year.
 */
export const liveDonor = (donor: Donor, bases: Partial<Record<Prices, LiveBasis>>): Donor => {
    const series = Object.fromEntries(
        Object.entries(donor.series).map(([key, byPrices]) => [
            key,
            {
                current: maskTo(
                    byPrices.current,
                    bases.current?.[key as SeriesKey] ?? byPrices.current.map(() => null),
                ),
                constant: maskTo(
                    byPrices.constant,
                    bases.constant?.[key as SeriesKey] ?? byPrices.constant.map(() => null),
                ),
            },
        ]),
    ) as Donor['series'];

    return { ...donor, series };
};

/** The price bases a currency converts the series at, and its run of base years. */
export type PriceBases = { current: boolean; baseYears: { min: number; max: number } | null };

/** What `offer` converts `code` at; neither basis for a currency it does not hold. */
export const priceBases = (offer: Offer, code: string): PriceBases => {
    const currency = offer.currencies.find((entry) => entry.code === code);
    const min = currency?.base_year_min ?? null;
    const max = currency?.base_year_max ?? null;

    return {
        current: currency?.current_years != null,
        baseYears:
            currency?.constant_years != null && min !== null && max !== null ? { min, max } : null,
    };
};

/** A base year typed into the picker, or null unless it is four digits inside the run. */
export const validBaseYear = (text: string, bases: PriceBases): number | null => {
    if (bases.baseYears === null || !/^\d{4}$/.test(text.trim())) {
        return null;
    }

    const year = Number(text);

    return year >= bases.baseYears.min && year <= bases.baseYears.max ? year : null;
};

const clamp = (year: number, { min, max }: { min: number; max: number }): number =>
    Math.min(Math.max(year, min), max);

/**
 * The unit a currency pick moves to: the new currency at the current unit's price basis
 * where it converts at it, else at the basis it does, with the base year moved inside the
 * currency's run. Null when the currency converts at neither basis.
 */
export const pickCurrency = (unit: Unit, code: string, offer: Offer): Unit | null => {
    const bases = priceBases(offer, code);
    const baseYear = bases.baseYears ? clamp(unit.baseYear, bases.baseYears) : unit.baseYear;

    if (bases.baseYears && (unit.prices === 'constant' || !bases.current)) {
        return { currency: code, prices: 'constant', baseYear };
    }

    return bases.current ? { currency: code, prices: 'current', baseYear } : null;
};

/** One currency the picker lists: its plural name, capitalised, and its code. */
export type CurrencyOption = { code: string; name: string };

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The plural noun `offer` names a currency by ("euros"), or its code. */
export const currencyNoun = (offer: Offer, code: string): string =>
    offer.currencies.find((entry) => entry.code === code)?.noun ?? code;

/** Lower case without accents, so "real" finds "reais". */
const fold = (text: string): string =>
    text
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase();

/** Every currency `offer` holds whose name or code contains `query`, by name. */
export const currencyMatches = (offer: Offer, query: string): CurrencyOption[] => {
    const needle = fold(query.trim());

    return offer.currencies
        .map(({ code, noun }) => ({ code, name: capitalise(noun) }))
        .filter(({ code, name }) => fold(code).includes(needle) || fold(name).includes(needle))
        .toSorted((a, b) => a.name.localeCompare(b.name, 'en-GB'));
};

/** "current US dollars", "constant 2023 euros". */
export const unitPhrase = (unit: Unit, offer: Offer): string => {
    const noun = currencyNoun(offer, unit.currency);

    return unit.prices === 'current' ? `current ${noun}` : `constant ${unit.baseYear} ${noun}`;
};

/** "Current US dollars", "Constant 2023 euros". */
export const unitTitle = (unit: Unit, offer: Offer): string => capitalise(unitPhrase(unit, offer));
