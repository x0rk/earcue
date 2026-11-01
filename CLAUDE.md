# Earcue

Earcue is a browser app for designing short UI sounds: taps, toggles, sends, successes, errors. People build a sound from layers, shape it on a timeline, compare it with another sound, and export a WAV file or a JavaScript module that plays the sound with no audio file. It is built for people who are new to sound design, so the interface and copy should feel as simple as a design tool.

Everything runs in the browser. There is no backend.

## Commands

- `npm install` installs dependencies and the git hooks (through the `prepare` script).
- `npm run dev` starts the dev server.
- `npm run build` builds to `dist/`. It must pass before you open a PR.
- `npm run preview` serves the production build.

## Stack

Vite, React, Radix primitives (`radix-ui`), Tailwind CSS v4, zustand with immer, lucide icons, Geist fonts. Audio is plain Web Audio with no audio libraries.

## Layout

- `src/engine/engine.js` builds the Web Audio graph for a sound. It is embedded verbatim in the exported JavaScript module, so it must stay self-contained: no imports, and only its own declarations and `Math`.
- `src/engine/model.js` holds layer and output defaults, the templates, and validation for saved or imported data.
- `src/engine/render.js` renders offline, trims the tail, normalizes the peak and computes the measurements.
- `src/engine/samples.js` keeps decoded audio for audio layers and persists it to IndexedDB.
- `src/engine/export.js` writes WAV and zip files, generates the JavaScript modules and reads and writes project files.
- `src/store.js` is the app state: the sound set, selection, preferences, undo and redo, and persistence to localStorage.
- `src/playback.js` schedules offline renders and plays results in real time.
- `src/components/ui.jsx` holds the design-system primitives built on Radix: `Scrub` (the slider field), `Segmented`, `SwitchRow`, `Section`, `Select`, `Menu`, `Dialog`, `Tip` and `Button`.
- `src/components/` holds the screens: top bar, sidebar, timeline, inspector, bottom panel and dialogs.

## Conventions

- Write UI copy for someone who has never used audio software. Name a control by what it does ("Fade in"), and put the audio term in its hint ("Audio people call this attack").
- Give every control a `hint`. The help strip at the bottom of the inspector shows it on hover and focus.
- Use the primitives in `ui.jsx`, not native inputs, so every control looks and behaves the same.
- Take colors from the tokens in `src/styles.css`, and check both the light and dark themes.
- Change sound data through `edit`, `editLayer`, `editSound` or `editMaster` in `store.js`. During a drag, pass `false` to skip the history entry, then call `commit()` when the drag ends, so one gesture is one undo step.
- If you change the engine, check that an exported module still plays at the sound's target peak. The exported code and the app must sound the same.
- Keep the product standalone: no references to other companies or internal projects in code, copy or commits.

## Git workflow

- Never push to `main`. The `.husky/pre-push` hook blocks it. Work on a branch named `<type>/<short-description>`, for example `feat/sound-set-export`.
- Commit messages use `<type>(<scope>): <description>`. Types: `feat`, `fix`, `build`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`, `ci`. Start the description in lowercase.
- Open PRs with the `/create-pr` command. The title must pass `node .github/scripts/pr-title-check.js "<title>"`, and the body must follow `.github/pull_request_template.md` and pass `node .github/scripts/pr-description-check.js "<body>"`.
- Merge with squash only. `main` keeps a linear history. Never force-push.
- Vercel deploys `main` to production and builds a preview for every PR.

## Testing

There is no automated test suite yet. Before opening a PR:

1. Run `npm run build`.
2. Try the change in `npm run dev`, in both themes.
3. If you touched the engine or export code, export a sound and check that its WAV and its JavaScript module sound the same.
