/**
 * Whether the gallery is on the site. While false, its pages redirect home
 * (galleryRedirects), the header, footer and home page leave out its links,
 * the sitemap leaves out its URLs, and a gallery item's search on /data
 * renders as any other search share. The pages, data and components stay in
 * the build, so setting it to true restores all of them.
 *
 * It is false because the curated items' charts show "Unattributed" as their
 * source. The module imports nothing, so client components can read it
 * without bundling the gallery's items.
 */
export const GALLERY_PUBLISHED = false;

/**
 * The gallery redirects next.config.ts serves. While the gallery is
 * unpublished, every gallery page and card goes home, and the redirect keeps
 * the consent scripts that a notFound() page drops.
 */
export const galleryRedirects = () =>
    GALLERY_PUBLISHED
        ? []
        : [{ source: '/insights/gallery/:path*', destination: '/', permanent: false }];
