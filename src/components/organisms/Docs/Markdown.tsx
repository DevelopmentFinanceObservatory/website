import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { common } from 'lowlight';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

import { csvLanguage } from './csvLanguage';
import styles from './Docs.module.scss';
import DocsMermaid from './DocsMermaid';
import DocsTabs from './DocsTabs';

import { isSourcePageHref } from '@/components/atoms/SourceLink/SourceLink';
import { docsBundleLink, docsLink, docsSlug, type DocsPage } from '@/lib/docs/corpus';
import { normaliseMkdocs } from '@/lib/docs/mkdocs';

/* eslint-disable @typescript-eslint/no-explicit-any -- mdast / hast nodes, walked shallowly */

const CALLOUT_TITLES: Record<string, string> = {
    note: 'Note',
    tip: 'Tip',
    important: 'Important',
    warning: 'Warning',
    caution: 'Caution',
};

// `> [!WARNING]` — GitHub's alert syntax: the marker is dropped and the
// blockquote carries its kind for the renderer below.
const remarkCallouts = () => (tree: any) => {
    const walk = (node: any) => {
        if (node.type === 'blockquote') {
            const text = node.children?.[0]?.children?.[0];
            // `> [!WARNING]` optionally followed by the block's own title on
            // the same line (what a MkDocs admonition carries, normalised in
            // lib/docs/mkdocs).
            const match = text?.type === 'text' && text.value.match(/^\[!(\w+)\][ \t]*([^\n]*)/);

            if (match && CALLOUT_TITLES[match[1].toLowerCase()]) {
                const title = match[2].trim();

                text.value = text.value.slice(match[0].length).replace(/^\n/, '');
                node.data = {
                    hProperties: {
                        'data-callout': match[1].toLowerCase(),
                        ...(title ? { 'data-callout-title': title } : {}),
                    },
                };
            }
        }

        node.children?.forEach(walk);
    };

    walk(tree);
};

// The page title comes from the manifest, so the markdown's own leading
// `# Title` is dropped.
const remarkDropTitle = () => (tree: any) => {
    if (tree.children?.[0]?.type === 'heading' && tree.children[0].depth === 1) {
        tree.children.shift();
    }
};

/**
 * `:::tabs` wrapping `::tab{label="…"}` blocks — the corpus's own tab
 * syntax, and what lib/docs/mkdocs rewrites Material's `=== "…"` into.
 * Neither marker is markdown, so each arrives as a paragraph of text; this
 * folds the run between them into one node per tab set, with the blocks
 * after each label as that tab's panel.
 */
const OPEN = /^:::tabs\s*$/;
const CLOSE = /^:::\s*$/;
const TAB = /^::tab\{label="([^"]*)"\}\s*$/;

const paragraphText = (node: any): string =>
    node?.type === 'paragraph' && node.children?.length === 1 && node.children[0]?.type === 'text'
        ? node.children[0].value.trim()
        : '';

const foldTabs = (children: any[]): void => {
    for (let index = 0; index < children.length; index += 1) {
        if (!OPEN.test(paragraphText(children[index]))) {
            continue;
        }

        const panels: any[] = [];
        let cursor = index + 1;

        while (cursor < children.length && !CLOSE.test(paragraphText(children[cursor]))) {
            const label = TAB.exec(paragraphText(children[cursor]))?.[1];

            if (label !== undefined) {
                panels.push({
                    type: 'docsTab',
                    data: { hName: 'docs-tab', hProperties: { 'data-label': label } },
                    children: [],
                });
            } else if (panels.length) {
                panels[panels.length - 1].children.push(children[cursor]);
            }

            cursor += 1;
        }

        // Unclosed, or nothing labelled: leave the source alone rather than
        // swallow the section.
        if (!panels.length || cursor >= children.length) {
            continue;
        }

        children.splice(index, cursor - index + 1, {
            type: 'docsTabs',
            data: { hName: 'docs-tabs' },
            children: panels,
        });
    }
};

// Most tab sets in the corpus sit inside a numbered step, so the fold runs at
// every level, not just the document root.
const remarkTabs = () => (tree: any) => {
    const walk = (node: any) => {
        if (!Array.isArray(node?.children)) {
            return;
        }

        foldTabs(node.children);
        node.children.forEach(walk);
    };

    walk(tree);
};

const textOf = (node: any): string =>
    node?.type === 'text' ? node.value : (node?.children ?? []).map(textOf).join('');

const heading = (Tag: 'h2' | 'h3' | 'h4') => {
    const Heading = ({ node, children }: { node?: any; children?: ReactNode }) => (
        <Tag id={docsSlug(textOf(node))} className={styles[Tag]}>
            {children}
        </Tag>
    );

    return Heading;
};

// What MkDocs gets from Pygments (QA-11). The corpus is python, bash, json,
// yaml, toml, r and html — all in highlight.js's common set — plus `csv`,
// which highlight.js has no grammar for, so we bring our own.
//
// `languages` REPLACES that common set rather than adding to it, so it is
// spread back in: passing `csv` alone leaves python and the rest with a
// grammar register that does not know them, and every sample goes plain.
//
// A fence with no language stays plain by design: `detect` is off rather
// than guessing at console output. Token colours are ours, in
// Docs.module.scss.
// Typed off the prop rather than off `unified`: that package reaches us
// through react-markdown, and a store with a strict node_modules layout
// (pnpm — the client's) will not resolve what we have not declared.
const rehypePlugins: ComponentProps<typeof ReactMarkdown>['rehypePlugins'] = [
    [rehypeHighlight, { detect: false, languages: { ...common, csv: csvLanguage } }],
];

// The text of a `pre`'s code child, straight off the hast node. Mermaid has
// no grammar, so its fence arrives as one untouched text node.
const codeText = (node: any): string =>
    (node?.children?.[0]?.children ?? []).map((child: any) => child.value ?? '').join('');

const languageOf = (node: any): string =>
    ((node?.children?.[0]?.properties?.className ?? []) as string[])
        .find((name) => name.startsWith('language-'))
        ?.slice('language-'.length) ?? '';

/** One corpus page's markdown, rendered on the server: GFM tables, GitHub
 *  alerts, highlighted and titled code blocks, anchored headings and
 *  site-relative links. */
const Markdown = ({ page, source }: { page: DocsPage; source: string }) => {
    // `docs-tabs` / `docs-tab` are our own element names (see remarkTabs);
    // the Components map only types the HTML ones, so the extras ride in on
    // the side.
    const components = {
        h2: heading('h2'),
        h3: heading('h3'),
        h4: heading('h4'),
        a: ({ href = '', children }) => {
            const bundle = docsBundleLink(page, href);

            // A file to save, so no client navigation and no prefetch.
            if (bundle) {
                return (
                    <a href={bundle} download>
                        {children}
                    </a>
                );
            }

            const to = docsLink(page, href);

            return /^https?:/.test(to) ? (
                <a href={to} target="_blank" rel="noreferrer">
                    {children}
                </a>
            ) : (
                // A source's page has no prefetch; see SourceLink.
                <Link href={to} prefetch={isSourcePageHref(to) ? false : undefined}>
                    {children}
                </Link>
            );
        },
        'docs-tabs': ({ children }: { children?: ReactNode }) => <DocsTabs>{children}</DocsTabs>,
        // The panel keeps its label on the element: DocsTabs runs on the
        // client and receives these already rendered, so a prop would not
        // survive the crossing.
        'docs-tab': ({ children, ...props }: { children?: ReactNode }) => (
            <div data-label={(props as Record<string, string>)['data-label']}>{children}</div>
        ),
        blockquote: ({ children, ...props }) => {
            // The alert kind rides the element as a data attribute (see remarkCallouts).
            const kind = (props as Record<string, unknown>)['data-callout'] as string | undefined;
            const title = (props as Record<string, unknown>)['data-callout-title'] as
                | string
                | undefined;

            return kind ? (
                <aside className={styles.callout} data-kind={kind}>
                    <p className={styles.calloutTitle}>{title || CALLOUT_TITLES[kind]}</p>
                    {children}
                </aside>
            ) : (
                <blockquote>{children}</blockquote>
            );
        },
        pre: ({ node, children }) => {
            const title = (node as any)?.children?.[0]?.data?.meta?.match(/title="([^"]+)"/)?.[1];

            // A diagram, not a sample: it is drawn rather than printed.
            if (languageOf(node) === 'mermaid') {
                return <DocsMermaid source={codeText(node)} />;
            }

            return (
                <figure className={styles.code}>
                    {title && <figcaption className={styles.codeTitle}>{title}</figcaption>}
                    <pre>{children}</pre>
                </figure>
            );
        },
        table: ({ children }: { children?: ReactNode }) => (
            <div className={styles.tableScroll}>
                <table>{children}</table>
            </div>
        ),
    } as Components;

    return (
        <div className={styles.prose}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkCallouts, remarkTabs, remarkDropTitle]}
                rehypePlugins={rehypePlugins}
                components={components}
            >
                {normaliseMkdocs(source)}
            </ReactMarkdown>
        </div>
    );
};

export default Markdown;
