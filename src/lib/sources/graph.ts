/**
 * The Sources pages' data, straight from the graph API.
 *
 * The catalogue (`GET /api/graph/sources`) is the list: each publisher, the
 * Data Commons that serves it, and the Datasets admitted under it. Every
 * Dataset is a card, and its catalogue row carries what the card shows, so
 * the index page makes one read. The documentation door
 * (`GET /api/graph/documentation/{dcid}`) fills the detail page. Nothing is
 * curated on our side. The catalogue is the platform's own reviewed registry,
 * and whichever Datasets it admits are the ones the page shows.
 *
 * Server-only. Every read is cached for an hour, so a page reaches the graph
 * at most once an hour however many people open it.
 */

import { cache } from 'react';

import { originLine } from '../dataCommons.ts';
import { searchApiBase } from '../searchApi.ts';
import type {
    DatasetEntry,
    DocumentErrorEntry,
    SourceCatalogue,
    SourceCatalogueEntry,
    SourceDocumentation,
    VersionHistoryEntry,
} from '../graph/wire.ts';
import type { DataCommonsRef } from '../search/types.ts';

import { httpOnly } from './url.ts';

// Source metadata changes on a data refresh, not on a page view.
const REVALIDATE_SECONDS = 3600;

// The API gives up on a graph read after 10 s (GRAPH_NODE_TIMEOUT_SECONDS).
// The extra 5 s leaves room for its 504 to arrive before the client cuts the
// read.
const READ_TIMEOUT_MS = 15_000;

// A 503 or 504 from the API is usually transient: a cold start or a slow
// upstream. An instant re-read meets the same answer.
const RETRY_DELAY_MS = 1000;

/** One card's chip. `href` turns it into a link; the list order IS the
 *  display order, so every card reads the same way. */
export type SourceChip = {
    kind: 'licence' | 'currency' | 'coverage' | 'scripts';
    label: string;
    href?: string;
};

/** One Dataset in a catalogue entry, with the facts its card shows. A
 *  provenance with no Dataset forms its own row, keyed and labelled by
 *  itself. */
export type SourceDataset = DatasetEntry;

export type { SourceCatalogueEntry };

export type SourceCard = {
    /** the Dataset's dcid (a provenance's, for one with no Dataset), which
     *  identifies the card and keys the detail page */
    id: string;
    title: string;
    /** the publisher's dcid */
    family: string;
    publisher: string | null;
    /** where the data comes from; the card's filter is its publisher when this
     *  is `dfo`, and this origin otherwise (see filters.ts) */
    dataCommons: DataCommonsRef;
    /** the org line: "World Bank via Data Commons by Google", the publisher
     *  alone for DFO's own data, "via UN System Data Commons" alone when the
     *  card's Dataset is the publisher's own node (see originLine) */
    origin: string | null;
    description: string | null;
    chips: SourceChip[];
    /** the publisher's own page, when the graph holds a usable one */
    href: string | null;
    /** `stub` = identity only, the condition a good share of the graph's
     *  sources are in; the card drops to its short form rather than
     *  rendering empty fields. */
    tier: 'full' | 'stub';
};

/** Keep a Changelog's six kinds; the door serves only these. */
export type ChangeKind = VersionHistoryEntry['changes'][number]['kind'];

/** One release: its title and date, and its changes, each a kind and a
 *  Markdown note. */
export type SourceRelease = VersionHistoryEntry;

/** A member of the document the platform could not read: which one, the
 *  line in the stored text when it has one, and why. The page shows one
 *  notice when any exist and does not render the entries. */
export type DocumentError = DocumentErrorEntry;

/** The documentation door's answer: ten members, every one always present
 *  (absent data is null / [], never ""), plus `gaps` naming what is empty.
 *  `methodology.description`, each of `data_notes`, each step's
 *  `description` and each change's `note` are CommonMark Markdown; every
 *  other string is plain text. */
export type SourceDoc = SourceDocumentation;

// Chart coordinates carry a `dcid:` prefix the path can't take (a colon).
const cleanDcid = (dcid: string): string => dcid.replace(/^dcid:/, '');

// A transient upstream or cold-start 503/504 from the API, which the read retries.
const TRANSIENT_STATUSES = new Set([503, 504]);

/**
 * One graph read. A 4xx answer returns null: 404 `node_not_held` is this
 * deployment not holding the node, 404 `not_found` is a bad dcid (a defect
 * on our side, so it gets a log line), and 400 is a node that is not a
 * source. A 5xx answer or a failed request throws, so a transient failure
 * surfaces as an error and only a true absence renders as a missing source.
 * `retries` re-reads after a 503 or 504, once `RETRY_DELAY_MS` has passed,
 * before that throw.
 *
 * Every read carries a timeout signal. Beyond bounding the read, the signal
 * opts the fetch out of Next's per-render request dedupe, which would
 * otherwise replay the first 503 to the retry. The hourly data cache applies
 * to a 200 answer.
 */
const readGraph = async <T>(path: string, { retries = 0 } = {}): Promise<T | null> => {
    const url = `${searchApiBase()}/api/graph/${path}`;
    let res: Response;

    try {
        res = await fetch(url, {
            signal: AbortSignal.timeout(READ_TIMEOUT_MS),
            next: { revalidate: REVALIDATE_SECONDS },
        });
    } catch (error) {
        throw new Error(`sources: the graph read "${path}" failed`, { cause: error });
    }

    if (TRANSIENT_STATUSES.has(res.status) && retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));

        return readGraph<T>(path, { retries: retries - 1 });
    }

    if (res.status >= 500) {
        throw new Error(`sources: the graph answered "${path}" with HTTP ${res.status}`);
    }

    if (res.status === 404) {
        const body = (await res.json().catch(() => null)) as { code?: string } | null;

        if (body?.code === 'not_found') {
            console.error(`sources: the graph rejects "${path}" as unknown`);
        }

        return null;
    }

    return res.ok ? ((await res.json()) as T) : null;
};

/**
 * A catalogue Dataset, as a card under its entry's publisher. Chips keep a
 * fixed order (licence, update cadence, years covered), and a Dataset with
 * nothing to say for one of them omits it.
 */
export const toCard = (entry: SourceCatalogueEntry, dataset: SourceDataset): SourceCard => {
    const chips: SourceChip[] = [];

    if (dataset.license_type) {
        chips.push({ kind: 'licence', label: dataset.license_type });
    }

    if (dataset.update_cadence) {
        chips.push({ kind: 'currency', label: dataset.update_cadence });
    }

    if (dataset.years_covered) {
        chips.push({ kind: 'coverage', label: dataset.years_covered });
    }

    const description = dataset.description ?? null;

    return {
        id: dataset.ref,
        // The graph's name for the Dataset, as the API serves it.
        title: dataset.label,
        family: entry.source.ref,
        publisher: entry.source.label,
        dataCommons: entry.data_commons,
        origin: originLine(dataset.ref, entry.source, entry.data_commons, dataset.label),
        description,
        chips,
        href: httpOnly(dataset.source_url) ?? null,
        tier: description ? 'full' : 'stub',
    };
};

/** Every Dataset the platform publishes, as cards, in the catalogue's order.
 *  Safe to call from a server component. */
export const loadSources = async (): Promise<SourceCard[]> => {
    const catalogue = await readGraph<SourceCatalogue>('sources', { retries: 1 });

    return (catalogue?.sources ?? []).flatMap((entry) =>
        entry.datasets.map((dataset) => toCard(entry, dataset)),
    );
};

// A segment that would change where the request goes once it sits in the URL
// path: empty, a dot segment, or one holding a query, fragment, escape or
// backslash character.
const UNSAFE_SEGMENT = /^\.{0,2}$|[?#%\\]/;

/** The documentation path for a dcid, each segment percent-encoded; null
 *  when a segment could redirect the read to another API path. */
const documentationPath = (dcid: string): string | null => {
    const segments = cleanDcid(dcid).split('/');

    return segments.some((segment) => UNSAFE_SEGMENT.test(segment))
        ? null
        : `documentation/${segments.map(encodeURIComponent).join('/')}`;
};

/** One source's documentation, for the detail page; null when the graph
 *  holds no such source or the dcid is not a well-formed path. Memoised per
 *  server request, so the page and its generateMetadata share one read. The
 *  fetch data cache stores only a 200 answer, so without this a 404 or a
 *  failure is read twice. */
export const loadSourceDoc = cache(async (dcid: string): Promise<SourceDoc | null> => {
    const path = documentationPath(dcid);

    if (!path) {
        return null;
    }

    // `document_errors` is the one member an older or rolled-back API (or a
    // cached answer from before it existed) leaves out; the page reads its length.
    const doc = await readGraph<Omit<SourceDoc, 'document_errors'> & Partial<SourceDoc>>(path);

    return doc && { ...doc, document_errors: doc.document_errors ?? [] };
});
