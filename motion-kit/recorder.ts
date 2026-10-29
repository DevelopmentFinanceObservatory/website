/**
 * A 2D canvas context that draws nothing and writes down what it was asked
 * to draw: every stroked or filled path as SVG path data in canvas px, and
 * every piece of text with its place, angle, font and alignment. Chart.js
 * draws into it, so the SVG built from the record is Chart.js's own layout.
 *
 * It covers the part of CanvasRenderingContext2D that Chart.js's bar and
 * line charts use. Clipping is recorded as nothing: the shapes Chart.js clips
 * already sit inside the plot.
 */

type Matrix = [a: number, b: number, c: number, d: number, e: number, f: number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

type Style = {
    matrix: Matrix;
    fillStyle: unknown;
    strokeStyle: unknown;
    lineWidth: number;
    lineCap: CanvasLineCap;
    lineJoin: CanvasLineJoin;
    lineDash: number[];
    globalAlpha: number;
    font: string;
    textAlign: CanvasTextAlign;
    textBaseline: CanvasTextBaseline;
};

export type Shape = {
    kind: 'fill' | 'stroke';
    d: string;
    // The fill or stroke as Chart.js set it: a colour, or whatever the
    // dataset's fill callback returned.
    paint: unknown;
    lineWidth: number;
    lineCap: CanvasLineCap;
    lineJoin: CanvasLineJoin;
    lineDash: number[];
    alpha: number;
    // The drawn length of a stroked path, every subpath summed.
    length: number;
    // Which dataset was drawing, or null for the scales.
    dataset: number | null;
};

export type Text = {
    text: string;
    x: number;
    y: number;
    // Radians, clockwise, as the context was rotated.
    rotation: number;
    font: string;
    color: unknown;
    align: CanvasTextAlign;
    baseline: CanvasTextBaseline;
};

/** A pattern made from a recorded tile: what `createPattern` hands back. Its
 *  string tag is the one Chart.js checks for to leave a fill alone. */
export class RecordedPattern {
    readonly width: number;
    readonly height: number;
    readonly shapes: Shape[];

    constructor(width: number, height: number, shapes: Shape[]) {
        this.width = width;
        this.height = height;
        this.shapes = shapes;
    }

    get [Symbol.toStringTag](): string {
        return 'CanvasPattern';
    }
}

const round = (value: number) => Math.round(value * 100) / 100;

const multiply = (m: Matrix, n: Matrix): Matrix => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
];

type Point = { x: number; y: number };

export class RecordingContext {
    canvas: unknown;
    shapes: Shape[] = [];
    texts: Text[] = [];
    // Set by the drawing plugin around each dataset's draw.
    dataset: number | null = null;

    private state: Style = {
        matrix: IDENTITY,
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        lineDash: [],
        globalAlpha: 1,
        font: '10px sans-serif',
        textAlign: 'start',
        textBaseline: 'alphabetic',
    };
    private stack: Style[] = [];
    private path: string[] = [];
    private length = 0;
    private current: Point | null = null;
    private start: Point | null = null;

    // Properties Chart.js sets but the record has no use for.
    lineDashOffset = 0;
    miterLimit = 10;
    globalCompositeOperation = 'source-over';
    imageSmoothingEnabled = true;
    shadowBlur = 0;
    shadowColor = 'transparent';
    shadowOffsetX = 0;
    shadowOffsetY = 0;
    direction: CanvasDirection = 'inherit';

    private readonly measure: (font: string, text: string) => number;

    constructor(measure: (font: string, text: string) => number) {
        this.measure = measure;
    }

    clear(): void {
        this.shapes = [];
        this.texts = [];
    }

    // --- state --------------------------------------------------------------

    save(): void {
        this.stack.push({ ...this.state, lineDash: [...this.state.lineDash] });
    }

    restore(): void {
        this.state = this.stack.pop() ?? this.state;
    }

    get fillStyle(): unknown {
        return this.state.fillStyle;
    }

    set fillStyle(value: unknown) {
        this.state.fillStyle = value;
    }

    get strokeStyle(): unknown {
        return this.state.strokeStyle;
    }

    set strokeStyle(value: unknown) {
        this.state.strokeStyle = value;
    }

    get lineWidth(): number {
        return this.state.lineWidth;
    }

    set lineWidth(value: number) {
        this.state.lineWidth = value;
    }

    get lineCap(): CanvasLineCap {
        return this.state.lineCap;
    }

    set lineCap(value: CanvasLineCap) {
        this.state.lineCap = value;
    }

    get lineJoin(): CanvasLineJoin {
        return this.state.lineJoin;
    }

    set lineJoin(value: CanvasLineJoin) {
        this.state.lineJoin = value;
    }

    get globalAlpha(): number {
        return this.state.globalAlpha;
    }

    set globalAlpha(value: number) {
        this.state.globalAlpha = value;
    }

    get font(): string {
        return this.state.font;
    }

    set font(value: string) {
        this.state.font = value;
    }

    get textAlign(): CanvasTextAlign {
        return this.state.textAlign;
    }

    set textAlign(value: CanvasTextAlign) {
        this.state.textAlign = value;
    }

    get textBaseline(): CanvasTextBaseline {
        return this.state.textBaseline;
    }

    set textBaseline(value: CanvasTextBaseline) {
        this.state.textBaseline = value;
    }

    setLineDash(segments: number[]): void {
        this.state.lineDash = [...segments];
    }

    getLineDash(): number[] {
        return [...this.state.lineDash];
    }

    // --- transform ----------------------------------------------------------

    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
        this.state.matrix = [a, b, c, d, e, f];
    }

    resetTransform(): void {
        this.state.matrix = IDENTITY;
    }

    translate(x: number, y: number): void {
        this.state.matrix = multiply(this.state.matrix, [1, 0, 0, 1, x, y]);
    }

    rotate(angle: number): void {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        this.state.matrix = multiply(this.state.matrix, [cos, sin, -sin, cos, 0, 0]);
    }

    scale(x: number, y: number): void {
        this.state.matrix = multiply(this.state.matrix, [x, 0, 0, y, 0, 0]);
    }

    private apply(x: number, y: number): Point {
        const [a, b, c, d, e, f] = this.state.matrix;

        return { x: a * x + c * y + e, y: b * x + d * y + f };
    }

    // --- paths --------------------------------------------------------------

    beginPath(): void {
        this.path = [];
        this.length = 0;
        this.current = null;
        this.start = null;
    }

    moveTo(x: number, y: number): void {
        const point = this.apply(x, y);

        this.path.push(`M${round(point.x)} ${round(point.y)}`);
        this.current = point;
        this.start = point;
    }

    lineTo(x: number, y: number): void {
        if (!this.current) {
            this.moveTo(x, y);

            return;
        }

        const point = this.apply(x, y);

        this.path.push(`L${round(point.x)} ${round(point.y)}`);
        this.length += Math.hypot(point.x - this.current.x, point.y - this.current.y);
        this.current = point;
    }

    closePath(): void {
        if (this.current && this.start) {
            this.path.push('Z');
            this.length += Math.hypot(this.start.x - this.current.x, this.start.y - this.current.y);
            this.current = this.start;
        }
    }

    rect(x: number, y: number, w: number, h: number): void {
        this.moveTo(x, y);
        this.lineTo(x + w, y);
        this.lineTo(x + w, y + h);
        this.lineTo(x, y + h);
        this.closePath();
    }

    arc(x: number, y: number, r: number, from: number, to: number, ccw = false): void {
        const [a, b, c, d] = this.state.matrix;
        const radius = r * Math.sqrt(Math.abs(a * d - b * c));
        const at = (angle: number) => this.apply(x + r * Math.cos(angle), y + r * Math.sin(angle));
        let sweep = ccw ? from - to : to - from;

        if (sweep >= 2 * Math.PI) {
            sweep = 2 * Math.PI;
        } else {
            sweep = ((sweep % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        }

        const first = at(from);

        if (this.current) {
            this.lineTo(x + r * Math.cos(from), y + r * Math.sin(from));
        } else {
            this.path.push(`M${round(first.x)} ${round(first.y)}`);
            this.current = first;
            this.start = first;
        }

        if (sweep === 0 || radius === 0) {
            return;
        }

        // SVG cannot draw a whole circle as one arc, so every arc is drawn in
        // halves or less.
        const steps = Math.ceil(sweep / Math.PI);
        const direction = ccw ? -1 : 1;

        for (let i = 1; i <= steps; i++) {
            const angle = from + (direction * sweep * i) / steps;
            const point = at(angle);

            this.path.push(
                `A${round(radius)} ${round(radius)} 0 0 ${ccw ? 0 : 1} ${round(point.x)} ${round(point.y)}`,
            );
            this.current = point;
        }

        this.length += radius * sweep;
    }

    // --- painting -----------------------------------------------------------

    private record(kind: Shape['kind']): void {
        if (!this.path.length) {
            return;
        }

        this.shapes.push({
            kind,
            d: this.path.join(''),
            paint: kind === 'fill' ? this.state.fillStyle : this.state.strokeStyle,
            lineWidth: this.state.lineWidth,
            lineCap: this.state.lineCap,
            lineJoin: this.state.lineJoin,
            lineDash: [...this.state.lineDash],
            alpha: this.state.globalAlpha,
            length: round(this.length),
            dataset: this.dataset,
        });
    }

    stroke(): void {
        this.record('stroke');
    }

    fill(): void {
        this.record('fill');
    }

    clip(): void {}

    fillRect(x: number, y: number, w: number, h: number): void {
        const saved = { path: this.path, length: this.length, current: this.current };

        this.beginPath();
        this.rect(x, y, w, h);
        this.record('fill');
        Object.assign(this, saved);
    }

    strokeRect(x: number, y: number, w: number, h: number): void {
        const saved = { path: this.path, length: this.length, current: this.current };

        this.beginPath();
        this.rect(x, y, w, h);
        this.record('stroke');
        Object.assign(this, saved);
    }

    clearRect(): void {}

    // --- text ---------------------------------------------------------------

    fillText(text: string, x: number, y: number): void {
        const [a, b] = this.state.matrix;
        const point = this.apply(x, y);

        this.texts.push({
            text,
            x: round(point.x),
            y: round(point.y),
            rotation: Math.atan2(b, a),
            font: this.state.font,
            color: this.state.fillStyle,
            align: this.state.textAlign,
            baseline: this.state.textBaseline,
        });
    }

    strokeText(): void {}

    createPattern(image: RecordingCanvas): RecordedPattern {
        return new RecordedPattern(image.width, image.height, [...image.context.shapes]);
    }

    measureText(text: string): TextMetrics {
        const width = this.measure(this.state.font, text);

        return { width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width } as TextMetrics;
    }
}

/** A canvas element whose 2D context is a recording one. */
export class RecordingCanvas {
    width: number;
    height: number;
    style: Record<string, string> = {};
    readonly context: RecordingContext;

    constructor(width: number, height: number, measure: (font: string, text: string) => number) {
        this.width = width;
        this.height = height;
        this.context = new RecordingContext(measure);
        this.context.canvas = this;
    }

    getContext(): RecordingContext {
        return this.context;
    }
}
