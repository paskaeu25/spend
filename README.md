# Spend

A mobile-first, installable PWA for logging personal spending by hand. No account, no
backend, no network calls at runtime. Records live in IndexedDB, settings in localStorage.

Built to `expense-tracker-requirements.txt`.

## Getting it on a device

**Android** — open [Releases](../../releases) on the phone, download the `.apk` from the
newest release and open it. Android will ask once for permission to install from your
browser. Later releases install straight over the top, so logged expenses stay put.

**iPhone / iPad** — open the web app in Safari, then Share → **Add to Home Screen**. It gets
its own icon, opens without browser chrome, and works offline. There is deliberately no IPA
to download: Apple permits no unsigned sideloading, so an installable file would need either
a paid developer account or a cable and a Mac. For a local-only tracker the installed PWA is
all but indistinguishable from a native build.

**Any desktop browser** — the deployed URL works as-is, and Chrome offers an install button
in the address bar.

## Running it

```sh
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check, bundle, generate manifest + service worker
npm run preview      # serve dist — needed to exercise the service worker
npm run preview:lan  # same, reachable from a phone on the same network
```

`npm run check` runs the whole gate: type-check, tests, copy lint, contrast lint.

| Script | What it does |
| --- | --- |
| `npm test` | 167 tests: money, dates, selectors, insight rules, backups, IndexedDB, add-sheet flow, app shell |
| `npm run test:browser` | Real-engine smoke test of the flows jsdom cannot judge (see below) |
| `npm run lint:copy` | Greps for blaming or nagging language (criterion 7) |
| `npm run lint:contrast` | Measures every colour pair in `tokens.css` against 4.5:1 / 3:1 (criterion 9, section 10) |
| `npm run icons` | Regenerates every icon — web, Android launcher, adaptive, splash — from one inline SVG |
| `npm run build:native` | Web build for the native shell: same app, no service worker |
| `npm run cap:sync` | `build:native` then copies the assets into `android/` |
| `npm run keystore` | One-time: creates the Android signing key (see Releasing) |

## Layout

```
src/
  lib/        money (integer minor units), dates (spending months), csv, backup, uuid
  db/         thin IndexedDB wrapper, category seed, dev sample data
  store/      in-memory store + pure selectors, settings
  sheet/      the add-expense sheet and its keypad — the core of the product
  screens/    Home, History, Insights, Settings, CategorySheet
  charts/     inline-SVG line and mini-bar, CSS bars, shared frame with table toggle
  insights/   the five rules, the priority engine, the card, the cap sheet
  ui/         sheet, toast, live region, swipe row, meter, expense row
  styles/     tokens (both themes), base
```

Some decisions worth knowing about:

- **Money** is integer minor units everywhere; formatting happens only in `lib/money.ts`.
- **Months** always go through `dates.monthRange`, so `monthStartDay` is honoured by the
  hero figure, caps, charts and rules at once.
- **The whole record set is held in memory** and mirrored to IndexedDB on write. A
  hand-kept log runs to thousands of rows at most, which makes every selector a plain
  synchronous function and means nothing on screen waits on storage.
- **The theme is resolved in JS** and pinned as `data-theme`, with an inline script in
  `index.html` doing it before first paint. That way `tokens.css` holds one definition per
  palette instead of a second copy inside a media query.

## Deploying the web app

Hosted on Vercel with the repository connected in Vercel's UI, so every push to `main`
deploys and nothing needs a token or a GitHub secret. `vercel.json` carries the part that
actually matters: `sw.js`, `registerSW.js` and `manifest.webmanifest` are always
revalidated, while `/assets/*` — content-hashed — is immutable for a year. A cached service
worker is how a PWA gets stuck on an old build.

The app is served from the domain root, which is why Vercel rather than GitHub Pages: under
a `/repo-name/` subpath the manifest `start_url`, the scope, the icon paths and the service
worker registration would all need rewriting, and each is a well-known way to break an
install.

## Releasing an Android APK

The APK is built by GitHub Actions — this machine has no JDK and no Android SDK, and does
not need them.

```sh
git tag v1.0.1
git push --tags        # → Actions builds, signs, and attaches the APK to a Release
```

`.github/workflows/android.yml` runs `build:native`, copies the assets in with `cap sync`,
and assembles a signed release APK. The version name comes from the tag; the version code
comes from the run number, so it only ever climbs — Android blocks an install whose version
code went backwards.

**Capacitor rather than a Trusted Web Activity**, because Capacitor bundles the web assets
*inside* the app. A TWA would fetch the deployed URL, so a first launch with no network
would fail — and offline-first is the app's premise, not a nicety.

### One-time signing setup

Every build must be signed with the **same** key. Sign two builds with different keys and
Android refuses the second, so you would have to uninstall first — which deletes every
expense on the device.

```sh
npm run keystore     # writes release.p12 and keystore-secrets.txt, both gitignored
```

Open `keystore-secrets.txt` and add its three values as repository secrets under
Settings → Secrets and variables → Actions:

| Secret | |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the keystore itself, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | generated, 32 characters |
| `ANDROID_KEY_ALIAS` | `spend` |

Then put `release.p12` and the password in a password manager and delete
`keystore-secrets.txt`. Lose the key and you can never again ship an update that installs
over an existing copy.

Without those secrets the workflow still runs and warns, producing an unsigned APK that
Android will not install.

`scripts/gen-keystore.mjs` writes a **PKCS#12** keystore using node-forge rather than
calling `keytool`, because `keytool` ships with the JDK and there is no JDK here. Android's
signing config reads PKCS#12 happily via `storeType 'PKCS12'`.

### Adding iOS later

`npx cap add ios` scaffolds the Xcode project, but building it needs full Xcode and
CocoaPods, and getting it onto a phone needs either a free Apple ID (the build stops working
after seven days and must be re-run from the Mac) or the $99/yr Developer Program for
TestFlight. The installed PWA avoids all of it.

## Why there is a browser test as well

Three bugs here were invisible to jsdom, and all three were in the same seam —
overlays:

1. **Pointer capture swallowed a click.** The sheet's close button sits inside the
   drag zone; `setPointerCapture` on that zone retargets the following `pointerup`,
   so the button never received a `click` at all.
2. **`history.back()` closed a sheet the instant it opened.** jsdom implements
   `history.back()` but dispatches no `popstate` for it, so the self-dismissal could
   not reproduce.
3. **StrictMode's double-invoked effect popped the shared history entry.** Effects
   run mount → cleanup → mount in development, and the cleanup gave the entry back;
   the `popstate` that followed read as the user pressing back.

`useBackDismiss` now holds one shared history entry for the whole overlay stack and
defers releasing it by a task, which a StrictMode remount cancels. `npm run test:browser`
drives the dev server in headless Chromium and walks these flows for real — it runs
against **dev**, not the preview build, because StrictMode only double-invokes there.

## Where the requirements needed a judgement call

Four places where the document was ambiguous or internally in tension. Each is commented
at the point it matters.

1. **Cold-start auto-open.** Section 5 opens the add sheet when nothing is logged today;
   section 6.1 wants a first run to show the empty Home screen with one line of copy and a
   pulsing button. So the sheet auto-opens only for a returning user — never on a first run
   with no data — and only once per launch.

2. **Sheet order.** Section 5 lists Amount, Category, Date, Note, Save top to bottom, and
   also says the chips sit *directly above the keypad* which occupies the bottom ~45%.
   Both cannot hold. The order is Amount, Date + note, Category chips, keypad, Save —
   which keeps the chips against the keypad and Save full-width in the thumb zone.

3. **Chip order vs. manual reorder.** Section 5 orders chips by recency-frequency; section
   6.4 offers manual reorder. The recency score sorts, and the manual `sortWeight` breaks
   ties. The order is also snapshotted when the sheet opens, so chips never reshuffle
   between one entry and the next.

4. **Muted ink vs. the contrast floor.** Section 9 fixes the muted role at `#898781`,
   which reads 3.5:1 on a light surface — below section 10's 4.5:1 for text. The palette
   value stays for axis lines and other non-text marks; a separate `--label` token carries
   small text. Same for the category fills: most are mid-tone, so a chip label uses a
   near-black tint of its own hue rather than white. `npm run lint:contrast` proves it.

## Importing from another app

`Settings › Import CSV or JSON` takes this app's own backups and other trackers' exports.
A foreign file is detected by what it lacks — a `categoryId` on expenses, an `id` and
palette slot on categories — because reading one as native would quietly wreck it: an
amount of `6.2` taken as minor units is six cents, and a missing `categoryId` collapses
every row into one nameless category. Conversion handles:

- **Amounts in major units** (`6.2` → `620`), rounded through a float-safe path so
  `4.975` becomes `498` rather than `497`.
- **Categories referenced by name.** A name already on the device keeps its id, colour and
  cap; anything new is created with an icon guessed from the name. The file's own hex
  colours are dropped — section 9 fixes the palette and colour follows a category by
  creation order.
- **Missing fields**: currency comes from settings, `createdAt` from the date at midday.
- **Alternate field names** (`value`, `description`, `categoryName`), ISO timestamps or
  epoch millis in `date`, and a bare top-level array of expenses.

Rows with no readable date or a zero amount are skipped rather than imported as noise.
Afterwards Settings shows exactly what was converted — amounts scaled, half-cents rounded,
categories matched versus created, fields ignored — and the toast carries an Undo.

## Verification

Done here, and re-runnable:

- 121 tests green, including the three-taps-to-save and three-in-a-row-without-reopening
  flows, Undo on every destructive action, the CSV/JSON round trips, and real IndexedDB
  reads and writes through `fake-indexeddb`.
- Copy and contrast lints clean; production build clean; the service worker precaches the
  whole shell with `index.html` as the navigation fallback.

Still worth doing on a real phone, per section 14:

1. Stopwatch the first save from a cold open.
2. Add to Home Screen on iOS Safari and Android Chrome.
3. Airplane mode, force-quit, reopen: full function, data intact.
4. Export JSON, delete all data, re-import, confirm the round trip.
5. Toggle OS dark mode and walk all four screens with data present.

Use `npm run preview:lan` for 2 and 3 — the service worker and install prompt need HTTPS or
localhost, so serve it over a tunnel (or add `@vitejs/plugin-basic-ssl`, already installed)
when testing from a phone by IP.

`Settings › Development` has a sample-data loader in dev builds, which fills three months so
the charts and the insight rules have something to work with.
