# API Keys: User Stories

[Issue #142][issue] · [Design][design]

These stories set the UX for API keys and quotas, and each acceptance criterion is meant to become a test case. They sit beside the [design][design], which covers how keys and limits work. Where a story depends on a design rule (keys apply to MCP only, one per-minute limit per account, a daily quota per key), it links to it rather than restating it.

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

**DFO user.** A signed-in account holder. Some work mainly in the Studio and the site; others mainly call MCP from code or an MCP client. Either kind can open the API keys panel from the account menu, so key management and usage live there.

**DFO admin.** An operator, most likely from the ONE Data team, whose verified email is in `ADMIN_EMAILS`. Admins support users, debug problems and act in emergencies.

## Terms

- **Per-minute limit.** The number of MCP calls an account may make per 60-second window, shared by all of the account's keys. Empty on the account means the keyed default (`RATE_LIMIT_KEYED`, 600). See [Limits][design-limits].
- **Daily quota.** The number of MCP calls one key may make per day, counted from 00:00 UTC. Empty on the key means the deployment default (`API_KEY_DAILY_LIMIT`, 1,000). See [Limits][design-limits].
- **Surface.** API (`/api/v1/*`, `/openapi.json`, `/codes`) or MCP (`/mcp`). Keys apply to MCP only. A key sent to the API surface is stripped and ignored, and the call is anonymous.
- **Key.** A `dfo_live_…` secret, shown once at creation.
- **Usage bar.** A key's MCP calls since 00:00 UTC against its daily quota, shown as a bar and a count such as "500 of 1,000". Refused calls are included.
- **Panel.** The right-side drawer that the account menu's "API keys" item opens on whatever page the user is on. It is the same drawer as the Studio's Customize panel.
- **Limit alert.** A minute in which at least one of an account's keyed calls was refused for being over a limit.

Stories are numbered by area (`U` user, `A` admin, `T` telemetry). A story keeps its number if it moves between sections, so gaps are expected. **Status** says where this branch stands: _built_, _partial_ or _not built_.

## Stories: In-Scope

### Seeing Usage

#### U1. See today's usage against a key's daily quota

_As a DFO user, I want to see how much of each key's daily quota I have used today, so I know whether I am close to the quota before my client is refused._

A per-minute count would be empty or full by the time anyone looked, so the bar shows the daily quota, which changes slowly enough to read.

- [ ] Each key card in the panel shows a usage bar and a count such as "500 of 1,000": the MCP calls made with the key since 00:00 UTC, against the key's daily quota (its own, or the default).
- [ ] The count includes refused calls, and the bar reads full once the quota is reached.
- [ ] A key with no calls today shows "0 of N".
- [ ] The panel says the count resets at 00:00 UTC.
- [ ] Only this account's keys appear.
- [ ] The admin page shows the same bar for each key, read from the same counter ([A1][Admin Support]).
- [ ] The count is read when the panel opens. Live updating is not required.

Status: partial. The bar and count are built on the panel and the admin page. The reset note is not verified.

#### U2. See which key is being used

_As a DFO user, I want to see when each key was last used, so I can find keys that are stale or leaked._

- [ ] Each key card shows name, prefix, created date and last used ("never" if unused).
- [ ] Last use is approximate (it is updated occasionally); the card says so on hover or in a footnote.
- [ ] The panel states the account's per-minute limit as "N calls a minute on MCP" and whether it is the default or set for this account.

Status: partial. Key cards are built (verify the "approximate" note); the limit statement is not.

### Hitting a Limit

Keyed limits apply to MCP calls, which arrive from MCP clients and code, not from pages on the site. The Studio's daily prompt allowance is a separate limit and keys never change it ([design: Where Keys Apply][design-where]). So the moment a limit is hit, the user hears about it from the MCP server, not the site. Seeing the day's usage on the site is [U1][Seeing Usage]. Seeing limits after the fact is [U11][Stories: Scope TBD].

#### U3. A clear refusal when my MCP client is over a limit

_As a DFO user calling MCP with a key, I want a refusal that tells me what happened and what to do next, so I'm not left guessing._

- [ ] A call over the account's per-minute limit gets 429 with `Retry-After`, the `X-RateLimit-*` headers and a problem document ([design: example][design-testing]).
- [ ] A call over the key's daily quota is refused the same way, with outcome `limited`, and its problem document's `detail` says the daily quota resets at 00:00 UTC.
- [ ] The problem document's `detail` says which limit was reached, per account or per key, when to retry, and names the API keys panel in the account menu.
- [ ] The problem document's `type` (`/codes/rate_limited`) resolves to a page that explains limits and how to ask for a higher one (support flow TBD, see [Open Questions][]).
- [ ] An over-limit `tools/call` is answered with HTTP 200 and a JSON-RPC result with `isError: true`, so the model reads the refusal and can tell the user. Its text says which limit was reached, how many seconds to wait or that the quota resets at 00:00 UTC, not to retry sooner, and where to ask for a higher limit. For a per-minute refusal, `Retry-After` and the `X-RateLimit-*` headers are set too. See [design: Refusals on MCP][design-limits].
- [ ] Any other over-limit request (`initialize`, `tools/list` and the rest) gets the HTTP 429 problem document. Its `detail` is one plain sentence, since clients show the body text as is.
- [ ] Checked by hand in Claude Code and one Claude connector, for each limit: an over-limit tool call leads the assistant to tell the user they hit the limit and when to try again.
- [ ] Wording does not blame the user or suggest abuse.

Status: partial. The 429, headers and problem document, and the daily-quota refusal with its reset detail, are built. The panel reference, the code page and the MCP tool-result refusal are not built.

#### U4. A clear refusal when my key is bad

_As a DFO user, I want a refused key to tell me why, so I can fix my configuration._

- [ ] On `/mcp`, an unknown, deleted or forged key gets 401 with a problem document that says the key was not accepted and tells the user to create a new one from the API keys panel in the account menu.
- [ ] The response does not say whether the key once existed, was deleted, or was never ours.
- [ ] On `/mcp`, sending different keys in `Authorization` and `X-API-Key` gets 400 explaining the conflict.
- [ ] On `/api/v1/*`, `/openapi.json` and `/codes`, a `dfo_` value is stripped and ignored whatever its validity. The call is answered as an anonymous call and counted per address at the anonymous limit.

Status: partial. The status codes and the API-surface behaviour are built; the wording and the panel reference are to check.

### Managing Keys

Patterned on GitHub's personal access tokens.

Key management is the panel. The account menu's "API keys" item opens it on whatever page the user is on. It shows the user's name and email, then "API keys" with a "Create API key" button and one card per key: name, prefix, created, last used, the usage bar ([U1][Seeing Usage]), Rotate and Delete. There is no `/account/api-keys` page.

#### U6. Create a key and see it once

_As a DFO user, I want to create a named key and see the secret exactly once, so it is never stored anywhere I can't control._

- [ ] "Create API key" swaps the list for a name field with Cancel and Create buttons. Creating takes a required name.
- [ ] On success, the panel shows the full key with Copy and Close actions and a plain warning that it won't be shown again.
- [ ] A click outside the panel does not dismiss the key while it is shown; closing needs the explicit Close action.
- [ ] After Close, the key never appears again: not in the list, page source, a reload, the back button or a server response.
- [ ] The panel includes a short example of using the key: an MCP client header snippet with `Authorization: Bearer`.
- [ ] The new key works on the next call (no cache delay for new keys).
- [ ] The new key's usage bar starts at "0 of N", where N is the default daily quota.

Status: partial. Create with the name field, the one-time reveal, Copy and Close are built. The outside-click guard and the usage snippet are not built.

#### U7. Hit the per-account key cap

_As a DFO user with the maximum number of keys, I want to be told why I can't create another and what to do._

- [ ] With `API_KEYS_MAX_PER_ACCOUNT` keys (5 by default), the "Create API key" button is disabled with a note: delete an unused key to make room.
- [ ] Two creates sent at once at 4 keys never leave the account with 6 (the cap is rechecked after insert).

Status: built (verify the disabled-button wording in the panel).

#### U8. Delete a key

_As a DFO user, I want to delete a key permanently, so a leaked or unused key stops working._

Delete is the only way to stop a key. There is no disable: the plugin lets an owner re-enable a disabled key, so disabling is not revocation ([design: Revocation][design-identity]).

- [ ] Delete asks for confirmation naming the key's name and prefix.
- [ ] The confirmation says the key stops working within about a minute and that this can't be undone.
- [ ] A deleted key is gone from the list immediately and refused within about a minute.
- [ ] The panel offers no disable or enable control, and the plugin's update endpoint is not reachable to flip a key's `enabled` flag.
- [ ] A user cannot delete or see another account's key, even with a crafted request.

Status: built (verify confirmation wording and the "within a minute" note).

#### U10. Rotate a key

_As a DFO user, I want to replace a key with a new one under the same name and daily quota, so I can change a secret without rebuilding my setup._

- [ ] Each key card has a Rotate action.
- [ ] Rotating creates a new key with the same name and the same daily quota, and deletes the old key.
- [ ] The panel shows the new key once, with Copy and Close, as in [U6][Managing Keys].
- [ ] The old key stops working within about a minute, as in [U8][Managing Keys]. The new key works on the next call.
- [ ] The new key's usage bar starts at "0 of N", since the count is per key.
- [ ] Rotating leaves the account's key count unchanged, so an account at the cap can rotate.
- [ ] A user cannot rotate another account's key, even with a crafted request.

Status: partial. Rotate is built. The at-cap case and the crafted-request case are to verify.

#### U9. Signed-out access

_As a visitor who is not signed in, I want key management to be reachable only after I sign in._

- [ ] The "API keys" item appears in the account menu only for a signed-in user.
- [ ] The panel's actions refuse a request with no session.
- [ ] A request to `/account/api-keys` gets 404.

Status: to verify.

### Admin Support

#### A1. Find a user and see their keys, usage and limit

_As a DFO admin, I want to find any user and see their keys, usage and limit, so I can answer "why am I being throttled?"_

`/admin/api-keys` is a "User Management" page. Expanding a user's row shows their keys in place, so no separate per-user view is needed.

- [ ] The page opens with a dark hero holding the total user count as a badge and an email search.
- [ ] Below it, a table lists all users with email, created date and active key count. It is paginated and filterable by email.
- [ ] Expanding a user shows their keys, each with name, created date, usage bar (the same counter as [U1][Seeing Usage]), an editable daily quota, Rotate and Delete. The expanded row also shows Create key and the account's per-minute limit.
- [ ] If [U11][Stories: Scope TBD] ships, the expanded row shows the same limit alerts too.
- [ ] A non-admin gets 404 on every admin page and action, signed in or not.

Status: built (verify pagination and the email filter against a long user list).

#### A2. Manage a user's keys

_As a DFO admin, I want create, rotate and delete on any user's keys, for support and debugging._

- [ ] An admin can create a key for an expanded user. The key is shown once, as in [U6][Managing Keys], then never again, to the admin or the user.
- [ ] An admin can never see an existing key's secret, only its name, prefix, dates and usage.
- [ ] An admin can rotate any key, as in [U10][Managing Keys], and delete any key, with the same confirmations and "within a minute" note as the panel.
- [ ] Keys an admin creates for a user appear in that user's panel like any other key.
- [ ] Each admin change names the admin in the log line and in telemetry (T1).

Status: partial. Create, rotate and delete for any account are built; the T1 events are not.

#### A3. Set or clear an account's per-minute limit

_As a DFO admin, I want to raise, lower or reset one account's per-minute limit, so I can grant a partner more room or hold back a misbehaving one._

- [ ] An admin can set a positive integer limit or clear it back to the default, from the user's expanded row.
- [ ] The row shows both the account's override (if any) and the current default, so the effective limit is clear.
- [ ] Invalid input (zero, negative, non-integer, absurdly large) is refused with a message.
- [ ] The change reaches the proxy within about a minute; the page says so.

Status: built (verify effective-limit display and input validation).

#### A4. Stop one key fast

_As a DFO admin responding to abuse, I want to kill one key from the admin page without a deploy._

- [ ] Deleting a key from the admin page stops it within about a minute (A2).
- [ ] The runbook's `API_KEYS_ENABLED=false` switch for all keys is linked from the admin page.

Status: partial (delete built; runbook link not).

#### A5. Set or clear a key's daily quota

_As a DFO admin, I want to raise, lower or reset one key's daily quota, so I can grant a partner more MCP calls a day or hold back a key that is being abused._

- [ ] In a user's expanded row, each key's daily quota is editable. An admin can set a positive integer or clear it back to the deployment default (`API_KEY_DAILY_LIMIT`, 1,000).
- [ ] The key's usage bar shows the effective quota as its right-hand number, and the row shows whether it is the default or set for this key.
- [ ] Invalid input (zero, negative, non-integer, absurdly large) is refused with a message.
- [ ] The change reaches the proxy within about a minute; the page says so.

Status: partial. Editing the quota is built. Input validation and the one-minute propagation are to verify.

### Telemetry

#### T1. Sentry events for key management

_As a DFO admin, I want a Sentry event for every key-management operation, so I can trace what happened to a key when debugging._

- [ ] Create, rotate, delete, limit and quota changes each send an event, from both the panel and the admin page.
- [ ] Each event carries the operation, the key's public id, the owning account id, the actor's account id and whether the actor was an admin.
- [ ] No event ever carries the key, its hash, or request headers ([design][design-key-format]). A test pins this.
- [ ] Failed operations (not found, cap reached, not authorized) are recorded with their reason.

Status: not built. Log lines exist for admin changes; Sentry events do not.

#### T2. Sentry events when a limit is hit

_As a DFO admin, I want to know when keyed accounts hit a limit, so I can spot accounts that need a higher limit or are misbehaving._

- [ ] A keyed 429 records a Sentry event with account id, key public id, which limit was hit (per-minute or daily) and its value.
- [ ] Events are grouped per account and limit, so one account hammering a limit makes one issue, not thousands. Sampling or one event per account per window is acceptable.
- [ ] Anonymous 429s are not in scope for this story.
- [ ] Bad-key outcomes (`invalid`, `forged`) are counted, not sent as one event each.

Status: not built. The usage log line already records outcomes.

## Stories: Scope TBD

Stories we have not yet put in or out. Each needs a cost/benefit call before it moves to [Stories: In-Scope][] or [Stories: Out-Of-Scope][].

#### U11. See when my keys hit a limit

_As a DFO user, I want to see when my keys hit a limit, so I can tell whether I need a higher limit or should slow my code down._

The usage bar ([U1][Seeing Usage]) shows how close a key is to its daily quota. It cannot show a per-minute refusal, which lasts a minute and is gone by the time anyone looks. Limit alerts list the minutes in which calls were refused.

- [ ] The panel lists limit alerts, newest first. Each row shows the minute (in the viewer's time zone), which limit was hit, the key (name and prefix) and how many calls were refused in that minute.
- [ ] The list covers the past day by default. A selector widens it to the past week or month.
- [ ] With no alerts in range, the list says so ("No limits hit in the past day").
- [ ] An alert for a key since deleted appears, marked as a deleted key.
- [ ] Only this account's keyed refusals appear. Anonymous refusals from the user's address never do.
- [ ] If an alert falls in the past hour, a banner at the top of the panel says which key hit which limit and how to ask for a higher one (support flow TBD).
- [ ] The list is read when the panel opens. Live updating is not required.

Status: not built.

**Cost/benefit.** The cost depends on where the alerts are read from:

- **Usage log lines.** `forward()` already logs each refused call with key id, account, surface and outcome `limited` ([design: Logs and Docs][design-logs]). Querying Cloud Logging from a page is slow, has its own quota, and needs the site to hold log-read rights.
- **Sentry (T2).** Grouping and sampling in T2 drop the per-minute counts this list needs.
- **A rollup table.** On each refused call, upsert a row (account, key, limit, minute, count) in Postgres, kept 30 days. Cheap to read, and bounded: at most one row per key and limit per minute. Costs a write on each 429, a migration, and a retention job.

The benefit is that users and admins (A1) can answer "was I throttled, and when?" without asking support. The usage bar covers the daily quota. Until keyed accounts hit limits often, the 429 response (U3) and T2 may be enough.

## Stories: Out-Of-Scope

Deliberately not part of this work. Some are listed in the design's [Future Features][design-future].

1. **Soft limits.** No warnings as an account approaches a limit, and no usage projections. The usage bar (U1) shows how close a key is to its daily quota but sends no warning.
2. **Fine-grained key permissions.** A key grants MCP access at the account's per-minute limit and its own daily quota. It is not scoped to datasets, tools or operations.
3. **Gating who may hold a key.** Any signed-in account can create and use keys up to the cap. No approval step, waitlist or eligibility check.
4. **Out-of-band alerting.** No email, Slack or other notification to a user or an admin when a limit is hit. Users learn from the MCP refusal (U3), on the site through the usage bar (U1) and, if it ships, limit alerts (U11); admins learn through Sentry (T2), which is not an alert routed to anyone.
5. **Detailed usage monitoring.** No graph of how much of the quota an account used over time, with a time-range selector (hour, day, week) and marks where limits were hit. Today's count against the daily quota is in scope (U1); history over days is not. This can be built later, on whatever store U11 settles on.
6. **Outreach to current users.** No flow to find current anonymous callers and encourage them onto keys. Keys are for prospective partners who want or need higher access, offered as we talk to them. No current caller is near a level we'd consider unsustainable, so nobody needs to be moved yet.
7. **Disabling a key.** Keys are created, rotated and deleted, nothing in between. A user who wants a key off deletes it and makes a new one later (U8).
8. **Keys on the API surface.** Keys apply to MCP only. A key sent to `/api/v1/*`, `/openapi.json` or `/codes` is ignored and the call is anonymous, with no per-key or per-account allowance there.

## Open Questions

- [ ] **Support flow for a higher limit.** A support email address, a page on the site, or a ticketing system? U3, U11 and the `/codes/rate_limited` page all link to it. (Also an open question in the [design][design-open].)
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
