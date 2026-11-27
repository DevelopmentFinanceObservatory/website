import classNames from 'classnames';

import styles from './parts.module.scss';

import type { IconProps } from '@/components/atoms/Icon/Icon';
import { type ArtifactKind, type ArtifactMode, MODE_LABELS } from '@/lib/library/artifact';

/** The icon of each artifact type, in the list and on its page. */
export const KIND_ICONS: Record<ArtifactKind, IconProps['name']> = {
    chart: 'chart-bar',
    table: 'chart-table',
    key_number: 'bulb',
    canvas: 'canvas',
    data: 'download',
};

/** Live (mint) or Snapshot (grey), with the small square the design marks
 *  each with. */
export const StatusBadge = ({ mode }: { mode: ArtifactMode }) => (
    <span className={classNames(styles.badge, mode === 'live' ? styles.live : styles.snapshot)}>
        <span className={styles.badgeMark} aria-hidden="true" />
        {MODE_LABELS[mode]}
    </span>
);

/** The topics as mono tags, the first `limit` of them and "+N" for the rest
 *  when a limit is set. */
export const TopicTags = ({ topics, limit }: { topics: readonly string[]; limit?: number }) => {
    const shown = limit === undefined ? topics : topics.slice(0, limit);

    return (
        <ul className={styles.tags}>
            {shown.map((topic) => (
                <li key={topic} className={styles.tag}>
                    {topic}
                </li>
            ))}
            {shown.length < topics.length && (
                <li className={styles.tag} title={topics.slice(shown.length).join(', ')}>
                    +{topics.length - shown.length}
                </li>
            )}
        </ul>
    );
};
