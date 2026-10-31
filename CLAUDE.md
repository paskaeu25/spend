# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Spend" — a mobile-first, installable PWA for hand-logging personal expenses. No account,
no backend, no network calls at runtime. Records live in IndexedDB, settings in
localStorage. Built to the spec in `expense-tracker-requirements.txt` — comments in the
code point back to specific sections where the spec was ambiguous or self-contradictory;
read those comments before "fixing" something that looks inconsistent.

## Workflow: ship every change, no dev environment

There is no separate dev/staging step for this project — every change goes straight to
production and to a new Android build. Concretely, after making a code change (once
`npm run check` passes):

1. Commit and push to `main`. Vercel is connected directly to the repo, so this alone
   deploys the web app — nothing else to trigger.
2. Cut a new Android release: bump the **patch** version from the latest tag (e.g.
   `v1.0.3` → `v1.0.4` — check with `git tag --list --sort=-v:refname | head -1`), then
   `git tag vX.Y.Z && git push --tags`. That triggers `.github/workflows/android.yml`,
   which builds, signs, and attaches the APK to a GitHub Release. Only bump minor/major if
   the user asks for it explicitly — default to patch.
3. Do this for every change, not just at the end of a session — don't batch multiple
   changes into one deploy/tag unless the user says otherwise.

Do not suggest running `npm run dev` / `npm run preview` as the way to check a change —
verify with `npm run check` (and `npm run build` if the change could affect bundling) and
then ship it. Still confirm before anything destructive to git history itself (e.g.
force-push, rewriting a tag) — this instruction covers routine forward commits/tags, not
history rewrites.

## Parallel sessions

Several OpenCode sessions work on this repo at the same time. Colliding sessions were
the one thing that lost finished work here, so this section is a hard rule:

1. **One task = one worktree + one branch.** At the start of a task create it with
   `opencode worktree_create <task-slug>` (each gets its own directory and branch) and
   move the session there; work only in that directory. Do not run two tasks-in-progress
   against the same checkout.
2. **Never touch another session's directory or branch**: no checkout, reset, stash,
   rebase, or `git add` there — even to "clean things up". Another session's uncommitted
   files are somebody's live work.
3. **Commit early, commit everything.** If you find unrelated uncommitted work in a
   directory you must touch anyway, save it to a `task/<name>` branch (`git checkout -b
   task/<name> && git add -A && git commit`) before doing anything else — uncommitted
   files are what actually dies in a collision.
4. **Land one task at a time.** Merge a task branch into `main` only after the full
   suite passes in *its* worktree, then rerun the full suite in main after the merge
   (the baseline may have moved under the branch). Two tasks that edited the same file
   will conflict — resolve serially, after re-reading the other branch's intent.
5. `wip/`-prefixed, name-suffixed branches (`feat/…`, `task/…`) may sit around; a branch
   that no longer has an owner session is fair game to review, finish, or retire after
   asking the user.

## Commands

```sh
npm run dev          # http://localhost:5173
npm run build        # type-check, bundle, generate manifest + service worker
npm run preview      # serve dist — needed to exercise the service worker
npm run preview:lan  # same, reachable from a phone on the same network
npm run check        # the whole gate: tsc -b, vitest run, lint:copy, lint:contrast
```

| Script | What it does |
| --- | --- |
| `npm test` | vitest unit suite: money, dates, selectors, insight rules, backups, IndexedDB, add-sheet flow, app shell |
| `npm run test:watch` | vitest in watch mode |
| `npm run test:browser` | `node tests/browser/smoke.mjs` — real-engine (Playwright/Chromium) smoke test of flows jsdom cannot judge |
| `npm run lint:copy` | `scripts/lint-copy.mjs` — greps for blaming/nagging language (a requirements acceptance criterion) |
| `npm run lint:contrast` | `scripts/lint-contrast.mjs` — measures every colour pair in `tokens.css` against 4.5:1 / 3:1 |
| `npm run icons` | `scripts/gen-icons.mjs` — regenerates every icon (web, Android launcher, adaptive, splash) from one inline SVG |
| `npm run build:native` | web build for the Capacitor shell — same app, **no service worker** |
| `npm run cap:sync` | `build:native` then `cap sync android` |
| `npm run keystore` | one-time: `scripts/gen-keystore.mjs` creates the Android signing key (PKCS#12 via node-forge, no JDK needed) |

To run a single test file: `npx vitest run src/lib/money.test.ts`. To run a single test by
name: `npx vitest run -t "name substring"`.

Tests live next to the code they cover (`foo.ts` / `foo.test.ts`), not in a separate tree.

## Architecture

### State: one in-memory store, mirrored to IndexedDB

`src/store/store.ts` holds the entire record set (expenses, categories, settings) in a
single module-level object, exposed to React via `useSyncExternalStore`. Every mutator
(`addExpense`, `updateCategory`, `deleteExpenses`, …) updates that in-memory state
synchronously first, then fires off a fire-and-forget write to IndexedDB via `persist()`.
A hand-kept log runs to thousands of rows at most, so this is deliberate: every selector in
`src/store/selectors.ts` is a plain synchronous function over an array, and nothing on
screen ever waits on storage. A failed write (quota, private mode) does **not** roll back
what's on screen — it surfaces via `state.storageError` in Settings instead.

`src/db/idb.ts` is a thin wrapper around raw IndexedDB (two stores: expenses, categories).
`src/db/seedCategories.ts` seeds the seven starter categories plus a catch-all category
(`CATCH_ALL_ID`) that absorbs expenses when their category is deleted — see
`reassignAndDeleteCategory` in store.ts, the only path the UI offers for removing a
category.

### Money and dates — the two invariants that must not drift

- **Money is integer minor units (cents) everywhere.** `Expense.amount` is always an
  integer; formatting happens only in `src/lib/money.ts`. Never introduce a float amount
  or format money outside that module.
- **`Expense.amount` is always what the user spent**, including on a split row — one paid
  from a joint account (Settings → Shared expenses, off by default). Such a row also
  carries `fullAmount` and `sharePct`, but those are annotation: they exist so the add
  sheet can reopen the row as the bill that was typed and so History can show a `½` mark.
  No selector, cap, chart, insight or export should ever multiply by `sharePct` — doing
  that would double-apply the split. `src/sheet/SplitRow.tsx` and `splitShare` in money.ts
  are the only places the arithmetic happens.
- **Months always go through `src/lib/dates.ts`'s `monthRange`**, which honours
  `settings.monthStartDay` (1–28, spec section on custom month boundaries). The hero
  figure, caps, charts, and insight rules all derive their "this month" window from the
  same function — don't compute a month boundary ad hoc elsewhere.

### Layout

```
src/
  lib/        money (integer minor units), dates (spending months), csv, backup, uuid
  db/         thin IndexedDB wrapper, category seed, dev sample data
  store/      in-memory store + pure selectors, settings persistence (localStorage)
  sheet/      the add-expense sheet and its keypad — the core interaction of the product
  screens/    Home, History, Insights, Settings, CategorySheet
  charts/     inline-SVG line and mini-bar, CSS bars, shared frame with a table-view toggle
  insights/   the five spending-insight rules, the priority engine, the card, the cap sheet
  ui/         generic overlay/list primitives: sheet, toast, live region, swipe row, meter, expense row
  styles/     design tokens (both themes), base styles
```

### Theming

The theme is resolved in JS and pinned as `data-theme` on the root element, with an inline
script in `index.html` running before first paint (avoids a flash of the wrong theme).
`tokens.css` therefore holds one definition per palette rather than a duplicate set behind
a media query. `src/ui/useTheme.ts` handles the `system`/`light`/`dark` preference.

### PWA vs. native build are genuinely different bundles

`vite.config.ts` branches on `process.env.VITE_NATIVE`:
- Web build: `vite-plugin-pwa` registers a service worker that precaches the whole shell
  (`navigateFallback: '/index.html'`, `cleanupOutdatedCaches`).
- Native build (`VITE_NATIVE=1`, used by `build:native`/`cap:sync`): **no service worker
  plugin at all.** Inside a Capacitor WebView every asset is already local, so precaching
  buys nothing — and actively hurts, since a stale cache would go on serving the previous
  release after an app update. CI (`.github/workflows/ci.yml`) asserts the native `dist/`
  contains none of `sw.js`, `registerSW.js`, `manifest.webmanifest`.

The one runtime behaviour that has to fork per platform is handing the user a file, which
lives in `src/lib/saveFile.ts`. On the web an `<a download>` click at a blob: URL is the
whole story; inside the Capacitor WebView it is a silent no-op (no download manager behind
the WebView), which is exactly how both export buttons came to do nothing on Android. The
native path writes to `Directory.Cache` via `@capacitor/filesystem` and hands the URI to
`@capacitor/share` — cache, so no storage permission is involved, and the share sheet is
what decides where the copy lands. Native detection is the injected `window.Capacitor`
bridge, and both plugins are imported lazily so the web bundle never pulls them in. A
dismissed share sheet rejects with "Share canceled" — a choice, not an error to report.

### Overlays and back-dismiss are the trickiest seam in the app

`src/ui/useBackDismiss.ts` holds one shared `history` entry for the whole overlay stack
(sheets, category picker, etc.) so the hardware/gesture back button closes the topmost
overlay instead of leaving the app. It defers releasing that entry by a task tick
specifically so a React StrictMode double-invoked effect (mount → cleanup → mount) doesn't
misread its own cleanup as a user pressing back. Three real bugs here were invisible to
jsdom (pointer capture retargeting `pointerup` off the close button, `history.back()`
dispatching no `popstate` in jsdom, and the StrictMode double-invoke above) — that's why
`test:browser` exists as a second, real-browser test suite alongside vitest. It runs
against `npm run dev`, not the production preview, because StrictMode only double-invokes
in dev.

### Importing foreign data

`src/lib/backup.ts` / `import-foreign.test.ts` handle both this app's own JSON backups and
imports from other trackers (CSV/JSON). A file is detected as foreign by what it *lacks*
(no `categoryId` on expenses, no `id`/palette slot on categories) — reading it as native
would silently corrupt data (e.g. an amount of `6.2` read as minor units becomes six
cents). Conversion rounds major-unit amounts through a float-safe path, matches categories
by name (new ones get an icon guessed from the name; the palette always wins over any hex
colour in the file), and skips rows with no readable date or a zero amount.

## Releasing (Android)

The Android APK is built entirely in GitHub Actions (`.github/workflows/android.yml`) —
this machine has no JDK/Android SDK and doesn't need one. Capacitor (not a Trusted Web
Activity) is used deliberately: Capacitor bundles the web assets *inside* the app so a
first cold launch works with no network, which matters since offline-first is the app's
premise. Releasing is `git tag vX.Y.Z && git push --tags`; version code comes from the CI
run number (always increases, since Android refuses to downgrade an installed app's
version code). Signing requires the one-time `npm run keystore` setup described in
README.md — losing that key means no future release can install over an existing one
without users losing their local data.

## Deploying (web)

Vercel, connected directly to the GitHub repo — every push to `main` deploys, no token or
secret involved. `vercel.json` is the part that matters operationally: `sw.js`,
`registerSW.js`, and `manifest.webmanifest` are always revalidated (never cached), while
`/assets/*` is content-hashed and cached immutably for a year. Getting this wrong is the
classic way a PWA gets stuck serving an old build. The app is served from the domain root
(not a subpath) so the manifest `start_url`/`scope`/icon paths/service-worker registration
don't need path rewriting.
