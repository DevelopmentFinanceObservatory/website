export interface NetNode {
    x: number;
    y: number;
    ox: number;
    oy: number;
    vx: number;
    vy: number;
    color: string;
}

export interface NodeBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export function rand(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function sizeCanvas(
    innerEl: HTMLElement,
    canvasEl: HTMLCanvasElement,
    context: CanvasRenderingContext2D,
): { w: number; h: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = innerEl.clientWidth;
    const h = innerEl.clientHeight;

    canvasEl.width = Math.round(w * dpr);
    canvasEl.height = Math.round(h * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    return { w, h };
}

/**
 * Calls `frame` once per animation frame while `target` overlaps the viewport,
 * `sizedEl` (when given) has a non-zero rendered size, and the tab is visible,
 * and calls nothing otherwise, so a net costs no main thread while nobody can
 * see it. `sizedEl` covers a canvas host that CSS hides with `display: none`
 * at some widths: its size drops to zero and the loop stops, and it starts
 * again when a resize brings the host back. The clock handed to `frame`
 * excludes the spans where `target` was off screen or `sizedEl` had no size,
 * so a net resumes from the frame it stopped on; a hidden tab does not stop
 * the clock, as with a bare requestAnimationFrame. `onReturn` runs when
 * `target` comes back after leaving the viewport entirely. Returns the stop
 * function.
 */
export function runWhileSeen(
    target: Element,
    frame: (now: number) => void,
    onReturn?: () => void,
    sizedEl?: Element,
): () => void {
    let handle = 0;
    let onScreen = false;
    // A ResizeObserver reports nothing for an element that starts at zero
    // size, so an observed host counts as unsized until its first report.
    let sized = sizedEl === undefined;
    let wasOut = false;
    // The net's clock: frame time minus every unseen span. It stands still
    // while `target` is off screen or `sizedEl` has no size, so the first frame after the reader
    // scrolls back repeats the last time. Hidden-tab pauses keep it running.
    let clock = performance.now();
    let offset = 0;
    let resuming = true;
    let offScreenSince = 0;

    function tick(now: number): void {
        if (resuming) {
            if (offScreenSince !== 0) {
                offset += now - offScreenSince;
                offScreenSince = 0;
            }

            resuming = false;
        }

        clock = now - offset;
        frame(clock);
        handle = requestAnimationFrame(tick);
    }

    function sync(): void {
        const shown = onScreen && sized;
        const run = shown && document.visibilityState === 'visible';

        if (!shown && offScreenSince === 0) {
            offScreenSince = performance.now();
        }

        if (run && handle === 0) {
            resuming = true;
            handle = requestAnimationFrame(tick);
        } else if (!run && handle !== 0) {
            cancelAnimationFrame(handle);
            handle = 0;
        }
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            onScreen = entry.isIntersecting;

            if (!entry.isIntersecting) {
                wasOut = true;
            } else if (wasOut) {
                wasOut = false;
                onReturn?.();
            }
        });
        sync();
    });

    observer.observe(target);

    let sizeObserver: ResizeObserver | null = null;

    if (sizedEl !== undefined) {
        sizeObserver = new ResizeObserver((entries) => {
            const box = entries[entries.length - 1]!.contentRect;

            sized = box.width > 0 && box.height > 0;
            sync();
        });
        sizeObserver.observe(sizedEl);
    }

    document.addEventListener('visibilitychange', sync);

    return () => {
        cancelAnimationFrame(handle);
        handle = 0;
        observer.disconnect();
        sizeObserver?.disconnect();
        document.removeEventListener('visibilitychange', sync);
    };
}

export type LinkBatches = {
    /** Queues a segment at `strength` (0 to 1) of the full alpha. */
    add: (strength: number, x1: number, y1: number, x2: number, y2: number) => void;
    /** Strokes every queued level, then empties the queues. */
    stroke: (context: CanvasRenderingContext2D) => void;
};

/**
 * Collects line segments into a fixed number of alpha levels and strokes each
 * level as one path, so a frame makes at most `levels` stroke calls however
 * many links it draws. The style strings are built once.
 */
export function createLinkBatches(rgb: string, maxAlpha: number, levels: number): LinkBatches {
    const styles = Array.from(
        { length: levels + 1 },
        (_, level) => `rgba(${rgb},${(maxAlpha * level) / levels})`,
    );
    const segments: number[][] = styles.map(() => []);

    return {
        add(strength: number, x1: number, y1: number, x2: number, y2: number): void {
            const level = Math.min(levels, Math.round(strength * levels));

            if (level < 1) {
                return;
            }

            segments[level]!.push(x1, y1, x2, y2);
        },
        stroke(context: CanvasRenderingContext2D): void {
            for (let level = 1; level <= levels; level++) {
                const queued = segments[level]!;

                if (queued.length === 0) {
                    continue;
                }

                context.strokeStyle = styles[level]!;
                context.beginPath();

                for (let k = 0; k < queued.length; k += 4) {
                    context.moveTo(queued[k]!, queued[k + 1]!);
                    context.lineTo(queued[k + 2]!, queued[k + 3]!);
                }

                context.stroke();
                queued.length = 0;
            }
        },
    };
}
