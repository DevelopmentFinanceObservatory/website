/**
 * The MkDocs dialects the corpus carries, normalised into the two shapes the
 * renderer parses. Indentation is the whole game: both forms indent their
 * body four spaces, which CommonMark would otherwise read as code.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { normaliseMkdocs } from '../mkdocs.ts';

test('an admonition becomes an alert blockquote, body dedented', () => {
    const out = normaliseMkdocs(
        ['!!! warning "Reporting as both"', '    A provider name resolves.', '', 'After.'].join('\n'),
    );

    assert.equal(
        out,
        ['> [!WARNING] Reporting as both', '> A provider name resolves.', '', 'After.'].join('\n'),
    );
});

test('an admonition keeps its fenced code, inside the quote', () => {
    const out = normaliseMkdocs(
        ['!!! note "Try it"', '    ```python', '    print(1)', '    ```'].join('\n'),
    );

    assert.equal(out, ['> [!NOTE] Try it', '> ```python', '> print(1)', '> ```'].join('\n'));
});

test('an indented admonition keeps its place in the list', () => {
    const out = normaliseMkdocs(
        ['1. Step.', '', '    !!! tip "Hint"', '        Do this.', ''].join('\n'),
    );

    assert.equal(out, ['1. Step.', '', '    > [!TIP] Hint', '    > Do this.', ''].join('\n'));
});

test('MkDocs kinds map onto the alert kinds the renderer styles', () => {
    assert.match(normaliseMkdocs('!!! danger "X"\n    y'), /\[!CAUTION\]/);
    assert.match(normaliseMkdocs('!!! info "X"\n    y'), /\[!NOTE\]/);
    assert.match(normaliseMkdocs('??? success "X"\n    y'), /\[!TIP\]/);
});

test('an unknown kind is left alone rather than guessed at', () => {
    const source = '!!! sparkle "X"\n    y';

    assert.equal(normaliseMkdocs(source), source);
});

test('a run of Material labels becomes one directive tab set', () => {
    const out = normaliseMkdocs(
        ['=== "uv"', '', '    ```bash', '    uv add x', '    ```', '', '=== "pip"', '', '    ```bash', '    pip install x', '    ```', '', 'After.'].join('\n'),
    );

    assert.match(out, /^:::tabs$/m);
    assert.match(out, /^::tab\{label="uv"\}$/m);
    assert.match(out, /^::tab\{label="pip"\}$/m);
    assert.match(out, /^:::$/m);
    assert.match(out, /^```bash$/m, 'the fence is dedented out of code-block range');
    assert.match(out, /After\./);
});

test('markers inside a fenced sample are never rewritten', () => {
    const source = ['```markdown', '!!! warning "Not ours"', '=== "nor this"', '```'].join('\n');

    assert.equal(normaliseMkdocs(source), source);
});

test('the directive tabs already in the corpus pass through', () => {
    const source = [':::tabs', '', '::tab{label="Claude Code"}', '', 'Run this.', '', ':::'].join('\n');

    assert.equal(normaliseMkdocs(source), source);
});

test('plain markdown is returned unchanged', () => {
    const source = ['# Title', '', 'A paragraph.', '', '- a', '- b'].join('\n');

    assert.equal(normaliseMkdocs(source), source);
});

test('an HTML comment is dropped, on its own line or at the end of one', () => {
    assert.equal(normaliseMkdocs(['a', '<!-- prettier-ignore -->', 'b'].join('\n')), 'a\nb');
    assert.equal(normaliseMkdocs('a <!-- note --> b'), 'a  b');
});

test('a comment spanning lines takes all of them', () => {
    const out = normaliseMkdocs(['Before.', '<!-- TODO: confirm', 'the scheme. -->', 'After.'].join('\n'));

    assert.equal(out, 'Before.\nAfter.');
});

test('a comment inside a fenced sample stays', () => {
    const source = ['```html', '<!-- kept -->', '```'].join('\n');

    assert.equal(normaliseMkdocs(source), source);
});
