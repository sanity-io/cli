# Optimizing CLI bundling for cold starts

## Proposal

`npx sanity@latest –yes` cold start time runs a bit long in current state due to dependency resolution, requiring a \~306MB download before the process starts. This has been demonstrated to take \~22s in favorable network conditions, with no available npm package cache, or zero hits to an existing one. For slower networks, this lengthy install time risks exceeding command timeouts: for example, Agent 2027’s eval suites (an external vendor we use at Sanity to determine agent readiness) sets a hard cap of 90s before failing a run; likewise, first-time Sanity CLI users experience unnecessary friction, which may negatively impact platform adoption.

We propose shipping a bundle optimization that moves most dependencies unrelated to CLI runtime requirements to just-in-time resolution. We’ve piloted several options, from minor tweaks via deferred, async imports, to aggressive, specialized JIT compilation techniques. There’s a range of possible outcomes that span 10-80% speedups in cold-start time. As it’s important to make sure future package additions require little-to-no specialized plumbing, we’ve prioritized maintainability over pure cold-start reduction, and landed on reducing external dependency resolution from \~306MB to \~90MB, reducing average time to start from \~22s to \~8.5s, a \~61% reduction.

## Data

Cold starts are the median of 3 runs with a fresh npm cache, on a reasonably fast local wifi network, against macos native system and linux (amd, arm) containers running on M5 silicon.

Note: warm start improves from \~0.9s \~0.1s; the published tarball is 2.8MB.

| distribution                    | cold \`npx sanity… –help\` | installed size     |
| :------------------------------ | :------------------------- | :----------------- |
| `sanity@6.6.0` (studio package) | 34.0s                      | 475MB / 343 pkgs   |
| `@sanity/cli@7.12.1` (today)    | 21.8s                      | 306MB / 621 pkgs   |
| `vercel@latest` (reference)     | 9.8s                       | 163MB              |
| this work (bundled)             | \~8.2s                     | \~90MB / \~37 pkgs |

## Method

CLI code and CLI-specific dependencies are compiled into the package at build time. Development and build tooling like vite, vite-node, tsx, jsdom, etc.ship as ordinary npm dependencies, which allows worker threads to resolve them with Node (ie., ordinary module resolution behavior). Notably, \`@sanity/codegen\` loads \~73MB of TypeScript dependencies (ex., Babel), which is only used for typegen, is loaded on-demand: the first dev/build-dependent command that needs TS either resolves it from local project dependencies or installs it just-in-time (JIT) to a per-user cache \`\~/.sanity/cli-jit\`. Several CLI commands never touch TS dependencies directly, like login, init, dataset/document commands, \`--help\`, etc. and never pay the install tax. Plugin command groups like typegen, functions, and blueprints follow the same install-on-first-use pattern as dev dependencies.

## Drive-bys

Related changes were required to get JIT module resolution to play nicely. Some of these were latent issues that went undiscovered until the experimental bundling project took off, including:

### Vite imported on every command

Environment file loading used to be part of the pre-run hook, which loaded vite on every invocation. We’ve replaced that with dotenv / dotenv-expand.

### Codegen lazy-loading

@sanity/codegen is deferred to keep it out of the critical path (a single call site).

### jsdom resolved by Node, not Vite

By having Node resolve jsdom instead of vite’s transform (on studio config reads), we defer \~10MB of unrelated dependency resolution from the CLI critical path.

### Package root lookups restructured to allow chunking

\`package-directory\` is used to switch root lookups to “walk ups”, allowing code to be hoisted into a bundle chunk and deferred for JIT resolution.

### \`swc\` worker file corruption bug fixed

During cross-platform testing, we saw intermittent worker file corruption due to the collision of \`worker.ts\` and \`worker.js\`. The build config now excludes \`worker.js\`. This was a silent no-op error in current builds that’s now fixed for both. We might consider introducing this fix if we pass on the bundling option called out in this doc.

## Validation

All methods called out below were run as a control vs bundle comparisons, against Sanity CLI \`@latest\`, across all supported architectures except Windows (TBD, pending alignment).

### Module linking

Every JS module in the installed bundle imported successfully: 1,444 modules plus 30 worker files loaded inside real worker threads, on every environment. This rules out the entire \`cannot-find-module class for shipped code\` failure mode.

### Command parity

All 109 commands IDs compared and executed to natural stopping point (output, expected usage error, or auth wall); note, `--help` matched for every command; commands run inside and outside a studio project showed no differences.

### Full CI e2e suite

Run in Linux containers (arm64 and x64, Node 22 and 26). In every cell the failure set was identical: zero failures attributable to bundling. Node 26 was fully green; Node 22 displayed identical, unrelated \`pnpm\` failures in bundle vs control. Interactive PTY flows, studio deploys, and workbench all passed.

### Live end-to-end execution

A full credentialed run against a real project: login, init, schema deploy, studio deploy to a live URL, cleanup, passed as expected with the bundled Sanity CLI.

Note, on Node 22 only, some studio-worker commands print correct output and then exit via a signal instead of an exit code due to a native-thread teardown quirk in the underlying bundler. It's intermittent and affects both bundle and control equally (we caught it landing on each side on different commands in the same run). It does not occur on Node 26\.

## Confidence and known gaps

### High (verified)

Behavior parity on macOS and Linux, both architectures, Node 22–26; interactive flows; real-infrastructure write paths.

### Moderate (tested by proxy)

Native x64 hardware (tested under Rosetta translation; GitHub runners would close this the first time CI runs); Node 24 (bracketed by 22 and 26).

### Low (untested)

No tests executed against Windows architecture. Although the CLI’s \`doImport\` file resolution wrapper over native, deferred \`import\` behavior largely derisks this path, we’ll consider full e2e test parity against Windows a release criterion.

Without additional source-mapping capability, stack traces from bundled code may complicate error triage. We’d recommend debug logging capability be put in place as a fast follow, pre-release.

## Maintainability and tradeoffs

The most aggressive bundling mechanism we tried relied on custom runtime resolution behavior that was deemed too risky to ship. We discarded it in favor of battle-tested, native JavaScript deferred module resolution, and still achieved meaningful cold-start latency reduction. That said, some complexity remains; Sanity CLI experts are encouraged to weigh in on these decision points:

### The bundler

Adding new dependencies requires classification (inline vs external), and possibly stubbing if a static reference is required up front to do runtime resolution.

### Dev experience: “install on first use”

Keeping the base install small requires JIT dependency resolution for \`@sanity/codegen\` and heavier plugin command groups called out above (functions, blueprints, etc.). This defers potential cold-start impact to those command groups on first run in an otherwise fresh npm cache environment; it’s worth paying attention to community feedback, as we’re essentially pushing latency down from top-level CLI install to command runtime once, in certain cases.

### The inert \`dts-plugin\` stub

This dependency ships bundled, but the cleaner long-term fix would be lazy-loading, rather than importing eagerly. Its size (\~30MB) makes that decision consequential, and worth auditing pre-release. In current state of the bundler, we opt for a stub, which is a bit magical, but not overly complex.

## Proposed benchmarks and safe-release criteria

`bench-cold-start.sh` emits cold-start data: the next step is wiring it into CI against the packed tarball with a fresh npm cache. Suggested gates, anchored on measured values (\~90MB / \~8.2s cold / \~3.5s warm) with headroom:

- Installed size \< 110MB, top-level package count \< 45: this measures dependency tree bloat. Size is the hard gate; package count can be a soft warning.

- \`npx sanity@latest –help\` cold-start median latency 12s, warm 5s: we recommend some buffer (+50% of expected baseline) to avoid false negatives when network blips occur in CI.

- Link check failures \= 0, swc worker race detection (more than one \`sourceMappingURL\` per built file): these are correctness decisions (pass/fail).

## Proposed launch plan

### Release an experimental tagged build (opt-in)

We’d publish a prerelease Sanity CLI version, leveraging existing experimental build semantics or creating a new pattern for reuse. This allows us to bake the bundle-optimized build, dogfood, and get community feedback, as well as validate our primary use case (Agent 2027 eval cold-start issues resolved) before standardizing. Rollback is simple: we unpublish the experimental release, or repoint it at a stable build. \`bundle.mjs\` produces the tarball, we can derisk this path by leveraging [https://www.verdaccio.org/](https://www.verdaccio.org/) to dry-run an npm release against a local package registry.

## Open questions

- Integrity/consent story for the install-on-first-use path (lockfile/hash pinning, a consent prompt, defined offline behavior)

- The `esbuild` postinstall is skipped in the on-demand install (`allow-scripts` warning) — verify `dev`/`build` don't need its native binary. Low risk (Vite 8 uses rolldown/oxc); worth a one-line check.

- Consolidate the two on-demand cache layouts

- Templates could add the dev toolchain to scaffolded projects' \`devDependencies\` so \`sanity dev\` resolves it locally.
