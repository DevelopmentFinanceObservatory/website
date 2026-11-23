// The page's server components, which take the build's read of DFO (_lib/build.ts) from
// .build-data/oda-counts.json (lib/buildData.ts) and hand it to the client components. The
// Sources paragraph's citation and read time come from LiveUnitsProvider (./Sources.tsx), so they
// follow the figures when the page reads them again.
import type { ReactNode } from 'react';

import { LiveUnitsProvider } from './LiveUnits';
import { OdaCounts } from './OdaCounts';

import { odaBuild } from '../_lib/build.ts';

import { readBuilt } from '#lib/buildData.ts';

/** The Sources paragraph's citation and read time, which follow a read again in the browser. */
export { SourceCitation, SourceRead } from './Sources';

const read = () => readBuilt(odaBuild);

/** The built figures and the reader's currency offer, for every component below. */
export const BuiltLiveUnits = async ({ children }: { children: ReactNode }) => {
    const { counts, live } = await read();

    return (
        <LiveUnitsProvider
            counts={counts.value}
            retrieved={counts.retrieved}
            stored={counts.stored}
            live={live}
        >
            {children}
        </LiveUnitsProvider>
    );
};

/** The interactive counts, with the definitions the build looked up. */
export const BuiltOdaCounts = async () => {
    const { definitions } = await read();

    return <OdaCounts definitions={definitions} />;
};
