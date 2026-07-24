# Bundled-distribution experiment for `@sanity/cli`

Proof-of-concept publish pipeline that attacks cold `npx` start time. The
bottleneck is install size, not code speed: `npx --yes @sanity/cli@7.12.1`
downloads and extracts **306MB / 621 packages** before the process even boots.

## Results (2026-07-23, M-series laptop, fast network)

| distribution              | cold `npx … --help` | installed size     | warm boot              |
| ------------------------- | ------------------- | ------------------ | ---------------------- |
| `sanity@6.6.0` (monolith) | 34.0s               | 475MB / 343 pkgs   | ~0.9s                  |
| `@sanity/cli@7.12.1`      | 21.8s               | 306MB / 621 pkgs   | ~0.9s                  |
| `vercel@latest` (anchor)  | 9.8s                | 163MB              | —                      |
| **safe variant**          | 8.1s                | 91MB / 141 pkgs    | ~0.1s (direct bin)     |
| **aggressive variant**    | **4.3s**            | **26MB / 20 pkgs** | **~0.1s** (direct bin) |

Medians of 3 cold runs, fresh npm cache per run. Eval-shaped `login --help`
cold: 4.3s (aggressive). Both tarballs: 2.9MB.

## Two variants (`BUNDLE_VARIANT` env for `bundle.mjs`)

- **safe** (`BUNDLE_VARIANT=safe`): `vite`, `vite-node`, `tsx`, `jsdom` ship
  as real dependencies. Workers resolve them exactly like the unbundled CLI —
  zero resolution-hook exposure on worker threads. The hook only serves the
  inert `@module-federation/dts-plugin` stub and `@sanity/codegen` (imported
  by the dev server's typegen plugin, main thread only). Conservative
  shipping candidate.
- **aggressive** (default): the dev toolchain is not installed at all; a
  module-resolution hook installs it once on demand into `~/.sanity/cli-jit`
  (project-local installs win when present). 26MB base install; toolchain
  cost is only paid by dev-shaped commands.

Both variants share: multi-entry rolldown bundle with stable module paths,
JIT stub commands for `@sanity/runtime-cli` + `@sanity/codegen`
(typegen/functions/blueprints install-on-first-use; help ships in the merged
oclif manifest and versions are exact-pinned at build time), worker stubs and
url-ref stubs in `_chunks/`, `static/` favicons vendored from cli-build.

## How to build

```
pnpm build:cli
npm i --no-save rolldown        # bundler dependency, not in the workspace
node scripts/bundle-experiment/bundle.mjs                      # aggressive → .bundle-stage/
BUNDLE_VARIANT=safe node scripts/bundle-experiment/bundle.mjs  # safe → .bundle-stage-safe/
```

## Validation (see `validate/`)

Near-formal confidence was the goal: exhaustive checks wherever the space is
enumerable, control-diffing everywhere else. The control is the UNBUNDLED CLI
packed with `pnpm pack` and npm-installed the same way (a git checkout
behaves differently for install-detection and paths).

- **Module linking, exhaustive** (`validate/link-check.mjs`): every JS module
  in the installed bundle imported — workers inside real worker threads with
  the JIT hook forwarded via execArgv exactly like production. Both variants:
  **1,449/1,449 modules link** (worker guard-throws from missing env/messages
  expected and counted separately). Mechanically rules out the entire
  cannot-find-module/package/export bug class for all code.
- **Help parity, exhaustive** (`validate/parity.mjs help`): all **109 command
  ids** — bundled vs control, normalized (version strings, install paths,
  one-time JIT lines).
- **Execution parity** (`validate/parity.mjs exec`): every command (minus 8
  browser-opening/long-running) run to its natural boundary — real output,
  usage error, or auth wall — in a neutral dir AND inside
  `fixtures/basic-studio`; exit codes + normalized output compared.
- **Deep artifact checks**: `schema extract` byte-identical to control;
  `build --no-minify` same artifact file list; `sanity dev` serves; `manifest
extract` matches; `typegen generate` reaches the same boundary error
  through the JIT stub as the control's real plugin.
- **Node floor (22.12)**: boots, `schema extract` end-to-end cold
  (byte-identical output) through the async-hooks fallback. Known upstream
  issue at the floor: studio-worker commands can exit 134 (SIGABRT) AFTER
  printing complete correct output — rolldown native-thread teardown;
  reproduced identically with the unbundled control, NOT a bundling
  regression (does not occur on node 26).
- **e2e**: help e2e passes against the staged binary via `E2E_BINARY_PATH`;
  PTY-based e2e (dev/init) fails identically for bundled AND control in this
  sandbox (node-pty `posix_spawnp` — environmental).

### Bugs found by the exhaustive pass (all fixed)

1. **Hook re-entrancy hang (the aggressive variant's worker hang):**
   `createRequire().resolve()` inside a `module.registerHooks` resolve hook
   re-enters the hook for the same specifier. Main thread: re-entrant default
   resolution succeeds. Worker threads: it fails → recursion until stack
   overflow → RangeError swallowed by the fallback try/catch → retry, forever
   (silent spin; `sample` shows ~8.5k interpreter frames +
   `Isolate::StackOverflow`). Fixed with per-specifier in-flight guards in
   all three hook frontends. Also: `next()` with an overridden parentURL from
   a sync hook deadlocks a worker's link phase — directory-anchored
   resolution uses createRequire exclusively.
2. JIT stub relative-import depth off by one for every stubbed command
   (help worked — it never loads the stub; running the command crashed).
3. `require('jsdom')` (CJS) not served: CJS require ignores parentURL
   overrides passed to next() — needs the explicit createRequire path.
4. Runtime-computed `new URL('x.js', import.meta.url)` module refs
   (iconResolver/sanitizeIcon) break when the referencing module is hoisted
   into `_chunks/` — generic url-ref stub emission.
5. `@sanity/codegen` exports its command class named, not default — the JIT
   stub now falls back like oclif's module loader.
6. jsonc-parser's UMD `main` breaks when chunked — aliased to its ESM build.
7. Named-importing `registerHooks` is a link-time error on node < 22.15 —
   feature-detect off the namespace; fall back to async `module.register` +
   `Module._resolveFilename` patch.
8. Version skew: JIT-installed packages must be exact-pinned — a floating
   `^17.1.0` let the runtime install 17.2.0 while help shipped 17.1.0 flags.
9. Vite-node executes task files through Vite's resolver, which ignores Node
   module hooks — `jsdom` is now `ssr.external` in studioWorkerLoader (also
   an upstream win: stops piping ~10MB of jsdom through the Vite transform on
   every studio config read).
10. Found by live UAT (not the harness — nothing imports it, so link-check
    can't see it): `bootstrapLocalTemplate` and `codemod` located the package
    root via fixed-depth `path.resolve(import.meta.dirname, '../../..')`,
    which points one level too high when the module is hoisted into
    `_chunks/` — `sanity init` failed to bootstrap templates. Fixed with
    `package-directory` walk-up (depth-independent).

## Source changes this depends on (in this branch)

- `@sanity/cli` `util/loadEnv.ts`: Vite's `loadEnv` reimplemented with
  `dotenv` + `dotenv-expand` — the prerun hook runs on EVERY command and
  previously imported all of vite for it.
- `@sanity/cli-core`: worker spawns forward the JIT hook via `execArgv` when
  `SANITY_CLI_JIT_HOOK` is set (no-op otherwise); `jsdom` is `ssr.external`
  in the studio worker's vite config.

## Known gaps / next steps

- JIT install needs a lockfile/integrity story and probably a consent prompt;
  two cache layouts (toolchain set vs per-plugin) should be consolidated.
- `bench-cold-start.sh <spec|tarball> [runs] [args…]` should become a CI gate
  with a hard budget.
- e2e suite should run against the staged tarball in CI (credentials + real
  PTY); Linux untested locally (no Docker on this machine).
- Templates could add the dev toolchain to scaffolded projects' devDeps so
  `sanity dev` resolves it from the project instead of the JIT cache.
- If the `sanity` npm package name keeps pointing at the studio monolith,
  none of this helps `npx sanity@latest` — the dist-tag/bin handover is a
  product decision that has to land with this.
