'use client';

import classNames from 'classnames';
import { useEffect, useState, useSyncExternalStore } from 'react';

import styles from './MessageFeedback.module.scss';

import Icon from '@/components/atoms/Icon/Icon';

// What a thumbs-down can be about (the design's pills). Several may be true
// of one answer, so they toggle independently.
const REASONS = ['Incorrect', 'Wrong data', "Didn't follow instructions"] as const;

const THANKS = 'Thank you. Your feedback helps our tools improve.';

// How long the thank-you stays before the row goes quiet again.
const NOTICE_MS = 5000;

type Rating = 'up' | 'down' | null;

/**
 * Which answers this browser has already rated. The vote itself lives in the
 * feedback table server-side; this is only so a reopened conversation still
 * shows the thumb the user pressed, rather than asking again.
 */
const storageKey = (id: string) => `dfo-feedback:${location.pathname}#${id}`;
const listeners = new Set<() => void>();

const readRating = (id: string): Rating => {
    try {
        const stored = localStorage.getItem(storageKey(id));

        return stored === 'up' || stored === 'down' ? stored : null;
    } catch {
        return null;
    }
};

const writeRating = (id: string, rating: Rating) => {
    try {
        if (rating) {
            localStorage.setItem(storageKey(id), rating);
        } else {
            localStorage.removeItem(storageKey(id));
        }
    } catch {
        // Storage unavailable (private window) — the vote still sends.
    }

    listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
    listeners.add(listener);

    return () => {
        listeners.delete(listener);
    };
};

/**
 * The actions under a bot answer: copy it, or rate it. A thumbs-up is the
 * whole vote and sends on the spot; a thumbs-down opens the reasons and a
 * free-text box, and sends when the user is done with them. The thank-you
 * fades on its own — the pressed thumb is what remains.
 *
 * Everything goes to /api/feedback as one message — the same door the
 * site-wide feedback form posts to.
 */
const MessageFeedback = ({ text, id }: { text: string; id: string }) => {
    // Null on the server and through hydration, then whatever this browser
    // remembers for this answer.
    const rating = useSyncExternalStore(
        subscribe,
        () => readRating(id),
        () => null,
    );
    const [reasons, setReasons] = useState<string[]>([]);
    const [note, setNote] = useState('');
    const [copied, setCopied] = useState(false);
    // The follow-up box is open only between a thumbs-down and its send.
    const [asking, setAsking] = useState(false);
    // The thank-you line, shown for a moment after a vote lands.
    const [notice, setNotice] = useState(false);

    useEffect(() => {
        if (!notice) {
            return;
        }

        const timer = window.setTimeout(() => setNotice(false), NOTICE_MS);

        return () => window.clearTimeout(timer);
    }, [notice]);

    const send = (vote: 'up' | 'down', picked: string[], comment: string) => {
        const lines = [
            `Studio chat feedback: ${vote === 'up' ? 'thumbs up' : 'thumbs down'}`,
            picked.length > 0 && `Reasons: ${picked.join(', ')}`,
            comment.trim() && `Comment: ${comment.trim()}`,
            // The answer itself, so the report can be read without hunting
            // for the conversation.
            `\nAnswer:\n${text.slice(0, 2000)}`,
        ].filter(Boolean);

        void fetch('/api/feedback', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                message: lines.join('\n'),
                page: typeof location === 'undefined' ? null : location.pathname,
            }),
        }).catch(() => {});
    };

    const copy = () => {
        void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
        });
    };

    const rate = (vote: 'up' | 'down') => {
        // Pressing the same thumb again takes the vote back.
        if (rating === vote) {
            writeRating(id, null);
            setAsking(false);
            setNotice(false);

            return;
        }

        writeRating(id, vote);
        setReasons([]);
        setNote('');
        setNotice(true);
        setAsking(vote === 'down');

        // A thumbs-up has nothing to add, so it is already the whole report.
        if (vote === 'up') {
            send('up', [], '');
        }
    };

    const submitDown = () => {
        send('down', reasons, note);
        setAsking(false);
        setNotice(true);
    };

    return (
        <div className={styles.feedback}>
            <div className={styles.actions}>
                <button
                    type="button"
                    className={styles.action}
                    aria-label={copied ? 'Answer copied' : 'Copy this answer'}
                    onClick={copy}
                >
                    <Icon name={copied ? 'check' : 'copy-small'} className={styles.actionIcon} />
                </button>
                <button
                    type="button"
                    className={classNames(styles.action, rating === 'up' && styles.actionOn)}
                    aria-label="This answer was helpful"
                    aria-pressed={rating === 'up'}
                    onClick={() => rate('up')}
                >
                    <Icon name="thumb" className={styles.actionIcon} />
                </button>
                <button
                    type="button"
                    className={classNames(styles.action, rating === 'down' && styles.actionOn)}
                    aria-label="This answer was not helpful"
                    aria-pressed={rating === 'down'}
                    onClick={() => rate('down')}
                >
                    <Icon
                        name="thumb"
                        className={classNames(styles.actionIcon, styles.thumbDown)}
                    />
                </button>
            </div>

            {notice && <p className={styles.thanks}>{THANKS}</p>}

            {asking && (
                <>
                    <div className={styles.reasons}>
                        {REASONS.map((reason) => (
                            <button
                                key={reason}
                                type="button"
                                className={classNames(
                                    styles.reason,
                                    reasons.includes(reason) && styles.reasonOn,
                                )}
                                aria-pressed={reasons.includes(reason)}
                                onClick={() =>
                                    setReasons((prev) =>
                                        prev.includes(reason)
                                            ? prev.filter((other) => other !== reason)
                                            : [...prev, reason],
                                    )
                                }
                            >
                                {reason}
                            </button>
                        ))}
                    </div>

                    <form
                        className={styles.noteRow}
                        onSubmit={(event) => {
                            event.preventDefault();
                            submitDown();
                        }}
                    >
                        <input
                            className={styles.note}
                            value={note}
                            placeholder="Additional feedback..."
                            aria-label="Additional feedback"
                            onChange={(event) => setNote(event.target.value)}
                        />
                        <button type="submit" className={styles.submit} aria-label="Send feedback">
                            <Icon name="check" className={styles.submitIcon} />
                        </button>
                    </form>
                </>
            )}
        </div>
    );
};

export default MessageFeedback;
