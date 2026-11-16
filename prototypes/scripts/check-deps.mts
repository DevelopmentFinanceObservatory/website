// `pnpm check:deps`: the prototypes app runs on the root install's one copy of
// next and react. A second copy under prototypes/node_modules would load two
// Reacts and two Next routers (hooks and <Link> break), and a second
// @types/react breaks the type check. This fails when one appears, directly or
// through a dependency, and when @next/mdx no longer matches the root's next.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const APP = path.join(import.meta.dirname, '..');
const OWN = path.join(APP, 'node_modules');
const ROOT = path.join(APP, '..', 'node_modules');
const FORBIDDEN = ['next', 'react', 'react-dom', '@types/react', '@types/react-dom'];

const failures: string[] = [];

const version = (dir: string, name: string): string | null => {
    const file = path.join(dir, name, 'package.json');

    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).version : null;
};

if (!existsSync(OWN)) {
    failures.push('prototypes/node_modules is missing: run pnpm install in prototypes/.');
}

const rootNext = version(ROOT, 'next');

if (!rootNext) {
    failures.push('next is missing from the root node_modules: run pnpm install at the repository root.');
}

for (const name of FORBIDDEN) {
    if (existsSync(path.join(OWN, name))) {
        failures.push(`prototypes/node_modules/${name} exists; it must resolve from the root install.`);
    }
}

// pnpm keeps every package, transitive ones included, under .pnpm as
// <name with + for />@<version>.
const store = path.join(OWN, '.pnpm');

if (existsSync(store)) {
    const prefixes = FORBIDDEN.map((name) => `${name.replace('/', '+')}@`);

    for (const entry of readdirSync(store)) {
        if (prefixes.some((prefix) => entry.startsWith(prefix))) {
            failures.push(`prototypes/node_modules/.pnpm/${entry}: a dependency pulled in its own copy.`);
        }
    }
}

const mdx = version(OWN, '@next/mdx');

if (rootNext && mdx !== rootNext) {
    failures.push(`@next/mdx is ${mdx ?? 'not installed'} but the root's next is ${rootNext}; pin @next/mdx to ${rootNext}.`);
}

if (failures.length > 0) {
    console.error(failures.map((failure) => `check:deps: ${failure}`).join('\n'));
    process.exit(1);
}

console.log(`check:deps: one next (${rootNext}) and one react, from the root install; @next/mdx ${mdx}.`);
