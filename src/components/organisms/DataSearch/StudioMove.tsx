'use client';

import classNames from 'classnames';
import {
    type AnimationEvent,
    type FocusEvent,
    useEffect,
    useEffectEvent,
    useRef,
    useState,
    useSyncExternalStore,
} from 'react';

import styles from './DataSearch.module.scss';

import Button from '@/components/atoms/Button/Button';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

/** How long the automatic move holds its callout before Studio opens: the
 *  time to see the move coming, and the window in which the reader can
 *  stay. The line under the callout's title fills over it. */
export const MOVE_HOLD_MS = 1200;

const subscribeVisibility = (listener: () => void) => {
    document.addEventListener('visibilitychange', listener);

    return () => document.removeEventListener('visibilitychange', listener);
};

/** What a search shows while the search API's router moves the question to
 *  Studio (a route in `auto` mode). The loading view stays, with this in
 *  its status line's place, from the declined answer until Studio's sheet
 *  covers the page. Its button keeps the reader on the data search
 *  (`onStay`).
 *
 *  The line under the title is the hold's clock. Once `armed` and the
 *  callout's entrance has ended, one linear animation fills it over
 *  MOVE_HOLD_MS (under reduced motion it sits full and its opacity ramps
 *  instead). `onStart` runs once, when the fill first plays, and
 *  `onElapsed` once it ends.
 *  The pointer over the callout, focus inside it or a hidden tab pauses it
 *  in place, and it resumes with the time it had left. */
const StudioMove = ({
    armed,
    onStart,
    onElapsed,
    onStay,
}: {
    armed: boolean;
    onStart: () => void;
    onElapsed: () => void;
    onStay: () => void;
}) => {
    const [entered, setEntered] = useState(false);
    const [pointerIn, setPointerIn] = useState(false);
    const [focusIn, setFocusIn] = useState(false);
    const hidden = useSyncExternalStore(
        subscribeVisibility,
        () => document.hidden,
        () => false,
    );
    const reducedMotion = usePrefersReducedMotion();
    const held = pointerIn || focusIn;
    const fill = useRef<HTMLDivElement>(null);
    const clock = useRef<Animation | null>(null);
    // onStart runs once per mount, on the fill's first frame of play, so a
    // clock that arms paused (a hidden tab, the pointer on the callout)
    // waits for its release. Strict Mode's second run of the clock's effect
    // cancels the first clock, whose `ready` then rejects.
    const started = useRef(false);
    const startOnPlay = useEffectEvent((animation: Animation) => {
        animation.ready.then(
            () => {
                if (animation.playState === 'running' && !started.current) {
                    started.current = true;
                    onStart();
                }
            },
            () => {},
        );
    });
    const paused = useEffectEvent(() => held || hidden);
    // Read as the clock starts, so a change of setting mid-hold leaves the
    // running clock alone.
    const keyframes = useEffectEvent((): Keyframe[] =>
        reducedMotion ? [{ opacity: 0.2 }, { opacity: 1 }] : [{ scale: '0 1' }, { scale: '1 1' }],
    );
    const elapse = useEffectEvent(onElapsed);

    useEffect(() => {
        const line = fill.current;

        if (!armed || !entered || !line) {
            return;
        }

        const animation = line.animate(keyframes(), {
            duration: MOVE_HOLD_MS,
            easing: 'linear',
            fill: 'forwards',
        });

        clock.current = animation;

        if (paused()) {
            animation.pause();
        } else {
            startOnPlay(animation);
        }

        animation.finished.then(
            () => elapse(),
            // cancel() rejects `finished`: the clock stopped mid-hold.
            () => {},
        );

        return () => {
            clock.current = null;
            animation.cancel();
        };
    }, [armed, entered]);

    useEffect(() => {
        const animation = clock.current;

        if (!animation) {
            return;
        }

        if (held || hidden) {
            animation.pause();
        } else if (animation.playState === 'paused') {
            // play() on a finished animation would start it again from empty.
            animation.play();
            startOnPlay(animation);
        }
    }, [held, hidden]);

    return (
        <div
            className={classNames(styles.callout, styles.studioMove)}
            data-held={held || undefined}
            onAnimationEnd={(event: AnimationEvent<HTMLDivElement>) => {
                if (event.target === event.currentTarget) {
                    setEntered(true);
                }
            }}
            onPointerEnter={() => setPointerIn(true)}
            onPointerLeave={() => setPointerIn(false)}
            onFocus={() => setFocusIn(true)}
            onBlur={(event: FocusEvent<HTMLDivElement>) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                    setFocusIn(false);
                }
            }}
        >
            <p className={styles.calloutTitle}>Taking this to Studio.</p>
            <div className={styles.moveTrack} aria-hidden="true">
                <div ref={fill} className={styles.moveFill} />
            </div>
            <p className={styles.calloutText}>
                It needs analysis. Studio plans it, runs it and shows the working.
            </p>
            <Button variant="outline" onClick={onStay}>
                Stay on Get Data
            </Button>
        </div>
    );
};

export default StudioMove;
