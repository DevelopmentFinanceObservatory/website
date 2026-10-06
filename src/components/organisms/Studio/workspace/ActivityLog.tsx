'use client';

import classNames from 'classnames';
import { useState } from 'react';

import styles from './ActivityLog.module.scss';
import type { ActivityEntry, ActivityTool } from '@/lib/studio/activity';

// The tool's result line, cut to its first sentence.
const summaryOf = (tool: ActivityTool): string | null => {
    if (!tool.summary) {
        return null;
    }

    const first = tool.summary.split(/\n|(?<=\.)\s/)[0]?.trim() ?? '';

    return first.length > 140 ? `${first.slice(0, 139)}…` : first || null;
};

const clock = (ms: number) =>
    new Date(ms).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    });

// Durations always in seconds, one decimal (a 152ms call reads "0.2s").
const duration = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

// Running and failed steps stay in view. Finished ones fold away.
const isSettled = (tool: ActivityTool) => tool.state === 'complete' || tool.state === 'skipped';

const markClass: Record<ActivityTool['state'], string> = {
    pending: styles.markPending,
    running: styles.markPending,
    complete: styles.markComplete,
    failed: styles.markFailed,
    skipped: styles.markSkipped,
};

const ToolLine = ({
    tool,
    onViewCard,
}: {
    tool: ActivityTool;
    onViewCard: (widgetId: string) => void;
}) => {
    const summary = summaryOf(tool);

    return (
        <li className={styles.tool}>
            <span className={classNames(styles.mark, markClass[tool.state])} aria-hidden="true" />
            <div className={styles.toolBody}>
                <div className={styles.toolHead}>
                    <span className={styles.time}>{clock(tool.startedAt)}</span>
                    <span
                        className={classNames(
                            styles.toolTitle,
                            tool.state === 'failed' && styles.toolTitleFailed,
                        )}
                    >
                        {tool.name}
                    </span>
                    {tool.durationMs != null && (
                        <span className={styles.duration}>{duration(tool.durationMs)}</span>
                    )}
                </div>
                {summary && <p className={styles.summary}>{summary}</p>}
                {tool.widgetId && (
                    <button
                        type="button"
                        className={styles.viewLink}
                        onClick={() => onViewCard(tool.widgetId!)}
                    >
                        View on whiteboard
                    </button>
                )}
            </div>
        </li>
    );
};

// One turn's steps in arrival order: running and failed always, the settled
// ones (tool steps and status lines alike) behind a toggle.
const TurnLog = ({
    tools,
    onViewCard,
}: {
    tools: ActivityTool[];
    onViewCard: (widgetId: string) => void;
}) => {
    const [expanded, setExpanded] = useState(false);
    const settledCount = tools.filter(isSettled).length;
    const shown = expanded ? tools : tools.filter((tool) => !isSettled(tool));

    return (
        <>
            {shown.length > 0 && (
                <ol className={styles.tools}>
                    {shown.map((tool) => (
                        <ToolLine key={tool.id} tool={tool} onViewCard={onViewCard} />
                    ))}
                </ol>
            )}
            {settledCount > 0 && (
                <button
                    type="button"
                    className={styles.foldToggle}
                    aria-expanded={expanded}
                    onClick={() => setExpanded((open) => !open)}
                >
                    {expanded
                        ? 'Hide completed steps'
                        : `Show ${settledCount} completed ${settledCount === 1 ? 'step' : 'steps'}`}
                </button>
            )}
        </>
    );
};

/**
 * The Activity view (the chat panel's Activity tab). Each turn lists one log
 * line per step the harness reported, with its time, title as sent, duration
 * and result, and a "View on whiteboard" link for steps that produced a card.
 * The newest turn is last, like the transcript.
 */
const ActivityLog = ({
    activity,
    onViewCard,
}: {
    activity: ActivityEntry[];
    onViewCard: (widgetId: string) => void;
}) => {
    if (!activity.length) {
        return <p className={styles.empty}>Nothing yet — the agent’s trace shows up here.</p>;
    }

    return (
        <div className={styles.log}>
            {activity.map((entry) => (
                <section key={entry.turn} className={styles.turn}>
                    <TurnLog tools={entry.tools} onViewCard={onViewCard} />
                </section>
            ))}
        </div>
    );
};

export default ActivityLog;
