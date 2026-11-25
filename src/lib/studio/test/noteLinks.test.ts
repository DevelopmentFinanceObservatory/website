import assert from 'node:assert/strict';
import test from 'node:test';

import { linkTarget, noteParts, noteText } from '../noteLinks.ts';

test('a note splits into text and its http(s) links, and joins back unchanged', () => {
    const note =
        'See [the IMF](https://imf.org/x) and\n[this](javascript:alert(1)) [ok](http://a.b).';
    const parts = noteParts(note);

    assert.deepEqual(parts, [
        { text: 'See ' },
        { text: 'the IMF', href: 'https://imf.org/x' },
        { text: ' and\n[this](javascript:alert(1)) ' },
        { text: 'ok', href: 'http://a.b' },
        { text: '.' },
    ]);
    assert.equal(noteText(parts), note);
});

test('a typed target is an http(s) URL or nothing', () => {
    assert.equal(linkTarget(' imf.org/data '), 'https://imf.org/data');
    assert.equal(linkTarget('http://a.b/c'), 'http://a.b/c');
    assert.equal(linkTarget('http://localhost:3000/studio/x'), 'http://localhost:3000/studio/x');
    assert.equal(linkTarget('javascript:alert(1)'), null);
    assert.equal(linkTarget('mailto:a@b.c'), null);
    assert.equal(linkTarget('word'), null);
    assert.equal(linkTarget(''), null);
});
