import assert from 'node:assert/strict';
import test from 'node:test';

import { linkable, linkTarget, noteParts, noteText } from '../noteLinks.ts';

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

test('a target with parentheses saves encoded and reads back whole', () => {
    const saved = noteText([
        { text: 'Bretton Woods', href: 'https://en.wikipedia.org/wiki/Bretton_Woods_(conference)' },
        { text: '.' },
    ]);

    assert.deepEqual(noteParts(saved), [
        {
            text: 'Bretton Woods',
            href: 'https://en.wikipedia.org/wiki/Bretton_Woods_%28conference%29',
        },
        { text: '.' },
    ]);
});

test('an unmatched bracket stays text and keeps the link after it whole', () => {
    assert.deepEqual(noteParts('Range [2010 see [IMF](https://imf.org/)'), [
        { text: 'Range [2010 see ' },
        { text: 'IMF', href: 'https://imf.org/' },
    ]);
    assert.equal(linkable('2010 see [IMF'), false);
    assert.equal(linkable('two\nlines'), false);
    assert.equal(linkable('  '), false);
    assert.equal(linkable('IMF data'), true);
});

test('a typed target is an http(s) URL or nothing', () => {
    assert.equal(linkTarget(' imf.org/data '), 'https://imf.org/data');
    assert.equal(linkTarget('http://a.b/c'), 'http://a.b/c');
    assert.equal(linkTarget('http://localhost:3000/studio/x'), 'http://localhost:3000/studio/x');
    assert.equal(linkTarget('example.com:8080/x'), 'https://example.com:8080/x');
    assert.equal(linkTarget('imf.org:443'), 'https://imf.org/');
    assert.equal(linkTarget('javascript:alert(1)'), null);
    assert.equal(linkTarget('mailto:a@b.c'), null);
    assert.equal(linkTarget('word'), null);
    assert.equal(linkTarget(''), null);
});
