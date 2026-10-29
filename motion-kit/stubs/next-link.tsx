import type { AnchorHTMLAttributes } from 'react';

// Link's own props, which an anchor does not take.
const LINK_PROPS = new Set(['prefetch', 'replace', 'scroll', 'shallow', 'locale']);

/** `next/link` for a render outside Next: a plain anchor. */
const Link = ({
    href,
    ...rest
}: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
    href: string | { pathname?: string };
    [prop: string]: unknown;
}) => (
    <a
        href={typeof href === 'string' ? href : (href.pathname ?? '')}
        {...Object.fromEntries(Object.entries(rest).filter(([key]) => !LINK_PROPS.has(key)))}
    />
);

export default Link;
