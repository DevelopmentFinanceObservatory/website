// The page's layout and the build's read of its figures. A server component: `next build` awaits
// the read once (lib/buildRead.ts) and renders every figure into the static HTML, so the browser
// reads nothing. A failed read or a refused derivation fails the build.
import type { ReactNode } from 'react';

import { PrototypePage } from '../../../components/PrototypePage/PrototypePage';

import { AidProvider, AidRail, AidText } from './AidProse';

import liveRefs from '../_data/live-refs.json';
import { hivFromRows, hivSources } from '../_lib/figures.ts';

import { readAtBuild } from '#lib/buildRead.ts';

/** The build's read of the page's figures, run once per build. */
const readHiv = () => readAtBuild('hiv-financing', hivSources(liveRefs.data), hivFromRows);

/** The page's layout, holding the figures the build read for the island and the prose. */
export const HivPage = async ({ title, children }: { title: string; children: ReactNode }) => {
    const { value } = await readHiv();

    return (
        <AidProvider figures={value}>
            <PrototypePage
                title={title}
                rail={
                    <AidRail
                        after={[
                            { id: 'how-to-interpret', title: 'How to interpret' },
                            { id: 'notes', title: 'Notes' },
                            { id: 'sources', title: 'Sources' },
                        ]}
                    />
                }
                lede={<AidText part="lede" />}
            >
                {children}
            </PrototypePage>
        </AidProvider>
    );
};

/** The day the build read the figures, in UTC, as YYYY-MM-DD. */
export const Retrieved = async () => (await readHiv()).retrieved.slice(0, 10);
