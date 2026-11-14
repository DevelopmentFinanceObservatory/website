# API Keys for the Platform Proxy

Sef Kloninger <<sef@ode.partners>> with Claude Code \
[Issue #142][issue] \
Last Update: Nov 13, 2026

## Contents

- [Summary][]
- [How It Works Today][]
- [Requirements][]
    - [Key Format and Communication][]
    - [Limits][]
    - [Cloudflare Integration][]
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
- Each key carries its own rate limit.
- Some MCP features may later require sign-in. That is separate from keys and out of scope here.

**Recommendation (tentative).** There are two ways to get this: [build][Build] the key store ourselves, or [use][Use: Better Auth API Key Plugin] the API key plugin of Better Auth, the library that already handles sign-in on the site. We lean toward using the plugin for key storage and management, while keeping our own rate limiter and proxy check. It saves writing security-sensitive code and brings expiry, multiple keys per account and self-service endpoints that Phase 2 needs. We are not sure yet. A short spike should settle it before Phase 1 code starts, because moving existing keys between the two stores later may mean reissuing them. If the spike fails any of its checks, we build.

We'll take a phased approach. Initially we'll prove the concept with hand-provisioned keys and limited features. Once this is proven in production, follow-on work will enable more features, self-service provisioning, and admin interfaces to adjust access and limits.

## How It Works Today

Every public API and MCP call passes through one function in the website, `forward()` in `src/lib/proxy/forward.ts`. That is the single place a key needs to be checked.

- **Rate limit.** `forward()` counts each call against the client's address in a fixed window: 120 calls a minute on `/api/*`, 300 on `/mcp`. The counters live in the website's Postgres (`limit_counter` table) and are shared by all instances. If the count fails or is slow, the call goes through uncounted.
- **No Redis.** The original task description mentions turning a Redis limiter back on. There is no Redis code in the website now, so per-key limits need no Memorystore instance.
- **Edge limits.** Cloudflare WAF rules also rate-limit by address, in front of the site.
- **Caller identity.** The proxy names the caller to the backends as `x-dfo-caller: ip:<digest>`, a keyed hash of the address. dfo-apis counts its own allowances (shares, cards, pins) against that name. It trusts the header only beside a secret it shares with the website.
- **Backends are ahead of us in one place.** dfo-ai's caller module already documents `key:` and `user:` callers "from the website's edge". dfo-apis accepts only the `ip:` form.
- **MCP auth.** On `/mcp` the proxy attaches its own token for the harness when it holds one. Otherwise it passes the caller's `Authorization` header through.
- **Accounts.** The site has sign-in (Better Auth on its own Postgres) and an account menu, which is where self-service keys would attach.
- **Docs.** The API quickstart says the API accepts requests without a key.

## Requirements

A key is optional on every call. A call with a valid key is counted against the key at the key's limit, a call with no key is counted against the address as today, and a call with a bad key is refused. These requirements hold whether we build the key store or use Better Auth's plugin.

### Key Format and Communication

- Format: a recognizable prefix, an environment marker and random characters, for example `dfo_live_<32+ random chars>`. The prefix lets secret scanners and our own logs spot a leaked key.
- Shown once, when it is created. We store only a SHA-256 hash, so a database leak exposes no usable key.

How the key is sent is a design choice. We propose sending the key as a bearer token in a standard header, `Authorization: Bearer dfo_…`. The proxy also accepts `X-API-Key` as an alias. We don't plan to accept the key in a query string, as that's an outmoded style, although some people like it for ease of use and debuggability.

- Bearer is what a programmatic partner reaches for first, and what MCP developer clients set most easily.
- The `dfo_` prefix lets the proxy tell our key from any other bearer token.
- The alias costs a few lines. It leaves `Authorization` free if `/mcp` later gains sign-in, where one call could carry a user's token and an application's key.
- A call that sends both headers with different keys is refused with a 400.
- The proxy strips the key before forwarding, so it never reaches a backend or its logs.

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

| Client type       | Examples                                          | Can it send our key?                                                                                                                                                        |
| ----------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Developer clients | Claude Code, Cursor, VS Code, SDK scripts         | Yes. They let a user configure headers per server, so either header works                                                                                                   |
| Hosted chat apps  | Connector settings in Claude, ChatGPT and similar | Generally no. They are built around OAuth or no auth, and most give users no place to enter a header. This changes often and needs checking per client before we rely on it |

So a key on `/mcp` serves programmatic and developer use. Chat-app users stay anonymous until `/mcp` has OAuth sign-in, which is the separate "MCP features that require logging in" work.

**Compatibility with the Proxy as Built**

| Path                                               | What happens to `Authorization` today                           | Effect of a key there                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/api/v1/*`                                        | Passed upstream, where dfo-apis does not use it to name callers | No conflict                                                                                           |
| `/mcp`, proxy holds the harness token (production) | Overwritten with the harness token                              | No conflict. The proxy reads the key first, then replaces the header as it does now                   |
| `/mcp`, proxy holds no token                       | The caller's value is passed through to the harness             | The only conflict. The `dfo_` prefix resolves it: our key is consumed, any other token passes through |

### Limits

A key's limit is two plain numbers, one per surface. There are no named tiers.

| Surface | Covers                                 | Anonymous limit today          | Setting on the key |
| ------- | -------------------------------------- | ------------------------------ | ------------------ |
| API     | `/api/v1/*`, `/openapi.json`, `/codes` | 120 calls a minute per address | `api_limit`        |
| MCP     | `/mcp`                                 | 300 calls a minute per address | `mcp_limit`        |

- Each setting is an optional integer, in calls per window.
- Empty means the default for keyed callers, set per deployment in env (for example `RATE_LIMIT_API_KEYED` and `RATE_LIMIT_MCP_KEYED`). Most keys store nothing, and raising the default moves them all at once.
- A number overrides the default for that key.
- The window stays global at 60 seconds (`RATE_LIMIT_WINDOW_S`). There is no per-key window.

This is all on the admin side. If we later want tiers, for single or bulk changes to keys, they can be added as a column or as a bulk update over these two numbers without changing what the numbers mean.

Not covered by a key's limits:

- The proxy's third allowance, `/api/download-pin` at 10 calls a minute, belongs to the site's download UI and is not part of the public API.
- The Studio's daily prompt allowance is for the site's own chat UI.
- dfo-apis keeps its own daily allowances per caller: 10 shares and 500 presentation cards, plus pins. A keyed caller gets these at the default values. Raising them for a partner would be a dfo-apis setting, not a setting on the key.

### Cloudflare Integration

Cloudflare sits in front of the site and rate-limits by address. The proxy stays the per-key limiter, and Cloudflare is a coarse backstop against floods, set above the highest limit any key will have. Cloudflare cannot tell a real key from a made-up one, since it sees only a header value, so it cannot enforce per-key limits itself.

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
- If today's thresholds are already well above 120 and 300 calls a minute, Phase 1 may need no edge change.

Which option applies depends on the zone's plan and its current rules. See [Open Questions][].

### Logs and Docs

- The request log line carries the key caller, so usage per key can be counted in Cloud Logging. This is what Phase 3 needs to find high-volume callers.
- `/openapi.json` gains an optional security scheme, and the API and MCP docs explain keys.

## Build

In this option we own the key store: a table in the website's Postgres, a lookup in the proxy, and an admin command. Nothing new is installed.

### Storage

A new `api_key` table in the website's Postgres, beside the accounts and the limit counters.

| Column                               | Purpose                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------- |
| id                                   | Short public identifier, used in logs and as the caller name                |
| key_hash                             | SHA-256 of the key, unique                                                  |
| prefix                               | First characters of the key, so its owner can recognize it in a list        |
| label                                | What the key is for                                                         |
| user_id                              | Owning account. Empty for a manually provisioned key in Phase 1             |
| api_limit, mcp_limit                 | Calls per window on each surface. Empty means the default for keyed callers |
| created_at, revoked_at, last_used_at | Lifecycle                                                                   |

Postgres rather than Redis: the limiter already counts there, key volume is small, and it adds no new infrastructure. This can be changed later if we need something more scalable and performant at the cost of some additional dev and operational complexity.

### The Proxy Check

In `forward()`, before the rate limit:

1. Read the key header. No header: carry on as an anonymous caller.
2. Hash the key and look it up, through a short in-process cache (about 60 seconds) so a keyed call adds no query in the common case.
3. Unknown or revoked key: answer 401 with a problem document. It does not fall back to anonymous, so a caller finds out their key is dead.
4. Valid key: count the call against `key:<id>` at the key's limit, using the existing counter.

A revoked key can keep working until the cache entry expires, so revocation takes up to a minute per instance. If the key lookup itself fails, the proposal is to treat the call as anonymous, in line with the limiter failing open.

A keyed call is named to the backends as `x-dfo-caller: key:<id>` instead of `ip:<digest>`. dfo-ai already expects that form. dfo-apis needs a small change to accept it, so its own allowances count per key and not per address.

### Future Work: Admin Interface

Phase 1 has only an admin command that creates and revokes keys and sets their limits. Later phases need more, and all of it would be ours to build:

- Self-service pages in the account menu to create, label and revoke keys and see last use, with the endpoints and ownership checks behind them (Phase 2).
- An operator view to find a key, see its usage, and raise or cut its limits (Phase 3).
- Expiry and multiple keys per account, if we take them up from [Future Features][].

## Use: Better Auth API Key Plugin

In this option the key store is the [API key plugin][better-auth-api-key] of Better Auth, the library that already handles sign-in on the site. It is a separate package, `@better-auth/api-key`, and is not installed today (the site has `better-auth` 1.7.7). Keys live in our own Postgres, in a table the plugin defines. No third-party service is involved.

### What the Plugin Provides

| Area                         | What it does                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Storage                      | An `apikey` table. Keys are hashed by default, and the first characters are kept so an owner can recognize a key    |
| Key format                   | A configurable prefix and length (64 characters by default), or our own generator                                   |
| Create, list, update, delete | Server methods and matching client methods. A signed-in user can manage only their own keys                         |
| Verify                       | `auth.api.verifyApiKey({ key })` returns whether the key is valid, why not, and the key's record without the secret |
| Ownership                    | Every key belongs to a user, or to an organization if we adopt that plugin. A user can hold several keys            |
| Expiry                       | Optional per key, with expired keys removed automatically                                                           |
| Rate limit                   | One limit per key: a window and a maximum, counted on the key's row at each verification                            |
| Quotas                       | An optional count of remaining requests per key, with periodic refill                                               |
| Metadata                     | Free-form data per key, for example a plan name                                                                     |
| Header                       | Reads `x-api-key` by default. Other headers, or a function that extracts the key, can be configured                 |

### How It Would Fit

- **Proxy check.** The steps in [The Proxy Check][] stay the same, with the lookup replaced by `verifyApiKey`. We would keep the short in-process cache, because the plugin writes to the key's row on each verification unless updates are deferred.
- **Header.** A small getter reads `Authorization: Bearer dfo_…` and `X-API-Key`, so [Key Format and Communication][] holds as written.
- **Limits.** Our design has two limits per key, one per surface, and the plugin has one. We would turn the plugin's limiter off, keep counting in `limit_counter`, and hold the two numbers in the key's metadata. The alternative is to move to one limit per key.
- **Ownership.** A hand-provisioned Phase 1 key needs an account to belong to. We would create one for the partner, or for ourselves on their behalf.
- **Caller name.** The plugin's key id becomes the `<id>` in `x-dfo-caller: key:<id>`.
- **Schema.** The plugin's table is added through our existing migrations, as the auth tables were.

### Admin System

There is no admin interface to leverage. This was checked in three places:

| Candidate                                                | What it is                                                                                                           | Does it manage API keys?                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The API key plugin itself                                | Server and client methods only                                                                                       | It has the operations, but no pages. Listing returns the signed-in user's own keys, so an operator view across all keys would query the table directly |
| [Better Auth admin plugin][better-auth-admin]            | User administration: list and edit users, roles, bans, sessions, impersonation                                       | No. It has no pages either, only methods, and it does not cover API keys                                                                               |
| [Better Auth Infrastructure dashboard][better-auth-dash] | A hosted dashboard from the Better Auth company, fed by a plugin that sends user and session events to their service | Not documented. It would also send account activity to a third party                                                                                   |

So an admin command, and later an operator view, are ours to write in either option. With the plugin, they are thin wrappers over its server methods instead of our own queries. A community library, better-auth-ui, has ready-made components for a user's own keys, which could shorten the Phase 2 self-service pages. It has not been evaluated.

### What It Saves and What It Costs

Saves:

- Key generation, hashing and comparison, which are the security-sensitive parts.
- The create, list, update and delete endpoints with ownership checks, which Phase 2 needs.
- Expiry and multiple keys per account, both listed under [Future Features][].

Costs:

- A dependency in the path of every keyed request, on a package that has changed recently: it moved to its own package, and its owner column was renamed.
- A second limiter we would switch off, and limits kept in metadata instead of typed columns.
- Every key must have an owning account.
- Less control over the table's shape, and upgrades that may bring migrations.

### Spike Before Deciding

A day or two should answer these. Any "no" sends us to [Build][].

- [ ] Does `@better-auth/api-key` work with the site's `better-auth` 1.7.7 and its Drizzle migrations?
- [ ] Can verification run without a database write per request, or is the write cheap enough behind our cache?
- [ ] Does a getter for `Authorization: Bearer` work alongside the plugin's own endpoints?
- [ ] Is the stored hash a plain SHA-256 of the key, so keys could be moved to or from our own table?
- [ ] Can an operator set a key's metadata and limits for another user's key from the server?

## Phases

Three phases take keys from an optional test feature to the normal way heavy users reach the API. Anonymous access stays open throughout.

### Phase 1: Validate

**Goal:** Optional keys work end to end, for testing and the first partner

**Scope:** Keys work on both `/api/v1/*` and `/mcp`. MCP is in scope from the start because it can be a significant cost driver.

**Who gets a key:** A few callers we choose

**Provisioning:** Manual: an admin command creates and revokes keys

**Limits:** Set per key by hand

**Anonymous access:** Unchanged

**Also needed:** Proxy check, key table, dfo-apis accepts `key:` callers, per-key usage in logs

**Exit criteria:** The first partner runs on a key in production without incident, and per-key counts in the logs match what they report sending.

### Phase 2: Provision

**Goal:** Anyone can get a key; existing users have a path to move

**Who gets a key:** Any signed-in account

**Provisioning:** Self-service from the account menu: create, label, revoke, see last use

**Limits:** A default for self-service keys, with higher limits granted by an operator. We will examine current usage and tune the default and the anonymous thresholds at that time, as part of the transition plan.

**Anonymous access:** Unchanged; docs start recommending a key

**Also needed:** Docs and quickstart, a transition notice for current users, usage shown to key owners

**Exit criteria:** The transition notice has been out for an agreed period, and the callers who would be hit by lower anonymous limits have been identified and contacted where we can reach them.

### Phase 3: Enforce

**Goal:** High-volume users are on keys; anonymous limits can come down safely

**Who gets a key:** Same, plus outreach to heavy anonymous callers

**Provisioning:** Self-service, plus operator tools to raise or cut a key's limit

**Limits:** Anonymous limits lowered in steps

**Anonymous access:** Open but lower

**Also needed:** Usage reports by caller, a playbook for lowering a limit and rolling it back, edge rules that respect keys

Phase 1 should avoid choices that Phase 2 has to undo. The table has an owner column from the start, and limits are stored per key in a form a tier can replace.

## Work by Repository

Most of the work is in the website. This split holds for both options: Build and Use differ only in the website row, in where keys are stored and how they are looked up. The dfo-apis, dfo-ai and Cloudflare rows are the same either way, since those systems see only the `key:<id>` caller name and the key header. The Phase 1 pieces:

| Where      | Size           | What                                                                                                                                                                                                                                              |
| ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| website    | Most of it     | Key table and migration (our own `api_key`, or the plugin's); key check and per-key limit in `forward()`; admin command to create and revoke; key caller in the request log; OpenAPI security scheme; docs; tests beside the existing proxy tests |
| dfo-apis   | Small          | Accept `x-dfo-caller: key:<id>` beside the website's shared secret, so allowances count per key. Today only `ip:<digest>` is accepted                                                                                                             |
| dfo-ai     | Little or none | Confirm a `key:` caller flows through `/mcp` to the MCP servers; add a test if none covers it                                                                                                                                                     |
| Cloudflare | Configuration  | The WAF rate rules count by address. A keyed caller on a few addresses could hit them before reaching its key's limit                                                                                                                             |

Order matters between the website and dfo-apis. dfo-apis refuses a caller form it does not recognize when it arrives with the shared secret, so the dfo-apis change has to be live before the website starts sending `key:` callers.

## Alternatives Considered

Besides [Build][] and [Use][Use: Better Auth API Key Plugin] above, we looked at buying this outright. None of these fit as well, because the hard parts are already in the proxy: one function every call passes through, a shared limiter in Postgres, and caller naming to the backends.

| Option                                         | What it is                                                                            | What it would give us                                                                                                      | Why not, or not yet                                                                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosted key service, for example [Unkey][unkey] | A service that issues and verifies keys; the proxy calls it on each request           | Key management, per-key limits and usage analytics with no tables of our own. A free tier of 150,000 verifications a month | A network call to a third party on every keyed request, and a new vendor holding our callers' keys. Cost grows with traffic, which is the thing we are trying to control |
| Hosted API gateway, for example [Zuplo][zuplo] | A managed gateway in front of the APIs, with keys, rate limits and a developer portal | The whole feature, including self-service sign-up and docs                                                                 | It replaces the proxy we already have. Streaming (SSE and MCP), caller naming and the harness token would all need to be rebuilt in its terms                            |
| Google Cloud API Gateway or Apigee             | Google's gateways, in the cloud the backends already run in                           | API Gateway: keys and quotas. Apigee: a full product with developer portal and monetization                                | API Gateway keys are Google Cloud API keys, which suits internal consumers more than outside sign-ups. Apigee is priced and sized for a larger API program than ours     |
| Cloudflare                                     | Already in front of the site                                                          | Edge rate limiting per key header on the Enterprise Advanced Rate Limiting plan                                            | It does not issue or validate keys, so it cannot replace the proxy check. See [Cloudflare Integration][]                                                                 |

If monetization becomes real, the calculation changes: metering, billing and a developer portal are where the gateway products earn their cost. Nothing in this design blocks moving to one later, since keys are checked in one place.

## Future Features

Not planned for any phase yet. The design should not rule them out.

- **Expiring keys.** A key carries an expiry date and stops working after it. Until then a key lives until it is revoked.
- **Multiple keys per account.** An account holds several keys at once, for example one per application or to rotate a key without downtime.
- **More graceful degradation besides limits.** Depending on how often limits are hit, and the user impact of that, we could have fancier throttles in the future:
    - Soft vs. hard limits (warnings)
    - Hourly vs. weekly limits, like how modern chat interfaces work. This protects against spiky workloads while mitigating the impact of hitting a limit ("try again in a few hours").

## Open Questions

The Cloudflare question needs an answer before Phase 1 code is written.

- [ ] **Cloudflare.** Who owns the WAF rate rules, and can they exempt or raise the threshold for requests that carry a key header? An exemption on header presence alone could be abused with a fake key, so the rule may need a higher ceiling instead of none. Which plan is the zone on, and what are the current thresholds? See [Cloudflare Integration][].
- [ ] **How do we reach current anonymous users** for the Phase 2 transition, given we know them only as hashed addresses? Candidates: docs, response headers, the SDK's `x-dfo-client` header.
- [ ] **Does a key identify an account to the backends as well,** so a signed-in user's key and their site session share allowances? dfo-ai already names a `user:` caller form.

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
[Work by Repository]: #work-by-repository
[Alternatives Considered]: #alternatives-considered
[Future Features]: #future-features
[Open Questions]: #open-questions
