import { isbot } from 'isbot';

import { clientLabel } from './proxy/headers.ts';

/** A crawler, link-preview fetcher or script, by its user agent. A request
 *  with no user agent comes from a script, so it counts as a bot. */
export const isBotAgent = (userAgent: string | null | undefined): boolean =>
    !userAgent || isbot(userAgent);

/** Whether an event's request came from a bot. An event with no request
 *  behind it (null headers) is the server's own, never a bot's. */
export const isBotRequest = (headers: Headers | null): boolean =>
    headers !== null && isBotAgent(headers.get('user-agent'));

/**
 * What sent a request: a person's browser, a search or training crawler, a
 * fetcher acting on one person's question to an assistant, one of the DFO
 * SDKs, an MCP client, another bot or script, or a client that sent no user
 * agent.
 */
export type Agent =
    'browser' | 'crawler' | 'user_fetcher' | 'sdk' | 'mcp_client' | 'other_bot' | 'none';

/** An agent and, when NAMED_AGENTS names it, its product token. */
export type AgentVerdict = { agent: Agent; agentName: string | null };

/**
 * The named agents, matched as a product token in the user agent in any
 * letter case, first row first. The vendors publish their user agents at:
 * - OpenAI, https://platform.openai.com/docs/bots: GPTBot and OAI-SearchBot
 *   crawl, and ChatGPT-User fetches a page for a ChatGPT user.
 * - Anthropic, https://support.claude.com/en/articles/8896518: ClaudeBot and
 *   Claude-SearchBot crawl, and Claude-User fetches for a Claude user. Claude's
 *   MCP connectors send Claude-User on /mcp too.
 * - Perplexity, https://docs.perplexity.ai/guides/bots: PerplexityBot crawls,
 *   and Perplexity-User fetches for a Perplexity user.
 * Googlebot and bingbot are the search crawlers. dfo-python and dfo-ts are the
 * DFO SDKs, which also send X-DFO-Client. The MCP clients are the ones seen on
 * the production /mcp route: codex-mcp-client (Codex), openai-mcp (ChatGPT),
 * claude-code (Claude Code, and Claude Desktop's agent SDK) and Antigravity.
 */
const NAMED_AGENTS: readonly (readonly [name: string, agent: Agent])[] = [
    ['GPTBot', 'crawler'],
    ['OAI-SearchBot', 'crawler'],
    ['ClaudeBot', 'crawler'],
    ['Claude-SearchBot', 'crawler'],
    ['PerplexityBot', 'crawler'],
    ['Googlebot', 'crawler'],
    ['bingbot', 'crawler'],
    ['ChatGPT-User', 'user_fetcher'],
    ['Claude-User', 'user_fetcher'],
    ['Perplexity-User', 'user_fetcher'],
    ['dfo-python', 'sdk'],
    ['dfo-ts', 'sdk'],
    ['codex-mcp-client', 'mcp_client'],
    ['openai-mcp', 'mcp_client'],
    ['claude-code', 'mcp_client'],
    ['Antigravity', 'mcp_client'],
];

// A name counts where it stands as a whole token, outside a longer word or
// hyphenated name and followed by a version, a separator or the end. The
// names hold no regular-expression syntax.
const NAMED_PATTERNS = NAMED_AGENTS.map(
    ([name, agent]) =>
        [name, agent, new RegExp(`(?:^|[^\\w-])${name}(?=$|[/;\\s)])`, 'i')] as const,
);

const SDK_NAMES = new Set(
    NAMED_AGENTS.filter(([, agent]) => agent === 'sdk').map(([name]) => name),
);

const named = (userAgent: string): AgentVerdict | undefined => {
    const match = NAMED_PATTERNS.find(([, , pattern]) => pattern.test(userAgent));

    return match && { agent: match[1], agentName: match[0] };
};

/**
 * Classify a request by its headers. A non-empty X-DFO-Client label (cleaned
 * as clientLabel cleans it for the APIs) makes it `sdk` whatever the user
 * agent says, named when the label's product token is a DFO SDK's. Otherwise
 * a missing or blank user agent is `none`, a named one takes its row of
 * NAMED_AGENTS, and the rest is `other_bot` when isbot flags it and `browser`
 * when it does not. On an MCP route (`mcp`), a fetcher is the MCP client it
 * speaks as and keeps its name, since Claude's connectors send Claude-User.
 * An unnamed bot there stays `other_bot`. An MCP SDK sends its HTTP library's
 * user agent, as a scanner or script does, so the user agent cannot tell
 * them apart.
 */
export const requestAgent = (headers: Headers, { mcp = false } = {}): AgentVerdict => {
    const label = clientLabel(headers);

    if (label) {
        const product = label.split(/[/\s]/, 1)[0]!.toLowerCase();

        return { agent: 'sdk', agentName: SDK_NAMES.has(product) ? product : null };
    }

    const userAgent = headers.get('user-agent')?.trim();

    if (!userAgent) {
        return { agent: 'none', agentName: null };
    }

    const verdict: AgentVerdict = named(userAgent) ?? {
        agent: isbot(userAgent) ? 'other_bot' : 'browser',
        agentName: null,
    };

    return mcp && verdict.agent === 'user_fetcher' ? { ...verdict, agent: 'mcp_client' } : verdict;
};
