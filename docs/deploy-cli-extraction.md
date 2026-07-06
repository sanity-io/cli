# Extracting deploy into `@sanity/cli-deploy`

## Why

`@sanity/cli-build` already lives on its own so [runtime-cli](https://github.com/sanity-io/runtime-cli)
can build studios and apps without pulling in the whole CLI. Deploy can't be
reused the same way yet. `runtime-cli` wants `deployCoreApp` / `deployStudio`
(and their undeploy pair) the same way it consumes `buildApp` / `buildStudio`.

Today the deploy action is welded to the CLI in four places:

- **oclif flags** — [`types.ts`](../packages/@sanity/cli/src/actions/deploy/types.ts)
  derives its options from `DeployCommand['flags']`, so it imports the command class.
- **`process.exit`** — failing checks call `output.error(msg, {exit})`. A library
  can't own the exit decision.
- **the build step** — `deployStudio`/`deployApp` call the CLI's build wrappers directly.
- **the manifest/schema stack** — the studio schema worker sits on `actions/manifest`
  and `actions/schema`, which `dev` and `manifest extract` also use. Not deploy-specific.

The end state mirrors `@sanity/cli-build`: entry points that take resolved values
plus injected callbacks, return data, and leave presentation and process control
to the caller.

## Goal: the interfaces

The entry points, exported from `@sanity/cli-deploy/_internal/deploy`:

```ts
interface DeployContext {
  output: Output
  workDir: string
  sourceDir: string
  isUnattended: boolean
  autoUpdatesEnabled: boolean
  dryRun: boolean
  build: (() => Promise<void>) | null // null = --no-build (validate existing output)
  exposes?: ResolvedWorkbenchApp // absent = plain project
}

function deployStudio(
  o: DeployContext & {
    appId: string | undefined // undefined = resolve or create a target
    projectId: string | undefined
    studioHost: string | undefined
    external: boolean
    deployStudioSchema: () => Promise<StudioManifest | null>
  },
): Promise<Deployment>

function deployCoreApp(
  o: DeployContext & {
    appId: string | undefined
    organizationId: string | undefined
    extractManifest: () => Promise<CoreAppManifest | undefined>
  },
): Promise<Deployment>

// Resolve the target first with the exported resolveStudioDeployTarget /
// resolveAppDeployTarget, then hand the resolved application to undeploy. Once
// resolved it's the same for both kinds — the delete is global, the appType
// comes from application.type.
function undeploy(o: {
  output: Output
  isUnattended: boolean
  application: {id: string; type: 'coreApp' | 'studio'; appHost: string; title: string | null}
}): Promise<void>
```

Return types — data only, no printing:

```ts
type Deployment = {deployed: true; result: DeployResult} | {deployed: false; plan: DeploymentPlan} // dry run

interface DeployResult {
  applicationId: string
  applicationType: 'coreApp' | 'studio'
  applicationVersion: string // installed sanity / @sanity/sdk-react
  location: string | null // studio URL; null for core apps
}

class DeployError extends Error {
  check: DeployCheck // the failing check: message, solution, exitCode
}
```

### Errors and control flow

- `deployStudio` / `deployCoreApp` return a `Deployment` on success and on `--dry-run` — a
  blocked dry run is data (`deployed: false`), not a throw.
- A real deploy blocked by a failing check throws `DeployError`, carrying the `DeployCheck`
  it stopped on (`message`, `solution`, `exitCode`).
- Unexpected failures — network, build, schema extraction, filesystem — propagate unwrapped.
- `undeploy` operates on an already-resolved application; the caller resolves the target first
  and skips the call when nothing resolves. It throws only on an API failure.
- Ctrl+C at a prompt surfaces as the prompt library's `ExitPromptError` and propagates.
- `DeployError` is exported, so callers can tell a blocking check from an unexpected failure.

## Boundary

**Moves into `@sanity/cli-deploy`** — deploy-intrinsic, and today only the command
consumes it: `deployApp` → `deployCoreApp`, `deployStudio`, `deployRunner`, `deployChecks`,
`deploymentPlan`, `resolveDeployTarget`, `findUserApplication`, `createUserApplication`,
`installationConfigDeployment`, `checkDir`, `urlUtils`, `deployDebug`, `undeploy`, and the
API client `services/userApplications.ts` (it needs only manifest _types_, which already
live in `@sanity/cli-core`).

**Stays in `@sanity/cli`, injected as callbacks** — shared with other commands, so it
can't move: the build wrappers (`build`), the studio schema/manifest worker
(`deployStudioSchema`), and core-app manifest extraction (`extractManifest`). These
sit on `actions/manifest` and `actions/schema`, used by `dev` and `manifest extract`.

**Moves to `@sanity/cli-core`** — pure config resolvers now shared by build, dev, deploy,
_and_ undeploy: `getAppId` / `resolveAppIdIssue` ([`util/appId.ts`](../packages/@sanity/cli/src/util/appId.ts))
and `resolveAutoUpdates` + its message helpers ([`shouldAutoUpdate.ts`](../packages/@sanity/cli/src/actions/build/shouldAutoUpdate.ts)).

**Thin adapters left behind** — `commands/deploy.ts` and `commands/undeploy.ts` resolve
config to primitives, inject the callbacks, own the oclif flags and the user-facing copy,
and turn a `Deployment` into human output or `--json`.

## Phases

Each phase is one PR unless noted. The CLI stays green and behaviour is unchanged at every
step until the package is consumed — these are refactors, not feature changes. The
extraction (Phase 6) is a no-op move; all the shape work happens before it, in place.

### Phase 1 — Decouple the deploy/undeploy actions from oclif flags

Replace `flags: DeployFlags` (and the `DeployCommand` import) with an explicit options
type of plain booleans and strings. The commands map their parsed flags onto it.

- Mechanical, no behaviour change.
- Removes the action → command import, the one hard blocker to moving anything.
- **Done when:** nothing under `actions/deploy` imports from `commands/`.

### Phase 2 — Return outcomes; stop exiting the process for control flow

`deployStudio` / `deployCoreApp` return `Deployment`. A failing check throws a typed
`DeployError` (message + exit code) instead of `output.error(msg, {exit})`. The
commands catch it and exit; they also own the `--json` vs. human rendering
(`renderDeploymentPlan` / `deploymentPlanToJson` become caller-side).

- May split: **2a** return values on the success and dry-run paths; **2b** replace the
  `process.exit` calls with thrown errors.
- **Done when:** no `actions/deploy` code calls `output.error(..., {exit})`; `output` is
  used only for progress.

### Phase 3 — Resolve workbench to `exposes` data

The actions take `exposes?: ResolvedWorkbenchApp` instead of calling `getWorkbench(cliConfig)`.
Derive `isWorkbenchApp` from its presence, run the deployable guard on the data, and read
`installationConfig` off it. The command resolves `resolveWorkbenchApp(cliConfig)` and
passes the result.

- Drops the capability-object dependency; unblocks reports listing the exposed surface.
- Small: touches `deployApp`, `deployChecks` (`verifyOutputDir`), and the command.
- **Done when:** `actions/deploy` no longer imports `getWorkbench`.

### Phase 4 — Lift shared config resolvers into `@sanity/cli-core`

Move `getAppId` / `resolveAppIdIssue` and `resolveAutoUpdates` + message helpers into
`@sanity/cli-core`, re-export from the old paths to keep this PR a pure move. Update deploy,
build, and dev to import from cli-core.

- Independent of the rest; ships on its own.
- **Done when:** the resolvers live in cli-core and deploy imports them from there.

### Phase 5 — Inject build and manifest/schema extraction

The actions take `build`, `deployStudioSchema`, and `extractManifest` as callbacks.
The command wires the existing `buildStudio`/`buildApp`, the schema worker, and
`extractCoreAppManifest`. Schema-error formatting moves into the injected callback so the
action needn't know `SchemaExtractionError`.

- After this, `actions/deploy` imports nothing from `actions/build`, `actions/manifest`, or
  `actions/schema`.
- **Done when:** the deploy action's only workspace imports are `@sanity/cli-core` and
  `@sanity/workbench-cli`.

### Phase 6 — Scaffold `@sanity/cli-deploy` and move the files

Create the package from `@sanity/cli-build`'s scaffolding (`package.json`, `tsconfig*`,
`package.config.ts`, `vitest.config.ts`, `eslint.config.mjs`). Move the leaf files and the
API client, with their tests. Export `_internal/deploy`. Add the workspace dependency and
point the command adapters at the package.

- A move, not a rewrite — Phases 1–5 already made every file movable.
- Update the API client's other importers (`undeploy`, `actions/undeploy`) to the new path.
- **Done when:** `@sanity/cli` depends on `@sanity/cli-deploy`; the suite passes; `publint`
  and depcheck are clean.

### Phase 7 — Move undeploy into the package

Replace `getStudioOrAppUserApplication` with a single `undeploy` behind the package export.
`commands/undeploy.ts` resolves the target with the exported resolvers, then calls `undeploy`
— an adapter like `deploy`.

- Small; the API client already moved in Phase 6.
- **Done when:** `commands/undeploy.ts` imports `undeploy` from `@sanity/cli-deploy`.

## Non-goals

- No change to deploy behaviour, output, or exit codes for CLI users.
- No new deploy features (`--json` output is separate work).
- Manifest and schema extraction stay in `@sanity/cli`. Moving that shared stack is a
  separate effort.

## Risks and coordination

- **API client scope.** `undeploy` deletes by application id via the global endpoint (no
  project scope). The code path is global today; confirm the user-applications API accepts a
  studio delete this way before relying on it.
- **Worker packaging.** The studio schema worker resolves itself via
  `new URL(..., import.meta.url)` and stays in `@sanity/cli`. Keeping it out of the moved
  package (injected instead) sidesteps shipping a worker inside a dependency.
