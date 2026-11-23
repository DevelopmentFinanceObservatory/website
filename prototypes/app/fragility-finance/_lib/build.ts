// Everything the page shows from DFO, as the build reads it before `next build`
// (lib/buildData.ts): the OECD's classification from _data/fragility-2026.tsv, the reads of
// refs.json at DFO's newest stored versions (lib/buildRead.ts) and the figures derived from
// them. A failed read, a refused derivation or a broken check fails the build.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import refs from '../_data/refs.json' with { type: 'json' };

import { parseClassification } from './classification.ts';
import { type Figures, figuresFromRows, recipientGroups, sources } from './figures.ts';

import { type BuildPage, type BuildRead, readSettled } from '#lib/buildRead.ts';

/** The OECD's classification, read from the page's directory under the build's working
 *  directory, `prototypes/`. */
const CLASSIFICATION = path.join(
    process.cwd(),
    'app',
    'fragility-finance',
    '_data',
    'fragility-2026.tsv',
);

/** The page's build-time read: its figures, when they were read and the versions read. */
export const fragilityBuild: BuildPage<BuildRead<string, Figures>> = {
    name: 'fragility-finance',
    build: (options) => {
        const profiles = parseClassification(readFileSync(CLASSIFICATION, 'utf8'));
        const groups = recipientGroups(refs.data, profiles);

        return readSettled(
            'fragility-finance',
            sources(refs.data, groups),
            (rows) => figuresFromRows(rows, profiles, groups),
            options,
        );
    },
};
