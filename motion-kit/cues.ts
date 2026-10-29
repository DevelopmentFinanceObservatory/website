/**
 * A demo's cue sheet, `<spec>.cues.json` beside the spec: the film's camera
 * keys and the cues that animate the fragment's hooks. The generator checks
 * it against the render and copies it into the output as `cues.json`.
 */

export const CUE_KINDS = [
    'show',
    'pop',
    'stream',
    'draw',
    'type',
    'press',
    'hide',
    'remove',
    'tab',
    'animate',
    'state',
] as const;

export type CueKind = (typeof CUE_KINDS)[number];

/** A camera key: at `t` s the view rests on `hook` (or a point) at zoom `z`.
 *  A page capture's key may hold for one captured state only, `in`. */
export type CameraKey = { t: number; hook?: string; in?: string } & Record<string, unknown>;

/** A cue on hook `v`, or on `sel` inside it, starting at `at` s. A `tab`
 *  cue names the view it leaves in `from`; a `draw` cue may name the line's
 *  dots in `points`. An `animate` cue plays the app's animations on `v`, or
 *  every one with the keyframes `name`; a `state` cue switches to the
 *  manifest state `to` and names no hook. A page capture's cue may play in
 *  one captured state only, `in`. */
export type Cue = {
    v?: string;
    name?: string;
    to?: string;
    sel?: string;
    kind: CueKind;
    at: number;
    from?: string;
    points?: string;
    in?: string;
} & Record<string, unknown>;

export type CueSheet = { keys: CameraKey[]; cues: Cue[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const KINDS = new Set<string>(CUE_KINDS);

/** What a cue sheet may name besides hooks: the render's keyframe names and
 *  manifest states. Keyframe names go unchecked when `keyframes` is absent,
 *  as before the motion has been read. `page` is a page capture's states and
 *  each hook's box in each (null where the hook is absent); with it, a cue
 *  or key may name its state in `in`, and its hooks must be in that state,
 *  or in every state when it names none. Hooks go unchecked against states
 *  when `boxes` is absent, as before the page is captured. */
export type CueTargets = {
    keyframes?: readonly string[];
    // The hooks the app animates; unchecked when absent, as before the
    // motion has been read.
    animated?: readonly string[];
    states?: readonly string[];
    page?: { states: readonly string[]; boxes?: Record<string, Record<string, unknown>> };
};

/**
 * The cue sheet as parsed JSON, checked against the render's `hooks`: every
 * hook, keyframe name and state a cue or key names is in the render, every
 * cue has a known kind and a start time, and the keys run forward in time.
 * Lists every problem.
 */
export const readCues = (
    raw: unknown,
    hooks: readonly string[],
    { keyframes, animated, states = [], page }: CueTargets = {},
): CueSheet => {
    const known = new Set(hooks);
    const problems: string[] = [];
    // The captured states an item plays in, or null when its `in` is wrong.
    const playsIn = (where: string, item: Record<string, unknown>) => {
        if (item.in === undefined) {
            return page?.states ?? [];
        }

        if (!page) {
            problems.push(`${where} names a state in "in", which only a page capture's may`);

            return null;
        }

        if (typeof item.in !== 'string' || !page.states.includes(item.in)) {
            problems.push(`${where} is in "${String(item.in)}", which is not a captured state`);

            return null;
        }

        return [item.in];
    };
    const hook = (where: string, value: unknown, shownIn: readonly string[] | null = []) => {
        if (typeof value !== 'string' || !known.has(value)) {
            problems.push(`${where} names "${String(value)}", which is not a hook of the fragment`);

            return;
        }

        const boxes = page?.boxes;
        const absent = boxes
            ? (shownIn ?? []).filter((state) => boxes[value]?.[state] == null)
            : [];

        if (absent.length) {
            problems.push(`${where} names "${value}", which is absent from ${absent.join(', ')}`);
        }
    };

    // Optional numeric fields must be numbers, or the runtime computes NaN
    // and the cue silently never moves.
    const numbers = (where: string, item: Record<string, unknown>, fields: readonly string[]) => {
        for (const field of fields) {
            if (item[field] !== undefined && !Number.isFinite(item[field])) {
                problems.push(`${where} has a "${field}" that is not a number`);
            }
        }
    };

    if (!isRecord(raw) || !Array.isArray(raw.keys) || !Array.isArray(raw.cues)) {
        throw new Error('cue sheet: expected an object with "keys" and "cues" arrays');
    }

    const keys: unknown[] = raw.keys;
    const cues: unknown[] = raw.cues;

    keys.forEach((key, index) => {
        const where = `key ${index}`;

        if (!isRecord(key) || typeof key.t !== 'number') {
            problems.push(`${where} needs a time "t" in seconds`);

            return;
        }

        const previous = keys[index - 1] as { t?: unknown } | undefined;

        if (typeof previous?.t === 'number' && key.t <= previous.t) {
            problems.push(
                `${where} at ${key.t} s does not come after key ${index - 1} at ${previous.t} s`,
            );
        }

        const shownIn = playsIn(where, key);

        numbers(where, key, ['z', 'hold', 'cx', 'cy', 'from']);

        if (
            key.drift !== undefined &&
            !(
                Array.isArray(key.drift) &&
                key.drift.length === 3 &&
                key.drift.every(Number.isFinite)
            )
        ) {
            problems.push(`${where} needs "drift" as three numbers`);
        }

        if (key.hook !== undefined) {
            hook(where, key.hook, shownIn);
        }
    });

    cues.forEach((cue, index) => {
        const where = `cue ${index}`;

        if (!isRecord(cue)) {
            problems.push(`${where} must be an object`);

            return;
        }

        const shownIn = playsIn(where, cue);

        if (page && ['animate', 'state', 'tab'].includes(cue.kind as string)) {
            problems.push(`${where} is a "${String(cue.kind)}" cue, which needs the Studio`);
        } else if (cue.kind === 'state') {
            if (typeof cue.to !== 'string' || !states.includes(cue.to)) {
                problems.push(
                    `${where} switches to "${String(cue.to)}", which is not a manifest state`,
                );
            }
        } else if (cue.kind === 'animate' && cue.v === undefined) {
            if (typeof cue.name !== 'string' || (keyframes && !keyframes.includes(cue.name))) {
                problems.push(
                    `${where} plays "${String(cue.name)}", which is not a keyframe of the render`,
                );
            }
        } else if (cue.kind === 'animate' && cue.name !== undefined) {
            problems.push(`${where} names both a hook and keyframes; an animate cue takes one`);
        } else {
            hook(where, cue.v, shownIn);

            if (cue.kind === 'animate' && animated && !animated.includes(cue.v as string)) {
                problems.push(
                    `${where} animates "${String(cue.v)}", which the app does not animate`,
                );
            }
        }

        if (cue.kind === 'tab' && cue.from === undefined) {
            problems.push(`${where} needs "from", the view the tab leaves`);
        }

        if (cue.kind === 'type' && typeof cue.text !== 'string') {
            problems.push(`${where} needs the "text" to type`);
        }

        numbers(where, cue, ['dur', 'dy', 'wps', 'cps', 'clearAt']);

        if (typeof cue.kind !== 'string' || !KINDS.has(cue.kind)) {
            problems.push(
                `${where} has the kind "${String(cue.kind)}"; kinds are ${CUE_KINDS.join(', ')}`,
            );
        }

        if (typeof cue.at !== 'number') {
            problems.push(`${where} needs a start time "at" in seconds`);
        }

        if (cue.sel !== undefined && (typeof cue.sel !== 'string' || !cue.sel)) {
            problems.push(`${where} has an empty "sel"`);
        }

        for (const field of ['from', 'points'] as const) {
            if (cue[field] !== undefined) {
                hook(`${where} "${field}"`, cue[field], shownIn);
            }
        }
    });

    if (problems.length) {
        throw new Error(`cue sheet:\n- ${problems.join('\n- ')}`);
    }

    return raw as CueSheet;
};
