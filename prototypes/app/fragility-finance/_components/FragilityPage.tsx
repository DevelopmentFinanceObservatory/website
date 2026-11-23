// The page's layout and the figures the build read (_lib/build.ts). A server component: it
// renders every figure from .build-data/fragility-finance.json (lib/buildData.ts) into the
// static HTML, so the browser reads nothing.
import type { ReactNode } from 'react';

import { PrototypePage } from '../../../components/PrototypePage/PrototypePage';

import { FiguresProvider } from './Figures';

import { fragilityBuild } from '../_lib/build.ts';

import { readBuilt } from '#lib/buildData.ts';

const readFragility = () => readBuilt(fragilityBuild);

/** The page's layout, holding the figures the build read for the island and the prose. */
export const FragilityPage = async ({
    title,
    sections,
    lede,
    children,
}: {
    title: string;
    sections: { id: string; title: string }[];
    lede: ReactNode;
    children: ReactNode;
}) => {
    const { value } = await readFragility();

    return (
        <FiguresProvider figures={value}>
            <PrototypePage title={title} sections={sections} lede={lede}>
                {children}
            </PrototypePage>
        </FiguresProvider>
    );
};

/** The day the build read the figures, in UTC, as YYYY-MM-DD. */
export const Retrieved = async () => (await readFragility()).retrieved.slice(0, 10);
