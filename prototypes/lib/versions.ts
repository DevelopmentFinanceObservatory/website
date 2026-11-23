// The dataset versions a read took, and the rule that one page shows each spec at one version.
// The build (./buildRead.ts) records them for each source; the browser's read again
// (./storedCheck.ts) holds to the same rule. This module imports nothing that runs on the server
// only, so the browser chunk stays small.
import type { Dataset } from '@developmentfinance/client';
import { type Freshness, isDerived } from '@developmentfinance/client/types';

/** One dataset version a read took: the spec and the content version DFO served. */
export type StoredVersion = { specId: string; contentVersion: string };

/** What the build read for one source: the dataset versions it took and how new DFO says they
 *  are. A ref's versions are its members'; a recipe's are the roots DFO resolved it on. */
export type BuildSource = { versions: StoredVersion[]; freshness: Freshness | null };

/** The dataset versions a read took, each once: a dataset member's own version, or for a
 *  derived member each root its recipe ran on. */
export const versionsOf = (dataset: Dataset): StoredVersion[] => {
    const seen = new Map<string, StoredVersion>();

    for (const member of dataset.ref.members) {
        const versions = isDerived(member)
            ? member.roots.map(({ specId, contentVersion }) => ({ specId, contentVersion }))
            : [{ specId: member.spec.spec_id, contentVersion: member.contentVersion }];

        for (const version of versions) {
            seen.set(`${version.specId}@${version.contentVersion}`, version);
        }
    }

    return [...seen.values()];
};

/**
 * Each spec the reads took at more than one content version, with those versions sorted, as when
 * DFO stored a new version between two reads of one build. A build that shows such reads side by
 * side mixes two releases.
 */
export const splitVersions = (
    ...reads: readonly Readonly<Record<string, BuildSource>>[]
): Map<string, string[]> => {
    const bySpec = new Map<string, Set<string>>();

    for (const sources of reads) {
        for (const { versions } of Object.values(sources)) {
            for (const { specId, contentVersion } of versions) {
                bySpec.set(specId, (bySpec.get(specId) ?? new Set()).add(contentVersion));
            }
        }
    }

    return new Map(
        [...bySpec]
            .filter(([, versions]) => versions.size > 1)
            .map(([specId, versions]) => [specId, [...versions].toSorted()]),
    );
};

/**
 * Checks that the reads took each spec at one content version.
 *
 * @throws An error naming `page`, each split spec and its versions.
 */
export const checkOneVersionPerSpec = (
    page: string,
    ...reads: readonly Readonly<Record<string, BuildSource>>[]
): void => {
    const split = splitVersions(...reads);

    if (split.size > 0) {
        const named = [...split]
            .map(([specId, versions]) => `${specId} at ${versions.join(' and ')}`)
            .join('; ');

        throw new Error(
            `The build read of ${page} took one spec at two versions, so the build stops: ${named}.`,
        );
    }
};

/** The dataset versions a read took, each once, as `versionsOf` gives them, less each derived
 *  root that names a `groupby`: such a root's version names the rendering DFO grouped from the
 *  spec's data, which is not a version of the spec, so two such roots cannot split a spec. */
export const datasetVersionsOf = (dataset: Dataset): StoredVersion[] => {
    const seen = new Map<string, StoredVersion>();

    for (const member of dataset.ref.members) {
        const versions = isDerived(member)
            ? member.roots
                  .filter(({ groupby }) => groupby === undefined)
                  .map(({ specId, contentVersion }) => ({ specId, contentVersion }))
            : [{ specId: member.spec.spec_id, contentVersion: member.contentVersion }];

        for (const version of versions) {
            seen.set(`${version.specId}@${version.contentVersion}`, version);
        }
    }

    return [...seen.values()];
};
