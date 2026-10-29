/**
 * The demo spec: one Studio conversation, frozen in its running state, that
 * the generator renders to static markup. Every shape below is the app's
 * own type, so a spec says exactly what the Studio would hold.
 */

import type { ChatMessage, PlanState } from '../src/components/organisms/Studio/hooks/useChat.ts';
import type { Widget } from '../src/lib/chat/widgets.ts';
import type { ActivityEntry } from '../src/lib/studio/activity.ts';

/** Where a card sits on the whiteboard, in grid cells. `w` and `h` default
 *  to the span the Studio gives a fresh card of that kind (`spawnSpan`). */
export type CardSlot = { col: number; row: number; w?: number; h?: number };

export type DemoCard = { widget: Widget; slot: CardSlot };

export type Viewport = { width: number; height: number };

export type DemoSpec = {
    // The conversation title in the tools row.
    title: string;
    // The prompt the film types into the chat input.
    question: string;
    // The transcript. A bot message's `plan` is the plan the user approved
    // for that answer, shown under it.
    messages: ChatMessage[];
    // The plan awaiting approval, as useChat holds it.
    plan?: PlanState;
    activity?: ActivityEntry[];
    cards: DemoCard[];
    // CSS px at a 16 px root; 1280×800 when absent.
    viewport?: Viewport;
};

export const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };

/** The narrowest viewport a demo renders at: below it the Studio takes its
 *  phone layout (`breakpoint(phone)`, under 660 px), which the generator
 *  does not model. */
export const MIN_DEMO_WIDTH = 660;

// What PlanCard and PlanLedger read from a PlanState.
const PLAN_FIELDS = [
    'title',
    'summary',
    'steps',
    'answerStepId',
    'decisions',
    'caveats',
    'movedElsewhere',
    'version',
    'actions',
    'interruptId',
    'live',
    'revision',
    'baseline',
    'changed',
    'switched',
    'stepsUpdated',
    'switching',
    'notice',
] as const satisfies readonly (keyof PlanState)[];

/** The design cell in px at a 16 px root (GRID_CELL in GridPattern). */
export const CELL = 20;

/** The class of the element that wraps the fragment and scopes its CSS. */
export const WRAPPER = 'dfo-ui';

/** The root font size the fragment is laid out at. */
export const ROOT_FONT_SIZE = 16;

const fail = (message: string): never => {
    throw new Error(`demo spec: ${message}`);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The spec as parsed JSON, checked for what the generator relies on: the
 * required fields, card ids that are unique and usable as hook names, and
 * bot messages that render (an empty one renders nothing, so it would have
 * no element to carry its hook).
 */
export const readSpec = (raw: unknown): DemoSpec => {
    if (!isRecord(raw)) {
        return fail('expected an object');
    }

    for (const key of ['title', 'question'] as const) {
        if (typeof raw[key] !== 'string' || !raw[key]) {
            fail(`"${key}" must be a non-empty string`);
        }
    }

    if (!Array.isArray(raw.messages) || !Array.isArray(raw.cards)) {
        return fail('"messages" and "cards" must be arrays');
    }

    if (raw.viewport !== undefined) {
        const viewport = raw.viewport as Partial<Viewport>;

        if (
            !isRecord(viewport) ||
            !Number.isInteger(viewport.width) ||
            !Number.isInteger(viewport.height) ||
            viewport.height! <= 0
        ) {
            fail('"viewport" needs whole, positive "width" and "height"');
        }

        if (viewport.width! < MIN_DEMO_WIDTH) {
            fail(
                `"viewport" is ${viewport.width} px wide; the Studio takes its phone layout ` +
                    `under ${MIN_DEMO_WIDTH} px, which the generator does not render`,
            );
        }
    }

    if (raw.plan !== undefined) {
        const missing = isRecord(raw.plan)
            ? PLAN_FIELDS.filter((key) => !(key in (raw.plan as object)))
            : PLAN_FIELDS;

        if (missing.length) {
            fail(`"plan" is a PlanState as useChat holds it; it lacks ${missing.join(', ')}`);
        }
    }

    const spec = raw as DemoSpec;

    spec.messages.forEach((message, index) => {
        if (
            message.role === 'bot' &&
            !message.text &&
            !message.followups?.length &&
            !message.chips?.length &&
            !message.plan
        ) {
            fail(`message ${index} is an empty bot turn, which renders nothing`);
        }
    });

    if (spec.messages.filter((message) => message.role === 'bot' && message.plan).length > 1) {
        fail('only one answer may carry an approved "plan"; its pill is the "plan-pill" hook');
    }

    const ids = new Set<string>();

    for (const { widget, slot } of spec.cards) {
        if (!/^[\w-]+$/.test(widget.id)) {
            fail(`card id "${widget.id}" must be letters, digits, "_" or "-"`);
        }

        if (ids.has(widget.id)) {
            fail(`card id "${widget.id}" is used twice`);
        }

        ids.add(widget.id);

        if (!isRecord(slot)) {
            return fail(`card "${widget.id}" needs a "slot"`);
        }

        for (const key of ['col', 'row'] as const) {
            if (!Number.isInteger(slot[key]) || slot[key] < 0) {
                fail(`card "${widget.id}" needs a whole, non-negative "${key}"`);
            }
        }

        for (const key of ['w', 'h'] as const) {
            const span = slot[key];

            if (span !== undefined && (!Number.isInteger(span) || span <= 0)) {
                fail(`card "${widget.id}" needs a whole, positive "${key}" when it sets one`);
            }
        }
    }

    return spec;
};

// --- page capture -------------------------------------------------------------

/** A `data-v` hook stamped on the one element `selector` finds. */
export type PageHook = { v: string; selector: string };

export type PageStep =
    | { type: 'click' | 'hover' | 'focus'; selector: string }
    | { type: 'type'; selector: string; text: string }
    | { type: 'press'; key: string }
    | { type: 'wait'; selector?: string; ms?: number }
    | { type: 'scroll'; selector?: string; y: number }
    | { type: 'capture'; state: string };

/** A route of the running site, driven through `steps` and snapshotted at
 *  each `capture` step. */
export type PageSpec = {
    name: string;
    // The route with its query, e.g. "/data?q=kenya+debt".
    path: string;
    // CSS px; 1280×800 when absent.
    viewport?: Viewport;
    hooks?: PageHook[];
    // A spec with no capture step captures once at the end, as "page".
    steps?: PageStep[];
};

const failPage = (message: string): never => {
    throw new Error(`page spec: ${message}`);
};

const NAME = /^[\w-]+$/;

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

const readStep = (raw: unknown, index: number): PageStep => {
    const at = `step ${index}`;

    if (!isRecord(raw)) {
        return failPage(`${at} must be an object`);
    }

    const need = (key: string) => {
        if (!isText(raw[key])) {
            failPage(`${at} (${String(raw.type)}) needs a non-empty "${key}"`);
        }
    };
    const optionalNumber = (key: string) => {
        if (raw[key] !== undefined && (typeof raw[key] !== 'number' || raw[key] < 0)) {
            failPage(`${at} (${String(raw.type)}) "${key}" must be a number of at least 0`);
        }
    };

    switch (raw.type) {
        case 'click':
        case 'hover':
        case 'focus':
            need('selector');
            break;
        case 'type':
            need('selector');

            if (typeof raw.text !== 'string') {
                failPage(`${at} (type) needs a "text" string`);
            }

            break;
        case 'press':
            need('key');
            break;
        case 'wait':
            if (raw.selector !== undefined) {
                need('selector');
            }

            optionalNumber('ms');

            if (raw.selector === undefined && raw.ms === undefined) {
                failPage(`${at} (wait) needs a "selector" or "ms"`);
            }

            break;
        case 'scroll':
            if (raw.selector !== undefined) {
                need('selector');
            }

            if (typeof raw.y !== 'number') {
                failPage(`${at} (scroll) needs a "y" number`);
            }

            break;
        case 'capture':
            need('state');

            if (!NAME.test(raw.state as string)) {
                failPage(`${at} state "${String(raw.state)}" must be letters, digits, "_" or "-"`);
            }

            break;
        default:
            failPage(`${at} has the unknown type "${String(raw.type)}"`);
    }

    return raw as PageStep;
};

/**
 * The page spec as parsed JSON, checked for what the capture relies on: a
 * name and a route, a whole-px viewport, hooks with unique names usable as
 * `data-v` values, known steps with their fields, and capture states that
 * are unique and usable as file names.
 */
export const readPageSpec = (raw: unknown): PageSpec => {
    if (!isRecord(raw)) {
        return failPage('expected an object');
    }

    if (!isText(raw.name) || !NAME.test(raw.name)) {
        failPage('"name" must be letters, digits, "_" or "-"');
    }

    if (!isText(raw.path) || !raw.path.startsWith('/')) {
        failPage('"path" must be a route starting with "/"');
    }

    if (raw.viewport !== undefined) {
        const viewport = raw.viewport as Partial<Viewport>;

        if (
            !isRecord(viewport) ||
            !Number.isInteger(viewport.width) ||
            !Number.isInteger(viewport.height) ||
            viewport.width! <= 0 ||
            viewport.height! <= 0
        ) {
            failPage('"viewport" needs whole, positive "width" and "height"');
        }
    }

    const hooks = raw.hooks ?? [];
    const steps = raw.steps ?? [];

    if (!Array.isArray(hooks) || !Array.isArray(steps)) {
        return failPage('"hooks" and "steps" must be arrays');
    }

    const names = new Set<string>();

    for (const hook of hooks) {
        if (!isRecord(hook) || !isText(hook.v) || !isText(hook.selector)) {
            failPage('each hook needs a non-empty "v" and "selector"');
        }

        const { v } = hook as PageHook;

        if (!NAME.test(v)) {
            failPage(`hook "${v}" must be letters, digits, "_" or "-"`);
        }

        if (names.has(v)) {
            failPage(`hook "${v}" is named twice`);
        }

        names.add(v);
    }

    const states = new Set<string>();

    for (const step of steps.map(readStep)) {
        if (step.type === 'capture') {
            if (states.has(step.state)) {
                failPage(`state "${step.state}" is captured twice`);
            }

            states.add(step.state);
        }
    }

    return raw as PageSpec;
};

/** The spec's steps, ending in a capture of "page" when none captures. */
export const pageSteps = (spec: PageSpec): PageStep[] => {
    const steps = spec.steps ?? [];

    return steps.some((step) => step.type === 'capture')
        ? steps
        : [...steps, { type: 'capture', state: 'page' }];
};
