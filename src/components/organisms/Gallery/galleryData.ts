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
    { id: 'g7', label: 'G7' },
    { id: 'global', label: 'Global' },
] as const;

export const GALLERY_SOURCES = [
    { id: 'oecd-dac', label: 'OECD DAC' },
    { id: 'oecd-crs', label: 'OECD CRS' },
    { id: 'one', label: 'ONE Data' },
    { id: 'wb-ids', label: 'World Bank IDS' },
    { id: 'wb-wdi', label: 'World Bank WDI' },
    { id: 'who-ghed', label: 'WHO GHED' },
] as const;

export type GalleryType = (typeof GALLERY_TYPES)[number]['id'];
export type GalleryRegion = (typeof GALLERY_REGIONS)[number]['id'];
export type GallerySource = (typeof GALLERY_SOURCES)[number]['id'];

// What the item opens as: the three Studio shapes, or a Get Data search share.
export type GalleryKind = 'conversation' | 'canvas' | 'card' | 'dataset';

type GalleryItemBase = {
    slug: string;
    title: string;
    description: string;
    types: GalleryType[];
    region: GalleryRegion;
    source: GallerySource;
};

export type GalleryItem =
    | (GalleryItemBase & {
          kind: Exclude<GalleryKind, 'dataset'>;
          // The share this session was copied from, kept as provenance. The page opens the copy.
          sharedFrom?: string;
      })
    | (GalleryItemBase & {
          kind: 'dataset';
          // The id of the search share the item opens, at `/data?share=<id>`.
          sharedFrom: string;
      });

export const GALLERY_ITEMS = items as GalleryItem[];

export const galleryItem = (slug: string): GalleryItem | undefined =>
    GALLERY_ITEMS.find((item) => item.slug === slug);

/** Every gallery item has its own page — indexable, unlike a share link. */
export const galleryHref = (item: GalleryItem): string => `/insights/gallery/${item.slug}`;
