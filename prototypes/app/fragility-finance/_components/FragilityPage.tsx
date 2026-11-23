// The page's layout and the build's read of its figures. A server component: `next build` awaits
// the read once (lib/buildRead.ts) and renders every figure into the static HTML, so the browser
// reads nothing. A failed read, a refused derivation or a broken check fails the build.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { ReactNode } from 'react';

import { PrototypePage } from '../../../components/PrototypePage/PrototypePage';

import { FiguresProvider } from './Figures';

import refs from '../_data/refs.json';
import { parseClassification } from '../_lib/classification.ts';
import { figuresFromRows, recipientGroups, sources } from '../_lib/figures.ts';

import { readAtBuild } from '#lib/buildRead.ts';

/** The OECD's classification, read from the page's directory under the build's working
 *  directory, `prototypes/`. */
const CLASSIFICATION = path.join(
    process.cwd(),
    'app',
    'fragility-finance',
    '_data',
    'fragility-2026.tsv',
);

/** The build's read of the page's figures, run once per build. */
const readFragility = () => {
    const profiles = parseClassification(readFileSync(CLASSIFICATION, 'utf8'));
    const groups = recipientGroups(refs.data, profiles);

    return readAtBuild('fragility-finance', sources(refs.data, groups), (rows) =>
        figuresFromRows(rows, profiles, groups),
    );
};

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
