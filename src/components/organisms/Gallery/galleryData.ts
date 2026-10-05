/**
 * Insights → Gallery: the curated Studio sessions. The list and every
 * session it points at are plain JSON in `src/content/gallery` — DFO curates
 * by editing those files, and nothing here reads the database: a gallery
 * item is a session anyone can open and carry on in their own Studio.
 */

import items from '@/content/gallery/index.json';

export const GALLERY_TYPES = [
    { id: 'stats', label: 'Stats' },
    { id: 'charts', label: 'Charts' },
    { id: 'tables', label: 'Tables' },
] as const;

export const GALLERY_REGIONS = [
    { id: 'ssa', label: 'Sub-Saharan Africa' },
    { id: 'mena', label: 'Middle East & North Africa' },
    { id: 'asia', label: 'Asia' },
    { id: 'americas', label: 'Americas' },
    { id: 'global', label: 'Global' },
] as const;

export const GALLERY_SOURCES = [
    { id: 'oecd-dac', label: 'OECD DAC' },
    { id: 'oecd-crs', label: 'OECD CRS' },
    { id: 'wb-ids', label: 'World Bank IDS' },
    { id: 'wb-wdi', label: 'World Bank WDI' },
    { id: 'who-ghed', label: 'WHO GHED' },
] as const;

export type GalleryType = (typeof GALLERY_TYPES)[number]['id'];
export type GalleryRegion = (typeof GALLERY_REGIONS)[number]['id'];
export type GallerySource = (typeof GALLERY_SOURCES)[number]['id'];

// What the item opens as: the three Studio shapes, or a Get Data query.
export type GalleryKind = 'conversation' | 'canvas' | 'card' | 'dataset';

export type GalleryItem = {
    slug: string;
    kind: GalleryKind;
    title: string;
    description: string;
    types: GalleryType[];
    region: GalleryRegion;
    source: GallerySource;
    // Dataset items reopen their own search instead of a saved session.
    query?: string;
    // The share this session was curated from — provenance, not a link.
    sharedFrom?: string;
};

export const GALLERY_ITEMS = items as GalleryItem[];

export const galleryItem = (slug: string): GalleryItem | undefined =>
    GALLERY_ITEMS.find((item) => item.slug === slug);

/** Every gallery item has its own page — indexable, unlike a share link. */
export const galleryHref = (item: GalleryItem): string => `/insights/gallery/${item.slug}`;
