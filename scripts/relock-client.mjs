// Points pnpm-lock.yaml at the vendored API client tarball as it is on disk.
// The tarball is the file that package.json's `@developmentfinance/client`
// entry names. The script rewrites that tarball's `resolution` line in the
// lockfile to the file's sha512 integrity, and fails unless exactly one line
// matches. It then deletes the client's directory under node_modules/.pnpm,
// since pnpm reuses an installed `file:` package whose name and version are
// unchanged and so ignores a rebuilt tarball. `just relock-client` runs this
// and then `pnpm install --frozen-lockfile`.
//
//   node scripts/relock-client.mjs
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const NAME = '@developmentfinance/client';

const spec = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).dependencies?.[NAME];
if (!spec?.startsWith('file:')) {
    throw new Error(`package.json must point ${NAME} at a file: tarball, found ${spec}`);
}
const tarball = spec.slice('file:'.length);

const integrity = `sha512-${createHash('sha512').update(readFileSync(path.join(ROOT, tarball))).digest('base64')}`;

const lockPath = path.join(ROOT, 'pnpm-lock.yaml');
const lines = readFileSync(lockPath, 'utf8').split('\n');
const line = /^(\s+resolution: \{integrity: )[^,]+(, tarball: file:.+\})$/;
const matches = lines.flatMap((text, i) => (text.endsWith(`tarball: ${spec}}`) && line.test(text) ? [i] : []));
if (matches.length !== 1) {
    throw new Error(`expected one resolution line for ${spec} in pnpm-lock.yaml, found ${matches.length}`);
}
lines[matches[0]] = lines[matches[0]].replace(line, `$1${integrity}$2`);
writeFileSync(lockPath, lines.join('\n'));
console.log(`pnpm-lock.yaml:${matches[0] + 1} -> ${integrity}`);

const pnpmDir = path.join(ROOT, 'node_modules', '.pnpm');
const stale = (existsSync(pnpmDir) ? readdirSync(pnpmDir) : []).filter((d) =>
    d.startsWith(`${NAME.replace('/', '+')}@`),
);
for (const dir of stale) rmSync(path.join(pnpmDir, dir), { recursive: true });
console.log(`removed ${stale.length} stale install${stale.length === 1 ? '' : 's'} under node_modules/.pnpm`);
