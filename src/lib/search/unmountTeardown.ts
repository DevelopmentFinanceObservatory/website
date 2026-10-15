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
 */
export function unmountTeardown(
    teardown: () => void,
    defer: (run: () => void) => void = queueMicrotask,
): { mount: () => void; unmount: () => void } {
    let mounted = false;
    let pending = false;

    return {
        mount() {
            mounted = true;
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
                    teardown();
                }
            });
        },
    };
}
