# API Keys for the Platform Proxy

Sef Kloninger <<sef@ode.partners>> with Claude Code \
[Issue #142][issue] \
Last Update: Nov 13, 2026

## Contents

- [Summary][]
- [How It Works Today][]
- [Design][]
    - [The Key][]
    - [Which Header Carries the Key][]
    - [Storage][]
    - [Limits][]
    - [The Proxy Check][]
    - [Cloudflare Integration][]
    - [Logs and Docs][]
- [Phases][]
    - [Phase 1: Validate][]
    - [Phase 2: Provision][]
    - [Phase 3: Enforce][]
- [Work by Repository][]
- [Future Features][]
- [Open Questions][]

## Summary

This feature is to add per-user access to the Development Finance Observatory backend. Needs:

- Metered and ACL'ed access
- Prevent cost overruns or operations problems that could come from
- Enable potential other business arrangements, e.g. charge to serve or syndicate high-volume, high-cost, or licensed data.

We intend to still have a free / open tier. We want minimal friction for the majority of users to use DFO, it's a valuable onramp; also search and AI crawlers are an important source of traffic for us, and will continue to be. But more expensive and frequent access will go through the API key.

The proxy fronts the public Search, Datasets and Graph APIs (`/api/v1/*`) and the MCP servers (`/mcp`). Today it knows callers only by address.

Requirements:

- Anonymous access will stays open up to a limit. Our goal is to manage usage and enable rate limits, not wholesale API gating.
- Each key carries its own rate limit.
- Some MCP features may later require sign-in. That is separate from keys and out of scope here.

We'll take a phased approach. Initially we'll prove the concept with hand-provisioned keys and limited features. Once proven this works in production, follow-on work will enable more features, self-service provisioning, and admin interfaces to adjust access and limits.

## How It Works Today

Every public API and MCP call passes through one function in the website, `forward()` in `src/lib/proxy/forward.ts`. That is the single place a key needs to be checked.

- **Rate limit.** `forward()` counts each call against the client's address in a fixed window: 120 calls a minute on `/api/*`, 300 on `/mcp`. The counters live in the website's Postgres (`limit_counter` table) and are shared by all instances. If the count fails or is slow, the call goes through uncounted.
- **No Redis.** The task description mentions turning a Redis limiter back on. There is no Redis code in the website now, so per-key limits need no Memorystore instance.
- **Edge limits.** Cloudflare WAF rules also rate-limit by address, in front of the site.
- **Caller identity.** The proxy names the caller to the backends as `x-dfo-caller: ip:<digest>`, a keyed hash of the address. dfo-apis counts its own allowances (shares, cards, pins) against that name. It trusts the header only beside a secret it shares with the website.
- **Backends are ahead of us in one place.** dfo-ai's caller module already documents `key:` and `user:` callers "from the website's edge". dfo-apis accepts only the `ip:` form.
- **MCP auth.** On `/mcp` the proxy attaches its own token for the harness when it holds one. Otherwise it passes the caller's `Authorization` header through.
- **Accounts.** The site has sign-in (Better Auth on its own Postgres) and an account menu, which is where self-service keys would attach.
- **Docs.** The API quickstart says the API accepts requests without a key.

## Design

A key is optional on every call. A call with a valid key is counted against the key at the key's limit, a call with no key is counted against the address as today, and a call with a bad key is refused. This is a proposal to react to, not a settled design.

### The Key

- Format: a recognisable prefix, an environment marker and random characters, for example `dfo_live_<32+ random chars>`. The prefix lets secret scanners and our own logs spot a leaked key.
- Shown once, when it is created. We store only a SHA-256 hash, so a database leak exposes no usable key.

How the key is sent is a design choice. We propose send the key as a bearer token in a standard header, `Authorization: Bearer dfo_…`. The proxy also accepts `X-API-Key` as an alias. And we don't plan to accept the same bearer in a query string as that's an outmoded style, although some people like it for ease of use and debug-ability.

- Bearer is what a programmatic partner reaches for first, and what MCP developer clients set most easily.
- The `dfo_` prefix lets the proxy tell our key from any other bearer token.
- The alias costs a few lines. It leaves `Authorization` free if `/mcp` later gains sign-in, where one call could carry a user's token and an application's key.
- A call that sends both headers with different keys is refused with a 400.
- The proxy strips the key before forwarding, so it never reaches a backend or its logs.

**Comparables: How Other Services Do It**

Since this is an interesting choice, I asked Claude to do a quick survey to see how other services convey tokens.

| Style                         | Who uses it                                                                                                                               | Notes                                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Authorization: Bearer <key>` | OpenAI, Stripe, GitHub, Cloudflare, SendGrid                                                                                              | The closest thing to a standard. Every HTTP client and SDK can set it, and proxies, loggers and secret scanners already treat it as sensitive                                |
| Custom header                 | Anthropic and AWS API Gateway (`x-api-key`), Google Cloud (`x-goog-api-key`), Azure (`Ocp-Apim-Subscription-Key`), Datadog (`DD-API-KEY`) | Common where `Authorization` is reserved for something else, usually a user's OAuth token or a signed request. The key names the application; `Authorization` names the user |
| Query parameter (`?api_key=`) | Google Maps, US Census, FRED, api.data.gov                                                                                                | Easy to try in a browser, which is why open-data APIs like it. It leaks into access logs, browser history and referrers, so newer APIs avoid it                              |

Some services accept more than one: Stripe takes Bearer or HTTP Basic, and api.data.gov takes `X-Api-Key` or the query parameter. The split between the first two styles is mostly whether `Authorization` is already in use. A service with only keys uses Bearer. A service with keys and user tokens moves the key to a custom header.

**Compatibility with MCP clients**

The MCP specification defines authorization as OAuth, with the token sent as `Authorization: Bearer`. It has no API-key concept, so support for a key depends on the client.

| Client type       | Examples                                          | Can it send our key?                                                                                                                                                        |
| ----------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Developer clients | Claude Code, Cursor, VS Code, SDK scripts         | Yes. They let a user configure headers per server, so either header works                                                                                                   |
| Hosted chat apps  | Connector settings in Claude, ChatGPT and similar | Generally no. They are built around OAuth or no auth, and most give users no place to enter a header. This changes often and needs checking per client before we rely on it |

So a key on `/mcp` serves programmatic and developer use. Chat-app users stay anonymous until `/mcp` has OAuth sign-in, which is the separate "MCP features that require logging in" work.

**Compatibility with the proxy as built**

| Path                                               | What happens to `Authorization` today                           | Effect of a key there                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/api/v1/*`                                        | Passed upstream, where dfo-apis does not use it to name callers | No conflict                                                                                           |
| `/mcp`, proxy holds the harness token (production) | Overwritten with the harness token                              | No conflict. The proxy reads the key first, then replaces the header as it does now                   |
| `/mcp`, proxy holds no token                       | The caller's value is passed through to the harness             | The only conflict. The `dfo_` prefix resolves it: our key is consumed, any other token passes through |

### Storage

A new `api_key` table in the website's Postgres, beside the accounts and the limit counters.

| Column                               | Purpose                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------- |
| id                                   | Short public identifier, used in logs and as the caller name                |
| key_hash                             | SHA-256 of the key, unique                                                  |
| prefix                               | First characters of the key, so its owner can recognise it in a list        |
| label                                | What the key is for                                                         |
| user_id                              | Owning account. Empty for a manually provisioned key in Phase 1             |
| api_limit, mcp_limit                 | Calls per window on each surface. Empty means the default for keyed callers |
| created_at, revoked_at, last_used_at | Lifecycle                                                                   |

Postgres rather than Redis: the limiter already counts there, key volume is small, and it adds no new infrastructure. This can be changed later if we need something more scalable and performant at the cost of some additional dev and operational complexity.

### Limits

A key's limit is two plain numbers, one per surface. There are no named tiers.

| Surface | Covers                                 | Anonymous limit today          | Column on the key |
| ------- | -------------------------------------- | ------------------------------ | ----------------- |
| API     | `/api/v1/*`, `/openapi.json`, `/codes` | 120 calls a minute per address | `api_limit`       |
| MCP     | `/mcp`                                 | 300 calls a minute per address | `mcp_limit`       |

- Each column is a nullable integer, in calls per window.
- Empty means the default for keyed callers, set per deployment in env (for example `RATE_LIMIT_API_KEYED` and `RATE_LIMIT_MCP_KEYED`). Most keys store nothing, and raising the default moves them all at once.
- A number overrides the default for that key.
- The window stays global at 60 seconds (`RATE_LIMIT_WINDOW_S`). There is no per-key window.

This is all on the admin side. If we later want tiers, for single or bulk changes to keys, they can be added as a column or as a bulk update over these two numbers without changing what the numbers mean.

Not covered by a key's limits:

- The proxy's third allowance, `/api/download-pin` at 10 calls a minute, belongs to the site's download UI and is not part of the public API.
- The Studio's daily prompt allowance is for the site's own chat UI.
- dfo-apis keeps its own daily allowances per caller: 10 shares and 500 presentation cards, plus pins. A keyed caller gets these at the default values. Raising them for a partner would be a dfo-apis setting, not a column here.

### The Proxy Check

In `forward()`, before the rate limit:

1. Read the key header. No header: carry on as an anonymous caller.
2. Hash the key and look it up, through a short in-process cache (about 60 seconds) so a keyed call adds no query in the common case.
3. Unknown or revoked key: answer 401 with a problem document. It does not fall back to anonymous, so a caller finds out their key is dead.
4. Valid key: count the call against `key:<id>` at the key's limit, using the existing counter.

A revoked key can keep working until the cache entry expires, so revocation takes up to a minute per instance. If the key lookup itself fails, the proposal is to treat the call as anonymous, in line with the limiter failing open.

A keyed call is named to the backends as `x-dfo-caller: key:<id>` instead of `ip:<digest>`. dfo-ai already expects that form. dfo-apis needs a small change to accept it, so its own allowances count per key and not per address.

### Cloudflare Integration

Cloudflare sits in front of the site and rate-limits by address. The proxy stays the per-key limiter, and Cloudflare is a coarse backstop against floods, set above the highest limit any key will have. Cloudflare cannot tell a real key from a made-up one, since it sees only a header value, so it cannot enforce per-key limits itself.

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
- If today's thresholds are already well above 120 and 300 calls a minute, Phase 1 may need no edge change.

Which option applies depends on the zone's plan and its current rules. See Open Questions.

### Logs and Docs

- The request log line carries the key caller, so usage per key can be counted in Cloud Logging. This is what Phase 3 needs to find high-volume callers.
- `/openapi.json` gains an optional security scheme, and the API and MCP docs explain keys.

## Phases

Three phases take keys from an optional test feature to the normal way heavy users reach the API. Anonymous access stays open throughout.

### Phase 1: Validate

**Goal:** Optional keys work end to end, for testing and the first partner

**Scope:** Keys work on both `/api/v1/*` and `/mcp`. MCP is in scope from the start because it can be a significant cost driver.

**Who gets a key:** A few callers we choose

**Provisioning:** Manual: an admin command creates and revokes keys

**Limits:** Set per key by hand

**Anonymous access:** Unchanged

**Also needed:** Proxy check, `api_key` table, dfo-apis accepts `key:` callers, per-key usage in logs

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

**Limits:** Anonymous limits lowered in steps, key tiers settled

**Anonymous access:** Open but lower

**Also needed:** Usage reports by caller, a playbook for lowering a limit and rolling it back, edge rules that respect keys

Phase 1 should avoid choices that Phase 2 has to undo. The table has an owner column from the start, and limits are stored per key in a form a tier can replace.

## Work by Repository

Most of the work is in the website. The Phase 1 pieces:

| Where      | Size           | What                                                                                                                                                                                                               |
| ---------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| website    | Most of it     | `api_key` table and migration; key check and per-key limit in `forward()`; admin command to create and revoke; key caller in the request log; OpenAPI security scheme; docs; tests beside the existing proxy tests |
| dfo-apis   | Small          | Accept `x-dfo-caller: key:<id>` beside the website's shared secret, so allowances count per key. Today only `ip:<digest>` is accepted                                                                              |
| dfo-ai     | Little or none | Confirm a `key:` caller flows through `/mcp` to the MCP servers; add a test if none covers it                                                                                                                      |
| Cloudflare | Configuration  | The WAF rate rules count by address. A keyed caller on a few addresses could hit them before reaching its key's limit                                                                                              |

Order matters between the website and dfo-apis. dfo-apis refuses a caller form it does not recognize when it arrives with the shared secret, so the dfo-apis change has to be live before the website starts sending `key:` callers.

## Future Features

Not planned for any phase yet. The design should not rule them out.

- **Expiring keys.** A key carries an expiry date and stops working after it. Until then a key lives until it is revoked.
- **Multiple keys per account.** An account holds several keys at once, for example one per application or to rotate a key without downtime.
- **More graceful degradation besides limits.** Depending on how often limits are hit, and the user impact of that, we could have fancier throttles in the future
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
[Summary]: #summary
[How It Works Today]: #how-it-works-today
[Design]: #design
[The Key]: #the-key
[Storage]: #storage
[Limits]: #limits
[The Proxy Check]: #the-proxy-check
[Cloudflare Integration]: #cloudflare-integration
[Logs and Docs]: #logs-and-docs
[Phases]: #phases
[Phase 1: Validate]: #phase-1-validate
[Phase 2: Provision]: #phase-2-provision
[Phase 3: Enforce]: #phase-3-enforce
[Work by Repository]: #work-by-repository
[Future Features]: #future-features
[Open Questions]: #open-questions
