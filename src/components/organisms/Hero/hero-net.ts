// Drifting squares pulled around by invisible virtual cursors.
// Colors are hex on purpose — canvas can't read CSS vars per frame.

import { NetNode, NodeBounds, rand, sizeCanvas } from '@/utils/net';

const HERO_COLORS = ['#CDCDB6', '#ECECDB', '#E0E0C7'];
const NET_LINK_RGB = '216,216,202';

const NUM_CURSORS = 5;
const CURSOR_PULL_RADIUS = 200;
const CURSOR_PULL_STRENGTH = 0.004;
const CURSOR_SPEED = 2.6;
const DAMPING = 0.96;
const DRIFT = 0.041;
const RETURN_STRENGTH = 0.0008;

/**
 * The canvas is smaller than it was (QA-32 trimmed the hero panels), and the
 * same forces over a shorter cursor path read as squares that barely move.
 * The three knobs below are the motion: `cursorPullStrength` is how hard a
 * passing cursor drags a square, `returnStrength` how insistently it goes
 * home afterwards, `drift` the idle jitter. Raise the first and lower the
 * second for more travel.
 */
export const HERO_NET = {
    nodeCount: 225,
    nodeSize: 180,
    clampToBounds: false,
    spawnPaddingRatio: 0.85,
    cursorCount: 3,
    cursorSpeedMin: 0.9,
    cursorSpeedMax: 2.1,
    cursorPullStrength: 0.0042,
    drift: 0.016,
    returnStrength: 0.0008,
} as const;

interface NetConfig {
    nodeCount: number;
    nodeSize: number;
    clampToBounds?: boolean;
    spawnPaddingRatio?: number;
    cursorCount?: number;
    cursorSpeedMin?: number;
    cursorSpeedMax?: number;
    cursorPullStrength?: number;
    drift?: number;
    returnStrength?: number;
}

interface Cursor {
    x: number;
    y: number;
    vx: number;
    vy: number;
    tx: number;
    ty: number;
    speed: number;
}

export function startHeroNet(
    innerEl: HTMLElement,
    canvasEl: HTMLCanvasElement,
    {
        nodeCount: N,
        nodeSize: NODE_SIZE,
        clampToBounds = true,
        spawnPaddingRatio = 0.85,
        cursorCount = NUM_CURSORS,
        cursorSpeedMin = 0.9,
        cursorSpeedMax = CURSOR_SPEED,
        cursorPullStrength = CURSOR_PULL_STRENGTH,
        drift = DRIFT,
        returnStrength = RETURN_STRENGTH,
    }: NetConfig = HERO_NET,
): { stop: () => void; replay: () => void } {
    const maybeContext = canvasEl.getContext('2d');

    if (!maybeContext) {
        return { stop: () => undefined, replay: () => undefined };
    }

    const context = maybeContext;

    let w = 0;
    let h = 0;

    function setSize(): void {
        ({ w, h } = sizeCanvas(innerEl, canvasEl, context));
    }

    setSize();

    function spawnPadding(): number {
        return clampToBounds ? NODE_SIZE / 2 : NODE_SIZE * spawnPaddingRatio;
    }

    function getSpawnBounds(): NodeBounds {
        const pad = spawnPadding();

        if (clampToBounds) {
            return {
                minX: pad,
                maxX: Math.max(pad, w - pad),
                minY: pad,
                maxY: Math.max(pad, h - pad),
            };
        }

        return {
            minX: -pad,
            maxX: w + pad,
            minY: -pad,
            maxY: h + pad,
        };
    }

    function nodeMargin(): number {
        return Math.min(NODE_SIZE / 2, w / 2, h / 2);
    }

    function clampNode(n: NetNode): void {
        const margin = nodeMargin();

        if (n.x < margin) {
            n.x = margin;
            if (n.vx < 0) n.vx *= -0.3;
        } else if (n.x > w - margin) {
            n.x = w - margin;
            if (n.vx > 0) n.vx *= -0.3;
        }

        if (n.y < margin) {
            n.y = margin;
            if (n.vy < 0) n.vy *= -0.3;
        } else if (n.y > h - margin) {
            n.y = h - margin;
            if (n.vy > 0) n.vy *= -0.3;
        }
    }

    const cursors: Cursor[] = [];
    const initialBounds = getSpawnBounds();

    for (let c = 0; c < cursorCount; c++) {
        cursors.push({
            x: rand(initialBounds.minX, initialBounds.maxX),
            y: rand(initialBounds.minY, initialBounds.maxY),
            vx: 0,
            vy: 0,
            tx: rand(initialBounds.minX, initialBounds.maxX),
            ty: rand(initialBounds.minY, initialBounds.maxY),
            speed: rand(cursorSpeedMin, cursorSpeedMax),
        });
    }

    function updateCursors(): void {
        const bounds = getSpawnBounds();

        cursors.forEach((c) => {
            const dx = c.tx - c.x;
            const dy = c.ty - c.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 12) {
                c.tx = rand(bounds.minX, bounds.maxX);
                c.ty = rand(bounds.minY, bounds.maxY);
            }

            if (dist > 0) {
                c.vx += (dx / dist) * c.speed * 0.08;
                c.vy += (dy / dist) * c.speed * 0.08;
            }

            c.vx *= 0.92;
            c.vy *= 0.92;
            c.x += c.vx;
            c.y += c.vy;
        });
    }

    const nodes: NetNode[] = [];
    const spawnBounds = getSpawnBounds();

    for (let i = 0; i < N; i++) {
        const x = rand(spawnBounds.minX, spawnBounds.maxX);
        const y = rand(spawnBounds.minY, spawnBounds.maxY);

        nodes.push({
            x,
            y,
            ox: x,
            oy: y,
            vx: rand(-0.4, 0.4),
            vy: rand(-0.4, 0.4),
            color: HERO_COLORS[Math.floor(Math.random() * HERO_COLORS.length)]!,
        });
    }

    const links: [number, number][] = [];

    for (let i = 0; i < N; i++) {
        for (let j = 0; j < 2; j++) {
            const t = Math.floor(rand(0, N));
            if (t !== i) links.push([i, t]);
        }
    }

    // --- Entrance: the squares pour in from the bottom-left corner --------
    // Each node flies from just outside the corner to its spawn spot; the
    // delay rides its distance from that corner (a wash sweeping across the
    // panel) plus a little jitter, the flight eases out. Links fade in with
    // their later endpoint. `p` is this frame's eased progress, shared with
    // draw(). Reduced motion skips straight to the settled field.
    const INTRO_FLIGHT_MS = 1000;
    const INTRO_SPREAD_MS = 800;
    const INTRO_JITTER_MS = 220;
    // The squares are the middle box of the hero's 1-2-3 telescope: they
    // pour in after the wrapper's beat (0.35s) and ahead of the text box
    // ($hero-core-delay = 0.85s in Hero.module.scss).
    const INTRO_HOLD_MS = 600;

    const reducedMotion =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const introMaxDist = Math.hypot(w, h) || 1;
    const intro = nodes.map((n) => ({
        delay:
            INTRO_HOLD_MS +
            (Math.hypot(n.ox, h - n.oy) / introMaxDist) * INTRO_SPREAD_MS +
            rand(0, INTRO_JITTER_MS),
        p: reducedMotion ? 1 : 0,
    }));
    let introStart: number | null = null;
    let introDone = reducedMotion;

    // Re-arms the entrance (the section re-entered the viewport): the same
    // flights replay from the corner to the nodes' home spots, on the same
    // delays — so a scroll-back gets the exact load-time choreography.
    const replay = (): void => {
        if (reducedMotion) {
            return;
        }

        introStart = null;
        intro.forEach((flight) => {
            flight.p = 0;
        });
        introDone = false;
    };

    function resize(): void {
        if (w === 0 || h === 0) {
            setSize();
            return;
        }

        const prevW = w;
        const prevH = h;
        setSize();
        const sx = w / prevW;
        const sy = h / prevH;

        nodes.forEach((n) => {
            n.x *= sx;
            n.y *= sy;
            n.ox *= sx;
            n.oy *= sy;

            if (clampToBounds) {
                clampNode(n);
                const margin = nodeMargin();
                n.ox = Math.min(Math.max(n.ox, margin), w - margin);
                n.oy = Math.min(Math.max(n.oy, margin), h - margin);
            }
        });

        cursors.forEach((c) => {
            c.x *= sx;
            c.y *= sy;
            c.tx *= sx;
            c.ty *= sy;
        });
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(innerEl);

    function update(now: number): void {
        updateCursors();

        // The entrance owns a node until its flight lands; physics take over
        // from the exact landing spot (velocities were left untouched).
        if (!introDone) {
            introStart ??= now;

            let allDone = true;

            nodes.forEach((n, i) => {
                const flight = intro[i]!;

                if (flight.p >= 1) {
                    return;
                }

                const t = Math.min(
                    Math.max((now - introStart! - flight.delay) / INTRO_FLIGHT_MS, 0),
                    1,
                );
                const eased = 1 - (1 - t) ** 3;

                flight.p = eased;

                if (t < 1) {
                    allDone = false;
                    n.x = -NODE_SIZE / 2 + (n.ox + NODE_SIZE / 2) * eased;
                    n.y = h + NODE_SIZE / 2 - (h + NODE_SIZE / 2 - n.oy) * eased;
                }
            });

            introDone = allDone;
        }

        nodes.forEach((n, i) => {
            if (!introDone && intro[i]!.p < 1) {
                return;
            }

            let nearestDist = Infinity;
            let nearestCursor: Cursor | undefined;

            for (const c of cursors) {
                const dx = c.x - n.x;
                const dy = c.y - n.y;
                const d = Math.sqrt(dx * dx + dy * dy);

                if (d < nearestDist) {
                    nearestDist = d;
                    nearestCursor = c;
                }
            }

            if (nearestCursor && nearestDist < CURSOR_PULL_RADIUS) {
                const falloff = 1 - nearestDist / CURSOR_PULL_RADIUS;
                const dx = nearestCursor.x - n.x;
                const dy = nearestCursor.y - n.y;
                const dist = Math.max(nearestDist, 0.01);
                n.vx += (dx / dist) * falloff * cursorPullStrength * dist * 0.1;
                n.vy += (dy / dist) * falloff * cursorPullStrength * dist * 0.1;
            } else {
                n.vx += (n.ox - n.x) * returnStrength;
                n.vy += (n.oy - n.y) * returnStrength;
            }

            n.vx += rand(-drift, drift);
            n.vy += rand(-drift, drift);

            n.vx *= DAMPING;
            n.vy *= DAMPING;

            n.x += n.vx;
            n.y += n.vy;
            if (clampToBounds) clampNode(n);
        });
    }

    function draw(): void {
        context.clearRect(0, 0, w, h);

        links.forEach(([a, b]) => {
            const n1 = nodes[a]!;
            const n2 = nodes[b]!;

            // While the entrance runs, a link is only as present as the
            // later of its two endpoints.
            const presence = introDone ? 1 : Math.min(intro[a]!.p, intro[b]!.p);

            if (presence <= 0) {
                return;
            }

            context.strokeStyle = `rgba(${NET_LINK_RGB},${0.25 * presence})`;
            context.lineWidth = 0.5;

            context.beginPath();
            context.moveTo(n1.x, n1.y);
            context.lineTo(n2.x, n2.y);
            context.stroke();
        });

        nodes.forEach((n, i) => {
            // In flight a square grows into its full size as it arrives.
            const size = introDone ? NODE_SIZE : NODE_SIZE * (0.5 + 0.5 * intro[i]!.p);

            context.fillStyle = n.color;
            context.fillRect(n.x - size / 2, n.y - size / 2, size, size);
        });
    }

    let frame = 0;

    function loop(now: number): void {
        update(now);
        draw();
        frame = requestAnimationFrame(loop);
    }

    frame = requestAnimationFrame(loop);

    return {
        stop: () => {
            cancelAnimationFrame(frame);
            resizeObserver.disconnect();
        },
        replay,
    };
}
