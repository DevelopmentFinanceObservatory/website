'use client';

import Link from 'next/link';

import styles from './Library.module.scss';
import { KIND_ICONS, StatusBadge, TopicTags } from './parts';

import Icon from '@/components/atoms/Icon/Icon';
import FilterMenu from '@/components/molecules/FilterMenu/FilterMenu';
import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { useUrlParam } from '@/hooks/useUrlParam';
import {
    artifactPath,
    filterArtifacts,
    filterOptions,
    KIND_LABELS,
    type LibraryArtifact,
    parseList,
    serializeList,
} from '@/lib/library/artifact';

const parseQuery = (raw: string | null) => raw ?? '';
const serializeQuery = (q: string) => (q.trim() ? q : null);

// Sources a row names before "+N more".
const SOURCES_SHOWN = 2;

// A filter picked by hand is a history entry, so Back undoes it. The search
// text, written per keystroke, replaces the entry.
const PICKED = { history: 'push' } as const;

/**
 * The Library: the dark hero (title, count, lead, the search field and the
 * four filters), then the artifacts as rows on the light ground, each opening
 * its page. Every filter lives in the URL (lib/library/artifact.ts), so a
 * view is shareable and survives a reload.
 */
const Library = ({ artifacts }: { artifacts: LibraryArtifact[] }) => {
    const sectionRef = useReveal<HTMLElement>();
    const [q, setQ] = useUrlParam('q', parseQuery, serializeQuery);
    const [types, setTypes] = useUrlParam('type', parseList, serializeList, PICKED);
    const [topics, setTopics] = useUrlParam('topic', parseList, serializeList, PICKED);
    const [sources, setSources] = useUrlParam('source', parseList, serializeList, PICKED);
    const [statuses, setStatuses] = useUrlParam('status', parseList, serializeList, PICKED);

    const options = filterOptions(artifacts, { types, topics, sources, statuses });
    const visible = filterArtifacts(artifacts, { q, types, topics, sources, statuses });

    return (
        <section ref={sectionRef} className={styles.section}>
            <PageHero tone="dark" boxMinHeight={260}>
                <h1 className={styles.title} data-reveal="text">
                    Library
                    <span className={styles.count}>{artifacts.length.toLocaleString('en')}</span>
                </h1>
                <p className={styles.lead} data-reveal="text" style={revealIndex(1)}>
                    A citable collection of DFO charts, datasets, and canvases using live data or
                    point-in-time snapshots.
                </p>
                <label className={styles.field} data-reveal style={revealIndex(2)}>
                    <Icon name="search" className={styles.fieldIcon} />
                    <input
                        type="search"
                        className={styles.input}
                        aria-label="Search the Library"
                        placeholder="Search by keyword, topic, or source..."
                        autoComplete="off"
                        spellCheck={false}
                        value={q}
                        onChange={(event) => setQ(event.target.value)}
                    />
                </label>
                <p className={styles.filtersLabel} data-reveal="text" style={revealIndex(3)}>
                    Filters
                </p>
                <div className={styles.filters} data-reveal style={revealIndex(4)}>
                    <FilterMenu
                        label="All Types"
                        options={options.types}
                        selected={types}
                        onChange={setTypes}
                    />
                    <FilterMenu
                        label="All Topics"
                        options={options.topics}
                        selected={topics}
                        onChange={setTopics}
                    />
                    <FilterMenu
                        label="All Sources"
                        options={options.sources}
                        selected={sources}
                        onChange={setSources}
                    />
                    <FilterMenu
                        label="All Statuses"
                        options={options.statuses}
                        selected={statuses}
                        onChange={setStatuses}
                    />
                </div>
            </PageHero>

            <div className={styles.list}>
                <div className={styles.head} aria-hidden="true">
                    <span>Title &amp; Description</span>
                    <span>Topics</span>
                    <span>Sources</span>
                    <span className={styles.headStatus}>Status</span>
                </div>
                {visible.length === 0 ? (
                    <p className={styles.empty} aria-live="polite">
                        {artifacts.length === 0
                            ? 'Nothing is published yet.'
                            : 'No artifacts match.'}
                    </p>
                ) : (
                    <ul className={styles.rows}>
                        {visible.map((artifact) => (
                            <li key={artifact.id} className={styles.row}>
                                {/* The whole row opens the artifact's page. A
                                    per-item dynamic page, so no prefetch
                                    (AGENTS.md). */}
                                <Link
                                    href={artifactPath(artifact.slug)}
                                    prefetch={false}
                                    className={styles.rowLink}
                                    aria-label={`${artifact.title}, ${KIND_LABELS[artifact.kind]}`}
                                />
                                <span className={styles.kind} title={KIND_LABELS[artifact.kind]}>
                                    <Icon name={KIND_ICONS[artifact.kind]} />
                                </span>
                                <div className={styles.main}>
                                    <h2 className={styles.rowTitle}>{artifact.title}</h2>
                                    {artifact.description && (
                                        <p className={styles.rowText}>{artifact.description}</p>
                                    )}
                                </div>
                                <div className={styles.topics}>
                                    <TopicTags topics={artifact.topics} limit={2} />
                                </div>
                                <ul className={styles.sources}>
                                    {artifact.sources.slice(0, SOURCES_SHOWN).map((source) => (
                                        <li key={source.name}>{source.name}</li>
                                    ))}
                                    {artifact.sources.length > SOURCES_SHOWN && (
                                        <li className={styles.more}>
                                            +{artifact.sources.length - SOURCES_SHOWN} more
                                        </li>
                                    )}
                                </ul>
                                <div className={styles.status}>
                                    <StatusBadge mode={artifact.mode} />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <PageFade />
        </section>
    );
};

export default Library;
