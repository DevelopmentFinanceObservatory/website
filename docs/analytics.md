# Analytics and error monitoring

Usage events go to our own database, to Cloud Logging and to PostHog, errors to Sentry, and page views to Google Analytics on production, behind the cookie banner.

## Usage events

The events DFO Overview asks for (Data access → "Events to record") land in the `event` table (`db/schema.ts`, migration `0006_events`): one row per event with a dotted `name`, the event's own `props` (JSONB), `user_id` when signed in, a random per-browser `visitor_id` (localStorage, no cookie) when the visitor has consented, and the `page`. No event row holds an IP address or the text of a Studio prompt. The search events hold the first 500 characters of the query.

The browser stores `visitor_id` only after the visitor accepts "DFO usage statistics" in the Analytics category of the cookie banner (Usercentrics service `L3eMCSMT3WELG7`, read through the CMP's `window.__ucCmp` API and `UC_CONSENT` event in `src/lib/consent.ts`). Until then, including while the banner is loading or blocked, events arrive with a null visitor id. Withdrawing consent deletes the stored id.

| Event | When | Props |
|---|---|---|
| `search.query` | a base run settled with at least one resolved part, or a catalogue answer | the run fields and settle fields below, `query` (its first 500 characters), `kind` (`resolution` / `catalogue` / `declined`), `reason` (a declined answer's `out_of_scope` / `requires_analysis`, else null), `operations` (the operation verbs the question asked for), `resolved[]` (`specId`, `measure`, `filters` (each bound property's ref or refs; a set of more than three is `{sample, count}`), `entities` (per role: `group` (the named group's `dcid` and `label`, else null), `sample` (the first three member dcids), `count` (all members)), `window`, `facets`, `statVarCount`, `entityCount`, `sources` (source ids), `sourceCount`), `refused[]` (`variableText`, `status`, `reason`, `entityTerms` (the first three)), `truncated` (true when the event had to drop to its minimal form or floor to fit the cap) |
| `search.empty` | a base run that answered nothing: no part resolved, or the question was declined | same shape, `resolved` empty; the data-gap signal, though a run with `timedOut` true reads as empty for parts the deadline cut |
| `search.edit` | an edit post settled: a change to an answer, re-resolved | same shape as `search.query`, with `edited` true and `editKind` |
| `search.error` | a post failed | the run fields, `query`, `error` (the problem-details `code`, else the HTTP status, else `stream` for a stream that broke or closed without an answer), `status` (the HTTP status, when there was one) |
| `search.abandon` | a post left in flight: the page was hidden, a newer search or edit replaced it, the reader opened the starting point, the reader reset the page, or the reader went to another page of the site | the run fields, `reason` (`hidden` / `superseded` / `reset` / `left`), `step` (the last pipeline step reached, null on an edit post) |
| `search.start_point` | the starting point shown from the page's own catalogue, with no search call | `source` |
| `search.studio_handoff` | a click on a Studio action on a search answer | same shape, plus `seeds` (the seeds handed to Studio, 0 when none could be stored), `searchId` (absent on the starting point) and `traceId` |
| `search.action` | a visitor acted on the answer on screen | `searchId` and `traceId` (the search and the post whose answer was on screen when the visitor acted, read before a share or download request starts; null on the starting point), `action`, and per action: `pick_reading` (a reading card's "Use this reading") with `partIndex` and `specId`; `download` (the side panel's download reached its file) with `partIndex`, `specId`, `format` and `bundle`; `share` (a share link minted, the first time the Share box shows a tab) with `mode` (`live` / `snapshot`) and `shareId` |
| `studio.prompt` | a prompt sent in the Studio | `turn`, `intent` (`new` / `follow_up` / `edit`), `length`, `guest` |
| `studio.card` | a card the harness put on the canvas | `kind`, `turn`, `source`, `indicators` (DCIDs), `years`, `unit` (in words with its magnitude and price basis, `US Dollar, millions, constant 2023 prices`; a composed unit as its numerator and denominator either side of "per", each part's magnitude and price basis in brackets beside it, `US Dollar per Total population` or `Euro (constant 2020 prices) per Total population`; a percentage as `Percent`; null when the card states none), `guest` |
| `studio.session_end` | New Chat, or the page is left | `turns`, `cards`, `pins`, `guest` |
| `auth.signin` | a provider callback or an email code ended in a session | `provider` (`email` for a code) |
| `guest.wall_hit` | a guest used up the free prompts | `prompts` |
| `feedback.submit` | a feedback submission | `kind` (`chat` / `widget`) |
| `share.create` | a share link stored | `shareId`, `kind` (`conversation` / `canvas` / `card`, or `search` for a search result), `mode` (`live` / `snapshot`). A search share joins its `search.action` through `shareId` |
| `embed.view` | an `/embed/<id>` page rendered | `shareId`, `kind` (`card` / `canvas` / `conversation`), `host` (the hostname of the page the iframe sits on, else null) |
| `share.open` | an `/s/<id>` page loaded, for a Studio share and for a search share (which then redirects to `/data?share=<id>`) | `shareId`, `kind` (`conversation` / `canvas` / `card` / `search`), `mode` (`live` / `snapshot`), `host` (the hostname of the page the link was followed from, else null). Carries no visitor id and no user id; a search share's run on `/data` reports `source: 'share'` separately |
| `gallery.open` | a click, middle-click or Enter on a tile in the `/insights/gallery` grid | `slug` (the item's slug), `kind` (`conversation` / `canvas` / `card` / `dataset`) |

Every search post, the base run and each edit after it, ends on one terminal event: `search.query`, `search.empty`, `search.edit`, `search.error`, or a `superseded`, `reset` or `left` abandon. A page closed mid-post leaves only its `hidden` abandon. `useSearchRun` gives each post a tracker from `searchPostTracker()` in `src/lib/search/searchEvents.ts`, which sends only the first terminal event it is asked for. These run fields are on every one of them:

- `searchId`: a UUID minted when a search starts (a query, a permalink, a share or version link), kept by its edit posts.
- `post`: 0 for the base run, then 1, 2, … for each edit post of the same search.
- `source`: where the search came from: `typed`, `example` (a suggestion or example chip), `catalogue` (the starting point), `refine`, `retry`, `permalink` (a shared or bookmarked `?q=` link), `share` (`/s/<id>`) or `version_link` (`?spec=`). A search typed or picked on the homepage reaches `/data` with `?q=` and keeps `typed` or `example`.
- `edited` (true from post 1) and `editKind` (`slot`, `entity`, `window`, `facet`, `pick`, `measure`, `parsed`, `shared`, or `replay` for a permalink's stored edits).
- `traceId`: the engine's trace id, the `trace_id` on the dfo-apis `resolve` log line, null when the post ended before the engine answered.
- `ms`: client time from the post's start to the event.
- `hidden`: true when the page was hidden while the post was in flight.

A settled post adds `outcome` (a resolution's `status`, `definite` / `candidates` / `no_data` / `unsupported` / `mixed`, else `catalogue` or `declined`), `engineMs` (the engine's `done.elapsed_ms`), `byStep` (the engine's per-step timings) and `timedOut` (the engine's soft deadline cut the run short).

A post sends `search.abandon` with reason `hidden` the first time the page is hidden while it is in flight. Background tabs keep streaming, so the post usually settles later, with `hidden: true`. A post still in flight when the reader goes to another page of the site ends on a `left` abandon, and its stream is aborted. A true abandon, a page closed with the post in flight, is a `hidden` abandon with no terminal event for the same `(searchId, post)`: no settle, no error, and no `superseded`, `reset` or `left` abandon. The tracker sends `hidden` only before the post ends, so any such event came after it:

```sql
select a.props->>'searchId', a.props->>'post' from event a
where a.name = 'search.abandon' and a.props->>'reason' = 'hidden'
  and not exists (
    select 1 from event t
    where (t.name in ('search.query', 'search.empty', 'search.edit', 'search.error')
           or (t.name = 'search.abandon' and t.props->>'reason' <> 'hidden'))
      and t.props->>'searchId' = a.props->>'searchId' and t.props->>'post' = a.props->>'post');
```

Browser code calls `track()` from `src/lib/events/client.ts`, which posts to `POST /api/events` (allow-listed names, props capped at 8 KB, always 204); server code calls `track()` from `src/lib/events/track.ts` directly. The list of names lives in `track.ts` — add there first.

When `POSTHOG_KEY` and `POSTHOG_HOST` are set, `track()` also forwards each event server-side to PostHog (EU cloud) through `sendEventToPosthog()` in `src/lib/events/posthog.ts`. The event keeps its props, minus any key starting with `$`, and adds `environment`, `page`, `signed_in` and `country`. Its `distinct_id` is the visitor id for a consented visitor, else the account id for a signed-in one. An event with neither gets a fresh random UUID and `$process_person_profile: false`, so PostHog creates no person for it. Each event carries the browser request's `User-Agent` as `$raw_user_agent`, which PostHog's bot filter reads. `country` is the two-letter code Cloudflare puts in the `CF-IPCountry` header, or null when Cloudflare has no location (`XX`) or the visitor uses Tor (`T1`). Every event sets `$geoip_disable: true`, because PostHog would otherwise place it at the Cloud Run server, and no event carries the visitor's IP. All six server callers pass the browser request's headers: `POST /api/events`, feedback, shares (Studio and search), share page loads, embed renders and the sign-in callback. An event with no request behind it passes `headers: null` and carries no user agent and a null `country`.

`track()` also writes each event as one JSON line on stdout, through `logEvent()` in `src/lib/events/eventLog.ts`, before the database insert and the PostHog forward, so the line exists whether either of them fails. Cloud Logging stores it as a structured entry with `jsonPayload.message = "event"`: `{severity: "INFO", message: "event", name, props, page, signedIn}`. Its `page` is the path alone, with any query string or fragment dropped, as on the request log line; the table and PostHog keep `page` as sent. The line holds the event's full props, including the clipped query text of the search events, and keeps it as long as the log bucket's retention. It holds no `userId` and no `visitorId`: `signedIn` says only whether a user was signed in. A search event's `traceId` prop is the `trace_id` on the dfo-apis `resolve` log line, so the two join on it in SQL once the log bucket is linked to BigQuery.

A resolved part records what the question asked for, and counts the StatVars and places it expanded to: an aid query expands to hundreds of each, which would pass the 8 KB cap. A role asked for as a named group, such as the European Union, records the group, three of its members and the member count. A set-valued filter with more than three refs records three and the count. `sources` lists every source id while the whole event fits the cap, and the first three per part when it does not; `sourceCount` is always the full number, so a list shorter than the count is a sample. The run and settle fields stay on every form, and the floor drops only `byStep`. If the event still exceeds the cap, each resolved part keeps only `specId`, `measure`, `statVarCount`, `entityCount`, `sourceCount` and the per-role place `count`, and the event carries `truncated: true`. If that form is still too large, the event ends on a fixed-size floor: an empty `query`, no refused parts, and per resolved part only a clipped `specId` and the integer counts. The ladder runs on the complete props, `seeds` included, and measures the JSON length as the route does; the API's limit of six parts bounds the floor.

In production the `dfo-prod-website-export` Cloud Run Job (`db/export-events.ts`) copies the table every hour into the BigQuery table `event` in the `website_export` dataset, one partition per UTC day of `created_at`. Each run replaces every day from the latest loaded day minus one through today. The copy hashes `visitor_id`, `user_id` and the `shareId` prop, keeps `page` only as a site path without its query string and with share ids written `:id`, and keeps only the props `PROP_RULES` in `db/event-export.ts` allows, so it holds no search text. `deploy/README.md` ("Event export") has the schema. Questions about the text itself stay in Postgres, e.g. the most-requested measures:

```sql
select r->'measure' as measure, count(*) from event, jsonb_array_elements(props->'resolved') r
where name = 'search.query' group by 1 order by 2 desc limit 20;
```

## Sentry

`@sentry/nextjs` on both sides: `instrumentation-client.ts` (browser), `sentry.server.config.ts` / `sentry.edge.config.ts` loaded from `src/instrumentation.ts`, `src/app/global-error.tsx` for a crash in the root layout. Everything is off without `NEXT_PUBLIC_SENTRY_DSN`. `sendDefaultPii` is false and there is no session replay, so it needs no cookie consent.

Browser reports go through `POST /api/monitoring`, our own same-origin tunnel (past ad blockers). It is our route rather than the plugin's `tunnelRoute` rewrite because a rewrite forwards request headers, and behind HTTP Basic auth the browser's `Authorization` header makes Sentry reject every envelope with 400.

Source maps upload during `next build` when `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_AUTH_TOKEN` are set; without them the build just skips the upload.

## Google Analytics

`src/components/atoms/GoogleAnalytics/GoogleAnalytics.tsx` loads GA4 (measurement ID `G-NCWQ8XTXG1`) from the root layout when the page is served from `developmentfinance.org` or `www.developmentfinance.org`. The check reads the host name because dev and production build the same Dockerfile with the same build-time variables. The ID and the host list are constants at the top of that file.

Consent Mode v2 runs in advanced mode. An inline script in `src/app/layout.tsx` sets every consent type to `denied` on every host, ahead of the Usercentrics loader, and GA sends cookieless pings until the visitor chooses. Usercentrics has Google Consent Mode on and a "Google Analytics 4" service, and sends the `consent update` when the visitor chooses.

Embeds load neither Usercentrics nor GA. On an `/embed/` path (`isEmbedPath()` in `src/lib/embed.ts`) the root layout's inline loader skips injecting the Usercentrics script and `GoogleAnalytics` renders nothing, because a banner would cover the card and iframe storage is partitioned per host site, so a reader would be asked again on every partner site. The server counts each embed render as `embed.view` instead, and each share page load as `share.open`, both with no visitor id, no user id and nothing stored on the device. The count is iframe loads, including crawlers that render a host page and direct opens of the embed URL. `host` keeps only the hostname of the `Referer` and is null when the host page's referrer policy strips it.

The "Privacy settings" button in the footer (`src/components/organisms/Footer/Footer.tsx`) calls `showPrivacySettings()` from `src/lib/consent.ts`, which opens the Usercentrics settings layer so a visitor can change either choice after the first banner.

Enhanced measurement records page views on App Router navigations (history changes), outbound clicks, scrolls, site search (`?q=`) and file downloads, so the site sends GA only its config call. The `track()` events above go to our own database, Cloud Logging and PostHog; GA receives none of them.

To check it on production, open the network panel and filter on `google-analytics.com/g/collect`. Before consent the requests carry `gcs=G100`, and after accepting in the banner they carry `gcs=G111`. The visit then shows in GA under Reports → Realtime. Localhost and dev make no `gtag/js` request.

## Request log

The site writes one JSON line to stdout for each page view and API call, which Cloud Logging stores as a structured entry. `src/instrumentation.ts` registers `registerRequestLogging()` in `src/lib/proxy/requestLog.ts` at server startup. It observes Node's `http.server.request.start` diagnostic channel and reads the request's method, path, and headers. A request accepted during startup is logged when its response finishes, if it was not already logged at the start. Visitor counts come from this line, because Cloud Run's own request log records Cloudflare's edge address as the client.

```json
{"severity":"INFO","message":"request","caller":"ip:3f9c0a…","method":"GET","path":"/embed/abc123","host":"developmentfinance.org","kind":"page","userAgent":"Mozilla/5.0 …"}
```

`caller` is the same `ip:<digest>` the `/mcp` proxy sends upstream as `x-dfo-caller` (`src/lib/proxy/caller.ts`): an HMAC of the client address under `CALLER_HMAC_KEY`, with the address taken from `X-Forwarded-For` at the `TRUSTED_PROXY_HOPS` position. It is null when the key is unset or the request carries no usable address. `kind` is `page`, `api` (`/api` and `/mcp`), `rsc` (a client-side navigation) or `prefetch` (a Next.js or browser prefetch). Embeds under `/embed/` are logged as pages. `/_next/` files, images and fonts are not logged. The line holds no raw IP address, query string, cookie or `Authorization` header.

The diagnostic event carries `RSC` and `Next-Router-Prefetch` headers before Next.js normalises them. Logging leaves request bodies unread, so API and MCP payloads stream to their handlers in full. A Next.js proxy would buffer those bodies and truncate them at its default 10 MB limit.

## Studio prompt allowance

A Studio prompt is one turn (`POST /api/studio/turn`). The proxy atomically reserves one from the caller's daily allowance before it forwards the turn (`src/lib/studio/spendPrompt.ts`). Refused requests consume no allowance. A guest gets 5 a day per network address, an IPv6 address counted by its /64, so guests behind one shared address share them. A signed-in user gets 75 a day, counted per inbox: the address lower-cased, without a `+tag` and, for Gmail, without dots (`inboxOf` in `src/lib/auth/inbox.ts`). An email code makes a separate account for each spelling of one address, and those accounts share the 75. Both reset at 00:00 UTC. The numbers live in `src/lib/studio/promptAllowance.ts` and the counts in the `limit_counter` table. A turn past its allowance gets a 429 `resource_exhausted`, whose detail the chat shows as the reply. Allowance and rate-limit queries use a separate two-connection pool with a 400 ms database statement limit, a 500 ms client query limit, and a 2 s connection limit, so they cannot occupy the pool used for sessions and history. An allowance that cannot be read gets a 503. A turn the harness answers with anything but success gives its reservation back in its original counter window, since no model ran. The proxy forwards only the four routes the browser calls (`turn`, `interrupt`, `cancel`, `composition`) and answers 404 to any other path, so no encoding of a path reaches the turn route without spending a prompt.

The browser also counts a guest's prompts in localStorage and replaces the prompt with a sign-in wall at 5. Clearing it brings the prompt back but not the allowance. Guests get no history or saving (both need an account). A guest can make snapshot shares, up to 10 a day per network address (`GUEST_SHARES` in `src/lib/chat/shareMode.ts`). Those shares have no owner, so nobody can switch or remove them.

In local dev every guest comes from the same address and so shares one allowance. Sign in, or delete the `studio-guest:` rows from `limit_counter`.
