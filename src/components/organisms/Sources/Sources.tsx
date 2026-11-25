'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo } from 'react';

import styles from './Sources.module.scss';
import { SOURCE_SWATCHES } from './sourcesData';

import SourceLink from '@/components/atoms/SourceLink/SourceLink';
import FilterChips from '@/components/molecules/FilterChips/FilterChips';
import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import SourceSearch from '@/components/organisms/SourceSearch/SourceSearch';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { useUrlParam } from '@/hooks/useUrlParam';
import type { SourceCard } from '@/lib/sources/graph';
import {
    filterCards,
    legacyFilter,
    parsePublishers,
    parseQuery,
    parseVia,
    type Provenance,
    provenanceGroups,
    publisherOptions,
    serializePublishers,
    summaryLine,
    togglePublisher,
} from '@/lib/sources/search';

const serializeQuery = (q: string) => (q.trim() ? q : null);
const serializeVia = (via: Provenance | null) => via;

/**
 * Data → Sources: where the data comes from. The dark hero (title, count,
 * lead, the filters, the summary line), then the source cards on the light
 * ground, three to a row.
 *
 * Cards come from the graph (see lib/sources/graph.ts) in one server-side
 * read of the source catalogue: each Dataset row carries the name,
 * description, licence, update cadence, years covered and publisher link a
 * card shows, under its publisher and Data Commons. A card shows only what
 * its row declares: a good share of the graph's Datasets carry a name and a
 * publisher and nothing else, so those render in a short form with no empty
 * fields.
 *
 * Three filters (lib/sources/search.ts), all in the URL so a filtered view
 * is shareable and survives a reload, Back and Forward. The search box
 * (SourceSearch) matches part of a title or a publisher's name (`?q=`) and
 * offers the matching publishers to pick (`?publisher=`), any number of
 * them, so "World Bank" lists every World Bank source, the one the
 * Observatory imports itself alongside the ones that arrive via Google. The
 * chips (`?via=`) narrow by provenance, meaning the Observatory's own
 * imports or the Data Commons that delivered the data. Each federated
 * card's org line names that Data Commons, and a card the Observatory
 * imports itself carries no "via". With a filter on, the summary line
 * reports how many sources are showing, from how many publishers when any
 * are picked, and the chosen provenance.
 */
const Sources = ({ sources }: { sources: SourceCard[] }) => {
    const sectionRef = useReveal<HTMLElement>();

    // The chips' colours are the page's own content colours, one per
    // provenance, and a card's swatch follows its provenance's chip.
    const groups = provenanceGroups(sources).map((group, index) => ({
        ...group,
        color: SOURCE_SWATCHES[index % SOURCE_SWATCHES.length]!,
    }));

    // A `?filter=` link from the old source chips fills the filters it
    // names, unless the URL carries that filter itself. Read through Next's
    // params so the server render and the hydration agree.
    const params = useSearchParams();
    const legacy = useMemo(() => legacyFilter(params.get('filter'), sources), [params, sources]);

    // On arrival the link's filter becomes the page's own params and
    // `?filter=` leaves the URL, so a choice the reader clears later stays
    // cleared instead of falling back to the link's.
    useEffect(() => {
        const url = new URL(window.location.href);
        const filter = legacyFilter(url.searchParams.get('filter'), sources);

        if (!url.searchParams.has('filter')) {
            return;
        }

        url.searchParams.delete('filter');

        if (filter.via && !url.searchParams.has('via')) {
            url.searchParams.set('via', filter.via);
        }

        const publisher = filter.publishers && serializePublishers(filter.publishers);

        if (publisher && !url.searchParams.has('publisher')) {
            url.searchParams.set('publisher', publisher);
        }

        window.history.replaceState(null, '', url);
    }, [sources]);

    const [q, setQ] = useUrlParam(
        'q',
        useCallback((raw: string | null) => parseQuery(raw ?? legacy.q ?? null), [legacy]),
        serializeQuery,
    );
    const [via, setVia] = useUrlParam(
        'via',
        useCallback(
            (raw: string | null) => parseVia(raw ?? legacy.via ?? null, sources),
            [legacy, sources],
        ),
        serializeVia,
        { history: 'push' },
    );
    const [publishers, setPublishers] = useUrlParam(
        'publisher',
        useCallback(
            (raw: string | null) =>
                raw === null && legacy.publishers
                    ? [...legacy.publishers]
                    : parsePublishers(raw, sources),
            [legacy, sources],
        ),
        serializePublishers,
        { history: 'push' },
    );

    const visible = filterCards(sources, { q, via, publishers });
    // Each chip counts the cards the search box leaves it, so the counts
    // say what picking the chip would show.
    const searched = filterCards(sources, { q, via: null, publishers });
    const counts = Object.fromEntries(
        groups.map((group) => [
            group.id,
            searched.filter((source) => source.dataCommons.id === group.id).length,
        ]),
    );
    const colorOf = (id: Provenance) => groups.find((group) => group.id === id)?.color;
    // The publisher list offers what the chosen provenance holds, so a row's
    // count is what picking it shows. The picks lead the list whatever the
    // text and the chip, so each can be unticked.
    const offered = publisherOptions(
        via ? sources.filter((source) => source.dataCommons.id === via) : sources,
        q,
        publishers,
    );

    return (
        <section ref={sectionRef} className={styles.section}>
            <PageHero tone="dark" boxMinHeight={260}>
                <h1 className={styles.title} data-reveal="text">
                    Sources
                    <span className={styles.count}>{String(sources.length).padStart(2, '0')}</span>
                </h1>
                <p className={styles.lead} data-reveal="text" style={revealIndex(1)}>
                    Where the data comes from, how it was processed, and what you should know before
                    using it.
                </p>
                <p className={styles.filtersLabel} data-reveal="text" style={revealIndex(2)}>
                    Filters
                </p>
                <div className={styles.controls} data-reveal style={revealIndex(3)}>
                    <SourceSearch
                        value={q}
                        onChange={setQ}
                        options={offered}
                        selected={publishers}
                        onToggle={(name) => setPublishers(togglePublisher(publishers, name))}
                        onClearSelected={() => setPublishers([])}
                    />
                    {/* One provenance at a time: a source has exactly one, so
                        stacking chips would widen the list where a filter is
                        read as narrowing it. */}
                    <FilterChips
                        groups={groups}
                        counts={counts}
                        selected={via ? [via] : []}
                        onChange={(next) => setVia(next[0] ?? null)}
                        mode="single"
                    />
                </div>
                {/* Filled only with a filter on: with none, the chips' counts
                    already say the split. */}
                <p className={styles.summary} aria-live="polite">
                    {q.trim() !== '' || via || publishers.length > 0
                        ? summaryLine(
                              visible,
                              publishers.length > 0,
                              groups.find((group) => group.id === via)?.label ?? null,
                          )
                        : null}
                </p>
            </PageHero>

            {/* Keyed on the picks, so a new pick replays the cards' entrance
                and typing in the field does not. */}
            <ul className={styles.grid} key={`${via ?? 'all'}:${publishers.join('|')}`}>
                {visible.map((source, index) => (
                    <li key={source.id} className={styles.card} style={revealIndex(index)}>
                        {/* The whole card opens the source's page. */}
                        <SourceLink
                            dcid={source.id}
                            className={styles.cardLink}
                            aria-label={source.title}
                        />
                        <h2 className={styles.cardTitle}>
                            <span
                                className={styles.swatch}
                                style={{ backgroundColor: colorOf(source.dataCommons.id) }}
                                aria-hidden="true"
                            />
                            {source.title}
                        </h2>
                        {source.origin && <p className={styles.org}>{source.origin}</p>}
                        {source.description && (
                            <p className={styles.description}>{source.description}</p>
                        )}
                        {source.chips.length > 0 && (
                            <dl className={styles.facts}>
                                {source.chips.map((chip) => (
                                    <div key={chip.kind} className={styles.fact}>
                                        <dt>{CHIP_LABELS[chip.kind]}</dt>
                                        <dd>
                                            {chip.href ? (
                                                <a
                                                    href={chip.href}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className={styles.factLink}
                                                >
                                                    {chip.label}
                                                </a>
                                            ) : (
                                                chip.label
                                            )}
                                        </dd>
                                    </div>
                                ))}
                            </dl>
                        )}
                    </li>
                ))}
            </ul>

            <PageFade />
        </section>
    );
};

// The chips' own row labels, in the order lib/sources/graph.ts emits them.
const CHIP_LABELS: Record<SourceCard['chips'][number]['kind'], string> = {
    licence: 'License',
    currency: 'Update Cadence',
    coverage: 'Years Covered',
    scripts: 'Processing',
};

export default Sources;
