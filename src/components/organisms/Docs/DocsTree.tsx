import classNames from 'classnames';
import Link from 'next/link';

import styles from './Docs.module.scss';

import { docsHref, docsPageById, type DocsNavNode } from '@/lib/docs/corpus';

/** Whether `node` or anything under it is the current page. */
const holds = (node: DocsNavNode, currentId: string): boolean =>
    node.id === currentId ||
    node.page_id === currentId ||
    (node.children ?? []).some((child) => holds(child, currentId));

// A nav leaf or a group's own index page, as a link; external pages open
// their own site.
const NodeLink = ({ id, title, currentId }: { id: string; title: string; currentId: string }) => {
    const page = docsPageById(id);

    if (!page) {
        return <span className={styles.itemLink}>{title}</span>;
    }

    return page.kind === 'external' && page.url ? (
        <a href={page.url} className={styles.itemLink} target="_blank" rel="noreferrer">
            {title} ↗
        </a>
    ) : (
        // No jump to the top of the document: that lands above the banner,
        // far from the text. DocsScroll puts the reader at the start of the
        // page they picked instead.
        <Link
            href={docsHref(page.path)}
            className={styles.itemLink}
            scroll={false}
            aria-current={id === currentId ? 'page' : undefined}
        >
            {title}
        </Link>
    );
};

const Nodes = ({ nodes, currentId }: { nodes: DocsNavNode[]; currentId: string }) => (
    <ul className={styles.items}>
        {nodes.map((node) => (
            <li
                key={node.id}
                className={classNames(
                    styles.item,
                    (node.id === currentId || node.page_id === currentId) && styles.itemActive,
                )}
            >
                {node.kind === 'group' ? (
                    // A group unfolds only along the current page's branch.
                    <details className={styles.group} open={holds(node, currentId)}>
                        <summary className={styles.groupSummary}>
                            {node.page_id ? (
                                <NodeLink
                                    id={node.page_id}
                                    title={node.title}
                                    currentId={currentId}
                                />
                            ) : (
                                <span className={styles.itemLink}>{node.title}</span>
                            )}
                        </summary>
                        <Nodes nodes={node.children ?? []} currentId={currentId} />
                    </details>
                ) : (
                    <NodeLink id={node.id} title={node.title} currentId={currentId} />
                )}
            </li>
        ))}
    </ul>
);

/**
 * The docs navigation, walked straight from the manifest's nav tree: the
 * sticky column on desktop and tablet; on a phone the same tree folds into
 * one "Contents" disclosure above the page.
 */
const DocsTree = ({ nav, currentId }: { nav: DocsNavNode[]; currentId: string }) => (
    <nav className={styles.nav} aria-label="Documentation">
        <div className={styles.treeColumn}>
            <Nodes nodes={nav} currentId={currentId} />
        </div>
        <details className={styles.treePhone}>
            <summary className={styles.treePhoneSummary}>Contents</summary>
            <Nodes nodes={nav} currentId={currentId} />
        </details>
    </nav>
);

export default DocsTree;
