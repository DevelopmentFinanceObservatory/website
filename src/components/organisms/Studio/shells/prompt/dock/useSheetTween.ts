import {
    Component,
    createElement,
    type RefObject,
    useCallback,
    useLayoutEffect,
    useRef,
} from 'react';

import { sheetTweenDuration } from '@/lib/studio/promptShell';

// Marks the outgoing copy inside `.upper`, so a later snapshot leaves it out.
const COPY = 'data-dock-tween-copy';

const FADE_IN = 150;
const FADE_OUT = 80;
// The incoming content starts to show this long into a growing tween, and
// shows over the last FOLD_FADE of a shrinking one.
const OPEN_DELAY = 40;
const FOLD_FADE = 140;

/** `.upper` as drawn just before React commits a change of sheet. */
type Snapshot = {
    height: number;
    // Focus mode held the box, or was folding it, before the change.
    focus: boolean;
    // Inert, id-stripped, and not yet in the document.
    copy: HTMLElement;
    // The scroll offsets of the copy's scrolled parts, applied once it is drawn.
    scrolls: [Element, number, number][];
    // `.upper`'s own children, to tell what React kept from what it drew anew.
    before: Element[];
};

type Tween = {
    upper: HTMLElement;
    animations: Animation[];
    copy: HTMLElement | null;
    pinned: HTMLElement[];
    // While true the dock's measure waits: the heights it reads are mid-tween.
    held: boolean;
};

const takeSnapshot = (upper: HTMLElement): Snapshot | null => {
    const copy = upper.cloneNode(true);

    if (!(copy instanceof HTMLElement)) {
        return null;
    }

    // cloneNode keeps the tree's order, so the two lists pair index for index.
    const from = upper.querySelectorAll('*');
    const to = copy.querySelectorAll('*');
    const scrolls: Snapshot['scrolls'] = [];

    from.forEach((part, index) => {
        if ((part.scrollTop || part.scrollLeft) && !part.closest(`[${COPY}]`)) {
            scrolls.push([to[index], part.scrollTop, part.scrollLeft]);
        }
    });

    copy.querySelectorAll(`[${COPY}]`).forEach((part) => part.remove());
    copy.querySelectorAll('[id]').forEach((part) => part.removeAttribute('id'));
    // PromptDock.tsx finds focus counterparts by `data-dock`.
    copy.querySelectorAll('[data-dock]').forEach((part) => part.removeAttribute('data-dock'));
    copy.removeAttribute('data-tween');
    copy.setAttribute(COPY, '');
    copy.setAttribute('aria-hidden', 'true');
    copy.inert = true;

    return {
        height: upper.getBoundingClientRect().height,
        focus: !!upper.closest('[data-focus]'),
        copy,
        scrolls,
        before: Array.from(upper.children).filter((child) => !child.hasAttribute(COPY)),
    };
};

/** Undoes every trace of a tween: its animations, its copy, its pins. */
const unpin = (tween: Tween) => {
    tween.held = false;
    tween.upper.removeAttribute('data-tween');
    tween.pinned.forEach((part) => part.style.removeProperty('flex'));
    tween.pinned = [];
};

const stop = (live: RefObject<Tween | null>) => {
    const tween = live.current;

    live.current = null;

    if (tween) {
        tween.animations.forEach((animation) => animation.cancel());
        tween.copy?.remove();
        unpin(tween);
    }
};

type SnapshotProps = {
    sheet: string;
    upper: RefObject<HTMLElement | null>;
    onChange: (snapshot: Snapshot) => void;
};

/**
 * Hands `.upper` as drawn before a change of sheet to `onChange`, after the
 * change commits. A class component: no hook runs before React's DOM writes,
 * and getSnapshotBeforeUpdate does.
 */
class SheetSnapshot extends Component<SnapshotProps> {
    getSnapshotBeforeUpdate(previous: SnapshotProps): Snapshot | null {
        const upper = this.props.upper.current;

        return previous.sheet !== this.props.sheet && upper ? takeSnapshot(upper) : null;
    }

    componentDidUpdate(_props: SnapshotProps, _state: unknown, snapshot: Snapshot | null) {
        if (snapshot) {
            this.props.onChange(snapshot);
        }
    }

    render() {
        return null;
    }
}

const isScale = (animation: Animation) =>
    animation instanceof CSSTransition && animation.transitionProperty === 'scale';

/**
 * Tweens the height of the dock's region above the field (`.upper`) when
 * its sheet changes, with the box's foot fixed. The incoming content stands
 * at its final size against the region's foot, and the region clips it; a
 * copy of the outgoing content fades out above it. Render `snapshot` in the
 * dock, and have the dock's measure wait while `held()` is true; `onSettle`
 * measures the dock, once as a tween starts (at its final layout) and once
 * as it ends.
 */
export const useSheetTween = ({
    sheet,
    frameRef,
    upperRef,
    rootRef,
    focus,
    onSettle,
}: {
    sheet: string;
    frameRef: RefObject<HTMLElement | null>;
    upperRef: RefObject<HTMLElement | null>;
    rootRef: RefObject<HTMLElement | null>;
    focus: boolean;
    onSettle: () => void;
}) => {
    const live = useRef<Tween | null>(null);

    const start = (snapshot: Snapshot) => {
        const running = live.current !== null;

        stop(live);

        const upper = upperRef.current;
        const frame = frameRef.current;
        const box = upper?.parentElement;

        if (
            !upper ||
            !frame ||
            !box ||
            snapshot.focus ||
            rootRef.current?.hasAttribute('data-transition') ||
            frame.hasAttribute('data-focus') ||
            box.getAnimations().some(isScale)
        ) {
            if (running) {
                onSettle();
            }

            return;
        }

        const to = upper.getBoundingClientRect().height;
        const duration = sheetTweenDuration(snapshot.height, to);

        if (!duration) {
            if (running) {
                onSettle();
            }

            return;
        }

        const children = Array.from(upper.children).filter(
            (child): child is HTMLElement => child instanceof HTMLElement,
        );
        const incoming = children.filter((child) => !snapshot.before.includes(child));
        const fadeIn = (delay: number, time: number) =>
            incoming.map((child) =>
                child.animate([{ opacity: 0 }, { opacity: 1 }], {
                    duration: time,
                    delay,
                    easing: 'ease',
                    fill: 'backwards',
                }),
            );

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            live.current = {
                upper,
                animations: fadeIn(0, FADE_IN),
                copy: null,
                pinned: [],
                held: false,
            };

            return;
        }

        // The root's heights take their final values here, at the final layout.
        onSettle();

        // Each child keeps its final height while the region's height moves.
        const heights = children.map((child) => child.getBoundingClientRect().height);

        children.forEach((child, index) =>
            child.style.setProperty('flex', `0 0 ${heights[index]}px`),
        );
        upper.setAttribute('data-tween', '');

        const { copy } = snapshot;

        // What React kept shows in place; the copy shows only what left.
        snapshot.before.forEach((child, index) => {
            const part = copy.children[index];

            if (child.parentElement === upper && part instanceof HTMLElement) {
                part.style.visibility = 'hidden';
            }
        });
        Object.assign(copy.style, {
            position: 'absolute',
            inset: 'auto 0 0',
            height: `${snapshot.height}px`,
            maxHeight: 'none',
            margin: '0',
            border: '0',
            overflow: 'clip',
            pointerEvents: 'none',
        });
        upper.append(copy);
        snapshot.scrolls.forEach(([part, top, left]) => part.scrollTo({ top, left }));

        const easing = getComputedStyle(frame).getPropertyValue('--dock-ease').trim() || 'ease-out';
        const height = upper.animate([{ height: `${snapshot.height}px` }, { height: `${to}px` }], {
            duration,
            easing,
        });
        const out = copy.animate([{ opacity: 1 }, { opacity: 0 }], {
            duration: FADE_OUT,
            easing: 'ease',
            fill: 'forwards',
        });
        const opening = to > snapshot.height;
        const tween: Tween = {
            upper,
            animations: [
                height,
                out,
                ...(opening
                    ? fadeIn(OPEN_DELAY, FADE_IN)
                    : fadeIn(Math.max(0, duration - FOLD_FADE), FOLD_FADE)),
            ],
            copy,
            pinned: children,
            held: true,
        };

        out.onfinish = () => copy.remove();
        height.onfinish = () => {
            if (live.current === tween) {
                unpin(tween);
                onSettle();
            }
        };
        live.current = tween;
    };

    // Focus mode folds the box at its resting layout.
    useLayoutEffect(() => {
        if (focus) {
            stop(live);
        }
    }, [focus]);

    useLayoutEffect(() => () => stop(live), []);

    const held = useCallback(() => live.current?.held ?? false, []);

    return {
        // SheetSnapshot reads the ref and calls `start` in its commit
        // lifecycle methods, after render.
        // eslint-disable-next-line react-hooks/refs
        snapshot: createElement(SheetSnapshot, { sheet, upper: upperRef, onChange: start }),
        held,
    };
};
