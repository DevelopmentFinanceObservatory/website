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

import { originLine } from '../dataCommons.ts';
import { searchApiBase } from '../searchApi.ts';
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
 *  itself. The facts are display labels, the same values the documentation
 *  door serves for the Dataset, and null where the graph has none (always on
 *  a UN System Data Commons row). */
export type SourceDataset = {
    ref: string;
    label: string;
    description: string | null;
    /** `SourceDoc.license.type` */
    license_type: string | null;
    /** `SourceDoc.license.update_cadence` */
    update_cadence: string | null;
    /** `SourceDoc.scope_and_units.years_covered` */
    years_covered: string | null;
    /** the publisher's own page, `SourceDoc.details.source_url` */
    source_url: string | null;
    provenances: { ref: string; label: string }[];
};

/** One `GET /api/graph/sources` entry: a publisher (the graph's Source node,
 *  or a UN agency provenance), its Data Commons, the Datasets admitted under
 *  it, and the provenances left out. */
export type SourceCatalogueEntry = {
    source: { ref: string; label: string };
    data_commons: DataCommonsRef;
    datasets: SourceDataset[];
    exclusions: {
        ref: string;
        reason: 'superseded_by_dfo' | 'superseded_by_un_system';
    }[];
};

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
export type ChangeKind = 'added' | 'changed' | 'deprecated' | 'removed' | 'fixed' | 'security';

/** One release: its title and date, and its changes, each a kind and a
 *  Markdown note. */
export type SourceRelease = {
    /** YYYY-MM-DD */
    date: string;
    title: string;
    changes: { kind: ChangeKind; note: string }[];
};

/** A member of the document the platform could not read: which one, the
 *  line in the stored text when it has one, and why. The page shows one
 *  notice when any exist and does not render the entries. */
export type DocumentError = {
    member: 'transformation_log' | 'version_history' | 'methodology.description' | 'data_notes';
    line: number | null;
    reason: string;
};

/** The documentation door's answer: ten members, every one always present
 *  (absent data is null / [], never ""), plus `gaps` naming what is empty.
 *  `methodology.description`, each of `data_notes`, each step's
 *  `description` and each change's `note` are CommonMark Markdown; every
 *  other string is plain text. */
export type SourceDoc = {
    details: {
        name_of_source: string | null;
        publisher: string | null;
        /** the origin registry's publisher, null unless the catalogue admits
         *  every documented provenance and they share one */
        source: { ref: string; label: string } | null;
        /** the Data Commons serving the documented provenances, on the same rule */
        data_commons: DataCommonsRef | null;
        description: string | null;
        source_url: string | null;
        /** where the data is downloaded from: a file, an API call or a portal page, depending on the source */
        source_data_url: string | null;
        citation: string | null;
    };
    license: {
        type: string | null;
        /** the licence text on the publisher's site */
        url: string | null;
        update_cadence: string | null;
        last_update: string | null;
        next_expected_update: string | null;
    };
    scope_and_units: {
        countries: string[];
        years_covered: string | null;
        granularity: string | null;
        /** sorted ISO 4217 codes; [] when the source names none */
        currencies: string[];
    };
    methodology: { description: string | null };
    data_notes: string[];
    usage: {
        api_access: { documentation_url?: string | null; code?: string | null } | null;
        python: { documentation_url?: string | null; code?: string | null } | null;
    };
    /** one card per step: its short name and what it changed */
    transformation_log: { transformation: string; description: string }[];
    /** one timeline entry per release, newest first */
    version_history: SourceRelease[];
    /** dotted paths of everything the platform knows it has no data for */
    gaps: string[];
    /** what the platform could not read out of the stored document */
    document_errors: DocumentError[];
};

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
    const catalogue = await readGraph<{ sources?: SourceCatalogueEntry[] }>('sources', {
        retries: 1,
    });

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
 *  holds no such source or the dcid is not a well-formed path. */
export const loadSourceDoc = async (dcid: string): Promise<SourceDoc | null> => {
    const path = documentationPath(dcid);

    if (!path) {
        return null;
    }

    const doc = await readGraph<
        Omit<SourceDoc, 'document_errors'> & Partial<Pick<SourceDoc, 'document_errors'>>
    >(path);

    // The API may omit `document_errors`; `SourceDoc` keeps it required.
    return doc && { ...doc, document_errors: doc.document_errors ?? [] };
};
