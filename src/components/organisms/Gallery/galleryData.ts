/**
 * Insights → Gallery: the curated Studio sessions. The list is
 * `src/content/gallery/index.ts`, checked against `GalleryItem` at build, and
 * every session it points at is plain JSON beside it. DFO curates by editing
 * those files, and nothing here reads the database: a gallery item is a
 * session anyone can open and carry on in their own Studio. A live item's
 * cards are the exception and refresh through the prod share it was copied
 * from.
 */

import items from '@/content/gallery/index';

export const GALLERY_TYPES = [
    { id: 'stats', label: 'Stats' },
    { id: 'charts', label: 'Charts' },
    { id: 'tables', label: 'Tables' },
] as const;

export const GALLERY_REGIONS = [
    { id: 'africa', label: 'Africa' },
    { id: 'ssa', label: 'Sub-Saharan Africa' },
    { id: 'mena', label: 'Middle East & North Africa' },
    { id: 'asia', label: 'Asia' },
    { id: 'americas', label: 'Americas' },
    { id: 'g7', label: 'G7' },
    { id: 'dac', label: 'DAC donors' },
    { id: 'global', label: 'Global' },
] as const;

export const GALLERY_SOURCES = [
    { id: 'oecd-dac', label: 'OECD DAC' },
    { id: 'oecd-crs', label: 'OECD CRS' },
    { id: 'one', label: 'ONE Data' },
    { id: 'un-sdg', label: 'SDG Global Database' },
    { id: 'wb-ids', label: 'World Bank IDS' },
    { id: 'wb-wdi', label: 'World Bank WDI' },
    { id: 'who-ghed', label: 'WHO GHED' },
] as const;

export type GalleryType = (typeof GALLERY_TYPES)[number]['id'];
export type GalleryRegion = (typeof GALLERY_REGIONS)[number]['id'];
export type GallerySource = (typeof GALLERY_SOURCES)[number]['id'];

// What the item opens as: the three Studio shapes, or a Get Data search share.
export type GalleryKind = 'conversation' | 'canvas' | 'card' | 'dataset';

// At least one entry, since an item with no region or source matches no filter.
type NonEmpty<TItem> = readonly [TItem, ...TItem[]];

type GalleryItemBase = {
    slug: string;
    title: string;
    description: string;
    types: readonly GalleryType[];
    regions: NonEmpty<GalleryRegion>;
    sources: NonEmpty<GallerySource>;
};

export type GalleryItem =
    | (GalleryItemBase & {
          kind: 'dataset';
          // The id of the search share the item opens, at `/data?share=<id>`.
          sharedFrom: string;
          live?: never;
      })
    | (GalleryItemBase & {
          kind: Exclude<GalleryKind, 'dataset'>;
          // The share this session was copied from, kept as provenance. The
          // page opens the copy, frozen as it was saved.
          sharedFrom?: string;
          live?: never;
      })
    | (GalleryItemBase & {
          // A conversation share is always a snapshot (`LIVE_KINDS` in
          // src/lib/chat/shareMode.ts), so only a canvas or a card can be live.
          kind: 'canvas' | 'card';
          // The page opens the copied layout and refreshes each data card
          // through this prod live share, which holds the cards' refs.
          sharedFrom: string;
          live: true;
      });

export const GALLERY_ITEMS: readonly GalleryItem[] = items;

/**
 * The tile's picture and the words on its button, by what the item opens as
 * (QA-13) — every tile used to carry the same canvas miniature and no
 * button at all. Neither is a screenshot of the item itself: these are the
 * three shapes a reader lands in, so the tile says what clicking will give
 * them rather than what the data happens to say.
 */
export const GALLERY_COVERS: Record<
    GalleryKind,
    { src: string; width: number; height: number; action: string }
> = {
    // A search on /data, not Studio at all.
    dataset: {
        src: '/images/gallery/cover-search.png',
        width: 1244,
        height: 564,
        action: 'Open Search',
    },
    // A chat beside the canvas: the session carries the questions that built it.
    conversation: {
        src: '/images/gallery/cover-chart-chat.png',
        width: 1152,
        height: 676,
        action: 'Open Chat',
    },
    canvas: {
        src: '/images/gallery/cover-chart.png',
        width: 1276,
        height: 628,
        action: 'Open Canvas',
    },
    // A single card still opens on a canvas of its own.
    card: {
        src: '/images/gallery/cover-chart.png',
        width: 1276,
        height: 628,
        action: 'Open Canvas',
    },
};

export const gallerySourceLabels = (item: GalleryItem): string[] =>
    GALLERY_SOURCES.filter((source) => item.sources.includes(source.id)).map(
        (source) => source.label,
    );

export const galleryItem = (slug: string): GalleryItem | undefined =>
    GALLERY_ITEMS.find((item) => item.slug === slug);

/** Every gallery item has its own page — indexable, unlike a share link. */
export const galleryHref = (item: GalleryItem): string => `/insights/gallery/${item.slug}`;
