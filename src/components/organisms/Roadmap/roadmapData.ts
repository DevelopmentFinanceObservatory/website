/**
 * The Roadmap page content: the dfo-docs roadmap artefacts, pinned and
 * copied into src/content/dfo-docs by scripts/sync-dfo-docs.mjs — one index
 * (the tabs) and one file per track (its categories and entries). Read at
 * build time, so the page stays static; moving the pin is a re-run of the
 * script.
 */

import dataTrack from '@/content/dfo-docs/roadmap/data.json';
import platformTrack from '@/content/dfo-docs/roadmap/platform.json';
import aiToolsTrack from '@/content/dfo-docs/roadmap/ai-tools.json';
import roadmapIndex from '@/content/dfo-docs/roadmap.json';

type TrackEntry = {
    id: string;
    title: string;
    description: string;
    // Optional: an entry may sit under no category at all.
    categories?: string[];
    status: 'released' | 'under-consideration' | 'planned' | 'in-development';
    expected?: string;
    released_on?: string;
    version?: string;
};

type Track = {
    track: string;
    categories: { id: string; label: string }[];
    entries: TrackEntry[];
};

// ponytail: tracks listed by hand — the index can name a new file, but a JSON
// import has to be static; add the import when dfo-docs adds a track.
const TRACK_FILES: Record<string, Track> = {
    'roadmap/data.json': dataTrack as Track,
    'roadmap/platform.json': platformTrack as Track,
    'roadmap/ai-tools.json': aiToolsTrack as Track,
};

const TRACKS = roadmapIndex.tracks
    .map((track) => ({ ...track, doc: TRACK_FILES[track.file] }))
    .filter((track) => track.doc);

// The hero tabs: one per track.
export type RoadmapArea = string;

export const ROADMAP_AREAS: { id: RoadmapArea; label: string }[] = TRACKS.map(({ id, label }) => ({
    id,
    label,
}));

// The filter chips: each track brings its own categories. They carry no
// colour of their own, so the chips take the house palette in order.
export type RoadmapGroup = string;

const CHIP_COLORS = ['#5fe9c9', '#5cb6ff', '#ff7b5a', '#7ee36b', '#b8c0ff', '#fdeb82'];

export const ROADMAP_GROUPS_BY_AREA: Record<
    RoadmapArea,
    { id: RoadmapGroup; label: string; color: string }[]
> = Object.fromEntries(
    TRACKS.map((track) => [
        track.id,
        track.doc.categories.map((category, index) => ({
            ...category,
            color: CHIP_COLORS[index % CHIP_COLORS.length]!,
        })),
    ]),
);

// Upcoming: how far along an entry is — the three sections of the view.
export type RoadmapStage = 'development' | 'planned' | 'consideration';

export const ROADMAP_STAGES: { id: RoadmapStage; label: string }[] = [
    { id: 'development', label: 'In Development' },
    { id: 'planned', label: 'Planned' },
    { id: 'consideration', label: 'Under Consideration' },
];

const STAGE_OF: Record<string, RoadmapStage> = {
    'in-development': 'development',
    planned: 'planned',
    'under-consideration': 'consideration',
};

export type UpcomingEntry = {
    id: string;
    area: RoadmapArea;
    groups: RoadmapGroup[];
    stage: RoadmapStage;
    title: string;
    text: string;
    // "Q3 2026", from the track's sortable "2026-Q3".
    expected?: string;
};

export type ReleaseEntry = {
    id: string;
    area: RoadmapArea;
    groups: RoadmapGroup[];
    // ISO date; the timeline groups by year and prints "June 12, 2026".
    date: string;
    title: string;
    text: string;
    version?: string;
};

const quarter = (sortable?: string): string | undefined => {
    const match = sortable?.match(/^(\d{4})-(Q[1-4])$/);

    return match ? `${match[2]} ${match[1]}` : sortable;
};

const entries = TRACKS.flatMap((track) =>
    track.doc.entries.map((entry) => ({ area: track.id, entry })),
);

export const UPCOMING: UpcomingEntry[] = entries
    .filter(({ entry }) => entry.status !== 'released')
    .sort((a, b) => (a.entry.expected ?? '9').localeCompare(b.entry.expected ?? '9'))
    .map(({ area, entry }) => ({
        id: entry.id,
        area,
        groups: entry.categories ?? [],
        stage: STAGE_OF[entry.status] ?? 'consideration',
        title: entry.title,
        text: entry.description,
        expected: quarter(entry.expected),
    }));

export const RELEASES: ReleaseEntry[] = entries
    .filter(({ entry }) => entry.status === 'released' && entry.released_on)
    .map(({ area, entry }) => ({
        id: entry.id,
        area,
        groups: entry.categories ?? [],
        date: entry.released_on!,
        title: entry.title,
        text: entry.description,
        version: entry.version,
    }));
