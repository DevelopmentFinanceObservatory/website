import assert from 'node:assert/strict';
import test from 'node:test';

import { isBotRequest } from '../bot.ts';

const request = (userAgent?: string) =>
    new Headers(userAgent === undefined ? {} : { 'user-agent': userAgent });

test('isBotRequest: crawlers, link-preview fetchers and scripts are bots, browsers are not', () => {
    for (const userAgent of [
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
        'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
        'curl/8.7.1',
    ]) {
        assert.equal(isBotRequest(request(userAgent)), true, userAgent);
    }

    assert.equal(isBotRequest(request()), true);
    assert.equal(
        isBotRequest(
            request(
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
            ),
        ),
        false,
    );
});

test('isBotRequest: an event with no request behind it is the server’s own', () => {
    assert.equal(isBotRequest(null), false);
});
