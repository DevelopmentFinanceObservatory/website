/**
 * Lets `node --test` load a server module the way Next's bundler does.
 * Import this module before the module under test, and import that module
 * dynamically, since static imports resolve before this one runs. The hooks
 * live in serverModuleHooks.ts.
 */
import { register } from 'node:module';

register('./serverModuleHooks.ts', import.meta.url);
