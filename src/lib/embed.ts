/**
 * The iframe view of a share lives under /embed/<id> (src/app/embed). It runs
 * inside other sites, so the root layout loads no consent manager there and
 * GoogleAnalytics stays off.
 */
export const EMBED_PREFIX = '/embed/';

export const isEmbedPath = (pathname: string): boolean => pathname.startsWith(EMBED_PREFIX);
