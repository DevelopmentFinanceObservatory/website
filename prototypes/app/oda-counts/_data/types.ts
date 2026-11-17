// The shape of _data/counts.json's and _data/definitions.json's `data`, written by
// _data/fetch.py and read by _lib/counts.ts and the page's components. Both import it
// with `import type`, so it never reaches the bundle.

/** The OECD counts of a donor's ODA the page sets side by side. */
export type CountKey = 'gross' | 'grantEquivalent' | 'net' | 'commitments' | 'headline';

/** Series that say what is inside the counts. */
export type ScopeKey = 'bilateral' | 'multilateral' | 'refugeeCosts' | 'grossNonGrants';

export type SeriesKey = CountKey | ScopeKey;

export type Prices = 'current' | 'constant';

/** One value per year of `CountsData.years`, null where the OECD publishes none. */
export type ByYear = (number | null)[];

export type Donor = {
    /** the DFO provider id, such as `country/FRA` or `DACCountriesTotal` */
    id: string;
    name: string;
    /** a DAC group total, such as DAC countries, rather than one donor */
    isGroup: boolean;
    /**
     * Each series in millions of US dollars, at current prices and at constant
     * prices of `CountsData.baseYear`. `headline` is net disbursements to 2017 and
     * grant equivalents from 2018. `bilateral`, `multilateral` and `grossNonGrants`
     * are gross disbursements; `refugeeCosts` is on the headline basis. A group total
     * is null in a year it would sum only some members.
     */
    series: Record<SeriesKey, Record<Prices, ByYear>>;
    /** OECD headline ODA as a percentage of gross national income */
    odaGni: ByYear;
};

export type CountsData = {
    years: number[];
    /** the year constant prices are expressed in */
    baseYear: number;
    /** countries by name, then group totals by name */
    donors: Donor[];
};

/** A graph node's definition, or one written for the page where the graph has none. */
export type Definition = {
    id: string;
    label: string;
    description: string;
    /** `graph` for a DFO graph node, `page` for text written in the data step */
    source: 'graph' | 'page';
};

/** One year of the template's series. TODO: delete with _components/SeriesChart.tsx. */
export type Point = { year: number; value: number };
