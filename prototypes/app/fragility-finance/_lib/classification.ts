// The OECD's 2026 fragility classification, from _data/fragility-2026.tsv: the OECD's data
// file behind its fragility chart, linked from its multidimensional fragility dashboard
// (https://gitvfd.github.io/states-of-fragility-snail/data-new.tsv), with columns iso3,
// country, overall score, tier, the six dimension scores and each dimension's category from 1
// (most fragile) to 5. The file is an OECD input outside DFO, so the repository keeps it.
import type { Context, DimensionKey, Tier } from '../_data/types.ts';

import { DIMENSIONS } from './profile.ts';

import { recordOf } from '#lib/record.ts';
import { pythonRound } from '#lib/round.ts';

/** What the classification says of a context: everything but its finance. */
export type Profile = Pick<Context, 'iso3' | 'name' | 'tier' | 'score' | 'rank' | 'dimensions'>;

/** How many contexts the 2026 update classifies, in all and in each tier. */
export const CLASSIFIED = { all: 62, extreme: 20, high: 42 } as const;

/** Short names for the contexts the OECD's file names in ISO style. */
export const NAMES: Readonly<Record<string, string>> = {
    COD: 'DR Congo',
    SDN: 'Sudan',
    CAF: 'Central African Republic',
    SYR: 'Syria',
    COG: 'Congo',
    NER: 'Niger',
    COM: 'Comoros',
    VEN: 'Venezuela',
    LAO: 'Laos',
    TZA: 'Tanzania',
    PSE: 'West Bank and Gaza',
    PRK: 'North Korea',
    GMB: 'The Gambia',
    IRN: 'Iran',
};

/** Each dimension's key and the column of the file that holds its score. Its category is in
 *  the column named by the key. */
const DIMENSION_SCORES: Record<DimensionKey, string> = {
    eco: 'Economic.PC1',
    env: 'Environmental.PC1',
    hum: 'Human.PC1',
    pol: 'Political.PC1',
    sec: 'Security.PC1',
    soc: 'Societal.PC1',
};

const isTier = (value: string): value is Tier => value === 'extreme' || value === 'high';

/**
 * The contexts of `tsv`, most fragile first, each ranked from 1 and its scores rounded to two
 * places.
 *
 * @throws When a row's tier is neither `extreme` nor `high`, a score is not a number, or the
 *   file holds other than 62 contexts, 20 extreme and 42 high.
 */
export const parseClassification = (tsv: string): Profile[] => {
    const [header, ...lines] = tsv.trimEnd().split(/\r?\n/);
    const columns = (header ?? '').split('\t');
    const rows = lines.map((line) => {
        const cells = line.split('\t');

        return new Map(columns.map((column, index) => [column, cells[index] ?? '']));
    });
    const numberAt = (row: Map<string, string>, column: string): number => {
        const value = Number(row.get(column));

        if (row.get(column) === '' || !Number.isFinite(value)) {
            throw new Error(`fragility-2026.tsv: ${row.get('iso3')} has no number in ${column}`);
        }

        return value;
    };

    const profiles = rows
        .map((row) => ({ row, overall: numberAt(row, 'overall') }))
        .toSorted((a, b) => a.overall - b.overall)
        .map(({ row, overall }, index): Profile => {
            const iso3 = row.get('iso3') ?? '';
            const tier = row.get('tier') ?? '';

            if (!isTier(tier)) {
                throw new Error(`fragility-2026.tsv: ${iso3} has the tier ${tier}`);
            }

            const dimensions = recordOf(
                DIMENSIONS.map(({ key }) => key),
                (key) => ({
                    score: pythonRound(numberAt(row, DIMENSION_SCORES[key]), 2),
                    category: numberAt(row, key),
                }),
            );

            return {
                iso3,
                name: NAMES[iso3] ?? row.get('country') ?? iso3,
                tier,
                score: pythonRound(overall, 2),
                rank: index + 1,
                dimensions,
            };
        });
    const extreme = profiles.filter(({ tier }) => tier === 'extreme').length;

    if (
        profiles.length !== CLASSIFIED.all ||
        extreme !== CLASSIFIED.extreme ||
        profiles.length - extreme !== CLASSIFIED.high
    ) {
        throw new Error(
            `fragility-2026.tsv: expected ${CLASSIFIED.extreme} extreme and ${CLASSIFIED.high} high contexts, found ${extreme} and ${profiles.length - extreme}`,
        );
    }

    return profiles;
};
