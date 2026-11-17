# API Keys for the Platform Proxy

[Issue #142][issue]

## Contents

- [Summary][]
- [How It Works Today][]
- [Requirements][]
    - [Key Format and Communication][]
    - [Limits][]
    - [Cloudflare Integration][]
    - [Where Keys Apply][]
    - [Identity, Failure and Abuse][]
    - [Logs and Docs][]
- [Build][]
    - [Storage][]
    - [The Proxy Check][]
    - [Future Work: Admin Interface][]
- [Use: Better Auth API Key Plugin][]
    - [What the Plugin Provides][]
    - [How It Would Fit][]
    - [Admin System][]
    - [What It Saves and What It Costs][]
    - [Spike Before Deciding][]
- [Phases][]
    - [Phase 1: Validate][]
    - [Phase 2: Provision][]
    - [Phase 3: Enforce][]
- [Testing][]
    - [Local Test Results][]
- [Runbook][]
- [Work by Repository][]
- [Alternatives Considered][]
- [Future Features][]
- [Open Questions][]

## Summary

This feature is to add per-user access to the Development Finance Observatory backend. This will enable:

- Metered and ACL'ed access
- Protection against cost overruns or operational problems stemming from heavy legitimate use or high-volume access by an adversary. Having the ability to grant key-specific access lets us lower default limits for safety, and make runtime maneuvers like turning off free access altogether if we are being abused or attacked.
- Potential future cost models, e.g. serving high-volume, high-cost, or licensed data

We intend to still have a free / open tier. We want minimal friction for the majority of users to use DFO, since it's a valuable onramp. Search and AI crawlers are also an important source of traffic for us, and will continue to be. But more expensive and frequent access will go through an API key.

The proxy fronts the public Search, Datasets and Graph APIs (`/api/v1/*`) and the MCP servers (`/mcp`). Today it knows callers only by address.

Requirements:

- Anonymous access will stay open up to a limit. Our goal is to manage usage and enable rate limits, not wholesale API gating.
- Each account that holds keys has its own rate limit, shared by all of its keys.
- Some MCP features may later require sign-in. That is separate from keys and out of scope here.

**Recommendation.** Use Better Auth's API key plugin from Phase 1, with keys in our own Postgres. The site already uses Better Auth for sign-in and sessions, so the plugin gives us key generation, hashing, storage, and the create, list and delete operations with ownership checks, without writing them, and it makes self-service possible from the start. We keep our own limiter, which anonymous traffic needs anyway, and we own the key lookup on the request path, with its caching and outage handling. A spike confirmed the plugin fits, with workarounds. If that changes, we fall back to building a small key table of our own behind the same verifier.
See [Use: Better Auth API Key Plugin][], [Build][] and [Alternatives Considered][].

We'll take a phased approach. Phase 1 ships the proxy check, an admin page for operators and a self-service page in the account menu. It proves keys in production with a few callers we choose before self-service is announced. Follow-on work lowers the anonymous limits once heavy users are on keys.

## How It Works Today

Every public API and MCP call passes through one function in the website, `forward()` in `src/lib/proxy/forward.ts`. That is the single place a key needs to be checked.

- **Rate limit.** `forward()` counts each call against the client's address in a fixed window: 120 calls a minute on `/api/*`, 300 on `/mcp`. The counters live in the website's Postgres (`limit_counter` table) and are shared by all instances. If the count fails or is slow, the call goes through uncounted, so a burst sent while the database is slow is not limited at all.
- **No Redis.** The original task description mentions turning a Redis limiter back on. There is no Redis code in the website now, so per-key limits need no Memorystore instance.
- **Edge limits.** Cloudflare (Pro plan) also rate-limits by address, in front of the site: 600 calls a minute on the data API and 60 on the Studio, each blocking the address for 10 minutes. `/mcp` has no edge limit.
- **dfo-ai's own limit.** All outside MCP calls share one bucket in dfo-ai of about 2,400 calls a minute. Keyed MCP traffic draws on the same bucket.
- **Caller identity.** The proxy names the caller to the backends as `x-dfo-caller: ip:<digest>`, a keyed hash of the address. dfo-apis counts its own allowances (shares, cards, pins) against that name. It trusts the header only beside a secret it shares with the website.
- **Backends are ahead of us in one place.** dfo-ai's caller module already documents `key:` and `user:` callers "from the website's edge". dfo-apis accepts only the `ip:` form.
- **MCP auth.** On `/mcp` the proxy attaches its own token for the harness when it holds one. Otherwise it passes the caller's `Authorization` header through.
- **Accounts.** The site has sign-in (Better Auth on its own Postgres) and an account menu, which is where self-service keys would attach.
- **Docs.** The API quickstart says the API accepts requests without a key.

## Requirements

A key is optional on every call. A call with a valid key is counted against the key's account at the account's limit, a call with no key is counted against the address as today, and a call with a bad key is refused. These requirements hold whether we use Better Auth's plugin or build the key store.

### Key Format and Communication

- Format: `dfo_live_`, 32 random letters, then an 8-character signed tag, 49 characters in all. The prefix lets secret scanners and our own logs spot a leaked key.
- The tag is the first 8 base64url characters of an HMAC-SHA-256 over the rest of the key, keyed by a server secret. It proves the key was minted here, so the proxy turns a made-up key away before any database read (see [The Proxy Check][]). A plain checksum would not do: the repository is public, and anyone could compute one. Partners hold keys in this format, so it is fixed before the first key is issued; changing it later would mean two admission paths until every old key is replaced.
- Shown once, when it is created. We store only a SHA-256 hash of the whole key, so a database leak exposes no usable key.

How the key is sent is a design choice. We propose sending the key as a bearer token in a standard header, `Authorization: Bearer dfo_…`. The proxy also accepts `X-API-Key` as an alias. We don't plan to accept the key in a query string, as that's an outmoded style, although some people like it for ease of use and debuggability.

- Bearer is what a programmatic partner reaches for first, and what MCP developer clients set most easily.
- The `dfo_` prefix lets the proxy tell our key from any other bearer token.
- The alias costs a few lines. It leaves `Authorization` free if `/mcp` later gains sign-in, where one call could carry a user's token and an application's key.
- A call that sends both headers with different keys is refused with a 400.
- The proxy strips the key before forwarding, so it never reaches a backend or its logs. A `dfo_` value in `Authorization` under any scheme (`Token dfo_live_…`, a bare key) is stripped too, though only `Bearer` is read as a key.
- Request headers are kept off Sentry events and transactions, since Sentry otherwise copies every request header but cookies and IP headers onto each event (`src/lib/sentryOptions.ts`).

**Comparables: How Other Services Do It**

Since this is an interesting choice, we did an informal survey of how other services convey tokens.

| Style                         | Who uses it                                                                                                                               | Notes                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Authorization: Bearer <key>` | OpenAI, Stripe, GitHub, Cloudflare, SendGrid                                                                                              | The closest thing to a standard. Every HTTP client and SDK can set it, and proxies, loggers and secret scanners already treat it as sensitive                                |
| Custom header                 | Anthropic and AWS API Gateway (`x-api-key`), Google Cloud (`x-goog-api-key`), Azure (`Ocp-Apim-Subscription-Key`), Datadog (`DD-API-KEY`) | Common where `Authorization` is reserved for something else, usually a user's OAuth token or a signed request. The key names the application; `Authorization` names the user |
| Query parameter (`?api_key=`) | Google Maps, US Census, FRED, api.data.gov                                                                                                | Easy to try in a browser, which is why open-data APIs like it. It leaks into access logs, browser history and referrers, so newer APIs avoid it                              |

Some services accept more than one: Stripe takes Bearer or HTTP Basic, and api.data.gov takes `X-Api-Key` or the query parameter. The split between the first two styles is mostly whether `Authorization` is already in use. A service with only keys uses Bearer. A service with keys and user tokens moves the key to a custom header.

**Compatibility with MCP Clients**

The MCP specification defines authorization as OAuth, with the token sent as `Authorization: Bearer`. It has no API-key concept, so support for a key depends on the client.

| Client type       | Examples                                  | Can it send our key?                                                      |
| ----------------- | ----------------------------------------- | ------------------------------------------------------------------------- |
| Developer clients | Claude Code, Cursor, VS Code, SDK scripts | Yes. They let a user configure headers per server, so either header works |
| Claude            | Custom connectors                         | Yes. A custom connector accepts an API key as a request header            |
| ChatGPT           | Connectors                                | No. It accepts only OAuth or no sign-in                                   |

So a key on `/mcp` serves programmatic and developer use, and Claude connector users. ChatGPT users stay anonymous until `/mcp` has OAuth sign-in, which is the separate "MCP features that require logging in" work. Client support changes often and needs checking before we rely on it.

**Compatibility with the Proxy as Built**

| Path                                               | What happens to `Authorization` today                           | Effect of a key there                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/api/v1/*`                                        | Not passed upstream: dfo-apis reads no caller's `Authorization` | No conflict                                                                                           |
| `/mcp`, proxy holds the harness token (production) | Overwritten with the harness token                              | No conflict. The proxy reads the key first, then replaces the header as it does now                   |
| `/mcp`, proxy holds no token                       | The caller's value is passed through to the harness             | The only conflict. The `dfo_` prefix resolves it: our key is consumed, any other token passes through |

### Limits

The limit belongs to the account, not the key. All of an account's keys count against one allowance, so creating more keys does not multiply it. The limit is one plain number, in calls per window. There are no named tiers.

The number applies to each surface separately. An account with a limit of 200 can make 200 calls a minute on the API and 200 a minute on MCP, and heavy use of one does not use up the other.

| Surface | Covers                                 | Anonymous limit today          | Keyed limit         |
| ------- | -------------------------------------- | ------------------------------ | ------------------- |
| API     | `/api/v1/*`, `/openapi.json`, `/codes` | 120 calls a minute per address | The account's limit |
| MCP     | `/mcp`                                 | 300 calls a minute per address | The account's limit |

- The limit is an optional integer on the account.
- Empty means the default for keyed callers, set per deployment in env (for example `RATE_LIMIT_KEYED`). Most accounts store nothing, and raising the default moves them all at once.
- A number overrides the default for that account.
- The window stays global at 60 seconds (`RATE_LIMIT_WINDOW_S`). There is no per-account window.
- A slow counter must not let a burst through. Today a slow or failed count lets the call through uncounted. Instead, each instance keeps a small in-memory count per caller and falls back to it when the shared count is slow, so the proxy stays available but one caller is still held near its limit on each instance. The fallback goes on from the last shared count it saw for the caller in the window, so a caller already refused stays refused.

One number is simpler to explain to a key holder and simpler to administer. The anonymous limits differ by surface because chat vendors send many users from one address. That does not apply to an account, which is one caller.

What this gives up is setting an account's MCP limit apart from its API limit. MCP can be a significant cost driver, and all outside MCP calls share dfo-ai's bucket, so caps for keyed MCP use are listed under [Future Features][]. They can be added later without disturbing existing accounts.

This is all on the admin side. If we later want tiers, for single or bulk changes to keys, they can be added as a column or as a bulk update over this number without changing what it means.

Not covered by an account's limit:

- The proxy's third allowance, `/api/download-pin` at 10 calls a minute, belongs to the site's download UI and is not part of the public API.
- The Studio's daily prompt allowance is for the site's own chat UI.
- dfo-apis keeps its own daily allowances per caller: 10 shares and 500 presentation cards, plus pins. A keyed caller gets these at the default values. Raising them for a partner would be a dfo-apis setting, not part of the account's limit.

### Cloudflare Integration

Cloudflare sits in front of the site and rate-limits by address. The proxy stays the per-account limiter, and Cloudflare is a coarse backstop against floods, set above the highest limit any account will have.

**Current Configuration**

The zone is on the Pro plan. It limits the data API to 600 calls a minute per address and the Studio to 60, each blocking the address for 10 minutes. `/mcp` has no edge limit. No change is proposed for Phase 1: 600 a minute is well above the proxy's anonymous limit, so it binds only if an account is granted more than 600 calls a minute from one address. If that happens, the threshold is raised or a rule skips requests carrying a key header, as below. Pro cannot count by a header. Cloudflare cannot tell a real key from a made-up one, since it sees only a header value, so it cannot enforce per-key limits itself.

**What Cloudflare Recommends**

Its [rate limiting best practices][cf-best-practices] for REST APIs count requests per API key, not per address:

- To protect an endpoint: match the path and method, count by the `x-api-key` header, and block above the rate.
- To protect resources: count by path plus `x-api-key`, so each key gets a rate per resource.
- For clients with no key: count by IP.
- For the rate itself: take it from API Discovery or from past traffic. The page gives no default number.

It shows no paired "anonymous rule plus keyed rule" example, but that is what the pieces add up to.

**What Each Plan Allows**

Counting by a header needs Advanced Rate Limiting, an Enterprise add-on ([availability by plan][cf-availability]).

| Plan                                | Can count by                                | Rules | Longest window |
| ----------------------------------- | ------------------------------------------- | ----- | -------------- |
| Free                                | IP                                          | 1     | 10 s           |
| Pro                                 | IP                                          | 2     | 1 min          |
| Business                            | IP, IP with NAT support                     | 5     | 10 min         |
| Enterprise                          | IP, IP with NAT support                     | 100   | about 18 h     |
| Enterprise + Advanced Rate Limiting | Headers, cookies, query, ASN, path and more | 100   | about 18 h     |

Below Enterprise, a rate limiting rule's own match expression cannot reference request headers, so "apply this rule only to requests without a key" cannot be written in the rule.

**Options for Keyed Traffic**

- With Advanced Rate Limiting: follow Cloudflare's pattern. One rule counts by IP for requests with no key header. Another counts by the key header at a high ceiling. A fake key then earns only a separate bucket that is still limited.
- Without it: raise the per-address threshold, or add a custom rule that skips rate limiting for requests that carry a key header. Whether custom rules can match headers and skip rate limiting rules on every plan is unconfirmed. The skip can be abused with a fake header, and the proxy's limit is then the only one left for that traffic.
- Today's thresholds are already well above the proxy's anonymous limits, so Phase 1 needs no edge change.

### Where Keys Apply

| Surface                                                                          | Key honored? | Notes                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/search`, `datasets`, `graph`, `presentation`; `/openapi.json`; `/codes` | Yes          | Counted on the API surface                                                                                                                                                                                           |
| `/mcp`                                                                           | Yes          | Counted on the MCP surface. Where the proxy holds no harness token, a `dfo_` bearer leaves no credential for the harness, so a keyed call there must send the key as `X-API-Key` and the harness token as the bearer |
| `/api/v1/studio/*`                                                               | No           | The Studio is the site's own chat UI. A key never replaces or bypasses its daily prompt allowance. A key sent there is removed and otherwise ignored                                                                 |
| `/api/download-pin`, MCP theme stylesheets                                       | No           | These do not pass through the key check today and stay as they are                                                                                                                                                   |

On every surface, a `dfo_` value is consumed by the proxy and never copied upstream, including when verification fails. dfo-apis gets no caller `Authorization` at all. Other upstreams get any other value as they do today.

### Identity, Failure and Abuse

- **One identity per request.** The proxy resolves the caller once, as an address or a key, before the limiter runs. That one identity is used for counting, for `x-dfo-caller` to both dfo-apis and dfo-ai, and for logging. Today the MCP route, the dfo-apis path and the request log each work out the caller separately.
- **Invalid keys.** An unknown or revoked key gets a 401 and does not fall back to anonymous. There is no separate budget for bad keys. A key whose tag no server secret made is refused before any read or count, and logged with its own outcome (`forged`) so made-up keys can be counted. A valid key is never charged to its address, so keyed callers behind a busy shared address, such as Claude connector users on Anthropic's addresses, are not held to that address's anonymous limit, and a later cut to the anonymous limits does not touch them. A deleted key keeps a good tag, so a good tag that finds no key is charged to its address, as every cache miss once was: deleted keys cost what made-up keys used to, and made-up keys cost nothing. Keys over a maximum length are refused unread, and unknown keys are cached briefly as unknown.
- **Revocation.** Revoking a key deletes it. The plugin lets a key's owner switch a disabled key back on, so disabling is not revocation. Logs keep the key's public id, so its history survives. A deleted key stops being admitted within the cache lifetime, about a minute per instance. The lifetime is absolute and is not extended when the store is unreachable. Revoking stops new calls. It does not cut a stream that is already open. Lowering an account's limit takes effect on the same delay.
- **Emergency switch.** An operator can delete one key from the admin page without a deploy. Turning off all keyed access sets `API_KEYS_ENABLED=false`, an environment variable, which takes a new Cloud Run revision. It stays an environment variable because the switch exists for a faulty key path, and it must still work when Postgres is down. See [Runbook][].
- **Key store unavailable.** The check fails open. A key already in the cache keeps working until its entry expires. A key that is not in the cache is treated as anonymous while the store cannot be reached: the call goes through at the anonymous limit for its address. Rate limiting is not a mission-critical part of the system, so staying available matters more than enforcing an account's own limit during an outage. The plugin reports a database outage as an invalid key, so the verifier has to tell the two apart itself rather than answer 401 to every uncached key during an outage. The lookup gets its own bounded pool and timeout, as the counter has, so a slow store does not slow the proxy.

### Logs and Docs

- Key usage is logged in `forward()`, where the key is checked. The line carries the key's public id, its account, the surface and the outcome (`allowed`, `limited`, `invalid`, `forged` or `unavailable`), and never the key or its hash. A failed key lookup logs only its error code, since the database error's message carries the query's parameters. While keys are off, a call carrying `X-API-Key` logs a line saying whether the value has our prefix, so callers who send another service's key there, and would get a 401 once keys are on, can be counted first. The existing request log works the caller out from raw headers when the response closes, apart from `forward()`, so it cannot see which key was used. Per-key and per-account usage metrics come from this line, and the Phase 1 exit criterion and Phase 3's search for high-volume callers rely on it.
- `/openapi.json` gains an optional security scheme, and the API and MCP docs explain keys. The API quickstart in the docs repository, which says no key is needed, is updated.

## Build

In this option we own the key store: a table in the website's Postgres, a lookup in the proxy, and admin pages. Nothing new is installed. This is the fallback if the plugin spike fails.

The proxy reaches the store through a small verifier: it takes a key and answers with the key's public id, limit and owner, or says the key is invalid, or says the store is unavailable. Nothing else in the proxy knows where keys live, so the store can change later. Public ids stay the same if it does.

### Storage

A new `api_key` table in the website's Postgres, beside the accounts and the limit counters.

| Column                   | Purpose                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| id                       | Short public identifier, used in logs and as the caller name         |
| key_hash                 | SHA-256 of the key, unique                                           |
| prefix                   | First characters of the key, so its owner can recognize it in a list |
| label                    | What the key is for                                                  |
| user_id                  | Owning account                                                       |
| created_at, last_used_at | Lifecycle. `last_used_at` is updated occasionally, not on every call |

The account's limit is an optional integer on the user record, empty meaning the default for keyed callers. Revoking deletes the row.

Postgres rather than Redis: the limiter already counts there, key volume is small, and it adds no new infrastructure. This can be changed later if we need something more scalable and performant at the cost of some additional dev and operational complexity.

### The Proxy Check

Before the rate limit, on the surfaces in [Where Keys Apply][]:

1. Read the key header. No header: carry on as an anonymous caller.
2. Check the key's signed tag against each server secret. A bad tag: answer 401, with no read and no count.
3. Hash the key and look it up in a short in-process cache (about 60 seconds), so a keyed call adds no query in the common case. On a cache miss, look the key up in the store. Lookup is by the hash, so no secret is compared by hand.
4. Unknown or revoked key: count the call against the address's normal limit, then answer 401 with a problem document (429 when the address is over its limit).
5. Valid key: count the call against the owning account at the account's limit, and never against the address, using the existing counter, which already counts each surface separately.
6. Log the key's public id, its account, the surface and the outcome.

[Identity, Failure and Abuse][] covers revocation delay and failing open when the store is unavailable.

A keyed call is named to the backends by its account instead of `ip:<digest>`, so their allowances are per account too. The form is `user:` and the first 32 hex digits of an HMAC-SHA-256 over the account id, keyed like the `ip:` digest, so no account id leaves the website. dfo-apis refuses any form but `ip:` with a 400 today. dfo-ai accepts a keyed caller on arrival, but its MCP servers drop any caller that is not `ip:<digest>` before they call dfo-apis. Both need a change. See [Work by Repository][].

### Future Work: Admin Interface

Operators work from an admin page (see [Admin System][]). Later phases need more, and all of it would be ours to build:

- Self-service pages in the account menu to create, label and revoke keys and see last use, with the endpoints and ownership checks behind them (Phase 2).
- An operator view to find a key, see its usage, and raise or cut its limits (Phase 3).
- Expiry, and several keys per account, which the plugin gives us and the Build store would need too.

## Use: Better Auth API Key Plugin

In this option the key store is the [API key plugin][better-auth-api-key] of Better Auth, the library that already handles sign-in on the site. It is a separate package, `@better-auth/api-key`, whose version tracks `better-auth` exactly. Keys live in our own Postgres, in a table the plugin defines. No third-party service is involved. This is the recommended option from Phase 1, behind the same verifier the Build store would use.

### What the Plugin Provides

| Area                         | What it does                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Storage                      | An `apikey` table. Keys are hashed by default, and the first characters are kept so an owner can recognize a key              |
| Key format                   | A configurable prefix and length (64 characters by default), or our own generator                                             |
| Create, list, update, delete | Server methods and matching client methods. A signed-in user can manage only their own keys                                   |
| Verify                       | `auth.api.verifyApiKey({ body: { key } })` returns whether the key is valid, why not, and the key's record without the secret |
| Ownership                    | Every key belongs to a user, or to an organization if we adopt that plugin. A user can hold several keys                      |
| Expiry                       | Optional per key, with expired keys removed automatically                                                                     |
| Rate limit                   | One limit per key: a window and a maximum, counted on the key's row at each verification                                      |
| Quotas                       | An optional count of remaining requests per key, with periodic refill                                                         |
| Metadata                     | Free-form data per key, for example a plan name                                                                               |
| Header                       | Reads `x-api-key` by default. Other headers, or a function that extracts the key, can be configured                           |

### How It Would Fit

The spike (below) shaped these. The plugin generates, hashes, stores and manages keys. Our code owns the request path.

- **Proxy check.** The proxy does not call `verifyApiKey`. That call writes to the key's row on every verification, with no way to turn the writes off, and it reports a database outage as an invalid key. Instead our verifier hashes the key with the plugin's own hasher (`base64url(SHA-256(key))`) and reads the plugin's `apikey` table with Drizzle, on its own bounded pool and timeout. It checks `enabled` and `expiresAt` itself, after the signed tag. A throw or timeout means "store unavailable", so failing open works as in [Identity, Failure and Abuse][]. The read is behind the short in-process cache, and the cache stores `expiresAt` so an expired key is not admitted from the cache.
- **Header.** The proxy parses `Authorization: Bearer dfo_…` and `X-API-Key` itself. The plugin's option to turn a key into a session (`enableSessionForAPIKeys`) stays off: with it on, a key acts as its owner on every `/api/auth/*` endpoint, account deletion included.
- **Limits.** The plugin's limiter is off. We count in `limit_counter`: ours lets verification sit behind the cache, emits the `X-RateLimit-*` headers, and is the limiter anonymous traffic uses anyway. The account's limit is an extra field on the Better Auth user record (`apiRateLimit`, not settable by the user).
- **Key format.** The plugin mints keys through its `customKeyGenerator` option: its own random letters, then the signed tag. The stored hash covers the whole key and works as before.
- **Endpoints.** The plugin's HTTP endpoints for keys are disabled. A user could otherwise create a key with any prefix and expiry. Better Auth checks `disabledPaths` only in its HTTP router, so our server actions still reach the server methods. The account page lists and deletes keys with the plugin's `listApiKeys` and `deleteApiKey` on the request's session, so the plugin alone decides which keys are whose and checks a ban on delete. Creating passes the signed-in user's id and forces the `dfo_live_` prefix.
- **Revocation.** Revoking deletes the key. The plugin lists and deletes keys only for their owner, so the admin page's queries over other accounts' keys read and delete the plugin's table with Drizzle.
- **Ownership.** Every key belongs to an account, and is deleted with it. A partner's keys belong to a role mailbox account, such as a team address, set up before the first partner key, so a key does not leave with the person who made it.
- **Schema coupling.** The proxy's key check and the admin queries read the plugin's table directly, which ties them to its schema. A known-answer test pins the hash, and the tests of the columns they read run on every plugin upgrade.
- **Caller name.** The key's account names the caller to the backends as `user:<32 hex>`, a keyed digest of the account id. The plugin's key id, a 32-character random string, is the public id in logs.
- **Schema.** The plugin's table is added through our existing migrations, as the auth tables were, with two changes: a unique index on the key hash, and a foreign key to the user that deletes an account's keys with the account. The plugin has neither.

### Admin System

There is no admin interface to leverage. This was checked in three places:

| Candidate                                                | What it is                                                                                                           | Does it manage API keys?                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The API key plugin itself                                | Server and client methods only                                                                                       | It has the operations, but no pages. Listing returns the signed-in user's own keys, so an operator view across all keys would query the table directly |
| [Better Auth admin plugin][better-auth-admin]            | User administration: list and edit users, roles, bans, sessions, impersonation                                       | No. It has no pages either, only methods, and it does not cover API keys                                                                               |
| [Better Auth Infrastructure dashboard][better-auth-dash] | A hosted dashboard from the Better Auth company, fed by a plugin that sends user and session events to their service | Not documented. It would also send account activity to a third party                                                                                   |

So the operator view is ours to write in either option. With the plugin, it still queries the table directly, since the plugin lists and deletes keys only for their owner.

Phase 1 ships it as a proof of concept at `/admin/api-keys`. It is open to signed-in users whose verified email is in `ADMIN_EMAILS`, and answers 404 to everyone else, checked on the page and in every action. An operator can list every key with its owner and last use, filter by email, create a key for an account, delete any key, and set or clear an account's limit. Each change writes a log line naming the operator. A Cloud Run Job running an admin command is no longer needed for Phase 1, though one could still be added for scripted changes. Setting an account's limit to 1 holds all its keys, new ones included, to one call a minute. Shutting an account out entirely needs a ban, which waits for Better Auth's `admin()` plugin and its roles; that plugin is worth adding once there is more than one admin task to gate. Anonymous access stays open either way.

The self-service page, `/account/api-keys`, is our own server actions over the plugin's server methods, since the plugin's HTTP endpoints are disabled. Its five-key cap is checked again after each insert, so creates in parallel cannot pass it.

### What It Saves and What It Costs

Saves:

- Key generation, hashing and comparison, which are the security-sensitive parts.
- The create, list, update and delete endpoints with ownership checks, which Phase 2 needs.
- Several keys per account, and expiry, listed under [Future Features][].

Costs:

- A dependency in the path of every keyed request, on a package that has changed recently: it moved to its own package, and its owner column was renamed. Our cache keeps it off the path for most calls.
- A second limiter that we switch off.
- Outage handling the plugin does not do, which we wrap around it.
- Less control over the table's shape, and upgrades that may bring migrations.

Every key needing an owning account is not a cost here: limits are per account anyway.

### Spike Before Deciding

Run against `better-auth` 1.7.7 and `@better-auth/api-key` 1.7.7 on Postgres. Verdict: fits, with the workarounds in [How It Would Fit][].

- [x] Works with `better-auth` 1.7.7 and our Drizzle migrations. The plugin's version tracks `better-auth` exactly, so the two are upgraded together.
- [x] Verification writes on every call (a read and two updates), and the writes cannot be turned off. The proxy reads the table itself instead.
- [x] Headers: the proxy parses them itself. The plugin's getter only matters for key-as-session, which stays off.
- [x] A signed-in user reaches only their own keys and cannot set limits or permissions. They can set a key's prefix, re-enable a disabled key and remove an expiry, so the plugin's HTTP endpoints are disabled and wrapped.
- [x] Without a foreign key, deleting an account leaves keys that still verify. We add the foreign key. An expired key is deleted when it is next verified, so our cache checks expiry itself.
- [x] The plugin cannot tell an invalid key from an unavailable store. Our own read can.
- [x] An admin command can create a key for another user and set an account's limit from the server. Deleting another user's key goes through the adapter or Drizzle. Running it as a Cloud Run Job was not tested.

## Phases

Three phases take keys from an optional test feature to the normal way heavy users reach the API. Anonymous access stays open throughout.

### Phase 1: Validate

**Goal:** Optional keys work end to end, for testing and the first partner

**Scope:** Keys work on both `/api/v1/*` and `/mcp`. MCP is in scope from the start because it can be a significant cost driver.

**Who gets a key:** A few callers we choose

**Provisioning:** Operators create and revoke keys on the admin page, `/admin/api-keys`. The self-service page is built but not yet announced

**Limits:** The keyed default, or an account's own limit set on the admin page

**Anonymous access:** Unchanged

**Also needed:** Proxy check behind a verifier, the signed key tag and its secret, the plugin's key table, the admin page, the `API_KEYS_ENABLED` switch that turns all keyed access off, a burst-safe fallback when the counter is slow, dfo-apis and dfo-ai accept and pass on keyed callers, key usage logged in `forward()`, and the API docs and quickstart

**Before release to production:** on dev, a keyed MCP call reaches dfo-apis as `user:` and spends the same account allowance as a keyed API call

**Exit criteria:** The first partner runs on a key in production without incident, and per-key counts in the logs match what they report sending.

### Phase 2: Provision

**Goal:** Anyone can get a key; existing users have a path to move

**Who gets a key:** Any signed-in account

**Provisioning:** Self-service from the account menu, `/account/api-keys`: create, label, revoke, see last use, up to `API_KEYS_MAX_PER_ACCOUNT` keys (5 by default). The page was built alongside Phase 1, so Phase 2 is when it is announced rather than when it is written.

**Limits:** A default for self-service accounts, with higher limits granted by an operator. We will examine current usage and tune the default and the anonymous thresholds at that time, as part of the transition plan.

**Anonymous access:** Unchanged; docs start recommending a key

**Also needed:** A transition notice for current users, a way to ask for a higher limit, usage shown to key owners, and a decision on caps for keyed MCP use before keys are announced for MCP (see [Future Features][])

**Exit criteria:** The transition notice has been out for an agreed period, and the callers who would be hit by lower anonymous limits have been identified and contacted where we can reach them.

### Phase 3: Enforce

**Goal:** High-volume users are on keys; anonymous limits can come down safely

**Who gets a key:** Same, plus outreach to heavy anonymous callers

**Provisioning:** Self-service, plus operator tools to raise or cut an account's limit

**Limits:** Anonymous limits lowered in steps

**Anonymous access:** Open but lower

**Also needed:** Usage reports by caller, a playbook for lowering a limit and rolling it back, edge rules that respect keys

Phase 1 should avoid choices that Phase 2 has to undo. Every key has an owning account from the start, and the limit is stored per account in a form a tier can replace.

## Testing

### Local Test Results

Run against the local stack: the website on the implementation branch, the ai harness, and the dev apis proxy. These runs predate the signed tag; keys made then have no tag and are now refused. Sign-in used an emailed code caught by a local mail catcher, and the key was created on the account's API keys page. The key went in as `Authorization: Bearer dfo_live_…`.

| Test                              | How                                                                                                                                                          | Result                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Question and answer through MCP   | The pi coding agent, with a small local model, connected to the site's `/mcp` with the key as its bearer and was asked how much money Kenya received in 2025 | Answered from OECD DAC2A, citing the dataset and the partial 2025 data. The figures came from the tools. The small model's totals were unreliable: it mixed official and private donors |
| MCP session with a key            | A scripted session: `initialize`, then `tools/list`                                                                                                          | 16 tools. `X-RateLimit-Limit: 600`, the keyed default, where an anonymous MCP caller gets 300                                                                                           |
| Usage counted against the account | The limiter's rows after keyed calls                                                                                                                         | Counted as `mcp:acct:<user id>` and `api:acct:<user id>`, not by address. The key's last use advanced as calls were made                                                                |
| Anonymous traffic unaffected      | An anonymous call during the keyed burst below                                                                                                               | 200, counted against its address at the anonymous limit (120)                                                                                                                           |
| Limit enforced on the API         | Account limit set to 5; seven keyed `GET /openapi.json` calls at the start of a window                                                                       | Calls 1 to 5 answered 200, with remaining counting down from 4 to 0. Calls 6 and 7 answered 429 with `Retry-After: 58`                                                                  |
| Limit enforced on MCP             | Two MCP sessions under the limit of 5                                                                                                                        | The first used 3 calls. The second was refused at `initialize` with 429, because the account's calls are shared across sessions                                                         |
| An MCP client under a low limit   | Account limit set to 2; pi asked the same question                                                                                                           | pi finished, in about 4 minutes against 2 at the default limit                                                                                                                          |
| Limit changes take effect         | The limit set to 5, then 2, then cleared                                                                                                                     | Each change reached the proxy within 8 seconds, inside the cache lifetime of about a minute                                                                                             |

A refused call is answered with a problem document, the `Retry-After` header and the `X-RateLimit-*` headers:

```
HTTP/1.1 429 Too Many Requests
content-type: application/problem+json
retry-after: 36
x-ratelimit-limit: 5
x-ratelimit-remaining: 0
x-ratelimit-reset: 36

{"type":"/codes/rate_limited","title":"Too Many Requests","status":429,
 "detail":"Too many requests: 5 per window per account. Try again in 36s.",
 "code":"rate_limited","retryable":true,"trace_id":"…"}
```

Observations:

- **Refused calls count.** A refused call still adds to the window's count, because the limiter counts every attempt. Usage read from the counters therefore includes refusals. Usage reports should come from the usage log line, which records the outcome of each call.
- **Backends not exercised.** The local stack sends no caller to the backends, because the caller key and the shared secret are unset there. dfo-apis and dfo-ai seeing the account as a `user:` caller has to be tested on dev, after their changes are deployed.
- **Not tested locally.** Cloudflare's edge rules, and a store outage on a live stack, are covered only by unit tests so far.

## Runbook

**Turn all keyed access off.** Set `API_KEYS_ENABLED=false` on the service, which rolls out a new revision; keys are then stripped and every call is counted by address. Set it back to `true` to turn keys on. The rollout time is to be measured on dev and recorded here before release.

```
gcloud run services update <service> --region <region> --update-env-vars API_KEYS_ENABLED=false
```

**Before keys are first switched on in an environment,** run a week with `API_KEYS_ENABLED=false` and count the `api key header while keys are off` lines with `ours: false`: those callers send another service's key in `X-API-Key` and would get a 401.

**Rotate the key tag secret.** `API_KEY_TAG_SECRETS` is a comma-separated list, one per environment and never derived from `BETTER_AUTH_SECRET`, so rotating the auth secret leaves keys alone. The first entry signs new keys; every entry verifies. To rotate, add the new secret at the end in one revision, then move it first in the next, so no instance meets a key it cannot check. Removing a secret voids every key it signed, and keys do not expire, so a secret is removed only after its keys are replaced. A production instance refuses to start without the list.

## Work by Repository

Most of the work is in the website. This split holds for both options: Use and Build differ only in the website row, in where keys are stored and how they are looked up. The other rows are the same either way, since those systems see only the caller name and the key header. The Phase 1 pieces:

| Where      | Size       | What                                                                                                                                                                                                                                                        |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| website    | Most of it | The plugin and its table migration (or our own `api_key`); key check, per-account limit, burst-safe counter fallback and key usage logging in `forward()`; the self-service and admin pages; OpenAPI security scheme; tests beside the existing proxy tests |
| dfo-apis   | Small      | Accept a keyed caller in `x-dfo-caller` beside the website's shared secret, so allowances count per account. Today only `ip:<digest>` is accepted, and anything else gets a 400                                                                             |
| dfo-ai     | Small      | Pass a keyed caller on to dfo-apis. Its data, presentation and analysis clients forward only `ip:<digest>` today and drop anything else, which would count a keyed caller's allowances against dfo-ai itself                                                |
| infra      | Small      | `API_KEY_TAG_SECRETS`, a dedicated secret list per environment, before the first key is issued. The admin page covers operator changes in production; a Cloud Run Job for a scripted admin command is optional                                              |
| docs       | Small      | The API quickstart, which says no key is needed, and a page on keys that gives the 49-character key length                                                                                                                                                  |
| Cloudflare | None today | The Pro plan's per-address rules (600 a minute on the data API) sit well above the proxy's limits. Revisit if an account is granted more than that from one address                                                                                         |

Order matters. dfo-apis refuses a caller form it does not recognize with a 400 when it arrives with the shared secret. So dfo-apis ships first, then dfo-ai, and the website starts sending keyed callers last. An end-to-end test should show a keyed call through `/mcp` spending the account's own allowance in dfo-apis.

## Alternatives Considered

Besides [Build][] and [Use][Use: Better Auth API Key Plugin] above, we looked at buying this outright. None of these fit as well, because the hard parts are already in the proxy: one function every call passes through, a shared limiter in Postgres, and caller naming to the backends.

| Option                                         | What it is                                                                                            | What it would give us                                                                                                      | Why not, or not yet                                                                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Static list in a secret                        | No table in Phase 1: a list of hashed keys and limits in deploy configuration, changed by redeploying | The least to build for one partner                                                                                         | Revoking a key or changing a limit would need a redeploy, and the emergency switch depends on not needing one. A small table costs one migration                         |
| Hosted key service, for example [Unkey][unkey] | A service that issues and verifies keys; the proxy calls it on each request                           | Key management, per-key limits and usage analytics with no tables of our own. A free tier of 150,000 verifications a month | A network call to a third party on every keyed request, and a new vendor holding our callers' keys. Cost grows with traffic, which is the thing we are trying to control |
| Hosted API gateway, for example [Zuplo][zuplo] | A managed gateway in front of the APIs, with keys, rate limits and a developer portal                 | The whole feature, including self-service sign-up and docs                                                                 | It replaces the proxy we already have. Streaming (SSE and MCP), caller naming and the harness token would all need to be rebuilt in its terms                            |
| Google Cloud API Gateway or Apigee             | Google's gateways, in the cloud the backends already run in                                           | API Gateway: keys and quotas. Apigee: a full product with developer portal and monetization                                | API Gateway keys are Google Cloud API keys, which suits internal consumers more than outside sign-ups. Apigee is priced and sized for a larger API program than ours     |
| Cloudflare                                     | Already in front of the site                                                                          | Edge rate limiting per key header on the Enterprise Advanced Rate Limiting plan                                            | It does not issue or validate keys, so it cannot replace the proxy check. See [Cloudflare Integration][]                                                                 |

If monetization becomes real, the calculation changes: metering, billing and a developer portal are where the gateway products earn their cost. Nothing in this design blocks moving to one later, since keys are checked in one place.

## Future Features

Not planned for any phase yet. The design should not rule them out.

- **Expiring keys.** A key carries an expiry date and stops working after it. Until then a key lives until it is revoked.
- **Caps for keyed MCP use.** MCP calls can cost much more than API calls, and all outside MCP calls share one dfo-ai bucket of about 2,400 calls a minute. Today eight addresses at 300 a minute fill it; at the keyed default of 600, four accounts do, and an email address is cheaper to get than an IP address. Candidates are a separate per-minute MCP limit per account, or a daily cap per account, to be settled before keys are announced for MCP. Keys are not required on `/mcp`, and there is no plan to require them yet.
- **Keys owned by an organization.** The plugin supports it, and existing keys keep their secrets. The move needs a migration to replace the foreign key from `0025_api_keys.sql`, a home for the account limit off `user`, and a rule for whose allowances and pins in the backends follow the organization.
- **Usage shown to owners.** Per-key counts exist only in log lines today.
- **Terms of use at key creation.**
- **More graceful degradation besides limits.** Depending on how often limits are hit, and the user impact of that, we could have fancier throttles in the future:
    - Soft vs. hard limits (warnings)
    - Hourly vs. weekly limits, like how modern chat interfaces work. This protects against spiky workloads while mitigating the impact of hitting a limit ("try again in a few hours").

## Open Questions

None of these block Phase 1.

- [ ] **How does a key holder ask for a higher limit?** Probably a contact address, before self-service is announced.
- [ ] **Who else should be an admin** (`ADMIN_EMAILS`)?
- [ ] **How do we reach current anonymous users** for the Phase 2 transition, given we know them only as hashed addresses? Candidates: docs, response headers, the SDK's `x-dfo-client` header.
- [ ] **Should a signed-in site session be named by its account too,** so a user's key and their Studio session share allowances in the backends? A key already names its account to the backends as `user:<digest>`, and the Studio still names its callers by address.

[issue]: https://github.com/DevelopmentFinanceObservatory/website/issues/142
[cf-best-practices]: https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/
[cf-availability]: https://developers.cloudflare.com/waf/rate-limiting-rules/
[better-auth-api-key]: https://www.better-auth.com/docs/plugins/api-key
[unkey]: https://www.unkey.com/docs/platform/workspaces/billing
[zuplo]: https://zuplo.com/pricing
[better-auth-admin]: https://www.better-auth.com/docs/plugins/admin
[better-auth-dash]: https://better-auth.com/docs/infrastructure/plugins/dash
[Summary]: #summary
[How It Works Today]: #how-it-works-today
[Requirements]: #requirements
[Key Format and Communication]: #key-format-and-communication
[Limits]: #limits
[Cloudflare Integration]: #cloudflare-integration
[Where Keys Apply]: #where-keys-apply
[Identity, Failure and Abuse]: #identity-failure-and-abuse
[Logs and Docs]: #logs-and-docs
[Build]: #build
[Storage]: #storage
[The Proxy Check]: #the-proxy-check
[Future Work: Admin Interface]: #future-work-admin-interface
[Use: Better Auth API Key Plugin]: #use-better-auth-api-key-plugin
[What the Plugin Provides]: #what-the-plugin-provides
[How It Would Fit]: #how-it-would-fit
[Admin System]: #admin-system
[What It Saves and What It Costs]: #what-it-saves-and-what-it-costs
[Spike Before Deciding]: #spike-before-deciding
[Phases]: #phases
[Phase 1: Validate]: #phase-1-validate
[Phase 2: Provision]: #phase-2-provision
[Phase 3: Enforce]: #phase-3-enforce
[Testing]: #testing
[Local Test Results]: #local-test-results
[Runbook]: #runbook
[Work by Repository]: #work-by-repository
[Alternatives Considered]: #alternatives-considered
[Future Features]: #future-features
[Open Questions]: #open-questions
