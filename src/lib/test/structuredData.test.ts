import assert from 'node:assert/strict';
import test from 'node:test';

import { jsonLdText } from '../structuredData.ts';

test('jsonLdText leaves no < that could close the script or open a comment', () => {
    const data = { name: '</script><script>alert(1)</script>', description: '<!-- a -->' };
    const text = jsonLdText(data);

    assert.doesNotMatch(text, /</);
    assert.deepEqual(JSON.parse(text), data);
});
