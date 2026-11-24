import assert from 'node:assert/strict';
import test from 'node:test';

// The prototypes app's build (prototypes/next.config.ts). Set before the
// modules load, since site.ts reads it once.
process.env.NEXT_PUBLIC_SITE_LINK_ORIGIN = 'https://developmentfinance.org';

const { IS_SITE, siteHref } = await import('../site.ts');

test('the prototypes app links to the site by absolute URL', () => {
    assert.equal(IS_SITE, false);
    assert.equal(siteHref('/data'), 'https://developmentfinance.org/data');
});
