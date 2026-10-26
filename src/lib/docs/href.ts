/** A docs page's site URL, from its manifest path (the home page's is ""). No
 *  imports, so client components, the server and `node --test` can all use it. */
export const docsHref = (path: string): string => (path ? `/docs/${path}` : '/docs');
