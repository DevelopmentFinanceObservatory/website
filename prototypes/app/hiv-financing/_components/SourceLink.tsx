import { Fragment } from 'react';

import type { Cited, Source } from '../_lib/copy.ts';

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

/** Cited text: each part's sentences, then its citation, the parts joined by spaces. */
export const CitedText = ({
    parts,
    className,
}: {
    parts: readonly Cited[];
    className?: string;
}) => (
    <>
        {parts.map((part, index) => (
            <Fragment key={part.text}>
                {index > 0 && ' '}
                {part.text}
                {part.sources && <SourceLink sources={part.sources} className={className} />}
            </Fragment>
        ))}
    </>
);

/** A full entry for a Sources list: publisher, linked title, date, and what the page takes. */
export const SourceEntry = ({ source, className }: { source: Source; className?: string }) => (
    <>
        {source.publisher},{' '}
        <a href={source.url} className={className}>
            {source.title}
        </a>
        {source.date === null ? '' : `, ${source.date}`}
        {source.detail === undefined ? '' : `, ${source.detail}`}
    </>
);
