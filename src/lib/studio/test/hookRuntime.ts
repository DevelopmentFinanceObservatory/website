/**
 * The hooks `useChat` calls (useState, useRef, useMemo, useCallback,
 * useEffect, useLayoutEffect), run outside React so node --test can drive
 * the hook. A test
 * bundles the hook with `react` aliased to this module (loadUseChat).
 * `renderHook` renders once, and renders again on the microtask after each
 * state change, running the effects whose dependencies changed after each
 * render, as React does. Each slot holds what its hook stored there, so
 * reading it back casts to that hook's type.
 */

type Deps = readonly unknown[] | undefined;
type Effect = { deps: Deps; cleanup?: () => void };
type Instance = {
    slots: unknown[];
    at: number;
    effects: (() => void)[];
    scheduled: boolean;
    unmounted: boolean;
    render: () => void;
};

let current: Instance | null = null;

const instance = (): Instance => {
    if (!current) {
        throw new Error('hookRuntime: a hook ran outside renderHook');
    }

    return current;
};

const changed = (prev: Deps, next: Deps): boolean =>
    prev === undefined ||
    next === undefined ||
    prev.length !== next.length ||
    prev.some((value, at) => !Object.is(value, next[at]));

const schedule = (owner: Instance) => {
    if (owner.scheduled || owner.unmounted) {
        return;
    }

    owner.scheduled = true;
    queueMicrotask(() => {
        owner.scheduled = false;

        if (!owner.unmounted) {
            owner.render();
        }
    });
};

export const useState = <T>(init: T | (() => T)) => {
    const owner = instance();
    const at = owner.at++;

    if (owner.slots.length <= at) {
        const slot = {
            value: typeof init === 'function' ? (init as () => T)() : init,
            set: (update: T | ((prev: T) => T)) => {
                const next =
                    typeof update === 'function' ? (update as (prev: T) => T)(slot.value) : update;

                if (!Object.is(next, slot.value)) {
                    slot.value = next;
                    schedule(owner);
                }
            },
        };

        owner.slots.push(slot);
    }

    const slot = owner.slots[at] as { value: T; set: (update: T | ((prev: T) => T)) => void };

    return [slot.value, slot.set] as const;
};

export const useRef = <T>(init: T) => {
    const owner = instance();
    const at = owner.at++;

    if (owner.slots.length <= at) {
        owner.slots.push({ current: init });
    }

    return owner.slots[at] as { current: T };
};

const memo = <T>(make: () => T, deps: Deps): T => {
    const owner = instance();
    const at = owner.at++;
    const slot = owner.slots[at] as { value: T; deps: Deps } | undefined;

    if (!slot || changed(slot.deps, deps)) {
        owner.slots[at] = { value: make(), deps };
    }

    return (owner.slots[at] as { value: T }).value;
};

export const useMemo = memo;

export const useCallback = <T>(callback: T, deps: Deps): T => memo(() => callback, deps);

export const useEffect = (effect: () => void | (() => void), deps: Deps) => {
    const owner = instance();
    const at = owner.at++;
    const slot = owner.slots[at] as Effect | undefined;

    if (slot && !changed(slot.deps, deps)) {
        return;
    }

    const next: Effect = { deps, cleanup: slot?.cleanup };

    owner.slots[at] = next;
    owner.effects.push(() => {
        next.cleanup?.();
        next.cleanup = effect() ?? undefined;
    });
};

// Every effect here runs right after its render, in order, so a layout
// effect is one more of them.
export const useLayoutEffect = useEffect;

/** Render `hook` and keep it rendered: `result()` is its latest return,
 *  `settle()` waits until no render or timer-free async work is pending,
 *  and `unmount()` runs every effect's cleanup. */
export const renderHook = <T>(hook: () => T) => {
    let result: T;
    const owner: Instance = {
        slots: [],
        at: 0,
        effects: [],
        scheduled: false,
        unmounted: false,
        render: () => {
            current = owner;
            owner.at = 0;

            try {
                result = hook();
            } finally {
                current = null;
            }

            const effects = owner.effects.splice(0);

            for (const effect of effects) {
                effect();
            }
        },
    };

    owner.render();

    return {
        result: () => result,
        // Several macrotask turns, so fetch mocks, chained promises and the
        // renders they cause all land.
        settle: async (turns = 20) => {
            for (let turn = 0; turn < turns; turn += 1) {
                await new Promise((resolve) => setImmediate(resolve));
            }
        },
        unmount: () => {
            owner.unmounted = true;

            for (const slot of owner.slots) {
                (slot as Partial<Effect>)?.cleanup?.();
            }
        },
    };
};
