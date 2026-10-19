'use client';

import classNames from 'classnames';
import { useId, useState } from 'react';

import EmailSignIn from './EmailSignIn';
import styles from './LoginScreen.module.scss';
// The landing's stage (eyebrow/title/lead) is reused as-is — the sign-in
// page is the same house.
import canvas from '@/components/organisms/Studio/Studio.module.scss';
import landing from '@/components/organisms/Studio/landing/StudioLanding.module.scss';

import Button from '@/components/atoms/Button/Button';
import GridPattern, { GRID_CELL } from '@/components/atoms/GridPattern/GridPattern';
import Header from '@/components/organisms/Header/Header';
import { useGridCell } from '@/hooks/useGridCell';
import { useGridFills } from '@/hooks/useGridFills';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { signIn } from '@/lib/auth/client';
import type { Provider } from '@/lib/auth/auth';
import GitHub from '@/assets/svg/github.svg';
import Google from '@/assets/svg/google.svg';
import Microsoft from '@/assets/svg/microsoft.svg';

/**
 * Sign-in for the Studio — our own page (no hosted/iframe UI): the studio
 * bar, the light grid, the landing's copy stack and one card with a button
 * per provider. Where it is configured, email sign-in by code sits under a
 * quiet "Use email instead", so a provider stays the way people are steered
 * in. There is no sign-up. The first sign-in through a provider or a code IS
 * the account. `next` is where the visitor was headed (proxy.ts sets it); a
 * failed OAuth round-trip lands back here with `error`.
 */
type LoginScreenProps = {
    next: string;
    error?: string;
    // The providers this deployment has keys for (lib/auth/auth.ts).
    providers: Provider[];
    // Email sign-in's settings, or null when this deployment has it off.
    emailSignIn: { turnstileSiteKey: string; codeMinutes: number } | null;
};

const PROVIDERS: Record<Provider, { label: string; Mark: React.ComponentType }> = {
    google: { label: 'Continue with Google', Mark: Google },
    github: { label: 'Continue with GitHub', Mark: GitHub },
    microsoft: { label: 'Continue with Microsoft', Mark: Microsoft },
};

// What the provider round-trip can come back with (Better Auth's `error`).
const OAUTH_ERRORS: Record<string, string> = {
    access_denied: 'Sign-in was cancelled.',
    unable_to_create_user: "This account couldn't be created — try again.",
    account_not_linked: 'This email is already used with another sign-in method.',
};

// Light-canvas cell tints (the landing's — hardcoded hex by the canvas-layer
// convention).
const FILL_SHADES = ['#ffffff', '#eceada', '#dedcc6', '#cfceb6'];

const LoginScreen = ({ next, error, providers, emailSignIn }: LoginScreenProps) => {
    const sectionRef = useReveal<HTMLElement>();
    const gridCell = useGridCell();
    const gridScale = gridCell / GRID_CELL;
    const fills = useGridFills({ shades: FILL_SHADES, cols: 96, rows: 54 });
    // Which provider is mid-redirect — the others wait, the page says so.
    const [busy, setBusy] = useState<Provider | null>(null);
    const [failed, setFailed] = useState<string | null>(
        error ? (OAUTH_ERRORS[error] ?? 'Sign-in failed — please try again.') : null,
    );
    // Email sign-in folds away under the providers. With no provider it is
    // the only way in, so it starts open. It mounts on first open, so the
    // Turnstile script loads only for visitors who choose email.
    const emailOnly = providers.length === 0;
    const [emailOpen, setEmailOpen] = useState(emailOnly);
    const [emailMounted, setEmailMounted] = useState(emailOnly);
    const emailPanelId = useId();

    const toggleEmail = () => {
        setEmailMounted(true);
        setEmailOpen((open) => !open);
    };

    const withProvider = async (provider: Provider) => {
        setBusy(provider);
        setFailed(null);

        const { error: signInError } = await signIn.social({
            provider,
            callbackURL: next,
            errorCallbackURL: `/login?next=${encodeURIComponent(next)}`,
        });

        if (signInError) {
            setBusy(null);
            setFailed(signInError.message ?? 'Sign-in failed — please try again.');
        }
    };

    return (
        <section ref={sectionRef} className={styles.section}>
            {/* The landing's grid with its drifting tiles (same hook, same
                shades, same fill styles). */}
            <div className={styles.canvas} aria-hidden="true">
                <GridPattern variant="light" cell={gridCell} />
                {fills.map(({ id, x, y, w, h, shade, leaving }) => (
                    <span
                        key={id}
                        className={classNames(canvas.fill, leaving && canvas.fillOut)}
                        style={{
                            left: x * gridScale,
                            top: y * gridScale,
                            width: w * gridScale,
                            height: h * gridScale,
                            backgroundColor: shade,
                        }}
                    />
                ))}
            </div>

            <div className={styles.bar}>
                <Header variant="studio" title="Sign in" back={false} />
            </div>

            <div className={classNames(landing.stage, styles.stage)}>
                <p className={landing.eyebrow} data-reveal="text">
                    DFO Studio
                </p>
                <h1
                    className={classNames(landing.title, styles.title)}
                    data-reveal="text"
                    style={revealIndex(1)}
                >
                    Sign in to continue
                </h1>
                <p
                    className={classNames(landing.lead, styles.lead)}
                    data-reveal="text"
                    style={revealIndex(2)}
                >
                    Your canvases and conversations are saved to your account, so you can pick them
                    up on any device. No password — sign in with an account you already have.
                </p>

                <div className={styles.card} data-reveal style={revealIndex(3)}>
                    {providers.map((provider) => {
                        const { label, Mark } = PROVIDERS[provider];

                        return (
                            <button
                                key={provider}
                                type="button"
                                className={styles.provider}
                                onClick={() => withProvider(provider)}
                                disabled={busy !== null}
                            >
                                <span className={styles.providerMark}>
                                    <Mark />
                                </span>
                                <span className={styles.providerLabel}>
                                    {busy === provider ? 'One moment…' : label}
                                </span>
                            </button>
                        );
                    })}

                    {emailSignIn && !emailOnly && (
                        <Button
                            variant="plain"
                            icon="chevron-down"
                            className={styles.emailToggle}
                            data-open={emailOpen}
                            aria-expanded={emailOpen}
                            aria-controls={emailPanelId}
                            onClick={toggleEmail}
                            disabled={busy !== null}
                        >
                            Use email instead
                        </Button>
                    )}

                    {emailSignIn && (
                        <div
                            id={emailPanelId}
                            className={classNames(
                                styles.accordion,
                                emailOpen && styles.accordionOpen,
                            )}
                            inert={!emailOpen}
                        >
                            <div className={styles.accordionInner}>
                                {emailMounted && (
                                    <EmailSignIn
                                        next={next}
                                        turnstileSiteKey={emailSignIn.turnstileSiteKey}
                                        codeMinutes={emailSignIn.codeMinutes}
                                        disabled={busy !== null}
                                        open={emailOpen}
                                        focusWhenOpened={!emailOnly}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {providers.length === 0 && !emailSignIn && (
                        <p className={styles.error} role="alert">
                            Sign-in isn’t configured on this deployment yet.
                        </p>
                    )}

                    {failed && (
                        <p className={styles.error} role="alert">
                            {failed}
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
};

export default LoginScreen;
