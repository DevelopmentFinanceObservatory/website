import classNames from 'classnames';

import styles from './LiveNote.module.scss';

import { isLiveCanvas, type LiveCanvas, liveNote } from '@/lib/studio/liveCards';

/**
 * The one line a live canvas carries: its data is current, and its titles
 * and notes were written on the day the share was made. Shown once per
 * canvas, in the tools row of `/s/[id]` and on a strip under the embed.
 * Nothing for a snapshot (`live` undefined) or a canvas with no data card.
 */
const LiveNote = ({ live, className }: { live: LiveCanvas | undefined; className?: string }) =>
    isLiveCanvas(live) ? (
        <span className={classNames(styles.note, className)} data-live-note="">
            <span className={styles.dot} aria-hidden="true" />
            {liveNote(live.createdAt)}
        </span>
    ) : null;

export default LiveNote;
