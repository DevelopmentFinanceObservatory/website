import { withSentryConfig } from '@sentry/nextjs/config';
import path from 'path';
import type { NextConfig } from 'next';

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
    // A docs page's raw markdown sits beside it: /docs/<path>.md serves the
    // same file the docs corpus was built from (src/app/docs-md).
    async rewrites() {
        return [
            { source: '/docs.md', destination: '/docs-md' },
            { source: '/docs/:path*.md', destination: '/docs-md/:path*' },
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
            '*.svg': {
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
