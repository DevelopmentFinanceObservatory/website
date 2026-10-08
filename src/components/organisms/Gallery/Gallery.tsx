'use client';

import classNames from 'classnames';
import Image from 'next/image';
import Link from 'next/link';

import styles from './Gallery.module.scss';
import GalleryFilter from './GalleryFilter';
import {
    GALLERY_COVERS,
    GALLERY_ITEMS,
    GALLERY_REGIONS,
    GALLERY_SOURCES,
    GALLERY_TYPES,
    galleryHref,
} from './galleryData';

import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { useUrlParam } from '@/hooks/useUrlParam';

// Selections live in the URL (?types=stats,charts&regions=ssa&q=debt) so a
// filtered view is shareable and survives a reload — the Sources page's
// convention. Unknown ids are dropped on parse.
const idsParser = (valid: Set<string>) => (raw: string | null) =>
    (raw ?? '').split(',').filter((id) => valid.has(id));

const parseTypes = idsParser(new Set(GALLERY_TYPES.map((t) => t.id)));
const parseRegions = idsParser(new Set(GALLERY_REGIONS.map((r) => r.id)));
const parseSources = idsParser(new Set(GALLERY_SOURCES.map((s) => s.id)));
const serializeIds = (ids: string[]) => (ids.length ? ids.join(',') : null);
const parseQuery = (raw: string | null) => raw ?? '';
const serializeQuery = (value: string) => (value.trim() ? value : null);

/**
 * Insights → Gallery: expert-curated Studio canvases, ready to monitor
 * as-is or to fork. The dark hero (title, count, lead, the three filter
 * dropdowns, the search box), then the canvas tiles on the light ground,
 * three to a row — each cover a miniature of the canvas it stands for.
 * Entries are placeholders until the DFO team curates the real set.
 */
const Gallery = () => {
    const sectionRef = useReveal<HTMLElement>();
    const [types, setTypes] = useUrlParam('types', parseTypes, serializeIds);
    const [regions, setRegions] = useUrlParam('regions', parseRegions, serializeIds);
    const [sources, setSources] = useUrlParam('sources', parseSources, serializeIds);
    const [query, setQuery] = useUrlParam('q', parseQuery, serializeQuery);

    const visible = GALLERY_ITEMS.filter((item) => {
        if (types.length && !item.types.some((type) => types.includes(type))) {
            return false;
        }

        if (regions.length && !regions.includes(item.region)) {
            return false;
        }

        if (sources.length && !sources.includes(item.source)) {
            return false;
        }

        const needle = query.trim().toLowerCase();

        return (
            !needle ||
            item.title.toLowerCase().includes(needle) ||
            item.description.toLowerCase().includes(needle)
        );
    });

    // The search field renders twice: as the hero's aside (desktop
    // bottom-right, above the box on tablet) and inside the box under the
    // filters — the phone spot. CSS shows exactly one; both bind the same
    // state, so switching breakpoints keeps the typed query.
    const searchField = (extraClass: string) => (
        <label className={classNames(styles.search, extraClass)}>
            <Icon name="search" className={styles.searchIcon} />
            <input
                type="search"
                className={styles.searchInput}
                placeholder="Search Gallery"
                aria-label="Search Gallery"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
            />
        </label>
    );

    return (
        <section ref={sectionRef} className={styles.section}>
            <PageHero tone="dark" boxMinHeight={300} aside={searchField(styles.searchAside)}>
                <h1 className={styles.title} data-reveal="text">
                    Gallery
                    <span className={styles.count}>
                        {String(GALLERY_ITEMS.length).padStart(2, '0')}
                    </span>
                </h1>
                <p className={styles.lead} data-reveal="text" style={revealIndex(1)}>
                    Expert-curated canvases built in DFO Studio with live knowledge graph data —
                    ready to monitor as-is or to use as a starting point to make it your own.
                </p>
                <p className={styles.filtersLabel} data-reveal="text" style={revealIndex(2)}>
                    Filters
                </p>
                <div className={styles.filters} data-reveal style={revealIndex(3)}>
                    <GalleryFilter
                        label="Types"
                        options={GALLERY_TYPES}
                        selected={types}
                        onChange={setTypes}
                    />
                    <GalleryFilter
                        label="Regions"
                        options={GALLERY_REGIONS}
                        selected={regions}
                        onChange={setRegions}
                    />
                    <GalleryFilter
                        label="Sources"
                        options={GALLERY_SOURCES}
                        selected={sources}
                        onChange={setSources}
                    />
                </div>
                {searchField(styles.searchInBox)}
            </PageHero>

            <ul
                className={styles.grid}
                key={[types.join(), regions.join(), sources.join(), query].join('|')}
            >
                {visible.map((item, index) => {
                    const { action, ...cover } = GALLERY_COVERS[item.kind];

                    return (
                        // The zone is the tile: hovering anywhere on it flies
                        // the button's arrow (see the Button atom).
                        <li
                            key={item.slug}
                            className={styles.card}
                            style={revealIndex(index)}
                            data-button-zone
                        >
                            <Link href={galleryHref(item)} className={styles.cardLink}>
                                <span className={styles.cover}>
                                    <Image
                                        {...cover}
                                        alt=""
                                        // The tile is a third of the grid on
                                        // desktop and the whole width below
                                        // it. Without this Next sizes the
                                        // srcset off the `width` above — the
                                        // asset's own size, not the box it
                                        // lands in — and picks a variant far
                                        // too small for it.
                                        sizes="(max-width: 1024px) 100vw, 33vw"
                                        className={styles.coverImage}
                                    />
                                </span>
                                <h2 className={styles.cardTitle}>{item.title}</h2>
                                <p className={styles.cardText}>{item.description}</p>
                            </Link>
                            {/* Beside the link rather than inside it — an
                                anchor cannot hold another one. It says what
                                the tile opens as; the tile itself is the
                                link, so this one is kept out of the tab
                                order and out of the accessibility tree
                                rather than read out twice. */}
                            <Button
                                href={galleryHref(item)}
                                variant="dark"
                                icon="arrow-up-right"
                                className={styles.cardAction}
                                tabIndex={-1}
                                aria-hidden
                            >
                                {action}
                            </Button>
                        </li>
                    );
                })}
                {visible.length === 0 && (
                    <li className={styles.empty}>No canvases match — clear a filter or two.</li>
                )}
            </ul>

            <PageFade />
        </section>
    );
};

export default Gallery;
