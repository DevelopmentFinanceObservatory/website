'use client';

import classNames from 'classnames';

import cardStyles from './Card.module.scss';
import styles from './LivePlaceholder.module.scss';

import type { Widget } from '@/lib/chat/widgets';
import { type CardLive, liveCardFailure } from '@/lib/studio/liveCards';

type LivePlaceholderProps = {
    // The sharer's own title for the card, or '' when they set none. It is
    // their wording and stays as written, so a held or failed card keeps it,
    // which tells a reader which card this is. The title the card was made
    // with is withheld with its data.
    title: string;
    kind: Widget['kind'];
    live: CardLive;
};

/**
 * A data card the browser fills, before its data is drawn: a live share's
 * card, or a snapshot's card its page could not draw. While loading it
 * shows the card's own outline with a sweep across it. On failure it shows
 * a sentence in the card's place, and "Try again" when asking again can
 * succeed (`liveCardFailure`). Neither state shows a number.
 * `data-live-status` and `data-live-code` name the state.
 */
const LivePlaceholder = ({ title, kind, live }: LivePlaceholderProps) => {
    const { state } = live;
    const loading = live.snapshot ? 'Loading data' : 'Loading current data';

    if (state.status === 'error') {
        const failure = liveCardFailure(state);

        return (
            <article
                className={classNames(cardStyles.card, styles.failed)}
                data-live-status="error"
                data-live-code={state.code}
            >
                {title && <p className={cardStyles.cardTitle}>{title}</p>}
                <div className={styles.failure}>
                    <p className={styles.failureText} role="status">
                        {failure.message}
                    </p>
                    {failure.retry && (
                        <button type="button" className={styles.retry} onClick={live.retry}>
                            Try again
                        </button>
                    )}
                </div>
            </article>
        );
    }

    return (
        <article
            className={cardStyles.card}
            data-live-status="loading"
            aria-busy="true"
            aria-label={title ? `${title}: ${loading.toLowerCase()}` : loading}
        >
            {title ? (
                <p className={cardStyles.cardTitle}>{title}</p>
            ) : (
                <span className={classNames(styles.bone, styles.boneTitle)} aria-hidden="true" />
            )}
            <span
                className={classNames(
                    styles.bone,
                    kind === 'key_number' ? styles.boneNumber : styles.boneBody,
                )}
                aria-hidden="true"
            />
            <p className={styles.status} role="status">
                {loading}…
            </p>
        </article>
    );
};

export default LivePlaceholder;
