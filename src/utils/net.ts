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
