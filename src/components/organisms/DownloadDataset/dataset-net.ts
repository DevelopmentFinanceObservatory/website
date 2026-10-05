// A constellation of squares linked by distance, stirred by a
// virtual cursor on a wavy infinity path. Hex colors on purpose (canvas, no CSS vars).

import { NetNode, NodeBounds, rand, lerp, sizeCanvas } from '@/utils/net';

const COLORS = ['#79796B', '#D8D8CA', '#B4B4A6'];
const NET_LINK_RGB = '178,178,164';

export interface DatasetNetConfig {
    nodeCount: number;
    nodeSize: number;
    clampToBounds?: boolean;
    cursorPullRadius: number;
    flow: number;
    spring: number;
    damping: number;
    drift: number;
    infinityX: number;
    infinityY: number;
    cursorSmooth: number;
    cursorSpeed: number;
    linkDist: number;
    returnStrength: number;
}

export const datasetNetConfig: DatasetNetConfig = {
    nodeCount: 200,
    nodeSize: 5,
    clampToBounds: false,
    cursorPullRadius: 280,
    flow: 0.002,
    spring: 0.001,
    damping: 0.97,
    drift: 0.005,
    infinityX: 0.3,
    infinityY: 0.46,
    cursorSmooth: 0.022,
    cursorSpeed: 0.0038,
    linkDist: 226,
    returnStrength: 0.0011,
};

interface VirtualCursor {
    x: number;
    y: number;
    tx: number;
    ty: number;
}

export function startDatasetNet(
    innerEl: HTMLElement,
    canvasEl: HTMLCanvasElement,
    config: DatasetNetConfig = datasetNetConfig,
): () => void {
    const maybeContext = canvasEl.getContext('2d');

    if (!maybeContext) {
        return () => undefined;
    }

    const context = maybeContext;

    let w = 0;
    let h = 0;
    let t = 0;
    let movePhase = 0;
    let pauseHold = 0;
    let seekingPause = false;
    let nextPauseSide: 0 | 1 = 0;
    let lastFrameTime = performance.now();

    function setSize(): void {
        ({ w, h } = sizeCanvas(innerEl, canvasEl, context));
    }

    setSize();

    const cursor: VirtualCursor = {
        x: w * 0.5,
        y: h * 0.5,
        tx: w * 0.5,
        ty: h * 0.5,
    };

    function nodeMargin(): number {
        return config.nodeSize / 2;
    }

    function getSpawnRange(): NodeBounds {
        const margin = nodeMargin();

        return {
            minX: margin,
            maxX: w - margin,
            minY: margin,
            maxY: h - margin,
        };
    }

    function spawnNode(): NetNode {
        const spawn = config.clampToBounds
            ? getSpawnRange()
            : { minX: 0, maxX: w, minY: 0, maxY: h };
        const x = rand(spawn.minX, spawn.maxX);
        // Triangular distribution: density peaks mid-section, thins out near its edges.
        const y = spawn.minY + ((Math.random() + Math.random()) / 2) * (spawn.maxY - spawn.minY);

        return {
            x,
            y,
            ox: x,
            oy: y,
            vx: 0,
            vy: 0,
            color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
        };
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

    const nodes: NetNode[] = [];

    for (let i = 0; i < config.nodeCount; i++) {
        nodes.push(spawnNode());
    }

    function getPathPosition(time: number): { x: number; y: number } {
        const cx = w * 0.5;
        const cy = h * 0.5;
        const a =
            Math.sin(time * 0.47) * 0.5 +
            Math.sin(time * 0.13) * 0.35 +
            Math.sin(time * 0.031) * 0.15;

        const scaleX =
            w * (config.infinityX + 0.06 * Math.sin(time * 0.11) + 0.03 * Math.sin(time * 0.043));

        const scaleY =
            h * (config.infinityY + 0.05 * Math.sin(time * 0.09) + 0.025 * Math.sin(time * 0.027));

        return {
            x: cx + Math.sin(time) * scaleX,
            y: cy + Math.sin(time * 2 + a) * scaleY,
        };
    }

    function easeInCubic(u: number): number {
        return u * u * u;
    }

    function easeOutCubic(u: number): number {
        const v = 1 - u;

        return 1 - v * v * v;
    }

    function getViewportBoundsInCanvas(): NodeBounds {
        const rect = innerEl.getBoundingClientRect();
        const margin = 52;
        const viewLeft = -rect.left;
        const viewTop = -rect.top;
        const viewRight = viewLeft + window.innerWidth;
        const viewBottom = viewTop + window.innerHeight;

        return {
            minX: Math.max(margin, viewLeft + margin),
            maxX: Math.min(w - margin, viewRight - margin),
            minY: Math.max(margin, viewTop + margin),
            maxY: Math.min(h - margin, viewBottom - margin),
        };
    }

    function isInViewport(x: number, y: number, bounds: NodeBounds): boolean {
        if (bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) return false;

        return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
    }

    function getPauseSide(x: number, viewport: NodeBounds): 0 | 1 {
        const centerX = (viewport.minX + viewport.maxX) * 0.5;

        return x < centerX ? 0 : 1;
    }

    function canPauseHere(x: number, y: number, viewport: NodeBounds): boolean {
        return isInViewport(x, y, viewport) && getPauseSide(x, viewport) === nextPauseSide;
    }

    function beginPause(): void {
        pauseHold = 3.2;
        nextPauseSide = nextPauseSide === 0 ? 1 : 0;
    }

    function moveBurstEnvelope(phase: number): number {
        const accelEnd = 0.22;
        const cruiseEnd = 0.72;
        const cruisePeak = 0.82;

        if (phase < accelEnd) return easeInCubic(phase / accelEnd) * cruisePeak;
        if (phase < cruiseEnd) return cruisePeak;

        return cruisePeak * (1 - easeOutCubic((phase - cruiseEnd) / (1 - cruiseEnd)));
    }

    function applyCursorTarget(followScale: number): void {
        const target = getPathPosition(t);

        cursor.tx = target.x;
        cursor.ty = target.y;
        const follow = config.cursorSmooth * followScale;

        cursor.x = lerp(cursor.x, cursor.tx, follow);
        cursor.y = lerp(cursor.y, cursor.ty, follow);
    }

    function updateCursor(): void {
        const now = performance.now();
        const dt = Math.min(0.05, (now - lastFrameTime) / 1000);

        lastFrameTime = now;

        const viewport = getViewportBoundsInCanvas();
        const currentPos = getPathPosition(t);
        const readyToPause = canPauseHere(currentPos.x, currentPos.y, viewport);

        const burstDuration = 3.4;
        const peakMultiplier = 1.35;
        const seekMultiplier = 1.35;

        if (pauseHold > 0) {
            pauseHold -= dt;
            applyCursorTarget(2.6);

            return;
        }

        if (seekingPause) {
            if (readyToPause) {
                seekingPause = false;
                beginPause();
                applyCursorTarget(2.6);

                return;
            }

            t += config.cursorSpeed * seekMultiplier;
            applyCursorTarget(0.75);

            return;
        }

        const envelope = moveBurstEnvelope(movePhase);

        t += config.cursorSpeed * envelope * peakMultiplier;
        movePhase += dt / burstDuration;

        if (movePhase >= 1) {
            movePhase = 0;

            if (readyToPause) {
                beginPause();
            } else {
                seekingPause = true;
            }
        }

        applyCursorTarget(0.55 + envelope * 0.55);
    }

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

            if (config.clampToBounds) {
                clampNode(n);
                const margin = nodeMargin();

                n.ox = Math.min(Math.max(n.ox, margin), w - margin);
                n.oy = Math.min(Math.max(n.oy, margin), h - margin);
            }
        });

        cursor.x *= sx;
        cursor.y *= sy;
        cursor.tx *= sx;
        cursor.ty *= sy;
    }

    const resizeObserver = new ResizeObserver(resize);

    resizeObserver.observe(innerEl);

    function update(): void {
        updateCursor();

        nodes.forEach((n) => {
            const dx = cursor.x - n.x;
            const dy = cursor.y - n.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < config.cursorPullRadius) {
                const falloff = Math.pow(Math.max(0, 1 - dist / config.cursorPullRadius), 1.75);

                n.vx += dx * config.flow * falloff;
                n.vy += dy * config.flow * falloff;
                n.vx += dx * config.spring * 0.15 * falloff;
                n.vy += dy * config.spring * 0.15 * falloff;
            }

            n.vx += (n.ox - n.x) * config.returnStrength;
            n.vy += (n.oy - n.y) * config.returnStrength;
            n.vx += rand(-config.drift, config.drift);
            n.vy += rand(-config.drift, config.drift);
            n.vx *= config.damping;
            n.vy *= config.damping;
            n.x += n.vx;
            n.y += n.vy;
            if (config.clampToBounds) clampNode(n);
        });
    }

    function drawLinks(): void {
        for (let i = 0; i < nodes.length; i++) {
            const nodeA = nodes[i]!;

            for (let j = i + 1; j < nodes.length; j++) {
                const nodeB = nodes[j]!;
                const dx = nodeA.x - nodeB.x;
                const dy = nodeA.y - nodeB.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist >= config.linkDist) continue;

                const alpha = (1 - dist / config.linkDist) * 0.24;

                context.strokeStyle = `rgba(${NET_LINK_RGB},${alpha})`;
                context.lineWidth = 0.5;
                context.beginPath();
                context.moveTo(nodeA.x, nodeA.y);
                context.lineTo(nodeB.x, nodeB.y);
                context.stroke();
            }
        }
    }

    function drawNodes(): void {
        nodes.forEach((n) => {
            context.fillStyle = n.color;
            context.fillRect(
                n.x - config.nodeSize * 0.5,
                n.y - config.nodeSize * 0.5,
                config.nodeSize,
                config.nodeSize,
            );
        });
    }

    function draw(): void {
        context.clearRect(0, 0, w, h);
        drawLinks();
        drawNodes();
    }

    let frame = 0;

    function loop(): void {
        update();
        draw();
        frame = requestAnimationFrame(loop);
    }

    frame = requestAnimationFrame(loop);

    return () => {
        cancelAnimationFrame(frame);
        resizeObserver.disconnect();
    };
}
