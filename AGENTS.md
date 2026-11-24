# Blot

A local-first notes app for macOS, Windows, and Linux.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite, Zustand 5 |
| Desktop | Electron, a context-isolated preload bridge, explicit IPC handlers |
| Database | Local SQLite through Node's `node:sqlite`, raw parameterized SQL, WAL |
| Rich text | Tiptap / ProseMirror, serialized HTML |
| UI | Published `@fold-ui/core` and `@fold-ui/design` npm packages |
| Sync | Optional folder-based exchange; each device keeps its own local SQLite database |

## Source Boundaries and Git Workflow

Keep dependencies and external checkouts read-only. Keep Blot-specific styling in the application stylesheets.
Always build and package directly from `app/` in the active Blot working tree, including uncommitted changes.
Resolve Fold components, styles, and design tokens from the published npm packages recorded in `app/package-lock.json`.
The lockfiles must be sufficient to build from a fresh clone. Never build from a temporary copy.

Never create a Git repository, stage, commit, or push unless the user explicitly requests that Git action.
A request to push an update authorizes staging the release changes, committing them, and pushing to `origin/main`.
Otherwise, leave implementation changes unstaged and uncommitted for review, including after testing or packaging.

### Pushing an update

1. Bump the app's CalVer to `YYYY.M.N`. Use the release year and month without leading zeros. Start `N` at 1 each
   month and increment it for every subsequent release that month, including same-day releases.
2. Set `version` and the ISO `releaseDate` (`YYYY-MM-DD`) in `app/desktop/package.json`. Settings → About reads both
   fields directly. Match the version in `app/package.json` and the root package entries of both app lockfiles.
3. Build the app and verify the requested change and the version and release date shown in Settings → About.
4. Commit the scoped changes with a message that names the actual change. Favor original, dry humor in the spirit of
   Gary Larson or Douglas Adams when it fits. Push the commit to `origin/main` and verify the remote revision.

## Coding Ethos

Lowest code footprint wins. DRY still applies, but simplicity beats abstraction - prefer extending an existing
component/function over creating a parallel one, and prefer a small purpose-built implementation over pulling
in a new dependency, as long as it does not break compatibility. Blot is maintained largely solo, so less
code to carry matters more than textbook architecture.

Be clever, be elegant. Lean on the patterns, helpers, and libraries already in the codebase instead of inventing
new ones. Steer away from refactors and over-complicating - the smallest change that fits the existing shape
is almost always the right one.

Scope discipline is non-negotiable: implement only what the user requested. Never add speculative workarounds,
fixes, enhancements, or adjacent changes unless explicitly asked.

Follow local conventions before introducing a new pattern. Inspect analogous code first, then match its naming,
file placement, state flow, component usage, and API shape unless a concrete requirement makes that convention
unsuitable. New work should read as though it has always belonged in the surrounding code.

Prefer plain, explicit code that reads from top to bottom. Use descriptive names, ordinary handlers,
straightforward conditions, and early returns. Avoid cryptic helpers, configuration-driven flows, generic
orchestration, and extra layers where a small function would be clearer. Match surrounding formatting and
logical-phase spacing, not just types and APIs. Readability matters more than architectural sophistication.

Start application state changes with actions in `app/src/store/app.ts`. Keep desktop I/O behind the existing
preload bridge. Apply confirmed persistence changes through the store, preserving pending edits. Reserve
snapshots for initial load, recovery, and coherent imports; avoid unnecessary database calls or broad refreshes.
Keep browser-only resources and editor instances out of the store.

Use raw parameterized SQL for database work. Keep queries precise, transactions short, and related writes atomic.
Do not add an ORM, server, account system, or collaboration stack for local application features.

Always opt for a small blast radius. Do not be overly proactive beyond the requested task.

## Project Structure

- `app/src/components/`: application components and Tiptap editor integration
- `app/src/layouts/`: navigation, note list, editor panes
- `app/src/modals/`: application modal/dialog components
- `app/src/store/app.ts`: application state and actions
- `app/src/helpers/`: focused helpers, bridge access, document/tag processing
- `app/src/types.ts`: shared application and persistence contracts
- `app/src/fonts/`: bundled offline fonts
- `app/src/styles.css`, `notes.css`, `tiptap.css`, `tools.css`: application styling
- `app/desktop/main.cjs`: window lifecycle, IPC, native dialogs and menus
- `app/desktop/preload.cjs`: renderer-safe desktop bridge
- `app/desktop/src/`: persistence and desktop services
- `app/desktop/build.mjs`: desktop TypeScript build
- `website/`: landing page source and public assets
- `docs/`: generated GitHub Pages site. Edit `website/` and run its build to regenerate this directory.
- `README.md`: commands, data locations, user workflows, and backup guidance

## UI Components

Use `@fold-ui/core` components and `var(--f-*)` tokens from `@fold-ui/design`. Before adding UI CSS, inspect the
installed component's implementation and declarations in `node_modules/@fold-ui/core/dist`. Use the Fold docs
for examples and `dist/types/index.d.ts` for shared props. Most components forward `CoreViewProps`
to `View`; prefer existing props to duplicating them in classes or `style`.

| Need | Prefer |
| --- | --- |
| Flex layout | `row`, `column`, `gap`, `wrap`, `flex`, `grow`, `shrink`, `basis` |
| Alignment | `alignItems`, `justifyContent`, `alignSelf`, existing `align` presets |
| Spacing/dimensions | `p`, `m`, `width`, `height`; numbers are pixels, strings accept CSS units |
| Colours | `bgToken="surface-strong"`, `colorToken="text-weak"` |
| Decoration | `radius`, `border`, `shadow`, `position`, `zIndex` |
| Typography | `Text size`, `Heading as`, `fontWeight`, `fontSize`, `lineHeight`, `letterSpacing` |
| Actions | `Button` / `IconButton`, `variant`, `subtle`, `outline`, `flat`, `active`, `round`, `size` |
| Forms/navigation | `Form`, `Input`, `Textarea`, `InputControl`, `Tabs`, `TabList`, `Tab`, `Modal` |

`row` and `column` centre children by default; set alignment explicitly for top/left or stretched content.
`Card` defaults to 300px wide; use `width="100%"` for fluid cards. `bgToken` and `colorToken` take precedence
over `bg` and `color`. Use `IconLib` names registered in `app/src/services/icons.tsx`.

Reserve `style` or scoped CSS for properties components do not expose, media queries, or pseudo-elements.
Reuse `f-ellipsis`, `f-scrollbar`, `f-{component}`, and `is-{state}` conventions. Check component-specific props
before overriding presentation, and keep any component token overrides local.

## Code Style

- Four-space indentation, no semicolons in TypeScript/JavaScript, single quotes, 120 print width, ES5 trailing commas.
- Ignore ESLint: do not run it, fix its warnings, or add/edit its configuration. Use Prettier and TypeScript checks.
- Frontend alias: `@` for `src`. Import Fold components and tokens from their published package names.
- Do not use em dashes; use normal dashes.

### Function and Handler Layout

Separate logical phases with one blank line: input/setup, guards, main work, result checks, follow-up side effects,
and return. Keep related statements together. Split phases where their purpose changes, including within loops,
conditionals, and `try`/`catch`/`finally`. Keep comments attached to the code they describe. Short guard clauses
belong on one line; guards with multiple statements use a block. Deliberate whitespace is a readability requirement,
not merely a formatter preference.

### Desktop Authoring Style

IPC handlers own bridge input, trust checks, native dialogs, and replies; services own SQL, filesystem work, and
business operations. Keep SQL out of `main.cjs`. Extend the existing bridge and service boundaries rather than
adding parallel APIs. Do not refactor otherwise untouched code solely to enforce these boundaries.

### Frontend Authoring Style

Organize component bodies as declarations, methods, effects, subscriptions/event listeners, then render guards
and JSX. Group related hooks/context, store selectors, state/refs, and derived values with blank lines.
Apply the same logical-phase spacing inside callbacks and store actions.

Consider render cost. Keep high-frequency work out of render, avoid broad subscriptions and unnecessary polling,
and update visible state only when it changes. Prefer targeted events where practical. Avoid memoization for
trivial calculations; mutating arrays without changing their reference does not update React dependencies.

## Persistence and Sync

SQLite stays local to each device. Never point an open SQLite database at a cloud-synced folder or sync its WAL/SHM
files. Exchange application records through the selected sync folder, with version/conflict handling and deletion
records. Preserve competing edits; do not silently resolve conflicts using device clocks.

Preserve existing notes, tags, inline hashtags, data paths, application identity, and on-disk formats.
Preserve autosave and flush pending edits before close or incoming changes. Use SQLite's backup API for consistent
backups; do not copy a live database file. Schema changes must preserve existing data.

Keep personal notes, account credentials, and machine-specific paths out of the repository. Optional sync uses the
user's chosen local folder and their external file-sync client. Never select or connect a real sync folder on the
user's behalf during QA. Keep verification databases and folders isolated under a temporary directory using `BLOT_DATA_DIR`.

## Development and Verification

Use Node 22.12 or newer. See `README.md` and the package scripts for current commands. From `app/`:

- `npm run dev`: build desktop code, run Vite at `http://127.0.0.1:4318`, and launch Electron
- `npm run dev:ui`: renderer only; persistence requires the desktop bridge
- `npm run typecheck`: frontend and desktop TypeScript checks
- `npm run build`: type-check and build renderer and desktop
- `npm run electron`: build and launch the local desktop app
- `npm run pack:mac`, `pack:win`, `pack:linux`: platform packaging

Never add test files (`*.test.*`, `*.spec.*`, or other permanent verification scripts). Use static checks,
ad hoc verification, and realistic UI/persistence workflows; keep temporary scripts outside the repository.

Start the relevant local app for QA when it is not already running. Only skip live verification when startup is
actually blocked or the workflow cannot be exercised locally, and state that boundary. Follow normal visible UI
journeys; setup calls may create fixtures but do not substitute for exercising the behavior under test.
Correlate UI results with persistence. For sync, use separate temporary device databases and exchange folders,
exercise offline edits and recovery, and state any simulated cloud-transfer or untested platform boundary.
Use fictional, plausible notes. Never modify personal notes or use sensitive content as seed data.

### Website hero screenshot

Use fictional sample notes and images cleared for publication in a temporary `BLOT_DATA_DIR`.
For the current hero, select the `samples` tag and open “A weekend prototype” in dark mode.
Focus the Blot window on a Retina display so its red, yellow, and green controls are visible. Capture the native
window with `screencapture -x -o -l "$window_id" "$output_png"` using the window ID from Electron's
`win.getMediaSourceId().split(':')[1]`. Check that all three controls are visible and the computer-use badge
and pointer are absent. Flatten the dark window’s transparent corners onto `#16151B` and save the result as
`website/public/blot-screenshot.jpg` at 1920 × 1253.

## Code Review

Default to the staged diff (`git diff --cached`) plus minimal surrounding context, without altering the index or
history. For an already-shipped workflow, inspect its current implementation even if the staged diff is empty.
Weigh footprint/simplicity, local conventions, database queries, code/frontend style, and correctness. Report
findings most severe first with `file:line`, what is wrong, why it matters, and the smallest fitting fix.
Separate must-fix correctness/security issues from should-fix convention issues and nits. Say plainly when nothing
significant turns up. A review does not expand implementation scope or warrant a separate summary file.

Unless asked for a review without edits, implement small focused fixes for evidenced bugs in the review scope.
Defer substantial refactors with a concrete recommendation. Verify fixes, re-read the final unstaged diff, and leave
changes uncommitted. Establish behavior from code and focused verification before updating relevant docs; do not
change working code merely to match stale documentation or document a confirmed bug as intended behavior.

Keep routine QA focused on realistic workflows and nearby regressions, not contrived abuse chains. Do not introduce
speculative authorization or security changes during routine review. Report concrete access-control regressions
with evidence and leave them unchanged unless a security fix is explicitly requested.

## Verification-Only Requests

When asked to verify unstaged changes, leave the repository exactly as found. Inspect status, unstaged diff,
relevant untracked files, and minimal context. Run appropriate checks without formatting/autofix, editing code or
docs, changing snapshots, or modifying Git state. Temporary isolated QA data is allowed. Report evidenced findings,
recommended fixes, what passed, and verification boundaries; do not apply fixes.

## Communication

Keep responses concise and direct. Lead with the outcome, then the useful evidence and any verification limits.
