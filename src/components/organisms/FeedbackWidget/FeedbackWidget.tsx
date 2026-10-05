'use client';

import classNames from 'classnames';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import styles from './FeedbackWidget.module.scss';

import Icon from '@/components/atoms/Icon/Icon';
import { useScrollFrame } from '@/hooks/useScrollFrame';

// How long the thank-you stays before the panel closes itself.
const DONE_MS = 2500;

/**
 * The site-wide feedback tab: a charcoal badge on the bottom edge (the
 * design's Feedback-Badge) that slides a short form open above itself. The
 * form posts to /api/feedback — the same door the chat's thumbs use — and
 * carries the page it was sent from, so a report can be placed without the
 * sender describing where they were.
 */
const FeedbackWidget = () => {
    const [open, setOpen] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const [message, setMessage] = useState('');
    // Optional: where a reply can go. Sent as-is; the route validates it.
    const [email, setEmail] = useState('');
    // Bots fill this in; people never see it.
    const [website, setWebsite] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Over a dark section (the same `data-nav-dark` sections the header
    // flips on) the badge and the form go light, probed where the badge
    // sits: the bottom edge, at the right.
    const pathname = usePathname();
    const [light, setLight] = useState(false);

    const themeProbe = useCallback(() => {
        const probeY = window.innerHeight - 15;
        const probeX = window.innerWidth - 40;
        const dark = Array.from(document.querySelectorAll<HTMLElement>('[data-nav-dark]')).some(
            (section) => {
                const rect = section.getBoundingClientRect();

                return (
                    rect.top <= probeY &&
                    rect.bottom >= probeY &&
                    rect.left <= probeX &&
                    rect.right >= probeX
                );
            },
        );

        setLight(dark);
        // Re-run on route change: the sections under the badge differ per page.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    useScrollFrame(themeProbe);

    // Sections that mount after navigation (Suspense, client-only pages)
    // don't scroll — re-probe when the document's structure changes.
    useEffect(() => {
        let frame = 0;
        const observer = new MutationObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(themeProbe);
        });

        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [themeProbe]);

    // Escape closes the panel, like the site's other overlays.
    useEffect(() => {
        if (!open) {
            return;
        }

        const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);

        window.addEventListener('keydown', onKey);

        return () => window.removeEventListener('keydown', onKey);
    }, [open]);

    // A click anywhere else closes the panel, like the search page's own
    // share box. The badge is left out, so its click toggles rather than
    // closing here and reopening on the click that follows.
    useEffect(() => {
        if (!open) {
            return;
        }

        const onPointerDown = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;

            if (
                !target ||
                panelRef.current?.contains(target) ||
                target.closest('[data-feedback-badge]')
            ) {
                return;
            }

            setOpen(false);
        };

        document.addEventListener('pointerdown', onPointerDown);

        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    // The thank-you closes on its own, and the form starts clean next time.
    useEffect(() => {
        if (!sent) {
            return;
        }

        const timer = window.setTimeout(() => {
            setOpen(false);
            setSent(false);
            setMessage('');
            setEmail('');
        }, DONE_MS);

        return () => window.clearTimeout(timer);
    }, [sent]);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!message.trim() || sending) {
            return;
        }

        setSending(true);
        setError(null);

        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    message: message.trim(),
                    email: email.trim() || undefined,
                    page: location.pathname + location.search,
                    website,
                }),
            });
            const body = (await res.json().catch(() => null)) as { message?: string } | null;

            if (!res.ok) {
                setError(body?.message ?? 'That did not go through. Please try again.');

                return;
            }

            setSent(true);
        } catch {
            setError('That did not go through. Please try again.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className={classNames(styles.widget, light && styles.light)}>
            {open && (
                <div
                    ref={panelRef}
                    className={styles.panel}
                    role="dialog"
                    aria-label="Send feedback"
                >
                    {sent ? (
                        <p className={styles.done}>Thank you — your feedback is with the team.</p>
                    ) : (
                        <form className={styles.form} onSubmit={submit}>
                            <div className={styles.head}>
                                <p className={styles.title}>Send feedback</p>
                                <button
                                    type="button"
                                    className={styles.close}
                                    aria-label="Close feedback"
                                    onClick={() => setOpen(false)}
                                >
                                    <Icon name="closer" className={styles.closeIcon} />
                                </button>
                            </div>
                            <p className={styles.lead}>
                                Tell us what worked, what didn’t, or what you expected to find. It
                                goes to the team that builds this.
                            </p>
                            <textarea
                                className={styles.message}
                                value={message}
                                placeholder="Your feedback..."
                                aria-label="Your feedback"
                                rows={4}
                                onChange={(event) => setMessage(event.target.value)}
                            />
                            <input
                                className={styles.email}
                                type="email"
                                value={email}
                                placeholder="Your email (optional)"
                                aria-label="Your email (optional)"
                                autoComplete="email"
                                onChange={(event) => setEmail(event.target.value)}
                            />
                            {/* The honeypot: off-screen, never tabbed into. */}
                            <input
                                className={styles.trap}
                                type="text"
                                tabIndex={-1}
                                autoComplete="off"
                                aria-hidden="true"
                                value={website}
                                onChange={(event) => setWebsite(event.target.value)}
                            />
                            {error && <p className={styles.error}>{error}</p>}
                            <button
                                type="submit"
                                className={styles.send}
                                disabled={!message.trim() || sending}
                            >
                                {sending ? 'Sending…' : 'Send feedback'}
                            </button>
                        </form>
                    )}
                </div>
            )}

            <button
                type="button"
                className={classNames(styles.badge, open && styles.badgeOpen)}
                data-feedback-badge=""
                aria-expanded={open}
                onClick={() => setOpen((prev) => !prev)}
            >
                <Icon name="feedback" className={styles.badgeIcon} />
                Feedback
            </button>
        </div>
    );
};

export default FeedbackWidget;
