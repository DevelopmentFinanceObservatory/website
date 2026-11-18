import type { Source, Words } from '../_lib/copy.ts';

/** A sources run in prose: "OECD CRS, World Development Indicators, and SDG Global Database". */
export const SourceNames = ({ sources }: { sources: readonly Source[] }) => (
    <>
        {sources.map((source, index) => (
            <span key={source.url}>
                {index > 0 &&
                    (index === sources.length - 1
                        ? sources.length > 2
                            ? ', and '
                            : ' and '
                        : ', ')}
                <a href={source.url}>{source.name}</a>
            </span>
        ))}
    </>
);

/** Running text whose source names link. */
export const Linked = ({ words }: { words: Words }) => (
    <>
        {words.map((part) =>
            typeof part === 'string' ? (
                part
            ) : (
                <a key={part.url} href={part.url}>
                    {part.name}
                </a>
            ),
        )}
    </>
);
