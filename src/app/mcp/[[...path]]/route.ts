import { NextRequest } from 'next/server';

import { requestCaller } from '@/lib/proxy/caller';
import { forward, forwardAsset, STUDIO_API_BASE } from '@/lib/proxy/forward';

// dfo-ai's combined MCP server (`/mcp/` on the harness), mirrored at the
// site's /mcp for outside MCP clients (see src/lib/proxy/forward).
// It speaks streamable HTTP. POST carries the JSON-RPC message, GET opens
// the server's event stream, DELETE ends a session, and the
// `mcp-session-id` header rides both ways. Every path under /mcp goes to
// the same server, and the target keeps its trailing slash, so the harness
// never answers with a redirect.
//
// The harness guards the server with its own MCP_API_TOKEN. When the proxy
// holds it, it is attached on the caller's behalf (the site is the front
// door). Otherwise the caller's own Authorization header goes through.
// The caller is named in x-dfo-caller (src/lib/proxy/caller). Each address is
// rate-limited (surface 'mcp' in src/lib/proxy/rateLimit).
//
// The exception is the theme stylesheet presentation-mcp's views load,
// `/mcp/presentation/theme-<hash>.css`, which is fetched from the same path on
// the harness, public, with its own cache headers and no limit.
const MCP_TOKEN = process.env.MCP_API_TOKEN;

const THEME_FILE = /^theme-[0-9a-f]{1,64}\.css$/;

const themeFile = (path: string[] | undefined): string | undefined => {
    const [dir, file, ...rest] = path ?? [];

    return dir === 'presentation' && file && rest.length === 0 && THEME_FILE.test(file)
        ? file
        : undefined;
};

const proxy = async (req: NextRequest, { params }: { params: Promise<{ path?: string[] }> }) => {
    const theme = req.method === 'GET' ? themeFile((await params).path) : undefined;

    if (theme) {
        return forwardAsset(req, `${STUDIO_API_BASE}/mcp/presentation/${theme}`);
    }

    return forward(req, {
        surface: 'mcp',
        target: `${STUDIO_API_BASE}/mcp/${req.nextUrl.search}`,
        bearer: MCP_TOKEN,
        caller: requestCaller(req.headers),
        unreachable: 'The MCP servers are unreachable.',
    });
};

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
