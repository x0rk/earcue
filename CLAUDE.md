# Earcue

Earcue is a browser app for designing short UI sounds: taps, toggles, sends, successes, errors. People keep the sounds for each product as a set, build a sound from layers, shape it on a timeline, compare it with another sound, and export a WAV or OGG file or a JavaScript module that plays the sound with no audio file. It is built for people who are new to sound design, so the interface and copy should feel as simple as a design tool.

Everything runs in the browser. There is no backend.

## Commands

- `npm install` installs dependencies and the git hooks (through the `prepare` script).
- `npm run dev` starts the dev server.
- `npm run build` builds to `dist/`. It must pass before you open a PR.
- `npm test` runs the Vitest suite in `tests/`. It must pass before you open a PR.
- `npm run preview` serves the production build.

## Stack

Vite, React, Radix primitives (`radix-ui`), Tailwind CSS v4, zustand with immer, lucide icons, Geist fonts. Audio is plain Web Audio. The one audio library is `wasm-media-encoders`, for OGG export: libvorbis compiled to WebAssembly, loaded only when someone exports an OGG. That is why the CSP allows `'wasm-unsafe-eval'`, and why `licenses/` holds the libvorbis and libogg notices the build appends to `third-party-licenses.md`.

## Layout

- `src/engine/engine.js` builds the Web Audio graph for a sound. It is embedded verbatim in the exported JavaScript module, so it must stay self-contained: no imports, and only its own declarations and `Math`.
- `src/engine/model.js` holds layer and output defaults, the starter sounds (one for every interaction but hover, with takes of tap and typing) and templates, variants, opposites, and validation for saved or imported data.
- `src/engine/roles.js` lists the interactions a set covers (the 29 most product sound kits name), each in a preview group and a tier (frequent, confirm or alert). A rare or looping role can carry `maxMs`, and `loop: true` repeats it until stopped. `soundsForRole` finds an interaction's sounds: the ones the set picked (a list, up to `MAX_VARIANTS`; older sets saved one id), else the first of its names a sound has, together with that name's numbered takes ("Tap 2"). Playback picks one at random, never the last one.
- `src/engine/kits.js` reads `public/kits/index.json`, the manifest of the bundled kits, and turns a kit's decoded recordings into a set's sounds and roles. `src/kits.js` fetches, decodes and opens kits. The audio in `public/kits` keeps its own licences (see the README); keep each kit's licence file next to its audio and its credit in the manifest. A set made from a kit carries the credit in `set.credits`, and exports print it.
- `src/engine/palette.js` holds what a set's sounds share: the key (scales, the wider scale around a pentatonic key, retuning), loudness by tier, and the room settings. Retuning moves each note to the same step of the new scale and keeps whatever sits off the scale, so a deliberate clash (`patch.tension`) stays one. Applying the palette rewrites the sounds, so exports never depend on the set.
- `src/engine/pitch.js` finds the pitch of a recording (McLeod's normalized square difference), so recordings can be checked, retuned and grown into a family. `samplePitch(id)` caches the answer per sample.
- `src/engine/family.js` grows a set from one sound: each interaction plays the source one or more times, moved in time and pitch within a major pentatonic scale on the source's note.
- `src/engine/checks.js` checks that a set holds together: start delay, bass, length and loudness by role, notes against the set's key, and clashes between sounds that play one after another.
- `src/engine/render.js` renders offline, trims the tail, normalizes the peak and computes the measurements.
- `src/engine/samples.js` keeps decoded audio for audio layers and persists it to IndexedDB.
- `src/engine/export.js` writes WAV and zip files, generates the JavaScript modules and reads and writes project files.
- `src/engine/ogg.js` encodes OGG files. Import it dynamically so the encoder stays out of the main bundle.
- `src/engine/cleanup.js` cleans recordings: noise reduction, hum removal and a gate. It runs once on the clip and caches the cleaned copy by the layer's settings; renders and exports go through `withCleanup(patch)` and `lookupSample(id)`, so cleaned layers play and export their cleaned audio while the stored clip stays untouched.
- `src/engine/fft.js` is the FFT shared by the spectrum and clean up.
- Effects (`buildEffect` in `engine.js`) use only the browser's own nodes, so exported code needs no libraries. Never use `DynamicsCompressorNode` or anything else with lookahead: its 6 ms delay makes a UI sound land late. The layer compressor drives a gain from a level detector, and the Output limiter is a soft clipper set against the sound's own peak, which `renderPatch` measures in a first pass and exports carry as `limitRef`.
- `src/store.js` is the app state: the sound sets, the open set, selection, preferences, undo and redo, and persistence to localStorage. Each set is saved under its own key, `earcue:set:<id>:v1`, and the URL (`?set=<id>`) says which set is open.
- `src/playback.js` schedules offline renders and plays results in real time. What the editor plays is tracked, so moving to another sound, set or page stops it (`stopPlayback`); the preview's interaction sounds pass `editor: false` and ring on.
- `src/components/ui.jsx` holds the design-system primitives built on Radix: `Scrub` (the slider field), `Segmented`, `SwitchRow`, `Section`, `Select`, `Menu`, `Dialog`, `Tip` and `Button`.
- `src/components/` holds the screens: the home page with its sets (`home.jsx`), and the editor's top bar, sidebar, timeline, inspector, bottom panel and dialogs.
- `src/components/preview.jsx` is the preview pane, beside the editor or full screen, and `kit.jsx` is its UI kit. The kit adapts shadcn/ui (MIT, notice in `licenses/`) and uses only the `kit-*` tokens in `src/styles.css`, so it looks like a shadcn app in both themes and never picks up the editor's colors. Every kit control calls `play(role)` with the interaction it stands for.

## Conventions

- Write UI copy for someone who has never used audio software. Name a control by what it does ("Fade in"), and put the audio term in its hint ("Audio people call this attack").
- Give every control a `hint`. The help strip at the bottom of the inspector shows it on hover and focus.
- Use the primitives in `ui.jsx`, not native inputs, so every control looks and behaves the same.
- Give anything people act on a right-click menu with `ContextMenu` from `ui.jsx`, built from the same items as its ⋯ menu so the two never drift apart. Elsewhere right-click shows nothing, except in text fields, links and `data-selectable` text, which keep the browser's menu.
- Scrollbars are styled once in `src/styles.css` from the `--scroll-thumb` tokens. Keep thumbs at 3:1 contrast on every surface in both themes.
- Take colors from the tokens in `src/styles.css`, and check both the light and dark themes. Dark-theme grays are neutral (equal red, green and blue); only the accent family is blue.
- The app should feel native, not like a web page. Interface text isn't selectable and the pointer stays an arrow; mark text people may copy, like the code view, with `data-selectable`. Cmd+A selects only inside a field or a `data-selectable` region, and Cmd+S saves.
- Change sound data through `edit`, `editLayer`, `editSound` or `editMaster` in `store.js`. During a drag, pass `false` to skip the history entry, then call `commit()` when the drag ends, so one gesture is one undo step.
- If you change the engine, check that an exported module still plays at the sound's target peak. The exported code and the app must sound the same.
- Keep the product standalone: no references to other companies or internal projects in code, copy or commits. The one exception is the credit a bundled kit's licence requires.
- Never rewrite a saved set just because it loaded. Read old formats in `normalizeSet` and friends, and write the new format only when the person edits the set.

## Git workflow

- Never push to `main`. The `.husky/pre-push` hook blocks it. Work on a branch named `<type>/<short-description>`, for example `feat/sound-set-export`.
- Commit messages use `<type>(<scope>): <description>`. Types: `feat`, `fix`, `build`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`, `ci`. Start the description in lowercase.
- Open PRs with the `/create-pr` command. The body must follow `.github/pull_request_template.md`. Check the title and body by piping them in through a quoted heredoc (`<<'EOF'`), never as a quoted argument: the shell would run anything in backticks.
  - `node .github/scripts/pr-title-check.js <<'EOF'` with the title, then `EOF`
  - `node .github/scripts/pr-description-check.js <<'EOF'` with the body, then `EOF`
- Merge with squash only. `main` keeps a linear history. Never force-push.
- Vercel deploys `main` to production and builds a preview for every PR.

## Testing

`npm test` runs the Vitest suite in `tests/` in about a second. It renders real audio through `node-web-audio-api`, so engine and export changes are checked against the same graphs the app builds, including that an exported module sounds like the app. Randomness is seeded with `seedRandom()` from `tests/helpers.js`. Files that need a DOM opt in with a `// @vitest-environment jsdom` comment. CI runs `npm test` and `npm run build` on every PR, on Node 22.

Before opening a PR:

1. Run `npm test` and `npm run build`.
2. Add or update tests for the behavior you changed.
3. Try the change in `npm run dev`, in both themes, and with the keyboard alone.
