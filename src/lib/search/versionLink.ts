/**
 * Version links: `/data?spec=<spec_id>&v=<content_version>` opens one stored
 * version of a dataset on the search page, read back like a snapshot share,
 * and `/data?spec=<spec_id>` alone opens the definition's latest data, like a
 * live share. Every downloaded bundle prints the first form. Both open
 * through the share path (`openShare` in useSearchRun), with the single
 * reference built from a Datasets API document instead of the share table:
 * the version manifest (`GET /api/datasets/{spec}/{cv}`) or, for the latest
 * data, the write-free options envelope (`GET /api/datasets/{spec}/options`).
 * Both carry `definition {spec_id, identity}`, and the resubmit posts the
 * identity alone.
 *
 * This module has no DOM or path-alias dependency, so `node --test` imports
 * it directly.
 */

import type { OpenedSearchShare } from './searchClient';

export type VersionLink = { specId: string; contentVersion: string | null };

export const SPEC_SHAPE = /^spec_[a-z0-9]+$/;
export const VERSION_SHAPE = /^cv_[a-z0-9]+$/;

/** The link `params` carry, or null when they carry none or a malformed one. */
export const parseVersionLink = (params: {
    get(name: string): string | null;
}): VersionLink | null => {
    const specId = params.get('spec');
    const contentVersion = params.get('v');

    if (!specId || !SPEC_SHAPE.test(specId)) {
        return null;
    }

    if (contentVersion !== null && !VERSION_SHAPE.test(contentVersion)) {
        return null;
    }

    return { specId, contentVersion };
};

export const versionLinkHref = ({ specId, contentVersion }: VersionLink): string =>
    contentVersion ? `/data?spec=${specId}&v=${contentVersion}` : `/data?spec=${specId}`;

/** The fields of a version manifest or options envelope this module reads. */
export type VersionLinkDocument = {
    content_version?: string;
    definition?: { spec_id?: string; identity?: unknown } | null;
    artifacts?: {
        artifact_digest?: string;
        created_at?: string;
        url?: string;
        rendering?: { format?: string; bundle?: boolean };
    }[];
    citation?: { sources?: { label?: string }[] };
};

/** A version's stored file, by the site route that redirects to its stable
 *  link; `format` is 'zip' for the bundle. */
export type VersionDownload = { href: string; format: string };

export type VersionLinkOutcome =
    | { kind: 'opened'; shared: OpenedSearchShare }
    // A definition Search cannot replay: the page offers the version's
    // stored file instead, when the link names a version that has one.
    | { kind: 'download_only'; download: VersionDownload | null };

// A definition that pins its StatVars (Datasets' statvar_set and
// source_codes inputs) names no measure family, and Search refuses to
// resubmit it.
const isPinnedKind = (identity: unknown): boolean =>
    (identity as { shape?: { kind?: unknown } }).shape?.kind === 'stat_var';

type StoredFile = {
    url: string;
    artifact_digest?: string;
    rendering: { format: string; bundle?: boolean };
};

/** The canonical frame a version manifest lists: the API's internal storage
 *  form, which the site offers in no download format. */
export const isCanonicalFrame = (artifact: { rendering?: { format?: string } }): boolean =>
    artifact.rendering?.format === 'frame';

/**
 * The version's file to offer, by its stable link, with its digest for a pin:
 * the bundle, else its first data file. A statistics rendering carries no
 * format and the canonical frame is no download format, so neither is ever
 * offered. `/api/version-download` and `/s/<id>/download` redirect to it.
 */
export const storedDownload = (document: {
    artifacts?: VersionLinkDocument['artifacts'];
}): { url: string; format: string; digest: string | null } | null => {
    const files = (document.artifacts ?? []).filter(
        (artifact): artifact is StoredFile =>
            !!artifact.url && !!artifact.rendering?.format && !isCanonicalFrame(artifact),
    );
    const bundle = files.find((artifact) => artifact.rendering.bundle);
    const file = bundle ?? files[0];

    return file
        ? {
              url: file.url,
              format: bundle ? 'zip' : file.rendering.format,
              digest: file.artifact_digest ?? null,
          }
        : null;
};

export const versionDownloadHref = ({ specId, contentVersion }: VersionLink): string =>
    `/api/version-download/${specId}/${contentVersion}`;

/**
 * What a link opens as. A replayable definition opens as a share: one
 * reference, frozen at the link's version or live without one. A version is
 * dated by its earliest stored artifact and named by its sources; the
 * options envelope carries no citation, so a latest-data link is named
 * "Dataset". The seed is null when the trace lists no StatVars, as older and
 * truncated traces do. A pinned-StatVar definition never reaches Search: it
 * is `download_only`, with the stored file only for a version link, since
 * only a version manifest lists one. Null when the document carries no
 * definition identity.
 */
export const outcomeFromDocument = (
    link: VersionLink,
    document: VersionLinkDocument,
): VersionLinkOutcome | null => {
    const identity = document.definition?.identity;

    if (!identity) {
        return null;
    }

    if (isPinnedKind(identity)) {
        const stored = link.contentVersion ? storedDownload(document) : null;

        return {
            kind: 'download_only',
            download: stored && { href: versionDownloadHref(link), format: stored.format },
        };
    }

    const storedAt = (document.artifacts ?? [])
        .map((artifact) => artifact.created_at)
        .filter((at): at is string => typeof at === 'string')
        .toSorted()[0];
    const specId = document.definition?.spec_id ?? link.specId;
    const sources = (document.citation?.sources ?? [])
        .map((source) => source.label)
        .filter((label): label is string => !!label);

    const shared: OpenedSearchShare = {
        id: specId,
        mode: link.contentVersion ? 'snapshot' : 'live',
        // No question behind a link: the page heads it with the resolved
        // sentence.
        query: '',
        createdAt: storedAt ?? new Date().toISOString(),
        refs: [
            {
                partIndex: 0,
                // `dataset_resubmit` refuses an empty variable_text.
                variableText: sources.join(', ') || 'Dataset',
                specId,
                identity,
                // A dataset document holds the definition alone.
                entityGroups: null,
                operations: [],
                assumptions: null,
                contentVersion: link.contentVersion,
            },
        ],
        link,
    };

    return { kind: 'opened', shared };
};
