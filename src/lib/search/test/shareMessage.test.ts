import assert from 'node:assert/strict';
import test from 'node:test';

import { shareFailureText } from '../shareMessage.ts';

test('shareFailureText says an unavailable pin door is temporary', () => {
    const text = shareFailureText('snapshot', 'pin_unavailable');

    assert.notEqual(text, shareFailureText('snapshot', 'pin_refused'));
    assert.notEqual(text, shareFailureText('snapshot', 'unknown_code'));
});
