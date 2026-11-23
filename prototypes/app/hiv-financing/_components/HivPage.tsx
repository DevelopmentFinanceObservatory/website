// The page's layout and the figures the build read (_lib/build.ts). A server component: it
// renders every figure from .build-data/hiv-financing.json (lib/buildData.ts) into the static
// HTML. The browser reads again only when DFO has stored newer data (./AidProse.tsx).
import type { ReactNode } from 'react';

import { PrototypePage } from '../../../components/PrototypePage/PrototypePage';

import { AidProvider, AidRail, AidText } from './AidProse';

import { hivBuild } from '../_lib/build.ts';

import { readBuilt } from '#lib/buildData.ts';

/** When the figures shown were read, which follows a read again in the browser. */
export { Retrieved } from './AidProse';

const readHiv = () => readBuilt(hivBuild);

/** The page's layout, holding the figures the build read for the island and the prose. */
export const HivPage = async ({ title, children }: { title: string; children: ReactNode }) => {
    const { value, retrieved, stored } = await readHiv();

    return (
        <AidProvider figures={value} retrieved={retrieved} stored={stored}>
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
