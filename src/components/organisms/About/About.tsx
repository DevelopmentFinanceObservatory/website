'use client';

import { useCallback, useEffect, useRef } from 'react';

import styles from './About.module.scss';
import { startTextNet } from './net';

import Hero from '@/components/organisms/Hero/Hero';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { revealIndex, useReveal } from '@/hooks/useReveal';

/**
 * About DFO — the project's own one-pager, rebuilt inside the app.
 *
 * The copy and the staircase layout come from the standalone landing at
 * developmentfinance.org (huncwotdigital/ode-dfo): numbered steps, a narrow
 * column that sits right of centre, and stat panels that step further left
 * the deeper they go. The page keeps that structure and the house
 * typography; the standalone site's own chrome (its rail, footer and
 * newsletter) is dropped, because this page renders inside the app's header
 * and footer, which already carry the same contact and attribution.
 */
const About = () => {
    const sectionRef = useReveal<HTMLElement>();
    const textHostRef = useRef<HTMLDivElement>(null);
    const textCanvasRef = useRef<HTMLCanvasElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    // The rule's own, lagging position — see trackScroll.
    const fillRef = useRef(0);
    const reducedMotion = usePrefersReducedMotion();

    // Both fields run their own rAF loop; the starters hand back the stop.
    // Nothing starts at all when the reader asked for less motion.
    useEffect(() => {
        if (reducedMotion) {
            return;
        }

        if (!textHostRef.current || !textCanvasRef.current) {
            return;
        }

        return startTextNet(textHostRef.current, textCanvasRef.current);
    }, [reducedMotion]);

    /**
     * Both the web and the rule belong to the prose, not to the page: they
     * start where the hero ends. The rule is pinned to the prose block's own
     * rect (so it spans exactly that), and the web is pushed a whole hero
     * down and slides up as the hero scrolls away — the landing's own
     * behaviour. Once the prose has passed, the web is hidden so it never
     * shows through the footer.
     */
    const trackScroll = useCallback(() => {
        const section = sectionRef.current;
        const body = bodyRef.current;
        const net = textHostRef.current;

        if (!section || !body) {
            return;
        }

        const rect = body.getBoundingClientRect();
        const viewport = window.innerHeight;

        // Fills between the block's top and bottom passing the screen's middle.
        const travel = rect.height;
        const target =
            travel <= 0 ? 1 : Math.min(Math.max((viewport / 2 - rect.top) / travel, 0), 1);

        // The fill LAGS the scroll rather than tracking it exactly — the
        // landing scrubs it, so the line keeps catching up for a beat after
        // the reader stops. An exponential ease each frame is that, without a
        // tween library.
        fillRef.current += (target - fillRef.current) * 0.06;

        if (Math.abs(target - fillRef.current) < 0.0005) {
            fillRef.current = target;
        }

        section.style.setProperty('--about-progress', `${fillRef.current * 100}%`);
        section.style.setProperty('--about-rule-top', `${rect.top}px`);
        section.style.setProperty('--about-rule-height', `${rect.height}px`);

        if (net) {
            // The prose starts where the hero ends, so its own offset IS the
            // hero's height — no second measurement needed.
            const heroHeight = body.offsetTop || viewport;
            const revealed = Math.min(Math.max(window.scrollY / heroHeight, 0), 1);

            net.style.setProperty('--about-net-offset', `${(1 - revealed) * heroHeight}px`);
            net.style.visibility = rect.bottom > 0 ? 'visible' : 'hidden';
        }
    }, [sectionRef]);

    // Driven by its own frame loop rather than by scroll events: the fill
    // keeps easing toward its target after the reader stops, which is the
    // lag the landing gets from a scrubbed tween.
    useEffect(() => {
        let frame = 0;

        const tick = () => {
            trackScroll();
            frame = requestAnimationFrame(tick);
        };

        tick();

        return () => cancelAnimationFrame(frame);
    }, [trackScroll]);

    return (
        <section ref={sectionRef} className={styles.section}>
            {/* The house hero, same as the homepage's — only the copy
                differs. Structure, entrance and the particle mosaic all come
                from that module rather than a second copy of them. */}
            <Hero
                lines={['A shared platform', 'for development', 'finance data']}
                phoneLines={['A shared', 'platform for', 'development', 'finance data']}
                scrollLabel="The Development Finance Observatory"
                scrollHref="#about-body"
                signature={false}
                titleId="about-title"
            />

            {/* The web sits behind the prose and stays put while the page
                scrolls past it, exactly as on the landing. */}
            <div ref={textHostRef} className={styles.textNet} aria-hidden="true">
                <canvas ref={textCanvasRef} className={styles.textNetCanvas} />
            </div>

            {/* The rule that runs the height of the page, filling as it goes. */}
            <div className={styles.rule} aria-hidden="true" />

            <div id="about-body" ref={bodyRef} className={styles.body}>
                <article className={styles.col} data-reveal-group="trigger">
                    <span className={styles.step} data-reveal style={revealIndex(0)}>
                        01
                    </span>
                    <h2 className={styles.title} data-reveal="text">
                        Built to close the gap between financial flows and real-world impact
                    </h2>
                    <div className={styles.prose}>
                        <p data-reveal="text" style={revealIndex(1)}>
                            Every year, billions of dollars move across borders as aid, loans,
                            investment, and remittances. These financial flows shape whether
                            countries can build infrastructure, respond to crises, deliver
                            healthcare, and invest in long-term growth. But the data behind them
                            remains fragmented, inconsistent, and difficult to access.
                        </p>
                        <p data-reveal="text" style={revealIndex(2)}>
                            The Development Finance Observatory is a new platform bringing
                            development finance data together in one place.
                        </p>
                    </div>
                </article>

                <article className={styles.col} data-reveal-group="trigger">
                    <span className={styles.step} data-reveal style={revealIndex(0)}>
                        02
                    </span>
                    <h2 className={styles.title} data-reveal="text">
                        The cost of data fragmentation
                    </h2>
                    <div className={styles.prose}>
                        <p data-reveal="text" style={revealIndex(1)}>
                            Development finance data exists. The OECD, the World Bank, the IMF,
                            national governments, and dozens of other institutions publish decades
                            of reporting standards, methodologies, and carefully curated datasets.
                        </p>
                        <p data-reveal="text" style={revealIndex(2)}>
                            Taken as a whole, this data can help us understand the critical
                            financing flows that drive economic development and essential needs,
                            discern trends over time, and identify gaps.
                        </p>
                        <p data-reveal="text" style={revealIndex(3)}>
                            But the data lives in separate systems with incompatible formats and
                            update cycles that can lag reality by 12 to 24 months. Everyone who
                            needs to follow the money reconciles those sources manually.
                        </p>
                        <p data-reveal="text" style={revealIndex(4)}>
                            When the stakes are high and the data is hard to use, evidence loses out
                            to anecdotes.
                        </p>
                    </div>
                </article>

                <article className={styles.col} data-reveal-group="trigger">
                    <span className={styles.step} data-reveal style={revealIndex(0)}>
                        03
                    </span>
                    <h2 className={styles.title} data-reveal="text">
                        Development finance is shifting fast
                    </h2>
                    <p className={styles.lead} data-reveal="text" style={revealIndex(1)}>
                        The people who need to respond can&rsquo;t afford to work with data
                        that&rsquo;s already out of date.
                    </p>
                </article>

                {/* The staircase: each panel steps further left than the
                    column above it, so the numbers walk out into the margin. */}
                <div className={styles.panelGroup} data-reveal-group="trigger">
                    <article className={styles.panel} data-reveal style={revealIndex(0)}>
                        <span className={styles.stepSmall}>03/A</span>
                        <p className={styles.stat}>2x</p>
                        <p className={styles.panelBody}>
                            Debt service in low and lower-middle income countries is growing at more
                            than twice the pace of their economies — 8.5% annually on average,
                            compared to GDP growth of just 4% between 2020-2024.
                        </p>
                    </article>
                    <article
                        className={`${styles.panel} ${styles.panelFar}`}
                        data-reveal
                        style={revealIndex(1)}
                    >
                        <span className={styles.stepSmall}>03/B</span>
                        <p className={styles.stat}>56%</p>
                        <p className={styles.panelBody}>
                            Multilateral institutions have become the bedrock of development
                            finance. In 2024, they accounted for 56% of net financial flows to low-
                            and lower-middle income countries, up from 28% a decade ago.
                        </p>
                    </article>
                </div>

                <article
                    className={`${styles.panel} ${styles.panelNear}`}
                    data-reveal-group="trigger"
                >
                    <span className={styles.stepSmall} data-reveal style={revealIndex(0)}>
                        03/C
                    </span>
                    <p className={styles.stat} data-reveal style={revealIndex(1)}>
                        -$19 billion
                    </p>
                    <p className={styles.panelBody} data-reveal="text" style={revealIndex(2)}>
                        International funding to low-and lower-middle income countries is in
                        decline. Bilateral aid and lending fell by $19 billion over the last five
                        years compared to the previous decade. And recent aid cuts are accelerating
                        the trend.
                    </p>
                </article>

                <article className={styles.col} data-reveal-group="trigger">
                    <span className={styles.step} data-reveal style={revealIndex(0)}>
                        04
                    </span>
                    <h2 className={styles.title} data-reveal="text">
                        Better decisions start with connected data
                    </h2>
                    <h3 className={styles.subtitle} data-reveal="text" style={revealIndex(1)}>
                        The Development Finance Observatory (DFO) is built to reduce fragmentation
                        and friction. Not by replacing the institutions that produce data, but by
                        connecting their data.
                    </h3>
                    <div className={styles.prose}>
                        <p data-reveal="text" style={revealIndex(2)}>
                            The DFO integrates aid, debt, climate and health finance, domestic
                            budgets, and remittances into a single open platform – making it more
                            interconnected and usable – with every number traceable to its source.
                            It also supports a new generation of AI-assisted workflows, making
                            trusted data easier to access and explore.
                        </p>
                        <p data-reveal="text" style={revealIndex(3)}>
                            The DFO is an initiative by ONE Data, with support from{' '}
                            <a
                                href="https://www.rockefellerfoundation.org/"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                The Rockefeller Foundation
                            </a>{' '}
                            via its public charity, RF Catalytic Capital, and{' '}
                            <a
                                href="https://www.google.org/"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Google.org
                            </a>
                            .
                        </p>
                    </div>
                </article>

                <article className={styles.col} data-reveal-group="trigger">
                    <span className={styles.step} data-reveal style={revealIndex(0)}>
                        05
                    </span>
                    <h2 className={styles.title} data-reveal="text">
                        Built to be used, not read
                    </h2>
                    <h3 className={styles.subtitle} data-reveal="text" style={revealIndex(1)}>
                        The development sector doesn&rsquo;t need another data repository, policy
                        platform, or library of reports.
                    </h3>
                    <div className={styles.prose}>
                        <p data-reveal="text" style={revealIndex(2)}>
                            The DFO is designed to end up inside other people&rsquo;s work, not to
                            sit on its own website.
                        </p>
                    </div>
                </article>

                <div className={styles.panelGroup} data-reveal-group="trigger">
                    <article className={styles.panel} data-reveal style={revealIndex(0)}>
                        <span className={styles.stepSmall}>05/A</span>
                        <h3 className={styles.panelTitle}>
                            For researchers
                            <br />
                            and analysts
                        </h3>
                        <p className={styles.panelBody}>
                            Start from data you can trust. The DFO gives you clean, sourced
                            development finance data with clear methodology — so you can spend less
                            time reconciling conflicting figures and more time on analysis.
                        </p>
                    </article>
                    <article
                        className={`${styles.panel} ${styles.panelFar}`}
                        data-reveal
                        style={revealIndex(1)}
                    >
                        <span className={styles.stepSmall}>05/B</span>
                        <h3 className={styles.panelTitle}>
                            For journalists
                            <br />
                            and policy advisors
                        </h3>
                        <p className={styles.panelBody}>
                            Get to credible answers faster. In practice, this looks like a number
                            with a clear source, a chart you can cite, and a response to a hard
                            question that doesn&rsquo;t require a week of data work — whether
                            you&rsquo;re writing a story, briefing a principal, or making the case
                            for change.
                        </p>
                    </article>
                </div>

                <article
                    className={`${styles.panel} ${styles.panelNear}`}
                    data-reveal-group="trigger"
                >
                    <span className={styles.stepSmall} data-reveal style={revealIndex(0)}>
                        05/C
                    </span>
                    <h3 className={styles.panelTitle} data-reveal style={revealIndex(1)}>
                        For government officials and planners
                    </h3>
                    <p className={styles.panelBody} data-reveal="text" style={revealIndex(2)}>
                        Track the financing flows that shape your country&rsquo;s fiscal position.
                        Know what&rsquo;s been committed and where the gaps are.
                    </p>
                </article>
            </div>
        </section>
    );
};

export default About;
