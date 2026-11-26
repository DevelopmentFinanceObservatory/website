# Signed-in MCP Access With OAuth: Early Design and Requirements

[Issue #176][issue] · [Development Finance Observatory][DFO] \
Last modified: 2026-11-25 \
Author: Claude (Claude Code) for Sef Kloninger \<<sefklon@gmail.com>\>

This document explores how the MCP server could let users sign in. It's aim is to explore a few requirements and implementation decisions to inform a more thorough design. It records what the main MCP clients support, proposes a direction, and lists the decisions and checks needed before a full design. The sizing is an estimate to plan against, not a commitment. This is a follow-in project after [API keys][api-keys].

## Contents

- [The problem][]
- [Proposal][]
- [Decisions][]
- [Decisions needed][]
- [Client support][]
    - [Registration][]
    - [Sign-in after a 401][]
- [Design sketch][]
    - [The proxy check][]
    - [The anonymous allowance][]
    - [Refusals][]
    - [Authorization server][]
    - [Token check][]
- [Stories][]
- [Verification before the build][]
- [Rollout][]
- [Sizing][]
- [Risks][]

## The problem

The MCP server at `/mcp` has no notion of a user. The proxy counts every call against the caller's address at 300 a minute (`RATE_LIMIT_MCP` in `src/lib/proxy/rateLimit.ts`), and API keys apply to the API only. This has three effects:

- **No attribution.** No MCP call can be tied to an account, so there is no per-user usage to report.
- **Shared limits.** Claude's connector traffic leaves from one shared range (`160.79.104.0/21`), so one heavy user cannot be limited without limiting everyone behind the same addresses.
- **No path to higher limits.** Studio, the other interactive surface, lets a guest ask 5 questions a day per address, then asks them to sign in for 75 a day (`src/lib/studio/promptAllowance.ts`). MCP has no equivalent: a user who reaches the address limit has nothing to do but wait.

Interactive use, through Studio or through an AI assistant over MCP, would work the same way: open and anonymous up to an allowance, then a prompt to sign in, then a larger allowance per user. Pipelines are a separate use case, served by the API with API keys, and are outside this document.

## Proposal

`/mcp` would stay open to signed-out use up to an anonymous allowance. Past it, the proxy would answer with an OAuth challenge (HTTP 401 and `WWW-Authenticate`). A client that handles the challenge would sign the user in with a DFO account and repeat the call, which would then count against the account. From then on, every call from that client would be made as the account, with its own, higher limits.

There would be one URL, `https://developmentfinance.org/mcp`, so existing users would have nothing to change.

Better Auth plugins would serve as the authorization server inside the website. The proxy would check the access token with `jose` and pass the result to `decideAccess` as a new `oauth` identity, beside `keyed`.

## Decisions

| Question | Decision |
| --- | --- |
| One URL or two | One URL, `/mcp`. Anonymous until the anonymous allowance runs out, then a sign-in challenge. No separate signed-in URL, so users have nothing to migrate. |
| Clients to support | Claude (claude.ai, Claude Desktop, Claude Code), ChatGPT, Gemini CLI and Mistral Le Chat. Each must sign in and make calls as the account. |
| Calls from a connected client | Once a client is connected to an account, every call it sends is made as that account: counted against the account's limits and named to dfo-ai as a `user:` caller. A connected client never falls back to anonymous use. |
| Client registration | Client ID Metadata Documents (CIMD) first, with one admin-registered public client for clients without CIMD. Dynamic Client Registration (DCR) stays off unless Le Chat needs it. See [Registration][]. |
| Resource-server helpers | Better Auth's plugins would issue the tokens and serve the metadata. The proxy would verify tokens with `jose`, because `@better-auth/mcp`'s `requireMcpAuth` challenges every request without a token and owns the response. See [Token check][]. |
| Better Auth upgrade | Raise `better-auth` and `@better-auth/api-key` from 1.7.7 to 1.7.28. No change between those versions touches a feature the site uses, and the type check and all 3,355 tests pass at 1.7.26 and 1.7.28. 1.7.27 adds CIMD fixes this work needs. |
| Signed-in limits | A per-minute limit and a daily cap per user, as API keys have per key. MCP use would spend its own counters and leave the account's API quota untouched. |
| Cloudflare | Checked on dev before production. See [Rollout][]. |

## Decisions needed

1. **What the anonymous allowance counts, and how the shared Claude range is treated.** The challenge would fire when an anonymous allowance runs out, and the anonymous `/mcp` limit is per minute only. A daily anonymous allowance per address is the natural trigger, but every claude.ai, Claude Desktop and ChatGPT user calls from the vendor's addresses, not their own. A per-address daily cap would therefore ask Claude users to sign in once all Claude users together had spent it. The options are set out in [The anonymous allowance][]. The number needs current `/mcp` logs: calls per address per day, and the share from `160.79.104.0/21`.
2. **The unit.** One question to an assistant makes several tool calls (`search`, `describe`, `get_data`, `aggregate`). Count every `tools/call`, or only the data-returning tools, with `search`, `describe` and `get_skill` free?
3. **The signed-in numbers.** The per-minute limit (`user.api_rate_limit` defaults to 600, which is high for MCP) and the daily cap, and whether an admin can raise them per user as they can for the API quota.
4. **How to recognise ChatGPT.** ChatGPT starts sign-in from a tool result carrying `_meta["mcp/www_authenticate"]`, not from a 401, so supporting it needs a ChatGPT form of the challenge. The proxy could recognise ChatGPT by `clientInfo.name` or by its egress range; both are hints. See [Sign-in after a 401][].
5. **API keys on `/mcp` for command-line clients.** Gemini CLI, Codex, Cursor and Claude Code can all send a fixed header. Accepting `dfo_` keys on `/mcp` would give those users a signed-in path that works whatever their client's OAuth support. `api-keys.md` says `/mcp` ignores keys, so this is a product choice.
6. **DCR for Le Chat.** Mistral documents DCR as Le Chat's registration method. A pre-registered client is reported to work, undocumented. If the client tests show Le Chat needs DCR, the authorization server would turn it on, with rate limits on registration and cleanup of unused clients.

## Client support

Each finding is marked as documented (vendor documentation, the specification or the client's source), reported (forums, issue trackers, third parties) or unknown. No client has been tested against a DFO server. Codex, Cursor and VS Code appear for comparison and are not committed clients.

### Registration

MCP specification revision 2026-07-28 makes CIMD the recommended method and deprecates DCR ([spec: authorization][spec-auth]).

| Client | CIMD | DCR | Pre-registered client | Redirect URI | Evidence |
| --- | --- | --- | --- | --- | --- |
| claude.ai, Claude Desktop, mobile | Yes, preferred | Fallback | Yes, in the connector's advanced settings | `https://claude.ai/api/mcp/auth_callback` | Documented ([Claude auth][claude-auth]) |
| Claude Code | Yes | Fallback | `claude mcp add --client-id` | Loopback, any port | Documented ([Claude Code MCP][cc-mcp]) |
| ChatGPT | Yes, when the builder chooses it | Yes | Yes | `https://chatgpt.com/connector_platform_oauth_redirect` | Documented ([OpenAI auth][openai-auth]); one unresolved report of ChatGPT missing advertised CIMD ([forum][openai-cimd]) |
| Gemini CLI | No, and the request is closed ([#25724][gemini-cimd]) | Yes, the only automatic path | `oauth.clientId` in `settings.json` | `http://localhost:{port}/oauth/callback` | Documented ([source][gemini-oauth]) |
| Mistral Le Chat | Unknown | Yes | Reported: a non-empty client secret makes it use a typed client ID | Reported as `callback.mistral.ai` | DCR documented ([Mistral connectors][mistral]) |
| Codex CLI | Yes, chosen automatically | Fallback | `--oauth-client-id` | Loopback, any port | Documented ([source][codex-reg]) |
| VS Code, Copilot | Yes | Fallback | `oauth.clientId` | `http://127.0.0.1:33418/`, `https://vscode.dev/redirect` | Documented ([source][vscode-auth]) |
| Cursor | No | Yes | `auth.CLIENT_ID` in `mcp.json` | `http://localhost:8787/callback` | Documented ([Cursor MCP][cursor-mcp]); CIMD absence reported |

What the authorization server would have to do for these clients:

- Advertise `client_id_metadata_document_supported: true`, `none` in `token_endpoint_auth_methods_supported`, `S256`, and `authorization_response_iss_parameter_supported: true`. Claude and Codex use CIMD only when `none` is listed, and Codex and ChatGPT keep one stable redirect only when `iss` is supported. Better Auth adds `none` once `cimd()` is installed and advertises `iss` support by default.
- Match loopback redirects with the port ignored, for both `localhost` and `127.0.0.1`. Claude Code, Codex and VS Code list portless loopback URLs and call back on an ephemeral port. Exact matching broke every CIMD provider for Claude Code in [claude-code#37747][cc-37747]. Whether Better Auth ignores the port is unknown, and it is the most likely blocker for Claude Code.
- Accept ChatGPT's preferred `private_key_jwt` with its `jwks_uri`, or advertise only `none`.
- List `offline_access` in the authorization server's `scopes_supported` and nowhere else. Claude and Claude Code request refresh tokens only when it is listed there. The specification says it does not belong in the protected resource metadata or the challenge.
- Accept a request without `resource`. Codex sends it only when the user configures it.

Gemini CLI and Le Chat have no CIMD, so CIMD alone would leave out two of the four committed clients. An admin would register one public client (no secret, PKCE, `none`) with their redirect URIs, and the connect docs would publish its ID. Gemini CLI takes it through `oauth.clientId` in `settings.json`, which is documented. Le Chat's equivalent is only reported, which is why decision 6 is open.

### Sign-in after a 401

The single URL relies on a client starting sign-in when a 401 arrives after it has connected anonymously. Support is split.

| Client | Starts sign-in on a later 401 | Repeats the call | What the user sees | Evidence |
| --- | --- | --- | --- | --- |
| claude.ai, Claude Desktop, mobile | Yes, on an HTTP 401 with `WWW-Authenticate` only; a 200 tool error starts nothing | Yes | An inline Connect card, then the answer | Documented ([lazy authentication][claude-lazy]) |
| Claude Code | No. It marks the server as needing sign-in | No | Tool result: "needs you to sign in again (run /mcp to re-authenticate)" | Documented ([lazy authentication][claude-lazy]) |
| ChatGPT | No on a bare 401, which shows "Internal error" until the user reconnects. Its documented trigger is a 200 tool result with `isError: true` and `_meta["mcp/www_authenticate"]`, with `securitySchemes` of `noauth` and `oauth2` on each tool | Unknown | ChatGPT's linking prompt, per its documentation | 401 failure reported ([forum][openai-401]); `_meta` route documented ([OpenAI auth][openai-auth]), untested |
| Gemini CLI | No. Sign-in runs only while connecting, and only with `oauth.enabled` set or after a 401 at connect time | No | The 401 response body, as a tool error; the user runs `/mcp auth` | Documented ([source][gemini-401]) |
| Mistral Le Chat | Unknown. Mistral documents that a server must answer 401 with `WWW-Authenticate` for OAuth to be detected, without saying when | Unknown | Unknown | Documented in part ([Mistral connectors][mistral]) |
| VS Code | Yes, on 401 or 403 for any request | Yes, once | VS Code's sign-in dialog | Documented ([source][vscode-retry]) |
| Codex CLI | No. The 401 becomes the tool error "Authentication required" | No, by design | Error text; the user runs `codex mcp login` | Documented ([source][codex-401]) |
| Cursor | No | No | "Unauthorized" | Reported ([Cursor forum][cursor-401]) |

What follows from the table:

- The 401 would be the default signal. It is what the specification requires and the only signal Claude's hosted clients act on.
- Every client that cannot act on it shows text, so the 401 body would carry a short sign-in sentence with steps per client, and the connect docs would repeat them. Gemini CLI passes the body to the model verbatim.
- The challenge would apply to every request once an address is over its allowance, `initialize` included. A client that connects after that point would be challenged at connect time, which Gemini CLI, Claude Code, Codex and Cursor all handle.
- ChatGPT would get its own form of the challenge (decision 4).
- Elicitation in URL mode cannot sign a client in. The specification forbids it for authorizing the client, and the client's token is unchanged by it ([spec: elicitation][spec-elicit]).
- Publishing the discovery documents on an anonymous endpoint can ask for sign-in at connect time. `codex mcp add` opens a browser sign-in once it finds them (documented). Claude Code once showed such a server as needing authentication (reported, [claude-code#46879][cc-46879]). Both would be checked before the build.

## Design sketch

### The proxy check

`decideAccess` (`src/lib/proxy/access.ts`) knows two identities, `anonymous` and `keyed`, and honours keys only on the `api` and `datasets` surfaces. It would gain an `oauth` identity, `{ kind: 'oauth'; accountId; clientId }`, on the `mcp` surface. A bearer token on `/mcp` would be checked before any anonymous count:

| Token | Result |
| --- | --- |
| None, or an opaque or `dfo_` token | Anonymous, counted against the address |
| Valid | Counted against the account: its MCP per-minute limit, then its MCP daily cap. Never counted against the address. |
| Invalid, expired or revoked | 401 `invalid_token` with `resource_metadata`, so the client refreshes or signs in again. It never falls back to anonymous, which would hide a revocation. |
| Token store or keys unavailable | Anonymous, as `keyVerifier.ts` fails open for keys |

Past the anonymous allowance the proxy would answer 401 before the call goes upstream:

```
WWW-Authenticate: Bearer error="invalid_token",
    error_description="Free calls used up for today. Sign in to keep going.",
    resource_metadata="https://developmentfinance.org/.well-known/oauth-protected-resource/mcp",
    scope="mcp"
```

The response would also send `Access-Control-Expose-Headers: WWW-Authenticate`, which browser-based clients need to read the challenge.

`forward.ts` passes a non-`dfo_` bearer through to dfo-ai when `MCP_API_TOKEN` is unset (the `callerAuth` branch), which would leak a user's token once users send them. It would strip the caller's `Authorization` header from every `/mcp` call. A signed-in call would reach dfo-ai named by `accountCaller`, which dfo-ai reads from `x-dfo-caller`.

A kill switch, `MCP_OAUTH_ENABLED`, would work as `API_KEYS_ENABLED` does. Off, bearer tokens would be ignored and the call treated as anonymous, the discovery routes would answer 404, and no response would carry `WWW-Authenticate`.

### The anonymous allowance

Anonymous `/mcp` has a per-minute limit per address and no daily allowance. It would gain a daily allowance per address on `tools/call`, in the 00:00 UTC window that Studio and the API use: the MCP equivalent of Studio's five guest prompts. `initialize`, `tools/list` and notifications would stay free, so a refusal never breaks a client's connection or empties its tool list. The 300-a-minute per-address limit would stay as the abuse backstop on every method.

The shared egress range is the open problem (decision 1). The options:

- **A high cap per address, set from the logs.** Claude's range would share one allowance among all Claude users, so it would be sized to protect dfo-ai, not to meter individuals. Claude users would see sign-in prompts when the whole range is busy. Simple, and it matches the "asked to sign in sooner on a shared network" behaviour Studio accepts.
- **A separate, higher allowance for known connector ranges.** Claude's range is published; OpenAI's and Mistral's are unknown. More configuration to maintain, and the effect per user is the same.
- **A count per client session.** Weak: the session header is chosen by the client, and specification revision 2026-07-28 removes sessions.

The proposal is the first option, with the number taken from `/mcp` logs.

### Refusals

There would be two kinds of refusal:

- **Sign-in.** The anonymous allowance is used up. Sign-in helps, so the answer would be the 401 challenge above.
- **Limit.** A per-minute burst, anonymous or signed in, or a signed-in daily cap. Sign-in cannot help, so these would never be 401, which would send a signed-in user round the sign-in flow again.

The proxy refuses an over-limit `/mcp` call with an HTTP 429. A limit refusal on `tools/call` would become a 200 JSON-RPC result with `isError: true`. Claude passes tool-error text to the model as the tool result (documented, [lazy authentication][claude-lazy]). No client vendor documents what it does with a 429 on `tools/call`; users report raw transport errors, and one report describes an agent repeating a refused call until its quota was gone. The GitHub, Notion and Exa MCP servers return limits as tool errors in the same way ([GitHub][gh-mcp], [Notion][notion], [Exa][exa]). The MCP specification's 2025-06-18 revision shows a tool error for an upstream rate limit; later revisions keep only the rule that servers must rate-limit tool calls ([spec 2025-06-18: tools][spec-tools-0618]).

Each limit refusal would carry:

- One or two sentences addressed to the user, which the model can relay as written: whose limit, when it resets, "do not retry until then", and the way out. The tone would follow Studio's: short, second person, a next step, and "It's free" where sign-in is offered.
- The reset as a time ("resets at 00:00 UTC, in about 5 h 20 min") for daily limits and as a wait ("try again in 40 seconds") for per-minute ones. A model cannot work out the time remaining by itself.
- Machine fields in `_meta["org.developmentfinance/limit"]`: `code` (`rate_limited` or `allowance_exhausted`, the API's problem codes), `scope` (`address` or `account`), `retryable`, `retry_after_seconds` and `resets_at`.
- `Retry-After` and the `RateLimit-*` headers.

The proxy would build these results itself, so they would follow the protocol version the client negotiated. Revision 2026-07-28 results carry `resultType`, and some clients accept only `text/event-stream`. A request the proxy cannot read as a single `tools/call` would keep the 429 problem document.

### Authorization server

The website would run the authorization server with Better Auth 1.7.28:

- `@better-auth/mcp`'s `mcp()` plugin, built on `@better-auth/oauth-provider`, with `resource` set to `https://developmentfinance.org/mcp`. It links every new client to the resource, serves the protected resource metadata (RFC 9728) and rotates refresh tokens.
- The `jwt()` plugin from `better-auth/plugins` for signed access tokens (EdDSA, `typ: at+jwt`), with `disableSettingJwtHeader: true` and `/token` added to `disabledPaths`, so no session JWTs are minted beside them.
- `@better-auth/cimd` with `metadataProfile: "mcp-2026-07-28"` and the SSRF-safe fetch from `@better-auth/cimd/node`, which resolves DNS once, rejects special-use addresses, pins the connection and follows no redirects.
- The issuer would be `https://developmentfinance.org/api/auth`. The metadata documents live at root `.well-known` paths outside the `/api/auth/[...all]` route, so Next routes under `src/app/.well-known/` would serve them: `oauth-authorization-server/api/auth` through `oauthProviderAuthServerMetadata(auth)`, and `oauth-protected-resource` and `oauth-protected-resource/mcp` by forwarding to `auth.handler`. Both resource metadata paths would be served, because ChatGPT reads the path-suffixed one.
- Access tokens would last 15 minutes, which bounds how long a revoked grant keeps working. The proxy's account lookup, cached for 60 seconds as `keyVerifier.ts` caches keys, would catch deleted users sooner.
- New tables in `db/auth-schema.ts`: `jwks`, `oauthClient`, `oauthResource`, `oauthClientResource`, `oauthAccessToken`, `oauthRefreshToken`, `oauthConsent` and `oauthClientAssertion`, with their migration.
- A consent page that resumes the authorize request after sign-in, through `safeNext` in `src/lib/auth/nextPath.ts`.
- A "Connected apps" panel to list and revoke grants, beside the API keys panel, and an admin view.

### Token check

A new `src/lib/proxy/oauthToken.ts` would verify the token with `jose` and return a verdict shaped like `keyVerifier.ts`'s: `none`, `valid`, `invalid` or `unavailable`. It would check the signature against the keys from `auth.api.getJwks()`, read in-process with no HTTP call and refreshed once when a key ID is unknown. It would also check `iss`, `aud` (the `/mcp` URL), `exp`, `typ: at+jwt` and `azp`, and refuse a sender-constrained token (`cnf`), since the proxy would not check DPoP proofs.

Better Auth issues a JWT only when the client sends `resource`; otherwise the token is opaque. The specification requires `resource`, and Codex omits it unless configured. Because the proxy runs in the same process as Better Auth, it could look up an opaque token in `oauthAccessToken`, cached as keys are. The client tests would decide whether this path is needed.

## Stories

| # | Case | Response | Text the user sees |
| --- | --- | --- | --- |
| M1 | Anonymous, within allowance | The call passes through | None |
| M2 | Anonymous, over 300 a minute | 200, `isError`, `rate_limited`, scope `address` | "Too many DFO requests from this network right now. Try again in {n} seconds. Signing in gives you your own limit." |
| M3 | Anonymous allowance used up | 401 challenge, with a JSON-RPC error body carrying the sign-in sentence; ChatGPT's form for ChatGPT | Claude: the Connect card. ChatGPT: its linking prompt. Others: "This network has used today's free DFO calls. Sign in with a free DFO account to keep going: {steps}. Anonymous use resets at 00:00 UTC." |
| M4 | Signed in after M3 | The repeated call counts against the account | None in claude.ai and Claude Desktop. Other clients need the user to ask again |
| M5 | Signed in, within limits | The call passes through, counted against the account; dfo-ai logs a `user:` caller | None |
| M6 | Signed in, over the per-minute limit | 200, `isError`, `rate_limited`, scope `account` | "You're sending DFO requests faster than your account allows. Wait {n} seconds and carry on." |
| M7 | Signed in, daily cap reached | 200, `isError`, `allowance_exhausted`, scope `account` | "You've used today's {N} DFO calls. Your allowance resets at 00:00 UTC (in about {h} h {m} min). Do not retry before then." |
| M8 | Token expired | 401 `invalid_token` | None: Claude refreshes and repeats the call |
| M9 | Grant revoked or refresh refused | 401 `invalid_token`; the token endpoint answers `invalid_grant` | Claude: the Connect card. Claude Code: "run /mcp". Body: "Your DFO sign-in has ended. Sign in again to continue." |
| M10 | Token for another audience or issuer, or a bad signature | 401 `invalid_token` | As M9 |
| M11 | Kill switch off | Tokens ignored; at the anonymous allowance, a limit refusal with no challenge | "This network has used today's free DFO calls. Try again after 00:00 UTC. Signing in is unavailable right now." |
| M12 | Counter store unavailable | The in-memory fallback (`limitFallback.ts`), as for every anonymous count | None |

Acceptance, in each committed client (claude.ai, Claude Desktop, Claude Code, ChatGPT, Gemini CLI and Le Chat):

- M1 to M3: anonymous use works up to the allowance, and the user is then offered sign-in, either by the client itself or by text that names the client's own steps.
- M3 to M5: the user can sign in with a DFO account, and later calls count against the account at its limits, with a `user:` caller in dfo-ai's logs. In claude.ai and Claude Desktop the refused call succeeds without the user asking again, and is not counted twice.
- M6 and M7: a signed-in user is never sent to sign in again, and the call spends nothing on the address's counters or the account's API quota.
- M8 to M10: no expired, revoked or foreign token is served as anonymous.
- M11: no response carries `WWW-Authenticate`, and no OAuth route answers.

## Verification before the build

A stub server would answer anonymously until a set number of calls, then with the 401 challenge, behind a tunnel with the real discovery documents. Each client would be run against it, so the unknowns below are settled before the proxy work starts:

- whether Claude starts sign-in on a 401 for a tool that is public to most callers, from a connector added with no authentication (the documented example gates a named tool);
- whether publishing the discovery documents makes Claude Code show the server as needing sign-in before any 401;
- ChatGPT with the bare 401 and with the `_meta` result, and whether it selects CIMD against Better Auth;
- Gemini CLI with the public client: whether `/mcp auth` offers the server without `oauth.enabled` set;
- Le Chat: how it registers (DCR, or a typed client ID), its redirect URI, whether it sends `resource`, and what it does with a later 401;
- loopback redirect matching with an ephemeral port, for Claude Code and Gemini CLI;
- which clients send `resource`, and so receive a JWT;
- whether the model relays the refusal text to the user.

The clients: claude.ai, Claude Desktop, Claude Code (interactive and `-p`), ChatGPT developer mode, Gemini CLI and Le Chat, with Codex, Cursor and VS Code where time allows.

## Rollout

1. The Better Auth upgrade would land on its own, with a sign-in check on dev.
2. The feature would land with `MCP_OAUTH_ENABLED` off in production and on in dev.
3. **Cloudflare on dev.** A WAF rule, bot challenge or edge rate limit in front of the site shows in Claude as "Couldn't reach the MCP server", and the authorization server is called from the vendors' ranges (Claude's is `160.79.104.0/21`) as well as from the user's browser. On dev, with real clients, confirm that:
    - `/.well-known/oauth-protected-resource`, `/.well-known/oauth-protected-resource/mcp`, `/.well-known/oauth-authorization-server/api/auth`, `/api/auth/oauth2/*` and `/api/auth/jwks` answer requests from Claude's, OpenAI's and Mistral's ranges without a challenge;
    - the 401 reaches the client with `WWW-Authenticate` intact;
    - no edge rule turns the proxy's 401 or 200 refusals into a 403 or 429.

    Any rule that does would be changed to skip these paths before production.
4. Production with the switch on, watching sign-in starts and completions, `oauth` identity counts, 401 challenges by outcome, and limit refusals.
5. The connect docs would list the sign-in steps per client.

The runbook would cover turning the switch off, revoking a grant from the admin view, and rotating the signing key (the `jwt()` plugin keeps old keys for 30 days).

## Sizing

| Item | Repo | Days |
| --- | --- | --- |
| Client verification with a stub server | website | 1.5 |
| Raise Better Auth to 1.7.28 and check sign-in on dev | website | 0.25 |
| Plugins (mcp, jwt, cimd), scopes, token lifetimes, tables and migration, signing key | website | 3 |
| Discovery routes and CORS | website | 1 |
| Consent page, resuming sign-in, tests | website | 2.5 |
| Proxy: token check, `oauth` identity, per-user minute and daily counts, 401 challenge, header stripping, kill switch, logging, tests | website | 4 |
| Anonymous daily allowance on `/mcp`, with its number from the logs | website | 1.5 |
| Limit refusals as tool results, version-aware, and ChatGPT's form of the challenge | website, ai | 2.5 |
| Public client for Gemini CLI and Le Chat | website | 0.5 |
| Opaque-token lookup, if the client tests need it | website | 0.5 |
| Confirm the `user:` caller reaches dfo-ai, with a test | ai | 0.5 |
| Connected apps panel and admin view | website | 3 |
| Connect docs with steps per client | docs, ai | 1.5 |
| Cross-client testing | all | 3 |
| Hardening: rate limits on `/api/auth/oauth2/*` | website | 1 |
| Rollout, Cloudflare checks, runbook, monitoring | website | 1.5 |
| **Total** | | **about 28 (24 to 32), size L** |
| DCR, if Le Chat needs it: registration limits and cleanup | website | 2 |

Against the issue's 22 days: the upgrade and the CIMD fetch hardening shrink, since the type check, the tests and Better Auth's SSRF-safe fetch cover most of them. The single URL adds work: the token check sits on the anonymous path, `/mcp` needs a daily anonymous allowance, and refusals become tool results. Client verification and the public client are new.

A first slice of about 20 days would cover client verification, the upgrade, the plugins, discovery, the consent page, the proxy check with the 401 challenge, the anonymous daily allowance, ChatGPT's form of the challenge, and the public client, tested with all four committed clients. Limit refusals would stay HTTP 429 and an admin would revoke grants. The second slice would add tool-result refusals, the panel, the connect docs, and the remaining hardening.

## Risks

- **The shared Claude range.** Any per-address anonymous allowance would be shared by every Claude user (decision 1).
- **Uneven client support.** Of the committed clients, only claude.ai and Claude Desktop complete sign-in on a 401 mid-conversation. Claude Code and Gemini CLI depend on their user following text, ChatGPT needs its own form, and Le Chat is unknown.
- **Le Chat.** Its registration method, redirect URI and 401 handling are documented only in part, and supporting it may mean turning on DCR (decision 6).
- **ChatGPT.** It needs a form of its own, recognised by an unreliable hint, and its CIMD detection has failed in one reported case.
- **The number of clients.** MCP clients are many and change quickly: beyond the four committed ones there are Codex, Cursor, VS Code, opencode, pi, Goose, Zed, Windsurf and others, each with its own OAuth support. Testing every one is not feasible. Open questions: which of them, such as opencode and pi, must be tested; whether a client that follows the specification, or that takes the public client, counts as supported without a test; and how the connect docs mark clients as tested or untested.
- **Loopback redirects.** If Better Auth matches redirects exactly, Claude Code and Gemini CLI would fail to sign in until it is patched or wrapped.
- **Sign-in at connect time.** Codex, and possibly Claude Code, offer sign-in as soon as they find the discovery documents, before any limit is reached.
- **Cloudflare.** Edge rules that treat the vendors' ranges as bot traffic would break sign-in. Checked on dev.

[issue]: https://github.com/DevelopmentFinanceObservatory/website/issues/176
[api-keys]: api-keys.md
[DFO]: https://developmentfinance.org/
[spec-auth]: https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization
[spec-elicit]: https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation
[spec-tools-0618]: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
[claude-auth]: https://claude.com/docs/connectors/building/authentication
[claude-lazy]: https://claude.com/docs/connectors/building/lazy-authentication
[cc-mcp]: https://code.claude.com/docs/en/mcp
[cc-37747]: https://github.com/anthropics/claude-code/issues/37747
[cc-46879]: https://github.com/anthropics/claude-code/issues/46879
[openai-auth]: https://developers.openai.com/apps-sdk/build/auth
[openai-cimd]: https://community.openai.com/t/cimd-is-unavailable-because-the-server-did-not-advertise-cimd-support/1378920
[openai-401]: https://community.openai.com/t/chatgpt-does-not-re-trigger-oauth-on-401-www-authenticate-for-mcp-tool-calls/1374168
[codex-reg]: https://github.com/openai/codex/blob/main/codex-rs/rmcp-client/src/oauth_client_registration.rs
[codex-401]: https://github.com/openai/codex/blob/main/codex-rs/rmcp-client/src/rmcp_client.rs
[vscode-auth]: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/browser/mainThreadAuthentication.ts
[vscode-retry]: https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/extHostMcp.ts
[gemini-oauth]: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/mcp/oauth-provider.ts
[gemini-401]: https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/tools/mcp-client.ts
[gemini-cimd]: https://github.com/google-gemini/gemini-cli/issues/25724
[cursor-mcp]: https://cursor.com/docs/context/mcp
[cursor-401]: https://forum.cursor.com/t/plugin-mcp-oauth-never-reaches-needsauth-authenticate-button-missing-browser-never-opens/170058
[mistral]: https://docs.mistral.ai/vibe/work/web/connectors/mcp-connectors
[gh-mcp]: https://github.com/github/github-mcp-server/blob/main/pkg/errors/error.go
[notion]: https://developers.notion.com/guides/mcp/rate-limits
[exa]: https://github.com/exa-labs/exa-mcp-server/blob/main/src/utils/errorHandler.ts
[The problem]: #the-problem
[Proposal]: #proposal
[Decisions]: #decisions
[Decisions needed]: #decisions-needed
[Client support]: #client-support
[Registration]: #registration
[Sign-in after a 401]: #sign-in-after-a-401
[Design sketch]: #design-sketch
[The proxy check]: #the-proxy-check
[The anonymous allowance]: #the-anonymous-allowance
[Refusals]: #refusals
[Authorization server]: #authorization-server
[Token check]: #token-check
[Stories]: #stories
[Verification before the build]: #verification-before-the-build
[Rollout]: #rollout
[Sizing]: #sizing
[Risks]: #risks
