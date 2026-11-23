// Everything the page shows from DFO, as the build reads it before `next build`
// (lib/buildData.ts): each read in ../_data/refs.json at DFO's newest stored version
// (lib/buildRead.ts), and what `deriveSeries` makes of the rows. A failed read, or rows
// `deriveSeries` refuses, fails the build, so production keeps the last good deploy.
// `pnpm read` finds this file by its path and reads its default export, whose name must be the
// page's directory. It runs on the server only; client components take the result as props.
import type { Row } from '@developmentfinance/client/types';

import refs from '../_data/refs.json' with { type: 'json' };

import { type BuildPage, type BuildRead, readSettled } from '#lib/buildRead.ts';
import type { Derive } from '#lib/liveRead.ts';

const PAGE = '__SLUG__';

/** The provider whose series the page draws. */
const PROVIDER = 'country/DEU';

/** One year of the series the page draws. */
export type Point = { year: number; value: number };

/** What the page shows: the provider's series, and DFO's sentence and citation for the read. */
export type Series = { provider: string; points: Point[]; sentence: string; citation: string };

type Key = 'series';

/**
 * PROVIDER's values by year, from the rows of the `series` read. A row whose value is not a
 * finite number, as a year with no figure is, is left out.
 *
 * @throws When the rows hold no value for PROVIDER, which fails the build.
 */
export const deriveSeries: Derive<Key, Series> = (rows, datasets) => {
    const own = rows.series.filter(
        (row: Row) =>
            row.financingProvider === PROVIDER &&
            typeof row.value === 'number' &&
            Number.isFinite(row.value),
    );

    if (own.length === 0) {
        throw new Error(`The series read holds no values for ${PROVIDER}.`);
    }

    return {
        provider: String(own[0]!.financingProvider_label ?? PROVIDER),
        points: own
            .map((row) => ({ year: Number(row.time_period), value: Number(row.value) }))
            .sort((a, b) => a.year - b.year),
        sentence: datasets.series.sentence,
        citation: datasets.series.citation.text,
    };
};

const page: BuildPage<BuildRead<Key, Series>> = {
    name: PAGE,
    build: (options) =>
        readSettled(PAGE, { series: { ref: refs.data.series.ref } }, deriveSeries, options),
};

export default page;
