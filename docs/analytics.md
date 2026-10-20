# Analytics and error monitoring

Usage events go to our own database, errors to Sentry, and page views to Google Analytics on production, behind the cookie banner.

## Usage events

The events DFO Overview asks for (Data access → "Events to record") land in the `event` table (`db/schema.ts`, migration `0006_events`): one row per event with a dotted `name`, the event's own `props` (JSONB), `user_id` when signed in, a random per-browser `visitor_id` (localStorage, no cookie) when the visitor has consented, and the `page`. No event holds an IP address or the text of a Studio prompt. The three search events hold the first 500 characters of the query.

The browser stores `visitor_id` only after the visitor accepts "DFO usage statistics" in the Analytics category of the cookie banner (Usercentrics service `L3eMCSMT3WELG7`, read through the CMP's `window.__ucCmp` API and `UC_CONSENT` event in `src/lib/consent.ts`). Until then, including while the banner is loading or blocked, events arrive with a null visitor id. Withdrawing consent deletes the stored id.

| Event | When | Props |
|---|---|---|
| `search.query` | a search settled with at least one resolved part, or a catalogue answer | `query` (its first 500 characters), `edited`, `kind` (`resolution` / `catalogue` / `declined`), `reason` (a declined answer's `out_of_scope` / `requires_analysis`, else null), `operations` (the operation verbs the question asked for), `resolved[]` (`specId`, `measure`, `filters` (each bound property's ref or refs; a set of more than three is `{sample, count}`), `entities` (per role: `group` (the named group's `dcid` and `label`, else null), `sample` (the first three member dcids), `count` (all members)), `window`, `facets`, `statVarCount`, `entityCount`, `sources` (source ids), `sourceCount`), `refused[]` (`variableText`, `status`, `reason`, `entityTerms` (the first three)), `truncated` (true when the event had to drop to its minimal form or floor to fit the cap) |
| `search.empty` | a search that answered nothing: no part resolved, or the question was declined | same shape, `resolved` empty — the data-gap signal |
| `search.studio_handoff` | a click on a Studio action on a search answer | same shape, plus `seeds` (the seeds handed to Studio, 0 when none could be stored) |
| `studio.prompt` | a prompt sent in the Studio | `turn`, `intent` (`new` / `follow_up` / `edit`), `length`, `guest` |
| `studio.card` | a card the harness put on the canvas | `kind`, `turn`, `source`, `indicators` (DCIDs), `years`, `unit` (in words with its magnitude and price basis, `US Dollar, millions, constant 2023 prices`; a composed unit as its numerator and denominator either side of "per", each part's magnitude and price basis in brackets beside it, `US Dollar per Total population` or `Euro (constant 2020 prices) per Total population`; a percentage as `Percent`; null when the card states none), `guest` |
| `studio.session_end` | New Chat, or the page is left | `turns`, `cards`, `pins`, `guest` |
| `auth.signin` | a provider callback ended in a session | `provider` |
| `guest.wall_hit` | a guest used up the free prompts | `prompts` |
| `feedback.submit` | a feedback submission | `kind` (`chat` / `widget`) |
| `embed.view` | an `/embed/<id>` page rendered | `shareId`, `kind` (`card` / `canvas` / `conversation`), `host` (the hostname of the page the iframe sits on, else null) |

Browser code calls `track()` from `src/lib/events/client.ts`, which posts to `POST /api/events` (allow-listed names, props capped at 8 KB, always 204); server code calls `track()` from `src/lib/events/track.ts` directly. The list of names lives in `track.ts` — add there first.

A resolved part records what the question asked for, and counts the StatVars and places it expanded to: an aid query expands to hundreds of each, which would pass the 8 KB cap. A role asked for as a named group, such as the European Union, records the group, three of its members and the member count. A set-valued filter with more than three refs records three and the count. `sources` lists every source id while the whole event fits the cap, and the first three per part when it does not; `sourceCount` is always the full number, so a list shorter than the count is a sample. If the event still exceeds the cap, each resolved part keeps only `specId`, `measure`, `statVarCount`, `entityCount`, `sourceCount` and the per-role place `count`, and the event carries `truncated: true`. If that form is still too large, the event ends on a fixed-size floor: an empty `query`, no refused parts, and per resolved part only a clipped `specId` and the integer counts. The ladder runs on the complete props, `seeds` included, and measures the JSON length as the route does; the API's limit of six parts bounds the floor.

The table is meant to be exported to BigQuery alongside the API usage log lines; until then it is plain SQL, e.g. the most-requested measures:

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

Embeds load neither Usercentrics nor GA. On an `/embed/` path (`isEmbedPath()` in `src/lib/embed.ts`) the root layout's inline loader skips injecting the Usercentrics script and `GoogleAnalytics` renders nothing, because a banner would cover the card and iframe storage is partitioned per host site, so a reader would be asked again on every partner site. The server counts each embed render as `embed.view` instead, with no visitor id, no user id and nothing stored on the device. The count is iframe loads, including crawlers that render a host page and direct opens of the embed URL. `host` keeps only the hostname of the `Referer` and is null when the host page's referrer policy strips it.

The "Privacy settings" button in the footer (`src/components/organisms/Footer/Footer.tsx`) calls `showPrivacySettings()` from `src/lib/consent.ts`, which opens the Usercentrics settings layer so a visitor can change either choice after the first banner.

Enhanced measurement records page views on App Router navigations (history changes), outbound clicks, scrolls, site search (`?q=`) and file downloads, so the site sends GA only its config call. The `track()` events above go to our own database alone.

To check it on production, open the network panel and filter on `google-analytics.com/g/collect`. Before consent the requests carry `gcs=G100`, and after accepting in the banner they carry `gcs=G111`. The visit then shows in GA under Reports → Realtime. Localhost and dev make no `gtag/js` request.

## Request log

The site writes one JSON line to stdout for each page view and API call, which Cloud Logging stores as a structured entry. `src/instrumentation.ts` registers `registerRequestLogging()` in `src/lib/proxy/requestLog.ts` at server startup. It observes Node's `http.server.request.start` diagnostic channel and reads the request's method, path, and headers. A request accepted during startup is logged when its response finishes, if it was not already logged at the start. Visitor counts come from this line, because Cloud Run's own request log records Cloudflare's edge address as the client.

```json
{"severity":"INFO","message":"request","caller":"ip:3f9c0a…","method":"GET","path":"/embed/abc123","host":"developmentfinance.org","kind":"page","userAgent":"Mozilla/5.0 …"}
```

`caller` is the same `ip:<digest>` the `/mcp` proxy sends upstream as `x-dfo-caller` (`src/lib/proxy/caller.ts`): an HMAC of the client address under `CALLER_HMAC_KEY`, with the address taken from `X-Forwarded-For` at the `TRUSTED_PROXY_HOPS` position. It is null when the key is unset or the request carries no usable address. `kind` is `page`, `api` (`/api` and `/mcp`), `rsc` (a client-side navigation) or `prefetch` (a Next.js or browser prefetch). Embeds under `/embed/` are logged as pages. `/_next/` files, images and fonts are not logged. The line holds no raw IP address, query string, cookie or `Authorization` header.

The diagnostic event carries `RSC` and `Next-Router-Prefetch` headers before Next.js normalises them. Logging leaves request bodies unread, so API and MCP payloads stream to their handlers in full. A Next.js proxy would buffer those bodies and truncate them at its default 10 MB limit.

## Guest Studio

The Studio is open without an account: `GUEST_LIMIT` (5, `src/components/organisms/Studio/GuestWall.tsx`) prompts, counted in localStorage, then the prompt is replaced by a sign-in wall. Front-end only by design — a cleared localStorage resets it. Guests get no history, saving or sharing (all need an account).
