/**
 * The Sources pages' presentation constants.
 *
 * Everything else on these pages comes from the graph API at request time
 * (see lib/sources/graph.ts) — this file holds only what the platform has no
 * opinion about: the swatch colours a publisher's cards are grouped by.
 */

// Hardcoded hex by the canvas-layer convention: these are content colours,
// not theme tokens. Publishers are assigned one in the order they first
// appear, so the palette wraps rather than naming any publisher.
export const SOURCE_SWATCHES = ['#5fe9c9', '#5cb6ff', '#ff7b5a', '#7ee36b', '#e5a0ff'] as const;
