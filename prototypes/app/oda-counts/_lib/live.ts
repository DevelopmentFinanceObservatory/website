// The live half of the page: the unit a reader picks, the Search requests that fetch one
// donor in it, the parsing of their event streams into the page's series, and the picker's
// offer. Pure functions, with only type imports, so `node --test` loads the module.
import type { BaseIdentity, IdentityUnitRequest } from '@developmentfinance/client/wire';

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
 * The resolve requests that fetch every monetary series for one donor in one unit, as few
 * as `live.maxEntries` allows (two for nine series), each entry a series' identity with
 * the donor bound as provider and the unit as its unit request.
 */
export const resolveRequests = (live: LiveData, donorId: string, unit: Unit): ResolveRequest[] => {
    const requests: ResolveRequest[] = [];

    for (let start = 0; start < live.identities.length; start += live.maxEntries) {
        const batch = live.identities.slice(start, start + live.maxEntries);

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
 * The data of each event in a server-sent event stream, parsed as JSON, in order. Comment
 * lines (": ping") and frames with no data are skipped, and several data lines join with
 * a newline, as the SSE format has it.
 */
export const streamEvents = (text: string): unknown[] =>
    text
        .split(/\r?\n\r?\n/)
        .map((frame) =>
            frame
                .split(/\r?\n/)
                .filter((line) => line.startsWith('data:'))
                .map((line) => line.slice(5).replace(/^ /, ''))
                .join('\n'),
        )
        .filter((data) => data !== '')
        .map((data) => JSON.parse(data) as unknown);

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
 * Each series in `keys` by year of `years`, in millions, from one resolve stream's events.
 * A part Search answers with no data is null in every year. Throws on an error event, on
 * a part that is neither definite nor no data, on a part served in another currency than
 * `currency`, and on a definite part with no or truncated observations, so a stream the
 * page cannot read never shows as figures.
 */
export const seriesFromEvents = (
    events: unknown[],
    keys: SeriesKey[],
    years: number[],
    currency: string,
): Partial<Record<SeriesKey, ByYear>> => {
    const failure = events.find((event) => isRecord(event) && event.kind === 'error');

    if (failure !== undefined) {
        const detail = recordAt(failure)?.detail;

        throw new Error(`Search failed: ${typeof detail === 'string' ? detail : 'no detail'}`);
    }

    const response = events.find((event) => isRecord(event) && event.kind === 'response');
    const parts = listAt(recordAt(response, 'response'), 'parts');

    if (parts.length !== keys.length) {
        throw new Error(`Search answered ${parts.length} parts for ${keys.length} series.`);
    }

    const observations = new Map<string, unknown[]>();

    for (const event of events) {
        if (isRecord(event) && event.kind === 'observations' && typeof event.spec_id === 'string') {
            observations.set(event.spec_id, listAt(recordAt(event, 'observations'), 'series'));
        }
    }

    const out: Partial<Record<SeriesKey, ByYear>> = {};

    keys.forEach((key, index) => {
        const part = recordAt(parts[index]);
        const values: ByYear = years.map(() => null);

        out[key] = values;

        if (part?.status === 'no_data') {
            return;
        }

        const spec = recordAt(part, 'spec');
        const specId = spec?.spec_id;

        if (part?.status !== 'definite' || typeof specId !== 'string') {
            throw new Error(`Search answered ${String(part?.status)} for ${key}.`);
        }

        const served = recordAt(spec, 'resolved', 'facets', 'unit')?.currency;

        if (served !== currency) {
            throw new Error(`Search served ${key} in ${String(served)}, not ${currency}.`);
        }

        const series = observations.get(specId);

        if (series === undefined) {
            throw new Error(`Search sent no observations for ${key}.`);
        }

        if (series.some((each) => isRecord(each) && each.truncated === true)) {
            throw new Error(`Search sent a truncated series for ${key}.`);
        }

        // The OECD headline arrives as two series, net flows to 2017 and grant
        // equivalents from 2018, whose years never overlap.
        for (const points of series.map((each) => listAt(each, 'points'))) {
            for (const point of points) {
                const at = years.indexOf(Number(recordAt(point)?.date));
                const value = recordAt(point)?.value;

                if (at === -1 || typeof value !== 'number') {
                    continue;
                }

                if (values[at] != null) {
                    throw new Error(`Search sent two values for ${key} in ${years[at]}.`);
                }

                values[at] = value / 1e6;
            }
        }
    });

    return out;
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
