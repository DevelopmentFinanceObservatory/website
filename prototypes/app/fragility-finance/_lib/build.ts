// Everything the page shows from DFO, as the build reads it before `next build`
// (lib/buildData.ts): the OECD's classification from _data/fragility-2026.tsv, the reads of
// refs.json at DFO's newest stored versions (lib/buildRead.ts) and the figures derived from
// them, with DFO's stored versions of every spec the reads took, checked before the reads and
// after (`readChecked`). A failed read, a refused derivation, a check that moved on every read or
// a broken check fails the build.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import refs from '../_data/refs.json' with { type: 'json' };

import { parseClassification } from './classification.ts';
import { type Figures, figuresFromRows, recipientGroups, sources } from './figures.ts';

import { type BuildPage, type CheckedRead, readChecked } from '#lib/buildRead.ts';

/** The OECD's classification, read from the page's directory under the build's working
 *  directory, `prototypes/`. */
const CLASSIFICATION = path.join(
    process.cwd(),
    'app',
    'fragility-finance',
    '_data',
    'fragility-2026.tsv',
);

/** The page's build-time read: its figures, when they were read, the versions read and DFO's
 *  stored versions. */
export const fragilityBuild: BuildPage<CheckedRead<string, Figures>> = {
    name: 'fragility-finance',
    build: (options) => {
        const profiles = parseClassification(readFileSync(CLASSIFICATION, 'utf8'));
        const groups = recipientGroups(refs.data, profiles);

        return readChecked(
            'fragility-finance',
            sources(refs.data, groups),
            (rows) => figuresFromRows(rows, profiles, groups),
            options,
        );
    },
};

export default fragilityBuild;
