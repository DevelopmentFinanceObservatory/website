import Link from 'next/link';
import type { ComponentProps } from 'react';

// Prefetch is off for every link to a source's page. This Next build
// prefetches a link as it scrolls into view and fully renders the
// force-dynamic source page to do it, each render a cold graph read on
// whichever server instance takes it. A list of sources would read the graph
// once per visible link.

const SOURCE_PAGE_PREFIX = '/data/sources/';

/** Whether an in-site href opens a source's page (a query is allowed), so a
 *  link rendered elsewhere can turn its prefetch off for the reason above. */
export const isSourcePageHref = (href: string): boolean => href.startsWith(SOURCE_PAGE_PREFIX);

type SourceLinkProps = Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'> & {
    /** the source's dcid, slashes and all */
    dcid: string;
};

/** A link to a source's page, /data/sources/<dcid>, with prefetch off. The
 *  dcid carries slashes, so the route is a catch-all and the id goes in
 *  unescaped. */
const SourceLink = ({ dcid, ...props }: SourceLinkProps) => (
    <Link href={`${SOURCE_PAGE_PREFIX}${dcid}`} prefetch={false} {...props} />
);

export default SourceLink;
