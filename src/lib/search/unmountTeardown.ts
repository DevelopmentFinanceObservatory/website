/**
 * Runs `teardown` once a component has unmounted for good. Call `mount()`
 * from an effect's setup and `unmount()` from its cleanup.
 *
 * React Strict Mode unmounts and remounts every component once in
 * development, running the effect cleanups and setups back to back in one
 * synchronous pass. A teardown run from the cleanup itself would end work a
 * mount effect had just started, such as a `?q=` permalink's search, which
 * its own ref guard then never restarts. `unmount()` defers the teardown by
 * a microtask and runs it only if no `mount()` came in between.
 *
 * `left()` is true from the teardown until the next `mount()`, so async work
 * that resolves after the component has gone can refuse to start more. A
 * Strict Mode remount cancels the teardown and never sets it.
 */
export function unmountTeardown(
    teardown: () => void,
    defer: (run: () => void) => void = queueMicrotask,
): { mount: () => void; unmount: () => void; left: () => boolean } {
    let mounted = false;
    let pending = false;
    let left = false;

    return {
        mount() {
            mounted = true;
            left = false;
        },
        unmount() {
            mounted = false;

            if (pending) {
                return;
            }

            pending = true;
            defer(() => {
                pending = false;

                if (!mounted) {
                    left = true;
                    teardown();
                }
            });
        },
        left: () => left,
    };
}
