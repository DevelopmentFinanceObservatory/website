import assert from 'node:assert/strict';
import test from 'node:test';

import {
    embedFootMessage,
    embedImageRequest,
    embedImageResult,
    embedSnippet,
    hostEmbedPath,
    isEmbedImageRequest,
    readEmbedFoot,
    readEmbedImageResult,
} from '../embedHost.ts';
import { embedHeightMessage } from '../embedHeight.ts';

test('a host page reads the foot and the image result its embed posts, and nothing else', () => {
    const foot = { note: 'Live data through 2023', image: true };

    assert.deepEqual(readEmbedFoot(embedFootMessage(foot)), foot);
    assert.deepEqual(readEmbedFoot(embedFootMessage({ note: null, image: false })), {
        note: null,
        image: false,
    });
    assert.equal(readEmbedImageResult(embedImageResult(true)), true);
    assert.equal(readEmbedImageResult(embedImageResult(false)), false);
    assert.equal(isEmbedImageRequest(embedImageRequest()), true);

    const strangers = [
        null,
        'dfo:embed-foot',
        embedHeightMessage(440),
        embedImageRequest(),
        { type: 'dfo:embed-foot', note: 3, image: true },
        { type: 'dfo:embed-foot', note: null },
        { type: 'dfo:embed-image-result', ok: 'yes' },
    ];

    for (const data of strangers) {
        assert.equal(readEmbedFoot(data), null, JSON.stringify(data));
        assert.equal(readEmbedImageResult(data), null, JSON.stringify(data));
    }

    assert.equal(isEmbedImageRequest(embedFootMessage(foot)), false);
});

test('the embed code frames the share at the height given, its title escaped', () => {
    const code = embedSnippet({
        origin: 'https://example.org',
        id: 'abc123',
        title: 'Aid "per person" & <more>',
        height: 467.6,
    });

    assert.equal(
        code,
        '<iframe src="https://example.org/embed/abc123" width="100%" height="468" style="border:0" title="Aid &quot;per person&quot; &amp; &lt;more>"></iframe>',
    );
    assert.equal(hostEmbedPath('abc123'), '/embed/abc123?foot=host');
});
