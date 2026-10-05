import { DOCS_PAGES, docsMarkdown, docsPageByPath } from '@/lib/docs/corpus';

// The raw markdown beside every docs page, for crawlers and agents: the
// proxy maps /docs/<path>.md (and /docs.md) here. Static — built once per pin.
export const dynamic = 'force-static';
export const dynamicParams = false;

export const generateStaticParams = () =>
    DOCS_PAGES.filter((page) => page.corpus_path).map((page) => ({
        slug: page.path ? page.path.split('/') : [],
    }));

export const GET = async (
    _request: Request,
    { params }: { params: Promise<{ slug?: string[] }> },
) => {
    const page = docsPageByPath(((await params).slug ?? []).join('/'));

    if (!page?.corpus_path) {
        return new Response('Not found', { status: 404 });
    }

    return new Response(docsMarkdown(page), {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
};
