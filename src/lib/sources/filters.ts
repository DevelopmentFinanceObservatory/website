/**
 * The Sources page's filter chips. A card sits under its publisher when the
 * Observatory brings that data itself, and under its Data Commons (`base` or
 * `un_system`) when the data comes through one, so about forty upstream
 * publishers collapse into two chips.
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

/** The `?filter=` value a card answers to: its publisher's dcid for the
 *  Observatory's own data, the origin id otherwise. */
export const filterId = (card: Filterable): string =>
    card.dataCommons.id === 'dfo' ? card.family : card.dataCommons.id;

/**
 * One chip per Observatory publisher (first-appearance order), then the
 * `base` chip, then the `un_system` chip, each with its card count. The
 * Observatory chips are labelled by publisher, the origin chips by the
 * Data Commons' own label.
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

/**
 * Cards in chip order. The Observatory's own cards keep their given order.
 * Within an origin, cards sort by publisher then title so one publisher's
 * datasets sit together.
 */
export const orderCards = <Card extends Filterable>(cards: readonly Card[]): Card[] => {
    const rank = new Map(filterGroups(cards).map((group, index) => [group.id, index]));
    const collate = (a: string, b: string) => a.localeCompare(b, 'en');

    return cards
        .map((card, position) => ({ card, position }))
        .sort((a, b) => {
            const byGroup = rank.get(filterId(a.card))! - rank.get(filterId(b.card))!;
            const byPosition = a.position - b.position;

            if (byGroup !== 0) {
                return byGroup;
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
};
