# @repo/cold-start-bench

Measures cold startup and unattended Studio setup against a local npm mirror and API fixture. No real account or prompt answers are needed.

```sh
# All milestones, both entry points, three cold runs each
pnpm bench:cold-start

# Only unattended setup; every CLI choice is supplied as a flag
pnpm bench:cold-start --mode setup --entry npm-create-sanity --runs 3

# Observe the login selector without sending keystrokes
pnpm bench:cold-start --mode prompt --runs 3

# Change the fixture scenario
pnpm bench:cold-start --mode setup --project bench123 --dataset staging --template blog
```

Options: `--mode all|setup|prompt`, `--entry all|npm-create-sanity|npx-sanity-init`, `--runs` (default 3), `--project` (default `bench123`), `--dataset` (default `production`), `--template clean|blog|moviedb` (default `clean`), and `--timeout-ms` (default 600000 per run). Project and dataset identify local fixture data, not real resources.

## Measurements

All times start immediately before spawning npm/npx. Results are separate for each entry point; there is no combined score that can hide regressions in one path.

- **Usable interaction:** `promptRuns[].markerMs` records the complete provider selector, including its choices. This is an observation of prompt readiness, not a simulated conversation or an input-latency measurement. A banner or “Fetching providers” spinner does not qualify. `entries.*.prompt.usableInteractionMs` is its median; `modeledUsableInteractionMs` adds the download model.
- **Project files generated:** `filesGeneratedMs` records the first successful check of all template assets, generated configs and dependency manifest. Checks run every 25 ms; this introduces a small observation delay. The harness reads files without loading Studio.
- **Setup complete:** `setupCompleteMs` records successful initializer exit after the real project dependency installation.
- **Studio running:** `studioRunningMs` records when the generated project's installed `sanity dev` serves the Studio HTML at its announced, OS-assigned port. This measures HTTP readiness, not browser rendering or authenticated content loading.

The time between files and setup completion exposes installation costs; the time from setup completion to Studio running exposes dev startup. Total setup is `studioRunningMs`. Failed runs retain partial milestones, errors and terminal output, and cause a nonzero exit. Summaries report medians of successful runs plus failure counts.

## Isolation and reproducibility

The harness builds and packs the working checkout, including uncommitted changes. It wraps the published `sanity@6.17.0` with those CLI packages and publishes content-addressed versions to a private local Verdaccio mirror. Use the same harness on each revision being compared. The initial registry fill can take several minutes.

Each measured run gets a fresh home, npm cache, global prefix and project directory. The setup run retains its own npm cache through project installation, so ordinary cache reuse is included. A full untimed setup warms the project's dependency mirror before setup measurements. Mirror metadata stays cached to stabilize dependency resolution.

Setup explicitly supplies project, dataset, output directory, template, TypeScript, npm and installation choices, with stdin closed. Git, MCP, skills, auto-updates and sample-data import are disabled in this scenario, including for `moviedb`. It invokes the project's local CLI bin directly for dev; it cannot fall back to a global CLI or fetch another one.

A temporary HTTPS fixture serves fixed authentication, project and dataset responses through a local proxy. Only benchmark subprocesses trust its temporary certificate. Sanity API traffic never forwards to the real API; unknown destinations or API routes fail the benchmark. Version lookups to npmjs.org route to the same local package mirror. Node headers needed by native package install scripts are mirrored in memory during warmup and included in download accounting. Requires `openssl` and a Unix process environment (the PTY and process-group cleanup are intended for macOS/Linux).

JSON output and `node_modules/.cache/cold-start-bench/history.jsonl` include revision, dirty state, Node/npm versions, scenario, packed versions, every run, and median timings. Prompt and setup runs each report downloaded bytes and requests; prompt runs also report the installed bootstrap dependency tree.

Raw local timings and modeled timings are separate. The existing model adds transfer time at 50 Mbit/s plus 40 ms round trips across 15 connections. It is an estimate, not a measured network trace, and excludes real API latency and human login time. Compare the 1–2 second prompt target with both raw and modeled readiness, alongside total setup time.
