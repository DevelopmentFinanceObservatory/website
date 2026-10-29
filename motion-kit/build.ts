import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build, type Plugin } from 'esbuild';
import type { Browser } from 'playwright-core';
import { compile } from 'sass';

import { launchBrowser } from './browser.ts';
import { dropRootFontSize, externalUrls, filmCss, splitCss } from './css.ts';
import { type CueSheet, readCues } from './cues.ts';
import { htmlLeaks } from './html.ts';
import { type Motion, readMotion } from './motion.ts';
import { previewHtml } from './preview.ts';
import { CELL, DEFAULT_VIEWPORT, ROOT_FONT_SIZE, readSpec, type Viewport } from './spec.ts';
import { type Source, stateClasses, type StyleModules } from './stateClasses.ts';

/**
 * The generator: bundles render.tsx with esbuild (SCSS modules, SVGR icons
 * and Next stubs as the app's build would resolve them), renders the spec,
 * compiles the stylesheet the markup needs and writes the film's modules.
 */

export const KIT = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(KIT, '..');
const STYLES = join(REPO, 'src/styles');
const MASKS = join(REPO, 'src/assets/masks');
export const FONTS = join(REPO, 'node_modules/@fontsource/outfit/files');

/** The largest module the film's store takes. */
export const MODULE_LIMIT = 200 * 1024;

const requireHere = createRequire(import.meta.url);

// --- esbuild plugins ----------------------------------------------------------

const compileScss = (path: string): string =>
    compile(path, { loadPaths: [STYLES], style: 'expanded' }).css;

// `*.module.scss` as CSS modules (esbuild's local-css: deterministic names
// from the file name and the class); any other `.scss` as global CSS.
const scssPlugin: Plugin = {
    name: 'scss',
    setup(bundle) {
        bundle.onLoad({ filter: /\.scss$/ }, (args) => ({
            contents: compileScss(args.path),
            loader: args.path.endsWith('.module.scss') ? 'local-css' : 'css',
            resolveDir: dirname(args.path),
        }));
    },
};

// `*.svg` imported from code becomes a React component through SVGR with
// svgo.config.cjs, as next.config.ts sets it up. A stylesheet's url() and
// the mask files stay data URLs. SVGR comes from @svgr/webpack's own
// dependencies, the copy the app's build uses.
type SvgrTransform = (
    code: string,
    config: Record<string, unknown>,
    state: { filePath: string },
) => Promise<string>;

const svgPlugin = (): Plugin => {
    const fromWebpack = createRequire(requireHere.resolve('@svgr/webpack'));
    const { transform } = fromWebpack('@svgr/core') as { transform: SvgrTransform };
    const plugins = [fromWebpack('@svgr/plugin-svgo'), fromWebpack('@svgr/plugin-jsx')];
    const svgoConfig = requireHere(join(REPO, 'svgo.config.cjs')) as object;

    return {
        name: 'svgr',
        setup(bundle) {
            bundle.onResolve({ filter: /\.svg$/ }, async (args) => {
                if (args.kind === 'url-token' || args.pluginData === 'svgr') {
                    return undefined;
                }

                const found = await bundle.resolve(args.path, {
                    kind: args.kind,
                    resolveDir: args.resolveDir,
                    importer: args.importer,
                    pluginData: 'svgr',
                });

                if (found.errors.length || found.path.startsWith(MASKS)) {
                    return found.errors.length ? { errors: found.errors } : undefined;
                }

                return { path: found.path, namespace: 'svgr' };
            });
            bundle.onLoad({ filter: /.*/, namespace: 'svgr' }, async (args) => ({
                contents: await transform(
                    await readFile(args.path, 'utf8'),
                    { plugins, svgoConfig, exportType: 'default' },
                    { filePath: args.path },
                ),
                loader: 'jsx',
                resolveDir: dirname(args.path),
            }));
        },
    };
};

// Every SCSS module the bundle imports goes through a wrapper that records
// its class map under its path from the repo root, so stateClasses.ts can
// name the classes the components toggle as the bundle hashed them.
const STYLE_MODULES = '__motionKitStyleModules';

const styleModulesPlugin: Plugin = {
    name: 'style-modules',
    setup(bundle) {
        bundle.onResolve({ filter: /\.module\.scss$/ }, async (args) => {
            if (args.pluginData === 'recorded') {
                return undefined;
            }

            const found = await bundle.resolve(args.path, {
                kind: args.kind,
                resolveDir: args.resolveDir,
                importer: args.importer,
                pluginData: 'recorded',
            });

            return found.errors.length
                ? { errors: found.errors }
                : { path: found.path, namespace: 'style-modules' };
        });
        bundle.onLoad({ filter: /.*/, namespace: 'style-modules' }, (args) => ({
            contents: [
                `import styles from ${JSON.stringify(args.path)};`,
                `(globalThis.${STYLE_MODULES} ??= {})[${JSON.stringify(relative(REPO, args.path))}] = styles;`,
                'export default styles;',
            ].join('\n'),
            loader: 'js',
            resolveDir: dirname(args.path),
            pluginData: 'recorded',
        }));
    },
};

const STUBS: Record<string, string> = {
    'next/navigation': join(KIT, 'stubs/next-navigation.ts'),
    'next/link': join(KIT, 'stubs/next-link.tsx'),
    'server-only': join(KIT, 'stubs/server-only.ts'),
};

const stubPlugin: Plugin = {
    name: 'next-stubs',
    setup(bundle) {
        bundle.onResolve({ filter: /^(next\/navigation|next\/link|server-only)$/ }, (args) => ({
            path: STUBS[args.path]!,
        }));
    },
};

// --- the renderer -------------------------------------------------------------

type Renderer = Pick<typeof import('./render.tsx'), 'renderStudio' | 'layoutDefaultChart'>;

/** render.tsx bundled for Node and loaded, with the CSS its imports pulled
 *  in (every module of every component in the bundle), the class map of
 *  each SCSS module and the app's TSX sources in the bundle. */
export const loadRenderer = async (): Promise<{
    renderer: Renderer;
    moduleCss: string;
    styleModules: StyleModules;
    sources: Source[];
}> => {
    const out = await mkdtemp(join(tmpdir(), 'motion-kit-'));

    try {
        const result = await build({
            entryPoints: [join(KIT, 'render.tsx')],
            absWorkingDir: REPO,
            bundle: true,
            platform: 'node',
            format: 'cjs',
            target: 'node22',
            outdir: out,
            write: false,
            metafile: true,
            jsx: 'automatic',
            loader: {
                '.svg': 'dataurl',
                '.woff': 'dataurl',
                '.woff2': 'dataurl',
                '.png': 'dataurl',
            },
            define: { 'process.env.NODE_ENV': '"production"' },
            plugins: [styleModulesPlugin, scssPlugin, svgPlugin(), stubPlugin],
            logLevel: 'silent',
        });
        const js = result.outputFiles.find((file) => file.path.endsWith('.js'));
        const css = result.outputFiles.find((file) => file.path.endsWith('.css'));

        if (!js) {
            throw new Error('motion-kit: esbuild wrote no bundle');
        }

        const bundlePath = join(out, 'render.cjs');

        await writeFile(bundlePath, js.contents);

        const renderer = requireHere(bundlePath) as Renderer;
        const scope = globalThis as { [STYLE_MODULES]?: StyleModules };
        const sources = await Promise.all(
            Object.keys(result.metafile.inputs)
                .filter((path) => path.startsWith('src/') && path.endsWith('.tsx'))
                .map(async (path) => ({ path, text: await readFile(join(REPO, path), 'utf8') })),
        );

        return {
            renderer,
            moduleCss: css?.text ?? '',
            styleModules: scope[STYLE_MODULES] ?? {},
            sources,
        };
    } finally {
        await rm(out, { recursive: true, force: true });
    }
};

// The app's globals (main.scss) without the fluid root size: the fragment
// sits at a 16 px root.
const globalCss = (): string => dropRootFontSize(compileScss(join(STYLES, 'main.scss')));

// --- outputs ------------------------------------------------------------------

export type Module = { name: string; kind: 'css' | 'html' | 'json' | 'js'; text: string };

export type Generated = {
    outDir: string;
    modules: Module[];
    manifest: Record<string, unknown>;
};

const bytes = (text: string) => Buffer.byteLength(text);

/** A module as the film's store holds it, the document the limit applies to. */
const storeDocument = ({ kind, text }: Pick<Module, 'kind' | 'text'>) =>
    JSON.stringify({ kind, text });

/** The film's stylesheet as one `dfo-ui.css` module, or `dfo-ui.css~1`,
 *  `~2` and so on when its store document passes the module limit. Refuses
 *  a stylesheet that points outside the film. */
export const cssModules = (css: string): Module[] => {
    const leaks = externalUrls(css);

    if (leaks.length) {
        throw new Error(`motion-kit: the CSS points outside the film: ${leaks.join(', ')}`);
    }

    // A piece's text costs its JSON-escaped bytes, without the quotes, on
    // top of the wrapper an empty document takes.
    const pieces = splitCss(
        css,
        MODULE_LIMIT - bytes(storeDocument({ kind: 'css', text: '' })),
        (text) => bytes(JSON.stringify(text)) - 2,
    );

    return pieces.map((text, index) => ({
        name: pieces.length === 1 ? 'dfo-ui.css' : `dfo-ui.css~${index + 1}`,
        kind: 'css',
        text,
    }));
};

export const manifestModule = (manifest: Record<string, unknown>): Module => ({
    name: 'manifest.json',
    kind: 'json',
    text: `${JSON.stringify(manifest, null, 2)}\n`,
});

/**
 * Writes `files` plus the runtime as `shared.js` to `target`, each as a
 * file and as a Motion store document under `store/modules/`, after
 * checking every module's store document against the limit, and
 * `preview.html` to play them (`preview.ts`). Replaces a previous film at
 * `target`; refuses a non-empty directory without a `manifest.json`.
 */
export const writeFilm = async (target: string, files: Module[]): Promise<Module[]> => {
    const modules: Module[] = [
        ...files,
        // Motion runs a film's shared.js once before any scene: the runtime
        // that mounts and animates the fragment.
        {
            name: 'shared.js',
            kind: 'js',
            text: await readFile(join(KIT, 'runtime/dfo-motion.js'), 'utf8'),
        },
    ];

    for (const file of modules) {
        const size = bytes(storeDocument(file));

        if (size > MODULE_LIMIT) {
            throw new Error(
                `motion-kit: ${file.name} is ${size} bytes stored, over the ${MODULE_LIMIT} limit`,
            );
        }
    }

    const existing: string[] = await readdir(target).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
            return [];
        }

        throw new Error(`motion-kit: cannot write the film to ${target}`, { cause: error });
    });

    if (existing.length && !existing.includes('manifest.json')) {
        throw new Error(
            `motion-kit: ${target} holds files and no manifest.json, so it is not a film to replace`,
        );
    }

    await rm(target, { recursive: true, force: true });
    await mkdir(join(target, 'store/modules'), { recursive: true });

    for (const file of modules) {
        await writeFile(join(target, file.name), file.text);
        await writeFile(join(target, 'store/modules', `${file.name}.json`), storeDocument(file));
    }

    await writeFile(join(target, 'preview.html'), previewHtml(basename(target), modules));

    return modules;
};

/** A checked cue sheet as the film's `cues.json`. */
export const cuesModule = (cues: CueSheet): Module => ({
    name: 'cues.json',
    kind: 'json',
    text: `${JSON.stringify(cues, null, 2)}\n`,
});

/** The JSON file at `path`, with the path in the error when it does not parse. */
export const readJson = async (path: string): Promise<unknown> => {
    const text = await readFile(path, 'utf8');

    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`motion-kit: ${path} is not valid JSON: ${(error as Error).message}`, {
            cause: error,
        });
    }
};

/** The cue sheet beside the spec, `<spec>.cues.json`, or null without one. */
export const cuesBeside = async (specPath: string): Promise<unknown> => {
    const path = join(dirname(specPath), `${basename(specPath, extname(specPath))}.cues.json`);

    try {
        return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }

        throw new Error(`motion-kit: cannot read the cue sheet ${path}`, { cause: error });
    }
};

/**
 * In Chrome, the fragment under the stylesheet with its motion kept: the
 * app's motion as data (motion.ts), and the cues whose `sel` finds nothing
 * inside their hook.
 */
const inspectFragment = async ({
    browser,
    viewport,
    html,
    motionCss,
    states,
    cues,
}: {
    browser: Browser;
    viewport: Viewport;
    html: string;
    motionCss: string;
    states: Parameters<typeof readMotion>[1]['stateClasses'];
    cues: CueSheet | null;
}): Promise<Motion> => {
    const page = await browser.newPage({ viewport });

    try {
        await page.setContent(
            `<!doctype html><html><head><style>${motionCss}</style></head>` +
                `<body style="margin:0">${html}</body></html>`,
        );

        const motion = await readMotion(page, { motionCss, stateClasses: states });
        const targets = (cues?.cues ?? []).flatMap(({ v, sel }) => (sel ? [{ v, sel }] : []));
        const lost = await page.evaluate(
            (list) =>
                list.filter(({ v, sel }) => !document.querySelector(`[data-v="${v}"] ${sel}`)),
            targets,
        );

        if (lost.length) {
            throw new Error(
                `cue sheet: nothing at ${lost.map(({ v, sel }) => `"${sel}" in "${v}"`).join(', ')}`,
            );
        }

        return motion;
    } finally {
        await page.close();
    }
};

// In-page links lead nowhere in a film; `#` keeps them links for `:link`
// and `[href]`, as a capture leaves them.
const inertLinks = (html: string): string =>
    html.replace(/(<a\s(?:[^>]*\s)?href=")(?!#|data:)[^"]*"/g, '$1#"');

export const generate = async ({
    specPath,
    outDir,
    browser,
}: {
    specPath: string;
    outDir?: string;
    // A running browser to read the motion in; one is launched and closed
    // when absent.
    browser?: Browser;
}): Promise<Generated> => {
    const spec = readSpec(await readJson(specPath));
    const rawCues = await cuesBeside(specPath);
    const viewport = spec.viewport ?? DEFAULT_VIEWPORT;
    const target = outDir ?? join(KIT, 'dist', basename(specPath, extname(specPath)));
    // The activity log prints clock times in the process's zone; UTC makes
    // the markup the same on every machine.
    process.env.TZ = 'UTC';

    const { renderer, moduleCss, styleModules, sources } = await loadRenderer();
    const rendered = renderer.renderStudio(spec, { fontsDir: FONTS });
    const html = inertLinks(rendered.html);
    const leaks = htmlLeaks(html);

    if (leaks.length) {
        throw new Error(`motion-kit: the Studio fragment still holds ${leaks.join(', ')}`);
    }

    const cues =
        rawCues === null
            ? null
            : readCues(rawCues, rendered.hooks, { states: Object.keys(rendered.states) });
    const stylesheet = `${globalCss()}\n${moduleCss}\n${rendered.css}`;
    const css = cssModules(filmCss(stylesheet, viewport));
    const own = browser ? null : await launchBrowser();
    const motion = await inspectFragment({
        browser: browser ?? own!,
        viewport,
        html,
        motionCss: filmCss(stylesheet, viewport, { keepMotion: true }),
        states: stateClasses(sources, styleModules, REPO),
        cues,
    }).finally(() => own?.close());

    // Once the motion is read, the keyframe names an `animate` cue plays.
    if (cues) {
        readCues(cues, rendered.hooks, {
            states: Object.keys(rendered.states),
            keyframes: Object.keys(motion.keyframes),
            animated: [...new Set(motion.animations.flatMap(({ v }) => (v ? [v] : [])))],
        });
    }
    const manifest = {
        viewport,
        rootFontSize: ROOT_FONT_SIZE,
        cell: CELL,
        question: spec.question,
        modules: {
            css: css.map((file) => file.name),
            html: 'studio.html',
            ...(cues ? { cues: 'cues.json' } : {}),
        },
        hooks: rendered.hooks,
        states: rendered.states,
        classes: rendered.classes,
        cards: rendered.cards,
        charts: rendered.charts,
        ...motion,
    };
    const modules = await writeFilm(target, [
        ...css,
        { name: 'studio.html', kind: 'html', text: html },
        manifestModule(manifest),
        ...(cues ? [cuesModule(cues)] : []),
    ]);

    return { outDir: relative(process.cwd(), target) || '.', modules, manifest };
};
