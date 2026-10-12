'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import classNames from 'classnames';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';

import styles from './Header.module.scss';

import Button from '@/components/atoms/Button/Button';
import Icon from '@/components/atoms/Icon/Icon';
import AccountMenu from '@/components/molecules/AccountMenu/AccountMenu';
import { useScrollFrame } from '@/hooks/useScrollFrame';
import { DOCS_MENU } from '@/lib/docs/nav';
import Logo from '@/assets/svg/logo.svg';

// "Data" in the nav is the Sources page (the search lives behind Get Data /
// the prompt); the tab still reads current on every /data/* page.
// Each section unfolds a hover dropdown: plain rows, and optionally one
// action row whose arrow segment slides out on hover.
type NavMenuEntry = { label: string; href: string };

const navItems: {
    label: string;
    href: string;
    section?: string;
    menu: NavMenuEntry[];
    action?: NavMenuEntry;
}[] = [
    {
        label: 'Insights',
        href: '/insights',
        menu: [
            { label: 'Gallery', href: '/insights/gallery' },
            { label: 'Publications', href: '/insights/publications' },
        ],
        action: { label: 'Open Studio', href: '/studio' },
    },
    {
        label: 'Data',
        href: '/data/sources',
        section: '/data',
        // Coverage is deliberately absent: it isn't being built yet, so it
        // stays out of both menus until it is (DFO's own call). Whatever
        // lands here has to land in the footer's Data column too.
        menu: [
            { label: 'Sources', href: '/data/sources' },
            { label: 'Roadmap', href: '/data/roadmap' },
        ],
        action: { label: 'Get Data', href: '/data' },
    },
    {
        label: 'Docs',
        href: '/docs',
        section: '/docs',
        // The corpus's own sections (dfo-docs nav). Status is hidden for
        // launch — see src/app/(site)/docs/status/page.tsx.
        menu: DOCS_MENU,
    },
];

type IndicatorPosition = { left: number; width: number };

const INDICATOR_STRETCH_MS = 220;

export type HeaderProps = {
    /** 'studio': static light bar — back arrow, logo, title; no nav. */
    variant?: 'site' | 'studio';
    /** Studio bar title (falls back to "Studio"). */
    title?: string;
    /** Studio: show the rename pencil next to the title. */
    titleEditable?: boolean;
    // Studio: the pencil next to the title opens the rename dialog.
    onEditTitle?: () => void;
    /** Studio: back-arrow handler; without it the arrow links to the homepage. */
    onBack?: () => void;
    /** Studio: hide the back arrow altogether (e.g. the sign-in page). */
    back?: boolean;
    /** Studio: hide the account button (a public read-only share). */
    account?: boolean;
    /** Studio on a scrolling page (My History): fixed on top like the site
     *  header — transparent, hides on scroll down, returns on scroll up. */
    fixed?: boolean;
    /** Studio: extra actions rendered before the divider + account button. */
    children?: React.ReactNode;
};

const Header = ({
    variant = 'site',
    title,
    titleEditable,
    onEditTitle,
    onBack,
    back = true,
    account = true,
    fixed = false,
    children,
}: HeaderProps) => {
    const studio = variant === 'studio';
    const pathname = usePathname();
    // A nav item is current on its page and its sub-pages (/data/sources → Data).
    const isCurrent = (href: string) => {
        const section = navItems.find((item) => item.href === href)?.section ?? href;

        return pathname === section || pathname.startsWith(`${section}/`);
    };
    const router = useRouter();

    const headerRef = useRef<HTMLElement>(null);
    const navRef = useRef<HTMLElement>(null);

    // Touch fallback for the nav dropdowns: no hover there, so a tap on the
    // label toggles instead (desktop keeps pure hover — the handler checks).
    const [openNav, setOpenNav] = useState<string | null>(null);
    // The phone menu's accordion: which section's pages are unfolded.
    const [openSection, setOpenSection] = useState<string | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting UI state on a route change is the effect's whole job
        setOpenNav(null);
    }, [pathname]);

    useEffect(() => {
        if (!openNav) {
            return;
        }

        const onPress = (event: PointerEvent) => {
            if (!navRef.current?.contains(event.target as Node)) {
                setOpenNav(null);
            }
        };
        const onScroll = () => setOpenNav(null);

        document.addEventListener('pointerdown', onPress);
        window.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            document.removeEventListener('pointerdown', onPress);
            window.removeEventListener('scroll', onScroll);
        };
    }, [openNav]);

    // Studio title: when it needs a second line it drops a size (measured —
    // wrapping depends on the viewport, not just the text length).
    const titleRef = useRef<HTMLParagraphElement>(null);
    const [titleWrapped, setTitleWrapped] = useState(false);

    useEffect(() => {
        const el = titleRef.current;

        if (!el) {
            return;
        }

        let raf = 0;
        const measure = () => {
            // Measure at the base size: strip the wrapped class, compare the
            // natural (single-line) width against the available width.
            el.classList.remove(styles.studioTitleWrapped!);

            const oneLine = parseFloat(getComputedStyle(el).lineHeight) * 1.5;
            const wraps = el.scrollHeight > oneLine;

            if (wraps) {
                el.classList.add(styles.studioTitleWrapped!);
            }

            setTitleWrapped(wraps);
        };
        const queue = () => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(measure);
        };
        const observer = new ResizeObserver(queue);

        queue();
        observer.observe(el);
        window.addEventListener('resize', queue);

        return () => {
            cancelAnimationFrame(raf);
            observer.disconnect();
            window.removeEventListener('resize', queue);
        };
    }, [title]);
    const indicatorRef = useRef<IndicatorPosition | null>(null);
    const [indicator, setIndicator] = useState<IndicatorPosition | null>(null);
    const [indicatorVisible, setIndicatorVisible] = useState(false);
    const [indicatorSnap, setIndicatorSnap] = useState(false);
    const [darkTheme, setDarkTheme] = useState(false);
    const [hidden, setHidden] = useState(false);
    const [menuInstant, setMenuInstant] = useState(false);
    const lastScrollRef = useRef(0);

    const themeProbe = useCallback(() => {
        const probeY = (headerRef.current?.offsetHeight ?? 0) / 2;
        const sections = document.querySelectorAll<HTMLElement>('[data-nav-dark]');
        const dark = Array.from(sections).some((section) => {
            const rect = section.getBoundingClientRect();

            return rect.top <= probeY && rect.bottom >= probeY;
        });

        setDarkTheme(dark);
        // Re-run on route change: sections under the nav differ per page.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pathname]);

    // Hide on scroll down, show on scroll up (with a small hysteresis so tiny
    // jitters don't flip it); always visible near the top of the page. The
    // studio bar is static in-flow — no probing, no hiding — unless `fixed`
    // (a scrolling studio page), which hides/shows but never probes.
    const scrollFrame = useCallback(() => {
        if (studio && !fixed) {
            return;
        }

        if (!studio) {
            themeProbe();
        }

        const y = window.scrollY;
        const delta = y - lastScrollRef.current;
        lastScrollRef.current = y;

        if (y < 80 || delta < -2) {
            setHidden(false);
        } else if (delta > 2) {
            setHidden(true);
        }
    }, [themeProbe, studio, fixed]);

    useScrollFrame(scrollFrame);

    // Global CSS hook: sticky elements offset by the header (e.g. the results
    // table head) ride along with the hide/show transition.
    useEffect(() => {
        document.documentElement.toggleAttribute('data-nav-hidden', hidden);
    }, [hidden]);

    // Scroll frames alone miss sections that mount AFTER navigation (Suspense,
    // client-only pages) — re-probe whenever the document's structure changes.
    useEffect(() => {
        if (studio) {
            return;
        }

        let frame = 0;

        const observer = new MutationObserver(() => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(themeProbe);
        });

        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [themeProbe, studio]);

    const applyIndicator = useCallback((position: IndicatorPosition | null) => {
        indicatorRef.current = position;
        setIndicator(position);
    }, []);

    const measureIndicator = useCallback((): IndicatorPosition | null => {
        const nav = navRef.current;
        const active = nav?.querySelector<HTMLAnchorElement>('[aria-current="page"]');

        if (!nav || !active) {
            return null;
        }

        // Fixed 14px (raw, not rem — it keeps its size on every screen),
        // flush with the label's left edge, same as the hover underline.
        // Rect-based: the links sit inside positioned .navItem wrappers (the
        // dropdown anchors), so offsetLeft would be wrapper-relative.
        return {
            left: active.getBoundingClientRect().left - nav.getBoundingClientRect().left,
            width: 14,
        };
    }, []);

    useEffect(() => {
        let settle: number | undefined;
        let unsnap: number | undefined;

        const update = () => {
            const target = measureIndicator();
            const previous = indicatorRef.current;

            if (!target) {
                // Fade out in place — keep the last position so the line doesn't jump while hiding.
                indicatorRef.current = null;
                setIndicatorVisible(false);
            } else if (previous) {
                // Organic slide: first stretch over both positions, then contract to the target.
                const left = Math.min(previous.left, target.left);
                const right = Math.max(previous.left + previous.width, target.left + target.width);

                setIndicatorVisible(true);
                applyIndicator({ left, width: right - left });
                settle = window.setTimeout(() => applyIndicator(target), INDICATOR_STRETCH_MS);
            } else {
                // Appearing from hidden: snap into place, no slide from the stale position.
                setIndicatorSnap(true);
                setIndicatorVisible(true);
                applyIndicator(target);
                unsnap = window.requestAnimationFrame(() => setIndicatorSnap(false));
            }
        };

        const frame = window.requestAnimationFrame(update);

        return () => {
            window.cancelAnimationFrame(frame);

            if (unsnap) {
                window.cancelAnimationFrame(unsnap);
            }

            window.clearTimeout(settle);
        };
    }, [pathname, applyIndicator, measureIndicator]);

    useEffect(() => {
        // Only reposition an existing indicator — pre-setting it would bypass the snap logic.
        const remeasure = () => {
            const position = measureIndicator();

            if (position && indicatorRef.current) {
                applyIndicator(position);
            }
        };

        window.addEventListener('resize', remeasure);
        document.fonts.ready.then(remeasure);

        return () => window.removeEventListener('resize', remeasure);
    }, [applyIndicator, measureIndicator]);

    if (studio) {
        return (
            <header
                ref={headerRef}
                className={classNames(
                    styles.header,
                    styles.studio,
                    fixed && styles.studioFixed,
                    fixed && hidden && styles.hidden,
                )}
            >
                <div className={styles.studioLeft}>
                    {back &&
                        (onBack ? (
                            <button
                                type="button"
                                className={styles.back}
                                aria-label="Back to Studio"
                                onClick={onBack}
                            >
                                <Icon name="arrow" className={styles.backIcon} />
                            </button>
                        ) : (
                            <Link href="/" className={styles.back} aria-label="Back to DFO">
                                <Icon name="arrow" className={styles.backIcon} />
                            </Link>
                        ))}
                    <Link href="/" className={styles.logo} aria-label="DFO — home">
                        <Logo />
                    </Link>
                    <span className={styles.studioDivider} aria-hidden="true" />
                    {/* The pencil rides INLINE after the last word (inside the
                        clamped box), so it hugs the text on one line or two. */}
                    <p
                        ref={titleRef}
                        className={classNames(
                            styles.studioTitle,
                            titleWrapped && styles.studioTitleWrapped,
                        )}
                        title={title}
                    >
                        {title ?? 'Studio'}
                        {titleEditable && (
                            <button
                                type="button"
                                className={styles.editTitle}
                                aria-label="Rename"
                                onClick={onEditTitle}
                            >
                                <Icon name="edit-title" />
                            </button>
                        )}
                    </p>
                </div>
                <div className={styles.actions}>
                    {children}
                    {/* The divider separates the bar's actions from the account —
                        nothing to separate when there are none. */}
                    {children && account && <span className={styles.divider} aria-hidden="true" />}
                    {account && <AccountMenu className={styles.account} />}
                </div>
            </header>
        );
    }

    return (
        <header
            ref={headerRef}
            className={classNames(styles.header, darkTheme && styles.dark, hidden && styles.hidden)}
        >
            {/* Non-modal (the modal variant locks the page on touch). */}
            <DropdownMenu.Root
                modal={false}
                onOpenChange={(open) => {
                    if (open) {
                        setMenuInstant(false);
                        setOpenSection(null);
                    }
                }}
            >
                <DropdownMenu.Trigger asChild>
                    <button type="button" className={styles.menuTrigger} aria-label="Menu">
                        <Icon name="menu" />
                    </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content
                    className={classNames(styles.menuContent, menuInstant && styles.menuInstant)}
                    align="start"
                    sideOffset={8}
                    onCloseAutoFocus={(event) => event.preventDefault()}
                >
                    {/* The bar's own actions first (they hide on phone), then
                        the sections. */}
                    {[
                        { label: 'Get Data', href: '/data' },
                        { label: 'Open Studio', href: '/studio' },
                    ].map(({ label, href }) => (
                        <DropdownMenu.Item key={href} asChild onSelect={() => setMenuInstant(true)}>
                            <Link href={href} className={styles.menuItem}>
                                {label}
                            </Link>
                        </DropdownMenu.Item>
                    ))}
                    <DropdownMenu.Separator className={styles.menuSeparator} />
                    {/* The three sections as headings, their pages indented
                        under each (the actions above already cover Get Data /
                        Open Studio, so only the plain rows repeat here). */}
                    {navItems.map(({ label, href, menu }) => (
                        <Fragment key={href}>
                            <button
                                type="button"
                                className={classNames(
                                    styles.menuSection,
                                    openSection === href && styles.menuSectionOpen,
                                )}
                                aria-expanded={openSection === href}
                                onClick={() =>
                                    setOpenSection((prev) => (prev === href ? null : href))
                                }
                            >
                                {label}
                                <Icon name="chevron-down" />
                            </button>
                            {/* The grid-rows trick (0fr → 1fr) animates the
                                unfold without measuring heights; inert keeps
                                the folded rows out of focus order. */}
                            <div
                                className={classNames(
                                    styles.menuSub,
                                    openSection === href && styles.menuSubOpen,
                                )}
                                inert={openSection !== href}
                            >
                                <div className={styles.menuSubInner}>
                                    {menu.map((entry) => (
                                        <DropdownMenu.Item
                                            key={entry.href}
                                            asChild
                                            onSelect={() => setMenuInstant(true)}
                                        >
                                            <Link
                                                href={entry.href}
                                                className={classNames(
                                                    styles.menuItem,
                                                    styles.menuItemSub,
                                                )}
                                                aria-current={
                                                    pathname === entry.href ? 'page' : undefined
                                                }
                                            >
                                                {entry.label}
                                            </Link>
                                        </DropdownMenu.Item>
                                    ))}
                                </div>
                            </div>
                        </Fragment>
                    ))}
                </DropdownMenu.Content>
            </DropdownMenu.Root>
            <nav ref={navRef} className={styles.nav} aria-label="Main">
                {navItems.map(({ label, href, menu, action }) => (
                    <span
                        key={href}
                        className={styles.navItem}
                        data-open={openNav === href || undefined}
                    >
                        {/* Not a link: the section labels only unfold their
                            dropdowns — on hover (desktop) or on tap (touch,
                            where hover has no meaning; the handler checks).
                            The aria-current still drives the indicator. */}
                        <span
                            className={styles.link}
                            aria-current={isCurrent(href) ? 'page' : undefined}
                            onClick={() => {
                                if (window.matchMedia('(hover: none)').matches) {
                                    setOpenNav((prev) => (prev === href ? null : href));
                                }
                            }}
                        >
                            {label}
                        </span>
                        <div className={styles.navMenu} aria-label={`${label} submenu`}>
                            {/* Every row wears the same split: label + an
                                arrow segment that slides out on its hover. */}
                            {[...menu, ...(action ? [action] : [])].map((entry, index) => (
                                <Link
                                    key={entry.href}
                                    href={entry.href}
                                    className={styles.navMenuItem}
                                    style={{ '--i': index } as React.CSSProperties}
                                    data-current={pathname === entry.href || undefined}
                                    onClick={() => setOpenNav(null)}
                                >
                                    <span className={styles.navMenuLabel}>{entry.label}</span>
                                    <span className={styles.navMenuArrow} aria-hidden="true">
                                        <Icon name="arrow" />
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </span>
                ))}
                <span
                    className={classNames(
                        styles.indicator,
                        indicatorVisible && styles.visible,
                        indicatorSnap && styles.snap,
                    )}
                    style={indicator ?? undefined}
                    aria-hidden="true"
                />
            </nav>
            <Link href="/" className={styles.logo} aria-label="DFO — home">
                <Logo />
            </Link>
            <div className={styles.actions}>
                <Button onClick={() => router.push('/data')}>Get Data</Button>
                <Button variant="dark" icon="arrow" wide onClick={() => router.push('/studio')}>
                    Open Studio
                </Button>
                <span className={styles.divider} aria-hidden="true" />
                <AccountMenu className={styles.account} />
            </div>
        </header>
    );
};

export default Header;
