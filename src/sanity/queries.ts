import { defineQuery } from 'next-sanity';

// Published reports for /insights/publications, newest first.
export const PUBLICATIONS_QUERY =
    defineQuery(`*[_type == "publication" && defined(slug.current)] | order(publishedAt desc) {
    "id": _id,
    title,
    byline,
    publishedAt,
    abstract,
    reportUrl,
    "coverSrc": cover.asset->url
}`);
