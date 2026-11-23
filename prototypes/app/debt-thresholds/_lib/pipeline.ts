// The page's 2025 view, made at build time by the Python pipeline the data step runs
// (_data/pipeline), so the page shows what the step would compute, with no port to TypeScript.
// `runPipeline` starts `_data/build.py` with `uv run --script` (uv installs the SDK its PEP 723
// header pins) and reads the JSON it prints: the view, the year the page opens on, and each DFO
// read's versions and freshness (`pipeline.stored`). The child sends one request at a time, so it
// holds one slot of the build's reads lane while it runs. It takes no slot of the recipes lane,
// which would hold back the other pages' recipes for the whole run, so one of its recipes can
// run beside their two. Runs on the server only.
import { spawn } from 'node:child_process';
import path from 'node:path';

import type { ViewData } from '../_data/types.ts';

import type { BuildSource, SourcedRead } from '#lib/buildRead.ts';
import type { Lane } from '#lib/pacing.ts';

/** The entry point the build runs, under the build's working directory, `prototypes/`. */
export const PIPELINE_SCRIPT = path.join(
    process.cwd(),
    'app',
    'debt-thresholds',
    '_data',
    'build.py',
);

/** How many lines of the child's log an error carries. */
const LOG_TAIL = 20;

/** What the pipeline makes of DFO's newest stored data. */
export type BuiltThresholds = {
    /** The 2025 view. */
    view: ViewData;
    /** The year the page opens on: the view's, or 2024 when it lacks too much. */
    defaultYear: number;
};

/** What `_data/build.py` prints. */
type Printed = BuiltThresholds & { sources: Record<string, BuildSource> };

/** Starts `command` with `args` and gives its stdout, its stderr and how it ended. */
export type Spawn = (
    command: string,
    args: string[],
    options: { timeout: number },
) => Promise<{ stdout: string; stderr: string; code: number | null; signal: string | null }>;

/** Runs a child process, killing it after `timeout` milliseconds. */
const spawnChild: Spawn = (command, args, { timeout }) =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout });
        const out: Buffer[] = [];
        const err: Buffer[] = [];

        child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
        child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
        child.on('error', reject);
        child.on('close', (code, signal) =>
            resolve({
                stdout: Buffer.concat(out).toString('utf8'),
                stderr: Buffer.concat(err).toString('utf8'),
                code,
                signal,
            }),
        );
    });

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The view, the year and the sources in the child's stdout.
 *
 * @throws When stdout is not the JSON object `pipeline.stored` prints.
 */
export const parsePrinted = (stdout: string): Printed => {
    let printed: unknown;

    try {
        printed = JSON.parse(stdout);
    } catch (error) {
        throw new Error('build.py printed no JSON.', { cause: error });
    }

    if (
        !isRecord(printed) ||
        !isRecord(printed.view) ||
        !Array.isArray(printed.view.countries) ||
        typeof printed.defaultYear !== 'number' ||
        !isRecord(printed.sources) ||
        Object.keys(printed.sources).length === 0
    ) {
        throw new Error('build.py printed JSON without a view, a default year and its sources.');
    }

    // Checked above for the fields the page reads first; pipeline.stored writes the rest.
    return printed as Printed;
};

export type RunPipelineOptions = {
    /** How long the child may take, in milliseconds. */
    timeout: number;
    /** The build's reads lane, one slot of which the child holds. */
    reads?: Lane;
    /** Stands in for starting the child, as a test does. */
    run?: Spawn;
};

/**
 * Runs `_data/build.py` once and returns the 2025 view with the versions it read.
 *
 * @throws When uv cannot start, or the child fails, is killed at `timeout` or prints no view:
 *  an error naming the cause, with the tail of the child's log.
 */
export const runPipeline = async ({
    timeout,
    reads,
    run = spawnChild,
}: RunPipelineOptions): Promise<SourcedRead<string, BuiltThresholds>> => {
    const task = () => run('uv', ['run', '--script', PIPELINE_SCRIPT], { timeout });
    let child: Awaited<ReturnType<Spawn>>;

    try {
        child = await (reads === undefined ? task() : reads.run(task));
    } catch (error) {
        throw new Error(
            'Could not start uv, which runs the 2025 view. Install uv (https://docs.astral.sh/uv/).',
            { cause: error },
        );
    }

    const log = child.stderr.trimEnd().split('\n').slice(-LOG_TAIL).join('\n');

    if (child.code !== 0) {
        const how =
            child.signal === null
                ? `exited ${child.code}`
                : `was stopped (${child.signal}) after ${timeout / 1000} s`;

        throw new Error(`build.py ${how}. Its log ends:\n${log}`);
    }

    const { view, defaultYear, sources } = parsePrinted(child.stdout);

    return { value: { view, defaultYear }, sources };
};
