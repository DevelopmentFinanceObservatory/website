import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/**
 * Advance widths read from a WOFF 1.0 font file, so text measured in Node
 * has the width the browser gives it in that face. Kerning is left out, which
 * makes a measured string a fraction of a px wider than the browser's.
 */

export type Metrics = {
    unitsPerEm: number;
    // Advance in font units by code point.
    advance: (codePoint: number) => number | undefined;
};

const tables = (file: Buffer): Map<string, Buffer> => {
    if (file.toString('latin1', 0, 4) !== 'wOFF') {
        throw new Error('fontMetrics: not a WOFF 1.0 file');
    }

    const count = file.readUInt16BE(12);
    const found = new Map<string, Buffer>();

    for (let i = 0; i < count; i++) {
        const entry = 44 + i * 20;
        const tag = file.toString('latin1', entry, entry + 4);
        const offset = file.readUInt32BE(entry + 4);
        const compressed = file.readUInt32BE(entry + 8);
        const original = file.readUInt32BE(entry + 12);
        const data = file.subarray(offset, offset + compressed);

        found.set(tag, compressed < original ? inflateSync(data) : data);
    }

    return found;
};

// Code point → glyph id from a format 4 (BMP) or format 12 (full range)
// subtable.
const glyphMap = (cmap: Buffer): Map<number, number> => {
    const map = new Map<number, number>();
    const count = cmap.readUInt16BE(2);

    for (let i = 0; i < count; i++) {
        const platform = cmap.readUInt16BE(4 + i * 8);
        const encoding = cmap.readUInt16BE(6 + i * 8);
        const at = cmap.readUInt32BE(8 + i * 8);
        const format = cmap.readUInt16BE(at);
        const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));

        if (!unicode) {
            continue;
        }

        if (format === 4) {
            const segments = cmap.readUInt16BE(at + 6) / 2;
            const ends = at + 14;
            const starts = ends + segments * 2 + 2;
            const deltas = starts + segments * 2;
            const ranges = deltas + segments * 2;

            for (let s = 0; s < segments; s++) {
                const start = cmap.readUInt16BE(starts + s * 2);
                const end = cmap.readUInt16BE(ends + s * 2);
                const delta = cmap.readInt16BE(deltas + s * 2);
                const range = cmap.readUInt16BE(ranges + s * 2);

                for (let code = start; code <= end && code !== 0xffff; code++) {
                    let glyph: number;

                    if (range === 0) {
                        glyph = (code + delta) & 0xffff;
                    } else {
                        const raw = cmap.readUInt16BE(ranges + s * 2 + range + (code - start) * 2);

                        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
                    }

                    if (glyph) {
                        map.set(code, glyph);
                    }
                }
            }
        } else if (format === 12) {
            const groups = cmap.readUInt32BE(at + 12);

            for (let g = 0; g < groups; g++) {
                const group = at + 16 + g * 12;
                const start = cmap.readUInt32BE(group);
                const end = cmap.readUInt32BE(group + 4);
                const first = cmap.readUInt32BE(group + 8);

                for (let code = start; code <= end; code++) {
                    map.set(code, first + code - start);
                }
            }
        }
    }

    return map;
};

export const readMetrics = (path: string): Metrics => {
    const font = tables(readFileSync(path));
    const head = font.get('head');
    const hhea = font.get('hhea');
    const hmtx = font.get('hmtx');
    const cmap = font.get('cmap');

    if (!head || !hhea || !hmtx || !cmap) {
        throw new Error(`fontMetrics: ${path} lacks head, hhea, hmtx or cmap`);
    }

    const metricCount = hhea.readUInt16BE(34);
    const glyphs = glyphMap(cmap);
    // Glyphs past the last full metric share its advance.
    const advanceOf = (glyph: number) => hmtx.readUInt16BE(Math.min(glyph, metricCount - 1) * 4);

    return {
        unitsPerEm: head.readUInt16BE(18),
        advance: (codePoint) => {
            const glyph = glyphs.get(codePoint);

            return glyph === undefined ? undefined : advanceOf(glyph);
        },
    };
};

/** A string's width in px at `size` px. A character the face lacks counts as
 *  the face's average advance over printable ASCII. */
export const textWidth = (metrics: Metrics, text: string, size: number): number => {
    let units = 0;

    for (const char of text) {
        units += metrics.advance(char.codePointAt(0)!) ?? averageAdvance(metrics);
    }

    return (units / metrics.unitsPerEm) * size;
};

const averages = new WeakMap<Metrics, number>();

const averageAdvance = (metrics: Metrics): number => {
    let average = averages.get(metrics);

    if (average === undefined) {
        let sum = 0;
        let count = 0;

        for (let code = 0x20; code < 0x7f; code++) {
            const advance = metrics.advance(code);

            if (advance !== undefined) {
                sum += advance;
                count++;
            }
        }

        average = count ? sum / count : metrics.unitsPerEm / 2;
        averages.set(metrics, average);
    }

    return average;
};

// --- canvas font strings --------------------------------------------------------

export type FontSpec = { style: string; weight: string; size: number; family: string };

// `[style] [weight] <size>px <family>`, the shape Chart.js and the app's
// own canvas code write ("normal 700 8px Outfit", "700 8px Outfit").
const FONT = /^(?:(italic|oblique|normal)\s+)?(?:(\d{3}|bold|normal)\s+)?([\d.]+)px\s+(.+)$/;

/** A canvas font string read into its parts, the weight as a number
 *  ("bold" is 700, "normal" or none is 400). Throws on any other shape. */
export const parseFont = (font: string): FontSpec => {
    const match = FONT.exec(font.trim());

    if (!match) {
        throw new Error(`fontMetrics: cannot read the font "${font}"`);
    }

    const [, style = 'normal', weight, size, family] = match;

    return {
        style,
        weight: weight === 'bold' ? '700' : !weight || weight === 'normal' ? '400' : weight,
        size: Number(size),
        family: family!,
    };
};

/** Text widths in Outfit, the only face Chart.js is given, read from the
 *  @fontsource WOFF files in `fontsDir`. */
export const outfitMeasure = (fontsDir: string) => {
    const faces = new Map<string, Metrics>();

    return (font: string, text: string): number => {
        const { weight, size, family } = parseFont(font);

        if (!/^\s*"?outfit/i.test(family)) {
            throw new Error(`fontMetrics: text measured in "${font}", which is not Outfit`);
        }

        let metrics = faces.get(weight);

        if (!metrics) {
            metrics = readMetrics(`${fontsDir}/outfit-latin-${weight}-normal.woff`);
            faces.set(weight, metrics);
        }

        return textWidth(metrics, text, size);
    };
};
