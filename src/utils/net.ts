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
 * Calls `frame` once per animation frame while `target` overlaps the viewport
 * and the tab is visible, and calls nothing otherwise, so a net costs no main
 * thread while nobody can see it. The clock handed to `frame` excludes the
 * paused spans, so a net resumes from the frame it stopped on. `onReturn`
 * runs when `target` comes back after leaving the viewport entirely. Returns
 * the stop function.
 */
export function runWhileSeen(
    target: Element,
    frame: (now: number) => void,
    onReturn?: () => void,
): () => void {
    let handle = 0;
    let onScreen = false;
    let wasOut = false;
    // The net's clock: frame time minus every paused span. It stands still
    // across a pause, so the first frame after a resume repeats the last time.
    let clock = performance.now();
    let offset = 0;
    let resuming = true;

    function tick(now: number): void {
        if (resuming) {
            offset = now - clock;
            resuming = false;
        }

        clock = now - offset;
        frame(clock);
        handle = requestAnimationFrame(tick);
    }

    function sync(): void {
        const run = onScreen && document.visibilityState === 'visible';

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
    document.addEventListener('visibilitychange', sync);

    return () => {
        cancelAnimationFrame(handle);
        handle = 0;
        observer.disconnect();
        document.removeEventListener('visibilitychange', sync);
    };
}

export interface LinkBatches {
    /** Queues a segment at `strength` (0 to 1) of the full alpha. */
    add: (strength: number, x1: number, y1: number, x2: number, y2: number) => void;
    /** Strokes every queued level, then empties the queues. */
    stroke: (context: CanvasRenderingContext2D) => void;
}

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
            const level = Math.min(levels, Math.max(1, Math.round(strength * levels)));

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
