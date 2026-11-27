import classNames from 'classnames';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useStudioModel } from '../../../hooks/studioContext';
import { useEscape, usePromptShell } from '../shellContext';
import CardPage from './card/CardPage';
import { type Folds, Overview } from './Overview';
import { DataUsedPage, PlanPage, QuestionPage, SourcePage } from './Pages';
import { type PanelNav, PanelNavContext } from './panelNav';
import partStyles from './parts/parts.module.scss';
import styles from './SessionPanel.module.scss';
import { useGrow } from './useGrow';
import { useSession } from './useSession';

import { standingFor } from '@/lib/studio/cardReplace';
import { ESCAPE_PANEL_PAGE, type PanelPage, samePage } from '@/lib/studio/promptShell';
import {
    datasetsOf,
    pageTitleOf,
    planPageOf,
    type SessionInput,
    sourcePageOf,
    turnPageOf,
} from '@/lib/studio/sessionView';

const pageKey = (page: PanelPage) =>
    'id' in page ? `${page.kind}:${page.id}` : `${page.kind}:${page.turn}`;

/** The page on top of the trail as drawn, or null when its subject is gone
 *  and the overview takes its place. */
const PageView = ({
    page,
    input,
    newestTurn,
}: {
    page: PanelPage;
    input: SessionInput;
    newestTurn: number | null;
}) => {
    switch (page.kind) {
        case 'turn': {
            const view = turnPageOf(input, page.turn);

            return view && <QuestionPage page={view} newest={page.turn === newestTurn} />;
        }
        case 'stage': {
            const datasets = datasetsOf(input, page.turn);

            return datasets.length > 0 && <DataUsedPage datasets={datasets} />;
        }
        case 'plan': {
            const view = planPageOf(input, page.turn);

            return view && <PlanPage page={view} />;
        }
        case 'source': {
            const source = sourcePageOf(input, page.id);

            return source && <SourcePage source={source} />;
        }
        // Unkeyed: the card page stays mounted while it follows its card to
        // the card that replaced it.
        case 'card':
            return cardStands(page.id, input) && <CardPage id={page.id} />;
    }
};

// A card page stands while its card, or a card that replaced it, is on the
// canvas.
const cardStands = (id: string, input: SessionInput) =>
    standingFor(id, new Set(input.canvasIds), input.replaced ?? {}) !== null;

/** A panel control's `data-sp-key`, or the card on the canvas a page was
 *  opened from with the control pressed on it (a menu's trigger for a menu
 *  item). */
type CardOpener = { card: string; control: Element | null };
type Opener = string | CardOpener | null;

/**
 * The panel control `opener` names, while it is in the panel. A card row's
 * control of a card since replaced resolves to the same control of the card
 * standing for it.
 */
const openerIn = (box: HTMLElement, opener: string, input: SessionInput): Element | null => {
    const find = (key: string) => box.querySelector(`[data-sp-key="${CSS.escape(key)}"]`);
    const card = opener.match(/^(more|fly|text|image|data):(.+)$/);
    const standing =
        card?.[2] && standingFor(card[2], new Set(input.canvasIds), input.replaced ?? {});

    return find(opener) ?? (card && standing ? find(`${card[1]}:${standing}`) : null);
};

// Whether a page's subject still stands.
const resolves = (page: PanelPage, input: SessionInput): boolean => {
    switch (page.kind) {
        case 'turn':
            return turnPageOf(input, page.turn) !== null;
        case 'stage':
            return datasetsOf(input, page.turn).length > 0;
        case 'plan':
            return planPageOf(input, page.turn) !== null;
        case 'source':
            return sourcePageOf(input, page.id) !== null;
        case 'card':
            return cardStands(page.id, input);
    }
};

/**
 * The session panel: the overview of the session's questions and cards, and
 * the pages one press away, under the pinned back row. Pages open through
 * the shell's trail. A page whose subject is gone gives way to the overview,
 * and a card page follows its card to the card that replaced it. Escape goes
 * back one page.
 */
const SessionPanel = () => {
    const { canvas } = useStudioModel();
    const { state, dispatch, panelOpen, focusCard, plans: links } = usePromptShell();
    const { input, overview } = useSession();
    const { trail } = state;
    const top = trail.at(-1) ?? null;
    const shown = top && resolves(top, input) ? top : null;
    const { scroller, top: topSpacer, foot: footSpacer } = useGrow(shown !== null);
    const [folds, setFolds] = useState<Folds>({ earlier: false, removed: false, keep: null });

    // What opened each page, by the page's place in the trail, which takes
    // focus when the reader comes back to it: a panel control's
    // `data-sp-key`, or the card on the canvas and its control (a menu's
    // trigger for a menu item) the reader last pressed or focused outside
    // the panel (`outside`). `pending` holds the opener of the page nav.show
    // asked for until the trail takes it.
    const openers = useRef<Opener[]>([]);
    const pending = useRef<{ page: PanelPage; opener: string | null } | null>(null);
    const trailBefore = useRef<readonly PanelPage[]>([]);
    const outside = useRef<CardOpener | null>(null);
    const backTo = useRef<Opener>(null);
    const overviewTop = useRef<number | null>(null);

    const newestTurn = overview.groups.at(-1)?.turn ?? null;
    const behind = trail.at(-2);
    const backLabel = behind ? (pageTitleOf(input, behind) ?? 'Back') : 'Session';

    const nav = useMemo<PanelNav>(
        () => ({
            show: (page, opener) => {
                pending.current = { page, opener: opener ?? null };
                dispatch({ type: 'panel.show', page });
            },
            back: () => {
                backTo.current = openers.current[trail.length - 1] ?? null;
                dispatch({ type: 'panel.back' });
            },
            backLabel,
            fly: (id) => canvas.flyTo(id),
        }),
        [trail.length, backLabel, dispatch, canvas],
    );

    useEffect(() => {
        const box = scroller.current;
        const note = (event: Event) => {
            const target = event.target instanceof Element ? event.target : null;

            if (!target || box?.contains(target)) return;

            const menu = target.closest('[role="menu"]');
            const trigger = menu?.id
                ? document.querySelector(`[aria-controls="${CSS.escape(menu.id)}"]`)
                : null;

            const pressed = trigger ?? target;
            const id = pressed
                .closest('[data-studio-canvas] [data-card-id]')
                ?.getAttribute('data-card-id');
            const control = pressed.closest('button, a, [tabindex]');

            // Focus landing outside any card (a menu's focus guard, the
            // dock) leaves the card in place; a press elsewhere clears it.
            if (id || event.type === 'pointerdown') {
                outside.current = id ? { card: id, control } : null;
            }
        };

        document.addEventListener('focusin', note, true);
        document.addEventListener('pointerdown', note, true);

        return () => {
            document.removeEventListener('focusin', note, true);
            document.removeEventListener('pointerdown', note, true);
        };
    }, [scroller]);

    // The openers follow the trail: a page keeps its opener while it stays
    // at its place, a page replaced in place keeps the one it took over, and
    // a page that joined the trail takes nav.show's opener when it is the
    // page nav.show asked for, else the card it was opened from.
    useLayoutEffect(() => {
        const before = trailBefore.current;
        const asked = pending.current;

        openers.current = trail.map((page, at) => {
            const kept =
                before[at] === page || (at === before.length - 1 && at === trail.length - 1);

            if (kept) return openers.current[at] ?? null;

            if (at !== trail.length - 1) return null;

            return asked && samePage(asked.page, page) ? asked.opener : outside.current;
        });
        trailBefore.current = trail;
        pending.current = null;
    }, [trail]);

    useEscape(
        ESCAPE_PANEL_PAGE,
        () => {
            if (trail.length === 0) return false;

            nav.back();

            return true;
        },
        panelOpen,
    );

    // A page whose subject is gone (a card page follows its card through
    // replacements first) leaves the trail with every page above the
    // deepest one that still stands. Focus that was in the panel, or fell to
    // the body with the page, goes to the control on that page that opened
    // the next one, or to the Cards heading on the overview.
    const gone = top !== null && shown === null;

    useEffect(() => {
        if (!gone) return;

        const stands = trail.findLastIndex((page) => resolves(page, input));
        const box = scroller.current;
        const active = document.activeElement;
        const free = !active || active === document.body || !!box?.contains(active);

        if (stands === -1) {
            dispatch({ type: 'panel.home' });

            const heading = box?.querySelector<HTMLElement>('[data-sp-cards] h3');

            if (heading && free) {
                heading.tabIndex = -1;
                heading.focus({ preventScroll: true });
            }

            return;
        }

        if (free) backTo.current = openers.current[stands + 1] ?? null;

        for (let at = trail.length - 1; at > stands; at -= 1) dispatch({ type: 'panel.back' });
    }, [gone, trail, input, dispatch, scroller]);

    // Scroll and focus follow the trail: a page opens at its top with focus
    // on its back button (when focus is in the panel, on the body, or on the
    // canvas); going back restores the control that opened the page; the
    // overview keeps its own scroll position.
    const shownKey = shown ? pageKey(shown) : null;
    const depth = useRef(trail.length);
    const depthNow = trail.length;
    // The input as of this render, read when the trail moves.
    const inputNow = useRef(input);

    useLayoutEffect(() => {
        inputNow.current = input;
    });

    useLayoutEffect(() => {
        const box = scroller.current;

        if (!box) return;

        if (shownKey === null) {
            if (overviewTop.current !== null) scrollTo(box, overviewTop.current);
        } else {
            scrollTo(box, 0);
        }

        updateFades(box);

        const deeper = depthNow > depth.current;
        const active = document.activeElement;

        depth.current = depthNow;
        const free =
            !active ||
            active === document.body ||
            box.contains(active) ||
            !!active.closest('[data-studio-canvas], [role="menu"]');

        if (shownKey !== null && deeper && free) {
            box.querySelector<HTMLElement>('[data-sp-back]')?.focus({ preventScroll: true });
        } else if (backTo.current) {
            const opener = backTo.current;
            const now = inputNow.current;

            backTo.current = null;

            // A page opened from a card goes back to the control pressed on
            // it, else to the selection toggle of the card standing for it.
            if (opener !== null && typeof opener !== 'string') {
                if (opener.control instanceof HTMLElement && opener.control.isConnected) {
                    opener.control.focus({ preventScroll: true });

                    return;
                }

                const standing = standingFor(
                    opener.card,
                    new Set(now.canvasIds),
                    now.replaced ?? {},
                );

                if (standing && focusCard(standing)) return;
            }

            // A control that is gone hands focus to the page's back button,
            // or on the overview to the Cards heading.
            const target =
                (typeof opener === 'string' ? openerIn(box, opener, now) : null) ??
                box.querySelector<HTMLElement>(
                    shownKey !== null ? '[data-sp-back]' : '[data-sp-cards] h3',
                );

            if (!(target instanceof HTMLElement)) return;

            if (shownKey === null && target.tagName === 'H3') target.tabIndex = -1;
            target.focus({ preventScroll: true });
        }
    }, [shownKey, depthNow, scroller, focusCard]);

    // The overview opens scrolled so the newest question shows, and follows
    // each new question as it arrives. Only the panel's own scroller moves:
    // scrollIntoView would also scroll the Studio section, which clips the
    // closed panel off-stage.
    const groupCount = overview.groups.length;

    useLayoutEffect(() => {
        const box = scroller.current;
        const group = box?.querySelector<HTMLElement>(`[data-sp-group="${newestTurn}"]`);

        if (!box || !group || !panelOpen || shownKey !== null) return;

        scrollTo(box, nearestTop(box, group));
        updateFades(box);
    }, [groupCount, newestTurn, shownKey, panelOpen, scroller]);

    useLayoutEffect(() => {
        const box = scroller.current;

        if (box) updateFades(box);
    });

    return (
        <PanelNavContext.Provider value={nav}>
            <div
                ref={scroller}
                className={classNames(partStyles.root, styles.scroller)}
                data-sp-scroll
                onScroll={(event) => {
                    const box = event.currentTarget;

                    if (shownKey === null) overviewTop.current = box.scrollTop;

                    updateFades(box);
                }}
            >
                <div ref={topSpacer} className={styles.spacer} aria-hidden="true" data-end="top" />
                {!overview.empty &&
                    (shown ? (
                        <PageView page={shown} input={input} newestTurn={newestTurn} />
                    ) : (
                        <Overview view={overview} links={links} folds={folds} setFolds={setFolds} />
                    ))}
                <div
                    ref={footSpacer}
                    className={styles.spacer}
                    aria-hidden="true"
                    data-end="foot"
                />
            </div>
        </PanelNavContext.Provider>
    );
};

// The scrollTop that brings `item` fully into `box`, moving as little as
// possible.
const nearestTop = (box: HTMLElement, item: HTMLElement): number => {
    const top = item.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const bottom = top + item.offsetHeight;

    if (top < box.scrollTop) return top;
    if (bottom > box.scrollTop + box.clientHeight) return Math.min(top, bottom - box.clientHeight);

    return box.scrollTop;
};

const scrollTo = (box: HTMLElement, top: number) => {
    box.scrollTop = top;
};

// The foot fade while content lies below, and the back row's hairline once
// a page has scrolled.
const updateFades = (box: HTMLElement) => {
    box.toggleAttribute('data-sp-scrolled', box.scrollTop > 0);
    box.toggleAttribute('data-more-below', box.scrollTop + box.clientHeight < box.scrollHeight - 1);
};

export default SessionPanel;
