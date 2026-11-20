# API Keys for the DFO API and SDKs

[Issue #142][issue] · [User stories][stories]

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

API keys are for programmatic use of the DFO API: scripts, pipelines and applications that call it directly or through the Python and TypeScript SDKs. A key is optional, raises the caller's limits, and is counted per account and per key. The MCP server and DFO Studio do not use keys. They stay anonymous, with generous per-address and per-user allowances, and ignore any key they are sent.

This feature is to add per-user access to the Development Finance Observatory backend. This will enable:

- Metered and ACL'ed access
- Protection against cost overruns or operational problems stemming from heavy legitimate use or high-volume access by an adversary. Having the ability to grant key-specific access lets us lower default limits for safety, and make runtime maneuvers like turning off free access altogether if we are being abused or attacked.
- Potential future cost models, e.g. serving high-volume, high-cost, or licensed data

We intend to keep a free, open tier. We want minimal friction for the majority of users to use DFO, since it's a valuable onramp. Search and AI crawlers are also an important source of traffic for us, and will continue to be. But more expensive and frequent access will go through an API key.

The proxy fronts the public Search, Datasets and Graph APIs (`/api/v1/*`) and the MCP servers (`/mcp`). Without a key it knows callers only by address. A key is honoured on the API: `/api/v1/*`, `/openapi.json` and `/codes`. On `/mcp` and the Studio a key is stripped and ignored, and the call is anonymous, counted per address at the surface's anonymous limit.

Requirements:

- Anonymous access stays open up to a limit. Our goal is to manage usage and enable rate limits, not wholesale API gating.
- Keys apply to the API (`/api/v1/*`, `/openapi.json`, `/codes`). Each account that holds keys has a per-minute limit shared by all of its keys, and each key has a daily quota of API calls.
- `/mcp` and the Studio are anonymous, with generous per-address limits: 300 calls a minute on `/mcp`, and the Studio's own daily prompt allowance per user.
- Signed-in access to `/mcp`, using OAuth, is a separate future feature and out of scope here.

**Recommendation.** Use Better Auth's API key plugin from Phase 1, with keys in our own Postgres. The site already uses Better Auth for sign-in and sessions, so the plugin gives us key generation, hashing, storage, and the create, list and delete operations with ownership checks, without writing them, and it makes self-service possible from the start. We keep our own limiter, which anonymous traffic needs anyway, and we own the key lookup on the request path, with its caching and outage handling. A spike confirmed the plugin fits, with workarounds. If that changes, we fall back to building a small key table of our own behind the same verifier.
See [Use: Better Auth API Key Plugin][], [Build][] and [Alternatives Considered][].

We'll take a phased approach. Phase 1 ships the proxy check, an admin page for operators and a self-service panel in the account menu. It proves keys in production with a few callers we choose before self-service is announced. Keys are for prospective partners who want or need higher access, offered as we talk to them. No current caller is near an unsustainable level, so there is no plan to move existing users onto keys. Lowering the anonymous limits is possible later work, if usage calls for it.

## How It Works Today

Every public API and MCP call passes through one function in the website, `forward()` in `src/lib/proxy/forward.ts`. That is the single place a key needs to be checked.

- **Rate limit.** `forward()` counts each call against the client's address in a fixed window: 120 calls a minute on `/api/*`, 300 on `/mcp`. The counters live in the website's Postgres (`limit_counter` table) and are shared by all instances. If the count fails or is slow, the call goes through uncounted, so a burst sent while the database is slow is not limited at all.
- **No Redis.** The original task description mentions turning a Redis limiter back on. There is no Redis code in the website now, so per-key limits need no Memorystore instance.
- **Edge limits.** Cloudflare (Pro plan) also rate-limits by address, in front of the site: 600 calls a minute on the data API and 60 on the Studio, each blocking the address for 10 minutes. `/mcp` has no edge limit.
- **dfo-ai's own limit.** All outside MCP calls share one bucket in dfo-ai of about 2,400 calls a minute. Every MCP call is anonymous and counted by address, so the 300 calls a minute per address holds a caller to it.
- **Caller identity.** The proxy names the caller to the backends as `x-dfo-caller: ip:<digest>`, a keyed hash of the address. dfo-apis counts its own allowances (shares, cards, pins) against that name. It trusts the header only beside a secret it shares with the website.
- **Backends are ahead of us in one place.** dfo-ai's caller module already documents `key:` and `user:` callers "from the website's edge". dfo-apis accepts only the `ip:` form.
- **MCP auth.** On `/mcp` the proxy attaches its own token for the harness when it holds one. Otherwise it passes the caller's `Authorization` header through.
- **Accounts.** The site has sign-in (Better Auth on its own Postgres) and an account menu, which is where self-service keys would attach.
- **Docs.** The API quickstart says the API accepts requests without a key.

## Requirements

A key is optional, and it is read only on the API. On `/api/v1/*`, `/openapi.json` and `/codes`, a call with a valid key is counted against the key's account at the account's per-minute limit and against the key's daily quota, a call with no key is counted against the address, and a call with a bad key is refused. On `/mcp` and the Studio a key is stripped and ignored, and the call is anonymous. These requirements hold whether we use Better Auth's plugin or build the key store.

### Key Format and Communication

- Format: the DFO client contract's key format (spec-kit `client-contract`, rule `key-format`), which the Python and TypeScript SDKs check: `dfo_k_`, a base62 body, then a 6-character base62 checksum, the CRC32 of the body. The body is 32 random letters and an 8-character signed tag, so a key is 52 characters in all. The prefix lets secret scanners and our own logs spot a leaked key, and the checksum lets the SDK catch a mistyped key before it is sent.
- The tag is the first 8 bytes of an HMAC-SHA-256 over the prefix and the random letters, keyed by a server secret, written as an 8-digit base62 number. It proves the key was minted here, so the proxy turns a made-up key away before any database read (see [The Proxy Check][]). The checksum cannot do that job: the repository is public, and anyone can compute one. The proxy checks both. Partners hold keys in this format, so it is fixed before the first key is issued; changing it later would mean two admission paths until every old key is replaced.
- Shown once, when it is created. We store only a SHA-256 hash of the whole key, so a database leak exposes no usable key.

How the key is sent is a design choice. We propose sending the key as a bearer token in a standard header, `Authorization: Bearer dfo_…`. The proxy also accepts `X-API-Key` as an alias. We don't plan to accept the key in a query string, as that's an outmoded style, although some people like it for ease of use and debuggability.

- Bearer is what a programmatic partner reaches for first, and what scripts, pipelines and SDKs set most easily.
- The Python and TypeScript SDKs send the key this way. They read it from a client option (`api_key`, `apiKey`), the `DFO_API_KEY` environment variable, or the credentials file `dfo auth login` writes, check its format and checksum before sending, and print it masked (`dfo_k_***Qjsd`). They need no change for keys.
- The `dfo_` prefix lets the proxy tell our key from any other bearer token.
- The alias costs a few lines. It leaves `Authorization` free if `/mcp` later gains sign-in, where one call could carry a user's token and an application's key.
- A call that sends both headers with different keys is refused with a 400.
- The proxy strips the key before forwarding, so it never reaches a backend or its logs. A `dfo_` value in `Authorization` under any scheme (`Token dfo_k_…`, a bare key) is stripped too, though only `Bearer` is read as a key.
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

The MCP specification defines authorization as OAuth, with the token sent as `Authorization: Bearer`. It has no API-key concept, and clients differ in whether they can send a custom header at all. `/mcp` ignores a `dfo_` key, so no MCP client needs to send one, and a key one sends is stripped before the call goes upstream. Signed-in MCP access is a separate future feature that would use OAuth (see [Future Features][]).

**Compatibility with the Proxy as Built**

| Path                                               | Handling of `Authorization`                                     | Effect of a key there                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/api/v1/*`                                        | Not passed upstream: dfo-apis reads no caller's `Authorization` | A `dfo_` bearer is read as the key and consumed. No conflict                                               |
| `/mcp`, proxy holds the harness token (production) | Overwritten with the harness token                              | No conflict. A `dfo_` value is stripped and ignored, and the header is replaced with the token             |
| `/mcp`, proxy holds no token                       | The caller's value is passed through to the harness             | The `dfo_` prefix tells our key from any other token: a `dfo_` value is stripped, any other passes through |

### Limits

Keyed use is limited twice, and both limits count API calls only.

- The per-minute limit belongs to the account, not the key. All of an account's keys count against one per-minute allowance, so creating more keys does not multiply it. It is one plain number, in calls per window, and protects against bursts. There are no named tiers.
- The daily quota belongs to the key. Each key has its own count of API calls a day, which bounds total use.

The MCP surface has no keyed limit, because a key is ignored there. Every MCP call counts against its address at the anonymous limit, so heavy MCP use never uses up an account's API allowance.

| Surface | Covers                                 | Anonymous limit                | Keyed limit                                              |
| ------- | -------------------------------------- | ------------------------------ | -------------------------------------------------------- |
| API     | `/api/v1/*`, `/openapi.json`, `/codes` | 120 calls a minute per address | The account's per-minute limit and the key's daily quota |
| MCP     | `/mcp`                                 | 300 calls a minute per address | None. A key is ignored, so the call is anonymous         |

- The per-minute limit is an optional integer on the account (`user.api_rate_limit`).
- Empty means the default for keyed callers, set per deployment in env (`RATE_LIMIT_KEYED`, 600 by default). Most accounts store nothing, and raising the default moves them all at once.
- A number overrides the default for that account.
- The window is global, 60 seconds (`RATE_LIMIT_WINDOW_S`). There is no per-account window.
- A slow counter must not let a burst through. Today a slow or failed count lets the call through uncounted. Instead, each instance keeps a small in-memory count per caller and falls back to it when the shared count is slow, so the proxy stays available but one caller is still held near its limit on each instance. The fallback goes on from the last shared count it saw for the caller in the window, so a caller already refused stays refused.

One per-minute number is simpler to explain to a key holder and simpler to administer. The anonymous limits differ by surface because chat vendors send many users from one address. That does not apply to an account, which is one caller.

**Daily quota per key**

An account at the keyed default of 600 calls a minute could make 864,000 calls a day, and an email address is cheaper to get than an IP address. The per-minute limit is burst protection. The daily quota caps total use.

- Each key has a quota of API calls a day, counted per key in `limit_counter` under `apiday:key:<keyId>`, in a one-day window aligned to 00:00 UTC.
- The quota is the nullable `apikey.daily_limit` column (migration 0026). Empty means the deployment default, `API_KEY_DAILY_LIMIT` (1,000 by default). An admin sets it per key on the admin page.
- Both limits apply to each keyed API call.
- Over the quota, a call is refused as it is over the per-minute limit, with a 429 problem document. The outcome is `limited`, and the detail says the daily quota resets at 00:00 UTC.
- Refused calls count toward the day's total, because the limiter counts every attempt. The usage bar on the self-service panel and the admin page shows this count, for example "500 of 1,000".

The trade-off is that the per-minute limit is shared by all of an account's keys while the daily quota is per key. Creating more keys multiplies the daily quota and does not multiply the per-minute burst, and a new key starts the day at zero. There is no rotate action. A user replaces a key by creating a new one and deleting the old one, so the new key brings a fresh daily count. The per-account key cap, `API_KEYS_MAX_PER_ACCOUNT` (5 by default), bounds how far create-and-delete can stretch the daily quota. At the default quota, an account's keys allow at most 5,000 API calls a day, however often they are replaced.

Both numbers are set from the admin side. If we later want tiers, for single or bulk changes to keys, they can be added as a column or as a bulk update over the per-minute number without changing what it means.

Not covered by an account's limit or a key's quota:

- The proxy's third allowance, `/api/download-pin` at 10 calls a minute, belongs to the site's download UI and is not part of the public API.
- The Studio's daily prompt allowance is for the site's own chat UI.
- dfo-apis keeps its own daily allowances per caller: 10 shares and 500 presentation cards, plus pins. A keyed API caller is named by its account and gets these at the default values. Raising them for a partner would be a dfo-apis setting, not part of the account's limit.

### Cloudflare Integration

Cloudflare sits in front of the site and rate-limits by address. The proxy stays the per-account limiter, and Cloudflare is a coarse backstop against floods, set above the highest limit any account will have.

**Current Configuration**

The zone is on the Pro plan. It limits the data API to 600 calls a minute per address and the Studio to 60, each blocking the address for 10 minutes. `/mcp` has no edge limit. No change is proposed for Phase 1 at the default limits. Keys count on the API, where the edge limit of 600 a minute per address equals the keyed default of 600 a minute per account, so a keyed account reaches the edge limit first only when all its calls come from one address. The edge limit must sit above the highest per-minute limit any account is given, and a rule can skip requests carrying a key header, as below. Pro cannot count by a header. Cloudflare cannot tell a real key from a made-up one, since it sees only a header value, so it cannot enforce per-key limits itself.

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
- The data API's threshold is well above the proxy's anonymous limit and equals the keyed default, so Phase 1 needs no edge change at the default limits. An account limit above the threshold needs the threshold raised or a skip rule first.

### Where Keys Apply

| Surface                                                                          | Key honored? | Notes                                                                                                                                                   |
| -------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/search`, `datasets`, `graph`, `presentation`; `/openapi.json`; `/codes` | Yes          | Counted on the API surface at the account's per-minute limit and the key's daily quota                                                                  |
| `/mcp`                                                                           | No           | A key is removed and ignored. The call is anonymous, counted per address at the MCP limit of 300 a minute. A `dfo_` bearer is not passed to the harness |
| `/api/v1/studio/*`                                                               | No           | The Studio is the site's own chat UI. A key never replaces or bypasses its daily prompt allowance. A key sent there is removed and otherwise ignored    |
| `/api/download-pin`, MCP theme stylesheets                                       | No           | These do not pass through the key check today and stay as they are                                                                                      |

Keys exist for scripts and pipelines that call the API directly or through the Python and TypeScript SDKs. On every surface, a `dfo_` value is consumed by the proxy and never copied upstream. On the API it is verified, and it is consumed even when verification fails. Elsewhere, `/mcp` included, it is dropped unread, so a bad key there is not refused. dfo-apis gets no caller `Authorization` at all. Other upstreams get any other value as they do today.

### Identity, Failure and Abuse

- **One identity per request.** The proxy resolves the caller once, as an address or, on the API, a key, before the limiter runs. That one identity is used for counting, for `x-dfo-caller` to the backends, and for logging. `/mcp` calls are always named by address. Today the MCP route, the dfo-apis path and the request log each work out the caller separately.
- **Invalid keys.** On the API, an unknown or revoked key gets a 401 and does not fall back to anonymous. There is no separate budget for bad keys. A key whose tag no server secret made is refused before any read or count, and logged with its own outcome (`forged`) so made-up keys can be counted. A valid key is never charged to its address, so keyed callers behind a busy shared address, such as a team's scripts behind one office address, are not held to that address's anonymous limit, and a later cut to the anonymous limits does not touch them. A deleted key keeps a good tag, so a good tag that finds no key is charged to its address, as every cache miss once was: deleted keys cost what made-up keys used to, and made-up keys cost nothing. Keys over a maximum length are refused unread, and unknown keys are cached briefly as unknown.
- **Revocation.** Revoking a key deletes it. The plugin lets a key's owner switch a disabled key back on, so disabling is not revocation. Logs keep the key's public id, so its history survives. A deleted key stops being admitted within the cache lifetime, about a minute per instance. The lifetime is absolute and is not extended when the store is unreachable. Revoking stops new calls. It does not cut a stream that is already open. Lowering an account's limit or a key's daily quota takes effect on the same delay. `API_KEY_CACHE_S` sets the lifetime in seconds (default 60), and 0 turns the cache off so every call reads the key and a change applies on its next call, at the cost of one key read and one `last_request` write per call.
- **Emergency switch.** An operator can delete one key from the admin page without a deploy. Turning off all keyed access sets `API_KEYS_ENABLED=false`, an environment variable, which takes a new Cloud Run revision. It stays an environment variable because the switch exists for a faulty key path, and it must still work when Postgres is down. See [Runbook][].
- **Key store unavailable.** The check fails open. A key already in the cache keeps working until its entry expires. A key that is not in the cache is treated as anonymous while the store cannot be reached: the call goes through at the anonymous limit for its address. Rate limiting is not a mission-critical part of the system, so staying available matters more than enforcing an account's own limit or a key's daily quota during an outage. The plugin reports a database outage as an invalid key, so the verifier has to tell the two apart itself rather than answer 401 to every uncached key during an outage. The lookup gets its own bounded pool and timeout, as the counter has, so a slow store does not slow the proxy.

### Logs and Docs

- Key usage is logged in `forward()`, where the key is checked. The line carries the key's public id, its account, the surface and the outcome (`allowed`, `limited`, `invalid`, `forged` or `unavailable`), and never the key or its hash. The outcome `limited` covers a refusal by either limit. A failed key lookup logs only its error code, since the database error's message carries the query's parameters. While keys are off, a call carrying `X-API-Key` logs a line saying whether the value has our prefix, so callers who send another service's key there, and would get a 401 on the API once keys are on, can be counted first. The existing request log works the caller out from raw headers when the response closes, apart from `forward()`, so it cannot see which key was used. Per-key and per-account usage metrics come from this line, and the Phase 1 exit criterion and Phase 3's search for high-volume callers rely on it. The usage bar on the self-service panel and the admin page reads the day's counter instead, which includes refused calls.
- `/openapi.json` declares no security scheme, because a key is optional. The API docs explain keys on the page `build/api-keys`: the daily quota and its 00:00 UTC reset. The API quickstart in the docs repository says no key is needed and points key holders to that page.

## Build

In this option we own the key store: a table in the website's Postgres, a lookup in the proxy, and admin pages. Nothing new is installed. This is the fallback if the plugin spike fails.

The proxy reaches the store through a small verifier: it takes a key and answers with the key's public id, limit and owner, or says the key is invalid, or says the store is unavailable. Nothing else in the proxy knows where keys live, so the store can change later. Public ids stay the same if it does.

### Storage

A new `api_key` table in the website's Postgres, beside the accounts and the limit counters.

| Column                   | Purpose                                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| id                       | Short public identifier, used in logs and as the caller name                |
| key_hash                 | SHA-256 of the key, unique                                                  |
| prefix                   | First characters of the key, so its owner can recognize it in a list        |
| label                    | What the key is for, unique among the account's keys without regard to case |
| user_id                  | Owning account                                                              |
| daily_limit              | Optional daily API quota for this key, empty meaning the deployment default |
| created_at, last_used_at | Lifecycle. `last_used_at` is updated occasionally, not on every call        |

The account's per-minute limit is an optional integer on the user record, empty meaning the default for keyed callers. Revoking deletes the row.

Postgres rather than Redis: the limiter already counts there, key volume is small, and it adds no new infrastructure. This can be changed later if we need something more scalable and performant at the cost of some additional dev and operational complexity.

### The Proxy Check

On `/mcp` and the Studio the proxy strips any `dfo_` value, reads nothing from it and counts the call against the address, so the steps below do not run. On the API (`/api/v1/*`, `/openapi.json`, `/codes`; see [Where Keys Apply][]), before the rate limit:

1. Read the key header. No header: carry on as an anonymous caller.
2. Check the key's signed tag against each server secret. A bad tag: answer 401, with no read and no count.
3. Hash the key and look it up in a short in-process cache (about 60 seconds), so a keyed call adds no query in the common case. On a cache miss, look the key up in the store. Lookup is by the hash, so no secret is compared by hand.
4. Unknown or revoked key: count the call against the address's normal limit, then answer 401 with a problem document (429 when the address is over its limit).
5. Valid key: count the call against the owning account at the account's per-minute limit, and against the key's daily quota (`apiday:key:<keyId>`), and never against the address, using the existing counter. Over either limit: answer 429 with a problem document. A daily refusal's detail says the quota resets at 00:00 UTC.
6. Log the key's public id, its account, the surface and the outcome.

[Identity, Failure and Abuse][] covers revocation delay and failing open when the store is unavailable.

A keyed API call is named to dfo-apis by its account instead of `ip:<digest>`, so dfo-apis's allowances are per account too. The form is `user:` and the first 32 hex digits of an HMAC-SHA-256 over the account id, keyed like the `ip:` digest, so no account id leaves the website. A `/mcp` call is always named `ip:<digest>`, so dfo-ai and its MCP servers never see a `user:` caller. dfo-apis refuses any form but `ip:` with a 400 today, so it must accept `user:` from the website. See [Work by Repository][].

### Future Work: Admin Interface

Operators work from an admin page (see [Admin System][]). Later phases need more, and all of it would be ours to build:

- The self-service side panel in the account menu, to create and delete keys and see each key's last use and usage today, with the endpoints and ownership checks behind them (announced in Phase 2).
- Operator tools beyond the admin page, such as bulk changes to limits and usage reports by caller (Phase 3).
- Expiry, which the plugin provides and the Build store would need to add.

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
- **Limits.** The plugin's limiter is off. We count in `limit_counter`: ours lets verification sit behind the cache, emits the `X-RateLimit-*` headers, and is the limiter anonymous traffic uses anyway. The account's per-minute limit is an extra field on the Better Auth user record (`apiRateLimit`, not settable by the user). A key's daily quota is a nullable `daily_limit` column on the plugin's `apikey` table, set only by an admin and counted in `limit_counter` as `apiday:key:<keyId>`.
- **Key format.** The plugin mints keys through its `customKeyGenerator` option: its own random letters, then the signed tag. The stored hash covers the whole key and works as before.
- **Endpoints.** The plugin's HTTP endpoints for keys are disabled. A user could otherwise create a key with any prefix and expiry. Better Auth checks `disabledPaths` only in its HTTP router, so our own handlers still reach the server methods. The self-service panel lists and deletes keys with the plugin's `listApiKeys` and `deleteApiKey` on the request's session, so the plugin alone decides which keys are whose and checks a ban on delete. Creating passes the signed-in user's id and forces the `dfo_k_` prefix.
- **Revocation.** Revoking deletes the key. The plugin lists and deletes keys only for their owner, so the admin page's queries over other accounts' keys read, delete and set the daily quota on the plugin's table with Drizzle.
- **Ownership.** Every key belongs to an account, and is deleted with it. A partner's keys belong to a role mailbox account, such as a team address, set up before the first partner key, so a key does not leave with the person who made it.
- **Schema coupling.** The proxy's key check and the admin queries read the plugin's table directly, which ties them to its schema. A known-answer test pins the hash, and the tests of the columns they read run on every plugin upgrade.
- **Caller name.** The key's account names the caller of a keyed API call to dfo-apis as `user:<32 hex>`, a keyed digest of the account id. The plugin's key id, a 32-character random string, is the public id in logs.
- **Schema.** The plugin's table is added through our existing migrations, as the auth tables were, with two changes: a unique index on the key hash, and a foreign key to the user that deletes an account's keys with the account. The plugin has neither. Migration 0026 adds the nullable `daily_limit` column.

### Admin System

There is no admin interface to leverage. This was checked in three places:

| Candidate                                                | What it is                                                                                                           | Does it manage API keys?                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The API key plugin itself                                | Server and client methods only                                                                                       | It has the operations, but no pages. Listing returns the signed-in user's own keys, so an operator view across all keys would query the table directly |
| [Better Auth admin plugin][better-auth-admin]            | User administration: list and edit users, roles, bans, sessions, impersonation                                       | No. It has no pages either, only methods, and it does not cover API keys                                                                               |
| [Better Auth Infrastructure dashboard][better-auth-dash] | A hosted dashboard from the Better Auth company, fed by a plugin that sends user and session events to their service | Not documented. It would also send account activity to a third party                                                                                   |

So the operator view is ours to write in either option. With the plugin, it still queries the table directly, since the plugin lists and deletes keys only for their owner.

Phase 1 ships it as a proof of concept at `/admin/api-keys`, a "User management" page. It is open to signed-in users whose verified email is in `ADMIN_EMAILS`, and answers 404 to everyone else, checked on the page and in every action. The page opens with a dark hero holding the total user count as a badge and an email search, then a paginated table of all users (email, created, active key count), filterable by email. Expanding a user shows their keys, each with name, created date, usage bar, an editable daily quota, a Reset usage icon and Delete, plus Create key and the account's per-minute limit. Reset usage sets the key's count for the current UTC day back to 0 by deleting its `apiday:key:<keyId>` counter row, so a key that used its quota works again at once, then reloads the account's keys. An operator can therefore find any user by email, create a key for an account, delete any key, reset a key's usage for the day, set or clear a key's daily quota, and set or clear an account's per-minute limit. Each change writes a log line naming the operator. A Cloud Run Job running an admin command is an optional addition for scripted changes. Setting an account's limit to 1 holds all its keys, new ones included, to one call a minute. Shutting an account out entirely needs a ban, which waits for Better Auth's `admin()` plugin and its roles; that plugin is worth adding once there is more than one admin task to gate. Anonymous access stays open either way.

The self-service panel calls our own route handlers under `/api/account/api-keys` (list, create and delete) over the plugin's server methods, since the plugin's HTTP endpoints are disabled. A route handler, unlike a server action, gets no Origin check from Next.js, so each mutating route refuses a request whose `Origin` header is missing or names a host other than the request's `X-Forwarded-Host` or `Host` (`src/lib/apiKeys/sameOrigin.ts`). Every route reads the session itself, answers 401 when signed out, and sets `Cache-Control: no-store`. The panel uses routes because it is also part of the prototypes app's static export, which cannot contain server actions. The account menu's "API keys" item opens it as a right-side drawer, the same drawer as the Studio's Customize panel, on whatever page the user is on. There is no `/account/api-keys` page. The panel shows the user's name and email, then "API keys" with a "Create API key" button and one card per key: name, prefix, created, last used, the usage bar and Delete. Create swaps the list for a name field with Cancel and Create. After a create, the panel shows the key once, with Copy and Close. Its five-key cap is checked again after each insert, so creates in parallel cannot pass it.

### What It Saves and What It Costs

Saves:

- Key generation, hashing and comparison, which are the security-sensitive parts.
- The create, list, update and delete endpoints with ownership checks, which Phase 2 needs.
- Several keys per account, and the expiry listed under [Future Features][].

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

Two phases take keys from an optional test feature to something any partner can get for themselves. A third, lowering the anonymous limits, is held until usage calls for it. Anonymous access stays open throughout, and existing users are not asked to move to keys.

### Phase 1: Validate

**Goal:** Optional keys work end to end, for testing and the first partner

**Scope:** Keys work on the API (`/api/v1/*`, `/openapi.json`, `/codes`) only. `/mcp` and the Studio stay anonymous.

**Who gets a key:** A few callers we choose

**Provisioning:** Operators create and delete keys on the User management page, `/admin/api-keys`. The self-service panel is built but not announced

**Limits:** The keyed per-minute default or an account's own limit, and a daily quota per key (1,000 by default, `API_KEY_DAILY_LIMIT`), each set on the admin page

**Anonymous access:** Unchanged

**Also needed:** Proxy check behind a verifier, the signed key tag and its secret, the plugin's key table with its `daily_limit` column, the admin page, the usage bar, the `API_KEYS_ENABLED` switch that turns all keyed access off, a burst-safe fallback when the counter is slow, dfo-apis accepts keyed callers, key usage logged in `forward()`, and the API docs on keys with an API quickstart note

**Before release to production:** on dev, a keyed API call reaches dfo-apis as `user:` and spends the account's own allowance there, and a call over a key's daily quota is refused with the reset detail

**Exit criteria:** The first partner runs on a key in production without incident, and per-key counts in the logs match what they report sending.

### Phase 2: Provision

**Goal:** Any partner who needs more than the anonymous limits can get a key for themselves

**Who gets a key:** Any signed-in account

**Provisioning:** Self-service from the account menu's side panel: create, delete, see last use and today's usage, up to `API_KEYS_MAX_PER_ACCOUNT` keys (5 by default). The panel was built alongside Phase 1, so Phase 2 is when it is announced rather than when it is written.

**Limits:** A default per-minute limit and daily quota for self-service accounts, with higher values granted by an operator. We will look at usage and tune the defaults at that time.

**Anonymous access:** Unchanged; docs explain keys for callers who need more

**Also needed:** A way to ask for a higher limit or quota. No outreach to current users: they are not asked to move (see [user stories][stories], Stories: Out-Of-Scope)

**Exit criteria:** Self-service is announced in the docs, and partners we talk to can get a key and a higher limit without an operator creating the key.

### Phase 3: Enforce

Not scheduled. Taken up only if anonymous usage approaches unsustainable levels, which it does not today.

**Goal:** Anonymous limits can come down safely

**Who gets a key:** Same. If lowering the limits would hit identifiable heavy callers, reaching them is planned then

**Provisioning:** Self-service, plus operator tools to raise or cut an account's limit or a key's quota

**Limits:** Anonymous limits lowered in steps

**Anonymous access:** Open but lower

**Also needed:** Usage reports by caller, a playbook for lowering a limit and rolling it back, edge rules that respect keys

Phase 1 should avoid choices that Phase 2 has to undo. Every key has an owning account from the start, and the limit is stored per account in a form a tier can replace.

## Testing

### Local Test Results

Run against the local stack: the website on the implementation branch and the dev apis proxy. These runs predate the signed tag and the client contract's key format, so the key went in as `Authorization: Bearer dfo_live_…`; keys in that form are refused. Sign-in used an emailed code caught by a local mail catcher, and the key was created through the account's self-service key management.

| Test                              | How                                                                                    | Result                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Usage counted against the account | The limiter's rows after keyed API calls                                               | Counted as `api:acct:<user id>`, not by address. The key's last use advanced as calls were made                        |
| Anonymous traffic unaffected      | An anonymous call during the keyed burst below                                         | 200, counted against its address at the anonymous limit (120)                                                          |
| Limit enforced on the API         | Account limit set to 5; seven keyed `GET /openapi.json` calls at the start of a window | Calls 1 to 5 answered 200, with remaining counting down from 4 to 0. Calls 6 and 7 answered 429 with `Retry-After: 58` |
| Limit changes take effect         | The limit set to 5, then 2, then cleared                                               | Each change reached the proxy within 8 seconds, inside the cache lifetime of about a minute                            |
| SDK format check                  | A key minted by the site's generator, passed to the Python SDK's `check_key_format`    | Accepted with no warning. `keyChecksum` matches the contract's `key-format` test vectors                               |

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

- **Refused calls count.** A refused call adds to the window's count, because the limiter counts every attempt. Usage read from the counters therefore includes refusals, and the usage bar shows that count. Reports that separate allowed from refused calls come from the usage log line, which records the outcome of each call.
- **Backends not exercised.** The local stack sends no caller to the backends, because the caller key and the shared secret are unset there. dfo-apis seeing the account as a `user:` caller has to be tested on dev, after its change is deployed.
- **Not tested locally.** Cloudflare's edge rules, and a store outage on a live stack, are covered only by unit tests. A run of the Python or TypeScript SDK with a `dfo_k_` key against the local stack, through to a daily-quota refusal, is to do before release.

## Runbook

**Turn all keyed access off.** Set `API_KEYS_ENABLED=false` on the service, which rolls out a new revision; keys are then stripped and every call is counted by address. Set it back to `true` to turn keys on. The rollout time is to be measured on dev and recorded here before release.

```
gcloud run services update <service> --region <region> --update-env-vars API_KEYS_ENABLED=false
```

**Before keys are first switched on in an environment,** run a week with `API_KEYS_ENABLED=false` and count the `api key header while keys are off` lines with `ours: false`: those callers send another service's key in `X-API-Key` and would get a 401 on the API.

**Rotate the key tag secret.** `API_KEY_TAG_SECRETS` is a comma-separated list, one per environment and never derived from `BETTER_AUTH_SECRET`, so rotating the auth secret leaves keys alone. The first entry signs new keys; every entry verifies. To rotate, add the new secret at the end in one revision, then move it first in the next, so no instance meets a key it cannot check. Removing a secret voids every key it signed, and keys do not expire, so a secret is removed only after its keys are replaced. A production instance refuses to start without the list.

## Work by Repository

Most of the work is in the website. This split holds for both options: Use and Build differ only in the website row, in where keys are stored and how they are looked up. The other rows are the same either way, since those systems see only the caller name and the key header. The Phase 1 pieces:

| Where      | Size       | What                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| website    | Most of it | The plugin and its table migration (or our own `api_key`), and migration 0026 for `apikey.daily_limit`; key check on the API surface, per-account per-minute limit, per-key daily quota, burst-safe counter fallback and key usage logging in `forward()`; the self-service side panel and the admin User management page, each with the usage bar; tests beside the existing proxy tests |
| dfo-apis   | Small      | Accept a keyed caller in `x-dfo-caller` beside the website's shared secret, so allowances count per account. The website sends `user:` for a keyed API call. Today only `ip:<digest>` is accepted, and anything else gets a 400                                                                                                                                                           |
| dfo-ai     | None       | `/mcp` ignores keys, so dfo-ai sees only `ip:<digest>` callers                                                                                                                                                                                                                                                                                                                            |
| sdk        | None       | The Python and TypeScript SDKs already read a key, check the client contract's format and send it as a bearer                                                                                                                                                                                                                                                                             |
| infra      | Small      | `API_KEY_TAG_SECRETS`, a dedicated secret list per environment, before the first key is issued. The admin page covers operator changes in production; a Cloud Run Job for a scripted admin command is optional                                                                                                                                                                            |
| docs       | Small      | The API quickstart, which says no key is needed, gains a note that a key raises limits and a link to the `build/api-keys` page. That page covers the 52-character key format, the daily quota and its 00:00 UTC reset, and says `/mcp` ignores keys                                                                                                                                       |
| Cloudflare | Small      | Keyed calls pass the data API's per-address rule (600 a minute), which equals the keyed default. Raise it, or skip it for keyed requests, before an account's limit passes 600                                                                                                                                                                                                            |

Order matters. dfo-apis refuses a caller form it does not recognize with a 400 when it arrives with the shared secret. So dfo-apis ships first, and the website starts sending keyed callers last. An end-to-end test should show a keyed API call spending the account's own allowance in dfo-apis.

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
- **Keys owned by an organization.** The plugin supports it, and existing keys keep their secrets. The move needs a migration to replace the foreign key from `0025_api_keys.sql`, a home for the account limit off `user`, and a rule for whose allowances and pins in the backends follow the organization.
- **Usage history.** The usage bar shows today's count. Counts for earlier days exist only in log lines.
- **Signed-in MCP access** ([#176][issue-176]). `/mcp` accepts OAuth sign-in, so a signed-in user's calls count against their account. It is separate from API keys, which `/mcp` ignores. It includes how an MCP client shows a refusal: a 429 on a tool call reaches most clients as a raw transport error, so a refused `tools/call` would be better answered as a tool result with `isError: true`, as the MCP specification's own rate-limit example and the GitHub MCP server do.
- **Terms of use at key creation.**
- **More graceful degradation besides limits.** Depending on how often limits are hit, and the user impact of that, we could have fancier throttles in the future:
    - Soft vs. hard limits (warnings)
    - Hourly vs. weekly limits, like how modern chat interfaces work. This protects against spiky workloads while mitigating the impact of hitting a limit ("try again in a few hours").

## Open Questions

None of these block Phase 1.

- [ ] **How does a key holder ask for a higher limit or quota?** Probably a contact address, before self-service is announced.
- [ ] **Who else should be an admin** (`ADMIN_EMAILS`)?
- [ ] **Should a signed-in site session be named by its account too,** so a user's key and their Studio session share allowances in the backends? A keyed API call is named by its account as `user:<digest>`, and the Studio names its callers by address.

[issue]: https://github.com/DevelopmentFinanceObservatory/website/issues/142
[stories]: api-keys-stories.md
[issue-176]: https://github.com/DevelopmentFinanceObservatory/website/issues/176
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
