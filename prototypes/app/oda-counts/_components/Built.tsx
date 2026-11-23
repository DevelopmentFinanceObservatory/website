// The page's server components, which take the build's read of DFO (_lib/build.ts) from
// .build-data/oda-counts.json (lib/buildData.ts) and hand it to the client components.
import type { ReactNode } from 'react';

import { LiveUnitsProvider } from './LiveUnits';
import { OdaCounts } from './OdaCounts';

import { odaBuild } from '../_lib/build.ts';

import prose from '../../../components/Prose/Prose.module.scss';

import { readBuilt } from '#lib/buildData.ts';

const read = () => readBuilt(odaBuild);

/** The built figures and the reader's currency offer, for every component below. */
export const BuiltLiveUnits = async ({ children }: { children: ReactNode }) => {
    const { counts, live } = await read();

    return (
        <LiveUnitsProvider data={counts.value.data} live={live}>
            {children}
        </LiveUnitsProvider>
    );
};

/** The interactive counts, with the definitions the build looked up. */
export const BuiltOdaCounts = async () => {
    const { definitions } = await read();

    return <OdaCounts definitions={definitions} />;
};

/** The Sources paragraph's citation, as DFO gives it for the reads. */
export const SourceCitation = async () => {
    const { counts } = await read();

    return <>{counts.value.citation}.</>;
};

/** When the build read the figures, in UTC. */
export const SourceRead = async () => {
    const { counts } = await read();
    const [date, time = ''] = counts.retrieved.split('T');

    return (
        <>
            Read from the{' '}
            <a className={prose.a} href="https://developmentfinance.org/data">
                Development Finance Observatory
            </a>{' '}
            on {date} at {time.slice(0, 5)} UTC, at the newest versions it stores.
        </>
    );
};
