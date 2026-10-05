'use client';

import classNames from 'classnames';
import ReactMarkdown from 'react-markdown';

import styles from './ActivityLog.module.scss';
import type { ActivityEntry, ActivityTool } from '../hooks/useChat';

// The agent's tools, phrased as past-tense log titles (the demo's wording).
const TOOL_TITLES: Record<string, string> = {
    search_indicators: 'Searched indicators',
    check_data_coverage: 'Checked coverage',
    get_data: 'Queried data',
    display_key_number: 'Displayed key number',
    display_chart: 'Displayed chart',
    display_data: 'Displayed data',
    clarify_query: 'Asked to clarify',
};

const titleOf = (name: string) => TOOL_TITLES[name] ?? name.replace(/_/g, ' ');

// The one-line "what it did" under the title, from the tool's arguments.
const detailOf = (tool: ActivityTool): string | null => {
    const args = (tool.args ?? {}) as Record<string, unknown>;

    switch (tool.name) {
        case 'search_indicators':
            return typeof args.query === 'string' ? `Searching: “${args.query}”` : 'Searching';
        case 'check_data_coverage':
        case 'get_data': {
            const countries = Array.isArray(args.countries) ? args.countries.join(', ') : null;
            const years =
                args.year_from || args.year_to
                    ? `${args.year_from ?? ''}–${args.year_to ?? ''}`.replace(/^–|–$/g, '')
                    : null;
            const parts = [countries, years].filter(Boolean);

            return parts.length
                ? `${tool.name === 'get_data' ? 'Querying' : 'Checking'}: ${parts.join(' · ')}`
                : tool.name === 'get_data'
                  ? 'Querying data'
                  : 'Checking coverage';
        }
        case 'display_key_number':
        case 'display_chart':
        case 'display_data':
            return typeof args.title === 'string' ? `Displaying: ${args.title}` : 'Displaying';
        default:
            return null;
    }
};

// The tool's own result line — trimmed to its first sentence.
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

const seconds = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;

// Durations always in seconds, one decimal (a 152ms call reads "0.2s").
const duration = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/**
 * The Activity view (chat panel → Activity tab): per turn, the agent's
 * thinking ("Thought for Ns", its own section) and one log line per tool
 * it ran — time, title, duration, what/result, and a "View on whiteboard"
 * link for tools that produced a card. Newest turn last, like the transcript.
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
            {activity.map((entry) => {
                // Thinking time = until the first tool ran (or the turn
                // ended); while still streaming there's no clock to read.
                const thoughtEnd = entry.tools[0]?.startedAt ?? entry.endedAt;
                const thoughtLabel =
                    thoughtEnd != null
                        ? `Thought for ${seconds(thoughtEnd - entry.startedAt)}`
                        : 'Thinking…';

                return (
                    <section key={entry.turn} className={styles.turn}>
                        {entry.thoughts && (
                            <div className={styles.thoughts}>
                                <p className={styles.thoughtsLabel}>{thoughtLabel}</p>
                                <div className={styles.thoughtsBody}>
                                    <ReactMarkdown>{entry.thoughts}</ReactMarkdown>
                                </div>
                            </div>
                        )}

                        <ol className={styles.tools}>
                            {entry.tools.map((tool) => {
                                const detail = detailOf(tool);
                                const summary = summaryOf(tool);

                                return (
                                    <li key={tool.id} className={styles.tool}>
                                        <span
                                            className={classNames(
                                                styles.mark,
                                                tool.durationMs == null && styles.markPending,
                                            )}
                                            aria-hidden="true"
                                        />
                                        <div className={styles.toolBody}>
                                            <div className={styles.toolHead}>
                                                <span className={styles.time}>
                                                    {clock(tool.startedAt)}
                                                </span>
                                                <span className={styles.toolTitle}>
                                                    {titleOf(tool.name)}
                                                </span>
                                                {tool.durationMs != null && (
                                                    <span className={styles.duration}>
                                                        {duration(tool.durationMs)}
                                                    </span>
                                                )}
                                            </div>
                                            {detail && <p className={styles.detail}>{detail}</p>}
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
                            })}
                        </ol>
                    </section>
                );
            })}
        </div>
    );
};

export default ActivityLog;
