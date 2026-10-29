import { withSentryConfig } from '@sentry/nextjs/config';
import path from 'path';
import type { NextConfig } from 'next';

import gallery from './src/content/gallery/index.ts';
import { noindexHeaders } from './src/lib/crawl.ts';

const nextConfig: NextConfig = {
    // Self-contained server bundle for the Cloud Run image (deploy/Dockerfile).
    output: 'standalone',
    devIndicators: false,
    // The Cloud SQL connector (db/connection.ts, instrumentation.ts) is
    // Node-only, so this opts it out of Server Components bundling to a
    // native `require`, which as a side effect makes the standalone
    // output's dependency trace (deploy/Dockerfile's image) copy it into
    // .next/standalone/node_modules.
    serverExternalPackages: ['@google-cloud/cloud-sql-connector'],
    // Phones/tablets on the LAN may open the dev server by the machine's IP
    // (DEV_ORIGINS, comma-separated, e.g. 192.168.1.20) — dev-only.
    allowedDevOrigins: (process.env.DEV_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    // Share and embed links, the Studio, history and sign-in say noindex on
    // every response, redirects and errors included, and so do the /data
    // links kept out of search (src/lib/crawl.ts).
    async headers() {
        return noindexHeaders(gallery);
    },
    // A docs page's raw markdown sits beside it: /docs/<path>.md serves the
    // same file the docs corpus was built from (src/app/docs-md).
    async rewrites() {
        return [
            { source: '/docs.md', destination: '/docs-md' },
            { source: '/docs/:path*.md', destination: '/docs-md/:path*' },
            // The platform doors live under a version prefix: /api/v1/* is the
            // address to publish and the one Cloudflare's rules match, and the
            // unversioned path stays as an alias so nothing already written
            // against it breaks. Only these four families move — the site's own
            // endpoints (auth, events, share, …) are not a public API and keep
            // sitting directly under /api.
            { source: '/api/search/:path*', destination: '/api/v1/search/:path*' },
            { source: '/api/datasets', destination: '/api/v1/datasets' },
            { source: '/api/datasets/:path*', destination: '/api/v1/datasets/:path*' },
            { source: '/api/graph/:path*', destination: '/api/v1/graph/:path*' },
            { source: '/api/studio/:path*', destination: '/api/v1/studio/:path*' },
        ];
    },
    images: {
        disableStaticImages: true,
    },
    sassOptions: {
        loadPaths: [path.join(__dirname, 'src/styles')],
    },
    turbopack: {
        root: __dirname,
        rules: {
            // src/assets/masks/ is left out so a stylesheet url() there stays a
            // hashed, immutable asset. Every other .svg imports as a component.
            '*.svg': {
                condition: { not: { path: /^src\/assets\/masks\// } },
                loaders: ['@svgr/webpack'],
                as: '*.js',
            },
        },
    },
};

// Sentry's build step: source maps go up when SENTRY_AUTH_TOKEN (+ org and
// project) is set at build time, otherwise the build just runs without them.
// Browser reports ride our own same-origin tunnel (src/app/api/monitoring),
// not the plugin's rewrite — see the route for why.
export default withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: !process.env.CI,
    widenClientFileUpload: true,
    disableLogger: true,
});
