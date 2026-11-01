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
- `src/engine/model.js` holds layer and output defaults, the starter sounds and templates, opposites, and validation for saved or imported data.
- `src/engine/roles.js` lists the interactions a set covers (tap, send, error and so on) and finds each one's sound: the one the set picked, else the one with a matching name.
- `src/engine/checks.js` checks that a set holds together: start delay, bass, length and loudness by role, and notes against the set's key.
- `src/engine/render.js` renders offline, trims the tail, normalizes the peak and computes the measurements.
- `src/engine/samples.js` keeps decoded audio for audio layers and persists it to IndexedDB.
- `src/engine/export.js` writes WAV and zip files, generates the JavaScript modules and reads and writes project files.
- `src/engine/ogg.js` encodes OGG files. Import it dynamically so the encoder stays out of the main bundle.
- `src/store.js` is the app state: the sound sets, the open set, selection, preferences, undo and redo, and persistence to localStorage. Each set is saved under its own key, `earcue:set:<id>:v1`, and the URL (`?set=<id>`) says which set is open.
- `src/playback.js` schedules offline renders and plays results in real time.
- `src/components/ui.jsx` holds the design-system primitives built on Radix: `Scrub` (the slider field), `Segmented`, `SwitchRow`, `Section`, `Select`, `Menu`, `Dialog`, `Tip` and `Button`.
- `src/components/` holds the screens: the home page with its sets (`home.jsx`), and the editor's top bar, sidebar, timeline, inspector, bottom panel and dialogs.
- `src/components/preview.jsx` is the preview pane, beside the editor or full screen, and `kit.jsx` is its UI kit. The kit adapts shadcn/ui (MIT, notice in `licenses/`) and uses only the `kit-*` tokens in `src/styles.css`, so it looks like a shadcn app in both themes and never picks up the editor's colors. Every kit control calls `play(role)` with the interaction it stands for.

## Conventions

- Write UI copy for someone who has never used audio software. Name a control by what it does ("Fade in"), and put the audio term in its hint ("Audio people call this attack").
- Give every control a `hint`. The help strip at the bottom of the inspector shows it on hover and focus.
- Use the primitives in `ui.jsx`, not native inputs, so every control looks and behaves the same.
- Take colors from the tokens in `src/styles.css`, and check both the light and dark themes. Dark-theme grays are neutral (equal red, green and blue); only the accent family is blue.
- The app should feel native, not like a web page. Interface text isn't selectable and the pointer stays an arrow; mark text people may copy, like the code view, with `data-selectable`. Cmd+A selects only inside a field or a `data-selectable` region, and Cmd+S saves.
- Change sound data through `edit`, `editLayer`, `editSound` or `editMaster` in `store.js`. During a drag, pass `false` to skip the history entry, then call `commit()` when the drag ends, so one gesture is one undo step.
- If you change the engine, check that an exported module still plays at the sound's target peak. The exported code and the app must sound the same.
- Keep the product standalone: no references to other companies or internal projects in code, copy or commits.

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
