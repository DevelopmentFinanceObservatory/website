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
    assert.equal(linkable('two\rlines'), false);
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
    assert.equal(linkTarget('1.2'), null);
    assert.equal(linkTarget('user@host.com'), null);
    assert.equal(linkTarget('//imf.org/x'), 'https://imf.org/x');
    assert.equal(linkTarget(`imf.org/${'a'.repeat(2100)}`), null);
    assert.equal(linkTarget(''), null);
    assert.equal(linkTarget('https://:secret@imf.org'), null);
    assert.equal(linkTarget('https://:www.imf.org@evil.example'), null);
});

test('a target past the length a note keeps stays text', () => {
    const long = `[IMF](https://imf.org/${'a'.repeat(2100)})`;

    assert.deepEqual(noteParts(long), [{ text: long }]);
});

test('one bound applies to the encoded target, in linkTarget and when read back', () => {
    const pad = (total: number, parens: number) =>
        `https://imf.org/${'a'.repeat(total - 'https://imf.org/'.length - parens)}${'()'.repeat(parens / 2)}`;
    const roundTrip = (href: string) => noteParts(noteText([{ text: 'x', href }]));

    // 2040 characters plus four parentheses encoded is 2048, so it is kept and read back whole.
    const kept = linkTarget(pad(2040, 4))!;

    assert.equal(kept.length, 2040);
    assert.deepEqual(roundTrip(kept), [
        { text: 'x', href: kept.replace(/\(/g, '%28').replace(/\)/g, '%29') },
    ]);

    // 2046 characters with four parentheses encodes to 2054, so it is refused up front.
    assert.equal(linkTarget(pad(2046, 4)), null);

    // Reading bounds the part after the scheme. 2048 characters there read as
    // a link, as a note saved under that bound has them, and 2049 stay text.
    const edge = `https://${'a'.repeat(2048)}`;

    assert.equal(noteParts(`[x](${edge})`)[0]?.href, edge);
    assert.equal(noteParts(`[x](${edge}a)`)[0]?.href, undefined);
});
