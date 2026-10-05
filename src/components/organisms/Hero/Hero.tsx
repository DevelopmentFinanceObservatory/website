'use client';

import classNames from 'classnames';
import { useEffect, useRef, useState } from 'react';

import styles from './Hero.module.scss';
import { startHeroNet } from './hero-net';

import Icon from '@/components/atoms/Icon/Icon';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import LogoSignature from '@/assets/svg/logo-signature.svg';
import WorldMap from '@/assets/svg/world-map.svg';

// The Get Started arrow plays the Button atom's swap on hover: the same
// intent window, flight time and play-to-the-end behaviour (Button.tsx has
// the canonical constants — keep these in step with ARROW_MS there).
const ARROW_SWAP_MS = 750;
const HOVER_INTENT_MS = 150;

type HeroProps = {
    /** the tagline's line breaks for desktop and tablet */
    lines: string[];
    /** the phone's own breaking of the same copy; falls back to `lines` */
    phoneLines?: string[];
    /** the cue under the tagline and where it goes */
    scrollLabel: string;
    scrollHref: string;
    /** the paragraph beside the cue — omitted where the page has none */
    description?: string;
    /** the wordmark in the bottom-right corner */
    signature?: boolean;
    /** a small attribution line under the intro paragraph, e.g. the platform credit */
    credit?: { label: string; href: string };
    /** the id the section's aria-labelledby points at */
    titleId?: string;
};

/**
 * The house hero: the world map, the three telescoping panels with the
 * particle mosaic running inside the middle one, a tagline and a scroll cue.
 * Structure and entrance are fixed — the copy is the caller's.
 */
const Hero = ({
    lines,
    phoneLines,
    scrollLabel,
    scrollHref,
    description,
    signature = true,
    credit,
    titleId = 'hero-title',
}: HeroProps) => {
    const sectionRef = useReveal<HTMLElement>(0);
    const innerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // One-shot arrow swap (mirrors Button): hover must rest a beat to start
    // it, and once started it always plays out — leaving doesn't cut it off.
    const [arrowSwapping, setArrowSwapping] = useState(false);
    const swappingRef = useRef(false);
    const intentRef = useRef(0);
    const swapTimerRef = useRef(0);

    const startArrowSwap = () => {
        if (swappingRef.current) {
            return;
        }

        intentRef.current = window.setTimeout(() => {
            swappingRef.current = true;
            setArrowSwapping(true);
            swapTimerRef.current = window.setTimeout(() => {
                swappingRef.current = false;
                setArrowSwapping(false);
            }, ARROW_SWAP_MS);
        }, HOVER_INTENT_MS);
    };

    useEffect(
        () => () => {
            window.clearTimeout(intentRef.current);
            window.clearTimeout(swapTimerRef.current);
        },
        [],
    );

    useEffect(() => {
        if (!innerRef.current || !canvasRef.current) {
            return;
        }

        const net = startHeroNet(innerRef.current, canvasRef.current);

        // The CSS entrances replay by themselves (the reveal system resets
        // off-screen elements); the canvas intro must be re-armed by hand —
        // whenever the section comes back after having fully left.
        let wasOut = false;
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) {
                    wasOut = true;
                } else if (wasOut) {
                    wasOut = false;
                    net.replay();
                }
            });
        });

        if (sectionRef.current) {
            observer.observe(sectionRef.current);
        }

        return () => {
            observer.disconnect();
            net.stop();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- sectionRef is stable (useReveal's ref)
    }, []);

    // One reveal GROUP for the whole hero: the observer watches the
    // full-viewport section (the telescoping panels start at scale 0 —
    // zero-size boxes their own observers could never see), and every child
    // rides the section's data-revealed on its own delay.
    return (
        <section
            ref={sectionRef}
            className={styles.hero}
            aria-labelledby="hero-title"
            data-reveal-group="trigger"
        >
            <div className={styles.decor} aria-hidden="true" data-reveal style={revealIndex(0)}>
                <WorldMap className={styles.map} />
            </div>
            <div className={styles.wrapper} data-reveal="text" style={revealIndex(1)}>
                <div ref={innerRef} className={styles.inner}>
                    <canvas ref={canvasRef} className={styles.net} aria-hidden="true" />
                    <div className={styles.core} data-reveal>
                        {/* Two breakings of the same copy — the reveal spans
                            force their line breaks, so each breakpoint gets
                            the split that reads right (CSS shows one set):
                            desktop/tablet two lines, phone three. */}
                        <h1 id={titleId} className={styles.tagline}>
                            {lines.map((line, index) => (
                                <span
                                    key={line}
                                    className={classNames(styles.line, styles.lineWide)}
                                    data-reveal="text"
                                    style={revealIndex(5 + index)}
                                >
                                    {line}
                                </span>
                            ))}
                            {(phoneLines ?? lines).map((line, index) => (
                                <span
                                    key={line}
                                    className={classNames(styles.line, styles.linePhone)}
                                    data-reveal="text"
                                    style={revealIndex(5 + index)}
                                >
                                    {line}
                                </span>
                            ))}
                        </h1>
                        <div className={styles.bottom}>
                            <a
                                className={classNames(
                                    styles.scroll,
                                    arrowSwapping && styles.scrollSwapping,
                                )}
                                href={scrollHref}
                                data-reveal="text"
                                style={revealIndex(
                                    5 + Math.max(lines.length, (phoneLines ?? lines).length),
                                )}
                                onMouseEnter={startArrowSwap}
                                onMouseLeave={() => window.clearTimeout(intentRef.current)}
                            >
                                <span className={styles.title}>{scrollLabel}</span>
                                <span className={styles.arrow} aria-hidden="true">
                                    <span className={styles.arrowMover}>
                                        <Icon name="arrow-down" />
                                        <Icon name="arrow-down" />
                                    </span>
                                </span>
                            </a>
                            {(description || credit) && (
                                <div className={styles.intro}>
                                    {description && (
                                        <p
                                            className={styles.description}
                                            data-reveal="text"
                                            style={revealIndex(
                                                6 +
                                                    Math.max(
                                                        lines.length,
                                                        (phoneLines ?? lines).length,
                                                    ),
                                            )}
                                        >
                                            {description}
                                        </p>
                                    )}
                                    {credit && (
                                        <a
                                            className={styles.credit}
                                            href={credit.href}
                                            target="_blank"
                                            rel="noreferrer"
                                            data-reveal
                                            style={revealIndex(
                                                7 +
                                                    Math.max(
                                                        lines.length,
                                                        (phoneLines ?? lines).length,
                                                    ),
                                            )}
                                        >
                                            {credit.label}
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {signature && (
                <LogoSignature
                    className={styles.signature}
                    aria-hidden="true"
                    data-reveal
                    style={revealIndex(11)}
                />
            )}
        </section>
    );
};

export default Hero;
