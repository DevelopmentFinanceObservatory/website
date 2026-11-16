/** One published prototype. Its page is app/<slug>/page.mdx and it takes its
 *  metadata from this entry, so a title lives in one place. */
export type Prototype = {
    /** the folder under app/ and the path under /prototypes */
    slug: string;
    title: string;
    /** one or two sentences for the index and the link preview */
    summary: string;
    /** the publication date, YYYY-MM-DD */
    date: string;
};

/** Every prototype, newest first. */
export const prototypes: Prototype[] = [];

/** The entry for a slug. Throws when the slug has none, so a page cannot
 *  build without its registry entry. */
export const prototype = (slug: string): Prototype => {
    const entry = prototypes.find((item) => item.slug === slug);

    if (!entry) {
        throw new Error(`No registry entry for prototype "${slug}" in prototypes/registry.ts`);
    }

    return entry;
};
