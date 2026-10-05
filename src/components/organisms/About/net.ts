/**
 * The web behind the About page's prose, the same field the brochure site at
 * developmentfinance.org runs. Framework-free on purpose: the
 * starter takes a host element and its canvas, runs its own rAF loop, and
 * returns the stop function React's effect cleanup calls.
 *
 * Many small dots that link to whatever is near them, herded by ONE cursor
 * travelling a figure-eight in bursts and pauses, alternating sides of the
 * viewport. (The hero's own mosaic is a different field and lives with the
 * hero — see organisms/Hero/hero-net.ts.)
 */

const TEXT_COLORS = ['#79796B', '#D8D8CA', '#B4B4A6'];
const LINK_RGB = '216,216,202';

type Node = { x: number; y: number; ox: number; oy: number; vx: number; vy: number; color: string };
type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

const rand = (min: number, max: number): number => Math.random() * (max - min) + min;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Every loop is torn down the same way. */
export type StopNet = () => void;

const context2d = (canvas: HTMLCanvasElement): CanvasRenderingContext2D | null =>
    canvas.getContext('2d');

// ---------------------------------------------------------------------------
// The web behind the text
// ---------------------------------------------------------------------------

const TEXT = {
    nodeCount: 320,
    nodeSize: 6,
    cursorPullRadius: 182,
    flow: 0.0041,
    spring: 0.0018,
    damping: 0.958,
    drift: 0.008,
    infinityX: 0.3,
    infinityY: 0.46,
    cursorSmooth: 0.034,
    cursorSpeed: 0.0062,
    linkDist: 226,
    returnStrength: 0.0013,
};

export const startTextNet = (host: HTMLElement, canvas: HTMLCanvasElement): StopNet => {
    const context = context2d(canvas);

    if (!context) {
        return () => {};
    }

    let w = 0;
    let h = 0;
    let frame = 0;
    // The cursor's own clock — it only advances while the cursor is moving,
    // which is what makes the pauses read as stillness rather than a stall.
    let t = 0;
    let movePhase = 0;
    let pauseHold = 0;
    let seeking = false;
    let nextPauseSide: 0 | 1 = 0;
    let lastFrame = performance.now();

    const setSize = () => {
        w = host.clientWidth;
        h = host.clientHeight;
        canvas.width = w;
        canvas.height = h;
    };

    setSize();

    const cursor = { x: w * 0.5, y: h * 0.5, tx: w * 0.5, ty: h * 0.5 };
    const nodes: Node[] = [];

    for (let index = 0; index < TEXT.nodeCount; index += 1) {
        const x = rand(0, w);
        const y = rand(0, h);

        nodes.push({
            x,
            y,
            ox: x,
            oy: y,
            vx: 0,
            vy: 0,
            color: TEXT_COLORS[Math.floor(Math.random() * TEXT_COLORS.length)],
        });
    }

    // A wandering figure-eight: three sine terms detune the loop so it never
    // repeats the same path twice.
    const pathAt = (time: number) => {
        const a =
            Math.sin(time * 0.47) * 0.5 +
            Math.sin(time * 0.13) * 0.35 +
            Math.sin(time * 0.031) * 0.15;
        const scaleX =
            w * (TEXT.infinityX + 0.06 * Math.sin(time * 0.11) + 0.03 * Math.sin(time * 0.043));
        const scaleY =
            h * (TEXT.infinityY + 0.05 * Math.sin(time * 0.09) + 0.025 * Math.sin(time * 0.027));

        return {
            x: w * 0.5 + Math.sin(time) * scaleX,
            y: h * 0.5 + Math.sin(time * 2 + a) * scaleY,
        };
    };

    // Where the canvas meets the window right now — the cursor only rests
    // somewhere the reader can actually see.
    const viewportBounds = (): Bounds => {
        const rect = host.getBoundingClientRect();
        const margin = 52;
        const left = -rect.left;
        const top = -rect.top;

        return {
            minX: Math.max(margin, left + margin),
            maxX: Math.min(w - margin, left + window.innerWidth - margin),
            minY: Math.max(margin, top + margin),
            maxY: Math.min(h - margin, top + window.innerHeight - margin),
        };
    };

    const canPause = (x: number, y: number, view: Bounds): boolean => {
        if (view.maxX <= view.minX || view.maxY <= view.minY) {
            return false;
        }

        const inside = x >= view.minX && x <= view.maxX && y >= view.minY && y <= view.maxY;
        const side = x < (view.minX + view.maxX) * 0.5 ? 0 : 1;

        return inside && side === nextPauseSide;
    };

    const aimCursor = (followScale: number) => {
        const target = pathAt(t);

        cursor.tx = target.x;
        cursor.ty = target.y;
        cursor.x = lerp(cursor.x, cursor.tx, TEXT.cursorSmooth * followScale);
        cursor.y = lerp(cursor.y, cursor.ty, TEXT.cursorSmooth * followScale);
    };

    // Accelerate, cruise, ease off — one burst of travel between rests.
    const burstEnvelope = (phase: number): number => {
        const peak = 0.82;

        if (phase < 0.22) {
            return (phase / 0.22) ** 3 * peak;
        }

        if (phase < 0.72) {
            return peak;
        }

        const u = (phase - 0.72) / 0.28;

        return peak * (1 - (1 - (1 - u) ** 3));
    };

    const updateCursor = () => {
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastFrame) / 1000);

        lastFrame = now;

        const view = viewportBounds();
        const here = pathAt(t);
        const ready = canPause(here.x, here.y, view);

        if (pauseHold > 0) {
            pauseHold -= dt;
            aimCursor(2.6);

            return;
        }

        if (seeking) {
            if (ready) {
                seeking = false;
                pauseHold = 2.2;
                nextPauseSide = nextPauseSide === 0 ? 1 : 0;
                aimCursor(2.6);

                return;
            }

            t += TEXT.cursorSpeed * 1.73;
            aimCursor(0.75);

            return;
        }

        const envelope = burstEnvelope(movePhase);

        t += TEXT.cursorSpeed * envelope * 1.76;
        movePhase += dt / 2.35;

        if (movePhase >= 1) {
            movePhase = 0;

            if (ready) {
                pauseHold = 2.2;
                nextPauseSide = nextPauseSide === 0 ? 1 : 0;
            } else {
                seeking = true;
            }
        }

        aimCursor(0.55 + envelope * 0.55);
    };

    const resize = () => {
        if (w === 0 || h === 0) {
            setSize();

            return;
        }

        const prevW = w;
        const prevH = h;

        setSize();
        const sx = w / prevW;
        const sy = h / prevH;

        nodes.forEach((node) => {
            node.x *= sx;
            node.y *= sy;
            node.ox *= sx;
            node.oy *= sy;
        });
        cursor.x *= sx;
        cursor.y *= sy;
        cursor.tx *= sx;
        cursor.ty *= sy;
    };

    const observer = new ResizeObserver(resize);

    observer.observe(host);

    const update = () => {
        updateCursor();

        nodes.forEach((node) => {
            const dx = cursor.x - node.x;
            const dy = cursor.y - node.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < TEXT.cursorPullRadius) {
                const falloff = Math.max(0, 1 - dist / TEXT.cursorPullRadius) ** 1.75;

                node.vx += dx * TEXT.flow * falloff + dx * TEXT.spring * 0.15 * falloff;
                node.vy += dy * TEXT.flow * falloff + dy * TEXT.spring * 0.15 * falloff;
            }

            node.vx += (node.ox - node.x) * TEXT.returnStrength;
            node.vy += (node.oy - node.y) * TEXT.returnStrength;
            node.vx += rand(-TEXT.drift, TEXT.drift);
            node.vy += rand(-TEXT.drift, TEXT.drift);
            node.vx *= TEXT.damping;
            node.vy *= TEXT.damping;
            node.x += node.vx;
            node.y += node.vy;
        });
    };

    const draw = () => {
        context.clearRect(0, 0, w, h);
        context.lineWidth = 0.5;

        // Proximity links: the closer the pair, the more solid the thread.
        for (let i = 0; i < nodes.length; i += 1) {
            for (let j = i + 1; j < nodes.length; j += 1) {
                const dx = nodes[i].x - nodes[j].x;
                const dy = nodes[i].y - nodes[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist >= TEXT.linkDist) {
                    continue;
                }

                context.strokeStyle = `rgba(${LINK_RGB},${(1 - dist / TEXT.linkDist) * 0.16})`;
                context.beginPath();
                context.moveTo(nodes[i].x, nodes[i].y);
                context.lineTo(nodes[j].x, nodes[j].y);
                context.stroke();
            }
        }

        // Dots that drift under the text column shrink, so the prose keeps
        // its contrast where the two overlap.
        const fadeFrom = w * 0.85;
        const fadeTo = fadeFrom + w * 0.04;

        nodes.forEach((node) => {
            const underText = node.x >= fadeFrom && node.y >= h * 0.0975 && node.y <= h * 0.9025;
            const size = underText
                ? TEXT.nodeSize *
                  (node.x < fadeTo
                      ? lerp(1, 0.72, (node.x - fadeFrom) / (fadeTo - fadeFrom))
                      : 0.72)
                : TEXT.nodeSize;

            context.fillStyle = node.color;
            context.fillRect(node.x - size * 0.5, node.y - size * 0.5, size, size);
        });
    };

    const loop = () => {
        update();
        draw();
        frame = requestAnimationFrame(loop);
    };

    loop();

    return () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
    };
};
