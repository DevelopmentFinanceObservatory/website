'use client';

import classNames from 'classnames';

import { useSecondsUntil } from '../../hooks/useSecondsUntil';
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
 * A live share's data card before its current data is drawn. While loading
 * it shows the card's own outline with a sweep across it. On failure it
 * shows a sentence in the card's place, and "Try again" when asking again
 * can succeed (`liveCardFailure`). The button waits out the error the route
 * has stored (`retryAt`) and says how long is left. Neither state shows a
 * number. `data-live-status` and `data-live-code` name the state.
 */
const LivePlaceholder = ({ title, kind, live }: LivePlaceholderProps) => {
    const { state } = live;
    const wait = useSecondsUntil(state.status === 'error' ? state.retryAt : undefined);

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
                        <button
                            type="button"
                            className={styles.retry}
                            onClick={live.retry}
                            disabled={wait > 0}
                        >
                            {wait > 0 ? `Try again in ${wait} s` : 'Try again'}
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
            aria-label={title ? `${title}: loading current data` : 'Loading current data'}
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
                Loading current data…
            </p>
        </article>
    );
};

export default LivePlaceholder;
