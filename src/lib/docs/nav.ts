import manifest from '@/content/dfo-docs/manifest.json';

/**
 * The docs' top-level sections as site menu entries — the header's Docs
 * dropdown and the footer's Docs column — read from the pinned dfo-docs nav
 * tree, so the menus follow the corpus. No filesystem access, so client
 * components can import it (corpus.ts is the server side).
 */

type NavNode = { id: string; title: string; kind: string; page_id?: string; children?: NavNode[] };

type PageRef = { id: string; path: string };

const pagePath = new Map((manifest.pages as PageRef[]).map((page) => [page.id, page.path]));

export const docsHref = (path: string): string => (path ? `/docs/${path}` : '/docs');

// A section links to its own page; a group without one, to its first page.
const firstPage = (node: NavNode): string | undefined =>
    node.kind === 'group'
        ? (node.page_id ?? node.children?.map(firstPage).find(Boolean))
        : node.kind === 'external'
          ? undefined
          : node.id;

const sectionHref = (node: NavNode): string | undefined => {
    const id = firstPage(node);
    const path = id === undefined ? undefined : pagePath.get(id);

    return path === undefined ? undefined : docsHref(path);
};

export const DOCS_MENU: { label: string; href: string }[] = (manifest.nav as NavNode[]).flatMap(
    (node) => {
        const href = sectionHref(node);

        return href === undefined ? [] : [{ label: node.title, href }];
    },
);

const holds = (node: NavNode, pageId: string): boolean =>
    node.id === pageId ||
    node.page_id === pageId ||
    (node.children?.some((child) => holds(child, pageId)) ?? false);

/**
 * The link to the top-level docs section that holds `pageId`. Found by a page
 * inside the section, so renaming the section's heading cannot break it. Throws
 * when no section holds the page, so a corpus change fails the build.
 */
export const docsSectionHref = (pageId: string): string => {
    const section = (manifest.nav as NavNode[]).find((node) => holds(node, pageId));
    const href = section && sectionHref(section);
    if (href === undefined) throw new Error(`No docs section holds page ${pageId}`);

    return href;
};
