# API keys for the DFO API and SDKs

[Issue #142][issue] · [User stories][stories]

## Contents

- [Summary][]
- [How it works today][]
- [Requirements][]
    - [Key format and communication][]
    - [Limits][]
    - [Cloudflare integration][]
    - [Where keys apply][]
    - [Identity, failure and abuse][]
    - [Logs and docs][]
- [Build][]
    - [Storage][]
    - [The proxy check][]
- [Use: Better Auth API key plugin][]
    - [What the plugin provides][]
    - [How it fits][]
    - [Admin system][]
    - [What it saves and what it costs][]
- [Runbook][]
- [Work by repository][]
- [Future features][]

## Summary

API keys are for programmatic use of the DFO API: scripts, pipelines and applications that call it directly or through the Python and TypeScript SDKs. A key is optional, raises the caller's limits, and is counted per account. The MCP server and DFO Studio do not use keys. They stay anonymous, with generous per-address and per-user allowances, and ignore any key they are sent.

This feature is to add per-user access to the Development Finance Observatory backend. This will enable:

- Metered and ACL'ed access
- Protection against cost overruns or operational problems stemming from heavy legitimate use or high-volume access by an adversary. Having the ability to grant key-specific access lets us lower default limits for safety, and make runtime maneuvers like turning off free access altogether if we are being abused or attacked.
- Potential future cost models, e.g. serving high-volume, high-cost, or licensed data

We intend to keep a free, open tier. We want minimal friction for the majority of users to use DFO, since it's a valuable onramp. Search and AI crawlers are also an important source of traffic for us, and will continue to be. But more expensive and frequent access will go through an API key.

The proxy fronts the public Search, Datasets and Graph APIs (`/api/v1/*`) and the MCP servers (`/mcp`). Without a key it knows callers only by address. A key is honoured on the API: `/api/v1/*`, the Datasets API's routes included, `/openapi.json` and `/codes`. On `/mcp` and the Studio a key is stripped and ignored, and the call is anonymous, counted per address at the surface's anonymous limit.

Requirements:

- Anonymous access stays open up to a limit. Our goal is to manage usage and enable rate limits, not wholesale API gating.
- Keys apply to the API (`/api/v1/*`, `/openapi.json`, `/codes`). Each account that holds keys has a per-minute limit and a daily quota of API calls, both shared by all of its keys.
- `/mcp` and the Studio are anonymous, with generous per-address limits: 300 calls a minute on `/mcp`, and the Studio's own daily prompt allowance per user.
- Signed-in access to `/mcp`, using OAuth, is a separate future feature and out of scope here.

Keys use Better Auth's API key plugin, with keys in our own Postgres. The site already uses Better Auth for sign-in and sessions, so the plugin generates, hashes and stores keys and runs the create, list and delete operations with ownership checks. The site keeps its own limiter, which anonymous traffic needs anyway, and owns the key lookup on the request path, with its caching and outage handling. See [Build][] and [Use: Better Auth API key plugin][].

The proxy check, an admin page for operators and a self-service panel in the account menu make up the feature. Keys are for partners who want or need higher access. Existing callers are not asked to move onto keys.

## How it works today

Every public API and MCP call passes through one function in the website, `forward()` in `src/lib/proxy/forward.ts`. That is the single place a key needs to be checked.

- **Rate limit.** `forward()` counts each call against the client's address in a fixed window: 120 calls a minute on `/api/*`, 300 on `/mcp`. The counters live in the website's Postgres (`limit_counter` table) and are shared by all instances. If the count fails or is slow, the call goes through uncounted, so a burst sent while the database is slow is not limited at all.
- **No Redis.** The website has no Redis code, so per-key limits need no Memorystore instance.
- **Edge limits.** Cloudflare (Pro plan) also rate-limits by address, in front of the site: 600 calls a minute on the data API and 60 on the Studio, each blocking the address for 10 minutes. `/mcp` has no edge limit.
- **dfo-ai's own limit.** All outside MCP calls share one bucket in dfo-ai of about 2,400 calls a minute. Every MCP call is anonymous and counted by address, so the 300 calls a minute per address holds a caller to it.
- **Caller identity.** The proxy names the caller to the backends as `x-dfo-caller: ip:<digest>`, a keyed hash of the address. dfo-apis counts its own allowances (shares, cards, pins) against that name. It trusts the header only beside a secret it shares with the website.
- **Backends are ahead of us in one place.** dfo-ai's caller module already documents `key:` and `user:` callers "from the website's edge". dfo-apis accepts only the `ip:` form.
- **MCP auth.** On `/mcp` the proxy attaches its own token for the harness when it holds one. Otherwise it passes the caller's `Authorization` header through.
- **Accounts.** The site has sign-in (Better Auth on its own Postgres) and an account menu, which is where self-service keys would attach.
- **Docs.** The API quickstart says the API accepts requests without a key.

## Requirements

A key is optional, and it is read only on the API. On `/api/v1/*`, `/openapi.json` and `/codes`, a call with a valid key is counted against the key's account at the account's per-minute limit and against the account's daily quota, a call with no key is counted against the address, and a call with a bad key is refused. On `/mcp` and the Studio a key is stripped and ignored, and the call is anonymous.

### Key format and communication

- Format: the DFO client contract's key format (spec-kit `client-contract`, rule `key-format`), which the Python and TypeScript SDKs check: `dfo_k_`, a base62 body, then a 6-character base62 checksum, the CRC32 of the body. The body is 32 random letters and an 8-character signed tag, so a key is 52 characters in all. The prefix lets secret scanners and our own logs spot a leaked key, and the checksum lets the SDK catch a mistyped key before it is sent.
- The tag is the first 8 bytes of an HMAC-SHA-256 over the prefix and the random letters, keyed by a server secret, written as an 8-digit base62 number. It proves the key was minted here, so the proxy turns a made-up key away before any database read (see [The proxy check][]). The checksum cannot do that job: the repository is public, and anyone can compute one. The proxy checks both. Partners hold keys in this format, so it is fixed before the first key is issued; changing it later would mean two admission paths until every old key is replaced.
- Shown once, when it is created. We store only a SHA-256 hash of the whole key, so a database leak exposes no usable key.

How the key is sent is a design choice. We propose sending the key as a bearer token in a standard header, `Authorization: Bearer dfo_…`. The proxy also accepts `X-API-Key` as an alias. We don't plan to accept the key in a query string, as that's an outmoded style, although some people like it for ease of use and debuggability.

- Bearer is what a programmatic partner reaches for first, and what scripts, pipelines and SDKs set most easily.
- The Python and TypeScript SDKs send the key this way. They read it from a client option (`api_key`, `apiKey`), the `DFO_API_KEY` environment variable, or the credentials file `dfo auth login` writes, check its format and checksum before sending, and print it masked (`dfo_k_***Qjsd`). They need no change for keys.
- The `dfo_` prefix lets the proxy tell our key from any other bearer token.
- The alias costs a few lines. It leaves `Authorization` free if `/mcp` later gains sign-in, where one call could carry a user's token and an application's key.
- A call that sends both headers with different keys is refused with a 400.
- The proxy strips the key before forwarding, so it never reaches a backend or its logs. A `dfo_` value in `Authorization` under any scheme (`Token dfo_k_…`, a bare key) is stripped too, though only `Bearer` is read as a key.
- Request headers are kept off Sentry events and transactions, since Sentry otherwise copies every request header but cookies and IP headers onto each event (`src/lib/sentryOptions.ts`).

**Comparables: how other services do it**

Since this is an interesting choice, we did an informal survey of how other services convey tokens.

| Style                         | Who uses it                                                                                                                               | Notes                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Authorization: Bearer <key>` | OpenAI, Stripe, GitHub, Cloudflare, SendGrid                                                                                              | The closest thing to a standard. Every HTTP client and SDK can set it, and proxies, loggers and secret scanners already treat it as sensitive                                |
| Custom header                 | Anthropic and AWS API Gateway (`x-api-key`), Google Cloud (`x-goog-api-key`), Azure (`Ocp-Apim-Subscription-Key`), Datadog (`DD-API-KEY`) | Common where `Authorization` is reserved for something else, usually a user's OAuth token or a signed request. The key names the application; `Authorization` names the user |
| Query parameter (`?api_key=`) | Google Maps, US Census, FRED, api.data.gov                                                                                                | Easy to try in a browser, which is why open-data APIs like it. It leaks into access logs, browser history and referrers, so newer APIs avoid it                              |

Some services accept more than one: Stripe takes Bearer or HTTP Basic, and api.data.gov takes `X-Api-Key` or the query parameter. The split between the first two styles is mostly whether `Authorization` is already in use. A service with only keys uses Bearer. A service with keys and user tokens moves the key to a custom header.

**Compatibility with MCP clients**

The MCP specification defines authorisation as OAuth, with the token sent as `Authorization: Bearer`. It has no API-key concept, and clients differ in whether they can send a custom header at all. `/mcp` ignores a `dfo_` key, so no MCP client needs to send one, and a key one sends is stripped before the call goes upstream. Signed-in MCP access is a separate future feature that would use OAuth (see [Future features][]).

**Compatibility with the proxy as built**

| Path                                               | Handling of `Authorization`                                     | Effect of a key there                                                                                      |
| -------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/api/v1/*`                                        | Not passed upstream: dfo-apis reads no caller's `Authorization` | A `dfo_` bearer is read as the key and consumed. No conflict                                               |
| `/mcp`, proxy holds the harness token (production) | Overwritten with the harness token                              | No conflict. A `dfo_` value is stripped and ignored, and the header is replaced with the token             |
| `/mcp`, proxy holds no token                       | The caller's value is passed through to the harness             | The `dfo_` prefix tells our key from any other token: a `dfo_` value is stripped, any other passes through |

### Limits

Keyed use is limited twice, and both limits count API calls only.

- The per-minute limit belongs to the account, not the key. All of an account's keys count against one per-minute allowance, so creating more keys does not multiply it. It is one plain number, in calls per window, and protects against bursts. There are no named tiers.
- The daily quota also belongs to the account. All of an account's keys count against one daily count of API calls, which bounds total use. An operator may give one key a lower daily cap of its own.

The MCP surface has no keyed limit, because a key is ignored there. Every MCP call counts against its address at the anonymous limit, so heavy MCP use never uses up an account's API allowance.

| Surface | Covers                                 | Anonymous limit                | Keyed limit                                                                     |
| ------- | -------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| API     | `/api/v1/*`, `/openapi.json`, `/codes` | 120 calls a minute per address | The account's per-minute limit and daily quota, and the key's cap if it has one |
| MCP     | `/mcp`                                 | 300 calls a minute per address | None. A key is ignored, so the call is anonymous                                |

- The per-minute limit is an optional integer on the account (`user.api_rate_limit`).
- Empty means the default for keyed callers, set per deployment in env (`RATE_LIMIT_KEYED`, 600 by default). Most accounts store nothing, and raising the default moves them all at once.
- A number overrides the default for that account.
- The window is global, 60 seconds (`RATE_LIMIT_WINDOW_S`). There is no per-account window.
- A slow counter must not let a burst through. Today a slow or failed count lets the call through uncounted. Instead, each instance keeps a small in-memory count per caller and falls back to it when the shared count is slow, so the proxy stays available but one caller is still held near its limit on each instance. The fallback goes on from the last shared count it saw for the caller in the window, so a caller already refused stays refused.

One per-minute number is simpler to explain to a key holder and simpler to administer. The anonymous limits differ by surface because chat vendors send many users from one address. That does not apply to an account, which is one caller.

**Daily quota per account**

An account at the keyed default of 600 calls a minute could make 864,000 calls a day, and an email address is cheaper to get than an IP address. The per-minute limit is burst protection. The daily quota caps total use.

- Each account has a quota of API calls a day, counted across all its keys in `limit_counter` under `apiday:user:<accountId>`, in a one-day window aligned to 00:00 UTC.
- The quota is the nullable `user.api_daily_limit` column. Empty means the deployment default, `API_KEY_DAILY_LIMIT` (75,000 by default). An admin sets it per account on the admin page.
- A key may carry a lower cap of its own, the nullable `apikey.daily_limit` column, counted under `apiday:key:<keyId>` only when it is set. An admin sets it per key on the admin page, to hold back one key without touching the account's others.
- Every limit applies to each keyed API call: the per-minute limit first, then the account's daily quota, then the key's cap.
- Over a daily limit, a call is refused with a 429 problem document whose code is `allowance_exhausted`, not retryable, with `Retry-After` to 00:00 UTC, so a client stops for the day instead of waiting in a retry. The outcome is `limited`, and the detail says the count resets at 00:00 UTC.
- Refused calls count toward the day's total, because the limiter counts every attempt. The usage bar on the self-service panel and the admin page shows the account's count, for example "40,000 of 75,000", and a capped key shows its own count beside its cap.

Since both limits belong to the account, creating more keys multiplies neither, and deleting a key and creating another does not start the day again. Key creation needs no throttle of its own.

Both numbers are set from the admin side. If we later want tiers, for single or bulk changes to keys, they can be added as a column or as a bulk update over the per-minute number without changing what it means.

Not covered by an account's limits or a key's cap:

- The proxy's third allowance, `/api/download-pin` at 10 calls a minute, belongs to the site's download UI and is not part of the public API.
- The Studio's daily prompt allowance is for the site's own chat UI.
- dfo-apis keeps its own daily allowances per caller: 10 shares and 500 presentation cards, plus pins. A keyed API caller is named by its account and gets these at the default values. Raising them for a partner would be a dfo-apis setting, not part of the account's limit.

### Cloudflare integration

Cloudflare sits in front of the site and rate-limits by address. The proxy stays the per-account limiter, and Cloudflare is a coarse backstop against floods, set above the highest limit any account will have.

**Current configuration**

The zone is on the Pro plan. It limits the data API to 600 calls a minute per address and the Studio to 60, each blocking the address for 10 minutes. `/mcp` has no edge limit. The default limits need no edge change. Keys count on the API, where the edge limit of 600 a minute per address equals the keyed default of 600 a minute per account, so a keyed account reaches the edge limit first only when all its calls come from one address. The edge limit must sit above the highest per-minute limit any account is given, and a rule can skip requests carrying a key header, as below. Pro cannot count by a header. Cloudflare cannot tell a real key from a made-up one, since it sees only a header value, so it cannot enforce per-key limits itself.

**What Cloudflare recommends**

Its [rate limiting best practices][cf-best-practices] for REST APIs count requests per API key, not per address:

- To protect an endpoint: match the path and method, count by the `x-api-key` header, and block above the rate.
- To protect resources: count by path plus `x-api-key`, so each key gets a rate per resource.
- For clients with no key: count by IP.
- For the rate itself: take it from API Discovery or from past traffic. The page gives no default number.

It shows no paired "anonymous rule plus keyed rule" example, but that is what the pieces add up to.

**What each plan allows**

Counting by a header needs Advanced Rate Limiting, an Enterprise add-on ([availability by plan][cf-availability]).

| Plan                                | Can count by                                | Rules | Longest window |
| ----------------------------------- | ------------------------------------------- | ----- | -------------- |
| Free                                | IP                                          | 1     | 10 s           |
| Pro                                 | IP                                          | 2     | 1 min          |
| Business                            | IP, IP with NAT support                     | 5     | 10 min         |
| Enterprise                          | IP, IP with NAT support                     | 100   | about 18 h     |
| Enterprise + Advanced Rate Limiting | Headers, cookies, query, ASN, path and more | 100   | about 18 h     |

Below Enterprise, a rate limiting rule's own match expression cannot reference request headers, so "apply this rule only to requests without a key" cannot be written in the rule.

**Options for keyed traffic**

- With Advanced Rate Limiting: follow Cloudflare's pattern. One rule counts by IP for requests with no key header. Another counts by the key header at a high ceiling. A fake key then earns only a separate bucket that is still limited.
- Without it: raise the per-address threshold, or add a custom rule that skips rate limiting for requests that carry a key header. Whether custom rules can match headers and skip rate limiting rules on every plan is unconfirmed. The skip can be abused with a fake header, and the proxy's limit is then the only one left for that traffic.
- The data API's threshold is well above the proxy's anonymous limit and equals the keyed default, so the default limits need no edge change. An account limit above the threshold needs the threshold raised or a skip rule first.

### Where keys apply

| Surface                                                                          | Key honoured? | Notes                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/v1/search`, `datasets`, `graph`, `presentation`; `/openapi.json`; `/codes` | Yes           | Counted at the account's per-minute limit, on the `datasets` count for `/api/v1/datasets/*` and the `api` count for the rest, and against the account's daily quota. A dataset read the edge cache answers is not counted or checked |
| `/mcp`                                                                           | No            | A key is removed and ignored. The call is anonymous, counted per address at the MCP limit of 300 a minute. A `dfo_` bearer is not passed to the harness                                                                              |
| `/api/v1/studio/*`                                                               | No            | The Studio is the site's own chat UI. A key never replaces or bypasses its daily prompt allowance. A key sent there is removed and otherwise ignored                                                                                 |
| `/api/download-pin`, MCP theme stylesheets                                       | No            | These do not pass through the key check today and stay as they are                                                                                                                                                                   |

Keys exist for scripts and pipelines that call the API directly or through the Python and TypeScript SDKs. On every surface, a `dfo_` value is consumed by the proxy and never copied upstream. On the API it is verified, and it is consumed even when verification fails. Elsewhere, `/mcp` included, it is dropped unread, so a bad key there is not refused. dfo-apis gets no caller `Authorization` at all. Other upstreams get any other value as they do today.

### Identity, failure and abuse

- **One identity per request.** The proxy resolves the caller once, as an address or, on the API and the Datasets API, a key, before the limiter runs. That one identity is used for counting, for `x-dfo-caller` to the backends, and for logging. `/mcp` calls are always named by address. Today the MCP route, the dfo-apis path and the request log each work out the caller separately.
- **Invalid keys.** On the API, an unknown or revoked key gets a 401 and does not fall back to anonymous. There is no separate budget for bad keys. A key whose tag no server secret made is refused before any read or count, and logged with its own outcome (`forged`) so made-up keys can be counted. A valid key is never charged to its address, so keyed callers behind a busy shared address, such as a team's scripts behind one office address, are not held to that address's anonymous limit, and a later cut to the anonymous limits does not touch them. A deleted key keeps a good tag, so a good tag that finds no key is charged to its address, as every cache miss once was: deleted keys cost what made-up keys used to, and made-up keys cost nothing. Keys over a maximum length are refused unread, and unknown keys are cached briefly as unknown.
- **Revocation.** Revoking a key deletes it. The plugin lets a key's owner switch a disabled key back on, so disabling is not revocation. Logs keep the key's public id, so its history survives. A deleted key stops being admitted within the cache lifetime, about a minute per instance. The lifetime is absolute and is not extended when the store is unreachable. Revoking stops new calls. It does not cut a stream that is already open. Lowering an account's limits or a key's daily cap takes effect on the same delay. `API_KEY_CACHE_S` sets the lifetime in seconds (default 60), and 0 turns the cache off so every call reads the key and a change applies on its next call, at the cost of one key read and one `last_request` write per call.
- **Emergency switch.** An operator can delete one key from the admin page without a deploy. Turning off all keyed access sets `API_KEYS_ENABLED=false`, an environment variable, which takes a new Cloud Run revision. It stays an environment variable because the switch exists for a faulty key path, and it must still work when Postgres is down. See [Runbook][].
- **Key store unavailable.** The check fails open. A key already in the cache keeps working until its entry expires. A key that is not in the cache is treated as anonymous while the store cannot be reached: the call goes through at the anonymous limit for its address. Rate limiting is not a mission-critical part of the system, so staying available matters more than enforcing an account's own limits or a key's daily cap during an outage. The plugin reports a database outage as an invalid key, so the verifier has to tell the two apart itself rather than answer 401 to every uncached key during an outage. The lookup gets its own bounded pool and timeout, as the counter has, so a slow store does not slow the proxy.

### Logs and docs

- Key usage is logged in `forward()`, where the key is checked. The line carries the key's public id, its account, the surface and the outcome (`allowed`, `limited`, `invalid`, `forged` or `unavailable`), and never the key or its hash. The outcome `limited` covers a refusal by either limit. A failed key lookup logs only its error code, since the database error's message carries the query's parameters. While keys are off, a call carrying `X-API-Key` logs a line saying whether the value has our prefix, so callers who send another service's key there, and would get a 401 on the API once keys are on, can be counted first. The existing request log works the caller out from raw headers when the response closes, apart from `forward()`, so it cannot see which key was used. Per-key and per-account usage metrics come from this line. The usage bar on the self-service panel and the admin page reads the day's counter instead, which includes refused calls.
- `/openapi.json` declares the key schemes. `publicOpenApi` in `src/lib/proxy/openapi.ts` adds the `ApiKeyBearer` and `ApiKeyHeader` security schemes and, when the upstream document sets none, a root `security` whose empty entry marks a key as optional. The API docs explain keys on the page `build/api-keys`: the daily quota and its 00:00 UTC reset. The API quickstart in the docs repository says no key is needed and points key holders to that page.

## Build

The key store is a table in the website's Postgres, with a lookup in the proxy and admin pages. No external service is involved.

The proxy reaches the store through a small verifier: it takes a key and answers with the key's public id, limit and owner, or says the key is invalid, or says the store is unavailable. Nothing else in the proxy knows where keys live.

### Storage

Keys live in the plugin's `apikey` table in the website's Postgres, beside the accounts and the limit counters. The columns the site relies on:

| Column        | Purpose                                                                     |
| ------------- | --------------------------------------------------------------------------- |
| id            | Short public identifier, used in logs                                       |
| key           | SHA-256 hash of the whole key, uniquely indexed                             |
| prefix, start | First characters of the key, so its owner can recognise it in a list        |
| name          | What the key is for, unique among the account's keys without regard to case |
| reference_id  | Owning account, with a foreign key that deletes the key with the account    |
| daily_limit   | Optional daily cap for this key, empty for none                             |
| last_request  | Last use, updated occasionally and not on every call                        |

The account's per-minute limit is an optional integer on the user record, empty meaning the default for keyed callers. Revoking deletes the row.

Postgres holds the keys because the limiter already counts there, key volume is small, and it adds no infrastructure.

### The proxy check

On `/mcp` and the Studio the proxy strips any `dfo_` value, reads nothing from it and counts the call against the address, so the steps below do not run. On the API (`/api/v1/*`, `/openapi.json`, `/codes`; see [Where keys apply][]), before the rate limit:

1. Read the key header. No header: carry on as an anonymous caller.
2. Check the key's signed tag against each server secret. A bad tag: answer 401, with no read and no count.
3. Hash the key and look it up in a short in-process cache (about 60 seconds), so a keyed call adds no query in the common case. On a cache miss, look the key up in the store. Lookup is by the hash, so no secret is compared by hand.
4. Unknown or revoked key: count the call against the address's normal limit, then answer 401 with a problem document (429 when the address is over its limit).
5. Valid key: count the call against the owning account at the account's per-minute limit, against the account's daily quota (`apiday:user:<accountId>`) and, when the key has a cap of its own, against that cap (`apiday:key:<keyId>`), and never against the address, using the existing counter. Over any limit: answer 429 with a problem document. A daily refusal's detail says the quota resets at 00:00 UTC.
6. Log the key's public id, its account, the surface and the outcome.

[Identity, failure and abuse][] covers revocation delay and failing open when the store is unavailable.

A keyed API call is named to dfo-apis by its account instead of `ip:<digest>`, so dfo-apis's allowances are per account too. The form is `user:` and the first 32 hex digits of an HMAC-SHA-256 over the account id, keyed like the `ip:` digest, so no account id leaves the website. A `/mcp` call is always named `ip:<digest>`, so dfo-ai and its MCP servers never see a `user:` caller. dfo-apis refuses any form but `ip:` with a 400 today, so it must accept `user:` from the website. See [Work by repository][].

## Use: Better Auth API key plugin

The key store is the [API key plugin][better-auth-api-key] of Better Auth, the library that already handles sign-in on the site. It is a separate package, `@better-auth/api-key`, whose version tracks `better-auth` exactly. Keys live in our own Postgres, in a table the plugin defines. No third-party service is involved. The proxy reaches it through the verifier described under [Build][].

### What the plugin provides

| Area                         | What it does                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Storage                      | An `apikey` table. Keys are hashed by default, and the first characters are kept so an owner can recognise a key              |
| Key format                   | A configurable prefix and length (64 characters by default), or our own generator                                             |
| Create, list, update, delete | Server methods and matching client methods. A signed-in user can manage only their own keys                                   |
| Verify                       | `auth.api.verifyApiKey({ body: { key } })` returns whether the key is valid, why not, and the key's record without the secret |
| Ownership                    | Every key belongs to a user, or to an organisation if we adopt that plugin. A user can hold several keys                      |
| Expiry                       | Optional per key, with expired keys removed automatically                                                                     |
| Rate limit                   | One limit per key: a window and a maximum, counted on the key's row at each verification                                      |
| Quotas                       | An optional count of remaining requests per key, with periodic refill                                                         |
| Metadata                     | Free-form data per key, for example a plan name                                                                               |
| Header                       | Reads `x-api-key` by default. Other headers, or a function that extracts the key, can be configured                           |

### How it fits

The plugin generates, hashes, stores and manages keys. Our code owns the request path.

- **Proxy check.** The proxy does not call `verifyApiKey`. That call writes to the key's row on every verification, with no way to turn the writes off, and it reports a database outage as an invalid key. Instead our verifier hashes the key with the plugin's own hasher (`base64url(SHA-256(key))`) and reads the plugin's `apikey` table with Drizzle, on its own bounded pool and timeout. It checks `enabled` and `expiresAt` itself, after the signed tag. A throw or timeout means "store unavailable", so failing open works as in [Identity, failure and abuse][]. The read is behind the short in-process cache, and the cache stores `expiresAt` so an expired key is not admitted from the cache.
- **Header.** The proxy parses `Authorization: Bearer dfo_…` and `X-API-Key` itself. The plugin's option to turn a key into a session (`enableSessionForAPIKeys`) stays off: with it on, a key acts as its owner on every `/api/auth/*` endpoint, account deletion included.
- **Limits.** The plugin's limiter is off. We count in `limit_counter`: ours lets verification sit behind the cache, emits the `X-RateLimit-*` headers, and is the limiter anonymous traffic uses anyway. The account's per-minute limit is an extra field on the Better Auth user record (`apiRateLimit`, not settable by the user). The account's daily quota is a second such field (`apiDailyLimit`), counted in `limit_counter` as `apiday:user:<accountId>`. A key's own daily cap is a nullable `daily_limit` column on the plugin's `apikey` table, set only by an admin and counted as `apiday:key:<keyId>`.
- **Key format.** The plugin mints keys through its `customKeyGenerator` option: its own random letters, then the signed tag. The stored hash covers the whole key and works as before.
- **Endpoints.** The plugin's HTTP endpoints for keys are disabled. A user could otherwise create a key with any prefix and expiry. Better Auth checks `disabledPaths` only in its HTTP router, so our own handlers still reach the server methods. The self-service panel lists and deletes keys with the plugin's `listApiKeys` and `deleteApiKey` on the request's session, so the plugin alone decides which keys are whose and checks a ban on delete. Creating passes the signed-in user's id and forces the `dfo_k_` prefix.
- **Revocation.** Revoking deletes the key. The plugin lists and deletes keys only for their owner, so the admin page's queries over other accounts' keys read, delete and set the daily quota on the plugin's table with Drizzle.
- **Ownership.** Every key belongs to an account, and is deleted with it. A partner's keys belong to a role mailbox account, such as a team address, set up before the first partner key, so a key does not leave with the person who made it.
- **Schema coupling.** The proxy's key check and the admin queries read the plugin's table directly, which ties them to its schema. A known-answer test pins the hash, and the tests of the columns they read run on every plugin upgrade.
- **Caller name.** The key's account names the caller of a keyed API call to dfo-apis as `user:<32 hex>`, a keyed digest of the account id. The plugin's key id, a 32-character random string, is the public id in logs.
- **Schema.** The plugin's table is added through our existing migrations, as the auth tables were, with two changes: a unique index on the key hash, and a foreign key to the user that deletes an account's keys with the account. The plugin has neither. Migration `0029_api_keys.sql` adds the nullable `daily_limit` column.

### Admin system

There is no admin interface to leverage. This was checked in three places:

| Candidate                                                | What it is                                                                                                           | Does it manage API keys?                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The API key plugin itself                                | Server and client methods only                                                                                       | It has the operations, but no pages. Listing returns the signed-in user's own keys, so an operator view across all keys would query the table directly |
| [Better Auth admin plugin][better-auth-admin]            | User administration: list and edit users, roles, bans, sessions, impersonation                                       | No. It has no pages either, only methods, and it does not cover API keys                                                                               |
| [Better Auth Infrastructure dashboard][better-auth-dash] | A hosted dashboard from the Better Auth company, fed by a plugin that sends user and session events to their service | Not documented. It would also send account activity to a third party                                                                                   |

So the operator view is ours to write. It queries the table directly, since the plugin lists and deletes keys only for their owner.

The admin page is at `/admin/api-keys`, a "User management" page. It is open to signed-in users whose verified email is in `ADMIN_EMAILS`, and answers 404 to everyone else, checked on the page and in every action. The page opens with a dark hero holding the total user count as a badge and an email search, then a paginated table of all users (email, created, active key count), filterable by email. Expanding a user shows the account's usage bar for the day with a Reset usage icon, then their keys, each with name, created date, an editable daily cap (with its own usage bar when set) and Delete, plus Create key and the account's per-minute limit and daily quota. Reset usage sets the account's count for the current UTC day back to 0, and the count of each of its keys' caps, by deleting their `apiday:` counter rows, so an account that used its quota works again at once, then reloads the account's keys. An operator can therefore find any user by email, create a key for an account, delete any key, reset an account's usage for the day, set or clear a key's daily cap, and set or clear an account's per-minute limit and daily quota. Each change writes a log line naming the operator. A Cloud Run Job running an admin command is an optional addition for scripted changes. Setting an account's limit to 1 holds all its keys, new ones included, to one call a minute. Shutting an account out entirely needs a ban, which waits for Better Auth's `admin()` plugin and its roles; that plugin is worth adding once there is more than one admin task to gate. Anonymous access stays open either way.

The self-service panel calls our own route handlers under `/api/account/api-keys` (list, create and delete) over the plugin's server methods, since the plugin's HTTP endpoints are disabled. A route handler, unlike a server action, gets no Origin check from Next.js, so each mutating route refuses a request whose `Origin` header is missing or names a host other than the request's `X-Forwarded-Host` or `Host` (`src/lib/apiKeys/sameOrigin.ts`). Every route reads the session itself, answers 401 when signed out, and sets `Cache-Control: no-store`. The panel uses routes because it is also part of the prototypes app's static export, which cannot contain server actions. The account menu's "API keys" item opens it as a right-side drawer, the same drawer as the Studio's Customize panel, on whatever page the user is on. There is no `/account/api-keys` page. The panel shows the user's name and email, then "API keys" with a "Create API key" button and one card per key: name, prefix, created, last used, the usage bar and Delete. Create swaps the list for a name field with Cancel and Create. After a create, the panel shows the key once, with Copy and Close. Its five-key cap is checked again after each insert, so creates in parallel cannot pass it.

### What it saves and what it costs

Saves:

- Key generation, hashing and comparison, which are the security-sensitive parts.
- The create, list, update and delete operations with ownership checks, which the self-service panel uses.
- Several keys per account, and the expiry listed under [Future features][].

Costs:

- A dependency in the path of every keyed request, on a package that has changed recently: it moved to its own package, and its owner column was renamed. Our cache keeps it off the path for most calls.
- A second limiter that we switch off.
- Outage handling the plugin does not do, which we wrap around it.
- Less control over the table's shape, and upgrades that may bring migrations.

Every key needing an owning account is not a cost here: limits are per account anyway.

## Runbook

**Turn all keyed access off.** Set `API_KEYS_ENABLED=false` on the service, which rolls out a new revision; keys are then stripped and every call is counted by address. Set it back to `true` to turn keys on.

```
gcloud run services update <service> --region <region> --update-env-vars API_KEYS_ENABLED=false
```

**Before keys are first switched on in an environment,** run a week with `API_KEYS_ENABLED=false` and count the `api key header while keys are off` lines with `ours: false`: those callers send another service's key in `X-API-Key` and would get a 401 on the API.

**Rotate the key tag secret.** `API_KEY_TAG_SECRETS` is a comma-separated list, one per environment and never derived from `BETTER_AUTH_SECRET`, so rotating the auth secret leaves keys alone. The first entry signs new keys; every entry verifies. To rotate, add the new secret at the end in one revision, then move it first in the next, so no instance meets a key it cannot check. Removing a secret voids every key it signed, and keys do not expire, so a secret is removed only after its keys are replaced. A production instance refuses to start without the list.

## Work by repository

Most of the work is in the website. The other systems see only the caller name and the key header. The pieces:

| Where      | Size       | What                                                                                                                                                                                                                                                                                                                                       |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| website    | Most of it | The plugin's table and the limit columns, in migration 0029; key check on the API surfaces, per-account per-minute limit and daily quota, burst-safe counter fallback and key usage logging in `forward()`; the self-service side panel and the admin User management page, each with the usage bar; tests beside the existing proxy tests |
| dfo-apis   | Small      | Accept a keyed caller in `x-dfo-caller` beside the website's shared secret, so allowances count per account. The website sends `user:` for a keyed API call. Today only `ip:<digest>` is accepted, and anything else gets a 400                                                                                                            |
| dfo-ai     | None       | `/mcp` ignores keys, so dfo-ai sees only `ip:<digest>` callers                                                                                                                                                                                                                                                                             |
| sdk        | None       | The Python and TypeScript SDKs already read a key, check the client contract's format and send it as a bearer                                                                                                                                                                                                                              |
| infra      | Small      | `API_KEY_TAG_SECRETS`, a dedicated secret list per environment, before the first key is issued. The admin page covers operator changes in production; a Cloud Run Job for a scripted admin command is optional                                                                                                                             |
| docs       | Small      | The API quickstart, which says no key is needed, gains a note that a key raises limits and a link to the `build/api-keys` page. That page covers the 52-character key format, the daily quota and its 00:00 UTC reset, and says `/mcp` ignores keys                                                                                        |
| Cloudflare | Small      | Keyed calls pass the data API's per-address rule (600 a minute), which equals the keyed default. Raise it, or skip it for keyed requests, before an account's limit passes 600                                                                                                                                                             |

Order matters. dfo-apis refuses a caller form it does not recognise with a 400 when it arrives with the shared secret. So dfo-apis ships first, and the website starts sending keyed callers last. An end-to-end test should show a keyed API call spending the account's own allowance in dfo-apis.

## Future features

Not built. The design leaves room for them.

- **Operator tools beyond the admin page.** Bulk changes to limits, and usage reports by caller.
- **Expiring keys.** The verifier refuses an expired key, and no page sets an expiry. A key lives until it is revoked.
- **Keys owned by an organisation.** The plugin supports it, and existing keys keep their secrets. The move needs a migration to replace the foreign key from `0029_api_keys.sql`, a home for the account limit off `user`, and a rule for whose allowances and pins in the backends follow the organisation.
- **Usage history.** The usage bar shows today's count. Counts for earlier days exist only in log lines.
- **Signed-in MCP access** ([#176][issue-176]). `/mcp` accepts OAuth sign-in, so a signed-in user's calls count against their account. It is separate from API keys, which `/mcp` ignores. It includes how an MCP client shows a refusal: a 429 on a tool call reaches most clients as a raw transport error, so a refused `tools/call` would be better answered as a tool result with `isError: true`, as the MCP specification's own rate-limit example and the GitHub MCP server do.
- **Terms of use at key creation.**
- **More graceful degradation besides limits.** Depending on how often limits are hit, and the user impact of that, we could have fancier throttles in the future:
    - Soft vs. hard limits (warnings)
    - Hourly vs. weekly limits, like how modern chat interfaces work. This protects against spiky workloads while mitigating the impact of hitting a limit ("try again in a few hours").

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
[How it works today]: #how-it-works-today
[Requirements]: #requirements
[Key format and communication]: #key-format-and-communication
[Limits]: #limits
[Cloudflare integration]: #cloudflare-integration
[Where keys apply]: #where-keys-apply
[Identity, failure and abuse]: #identity-failure-and-abuse
[Logs and docs]: #logs-and-docs
[Build]: #build
[Storage]: #storage
[The proxy check]: #the-proxy-check
[Use: Better Auth API key plugin]: #use-better-auth-api-key-plugin
[What the plugin provides]: #what-the-plugin-provides
[How it fits]: #how-it-fits
[Admin system]: #admin-system
[What it saves and what it costs]: #what-it-saves-and-what-it-costs
[Runbook]: #runbook
[Work by repository]: #work-by-repository
[Future features]: #future-features
