'use client';

import classNames from 'classnames';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useRef } from 'react';

import styles from './Footer.module.scss';

import Button from '@/components/atoms/Button/Button';
import TextFill from '@/components/atoms/TextFill/TextFill';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { revealIndex, useReveal } from '@/hooks/useReveal';
import { useScrollFrame } from '@/hooks/useScrollFrame';
import { enterProgress } from '@/utils/scroll';
import { showPrivacySettings } from '@/lib/consent';
import { DOCS_MENU } from '@/lib/docs/nav';
import Logo from '@/assets/svg/logo.svg';
import WorldMap from '@/components/atoms/WorldMap/WorldMap';

// The Data column mirrors the header's Data dropdown exactly — same
// entries, same order (Coverage is left out of both until it's built).
const columns = [
    { title: 'Insights', links: ['Chat', 'Gallery', 'Publications'] },
    { title: 'Data', links: ['Sources', 'Roadmap', 'Get Data'] },
    // Status is hidden for launch — see src/app/(site)/docs/status/page.tsx.
    { title: 'Docs', links: DOCS_MENU.map((entry) => entry.label) },
    { title: 'About', links: ['About DFO', 'Contact us'] },
];

// Contact opens a mail draft to the DFO team — the same address the
// current developmentfinance.org site uses behind its Contact us.
const CONTACT_MAILTO = 'mailto:data@one.org';

// The footer links that already lead somewhere (the rest are stubs).
const FOOTER_ROUTES: Record<string, string> = {
    'About DFO': '/about',
    'Contact us': CONTACT_MAILTO,
    Chat: '/studio',
    Gallery: '/insights/gallery',
    Publications: '/insights/publications',
    Sources: '/data/sources',
    Roadmap: '/data/roadmap',
    'Get Data': '/data',
    ...Object.fromEntries(DOCS_MENU.map((entry) => [entry.label, entry.href])),
};

const Footer = () => {
    const pathname = usePathname();
    const footerRef = useReveal<HTMLElement>(0);
    const dfoRef = useRef<HTMLDivElement>(null);
    const reducedMotion = usePrefersReducedMotion();

    // The giant DFO rises from below the fold over the map — the whole
    // wordmark as one piece (17/22 of the logo's viewBox height ≈ the old
    // full-letter travel, expressed as % so the wrapper can carry it).
    const parallax = useCallback(() => {
        const footer = footerRef.current;
        const dfo = dfoRef.current;

        if (!footer || !dfo) {
            return;
        }

        const progress = enterProgress(footer.getBoundingClientRect(), window.innerHeight);

        dfo.style.transform = `translateY(${((1 - progress) * 17 * 100) / 22}%)`;
    }, [footerRef]);

    useScrollFrame(reducedMotion ? null : parallax);

    return (
        <footer
            ref={footerRef}
            className={classNames(styles.footer, pathname === '/data' && styles.flat)}
            data-nav-dark="true"
        >
            {/* Covers the whole footer at its natural ratio — whatever
                doesn't fit bleeds off the crop (never squashed). */}
            <WorldMap className={styles.mapBg} />
            {/* Two stacked copies: the one underneath carries the stroke,
                the one on top only the fills — its letters cover every
                stroke segment that falls inside the wordmark, so the line
                that remains is one shared outline around the whole DFO. */}
            <div ref={dfoRef} className={styles.dfoWatermark} aria-hidden="true">
                <Logo className={styles.dfoStroke} />
                <Logo className={styles.dfoFill} />
            </div>
            <div className={styles.left}>
                <div className={styles.cta} data-reveal-group="trigger">
                    <p className={styles.heading}>
                        <TextFill text="If you work in government, research, journalism, or as an institutional partner, this is being built for you. And we’d love to hear from you." />
                    </p>
                    <Button
                        className={styles.contact}
                        icon="arrow"
                        data-reveal
                        style={revealIndex(0)}
                        onClick={() => {
                            window.location.href = CONTACT_MAILTO;
                        }}
                    >
                        Contact us
                    </Button>
                </div>
                <div className={styles.attribution} data-reveal-group="trigger">
                    <p className={styles.attributionText} data-reveal="text" style={revealIndex(0)}>
                        The Development Finance Observatory is an initiative by ONE Data. It was
                        built with support from{' '}
                        <a
                            href="https://www.rockefellerfoundation.org/"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            The Rockefeller Foundation
                        </a>{' '}
                        via its public charity, RF Catalytic Capital, and{' '}
                        <a href="https://www.google.org/" target="_blank" rel="noopener noreferrer">
                            Google.org
                        </a>
                        , and with technical support from{' '}
                        <a href="https://datacommons.org" target="_blank" rel="noopener noreferrer">
                            Google Data Commons
                        </a>
                        .
                    </p>
                </div>
            </div>
            <div className={styles.right}>
                <nav className={styles.columns} aria-label="Footer" data-reveal-group="trigger">
                    {columns.map(({ title, links }, index) => (
                        <div
                            key={title}
                            className={styles.column}
                            data-reveal
                            style={revealIndex(index)}
                        >
                            <p className={styles.columnTitle}>{title}</p>
                            <ul className={styles.columnLinks}>
                                {links.map((link) => (
                                    <li key={link}>
                                        {!FOOTER_ROUTES[link] ? (
                                            <a href="#">{link}</a>
                                        ) : FOOTER_ROUTES[link].startsWith('mailto:') ? (
                                            // A plain anchor — router prefetch
                                            // has no business on a mailto.
                                            <a href={FOOTER_ROUTES[link]}>{link}</a>
                                        ) : (
                                            <Link href={FOOTER_ROUTES[link]}>{link}</Link>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </nav>
                <div className={styles.policies} data-reveal="text">
                    <a
                        href="https://www.one.org/info/privacy-policy/"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Privacy Policy
                    </a>
                    <Link href="/ai-policy">AI Policy</Link>
                    <button type="button" onClick={showPrivacySettings}>
                        Privacy settings
                    </button>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
