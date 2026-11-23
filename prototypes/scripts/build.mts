// `pnpm build`: the static export, assembled as the Worker's assets directory.
// scripts/read.mts first reads every build-read page's DFO data to .build-data/
// and stops the build on a failed read. next build then writes out/; out/ moves to dist/prototypes/, because the Worker
// route keeps /prototypes in the request path, and edge/ (_headers,
// _redirects) copies to the root of dist/ when it exists.
//
// It runs the root install's next, so `pnpm install` must have run at the
// repository root first (prototypes/package.json lists no next or react).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';

const APP = path.join(import.meta.dirname, '..');
const NEXT_BIN = path.join(APP, '../node_modules/next/dist/bin/next');
const OUT = path.join(APP, 'out');
const DIST = path.join(APP, 'dist');
const EDGE = path.join(APP, 'edge');

if (!existsSync(NEXT_BIN)) {
    console.error(`No next at ${NEXT_BIN}. Run pnpm install at the repository root first.`);
    process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
rmSync(DIST, { recursive: true, force: true });

const READ = path.join(APP, 'scripts', 'read.mts');

/** Runs `args` under this Node in APP, exits with its status on a failure, and returns how long
 *  it took in seconds. */
const run = (args: string[]): string => {
    const started = Date.now();
    const child = spawnSync(process.execPath, args, { cwd: APP, stdio: 'inherit' });

    if (child.status !== 0) {
        process.exit(child.status ?? 1);
    }

    return `${((Date.now() - started) / 1000).toFixed(1)} s`;
};

const read = run(['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', READ]);
const build = run([NEXT_BIN, 'build']);

mkdirSync(DIST);
renameSync(OUT, path.join(DIST, 'prototypes'));

if (existsSync(EDGE)) {
    cpSync(EDGE, DIST, { recursive: true });
}

console.log(
    `Assembled ${path.relative(APP, DIST)}/ (export under prototypes/${existsSync(EDGE) ? ', edge/ at the root' : ''}): reads ${read}, next build ${build}.`,
);
