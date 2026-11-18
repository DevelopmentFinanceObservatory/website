# API Keys: User Stories

[Issue #142][issue] · [Design][design]

These stories set the UX for API keys and quotas, and each acceptance criterion is meant to become a test case. They sit beside the [design][design], which covers how keys and limits work. Where a story depends on a design rule (one limit per account, per surface, per 60-second window), it links to it rather than restating it.

## Contents

- [Personas][]
- [Terms][]
- [Stories: In-Scope][]
    - [Seeing Usage][]
    - [Hitting a Limit][]
    - [Managing Keys][]
    - [Admin Support][]
    - [Telemetry][]
- [Stories: Scope TBD][]
- [Stories: Out-Of-Scope][]
- [Open Questions][]

## Personas

**DFO user.** A signed-in account holder. Some work mainly in the Studio and the site; others mainly call the API or MCP from code or an MCP client. Either kind can reach the site's account pages, so key management and usage live there.

**DFO admin.** An operator, most likely from the ONE Data team, whose verified email is in `ADMIN_EMAILS`. Admins support users, debug problems and act in emergencies.

## Terms

- **Limit (quota).** The number of calls an account may make per 60-second window. It is one number applied to the API and MCP surfaces separately, shared by all of the account's keys. Empty on the account means the keyed default. See [Limits][design-limits].
- **Surface.** API (`/api/v1/*`, `/openapi.json`, `/codes`) or MCP (`/mcp`).
- **Key.** A `dfo_live_…` secret, shown once at creation.
- **Limit alert.** A minute in which at least one of an account's keyed calls was refused for being over the limit.

Stories are numbered by area (`U` user, `A` admin, `T` telemetry). A story keeps its number if it moves between sections, so gaps are expected. **Status** says where today's branch stands: _built_, _partial_ or _not built_.

## Stories: In-Scope

### Seeing Usage

#### U2. See which key is being used

_As a DFO user, I want to see when each key was last used, so I can find keys that are stale or leaked._

- [ ] Each key row shows label, prefix, created date and last used ("never" if unused).
- [ ] Last use is approximate (it is updated occasionally); the column says so on hover or in a footnote.
- [ ] The page states the account's limit as "N calls a minute, per surface" and whether it is the default or set for this account.

Status: partial. Key rows are built (verify the "approximate" note); the limit statement is not.

### Hitting a Limit

Keyed limits apply to API and MCP calls, which arrive from code and MCP clients, not from pages on the site. The Studio's daily prompt allowance is a separate limit and keys never change it ([design: Where Keys Apply][design-where]). So the moment a limit is hit, the user hears about it from the API, not the site. Seeing limits after the fact on the site is [U1][Stories: Scope TBD].

#### U3. A clear refusal when my code or MCP client is over the limit

_As a DFO user calling the API or MCP with a key, I want a refusal that tells me what happened and what to do next, so I'm not left guessing._

- [ ] An over-limit call gets 429 with `Retry-After`, the `X-RateLimit-*` headers and a problem document ([design: example][design-testing]).
- [ ] The problem document's `detail` says the limit was reached, per account, when to retry, and links to `/account/api-keys`.
- [ ] The problem document's `type` (`/codes/rate_limited`) resolves to a page that explains limits and how to ask for a higher one (support flow TBD, see [Open Questions][]).
- [ ] On MCP, an over-limit `tools/call` is answered with HTTP 200 and a JSON-RPC result with `isError: true`, so the model reads the refusal and can tell the user. Its text says the account's limit was reached, how many seconds to wait, not to retry sooner, and where to ask for a higher limit. `Retry-After` and the `X-RateLimit-*` headers are still set. See [design: Refusals on MCP][design-limits].
- [ ] On MCP, any other over-limit request (`initialize`, `tools/list` and the rest) gets the HTTP 429 problem document. Its `detail` is one plain sentence, since clients show the body text as is.
- [ ] Checked by hand in Claude Code and one Claude connector: an over-limit tool call leads the assistant to tell the user they hit the limit and when to try again.
- [ ] Wording does not blame the user or suggest abuse.

Status: partial. The 429, headers and problem document are built. The account link, the code page and the MCP tool-result refusal are not.

#### U4. A clear refusal when my key is bad

_As a DFO user, I want a refused key to tell me why, so I can fix my configuration._

- [ ] An unknown, deleted or forged key gets 401 with a problem document that says the key was not accepted and points to `/account/api-keys` to create a new one.
- [ ] The response does not say whether the key once existed, was deleted, or was never ours.
- [ ] Sending different keys in `Authorization` and `X-API-Key` gets 400 explaining the conflict.

Status: partial (status codes built; wording and link to check).

### Managing Keys

Patterned on GitHub's personal access tokens.

#### U6. Create a key and see it once

_As a DFO user, I want to create a labeled key and see the secret exactly once, so it is never stored anywhere I can't control._

- [ ] Creating takes a required label.
- [ ] On success, a modal shows the full key with Copy and Download (a `.txt` holding the key and its label) actions, and a plain warning that it won't be shown again.
- [ ] The modal can't be dismissed by an accidental click outside it; closing needs an explicit "I've saved it" action.
- [ ] After the modal closes, the key never appears again: not in the list, page source, a reload, the back button or a server response.
- [ ] The modal includes a short example of using the key: a `curl` line with `Authorization: Bearer` and an MCP client header snippet.
- [ ] The new key works on the next call (no cache delay for new keys).

Status: partial. Create, a one-time reveal and Copy are built. Download, the explicit-dismiss modal and the usage snippet are not.

#### U7. Hit the per-account key cap

_As a DFO user with the maximum number of keys, I want to be told why I can't create another and what to do._

- [ ] With `API_KEYS_MAX_PER_ACCOUNT` keys (5 by default), the create form is disabled with a note: delete an unused key to make room.
- [ ] Two creates sent at once at 4 keys never leave the account with 6 (the cap is rechecked after insert).

Status: built (verify the disabled-form wording).

#### U8. Delete a key

_As a DFO user, I want to delete a key permanently, so a leaked or unused key stops working._

Delete is the only way to stop a key. There is no disable: the plugin lets an owner re-enable a disabled key, so disabling is not revocation ([design: Revocation][design-identity]).

- [ ] Delete asks for confirmation naming the key's label and prefix.
- [ ] The confirmation says the key stops working within about a minute and that this can't be undone.
- [ ] A deleted key is gone from the list immediately and refused within about a minute.
- [ ] The page offers no disable or enable control, and the plugin's update endpoint is not reachable to flip a key's `enabled` flag.
- [ ] A user cannot delete or see another account's key, even with a crafted request.

Status: built (verify confirmation wording and the "within a minute" note).

#### U9. Signed-out access

_As a visitor who is not signed in, I want to be sent to sign in when I open the keys page, and land back on it afterwards._

- [ ] `/account/api-keys` signed out redirects to sign-in and returns to the page.

Status: to verify.

### Admin Support

#### A1. Look up a user's keys and limit

_As a DFO admin, I want to see any user's keys and limit exactly as they see them, so I can answer "why am I being throttled?"_

Starts as an impersonation-style view of the user's page, since there are few keyed users at first. Filtering and bulk operations come later.

- [ ] From `/admin/api-keys`, an admin can find an account by email and open a view of that account showing the same key list and limit as U2.
- [ ] If [U1][Stories: Scope TBD] ships, the view shows the same limit alerts too.
- [ ] The view is clearly marked as another user's (their email in a banner) so it can't be mistaken for the admin's own.
- [ ] This is a read-only view built for admins, not a real session as the user: no sign-in as them and no Studio access as them.
- [ ] A non-admin gets 404 on every admin page and action, signed in or not.

Status: partial. The admin page lists all keys and filters by email; the per-user view is not built.

#### A2. Manage a user's keys

_As a DFO admin, I want the same create and delete operations on any user's keys, for support and debugging._

- [ ] An admin can create a key for an account by email. The key is shown once in the same modal as U6, then never again, to the admin or the user.
- [ ] An admin can never see an existing key's secret, only its label, prefix and dates.
- [ ] An admin can delete any key, with the same confirmations and "within a minute" note as the user's page.
- [ ] Keys an admin creates for a user appear on that user's page like any other key.
- [ ] Each admin change names the admin in the log line and in telemetry (T1).

Status: partial. Create and delete for any account are built; the U6 modal improvements follow the user page.

#### A3. Set or clear an account's limit

_As a DFO admin, I want to raise, lower or reset one account's limit, so I can grant a partner more room or hold back a misbehaving one._

- [ ] An admin can set a positive integer limit or clear it back to the default.
- [ ] The page shows both the account's override (if any) and the current default, so the effective limit is clear.
- [ ] Invalid input (zero, negative, non-integer, absurdly large) is refused with a message.
- [ ] The change reaches the proxy within about a minute; the page says so.

Status: built (verify effective-limit display and input validation).

#### A4. Stop one key fast

_As a DFO admin responding to abuse, I want to kill one key from the admin page without a deploy._

- [ ] Deleting a key from the admin page stops it within about a minute (A2).
- [ ] The runbook's `API_KEYS_ENABLED=false` switch for all keys is linked from the admin page.

Status: partial (delete built; runbook link not).

### Telemetry

#### T1. Sentry events for key management

_As a DFO admin, I want a Sentry event for every key-management operation, so I can trace what happened to a key when debugging._

- [ ] Create, delete and limit changes each send an event, from both the user and admin pages.
- [ ] Each event carries the operation, the key's public id, the owning account id, the actor's account id and whether the actor was an admin.
- [ ] No event ever carries the key, its hash, or request headers ([design][design-key-format]). A test pins this.
- [ ] Failed operations (not found, cap reached, not authorized) are recorded with their reason.

Status: not built. Log lines exist for admin changes; Sentry events do not.

#### T2. Sentry events when a limit is hit

_As a DFO admin, I want to know when keyed accounts hit their limit, so I can spot accounts that need a higher limit or are misbehaving._

- [ ] A keyed 429 records a Sentry event with account id, key public id, surface and limit.
- [ ] Events are grouped per account and surface, so one account hammering a limit makes one issue, not thousands. Sampling or one event per account per window is acceptable.
- [ ] Anonymous 429s are not in scope for this story.
- [ ] Bad-key outcomes (`invalid`, `forged`) are counted, not sent as one event each.

Status: not built. The usage log line already records outcomes.

## Stories: Scope TBD

Stories we have not yet put in or out. Each needs a cost/benefit call before it moves to [Stories: In-Scope][] or [Stories: Out-Of-Scope][].

#### U1. See when my keys hit the limit

_As a DFO user, I want to see when my keys hit the limit, so I can tell whether I need a higher limit or should slow my code down._

A limit lasts a minute, so a usage meter would be empty or full by the time anyone looked at it. Instead the page lists limit alerts: the minutes in which calls were refused.

- [ ] `/account/api-keys` lists limit alerts, newest first. Each row shows the minute (in the viewer's time zone), the surface, the key (label and prefix) and how many calls were refused in that minute.
- [ ] The list covers the past day by default. A selector widens it to the past week or month.
- [ ] With no alerts in range, the list says so ("No limits hit in the past day").
- [ ] An alert for a key since deleted still shows, marked as a deleted key.
- [ ] Only this account's keyed refusals appear. Anonymous refusals from the user's address never do.
- [ ] If an alert falls in the past hour, a banner at the top of the page says which surface and key hit the limit and how to ask for a higher one (support flow TBD).
- [ ] The list is read on page load. Live updating is not required.

Status: not built.

**Cost/benefit.** The cost depends on where the alerts are read from:

- **Usage log lines.** `forward()` already logs each refused call with key id, account, surface and outcome `limited` ([design: Logs and Docs][design-logs]). Querying Cloud Logging from a page is slow, has its own quota, and needs the site to hold log-read rights.
- **Sentry (T2).** Grouping and sampling in T2 drop the per-minute counts this list needs.
- **A rollup table.** On each refused call, upsert a row (account, key, surface, minute, count) in Postgres, kept 30 days. Cheap to read, and bounded: at most one row per key and surface per minute. Costs a write on each 429, a migration, and a retention job.

The benefit is that users and admins (A1) can answer "was I throttled, and when?" without asking support. Until keyed accounts hit limits often, the 429 response (U3) and T2 may be enough.

## Stories: Out-Of-Scope

Deliberately not part of this work. Some are listed in the design's [Future Features][design-future].

1. **Soft limits.** No warnings as an account approaches its limit, and no usage projections.
2. **Fine-grained key permissions.** A key grants access at the account's limit. It is not scoped to datasets, endpoints or operations.
3. **Gating who may hold a key.** Any signed-in account can create and use keys up to the cap. No approval step, waitlist or eligibility check.
4. **Out-of-band alerting.** No email, Slack or other notification to a user or an admin when a limit is hit. Users learn from the API's refusal (U3) and, if it ships, on the site (U1); admins learn through Sentry (T2), which is not an alert routed to anyone.
5. **Detailed usage monitoring.** No graph of how much of the limit an account used over time, with a time-range selector (hour, day, week) and marks where limits were hit. This can be built later, on whatever store U1 settles on.
6. **Outreach to current users.** No flow to find current anonymous callers and encourage them onto keys. Keys are for prospective partners who want or need higher access, offered as we talk to them. No current caller is near a level we'd consider unsustainable, so nobody needs to be moved yet.
7. **Disabling a key.** Keys are created and deleted, nothing in between. A user who wants a key off deletes it and makes a new one later (U8).

## Open Questions

- [ ] **Support flow for a higher limit.** A support email address, a page on the site, or a ticketing system? U1, U3 and the `/codes/rate_limited` page all link to it. (Also an open question in the [design][design-open].)
- [x] **MCP refusals in clients.** How does an over-limit MCP call reach the user? Answered in the design's [Refusals on MCP][design-limits]: refuse `tools/call` as a tool result with `isError: true`, and everything else with a 429. Checked by hand per client under U3.
- [ ] **Studio limit messaging.** The Studio's daily prompt allowance is separate from key limits. Should its refusal get the same treatment as U3, as a separate story?

[issue]: https://github.com/DevelopmentFinanceObservatory/website/issues/142
[design]: api-keys.md
[design-limits]: api-keys.md#limits
[design-where]: api-keys.md#where-keys-apply
[design-identity]: api-keys.md#identity-failure-and-abuse
[design-key-format]: api-keys.md#key-format-and-communication
[design-logs]: api-keys.md#logs-and-docs
[design-testing]: api-keys.md#local-test-results
[design-future]: api-keys.md#future-features
[design-open]: api-keys.md#open-questions
[Personas]: #personas
[Terms]: #terms
[Stories: In-Scope]: #stories-in-scope
[Seeing Usage]: #seeing-usage
[Hitting a Limit]: #hitting-a-limit
[Managing Keys]: #managing-keys
[Admin Support]: #admin-support
[Telemetry]: #telemetry
[Stories: Scope TBD]: #stories-scope-tbd
[Stories: Out-Of-Scope]: #stories-out-of-scope
[Open Questions]: #open-questions
