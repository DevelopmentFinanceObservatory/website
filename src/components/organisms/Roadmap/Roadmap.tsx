'use client';

import { useRef, useState } from 'react';

import ReleaseModal from './ReleaseModal';
import ReleaseTimeline from './ReleaseTimeline';
import RequestBox from './RequestBox';
import styles from './Roadmap.module.scss';
import {
    RELEASES,
    ROADMAP_AREAS,
    ROADMAP_GROUPS_BY_AREA,
    UPCOMING,
    type ReleaseEntry,
    type RoadmapArea,
    type RoadmapGroup,
} from './roadmapData';
import UpcomingStages from './UpcomingStages';

import FilterChips from '@/components/molecules/FilterChips/FilterChips';
import HeroTabs from '@/components/molecules/HeroTabs/HeroTabs';
import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import SegmentedTabs from '@/components/molecules/SegmentedTabs/SegmentedTabs';
import { usePendingScroll } from '@/hooks/usePendingScroll';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { useUrlParam } from '@/hooks/useUrlParam';

type View = 'upcoming' | 'released';

const VIEWS = [
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'released', label: 'Released' },
] as const;

const AREA_IDS = new Set<string>(ROADMAP_AREAS.map((a) => a.id));
const GROUP_IDS = new Set<string>(
    Object.values(ROADMAP_GROUPS_BY_AREA).flatMap((groups) => groups.map((g) => g.id)),
);
const FIRST_AREA = ROADMAP_AREAS[0]?.id ?? 'data';

const parseArea = (raw: string | null): RoadmapArea =>
    raw && AREA_IDS.has(raw) ? raw : FIRST_AREA;
const parseView = (raw: string | null): View => (raw === 'released' ? 'released' : 'upcoming');
const parseFilter = (raw: string | null): RoadmapGroup[] =>
    (raw ?? '').split(',').filter((id): id is RoadmapGroup => GROUP_IDS.has(id));
const parseRelease = (raw: string | null): ReleaseEntry | null =>
    RELEASES.find((r) => r.id === raw) ?? null;

/**
 * Data → Roadmap: what's in the graph and what's on the horizon. The dark
 * hero (title, lead, the area tabs Data / Platform / AI Tools) over the map,
 * then on the light ground: the Upcoming / Released toggle and the group
 * filters, and either the staged sections or the release timeline (a card
 * opens the release panel). Everything lives in the URL:
 * ?tab=platform&view=released&filter=debt,climate&release=<id>.
 * Content: the pinned dfo-docs roadmap (see roadmapData).
 */
const Roadmap = () => {
    const sectionRef = useReveal<HTMLElement>();
    const [area, setArea] = useUrlParam<RoadmapArea>('tab', parseArea, (a) =>
        a === FIRST_AREA ? null : a,
    );
    const [view, setView] = useUrlParam<View>('view', parseView, (v) =>
        v === 'upcoming' ? null : v,
    );
    const [selected, setSelected] = useUrlParam<RoadmapGroup[]>('filter', parseFilter, (s) =>
        s.length ? s.join(',') : null,
    );
    const [release, setRelease] = useUrlParam<ReleaseEntry | null>(
        'release',
        parseRelease,
        (r) => r?.id ?? null,
    );
    // The panel keeps its release while it slides out, so `open` is separate.
    const [releaseOpen, setReleaseOpen] = useState(() => release !== null);
    // An area tab or the Upcoming/Released switch brings the body into view.
    const bodyRef = useRef<HTMLDivElement>(null);
    const scrollToBody = usePendingScroll(bodyRef, [area, view]);
    const switchArea = (next: RoadmapArea) => {
        scrollToBody();
        setArea(next);
    };
    const switchView = (next: View) => {
        scrollToBody();
        setView(next);
    };

    const openRelease = (entry: ReleaseEntry) => {
        setRelease(entry);
        setReleaseOpen(true);
    };

    const closeRelease = () => {
        setReleaseOpen(false);
        setRelease(null);
    };

    // The pool behind the filters: this area, this view.
    const inArea = (view === 'upcoming' ? UPCOMING : RELEASES).filter(
        (entry) => entry.area === area,
    );
    // An entry can sit under several categories: it counts, and matches, under each.
    const counts = inArea.reduce<Partial<Record<RoadmapGroup, number>>>((acc, entry) => {
        for (const group of entry.groups) {
            acc[group] = (acc[group] ?? 0) + 1;
        }

        return acc;
    }, {});
    const matches = (groups: RoadmapGroup[]) =>
        selected.length === 0 || groups.some((group) => selected.includes(group));
    const upcoming = UPCOMING.filter((e) => e.area === area && matches(e.groups));
    const released = RELEASES.filter((e) => e.area === area && matches(e.groups)).sort((a, b) =>
        b.date.localeCompare(a.date),
    );
    const listKey = `${area}:${view}:${selected.join(',') || 'all'}`;

    return (
        <section ref={sectionRef} className={styles.section}>
            <PageHero tone="dark" boxFlush boxMinHeight={225}>
                <h1 className={styles.title} data-reveal="text">
                    Roadmap
                </h1>
                <p className={styles.lead} data-reveal="text" style={revealIndex(1)}>
                    Whats is available in the graph and what is currently on the horizon
                </p>
                <div className={styles.tabs} data-reveal style={revealIndex(2)}>
                    {/* From the design: "Data" + rem(120) of air spans exactly the
                        rem(160) tongue, so the next tab starts where it ends. */}
                    <HeroTabs
                        tabs={ROADMAP_AREAS}
                        value={area}
                        onChange={switchArea}
                        air={120}
                        tongue={{ width: 160, height: 18 }}
                        gap={8}
                    />
                </div>
            </PageHero>

            <div ref={bodyRef} className={styles.body}>
                <div className={styles.controls}>
                    <SegmentedTabs
                        tabs={VIEWS}
                        value={view}
                        onChange={(id) => switchView(id as View)}
                    />
                    <FilterChips
                        groups={ROADMAP_GROUPS_BY_AREA[area] ?? []}
                        counts={counts}
                        selected={selected}
                        onChange={setSelected}
                        allTone="dark"
                        gap="tight"
                        className={styles.filters}
                    />
                </div>

                {view === 'upcoming' && (
                    <div key={listKey}>
                        <RequestBox />
                        <UpcomingStages entries={upcoming} />
                    </div>
                )}

                {view === 'released' && (
                    <div key={listKey}>
                        <ReleaseTimeline releases={released} onOpen={openRelease} />
                    </div>
                )}
            </div>

            <PageFade />

            <ReleaseModal
                release={release}
                open={releaseOpen}
                onOpenChange={(next) => (next ? setReleaseOpen(true) : closeRelease())}
            />
        </section>
    );
};

export default Roadmap;
