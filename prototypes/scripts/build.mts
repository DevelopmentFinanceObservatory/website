// `pnpm build`: the static export, assembled as the Worker's assets directory.
// next build writes out/; out/ moves to dist/prototypes/, because the Worker
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

const build = spawnSync(process.execPath, [NEXT_BIN, 'build'], { cwd: APP, stdio: 'inherit' });

if (build.status !== 0) {
    process.exit(build.status ?? 1);
}

mkdirSync(DIST);
renameSync(OUT, path.join(DIST, 'prototypes'));

if (existsSync(EDGE)) {
    cpSync(EDGE, DIST, { recursive: true });
}

console.log(`Assembled ${path.relative(APP, DIST)}/ (export under prototypes/${existsSync(EDGE) ? ', edge/ at the root' : ''}).`);
