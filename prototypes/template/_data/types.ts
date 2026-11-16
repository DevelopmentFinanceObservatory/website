// The shape of _data/series.json's `data`, shared by the data step and the
// page's components. Both import it with `import type`, so Node never loads it.

/** One year of the series the page draws. */
export type Point = { year: number; value: number };
