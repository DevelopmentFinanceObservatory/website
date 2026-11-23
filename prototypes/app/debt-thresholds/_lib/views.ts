// The page's thresholds data from its base years: the 2024 view the data step commits
// (_data/thresholds-2024.json) and the 2025 view the build makes from DFO (_lib/build.ts). Only
// type imports, which keeps the module loadable by `node --test`.
import type { ThresholdsData, ViewData } from '../_data/types.ts';

/**
 * `ThresholdsData` from `views`, oldest first, each country's `bases` keyed by base year, opening
 * on `defaultYear`.
 *
 * @throws When the views list other countries, or the same ones in another order, or
 *  `defaultYear` is not one of their years.
 */
export const thresholdsData = (views: ViewData[], defaultYear: number): ThresholdsData => {
    const [first] = views;

    if (first === undefined) {
        throw new Error('No base year to show.');
    }

    const order = first.countries.map(({ iso3 }) => iso3).join(',');

    for (const view of views) {
        if (view.countries.map(({ iso3 }) => iso3).join(',') !== order) {
            throw new Error(
                `The ${view.year} view lists other countries than the ${first.year} view.`,
            );
        }
    }

    const baseYears = views.map(({ year }) => year).toSorted((a, b) => a - b);

    if (!baseYears.includes(defaultYear)) {
        throw new Error(`The default year ${defaultYear} is not among ${baseYears.join(', ')}.`);
    }

    return {
        baseYears,
        defaultYear,
        measure: 'pv',
        vintages: Object.fromEntries(views.map(({ year, vintage }) => [String(year), vintage])),
        countries: first.countries.map(({ iso3, name, fdl2024 }, index) => ({
            iso3,
            name,
            fdl2024,
            bases: Object.fromEntries(
                views.map((view) => [String(view.year), view.countries[index]!.base]),
            ),
        })),
    };
};
