/**
 * `pnpm motion-kit <spec.json> [--out dir]`: renders a demo spec to the
 * film's modules.
 * `pnpm motion-kit capture <page.json> [--base url] [--out dir]`: captures a
 * page of the running site. See motion-kit/README.md.
 */

import { parseArgs } from 'node:util';

import type { Module } from './build.ts';

const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { out: { type: 'string' }, base: { type: 'string' } },
});

const capturing = positionals[0] === 'capture';
const specs = capturing ? positionals.slice(1) : positionals;

if (specs.length !== 1 || (values.base && !capturing)) {
    console.error(
        'usage: pnpm motion-kit <spec.json> [--out dir]\n' +
            '       pnpm motion-kit capture <page.json> [--base http://localhost:3000] [--out dir]',
    );
    process.exit(2);
}

const report = (outDir: string, modules: Module[]) => {
    for (const file of modules) {
        console.log(
            `${outDir}/${file.name}  ${(Buffer.byteLength(file.text) / 1024).toFixed(1)} KiB`,
        );
    }
};

try {
    if (capturing) {
        const { generatePage } = await import('./capture.ts');
        const generated = await generatePage({
            specPath: specs[0]!,
            base: values.base,
            outDir: values.out,
        });

        report(generated.outDir, generated.modules);

        for (const line of generated.dropped) {
            console.log(`dropped: ${line}`);
        }
    } else {
        const { generate } = await import('./build.ts');
        const { outDir, modules } = await generate({ specPath: specs[0]!, outDir: values.out });

        report(outDir, modules);
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}
