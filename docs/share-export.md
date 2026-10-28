# Share export

`scripts/export-shares.ts` writes the website's shares as JSON lines, one share per line, and dfo-apis' `maintenance.py import-shares` reads them. The import keeps each 8-character id, so every `/s/<id>` and `/embed/<id>` link keeps working. The queries and the rule that places each share are in `db/share-export.ts`.

```
node scripts/export-shares.ts --since 2026-10-01T00:00:00Z --out shares.jsonl
```

The script reads the database from `DATABASE_URL`, or from the `WEBSITE_DB_*` Cloud SQL variables the runtime uses, and writes nothing to it. `--since` takes an ISO timestamp with a `Z` or `+hh:mm` offset and exports every share whose `created_at` is at or after it. Without `--out` the lines go to stdout. A count by kind and mode goes to stderr. A bad `--since` exits 2.

A share the script cannot place fails the run. The script prints `share <id>: <reason>` for each such share to stderr, exits 1, and writes no output, so a file on disk is always a whole export. Runs overlap safely, because the import is idempotent and a later run with an earlier `--since` writes the same lines for the same shares.

## Lines

Each line is one JSON object with these members, and lines are ordered by `created_at`, then by `id`.

- `id`: the share id, 8 characters from `[A-Za-z0-9]`, case-sensitive.
- `kind`: `search`, `conversation`, `canvas`, or `card`.
- `mode`: `live` or `snapshot`. A share stored with no mode gets the default the website applies: `live` for a search share (`searchShareMode` in `src/lib/chat/shareMode.ts`) and `snapshot` for the other kinds (`isLiveStudioShare`).
- `owner`: the website user id of the share's maker, or null for a guest's share. A guest's share imports with no write token, and nobody can change or delete it.
- `created_at`: the stored moment in UTC to the microsecond, as `2026-09-01T10:00:00.000001Z`.
- `title`: the stored title.
- `slots`: the data cards dfo-apis holds, in display order, each `{"component_id": "cmp_…", "revision": 3, "frame": {"spec_id": "spec_…" or "ops_…", "content_version": "…"}}`. `frame` is `null` when the stored card names no frame in that form, and the import reads the frame from the component revision. Only canvas and card shares have slots. Search and conversation shares have `[]`.
- `payload`: website-owned JSON that dfo-apis stores as given and does not read. It holds what the website needs to render the share beyond its slots.

## Where each stored share lands

| Stored share                            | `mode`     | `slots`                                                  | `payload`                                                           |
| --------------------------------------- | ---------- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| Search, mode `live` or null             | `live`     | `[]`                                                     | `query` and `parts`                                                 |
| Search, mode `snapshot`                 | `snapshot` | `[]`                                                     | `query` and `parts`, each part with its `content_version`           |
| Canvas or card, mode `live`             | `live`     | every data card on the canvas                            | the stored copy, slotted cards held                                 |
| Canvas or card, mode `snapshot` or null | `snapshot` | every data card on the canvas with a component reference | the stored copy, slotted cards held, the other data cards as stored |
| Conversation, mode `snapshot` or null   | `snapshot` | `[]`                                                     | the stored copy                                                     |

A search share's `query` is `share.data.query`, or the title when the row has none, as `getSearchShare` reads it. Its `parts` are the share's `share_ref` rows in `part_index` order, each with the members `part_index`, `spec_id`, `identity`, `entity_groups`, `variable_text`, `content_version`, `artifact_digest`, `operations`, and `assumptions`. A live search share's parts have null `content_version` and `artifact_digest` and replay their definitions. A snapshot made before the website stored `artifact_digest` has a null digest and keeps its `content_version`.

The stored copy of a canvas, card, or conversation share is its `share.data`, a pruned saved conversation (`pruneForShare` in `src/lib/chat/sharePrune.ts`), with `sessionId` set to null and `componentRefs` to `[]`, as every share read does. It keeps the layout, the user's text cards, the titles, notes and views by card id, the theme, pins and removals, and, for a conversation share, the messages.

## Slots

The data cards on a canvas are the cards `canvasWidgetsOf` (`src/lib/chat/canvas.ts`) shows, other than text cards, in that order: the stored `widgets` the canvas displays, in stored order. A card share holds one. A data card has a component reference when its `ref` names a component revision as `cmp_` plus up to 64 letters, digits, `_` or `-`, with a whole revision of 1 or more. Its slot's `frame` is the card's `frame` when that names a `spec_` or `ops_` frame with a non-empty content version, and `null` otherwise. `slotCanvas` in `src/lib/chat/sharePayload.ts` places the cards, for this export and for every share the website makes in dfo-apis.

Each such card becomes one slot. In the payload's `widgets` the card is held: it keeps `kind`, `id`, `turn`, and for a chart `chartType` and `horizontal`, and gains `slot`, the index of its slot in `slots`. Its numbers, title, source and description come from the slot's component revision. Two cards drawing the same revision get a slot each.

A snapshot's data card without a component reference, which includes every card stored before cards carried a `ref`, stays in `widgets` as stored, with the numbers it showed inline, and has no slot. Widgets the canvas does not show, such as removed cards and older turns' unpinned cards, stay in `widgets` with no slot, so the payload shows the same cards as the stored copy. In a snapshot they stay as stored. In a live share every data card is held, shown or not, because live share pages show none of the numbers stored with the share.

## Refused shares

The script refuses a share whose:

- id is not 8 letters and digits;
- kind is not one of the four;
- mode is set to a value other than `live` or `snapshot`;
- kind is `conversation` and mode is `live`;
- kind is `conversation`, `canvas`, or `card` and it has `share_ref` rows;
- data, for a canvas or card, lacks `widgets`, `pinnedIds`, or `removedIds` arrays;
- canvas or card is live and a data card on it has no component reference;
- search snapshot has a part with no `content_version`.

## Left out

`share_card_result` rows cache live refreshes, and dfo-apis refreshes live slots itself, so the export leaves them out. It leaves out the `conversation_id` and `card_id` columns too, because no share page reads them.

## Round trip on a local stack

`scripts/share-migration-round-trip.ts` runs the whole migration on a local website and the dfo-apis local stack. It makes two cards in dfo-apis on the stack's seeded readings, seeds one share per legacy case (a search share with no mode from a guest, a search snapshot, a canvas with no mode holding a card with no component reference, a live canvas holding a card with no frame, a live card, a guest's snapshot card with no component reference, and a conversation with no mode), and runs `export-shares`, dfo-apis' `import-shares` and `import-share-tokens`. It then renders `/s/<id>` and `/embed/<id>` of each share through the dev server and checks what each shows: a search share redirects to `/data?share=<id>` and reads back its mode, query and parts from `/api/share/<id>`, a slotted card draws its component revision, a card with no component reference and a conversation's cards show as stored, and each live slot draws its card from `/api/v1/presentation/shares/<id>/slots/<n>`. The owner signs in with a session row and switches their live canvas to snapshot with its imported token, and cannot delete a guest's share. Last, it runs both imports again and checks that dfo-apis holds the same shares and `share_token` the same tokens.

It needs the stack up and seeded (`just local-stack up` and `just local-stack seed` in dfo-apis), a migrated website database, and the dev server on that database in front of the stack, with the caller principal and HMAC key the stack uses:

```
docker run -d --rm --name website-db -e POSTGRES_PASSWORD=postgres -p 127.0.0.1:55433:5432 postgres:18
PGHOST=127.0.0.1 PGPORT=55433 node db/migrate-local.ts
export DATABASE_URL=postgresql://website_runtime:website_runtime_dev_password@127.0.0.1:55433/website
export BETTER_AUTH_SECRET=$(openssl rand -hex 32)
SEARCH_API_BASE=http://127.0.0.1:58083 BETTER_AUTH_URL=http://127.0.0.1:3000 \
  DFO_CALLER_PRINCIPAL=local-caller-principal CALLER_HMAC_KEY=local-caller-hmac-key \
  RATE_LIMIT_API=100000 pnpm dev -H 127.0.0.1 -p 3000 &
DFO_APIS_DIR=/path/to/dfo-apis node scripts/share-migration-round-trip.ts
```

The dev server runs on port 3000 because the stack's share links name `http://127.0.0.1:3000`. `WEBSITE_URL` points the script at another address. Each check prints one line, and the script exits 1 when any fails. Its shares, cards and rows stay in place under fresh ids, so it can run again on the same stack.
