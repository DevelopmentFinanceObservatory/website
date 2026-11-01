import type { DocsNavNode, DocsPage } from './corpus.ts';

/** The title of the nav group that lists `id` as one of its pages. A group's
 *  own index page (its `page_id`) is the group itself, so it has none. */
const parentTitle = (nodes: readonly DocsNavNode[], id: string): string | undefined => {
    for (const node of nodes) {
        const children = node.children ?? [];

        if (children.some((child) => child.id === id)) {
            return node.title;
        }

        const hit = parentTitle(children, id);

        if (hit) {
            return hit;
        }
    }

    return undefined;
};

/**
 * The `<title>` builder for a corpus. A page whose title another page shares, in any case,
 * names its group, so the "Changelog" of each tool reads "Changelog — IMF
 * reader — DFO Docs". A unique title, a group's index page and a top-level
 * page keep their own.
 */
export const docsTitler = (
    pages: readonly DocsPage[],
    nav: readonly DocsNavNode[],
): ((page: DocsPage) => string) => {
    const seen = new Set<string>();
    const repeated = new Set<string>();

    for (const { title } of pages) {
        const key = title.toLowerCase();

        (seen.has(key) ? repeated : seen).add(key);
    }

    return (page) => {
        const group = repeated.has(page.title.toLowerCase())
            ? parentTitle(nav, page.id)
            : undefined;

        return [page.title, group, 'DFO Docs'].filter(Boolean).join(' — ');
    };
};
