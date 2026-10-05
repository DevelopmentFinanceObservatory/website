import styles from './Docs.module.scss';
import DocsTree from './DocsTree';
import Markdown from './Markdown';

import PageFade from '@/components/molecules/PageFade/PageFade';
import PageHero from '@/components/molecules/PageHero/PageHero';
import { DOCS_NAV, docsHref, docsMarkdown, docsTrail, type DocsPage } from '@/lib/docs/corpus';

/**
 * Docs → one page of the dfo-docs corpus: the light hero, the nav tree on
 * the left, the page in the middle — its section path, title, then the
 * rendered markdown (or, for a package documented elsewhere, a card that
 * links out). A raw copy of every page sits beside it at <url>.md.
 */
const Docs = ({ page }: { page: DocsPage }) => (
    <section className={styles.section}>
        <PageHero tone="light" boxMinHeight={140}>
            <h1 className={styles.title}>Documentation</h1>
        </PageHero>

        <div className={styles.body}>
            <DocsTree nav={DOCS_NAV} currentId={page.id} />

            <article className={styles.content}>
                {docsTrail(page.id).length > 0 && (
                    <p className={styles.crumbs}>{docsTrail(page.id).join(' / ')}</p>
                )}
                <h1 className={styles.sectionTitle}>{page.title}</h1>

                {page.kind === 'external' && page.url ? (
                    <a href={page.url} className={styles.external} target="_blank" rel="noreferrer">
                        <span className={styles.externalText}>
                            {page.title} publishes its own documentation.
                        </span>
                        <span className={styles.externalLink}>Open the {page.title} docs ↗</span>
                    </a>
                ) : (
                    <Markdown page={page} source={docsMarkdown(page)} />
                )}

                <p className={styles.raw}>
                    <a href={`${docsHref(page.path)}.md`}>View as markdown</a>
                </p>
            </article>
        </div>

        <PageFade />
    </section>
);

export default Docs;
