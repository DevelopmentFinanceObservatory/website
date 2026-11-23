// `pnpm data <slug>`: runs a prototype's data step by hand. app/<slug>/_data/
// fetch.mts runs under Node, fetch.py under `uv run`, which installs the SDK
// its inline metadata pins. The build runs no data step; its own DFO reads run
// in scripts/read.mts. A page reads the JSON the step wrote, which git keeps.
// Arguments after the slug go to every step: `pnpm data <slug> --refresh`.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const APP = path.join(import.meta.dirname, '..');
const [, , slug, ...stepArgs] = process.argv;

if (!slug) {
    console.error('data: usage: pnpm data <slug> [step arguments]');
    process.exit(1);
}

const dir = path.join(APP, 'app', slug, '_data');
const steps = [
    { file: path.join(dir, 'fetch.mts'), command: process.execPath, args: [] as string[] },
    { file: path.join(dir, 'fetch.py'), command: 'uv', args: ['run', '--script'] },
].filter((step) => existsSync(step.file));

if (steps.length === 0) {
    console.error(`data: app/${slug}/_data/ has no fetch.mts or fetch.py.`);
    process.exit(1);
}

for (const step of steps) {
    console.log(`data: running ${path.relative(APP, step.file)}`);

    const run = spawnSync(step.command, [...step.args, step.file, ...stepArgs], {
        cwd: APP,
        stdio: 'inherit',
    });

    if (run.error) {
        console.error(`data: could not start ${step.command}: ${run.error.message}`);
        process.exit(1);
    }

    if (run.status !== 0) {
        process.exit(run.status ?? 1);
    }
}

console.log(`data: ran ${steps.length} step(s). Run pnpm check:data, then commit the JSON.`);
