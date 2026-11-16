import createMDX from '@next/mdx';
import path from 'path';
import type { NextConfig } from 'next';

// The repository root. Shared code lives in ../src and the root install holds
// the one copy of next and react (prototypes/package.json lists neither).
const repoRoot = path.join(__dirname, '..');

const nextConfig: NextConfig = {
    // A static export served from developmentfinance.org/prototypes by a
    // Cloudflare Worker; scripts/build.mts moves out/ to dist/prototypes/.
    output: 'export',
    basePath: '/prototypes',
    // Each page exports as <slug>/index.html.
    trailingSlash: true,
    devIndicators: false,
    agentRules: false,
    pageExtensions: ['ts', 'tsx', 'md', 'mdx'],
    images: {
        disableStaticImages: true,
        unoptimized: true,
    },
    env: {
        // siteHref (src/lib/site.ts) makes links to the main site absolute,
        // since next/link would prefix /prototypes to a root-relative path.
        NEXT_PUBLIC_SITE_LINK_ORIGIN: 'https://developmentfinance.org',
    },
    sassOptions: {
        loadPaths: [path.join(repoRoot, 'src/styles')],
    },
    turbopack: {
        // Turbopack resolves nothing outside its root, and would otherwise
        // stop at prototypes/pnpm-lock.yaml.
        root: repoRoot,
        rules: {
            // The site's rule (next.config.ts at the root). The path is
            // relative to the root above, so src/assets/masks/ stays a
            // hashed asset for stylesheet url()s.
            '*.svg': {
                condition: { not: { path: /^src\/assets\/masks\// } },
                loaders: ['@svgr/webpack'],
                as: '*.js',
            },
        },
    },
};

// Plugins go in by string name only: Turbopack cannot take functions.
const withMDX = createMDX({
    extension: /\.(md|mdx)$/,
});

export default withMDX(nextConfig);
