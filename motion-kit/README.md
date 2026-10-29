# motion-kit

motion-kit renders the DFO Studio workspace, and captures any other page of the site, as static HTML and CSS for Claude Motion. A Motion film is a 1920×1080 sandboxed stage that builds its DOM from text modules and animates it as a function of time, with no React, no `<script>` and no external URLs. motion-kit turns the Studio's own components into markup and compiled CSS the film can hold, so a demo shows the real interface rather than a redrawing of it.

A demo is a JSON spec: the conversation, the plan, the activity and the cards. The generator is the same for every demo.

## Command

```sh
pnpm motion-kit motion-kit/demos/kenya-debt-health.json
pnpm motion-kit path/to/spec.json --out some/dir
```

Output goes to `motion-kit/dist/<spec name>/` unless `--out` names a directory. Each run replaces that directory, and refuses one that holds files but no `manifest.json`, so `--out` cannot wipe a folder of specs. `dist/` is ignored by git. The run takes about three seconds. It reads the app's motion in Google Chrome, found as the page capture finds it (`CHROMIUM_PATH` or the installed Chrome), and fails without one.

## The demo spec

The types live in `motion-kit/spec.ts` and reuse the app's own: `Widget` from `src/lib/chat/widgets.ts`, `ChatMessage` and `PlanState` from `useChat.ts`, `ActivityEntry` from `src/lib/studio/activity.ts`.

| Field      | Meaning                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`    | The conversation title in the tools row.                                                                                                                                                                            |
| `question` | The prompt the film types into the chat input. It is also copied to the manifest.                                                                                                                                   |
| `messages` | The transcript, as `ChatMessage` values. A bot message needs text, follow-ups, chips or a plan. One bot message may carry `plan`, the `ApprovedPlan` the user approved for that answer, shown as the pill under it. |
| `plan`     | Optional. The plan awaiting approval as useChat holds it, a `PlanState`: the plan card with its ledger of choices and, when `live`, the approve bar, in the chat foot.                                              |
| `activity` | Optional. The Activity tab's turns.                                                                                                                                                                                 |
| `cards`    | Each card's `widget` and its `slot`: `col` and `row` in grid cells, whole numbers from 0, and optional `w` and `h`, whole numbers from 1.                                                                           |
| `viewport` | Optional. CSS px at a 16 px root; 1280×800 when absent. At least 660 px wide: below that the Studio takes its phone layout, which the generator does not render.                                                    |

A slot without `w` or `h` takes the span the Studio gives a fresh card of that kind (`spawnSpan` in `canvas/layout.ts`). A chart's spawn height is an estimate, so give a chart card the `h` the Studio settles on: the Kenya chart is 24×21. Card ids must be letters, digits, `_` or `-`, since they name hooks.

Every card belongs to the turn of the last bot message, so each bot message of that turn lists the cards as chips, as the Studio does.

`motion-kit/demos/kenya-debt-health.json` is the worked example: Kenya's external debt service against health aid, including HIV, from 2015 to 2024, with two stat cards, a line chart, a plan with two scope choices and one planner decision, and the same plan approved under the answer.

### The plan's two states

The film shows the plan awaiting approval and then approved. In the Studio these are two renders of `ChatPanel`: while `chat.plan` is set, `PlanCard` and its `PlanApproveBar` sit in the chat foot and the input reads "Propose changes or ask a follow up..."; once the user approves, `chat.plan` is null and the answer the approval resumed carries the plan, which `ChatMessage` shows as `ApprovedPlanPill` under the answer's card chips. Neither render depends on the other, so the fragment holds both: the plan card and bar in the foot and the pill under its answer. The manifest's `states` names the hooks of each, and the attributes that change once the plan is approved:

```json
"states": {
    "pending": { "hooks": ["plan", "plan-bar", "plan-approve"] },
    "approved": {
        "hooks": ["plan-pill"],
        "attrs": { "prompt": { "placeholder": "Ask a follow up...", "aria-label": "Ask a follow up" } }
    }
}
```

A film shows one state by hiding the other's hooks. The chat foot loses the card's height when its hooks are hidden with `display: none` or folded by a `hide` cue, as it does in the Studio.

### The cue sheet

A demo's camera keys and cues live beside its spec as `<spec name>.cues.json` (`kenya-debt-health.cues.json`). The generator copies it into the output as `cues.json`, and fails, listing every problem, when:

- a cue or key names a hook the fragment lacks, in `v`, `from`, `points` or a key's `hook`, or a cue's `sel` finds nothing inside its hook;
- an `animate` cue plays keyframes the render lacks, animates a hook the app does not animate, or names both a hook and keyframes;
- a `state` cue switches to a state the manifest lacks, a `tab` cue has no `from`, or a `type` cue has no `text`;
- a cue's `kind` is not one of `show`, `pop`, `stream`, `draw`, `type`, `press`, `hide`, `remove`, `tab`, `animate` and `state`, or it has no `at`;
- a number field (`dur`, `dy`, `wps`, `cps`, `clearAt`, a key's `z`, `hold`, `cx`, `cy` or `from`) holds anything but a number, or `drift` is not three numbers;
- a key's `t` does not come after the key before it. A spec without a cue sheet renders without one.

A camera key is `{ "t": 5.4, "hook": "msg-1", "z": 1.7, "hold": 3 }`: at `t` s the view centres on the hook, or on `cx` and `cy` in stage px, at zoom `z`, measured as the layout stands at `t`, and stays for `hold` s before easing to the next key. `drift: [dx, dy, dz]` moves the resting view per second, and `from` starts the move to this key at that time. A sheet with no keys holds the whole stage in view.

| Kind      | Does                                                                                                    | Fields                        |
| --------- | ------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `show`    | Shows the element at `at`, out of the layout before. With `dur` over 0 it fades and rises `dy` px.      | `dur` (0.4), `dy` (10)        |
| `pop`     | Shows it with a scale-up. For overlays of the film's own; product cards use `animate`.                  | `dur` (0.45)                  |
| `stream`  | Shows its text word by word, each word taking room as it lands.                                         | `wps` (9)                     |
| `draw`    | Draws an SVG path, a chart series, along its length; `points` names the series' dots, shown at the end. | `dur` (1.6), `points`         |
| `type`    | Types `text` into a field, which grows as `PromptForm`'s does, and empties it at `clearAt`.             | `text`, `cps` (24), `clearAt` |
| `press`   | Presses a button.                                                                                       |                               |
| `remove`  | Takes the element out at once, as the app unmounts it.                                                  |                               |
| `hide`    | Fades the element and folds its height. For overlays of the film's own.                                 | `dur` (0.4)                   |
| `tab`     | Switches the chat panel to the view `v` from the view `from`. Studio only.                              | `from`                        |
| `animate` | Plays the app's own animations on `v` (or `sel` inside it), or every one with the keyframes `name`.     | `name`                        |
| `state`   | Sets the attributes of the manifest state `to`, such as the prompt's placeholder after approval.        | `to`                          |

A page capture takes a cue sheet the same way, `<page spec name>.cues.json`, checked against the page's hooks. It has no app motion or states, so the generator refuses `animate`, `state` and `tab` cues. A film mounts one captured state per scene, so a cue or key that belongs to one state names it in `in` (`"in": "results"`) and plays only there; one without `in` plays in every state. The generator checks each cue's hooks against the states it plays in, from the manifest's `boxes`. A cue's `sel` inside a captured hook is checked when the film mounts, so an error shows in the preview.

## Outputs

| File                        | Contents                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `studio.html`               | One fragment: the header, the tools row, the chat panel and the whiteboard with every card placed, inside `<div class="dfo-ui">`.                      |
| `dfo-ui.css`                | Everything the fragment needs, scoped under `.dfo-ui`. Split into `dfo-ui.css~1`, `dfo-ui.css~2` and so on when its store document would pass 200 KiB. |
| `manifest.json`             | The viewport, the hooks, the plan's states, card slots in cells and px, each chart's series with its path length, and the app's motion (below).        |
| `cues.json`                 | The cue sheet, when the spec has one.                                                                                                                  |
| `shared.js`                 | The runtime, `runtime/dfo-motion.js`, which Motion runs once before any scene.                                                                         |
| `store/modules/<file>.json` | Each file above as a Motion store document, `{"kind": "css" \| "html" \| "json" \| "js", "text": "…"}`, ready to send.                                 |
| `preview.html`              | The film played in a browser, outside Motion (below). Not a module.                                                                                    |

## Preview

Every run writes `preview.html` beside the modules: one page with every module inline, opened straight from disk.

```sh
open motion-kit/dist/kenya-debt-health/preview.html
```

The page mounts the film with `shared.js` in a stand-in for Motion's stage and plays the cue sheet from 0 to the runtime's `end`, when the last cue finishes or the last camera hold ends, with a play button and a scrubber. `?t=9.5` opens it at 9.5 s; a page capture has a menu of its states, and `?state=typed` opens one. A runtime error shows above the stage. The stand-in implements the part of Motion's `kit` the runtime calls (`preview.ts`), so a scene's own timing and Motion's export are untested here: check the published film in Motion before sharing it.

### Hooks

Elements an animation drives carry a `data-v` attribute. The manifest's `hooks` lists every one in the fragment.

| Hook                         | Element                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat`                       | The chat panel.                                                                                                                                                               |
| `view-chat`, `view-activity` | The panel's two stacked views. The visible one has the class in the manifest's `classes.viewActive`.                                                                          |
| `msg-<i>`                    | Message `i` of the spec's `messages`.                                                                                                                                         |
| `prompt`, `send`             | The chat input's text field and its send button.                                                                                                                              |
| `plan`                       | The plan card awaiting approval, when the spec has a `plan`.                                                                                                                  |
| `plan-bar`, `plan-approve`   | The "Start building?" bar under the plan card, and its Approve button, when the plan is `live`.                                                                               |
| `plan-pill`                  | The approved plan's pill under its answer, when a bot message carries a `plan`.                                                                                               |
| `activity-<i>`               | Turn `i` of the spec's `activity`.                                                                                                                                            |
| `activity-<i>-<j>`           | The `j`th step line shown in that turn. The Studio folds finished steps behind "Show N completed steps", so only steps still pending or running, and failed ones, have lines. |
| `canvas`                     | The whiteboard's scrolling box.                                                                                                                                               |
| `card-<id>`                  | A card's slot. Its manifest entry has `col`, `row`, `w`, `h` in cells and `x`, `y`, `width`, `height` in px from the sheet's top-left corner.                                 |
| `series-<id>-<i>`            | Series `i` of a chart card: the line's path, or the group of a series' bars. The manifest gives a line's `length` for a draw-on.                                              |
| `points-<id>-<i>`            | The dots of a line's values that have a gap on both sides, when there are any.                                                                                                |

### The app's motion

The film's stylesheet has no motion, but the manifest keeps the app's own, read in Chrome from the fragment under the stylesheet with its motion left in (`motion.ts`), so custom properties, the `animation` and `transition` shorthands and the cascade resolve as in the Studio. An element is named by its hook as `{ "v": "card-x" }`, by a path inside the nearest hook as `{ "v": "msg-1", "sel": "> div:nth-child(3) > button:nth-child(1)" }`, or, with no hook above it, by a path from the fragment's root as `{ "sel": ".dfo-ui > section:nth-child(1) > …" }`; the runtime's `q(v, sel)` reads the first two.

- `animations`: every element, and `::before` or `::after`, whose `animation-name` is not `none`, one entry per animation: `name`, `duration` and `delay` in seconds, `timing`, `iterations` (a number or `"infinite"`), `fill` and `direction`.
- `keyframes`: each animation's keyframes by name, as `{ "offset": 0–1, "style": { property: value } }` steps with the declared values, `rem` already in px.
- `transitions`: by toggle, `.<class>` or `[attribute="value"]`, the elements a toggle changes and how they ease there: `toggle` (`add`, `remove` or `set`), the element toggled (`on`), the element that moves (`element`) and its `properties`, each with `duration`, `timing` and `delay` in the state the toggle lands in. A class toggle is a class a component adds beside one of the element's own classes in a `classNames(…)` call (`stateClasses.ts`); an attribute toggle is a `data-*` or `aria-*` value the stylesheet tests for, or another element carries. A toggle is listed only where it changes the computed value of a property the element transitions.

For Kenya the manifest holds these animations, all running once:

| Keyframes                         | Duration | Delay             | Fill        | Elements                                           |
| --------------------------------- | -------- | ----------------- | ----------- | -------------------------------------------------- |
| `Studio_module_board-in`          | 0.35 s   | 0.45 s            | `backwards` | `canvas`                                           |
| `Studio_module_bar-in`            | 0.4 s    | 0.5, 0.57, 0.64 s | `both`      | The header's New Chat, Customize and Share buttons |
| `WorkspaceToolbar_module_ws-rise` | 0.5 s    | 0.4, 0.5, 0.55 s  | `both`      | The tools row's chat tabs, title and card tabs     |
| `ChatPanel_module_chat-in`        | 0.65 s   | 0.25 s            | `backwards` | `chat`                                             |
| `Card_module_widget-in`           | 0.45 s   | 0                 | `both`      | Each card's `article`, inside `card-<id>`          |

The plan card has no entrance or exit keyframes of its own, and the status line's `status-shimmer` is absent because the fragment renders no turn in progress. Its transitions include the tab switch (`.ChatPanel_module_viewActive`: opacity 0.3 s and translate 0.35 s), the chat collapse (`.ChatPanel_module_chatHidden`: translate and opacity, 0.9 s after 0.1 s), the segmented tabs (`[data-active="true"]`: colour 0.3 s), the plan's steps dimming while a switch runs (`.PlanCard_module_dim`: opacity 0.25 s) and a card chip opening (`.WidgetChips_module_chipOpen`).

Every keyframe in the Kenya render animates `opacity` and `translate` only. `ChatPanel_module_chat-in` starts at `translate: calc(-100% - var(--page-gutter, 32px)) 0`, a share of the panel's own width. Of the keyframes in the bundle, two animate another property, `background-position`: `ChatPanel_module_status-shimmer` (the status line's sweep) and `LivePlaceholder_module_bone-sweep` (a loading card's skeleton). `PlanLedger_module_spin` turns with `rotate`, and `Header_module_menu-in`, `AccountMenu_module_account-in` and `ChatPanel_module_thinking-pulse` use `scale`.

## How the fragment is made

`build.ts` bundles `render.tsx` with esbuild for Node, resolving imports as the app's build does: `*.module.scss` through Sass and esbuild's CSS modules, `*.svg` through SVGR with `svgo.config.cjs`, `@/` to `src/`, and stubs for `next/navigation`, `next/link` and `server-only`. `render.tsx` renders with `renderToStaticMarkup`.

`Studio.tsx` and `Whiteboard.tsx` fill themselves from effects, so `render.tsx` rebuilds their skeleton with the same classes and slot geometry and renders the app's components inside it: `Header`, `WorkspaceToolbar`, `ChatPanel` with a plain object in place of `useChat` (so `PlanCard`, `PlanLedger`, `PlanApproveBar` and `ApprovedPlanPill` render as the Studio renders them), and `CardBody`, `CardHead` and `CardChrome` for the cards. It renders the workspace a second time without the pending plan to read what the chat input says once the plan is approved.

A chart card keeps `ChartCard`'s DOM, but its canvas becomes an inline SVG. `chart.tsx` runs Chart.js in Node with the app's `buildChartOptions` and the datasets from `canvas/chart/chartDatasets.ts`, against a 2D context (`recorder.ts`) that records every path and piece of text instead of painting. Shapes become SVG paths; text becomes absolutely placed HTML, since the film animates words as HTML. Text is measured with Outfit's advance widths, read from the `@fontsource/outfit` WOFF files (`fontMetrics.ts`), so the axes take the room they take in the browser; `parseFont` reads every canvas font string, with or without a style word, for both the measuring and the HTML labels. A ranking (horizontal bars) is drawn again until the value axis it reports gives back the height it was drawn at, where the Studio's measuring stops, and the generator fails if that takes more than ten draws.

`css.ts` then compiles `src/styles/main.scss` without its fluid root size, adds the CSS of every module in the bundle, and:

- removes `@keyframes`, `@font-face` and every `animation` and `transition` declaration, which leaves each element in its resting state (with `keepMotion`, the copy Chrome reads the motion from, only `@font-face` goes);
- decides each media query at the viewport and keeps or drops its rules: `all` and `screen` match, `print` does not, and `and`, `or` and `not (…)` combine features; it fails on any other media type, a feature it has no rule for, nested parentheses, or `and` mixed with `or`;
- converts `rem` at 16 px and viewport units at the viewport to px;
- scopes every selector under `.dfo-ui`, with `:root`, `html` and `body` becoming the wrapper;
- points `--font-outfit` and `--font-dm-mono` at the film's `--sans` and `--mono`, falling back to Outfit and DM Mono by name.

The generator fails if the CSS keeps a URL that is not a `data:` URL (in `url()` or a quoted `@import`), if the fragment holds anything a film cannot hold (the check page captures run, below; its links point at `#`), if a hook the spec calls for (the chat, prompt and send button, each message, plan state, activity turn, card and chart series) is missing or doubled, or if a module's store document, its text as JSON with its kind, passes 200 KiB.

## After a UI change

Run the command again. The fragment comes from the components, the CSS from the SCSS and the charts from `buildChartOptions` and `chartDatasets.ts`, so a change there reaches the next run with no edit here. Check the result in a browser, then run `pnpm test`: `motion-kit/test/motion-kit.test.ts` checks the chart axes and ranking labels, what the modules may hold, the plan states and motion read from the Kenya render, and the spec, cue sheet, selector and unit rules.

Edit `render.tsx` when `Studio.tsx` or `Whiteboard.tsx` change their own markup (the skeleton and slot classes), when `ChatPanel` or a card component takes new props or `useChat` returns new fields, or when a component starts to show a state that it only sets in an effect.

## Where the fragment differs from the live Studio

- A chart's plot is drawn at the 16:9 box `plotHeight` gives its width. The Studio measures the card's title, legend and source line and fits the card to them; the fragment lets a chart card grow past its slot instead, so give the slot the height the Studio settles on.
- The transcript opens at its top. The Studio scrolls it to the latest message.
- The toolbar's active tabs are painted directly. The Studio measures the active tab and slides an indicator under it.
- Activity clock times are UTC, so the markup is the same on every machine.
- Chart text is measured without kerning, a fraction of a px wider than the browser's measurement.
- Both plan states are in the markup at once. The chat input's placeholder is the pending plan's ("Propose changes or ask a follow up..."); the manifest's `states.approved.attrs` gives the one to set once the plan is approved.
- The answer the approval resumed holds its whole text while the plan still waits, where the Studio's transcript has an empty bot message until the answer streams in. A film hides the text until its `stream` cue.
- A chart card's plot is `plotHeight` tall, where the Studio's plot box is the card's whole cells less its chrome, a few px taller.

## Page capture

The Studio is rendered from its components. Every other page of the site, whose content is real site data (search answers, source pages, docs, the homepage, the tools pages), is captured from the running site instead:

```sh
pnpm dev --port 3100
pnpm motion-kit capture motion-kit/pages/kenya-debt-search.json --base http://localhost:3100
pnpm motion-kit capture path/to/page.json --out some/dir
```

`--base` defaults to `http://localhost:3000`. Output goes to `motion-kit/dist/<spec file name>/` unless `--out` names a directory, which is replaced as for the Studio. The capture drives Google Chrome through `playwright-core` and never downloads a browser: it uses the installed Chrome, or the Chrome or Chromium executable that `CHROMIUM_PATH` names. A search answer can take up to two minutes to stream in, so a step waits up to three minutes for its element.

### The page spec

The types are `PageSpec`, `PageHook` and `PageStep` in `motion-kit/spec.ts`, and `readPageSpec` checks a spec before the browser starts.

| Field      | Meaning                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `name`     | Letters, digits, `_` or `-`.                                                                                            |
| `path`     | The route and its query, such as `/data?q=External+debt+of+Kenya`.                                                      |
| `viewport` | Optional. CSS px; 1280×800 when absent.                                                                                 |
| `hooks`    | Optional. `{ "v": "prompt", "selector": "textarea" }` stamps `data-v="prompt"` on the one element a CSS selector finds. |
| `steps`    | Optional. What the browser does, in order, with a `capture` step wherever a state is wanted.                            |

| Step                               | Does                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `{ type: "click", selector }`      | Clicks the element. `hover` and `focus` take the same shape.                     |
| `{ type: "type", selector, text }` | Types the text into the element, key by key.                                     |
| `{ type: "press", key }`           | Presses a key, such as `Enter` or `Tab`.                                         |
| `{ type: "wait", selector?, ms? }` | Waits for the element to show, then for `ms`. Needs one of the two.              |
| `{ type: "scroll", selector?, y }` | Scrolls the element, or the window when there is no selector, to `y` px.         |
| `{ type: "capture", state }`       | Snapshots the page as the state `state`: letters, digits, `_` or `-`, used once. |

A spec with no `capture` step captures once at the end, as `page`. Step selectors are Playwright selectors, so `text=Rows in your data` and `a:has-text("(IDS)")` work, and a click fails when its selector finds more than one element. Hook selectors are plain CSS. A hook may be absent from some states (a search's answer is absent before the search), but the capture fails when its selector finds two elements in any state or nothing in every state.

`motion-kit/pages/kenya-debt-search.json` captures the data search empty, with "External debt of Kenya" typed and its candidate shown, and with the answer. `motion-kit/pages/ids-source.json` opens that answer's "About this answer" panel, follows its link to the World Bank International Debt Statistics source page, and captures the page at the top and scrolled by 700 px.

### What a capture holds

Each state's fragment is the page's body, inside `<div class="dfo-ui" data-viewport="1280x800" data-state="…">`. Two `<div>`s stand for the root and the body, `<div data-mk-html>` and `<div data-mk-body>`, and carry their attributes. Before a state is snapshot, its fonts load and its finite animations and transitions finish. The snapshot is taken from an inert copy of the page (`snapshot.ts`), in which:

- `<script>`, `<noscript>`, `<style>`, `<link>`, `<template>`, comments, event attributes and elements with a shadow root (Next's dev overlay and route announcer) are removed;
- an `<iframe>`, `<video>`, `<audio>`, `<object>` or `<embed>` becomes an empty box of its size;
- a `<canvas>`, a Chart.js chart included, becomes an `<img>` of its pixels at two device px per CSS px;
- images, SVG `<image>`s and `url()`s in `style` attributes become `data:` URLs, and a link's `href` becomes `#`; whatever cannot be fetched, and any other URL that leaves the page, is dropped; a stylesheet that answers with an error status when it is read again fails the capture;
- form controls carry their current state as attributes: `value`, `checked`, `selected`, and a textarea's text;
- hovered, focused and active elements carry `data-mk-hover`, `data-mk-focus`, `data-mk-focus-visible`, `data-mk-focus-within` and `data-mk-active`;
- a scrolled element's children (the body's, for the window) carry a `translate` of minus the scroll offset, and fixed and stuck elements are moved back to where they show.

The generator then checks each fragment for anything a film cannot hold and fails if it finds a script, a canvas, a frame, an event attribute or an outside URL.

The stylesheet is every stylesheet the page loaded, cut down to the rules whose selectors find an element in at least one state, with pseudo-elements set aside and interaction states counted as met (`pageCss.ts`). `@font-face` and `@import` rules go, and the `url()`s left are fetched and inlined as `data:` URLs. Selectors for `:root`, `html` and `body` are pointed at `[data-mk-html]` and `[data-mk-body]`, and `:hover`, `:focus`, `:focus-visible`, `:focus-within` and `:active` at the matching `data-mk-*` attribute, so a film shows a hover or a focus ring by setting the attribute. `filmCss` then freezes, decides, converts and scopes the result as it does for the Studio, with `rem` converted at the page's own root size.

The manifest's `dropped` lists everything removed that a viewer could have seen.

### Outputs

| File                        | Contents                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `<state>.html`              | One fragment per captured state.                                                           |
| `dfo-ui.css`                | The rules every state uses, split into `dfo-ui.css~1`, `~2` and so on past 200 KiB stored. |
| `manifest.json`             | The viewport, the modules, the hooks and each hook's box in every state.                   |
| `shared.js`                 | The runtime, as for the Studio.                                                            |
| `store/modules/<file>.json` | Each file above as a Motion store document.                                                |
| `preview.html`              | The film played in a browser, as for the Studio.                                           |

A page's manifest names each state's fragment in `modules.html`, where the Studio's names its one fragment as a string:

```json
{
    "viewport": { "width": 1280, "height": 800 },
    "rootFontSize": 16,
    "path": "/data",
    "modules": {
        "css": ["dfo-ui.css~1", "dfo-ui.css~2"],
        "html": { "empty": "empty.html", "typed": "typed.html", "results": "results.html" }
    },
    "hooks": ["prompt", "answer"],
    "boxes": {
        "prompt": {
            "empty": { "x": 38, "y": 240.59, "width": 1212, "height": 68 },
            "typed": { "x": 30, "y": 180.59, "width": 1220, "height": 68 },
            "results": null
        }
    },
    "dropped": [
        "<iframe src=\"https://web.cmp.usercentrics.eu/cdcs/v/1.0.0/index.html\"> (left as an empty box)"
    ]
}
```

A box is the element's bounding box in viewport px from the top-left corner; `null` means the hook is absent from that state.

### Where a capture differs from the live page

- The page is frozen at rest. Running animations, the typing caret and anything the page draws after the capture step are absent, so a state that waits on data needs a `wait` step for the element that shows it.
- Elements with a shadow root are dropped, so a third-party widget that renders into one does not show.
- Frames and media are empty boxes.
- A stylesheet shared by every state applies to every state, so a rule from a stylesheet a later route loads can also match an earlier state's markup.
- An image in the CSS is inlined whole wherever a rule that uses it is kept: the world map behind page heroes and the site footer adds about 180 KiB to every page that has either.
