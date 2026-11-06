'use client';

import Image from 'next/image';
import Link from 'next/link';

import styles from './Gallery.module.scss';
import { GALLERY_COVERS, GALLERY_ITEMS, type GalleryItem, galleryHref } from './galleryData';

import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import Button from '@/components/atoms/Button/Button';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { track } from '@/lib/events/client';

// Records `gallery.open` when a visitor activates a tile's link. `click` covers
// a left-click, a modifier-click and Enter on the focused link; a middle-click
// fires `auxclick` instead, so that one is listened for too. Prefetch and
// hover raise neither. `track()` posts with `keepalive` and returns at once,
// so the navigation never waits on it.
const openEvents = (item: GalleryItem) => {
    const open = () => track('gallery.open', { slug: item.slug, kind: item.kind });
    return {
        onClick: open,
        onAuxClick: (event: React.MouseEvent) => {
            if (event.button === 1) open();
        },
    };
};

/**
 * Insights → Gallery: expert-curated Studio canvases, ready to monitor
 * as-is or to fork. The dark hero (title, lead), then every canvas
 * tile on the light ground, three to a row — each cover a miniature of the
 * canvas it stands for.
 */
const Gallery = () => {
    const sectionRef = useReveal<HTMLElement>();

    return (
        <section ref={sectionRef} className={styles.section}>
            <PageHero tone="dark" boxMinHeight={260}>
                <h1 className={styles.title} data-reveal="text">
                    Gallery
                </h1>
                <p className={styles.lead} data-reveal="text" style={revealIndex(1)}>
                    Expert-curated canvases built in DFO Studio with live knowledge graph data —
                    ready to monitor as-is or to use as a starting point to make it your own.
                </p>
            </PageHero>

            <ul className={styles.grid}>
                {GALLERY_ITEMS.map((item, index) => {
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
                            <Link
                                href={galleryHref(item)}
                                className={styles.cardLink}
                                {...openEvents(item)}
                            >
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
                                {...openEvents(item)}
                            >
                                {action}
                            </Button>
                        </li>
                    );
                })}
            </ul>

            <PageFade />
        </section>
    );
};

export default Gallery;
