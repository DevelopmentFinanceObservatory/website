// The page's dynamic words: the lede, the scope note, and the summary sentence for all
// countries or for one.
import type { Country, HivData } from '../_data/types.ts';

import {
    deathCount,
    listOf,
    money,
    pct,
    people,
    percent,
    perPerson,
    roundDeaths,
} from './format.ts';
import { PROVIDERS } from './providers.ts';
import { lastAid, lastShares, lastTotal, ledeFigures } from './summary.ts';

export const SCOPE_NOTE =
    "This page shows aid from donors and multilateral funds. Governments' own spending on HIV is not in the DFO, so it does not show what share of a country's HIV response donors pay for.";

/** A provider's share is named in the country sentence from half a percentage point up. */
const NAMED_SHARE = 0.005;

const lastYearOf = (years: readonly number[]): number => years.at(-1) ?? 0;

export const ledeSentence = (data: HivData): string => {
    const { usGfShare, over1m, oneProviderMajority } = ledeFigures(data);

    return `In ${lastYearOf(data.years)} the United States and the Global Fund gave ${pct(usGfShare)} of the external HIV financing that donors assigned to countries. In ${oneProviderMajority} of the ${over1m} countries that received more than $1m, one of the two gave more than half.`;
};

/** The summary sentence with no country selected. */
export const allSentence = (data: HivData): string => {
    const first = data.years[0] ?? 0;
    const last = lastYearOf(data.years);
    const others = data.allocated.other;

    return `In ${last} donors assigned ${money(lastTotal(data.allocated))} of HIV aid to ${data.recipients} countries and reported another ${money(lastTotal(data.unallocated))} for regions or no country. Providers other than the United States and the Global Fund gave ${money(others.at(-1) ?? 0)} to countries, against ${money(others[0] ?? 0)} in ${first}.`;
};

const mixClause = (country: Country): string | null => {
    const shares = lastShares(country.aid);
    const named = PROVIDERS.filter(({ key }) => shares[key] >= NAMED_SHARE).map(
        ({ key, label }) =>
            `${pct(shares[key])} from ${key === 'other' ? 'all other providers' : `the ${label}`}`,
    );

    if (named.length === 0) {
        return null;
    }

    return `Of that, ${listOf(named).replace(' from ', ' came from ')}.`;
};

const treatmentClause = (country: Country): string | null =>
    country.art === null || country.plhiv === null || country.plhiv === 0
        ? null
        : `${percent(country.art)} of its ${people(country.plhiv)} people living with HIV were on antiretroviral therapy.`;

const deathsClause = (country: Country, years: readonly number[]): string | null => {
    const first = country.deaths[0];
    const last = country.deaths.at(-1);

    if (first === null || first === undefined || last === null || last === undefined) {
        return null;
    }

    // The verb compares the figures as printed, so "held" never sits between two different numbers.
    const [from, to] = [roundDeaths(first), roundDeaths(last)];
    const [start, end] = [years[0] ?? 0, lastYearOf(years)];

    if (to === from) {
        return `AIDS-related deaths held at ${deathCount(last)} from ${start} to ${end}.`;
    }

    return `AIDS-related deaths ${to < from ? 'fell' : 'rose'} from ${deathCount(first)} in ${start} to ${deathCount(last)} in ${end}.`;
};

/** The summary sentence for one country; a clause whose data is missing is left out. */
export const countrySentence = (country: Country, years: readonly number[]): string => {
    const aid = lastAid(country);
    const year = lastYearOf(years);
    let opening: string;

    if (aid === 0) {
        opening = `In ${year} ${country.name} received no HIV aid.`;
    } else if (country.plhiv === null || country.plhiv === 0) {
        opening = `In ${year} ${country.name} received ${money(aid)} in HIV aid.`;
    } else {
        opening = `In ${year} ${country.name} received ${money(aid)} in HIV aid, ${perPerson(aid / country.plhiv)} per person living with HIV.`;
    }

    return [
        opening,
        aid > 0 ? mixClause(country) : null,
        treatmentClause(country),
        deathsClause(country, years),
    ]
        .filter((clause) => clause !== null)
        .join(' ');
};
