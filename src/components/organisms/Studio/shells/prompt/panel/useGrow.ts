import { useEffect, useEffectEvent, useRef } from 'react';

import { usePromptShell } from '../shellContext';

import {
    EDGE_MS,
    FADE_OUT_MS,
    GROW_REST_MS,
    holdRow,
    SHRINK_AFTER_MS,
    SPACER_EASE_MS,
} from '@/lib/studio/panelGrow';

// The rows a layout switch holds in place: the nearest of these around the
// pointer or the focused control.
const ROW = 'li, dl > div, section > div, p, h2, h3, button, pre';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = () => matchMedia('(hover: hover)').matches;

/**
 * Grows the session panel from its rest width to the wide one while the
 * pointer rests in it, or keyboard focus is inside, on a page (never on the
 * overview, and never while the panel overlays a narrow canvas), and shrinks it once both have been gone SHRINK_AFTER_MS. The
 * aside around the scroller carries the state the stylesheets read:
 * `data-sp-grow` (`open` or `closing`), `data-sp-wide` from the layout switch
 * at the start of a grow to the one at the end of a shrink, and
 * `data-sp-fade` for the dissolve across each switch. Across a switch the
 * row under the pointer, or the focused control, keeps its place, with
 * spacers where the scroll range runs out; they stay while the pointer is
 * inside and ease away once a shrink lands without it.
 */
export const useGrow = (onPage: boolean) => {
    const { panelRef, overlay } = usePromptShell();
    // A panel that overlays a narrow canvas keeps its width.
    const growable = onPage && !overlay;
    const scroller = useRef<HTMLDivElement | null>(null);
    const top = useRef<HTMLDivElement | null>(null);
    const foot = useRef<HTMLDivElement | null>(null);
    const grow = useRef({
        inside: false,
        rested: false,
        keyboard: false,
        phase: 'rest' as 'rest' | 'open' | 'closing',
        wide: false,
        row: null as Element | null,
        timers: new Map<string, ReturnType<typeof setTimeout>>(),
    });

    const later = (name: string, fn: () => void, ms: number) => {
        const { timers } = grow.current;

        clearTimeout(timers.get(name));
        timers.set(name, setTimeout(fn, ms));
    };
    const cancel = (...names: string[]) => {
        for (const name of names) clearTimeout(grow.current.timers.get(name));
    };
    const aside = () => panelRef.current;
    const spacer = (end: 'top' | 'foot') => (end === 'top' ? top.current : foot.current);
    const held = (end: 'top' | 'foot') => spacer(end)?.offsetHeight ?? 0;

    const setSpacers = (sizes: { top: number; foot: number }, ease = false) => {
        for (const end of ['top', 'foot'] as const) {
            const node = spacer(end);

            if (!node) continue;

            node.toggleAttribute('data-easing', ease && !reducedMotion());
            node.style.height = `${sizes[end]}px`;
        }
    };

    const keyboardInside = () =>
        grow.current.keyboard && !!scroller.current?.contains(document.activeElement);

    const anchor = (): Element | null => {
        const box = scroller.current;
        const from = keyboardInside() ? document.activeElement : grow.current.row;

        return box && from && box.contains(from) ? (from.closest(ROW) ?? from) : null;
    };

    // Switches the content's width, keeping the anchor row's top in place.
    const switchLayout = (wide: boolean) => {
        const box = scroller.current;
        const region = aside();

        if (!box || !region) return;

        const row = anchor();
        const before = row
            ? row.getBoundingClientRect().top - box.getBoundingClientRect().top
            : null;

        region.toggleAttribute('data-sp-wide', wide);
        grow.current.wide = wide;

        if (!row || before === null) return;

        const after =
            row.getBoundingClientRect().top -
            box.getBoundingClientRect().top +
            box.scrollTop -
            held('top');
        const content = box.scrollHeight - held('top') - held('foot');
        const hold = holdRow({ before, after, content, viewport: box.clientHeight });

        setSpacers(hold);
        box.scrollTop = hold.scrollTop;
    };

    const dissolveTo = (wide: boolean) => {
        const region = aside();

        if (!region) return;

        if (reducedMotion()) {
            switchLayout(wide);

            return;
        }

        region.setAttribute('data-sp-fade', '');
        later(
            'fade',
            () => {
                switchLayout(wide);
                region.removeAttribute('data-sp-fade');
            },
            FADE_OUT_MS,
        );
    };

    const startGrow = () => {
        const region = aside();

        if (!region) return;

        cancel('shrinkFade', 'shrinkEnd', 'release');
        grow.current.phase = 'open';
        region.setAttribute('data-sp-grow', 'open');

        // A re-entry mid-shrink that kept the wide layout reverses the edge
        // with no dissolve.
        if (!grow.current.wide) dissolveTo(true);
    };

    const release = () => {
        if (grow.current.inside) return;

        setSpacers({ top: 0, foot: 0 }, true);
    };

    const endShrink = () => {
        const region = aside();

        cancel('shrinkFade', 'shrinkEnd');

        if (grow.current.phase !== 'closing' || !region) return;

        if (grow.current.wide) {
            switchLayout(false);
        }

        region.removeAttribute('data-sp-fade');
        region.removeAttribute('data-sp-grow');
        grow.current.phase = 'rest';
        later('release', release, reducedMotion() ? 0 : SPACER_EASE_MS);
    };

    const startShrink = (now = false) => {
        const region = aside();

        if (!region || grow.current.phase !== 'open') return;

        grow.current.phase = 'closing';
        region.setAttribute('data-sp-grow', 'closing');

        if (now || reducedMotion()) {
            endShrink();

            return;
        }

        // The pointer left before the content went wide: the edge just moves.
        if (!grow.current.wide) {
            cancel('fade');
            region.removeAttribute('data-sp-fade');
            later('shrinkEnd', endShrink, EDGE_MS);

            return;
        }

        later('shrinkFade', () => region.setAttribute('data-sp-fade', ''), EDGE_MS - FADE_OUT_MS);
        later('shrinkEnd', endShrink, EDGE_MS + 40);
    };

    const sync = () => {
        const want =
            onPageRef.current && ((grow.current.inside && grow.current.rested) || keyboardInside());

        if (want && grow.current.phase !== 'open') startGrow();
        if (!want && grow.current.phase === 'open') startShrink();
    };

    const onPageRef = useRef(growable);

    const onPageChange = useEffectEvent((shown: boolean) => {
        onPageRef.current = shown;

        if (!shown) startShrink(true);
    });

    useEffect(() => {
        onPageChange(growable);
    }, [growable]);

    const bind = useEffectEvent((box: HTMLDivElement) => {
        const region = aside();
        const onMove = (event: PointerEvent) => {
            if (event.pointerType === 'touch' || !canHover()) return;

            grow.current.inside = true;
            grow.current.row = event.target instanceof Element ? event.target : null;

            if (grow.current.rested) return;

            later(
                'rest',
                () => {
                    grow.current.rested = true;
                    sync();
                },
                GROW_REST_MS,
            );
        };
        const onLeave = (event: PointerEvent) => {
            if (event.pointerType === 'touch') return;

            grow.current.inside = false;
            grow.current.rested = false;
            cancel('rest');
            later('leave', sync, SHRINK_AFTER_MS);
        };
        const onFocusIn = () => later('focus', sync, GROW_REST_MS);
        // The next focused element is known one tick later.
        const onFocusOut = () => later('blur', () => later('leave', sync, SHRINK_AFTER_MS), 0);
        const onKey = (event: KeyboardEvent) => {
            if (!event.metaKey && !event.ctrlKey && !event.altKey) grow.current.keyboard = true;
        };
        const onDown = () => {
            grow.current.keyboard = false;
        };
        const onEdgeEnd = (event: TransitionEvent) => {
            if (event.target === region && event.propertyName === 'width') endShrink();
        };

        box.addEventListener('pointermove', onMove);
        box.addEventListener('pointerenter', onMove);
        box.addEventListener('pointerleave', onLeave);
        box.addEventListener('focusin', onFocusIn);
        box.addEventListener('focusout', onFocusOut);
        region?.addEventListener('transitionend', onEdgeEnd);
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('pointerdown', onDown, true);

        return () => {
            box.removeEventListener('pointermove', onMove);
            box.removeEventListener('pointerenter', onMove);
            box.removeEventListener('pointerleave', onLeave);
            box.removeEventListener('focusin', onFocusIn);
            box.removeEventListener('focusout', onFocusOut);
            region?.removeEventListener('transitionend', onEdgeEnd);
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('pointerdown', onDown, true);
        };
    });

    useEffect(() => {
        const box = scroller.current;
        const timers = grow.current.timers;

        if (!box) return;

        const unbind = bind(box);

        return () => {
            unbind();

            for (const timer of timers.values()) clearTimeout(timer);
        };
    }, []);

    return { scroller, top, foot };
};
