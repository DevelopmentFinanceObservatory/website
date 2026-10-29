/**
 * `next/navigation` for a render outside Next: the Studio's own path, a
 * router that goes nowhere and no query.
 */

const noop = () => {};

export const usePathname = (): string => '/studio';

export const useRouter = () => ({
    push: noop,
    replace: noop,
    refresh: noop,
    back: noop,
    forward: noop,
    prefetch: noop,
});

export const useSearchParams = (): URLSearchParams => new URLSearchParams();
