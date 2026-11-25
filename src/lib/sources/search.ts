/**
 * The Sources page's filters and its summary line.
 *
 * A reader finds a source by typing part of its title or its publisher's
 * name (`?q=`), picks publishers from the list under the field
 * (`?publisher=`, names joined by `|`), and narrows by provenance
 * (`?via=`): the Observatory's own imports, or the Data Commons that
 * delivered the data. The three combine: a card shows when it is one of the
 * picked publishers' (any, with none picked), comes the chosen way, and
 * holds the text. The summary line reports how many sources are showing,
 * from how many publishers, and the chosen provenance.
 *
 * The Studio landing's data drawer links here with `?publisher=`. The page
 * also reads `?filter=`, a comma-separated list of Data Commons ids and
 * publisher dcids, as a provenance or picked publishers.
 */

import { provenanceName } from '../dataCommons.ts';
import type { DataCommonsRef } from '../search/types.ts';

import type { Filterable } from './filters.ts';

/** Where a source's data comes from: the Observatory's own import (`dfo`)
 *  or a Data Commons (`base`, `un_system`). */
export type Provenance = DataCommonsRef['id'];

export type ProvenanceGroup = { id: Provenance; label: string; count: number };

/** The page's filters. `publishers` holds publisher names, since the graph
 *  can hold two nodes for one publisher (WHO has one on each Data Commons)
 *  and a reader picks the name. */
export type SourceFilters = { q: string; via: Provenance | null; publishers: readonly string[] };

// Publisher names hold commas ("Central Statistics Office (CSO), Ireland"),
// so the URL joins them with a bar. Each name escapes `%` and `|` first, so a
// name holding a bar survives, and a name with neither character serialises
// as itself.
const PUBLISHER_SEPARATOR = '|';

const escapeName = (name: string): string =>
    name.replace(/[%|]/g, (char) => (char === '%' ? '%25' : '%7C'));

const unescapeName = (part: string): string =>
    part.replace(/%(25|7C)/gi, (_, code: string) => (code === '25' ? '%' : '|'));

// Provenances in display order: the Observatory's own imports, then the
// Data Commons.
const PROVENANCE_ORDER: Provenance[] = ['dfo', 'base', 'un_system'];

const rank = (id: Provenance): number => {
    const index = PROVENANCE_ORDER.indexOf(id);

    return index === -1 ? PROVENANCE_ORDER.length : index;
};

const collate = (a: string, b: string) => a.localeCompare(b, 'en');

/** The card's publisher as the page names it: the publisher's label, or
 *  its dcid for a card whose label is missing or empty. */
export const publisherName = (card: Filterable): string => card.publisher || card.family;

/** The chip's name for a provenance (provenanceName). */
export const provenanceLabel = provenanceName;

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

/** Whether the card's title or publisher name (publisherName, as the
 *  publisher list matches it) holds the query. An empty query matches every
 *  card. */
export const matchesQuery = (card: Filterable, q: string): boolean => {
    const needle = fold(q);

    return (
        needle === '' ||
        fold(card.title).includes(needle) ||
        fold(publisherName(card)).includes(needle)
    );
};

/**
 * The cards the filters admit, in display order: by provenance, then the
 * Observatory's own imports in their given order, and a Data Commons'
 * cards by publisher then title so one publisher's sources sit together.
 */
export const filterCards = <Card extends Filterable>(
    cards: readonly Card[],
    { q, via, publishers }: SourceFilters,
): Card[] =>
    cards
        .map((card, position) => ({ card, position }))
        .filter(
            ({ card }) =>
                (via === null || card.dataCommons.id === via) &&
                (publishers.length === 0 || publishers.includes(publisherName(card))) &&
                matchesQuery(card, q),
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
                collate(publisherName(a.card), publisherName(b.card)) ||
                collate(a.card.title, b.card.title) ||
                byPosition
            );
        })
        .map(({ card }) => card);

/**
 * The summary line: how many sources are showing, from how many of their
 * publishers when publishers are picked, and the chosen provenance's chip
 * label when one is: "15 sources from 2 publishers.", "5 sources via Data
 * Commons by Google.". No cards: "No sources match."
 */
export const summaryLine = (
    visible: readonly Filterable[],
    picked = false,
    via: string | null = null,
): string => {
    if (visible.length === 0) {
        return 'No sources match.';
    }

    const publishers = picked ? new Set(visible.map(publisherName)).size : 0;
    const from =
        publishers > 0
            ? ` from ${publishers} ${publishers === 1 ? 'publisher' : 'publishers'}`
            : '';
    const sources = `${visible.length} ${visible.length === 1 ? 'source' : 'sources'}${from}`;

    return via ? `${sources} via ${via}.` : `${sources}.`;
};

/** One publisher the search box offers: its name and how many sources
 *  it has. */
export type PublisherOption = { label: string; count: number };

/**
 * The publishers whose name holds the query, each with its source count,
 * most sources first and then by name. An empty query offers every
 * publisher. A row stands for a name, so the graph's two nodes for one
 * publisher make one row whose count is what picking it shows.
 *
 * A picked name the query or the cards would leave out comes first, in the
 * given order, so a reader can untick it. A picked name in the list anyway
 * keeps its place there. A picked name with no cards here counts 0.
 */
export const publisherOptions = (
    cards: readonly Filterable[],
    q: string,
    picked: readonly string[] = [],
): PublisherOption[] => {
    const needle = fold(q);
    const options = new Map<string, PublisherOption>();

    for (const card of cards) {
        const label = publisherName(card);
        const option = options.get(label) ?? { label, count: 0 };

        option.count += 1;
        options.set(label, option);
    }

    const matches = (label: string) => needle === '' || fold(label).includes(needle);
    const hiddenPicks = picked
        .filter((label) => !options.has(label) || !matches(label))
        .map((label) => options.get(label) ?? { label, count: 0 });
    const listed = [...options.values()]
        .filter((option) => matches(option.label))
        .sort((a, b) => b.count - a.count || collate(a.label, b.label));

    return [...hiddenPicks, ...listed];
};

/** The picked publishers with `name` added, or removed when it is among
 *  them. */
export const togglePublisher = (publishers: readonly string[], name: string): string[] =>
    publishers.includes(name)
        ? publishers.filter((publisher) => publisher !== name)
        : [...publishers, name];

/** The `?via=` value as a provenance the cards hold, or null. */
export const parseVia = (raw: string | null, cards: readonly Filterable[]): Provenance | null =>
    raw && cards.some((card) => card.dataCommons.id === raw) ? (raw as Provenance) : null;

/** The `?q=` value, trimmed of nothing: the reader's own text. */
export const parseQuery = (raw: string | null): string => raw ?? '';

/** The `?publisher=` value as the publisher names the cards hold, each
 *  once, in the URL's order. An empty name picks nothing. */
export const parsePublishers = (raw: string | null, cards: readonly Filterable[]): string[] => {
    const known = new Set(cards.map(publisherName));
    const names = (raw ?? '').split(PUBLISHER_SEPARATOR).map(unescapeName);

    return [...new Set(names)].filter((name) => name !== '' && known.has(name));
};

/** The picked publishers as the `?publisher=` value, or null with none.
 *  The Studio landing's data drawer builds its links with it too. */
export const serializePublishers = (publishers: readonly string[]): string | null =>
    publishers.length > 0 ? publishers.map(escapeName).join(PUBLISHER_SEPARATOR) : null;

/**
 * A `?filter=` value, a comma-separated list of Data Commons ids and
 * publisher dcids, as the page's own filters. A lone Data Commons id is a
 * provenance. Otherwise each publisher dcid picks that publisher by name,
 * with all its sources from every provenance. A Data Commons id in a list is
 * dropped, because a provenance narrows the picks while a list unions them.
 * A list with no known publisher is no filter.
 */
export const legacyFilter = (
    raw: string | null,
    cards: readonly Filterable[],
): Partial<SourceFilters> => {
    const ids = (raw ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    const via = ids.length === 1 ? parseVia(ids[0]!, cards) : null;

    if (via) {
        return { via };
    }

    const publishers = [
        ...new Set(
            ids.flatMap((id) => cards.filter((card) => card.family === id).map(publisherName)),
        ),
    ];

    return publishers.length > 0 ? { publishers } : {};
};
