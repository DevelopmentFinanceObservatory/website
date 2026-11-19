import { Fragment } from 'react';

import type { Source } from '../_lib/copy.ts';

/** A short citation after a sentence, one link per source: "(KFF and UNAIDS, 27 July 2026)". */
export const SourceLink = ({
    sources,
    className,
}: {
    sources: readonly Source[];
    /** The links' class, such as the prose link style on an MDX page. */
    className?: string;
}) => (
    <>
        {' ('}
        {sources.map((source, index) => (
            <Fragment key={source.url}>
                {index > 0 && '; '}
                <a href={source.url} className={className}>
                    {source.publisher}
                    {source.date === null ? '' : `, ${source.date}`}
                </a>
            </Fragment>
        ))}
        )
    </>
);

/** A full entry for a Sources list: publisher, linked title and date. */
export const SourceEntry = ({ source, className }: { source: Source; className?: string }) => (
    <>
        {source.publisher},{' '}
        <a href={source.url} className={className}>
            {source.title}
        </a>
        {source.date === null ? '' : `, ${source.date}`}
    </>
);
