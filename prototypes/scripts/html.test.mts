import assert from 'node:assert/strict';
import test from 'node:test';

import { decodeEntities } from './html.mts';

test('decodes each entity React writes in an attribute', () => {
    assert.equal(
        decodeEntities('a&amp;b &quot;c&quot; &lt;d&gt; &#x27;e&#39;'),
        'a&b "c" <d> \'e\'',
    );
});

test('decodes once, leaving the text an escaped entity stands for', () => {
    assert.equal(decodeEntities('?q=&amp;quot;'), '?q=&quot;');
    assert.equal(decodeEntities('&amp;amp;'), '&amp;');
    assert.equal(decodeEntities('&amp;#x27;'), '&#x27;');
});

test('leaves unknown entities and bare ampersands alone', () => {
    assert.equal(decodeEntities('&nbsp; & &unknown;'), '&nbsp; & &unknown;');
});
