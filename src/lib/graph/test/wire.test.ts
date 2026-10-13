import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { renderGraphWire, SNAPSHOT, TYPES } from '../../../../scripts/graph-wire.mts';

test('schema.d.ts is what the committed Graph API schema snapshot generates', async () => {
    const rendered = await renderGraphWire(await readFile(SNAPSHOT, 'utf8'));

    assert.equal(
        await readFile(TYPES, 'utf8'),
        rendered,
        'src/lib/graph/schema.d.ts differs from what the snapshot generates; run `pnpm graph:types` and review the diff',
    );
});
