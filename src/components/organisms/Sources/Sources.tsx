'use client';

import Link from 'next/link';

import styles from './Sources.module.scss';
import { SOURCE_SWATCHES } from './sourcesData';

import FilterChips from '@/components/molecules/FilterChips/FilterChips';
import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { useUrlParam } from '@/hooks/useUrlParam';
import { filterGroups, filterId, orderCards } from '@/lib/sources/filters';
import type { SourceCard } from '@/lib/sources/graph';

const parseFilter = (raw: string | null, known: Set<string>): string[] =>
    (raw ?? '').split(',').filter((id) => known.has(id));

const serializeFilter = (selected: string[]) => (selected.length ? selected.join(',') : null);

/**
 * Data → Sources: where the data comes from. The dark hero (title, count,
 * lead, the filters), then the source cards on the light ground,
 * three to a row.
 *
 * Cards come from the graph (see lib/sources/graph.ts) in one server-side
 * read of the source catalogue: each Dataset row carries the name,
 * description, licence, update cadence, years covered and publisher link a
 * card shows, under its publisher and Data Commons. A card shows only what
 * its row declares: a good share of the graph's Datasets carry a name and a
 * publisher and nothing else, so those render in a short form with no empty
 * fields. The selection lives in the URL (?filter=dc/s/WorldBank) so a
 * filtered view is shareable and survives a reload.
 *
 * The filters (lib/sources/filters.ts) are one chip per publisher the
 * Observatory brings itself, then one chip for every Data Commons by Google
 * source (`base`) and one for every UN System Data Commons source
 * (`un_system`). Within an origin chip, cards sort by publisher then title, and each card's
 * org line reads "<publisher> via <origin>", or "via <origin>" alone when the
 * title is the publisher's own name.
 */
const Sources = ({ sources }: { sources: SourceCard[] }) => {
    const sectionRef = useReveal<HTMLElement>();

    // The chips' colours are the page's own content colours, and a card's
    // swatch follows its chip.
    const groups = filterGroups(sources).map((group, index) => ({
        ...group,
        color: SOURCE_SWATCHES[index % SOURCE_SWATCHES.length],
    }));
    const groupIds = new Set(groups.map((group) => group.id));

    const [selected, setSelected] = useUrlParam(
        'filter',
        (raw) => parseFilter(raw, groupIds),
        serializeFilter,
    );

    const counts = Object.fromEntries(groups.map((group) => [group.id, group.count]));
    const ordered = orderCards(sources);
    const visible =
        selected.length === 0
            ? ordered
            : ordered.filter((source) => selected.includes(filterId(source)));
    const colorOf = (id: string) => groups.find((group) => group.id === id)?.color;

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
                <div data-reveal style={revealIndex(3)}>
                    <FilterChips
                        groups={groups}
                        counts={counts}
                        selected={selected}
                        onChange={setSelected}
                    />
                </div>
            </PageHero>

            <ul className={styles.grid} key={selected.join(',') || 'all'}>
                {visible.map((source, index) => (
                    <li key={source.id} className={styles.card} style={revealIndex(index)}>
                        {/* The whole card opens the source's page. The dcid
                            carries slashes, so the route is a catch-all and
                            the id goes in unescaped. */}
                        <Link
                            href={`/data/sources/${source.id}`}
                            className={styles.cardLink}
                            aria-label={source.title}
                        />
                        <h2 className={styles.cardTitle}>
                            <span
                                className={styles.swatch}
                                style={{ backgroundColor: colorOf(filterId(source)) }}
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
