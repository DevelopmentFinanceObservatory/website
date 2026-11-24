/**
 * The Sources page's two filters and its summary line.
 *
 * A reader finds a source by typing part of its title or its publisher's
 * name (`?q=`), and narrows by provenance (`?via=`): the Observatory's own
 * imports, or the Data Commons that delivered the data. The two combine.
 * The summary line reports how many sources are showing and how they split
 * by provenance.
 *
 * The Studio landing's data drawer links here with the filter chips' old
 * `?filter=` value (lib/sources/filters.ts): a Data Commons id, or the
 * dcid of a publisher the Observatory imports itself. The page reads that
 * as a provenance or a publisher query, so those links keep working.
 */

import type { DataCommonsRef } from '../search/types.ts';

import type { Filterable } from './filters.ts';

/** Where a source's data comes from: the Observatory's own import (`dfo`)
 *  or a Data Commons (`base`, `un_system`). */
export type Provenance = DataCommonsRef['id'];

export type ProvenanceGroup = { id: Provenance; label: string; count: number };

export type SourceFilters = { q: string; via: Provenance | null };

// Provenances in display order: the Observatory's own imports, then the
// Data Commons.
const PROVENANCE_ORDER: Provenance[] = ['dfo', 'base', 'un_system'];

const rank = (id: string): number => {
    const index = PROVENANCE_ORDER.indexOf(id as Provenance);

    return index === -1 ? PROVENANCE_ORDER.length : index;
};

const collate = (a: string, b: string) => a.localeCompare(b, 'en');

/** The chip's name for a provenance: "DFO" for the Observatory's own
 *  imports, else the Data Commons' own label. */
export const provenanceLabel = (commons: DataCommonsRef): string =>
    commons.id === 'dfo' ? 'DFO' : commons.label;

/** How the summary line names a provenance's share: "ingested by DFO" or
 *  "via Data Commons by Google". */
const provenanceShare = (commons: DataCommonsRef): string =>
    commons.id === 'dfo' ? 'ingested by DFO' : `via ${commons.label}`;

/** One chip per provenance with cards, in PROVENANCE_ORDER, each counting
 *  its cards. */
export const provenanceGroups = (cards: readonly Filterable[]): ProvenanceGroup[] => {
    const groups = new Map<Provenance, ProvenanceGroup>();

    for (const card of cards) {
        const group = groups.get(card.dataCommons.id);

        if (group) {
            group.count += 1;
        } else {
            groups.set(card.dataCommons.id, {
                id: card.dataCommons.id,
                label: provenanceLabel(card.dataCommons),
                count: 1,
            });
        }
    }

    return [...groups.values()].sort((a, b) => rank(a.id) - rank(b.id));
};

// A query and a card's text compare lower-cased with runs of whitespace
// folded, so "world  bank" finds "World Bank".
const fold = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');

/** Whether the card's title or publisher holds the query. An empty query
 *  matches every card. */
export const matchesQuery = (card: Filterable, q: string): boolean => {
    const needle = fold(q);

    return (
        needle === '' ||
        fold(card.title).includes(needle) ||
        (!!card.publisher && fold(card.publisher).includes(needle))
    );
};

/**
 * The cards both filters admit, in display order: by provenance, then the
 * Observatory's own imports in their given order, and a Data Commons'
 * cards by publisher then title so one publisher's sources sit together.
 */
export const filterCards = <Card extends Filterable>(
    cards: readonly Card[],
    { q, via }: SourceFilters,
): Card[] =>
    cards
        .map((card, position) => ({ card, position }))
        .filter(
            ({ card }) => (via === null || card.dataCommons.id === via) && matchesQuery(card, q),
        )
        .sort((a, b) => {
            const byProvenance = rank(a.card.dataCommons.id) - rank(b.card.dataCommons.id);
            const byPosition = a.position - b.position;

            if (byProvenance !== 0) {
                return byProvenance;
            }

            if (a.card.dataCommons.id === 'dfo') {
                return byPosition;
            }

            return (
                collate(a.card.publisher ?? a.card.family, b.card.publisher ?? b.card.family) ||
                collate(a.card.title, b.card.title) ||
                byPosition
            );
        })
        .map(({ card }) => card);

/**
 * The summary line: how many sources are showing and their split by
 * provenance. "95 sources: 12 ingested by DFO, 69 via Data Commons by
 * Google, 14 via UN System Data Commons." One provenance reads without the
 * split: "5 sources via Data Commons by Google." No cards: "No sources
 * match."
 */
export const summaryLine = (visible: readonly Filterable[]): string => {
    if (visible.length === 0) {
        return 'No sources match.';
    }

    const shares = new Map<Provenance, { commons: DataCommonsRef; count: number }>();

    for (const card of visible) {
        const share = shares.get(card.dataCommons.id) ?? { commons: card.dataCommons, count: 0 };

        share.count += 1;
        shares.set(card.dataCommons.id, share);
    }

    const sorted = [...shares.values()].sort((a, b) => rank(a.commons.id) - rank(b.commons.id));
    const sources = `${visible.length} ${visible.length === 1 ? 'source' : 'sources'}`;

    if (sorted.length === 1) {
        return `${sources} ${provenanceShare(sorted[0]!.commons)}.`;
    }

    return `${sources}: ${sorted.map((share) => `${share.count} ${provenanceShare(share.commons)}`).join(', ')}.`;
};

/** One publisher the search box offers: its name and how many sources
 *  it has. */
export type PublisherOption = { label: string; count: number };

/**
 * The publishers whose name holds the query, each with its source count,
 * most sources first and then by name. An empty query offers every
 * publisher. Picking one puts its name in the field, so a row stands for
 * a name, and the graph's two nodes for one publisher (WHO has one on
 * each Data Commons) make one row whose count is what the pick shows.
 */
export const publisherOptions = (cards: readonly Filterable[], q: string): PublisherOption[] => {
    const needle = fold(q);
    const options = new Map<string, PublisherOption>();

    for (const card of cards) {
        const label = card.publisher ?? card.family;

        if (needle !== '' && !fold(label).includes(needle)) {
            continue;
        }

        const option = options.get(label) ?? { label, count: 0 };

        option.count += 1;
        options.set(label, option);
    }

    return [...options.values()].sort((a, b) => b.count - a.count || collate(a.label, b.label));
};

/** The `?via=` value as a provenance the cards hold, or null. */
export const parseVia = (raw: string | null, cards: readonly Filterable[]): Provenance | null =>
    raw && cards.some((card) => card.dataCommons.id === raw) ? (raw as Provenance) : null;

/** The `?q=` value, trimmed of nothing: the reader's own text. */
export const parseQuery = (raw: string | null): string => raw ?? '';

/** The drawer's `?filter=` link as the page's own filters: a Data Commons id
 *  is a provenance, and a publisher's dcid is a query for its name. Any
 *  other value is no filter. */
export const legacyFilter = (
    raw: string | null,
    cards: readonly Filterable[],
): Partial<SourceFilters> => {
    if (!raw) {
        return {};
    }

    const via = parseVia(raw, cards);

    if (via) {
        return { via };
    }

    const publisher = cards.find((card) => card.family === raw)?.publisher;

    return publisher ? { q: publisher } : {};
};
