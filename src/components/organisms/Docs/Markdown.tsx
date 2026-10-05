import Link from 'next/link';
import type { ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import styles from './Docs.module.scss';

import { docsLink, docsSlug, type DocsPage } from '@/lib/docs/corpus';

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
            const match = text?.type === 'text' && text.value.match(/^\[!(\w+)\]\s*/);

            if (match && CALLOUT_TITLES[match[1].toLowerCase()]) {
                text.value = text.value.slice(match[0].length);
                node.data = { hProperties: { 'data-callout': match[1].toLowerCase() } };
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

/** One corpus page's markdown, rendered on the server: GFM tables, GitHub
 *  alerts, titled code blocks, anchored headings and site-relative links. */
const Markdown = ({ page, source }: { page: DocsPage; source: string }) => {
    const components: Components = {
        h2: heading('h2'),
        h3: heading('h3'),
        h4: heading('h4'),
        a: ({ href = '', children }) => {
            const to = docsLink(page, href);

            return /^https?:/.test(to) ? (
                <a href={to} target="_blank" rel="noreferrer">
                    {children}
                </a>
            ) : (
                <Link href={to}>{children}</Link>
            );
        },
        blockquote: ({ children, ...props }) => {
            // The alert kind rides the element as a data attribute (see remarkCallouts).
            const kind = (props as Record<string, unknown>)['data-callout'] as string | undefined;

            return kind ? (
                <aside className={styles.callout} data-kind={kind}>
                    <p className={styles.calloutTitle}>{CALLOUT_TITLES[kind]}</p>
                    {children}
                </aside>
            ) : (
                <blockquote>{children}</blockquote>
            );
        },
        pre: ({ node, children }) => {
            const title = (node as any)?.children?.[0]?.data?.meta?.match(/title="([^"]+)"/)?.[1];

            return (
                <figure className={styles.code}>
                    {title && <figcaption className={styles.codeTitle}>{title}</figcaption>}
                    <pre>{children}</pre>
                </figure>
            );
        },
        table: ({ children }) => (
            <div className={styles.tableScroll}>
                <table>{children}</table>
            </div>
        ),
    };

    return (
        <div className={styles.prose}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkCallouts, remarkDropTitle]}
                components={components}
            >
                {source}
            </ReactMarkdown>
        </div>
    );
};

export default Markdown;
