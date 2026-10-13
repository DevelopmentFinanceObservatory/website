'use client';

import classNames from 'classnames';
import Link from 'next/link';
import { type RefObject, useEffect, useRef, useState } from 'react';

import styles from './StudioLanding.module.scss';
import { usePanelsHeight } from './usePanelsHeight';
import PromptForm, { type PromptField } from '../prompt/PromptForm';

import Icon from '@/components/atoms/Icon/Icon';
import SegmentedTabs from '@/components/molecules/SegmentedTabs/SegmentedTabs';
import { revealIndex } from '@/hooks/useReveal';
import type { ConversationMeta } from '@/lib/chat/historyClient';

const LANDING_TABS = [
    { id: 'try', label: 'Try one of these' },
    { id: 'history', label: 'My History' },
] as const;

type StudioLandingProps = {
    query: string;
    onQueryChange: (value: string) => void;
    // Start a canvas from the prompt or a suggestion.
    onBegin: (text: string) => void;
    // The visit's example prompts (pickExamples), drawn by the page.
    examples: readonly string[];
    inputRef: RefObject<PromptField | null>;
    // The account's recent canvases (the three most recent are shown); null
    // for a guest — no switch, the suggestions alone.
    history: ConversationMeta[] | null;
    // The row being fetched (click → open), so a double-click is ignored.
    openingId: string | null;
    onOpenHistory: (item: ConversationMeta) => void;
    // Staggering out on the way to the workspace.
    leaving: boolean;
    // A guest past the free prompts: shown in place of the prompt.
    wall?: React.ReactNode;
};

/**
 * The Studio landing: eyebrow, title, lead, the prompt, and the two panels
 * under a segmented switch — "Try one of these" and "My History".
 */
const StudioLanding = ({
    query,
    onQueryChange,
    onBegin,
    examples,
    inputRef,
    history,
    openingId,
    onOpenHistory,
    leaving,
    wall,
}: StudioLandingProps) => {
    const [tab, setTab] = useState<'try' | 'history'>('try');
    const tryPanelRef = useRef<HTMLDivElement>(null);
    const historyPanelRef = useRef<HTMLDivElement>(null);
    const panelsHeight = usePanelsHeight([tryPanelRef, historyPanelRef]);

    // The landing mounts on a fresh Studio and again on "New chat", so the
    // caret waits in the prompt either way and typing can start at once.
    useEffect(() => {
        inputRef.current?.focus({ preventScroll: true });
        // Mount only, as DataPrompt's autoFocus.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className={classNames(styles.stage, leaving && styles.stageOut)}>
            <p className={styles.eyebrow} data-reveal="text">
                Start exploring
            </p>
            <h1 className={styles.title} data-reveal="text" style={revealIndex(1)}>
                From questions to&nbsp;insights
            </h1>
            <p className={styles.lead} data-reveal="text" style={revealIndex(2)}>
                Describe it in your own words and Studio does the rest — querying live data, running
                analysis across datasets, and building charts on your canvas for you to edit and
                share.
            </p>

            {wall ? (
                <div data-reveal style={revealIndex(3)}>
                    {wall}
                </div>
            ) : (
                <PromptForm
                    value={query}
                    onChange={onQueryChange}
                    onSubmit={() => onBegin(query)}
                    placeholder="Start with a question, topic, or idea..."
                    label="Start with a question, topic, or idea"
                    submitLabel="Start"
                    grow
                    inputRef={inputRef}
                    data-reveal
                    style={revealIndex(3)}
                />
            )}

            {/* Past the wall there is nothing to start — the suggestions go too. */}
            {!wall && (
                <>
                    {history && (
                        <div className={styles.tabs} data-reveal style={revealIndex(4)}>
                            <SegmentedTabs
                                tabs={LANDING_TABS}
                                value={tab}
                                onChange={(id) => setTab(id as 'try' | 'history')}
                            />
                        </div>
                    )}

                    {/* Both panels stay mounted in grid-rows accordions — the swap
                animates height instead of snapping. The wrapper reserves the
                taller panel's height so the centred stage never shifts. */}
                    <div
                        className={styles.panels}
                        style={panelsHeight ? { minHeight: panelsHeight } : undefined}
                    >
                        <div
                            className={classNames(
                                styles.accordion,
                                tab === 'try' && styles.accordionOpen,
                            )}
                        >
                            <div ref={tryPanelRef} className={styles.accordionInner}>
                                <div className={styles.suggestions} data-reveal-group="trigger">
                                    {examples.map((suggestion, index) => (
                                        <button
                                            key={suggestion}
                                            type="button"
                                            className={styles.suggestion}
                                            data-reveal
                                            style={revealIndex(index)}
                                            onClick={() => onBegin(suggestion)}
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        {history && (
                            <div
                                className={classNames(
                                    styles.accordion,
                                    tab === 'history' && styles.accordionOpen,
                                )}
                            >
                                <div ref={historyPanelRef} className={styles.accordionInner}>
                                    {history.length === 0 ? (
                                        <p className={styles.historyEmpty}>
                                            No canvases yet — start your first one.
                                        </p>
                                    ) : (
                                        <div className={styles.suggestions}>
                                            {/* The three most recent; the rest live on /history. */}
                                            {history.slice(0, 3).map((saved) => (
                                                <button
                                                    key={saved.id}
                                                    type="button"
                                                    className={classNames(
                                                        styles.suggestion,
                                                        openingId === saved.id &&
                                                            styles.suggestionBusy,
                                                    )}
                                                    onClick={() => onOpenHistory(saved)}
                                                >
                                                    <span className={styles.historyTitle}>
                                                        {saved.title}
                                                    </span>
                                                    <span className={styles.historyDate}>
                                                        {new Date(
                                                            saved.updatedAt,
                                                        ).toLocaleDateString('en-GB', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                        })}
                                                    </span>
                                                </button>
                                            ))}
                                            {history.length > 3 && (
                                                <Link href="/history" className={styles.historyAll}>
                                                    See all {history.length} in My History
                                                    <Icon
                                                        name="arrow"
                                                        className={styles.historyAllIcon}
                                                    />
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default StudioLanding;
