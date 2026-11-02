import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';

import Docs from '@/components/organisms/Docs/Docs';
import {
    DOCS_NAV,
    DOCS_PAGES,
    docsHref,
    docsPageByPath,
    docsRedirect,
    docsRedirectPaths,
} from '@/lib/docs/corpus';
import { markdownHref } from '@/lib/docs/links';
import { docsTitler } from '@/lib/docs/title';

const docsTitle = docsTitler(DOCS_PAGES, DOCS_NAV);

type DocsPageProps = { params: Promise<{ slug: string[] }> };

// Every corpus page and every redirect source is known at build; anything
// else is a 404. (/docs/status is its own route.)
export const dynamicParams = false;

export const generateStaticParams = () =>
    [...DOCS_PAGES.map((page) => page.path).filter(Boolean), ...docsRedirectPaths()].map(
        (pagePath) => ({ slug: pagePath.split('/') }),
    );

export const generateMetadata = async ({ params }: DocsPageProps): Promise<Metadata> => {
    const page = docsPageByPath((await params).slug.join('/'));
    const markdown = page && markdownHref(page);

    return page
        ? {
              title: docsTitle(page),
              description: page.description,
              ...(markdown && { alternates: { types: { 'text/markdown': markdown } } }),
          }
        : {};
};

const DocsPage = async ({ params }: DocsPageProps) => {
    const pagePath = (await params).slug.join('/');
    const moved = docsRedirect(pagePath);

    if (moved !== undefined) {
        permanentRedirect(docsHref(moved));
    }

    const page = docsPageByPath(pagePath);

    if (!page) {
        notFound();
    }

    return (
        <main>
            <Docs page={page} />
        </main>
    );
};

export default DocsPage;
