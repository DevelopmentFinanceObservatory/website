import assert from 'node:assert/strict';
import test from 'node:test';

import { isBotRequest, requestAgent, type Agent } from '../bot.ts';

const SAFARI =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

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

// User agents recorded from the production Cloud Run request log, plus the
// vendors' published strings for agents the log did not show.
const AGENT_CASES: [
    label: string,
    headers: Record<string, string>,
    mcp: boolean,
    agent: Agent,
    agentName: string | null,
][] = [
    [
        'GPTBot',
        {
            'user-agent':
                'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.4; +https://openai.com/gptbot)',
        },
        false,
        'crawler',
        'GPTBot',
    ],
    [
        'OAI-SearchBot',
        {
            'user-agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot',
        },
        false,
        'crawler',
        'OAI-SearchBot',
    ],
    [
        'ClaudeBot',
        {
            'user-agent':
                'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
        },
        false,
        'crawler',
        'ClaudeBot',
    ],
    [
        'PerplexityBot',
        {
            'user-agent':
                'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
        },
        false,
        'crawler',
        'PerplexityBot',
    ],
    [
        'Googlebot',
        {
            'user-agent':
                'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        },
        false,
        'crawler',
        'Googlebot',
    ],
    [
        'ChatGPT-User',
        {
            'user-agent':
                'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
        },
        false,
        'user_fetcher',
        'ChatGPT-User',
    ],
    ['Claude-User off /mcp', { 'user-agent': 'Claude-User' }, false, 'user_fetcher', 'Claude-User'],
    ['Claude-User on /mcp', { 'user-agent': 'Claude-User' }, true, 'mcp_client', 'Claude-User'],
    [
        'Perplexity-User',
        {
            'user-agent':
                'Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
        },
        false,
        'user_fetcher',
        'Perplexity-User',
    ],
    ['dfo-python user agent', { 'user-agent': 'dfo-python/0.3.0' }, false, 'sdk', 'dfo-python'],
    ['dfo-ts user agent', { 'user-agent': 'dfo-ts/0.3.0' }, false, 'sdk', 'dfo-ts'],
    [
        'X-DFO-Client beside an HTTP library',
        { 'user-agent': 'python-httpx/0.28.1', 'x-dfo-client': 'dfo-python/0.4.1 (CPython 3.12)' },
        false,
        'sdk',
        'dfo-python',
    ],
    [
        'X-DFO-Client from a browser',
        { 'user-agent': SAFARI, 'x-dfo-client': 'dfo-ts/0.1.0 (browser)' },
        false,
        'sdk',
        'dfo-ts',
    ],
    [
        'an unknown X-DFO-Client label',
        { 'user-agent': 'curl/8.7.1', 'x-dfo-client': 'aid-dashboard/1.4' },
        false,
        'sdk',
        null,
    ],
    [
        'an X-DFO-Client blank after cleaning',
        { 'user-agent': 'curl/8.7.1', 'x-dfo-client': ' \x01 ' },
        false,
        'other_bot',
        null,
    ],
    [
        'codex-mcp-client',
        { 'user-agent': 'codex-mcp-client/0.169.0-alpha.11.1' },
        true,
        'mcp_client',
        'codex-mcp-client',
    ],
    ['openai-mcp', { 'user-agent': 'openai-mcp/1.0.0 (Codex)' }, true, 'mcp_client', 'openai-mcp'],
    [
        'claude-code',
        { 'user-agent': 'claude-code/2.1.321 (claude-desktop, agent-sdk/0.3.321)' },
        false,
        'mcp_client',
        'claude-code',
    ],
    ['an HTTP library on /mcp', { 'user-agent': 'python-httpx/0.28.1' }, true, 'other_bot', null],
    ['curl', { 'user-agent': 'curl/8.7.1' }, false, 'other_bot', null],
    [
        'Slack link preview',
        { 'user-agent': 'Slack-ImgProxy (+https://api.slack.com/robots)' },
        false,
        'other_bot',
        null,
    ],
    ['a name inside a longer token', { 'user-agent': 'NotGPTBot/1.0' }, false, 'other_bot', null],
    ['a browser', { 'user-agent': SAFARI }, false, 'browser', null],
    ['a browser on /mcp', { 'user-agent': SAFARI }, true, 'browser', null],
    ['no user agent', {}, false, 'none', null],
    ['a blank user agent', { 'user-agent': '  ' }, false, 'none', null],
];

test('requestAgent: classifies each recorded agent', () => {
    for (const [label, headers, mcp, agent, agentName] of AGENT_CASES) {
        assert.deepEqual(requestAgent(new Headers(headers), { mcp }), { agent, agentName }, label);
    }
});
