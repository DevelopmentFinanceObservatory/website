/**
 * The rows of the Studio landing's data drawer. A card sits under its
 * publisher when the Observatory brings that data itself, and under its Data
 * Commons (`base` or `un_system`) when the data comes through one. Each row
 * links to the Sources page with its id as `?filter=`, which the page reads
 * as a provenance or a publisher (lib/sources/search.ts, legacyFilter).
 */

import type { DataCommonsRef } from '../search/types.ts';

/** The fields of a source card the filters read. */
export type Filterable = {
    title: string;
    /** the publisher's dcid */
    family: string;
    publisher: string | null;
    dataCommons: DataCommonsRef;
};

export type FilterGroup = { id: string; label: string; count: number };

// Origin chips come after the Observatory's own publishers, in this order.
const ORIGIN_ORDER = ['base', 'un_system'];

/** The drawer row a card counts under, and its `?filter=` value: its
 *  publisher's dcid for the Observatory's own data, the origin id
 *  otherwise. */
export const filterId = (card: Filterable): string =>
    card.dataCommons.id === 'dfo' ? card.family : card.dataCommons.id;

/**
 * One row per Observatory publisher (first-appearance order), then the
 * `base` row, then the `un_system` row, each with its card count. The
 * Observatory rows are labelled by publisher, the origin rows by the Data
 * Commons' own label.
 */
export const filterGroups = (cards: readonly Filterable[]): FilterGroup[] => {
    const own = new Map<string, FilterGroup>();
    const origins = new Map<string, FilterGroup>();

    for (const card of cards) {
        const id = filterId(card);
        const isOwn = card.dataCommons.id === 'dfo';
        const groups = isOwn ? own : origins;
        const group = groups.get(id);

        if (group) {
            group.count += 1;
        } else {
            groups.set(id, {
                id,
                label: isOwn ? (card.publisher ?? card.family) : card.dataCommons.label,
                count: 1,
            });
        }
    }

    const rank = (id: string) => ORIGIN_ORDER.indexOf(id);

    return [...own.values(), ...[...origins.values()].sort((a, b) => rank(a.id) - rank(b.id))];
};
