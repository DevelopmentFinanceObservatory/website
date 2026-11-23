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

/** How long a stopped child's process group has after SIGTERM before SIGKILL. */
export const KILL_GRACE_MS = 5_000;

/** How a child ended: its output, its exit code or signal, and whether it was stopped at its
 *  timeout or because the page's build was abandoned. */
export type Ended = {
    stdout: string;
    stderr: string;
    code: number | null;
    signal: string | null;
    stopped: 'timeout' | 'aborted' | null;
};

export type SpawnOptions = {
    /** How long the child may run, in milliseconds. */
    timeout: number;
    /** Stops the child when it aborts, as when another read of the page fails. */
    signal?: AbortSignal;
    /** How long the child's process group has after SIGTERM before SIGKILL. */
    grace?: number;
};

/** Starts `command` with `args` and gives its stdout, its stderr and how it ended. */
export type Spawn = (command: string, args: string[], options: SpawnOptions) => Promise<Ended>;

/**
 * Runs a child process in its own process group, so stopping it stops what it starts too, as
 * the Python process uv starts. At `timeout`, or when `signal` aborts, the group gets SIGTERM
 * and, if it is still running `grace` milliseconds later, SIGKILL.
 */
export const spawnChild: Spawn = (command, args, { timeout, signal, grace = KILL_GRACE_MS }) =>
    new Promise((resolve, reject) => {
        if (signal?.aborted) {
            resolve({ stdout: '', stderr: '', code: null, signal: null, stopped: 'aborted' });

            return;
        }

        const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
        const out: Buffer[] = [];
        const err: Buffer[] = [];
        let stopped: Ended['stopped'] = null;
        let killer: NodeJS.Timeout | undefined;

        const killGroup = (how: NodeJS.Signals): void => {
            try {
                // A negative pid signals the whole group, whose leader is the child.
                process.kill(-child.pid!, how);
            } catch {
                // The group has already gone.
            }
        };
        const stop = (why: NonNullable<Ended['stopped']>): void => {
            if (stopped !== null) {
                return;
            }

            stopped = why;
            killGroup('SIGTERM');
            killer = setTimeout(() => killGroup('SIGKILL'), grace);
        };
        const timer = setTimeout(() => stop('timeout'), timeout);
        const onAbort = (): void => stop('aborted');

        signal?.addEventListener('abort', onAbort, { once: true });
        child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
        child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
        child.on('error', (error) => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
            reject(error);
        });
        child.on('close', (code, ended) => {
            clearTimeout(timer);
            clearTimeout(killer);
            signal?.removeEventListener('abort', onAbort);
            // The leader has ended; anything left in its group goes with it.
            killGroup('SIGKILL');
            resolve({
                stdout: Buffer.concat(out).toString('utf8'),
                stderr: Buffer.concat(err).toString('utf8'),
                code,
                signal: ended,
                stopped,
            });
        });
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
    /** Stops the child when it aborts, as when the page's other read fails. */
    signal?: AbortSignal;
    /** The build's reads lane, one slot of which the child holds. */
    reads?: Lane;
    /** Stands in for starting the child, as a test does. */
    run?: Spawn;
};

/**
 * Runs `_data/build.py` once and returns the 2025 view with the versions it read.
 *
 * @throws When uv cannot start, or the child fails, is stopped at `timeout` or by `signal`, or
 *  prints no view: an error naming the cause, with the tail of the child's log.
 */
export const runPipeline = async ({
    timeout,
    signal,
    reads,
    run = spawnChild,
}: RunPipelineOptions): Promise<SourcedRead<string, BuiltThresholds>> => {
    const task = () => run('uv', ['run', '--script', PIPELINE_SCRIPT], { timeout, signal });
    let child: Ended;

    try {
        child = await (reads === undefined ? task() : reads.run(task));
    } catch (error) {
        throw new Error(
            'Could not start uv, which runs the 2025 view. Install uv (https://docs.astral.sh/uv/).',
            { cause: error },
        );
    }

    const log = child.stderr.trimEnd().split('\n').slice(-LOG_TAIL).join('\n');

    if (child.stopped === 'aborted') {
        throw new Error("build.py was stopped because the page's build was abandoned.");
    }

    if (child.code !== 0) {
        const how =
            child.stopped === 'timeout'
                ? `was stopped (${child.signal ?? 'timeout'}) after ${timeout / 1000} s`
                : child.signal === null
                  ? `exited ${child.code}`
                  : `was stopped (${child.signal})`;

        throw new Error(`build.py ${how}. Its log ends:\n${log}`);
    }

    const { view, defaultYear, sources } = parsePrinted(child.stdout);

    return { value: { view, defaultYear }, sources };
};
