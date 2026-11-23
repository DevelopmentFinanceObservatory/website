// Every figure the page shows from DFO, as the build reads them (../_components/HivPage.tsx):
// the aid figures from eight analysis recipes and the two Global Fund reads, the names the page
// prints from the aid read's labels, and the UNAIDS figures for each country the aid figures
// keep. The refs come from _data/live-refs.json, read at DFO's newest stored versions.
import type { HivData, UnaidsFigures } from '../_data/types.ts';

import {
    AID_KEYS,
    aidFromRows,
    aidNames,
    aidSources,
    type AidKey,
    type AidRow,
    GF_KEYS,
    PRICE_BASE,
    YEARS,
} from './aid.ts';
import { unaidsByCountry } from './unaids.ts';

import type { LiveSource } from '#lib/liveRead.ts';
import { recordOf } from '#lib/record.ts';

/** The page's figures: the aid figures, and each kept country's UNAIDS figures by ISO code. */
export type HivFigures = {
    data: HivData;
    unaids: Readonly<Record<string, UnaidsFigures>>;
};

/** The reads the page's figures come from, keyed as in live-refs.json. */
export type HivRefs = Record<
    'aid' | 'plhiv' | 'art' | 'deaths' | (typeof GF_KEYS)[number],
    unknown
>;

/** Each source's key: an aid recipe or Global Fund read, the aid read the names come from, or
 *  a UNAIDS read. */
export type HivKey = AidKey | 'aid' | 'plhiv' | 'art' | 'deaths';

/** The build's sources: the aid recipes and Global Fund reads over `YEARS`, the aid read
 *  itself for its labels, and the three UNAIDS reads. */
export const hivSources = (refs: HivRefs): Record<HivKey, LiveSource> => ({
    ...aidSources(refs, [YEARS[0]!, YEARS.at(-1)!]),
    aid: { ref: refs.aid },
    plhiv: { ref: refs.plhiv },
    art: { ref: refs.art },
    deaths: { ref: refs.deaths },
});

/**
 * The page's figures from the rows of every source. The names come from the aid read's labels
 * (`aidNames`), the aid figures from the recipes and Global Fund reads (`aidFromRows`), and the
 * UNAIDS figures for the countries the aid figures keep (`unaidsByCountry`).
 *
 * @throws {AidRowsError} As `aidNames` and `aidFromRows`.
 * @throws {UnaidsRowsError} As `unaidsByCountry`.
 */
export const hivFromRows = (rows: Readonly<Record<HivKey, readonly AidRow[]>>): HivFigures => {
    const names = aidNames(rows.aid);
    const data = aidFromRows(
        recordOf(AID_KEYS, (key) => rows[key]),
        { years: YEARS, priceBase: PRICE_BASE, names },
    );
    const unaids = unaidsByCountry(
        data.countries.map(({ iso3 }) => iso3),
        { plhiv: rows.plhiv, art: rows.art, deaths: rows.deaths },
        data.years,
    );

    return { data, unaids };
};
