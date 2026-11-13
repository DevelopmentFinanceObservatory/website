/**
 * Lets `node --test` load a server module the way Next's bundler does: `@/`
 * resolves to src/, an extensionless relative import in the repo's own code
 * to its .ts file or index.ts, and `server-only` to an empty module (Next
 * resolves it to one in a server bundle). Everything else resolves as Node
 * would.
 *
 * Import this module before the module under test, and import that module
 * dynamically, since static imports resolve before this one runs.
 */
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = new URL('../../', import.meta.url);
const EMPTY_MODULE = 'data:text/javascript,';
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;

const ownCode = (parentURL: string | undefined): parentURL is string =>
    parentURL !== undefined &&
    parentURL.startsWith('file:') &&
    !parentURL.includes('/node_modules/');

registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === 'server-only') {
            return { url: EMPTY_MODULE, shortCircuit: true };
        }

        const aliased = specifier.startsWith('@/')
            ? new URL(specifier.slice(2), SRC).href
            : specifier;

        if (ownCode(context.parentURL) && /^(?:\.|file:)/.test(aliased)) {
            const path = fileURLToPath(new URL(aliased, context.parentURL));

            if (!SOURCE_FILE.test(path) || !existsSync(path)) {
                const file = [`${path}.ts`, `${path}/index.ts`].find((candidate) =>
                    existsSync(candidate),
                );

                if (file) {
                    return { url: pathToFileURL(file).href, shortCircuit: true };
                }
            }
        }

        return nextResolve(aliased, context);
    },
});
