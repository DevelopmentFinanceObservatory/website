// The page's server components, which take the build's read of DFO (../_lib/build.ts) from
// .build-data/<page>.json (lib/buildData.ts) and hand it to the client chart.
import SeriesChart from './SeriesChart';

import page from '../_lib/build.ts';

import { readBuilt } from '#lib/buildData.ts';

/** The chart of the series the build read. */
export const BuiltSeries = async () => {
    const { value } = await readBuilt(page);

    return <SeriesChart series={value} />;
};

/** DFO's citation for the read. */
export const Citation = async () => {
    const { value } = await readBuilt(page);

    return <>{value.citation}</>;
};

/** When the build read the figures, in UTC. */
export const Retrieved = async () => {
    const { retrieved } = await readBuilt(page);
    const [date, time = ''] = retrieved.split('T');

    return (
        <>
            {date} at {time.slice(0, 5)} UTC
        </>
    );
};
