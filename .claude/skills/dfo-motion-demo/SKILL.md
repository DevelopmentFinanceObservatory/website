---
name: dfo-motion-demo
description: Make a demo film of the DFO website for Claude Motion with motion-kit, from a data question to a published film that shows the real Studio or any other page of the site. Covers checking the figures with the DFO MCP server, writing a Studio spec or a page-capture spec, timing it with a cue sheet, generating the modules, checking them in the local preview, and loading them into a Motion film. Use whenever someone asks for a DFO demo video, a Motion film, a screen-recording-style walkthrough of the Studio, data search, a source page or any route of the site, turning a storyboard into a film, or changing an existing DFO film, even if they only say "make a demo of X" or "animate this question".
---

# DFO demo films with motion-kit

A film shows the site itself, so viewers see what they would see using DFO. `motion-kit/` renders the Studio from the app's own components, and captures any other route from the running site, as static HTML and CSS a Motion film can hold. A cue sheet then drives it: typing, replies, the plan, cards arriving, charts drawing, and the camera. Because the markup comes from the components, a regenerated film follows the site as it changes.

`motion-kit/README.md` is the reference for every spec field, cue kind and output file. Read "The demo spec" and "The cue sheet" before a Studio film, and "Page capture" before any other page.

One generator run makes one film's modules: one Studio render, or one page capture with several states. A demo that needs both is two films.

## 1. Get the figures from DFO

Every number on screen is a claim about the world made in DFO's name, so it comes from the DFO MCP server and is checked before anything is built. Use `search` to find the dataset, `get_data` to fetch it, and the analysis tools (`aggregate`, `quotient_of`, `growth`) for derived figures. Keep each figure's dataset, unit, year and source. For a demo with many figures, send an agent to recompute them independently and compare.

House conventions:

- Health aid is OECD CRS purposes 120 (health) plus 130 (population policies and reproductive health, which holds HIV/AIDS). Fetch with `breakdown {"code_system": "crsPurpose", "level": 1}` and sum both. Purpose 120 alone misses HIV money such as PEPFAR and undercounts Kenya's health aid by more than half.
- Name the definition where the figure shows, as the Kenya answer does: "Health aid counts purposes 120 and 130, which covers HIV/AIDS."
- Use the latest complete year DFO holds and current US dollars unless the question says otherwise, and round as the Studio does: billions to one decimal, millions whole.

Before writing the spec, show the user the figures, their sources and any ratio built from them, and make the wording of each claim match its number ("nearly eight times" for 7.7).

## 2. Choose what the film shows

- **The Studio** (a question, its plan, the board and the answer): a Studio spec in `motion-kit/demos/<name>.json`, rendered from the components. Capturing the live Studio would need a real conversation with the planner, so the renderer builds it from a spec instead.
- **Any other page** (data search, a source page, docs, the homepage, tools): a page spec in `motion-kit/pages/<name>.json`, captured from the running site in Chrome. Each `capture` step is one state of the page, and a film mounts one state per scene.

## 3. Write the spec

### Studio

Start from `motion-kit/demos/kenya-debt-health.json`. The types are in `motion-kit/spec.ts` and reuse the app's own (`ChatMessage`, `PlanState`, `Widget`), so the plan, choices and cards render as the Studio shows them today. Points that catch people out:

- `question` is the prompt typed into the chat input, and the first message repeats it.
- The top-level `plan` is the one waiting for approval. The answer the approval resumed carries the same plan as its `plan`, which shows as the pill under it.
- Card ids are letters, digits, `_` or `-`, since they name hooks. Give a chart card the `h` the Studio settles on (the Kenya chart is 24×21), because the renderer cannot measure the live card.
- `viewport` is at least 660 px wide; below that the Studio switches to its phone layout, which the renderer does not draw.

### Any other page

Start from `motion-kit/pages/kenya-debt-search.json`. The capture reads the running site, so start it first:

```bash
pnpm dev --port 3100
```

Name the elements the film animates or the camera visits in `hooks`, each a plain CSS selector that finds one element. Write the steps a user would take, with a `wait` for anything that arrives with data and a `capture` wherever the film needs a state. A search answer can take two minutes to stream, and a capture without the `wait` freezes the page before it arrives.

## 4. Write the cue sheet

The cue sheet sits beside the spec as `<name>.cues.json`, with camera `keys` and `cues`. Times are seconds from the start of the film. Start from `motion-kit/demos/kenya-debt-health.cues.json`, which follows the Studio's own sequence:

- At 0, `animate` the page-load entrance by keyframe name (`Studio_module_board-in`, `Studio_module_bar-in`, `WorkspaceToolbar_module_ws-rise`, `ChatPanel_module_chat-in`). These play the app's own keyframes with its timings, which is what makes the film feel like the Studio.
- `type` the question at about 26 characters a second, and `press` send. `show` the user's message with `dur: 0`, since a new message simply appears, and use `clearAt` to empty the field.
- `stream` the reply's text (`sel: ".ChatPanel_module_botText"`) at 12 to 14 words a second.
- `show` the plan and its bar, `press` Approve, then at one moment `remove` both, switch `state` to `approved` and `show` the pill. That is what the Studio does on approval.
- `animate` each card on its hook a few tenths of a second apart, then `draw` each chart series over about 1.8 s.

Camera keys centre on a hook at zoom `z`, measured as the page stands at that key's time. Zoom 1.6 to 1.9 makes text readable and 1 shows the whole page. Hold at least 2.5 s on anything the viewer must read, and end wide so the last frame shows the whole answer. A Kenya-length film runs 20 to 30 s.

For a page capture, a cue or key that belongs to one state names it in `in` (`"in": "results"`). One without `in` plays in every state, so its hooks must exist in all of them. Captures have no app motion, so `animate`, `state` and `tab` cues are Studio-only.

## 5. Generate and preview

```bash
pnpm motion-kit motion-kit/demos/<name>.json
pnpm motion-kit capture motion-kit/pages/<name>.json --base http://localhost:3100
```

The generator checks the spec and cue sheet against the render and lists every problem it finds: a missing hook, state or keyframe, a cue field of the wrong type, a module over 200 KiB, an outside URL. Fix them and run it again. Each run replaces `motion-kit/dist/<name>/`.

Then open `motion-kit/dist/<name>/preview.html`. It plays the cue sheet through the film's own runtime, with a scrubber and `?t=9.5` to open at a time; a runtime error shows above the stage. A capture's menu offers each state and, when its camera keys name states, "film", which switches state at each state's first key as the film's scenes will. The built-in browser cannot open `file://` pages, so serve the folder for it:

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory motion-kit/dist
```

Look at a frame at every beat (before typing, the prompt grown, the plan, after approval, the cards, the end) and scrub the whole film both ways. When something looks wrong, compare it with the live site in the same state. Show the user those frames before publishing, since a change is cheaper here than in Motion.

What the kit cannot do yet, so the user knows before they watch:

- The page-load entrance makes the first frame, which Motion uses as the thumbnail, mostly empty. Start the cue sheet after the entrance if the thumbnail matters.
- A chart's plot can sit a few px off the live card's.
- The activity log can only show settled steps folded behind their toggle.
- A capture is frozen at rest: the typing caret and anything still animating are absent.

## 6. Publish to Motion

1. Find the Motion type with the Artifact tool (`action: "list"`, `scope: "types"`) and create a film from its `type_url` with a `title` and `auto_open: "after_first_write"`. The result carries the type's instructions and references (`film-api.md`, `finalize.md`). Read them: they define the store and the `kit` API, and where they differ from this skill they are right.
2. Write the store with one `ArtifactData` `batch`:
    - `film/meta`: `{ "v": 1, "title": …, "updatedAt": … }`.
    - `modules/<file>` for every file in `motion-kit/dist/<name>/store/modules/`, each with `file_path` pointing at that `<file>.json`. The documents are large and exact, and a retyped copy drifts from what the preview checked.
    - `modules/scenes.json`, then one `modules/scene-<id>.js` per scene.
3. Scenes split the film into named beats whose `dur` values sum to the preview's length. Every scene mounts the same render and reads one film clock, so cuts between scenes do not show:

```js
kit.scene('plan', {
    init(kit) {
        const d = kit.json('cues.json');
        this.studio = window.DFO.mount(kit, { keys: d.keys }).cue(d.cues);
        this.t0 = kit.start;
    },
    render(t) {
        this.studio.render(this.t0 + t);
    },
});
```

For a page capture, each scene mounts its state, and the runtime keeps only the cues and keys for that state: `window.DFO.mount(kit, { state: 'results', keys: d.keys }).cue(d.cues)`. Start each scene where its state's first camera key is, so the film cuts where the preview does. `desk` sets the colour around the page: use the page's own background (the data search is `#3d3d3d`) so the frame's edges do not show. `motion-kit/pages/uganda-oda-search.json` and its cue sheet are the worked example: a search typed, its match, the answer, the measure refined and the table.

`scenes.json` follows the type's instructions. The Kenya film uses `"stage": "final"`, 1920×1080 at 60 fps, a `#ecece0` background, and the fonts the stylesheet points at: Outfit as `sans` and DM Mono as `mono`. Add music only when the user asks for it.

To change a published film, regenerate, `get` each changed module's version, and `set` only the changed modules with `if_version`, so a concurrent edit in Motion is not overwritten.

## 7. Before calling it done

- The figures on screen match what DFO returned in step 1.
- The preview scrubs from 0 to the end with no error.
- The user has watched the film in Motion. The built-in browser is not signed in to claude.ai and cannot play it, so ask the user to check it there.
- The spec and cue sheet are saved under `motion-kit/demos/` or `motion-kit/pages/`, where they can be committed. `motion-kit/dist/` is ignored by git.
