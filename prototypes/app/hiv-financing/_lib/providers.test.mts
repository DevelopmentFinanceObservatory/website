import assert from 'node:assert/strict';
import test from 'node:test';

import { PROVIDERS } from './providers.ts';

/** WCAG 2 contrast ratio between two "#rrggbb" colours. */
const contrast = (a: string, b: string): number => {
    const luminance = (hex: string): number => {
        const [r = 0, g = 0, bl = 0] = [1, 3, 5].map((at) => {
            const c = Number.parseInt(hex.slice(at, at + 2), 16) / 255;

            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });

        return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [high, low] = [luminance(a), luminance(b)].toSorted((x, y) => y - x);

    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

test('every provider colour has 3:1 contrast against the page and the panel', () => {
    for (const { label, colour } of PROVIDERS) {
        for (const background of ['#ffffff', '#f6f6e8']) {
            assert.ok(contrast(colour, background) >= 3, `${label} ${colour} on ${background}`);
        }
    }
});
