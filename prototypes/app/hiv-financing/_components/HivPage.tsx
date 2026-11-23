// The page's layout and the figures the build read (_lib/build.ts). A server component: it
// renders every figure from .build-data/hiv-financing.json (lib/buildData.ts) into the static
// HTML, so the browser reads nothing.
import type { ReactNode } from 'react';

import { PrototypePage } from '../../../components/PrototypePage/PrototypePage';

import { AidProvider, AidRail, AidText } from './AidProse';

import { hivBuild } from '../_lib/build.ts';

import { readBuilt } from '#lib/buildData.ts';

const readHiv = () => readBuilt(hivBuild);

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
