import styles from './Docs.module.scss';
import DocsScroll from './DocsScroll';
import DocsTree from './DocsTree';
import Markdown from './Markdown';

import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import { DOCS_NAV, docsMarkdown, docsTrail, type DocsPage } from '@/lib/docs/corpus';
import { markdownHref } from '@/lib/docs/links';

/**
 * Docs → one page of the dfo-docs corpus: the light hero, the nav tree on
 * the left, the page in the middle — its section path, title, then the
 * rendered markdown (or, for a package documented elsewhere, a card that
 * links out). A raw copy of every corpus page sits beside it at <url>.md.
 */
// What DocsScroll aims at when the reader picks another page.
const CONTENT_ID = 'docs-content';

const Docs = ({ page }: { page: DocsPage }) => {
    const markdown = markdownHref(page);

    return (
        <section className={styles.section}>
            <PageHero tone="light" boxMinHeight={140}>
                <h1 className={styles.title}>Documentation</h1>
            </PageHero>

            <DocsScroll target={CONTENT_ID} />

            <div className={styles.body}>
                <DocsTree nav={DOCS_NAV} currentId={page.id} />

                <article id={CONTENT_ID} className={styles.content}>
                    {docsTrail(page.id).length > 0 && (
                        <p className={styles.crumbs}>{docsTrail(page.id).join(' / ')}</p>
                    )}
                    <h1 className={styles.sectionTitle}>{page.title}</h1>

                    {page.kind === 'external' && page.url ? (
                        <a
                            href={page.url}
                            className={styles.external}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <span className={styles.externalText}>
                                {page.title} publishes its own documentation.
                            </span>
                            <span className={styles.externalLink}>
                                Open the {page.title} docs ↗
                            </span>
                        </a>
                    ) : (
                        <Markdown page={page} source={docsMarkdown(page)} />
                    )}

                    {markdown && (
                        <p className={styles.raw}>
                            <a href={markdown}>View as markdown</a>
                        </p>
                    )}
                </article>
            </div>

            <PageFade />
        </section>
    );
};

export default Docs;
