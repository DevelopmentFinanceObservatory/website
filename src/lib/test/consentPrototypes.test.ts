import assert from 'node:assert/strict';
import test from 'node:test';

// The prototypes app's build (prototypes/next.config.ts). Set before the
// modules load, since site.ts reads it once.
process.env.NEXT_PUBLIC_SITE_LINK_ORIGIN = 'https://developmentfinance.org';

const { CMP_LOADER_SRC, CMP_SETTINGS_ID, showPrivacySettings } = await import('../consent.ts');
const { IS_SITE, siteHref } = await import('../site.ts');

test('the prototypes app links to the site by absolute URL', () => {
    assert.equal(IS_SITE, false);
    assert.equal(siteHref('/data'), 'https://developmentfinance.org/data');
});

test('privacy settings load the CMP once and open its settings when its interface is up', async () => {
    const appended: { src?: string; attributes: Record<string, string> }[] = [];
    let opened = 0;
    const win = Object.assign(new EventTarget(), {
        __ucCmp: undefined as unknown,
        setTimeout,
        clearTimeout,
    });

    Object.assign(globalThis, {
        window: win,
        document: {
            createElement: () => {
                const attributes: Record<string, string> = {};

                return {
                    attributes,
                    setAttribute: (name: string, value: string) => (attributes[name] = value),
                };
            },
            head: { appendChild: (node: (typeof appended)[number]) => appended.push(node) },
        },
    });

    showPrivacySettings();
    showPrivacySettings();
    assert.equal(appended.length, 1);
    assert.equal(appended[0]?.src, CMP_LOADER_SRC);
    assert.equal(appended[0]?.attributes['data-settings-id'], CMP_SETTINGS_ID);

    // The loader's script defines the CMP, which reports itself initialised
    // before its interface is.
    win.__ucCmp = {
        isInitialized: async () => true,
        showSecondLayer: async () => void (opened += 1),
    };
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(opened, 0);

    win.dispatchEvent(new Event('UC_UI_INITIALIZED'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(opened, 2);

    delete (globalThis as { window?: unknown }).window;
    delete (globalThis as { document?: unknown }).document;
});
