// The page's layout and the figures the build read (_lib/build.ts). A server component: it
// renders every figure from .build-data/fragility-finance.json (lib/buildData.ts) into the
// static HTML. The browser reads again only when DFO has stored newer data (./Figures.tsx).
import type { ReactNode } from 'react';

import { PrototypePage } from '../../../components/PrototypePage/PrototypePage';

import { FiguresProvider } from './Figures';

import { fragilityBuild } from '../_lib/build.ts';

import { readBuilt } from '#lib/buildData.ts';

/** When the figures shown were read, which follows a read again in the browser. */
export { Retrieved } from './Figures';

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
    const { value, retrieved, stored } = await readFragility();

    return (
        <FiguresProvider figures={value} retrieved={retrieved} stored={stored}>
            <PrototypePage title={title} sections={sections} lede={lede}>
                {children}
            </PrototypePage>
        </FiguresProvider>
    );
};
