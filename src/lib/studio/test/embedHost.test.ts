import assert from 'node:assert/strict';
import test from 'node:test';

import {
    embedFootAck,
    embedFootMessage,
    embedImageRequest,
    embedImageResult,
    embedSnippet,
    hostEmbedPath,
    isEmbedFootAck,
    isEmbedImageRequest,
    readEmbedFoot,
    readEmbedImageResult,
} from '../embedHost.ts';
import { embedHeightMessage } from '../embedHeight.ts';

test('each side reads the foot, the ack and the image messages, and nothing else', () => {
    const foot = { note: 'Live data through 2023', strip: 28, image: true };

    assert.deepEqual(readEmbedFoot(embedFootMessage(foot)), foot);
    assert.deepEqual(readEmbedFoot(embedFootMessage({ note: null, strip: 0, image: false })), {
        note: null,
        strip: 0,
        image: false,
    });
    assert.equal(isEmbedFootAck(embedFootAck()), true);
    assert.equal(readEmbedImageResult(embedImageResult(true)), true);
    assert.equal(readEmbedImageResult(embedImageResult(false)), false);
    assert.equal(isEmbedImageRequest(embedImageRequest()), true);

    const strangers = [
        null,
        'dfo:embed-foot',
        embedHeightMessage(440),
        embedImageRequest(),
        embedFootAck(),
        { type: 'dfo:embed-foot', note: 3, strip: 28, image: true },
        { type: 'dfo:embed-foot', note: null, strip: 0 },
        { type: 'dfo:embed-foot', note: null, image: true },
        { type: 'dfo:embed-foot', note: null, strip: -1, image: true },
        { type: 'dfo:embed-image-result', ok: 'yes' },
    ];

    for (const data of strangers) {
        assert.equal(readEmbedFoot(data), null, JSON.stringify(data));
        assert.equal(readEmbedImageResult(data), null, JSON.stringify(data));
    }

    assert.equal(isEmbedImageRequest(embedFootMessage(foot)), false);
    assert.equal(isEmbedFootAck(embedFootMessage(foot)), false);
    assert.equal(isEmbedFootAck(embedImageRequest()), false);
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
