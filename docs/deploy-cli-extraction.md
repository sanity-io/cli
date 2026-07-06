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

The four entry points, exported from `@sanity/cli-deploy/_internal/deploy`:

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
    uploadSchemaAndManifest: () => Promise<StudioManifest | null>
  },
): Promise<DeployOutcome>

function deployCoreApp(
  o: DeployContext & {
    appId: string | undefined
    organizationId: string | undefined
    extractManifest: () => Promise<CoreAppManifest | undefined>
  },
): Promise<DeployOutcome>

function undeployCoreApp(o: {
  output: Output
  isUnattended: boolean
  appId: string // required — nothing to undeploy without it
}): Promise<UndeployOutcome>

function undeployStudio(
  o: {
    output: Output
    isUnattended: boolean
  } & ({appId: string} | {studioHost: string; projectId: string}),
): Promise<UndeployOutcome>
```

Return types — data only, no printing:

```ts
type DeployOutcome =
  | {kind: 'deployed'; result: DeployResult}
  | {kind: 'dry-run'; plan: DeploymentPlan}

interface DeployResult {
  applicationId: string
  applicationType: 'coreApp' | 'studio'
  applicationVersion: string // installed sanity / @sanity/sdk-react
  location: string | null // studio URL; null for core apps
}

type UndeployOutcome = {
  kind: 'undeployed'
  application: {id: string; type: 'coreApp' | 'studio'; appHost: string; title: string | null}
} | null // nothing to undeploy — the target didn't resolve to an existing application
```

`DeployResult` and `DeploymentPlan` already exist on the in-flight `feat/deploy-json`
branch ([`deployRunner.ts`](../packages/@sanity/cli/src/actions/deploy/deployRunner.ts),
`deploymentPlan.ts`). This plan adopts them rather than inventing new shapes.

### Design rules behind the fields

Names match `@sanity/cli-build` wherever the concept is shared: `output`, `workDir`,
`isUnattended` (also the `SanityCommand.isUnattended()` method), `autoUpdatesEnabled`,
`exposes`. `sourceDir` is the one deliberate divergence from build's `outDir` — deploy
reads and uploads the directory, it doesn't write it.

Optional vs. required is strict, and each `| undefined` earns its place:

- `deploy*.appId` / `projectId` / `organizationId` / `studioHost` stay optional because
  missing config is a real input the package turns into a failing check
  (`NO_PROJECT_ID`, `NO_ORGANIZATION_ID`) — the dry-run report needs to name the problem.
- `deploy*.appId` optional also covers the first deploy, where the package resolves,
  prompts for, or creates the target.
- `undeployCoreApp.appId` is **required** — an SDK app with no appId has nothing to remove.
- `undeployStudio` is a **union**, not two optionals: you must pass an `appId`, or a
  `studioHost` + `projectId` pair. The delete endpoint is global and keyed by the
  application id, and `deployment.appId` _is_ that id, so an appId alone removes a studio.
  `projectId` + `studioHost` are only the fallback for host-only studios that never got an appId.
- `build: (() => Promise<void>) | null` — `null` is the explicit `--no-build` state.
  Forcing the caller to pass it is stricter than an optional.
- `UndeployOutcome` is `undeployed | null`, with no reason on the `null`. Because the
  inputs above make an existing target mandatory, the only way to reach "nothing to undeploy"
  inside the package is a target that didn't resolve — the missing-config cases are the
  caller's to catch first, so there's nothing to distinguish.

`exposes` (a `ResolvedWorkbenchApp`) replaces a boolean and a capability object at once.
It's plain data — `{services, views, entry?, applicationType?, installationConfig?}` — so
the package derives `isWorkbenchApp` from its presence, runs the "declares something
deployable" guard against the data, reads `installationConfig` off it, and a report can
enumerate the exposed surface. (Note: build's `WorkbenchExposes` type is missing `entry`;
type this field as `ResolvedWorkbenchApp`, or add `entry` to `WorkbenchExposes` so both
packages share one type.)

## Boundary

**Moves into `@sanity/cli-deploy`** — deploy-intrinsic, and today only the command
consumes it: `deployApp` → `deployCoreApp`, `deployStudio`, `deployRunner`, `deployChecks`,
`deploymentPlan`, `resolveDeployTarget`, `findUserApplication`, `createUserApplication`,
`installationConfigDeployment`, `checkDir`, `urlUtils`, `deployDebug`, the undeploy
resolver, and the API client `services/userApplications.ts` (it needs only manifest
_types_, which already live in `@sanity/cli-core`).

**Stays in `@sanity/cli`, injected as callbacks** — shared with other commands, so it
can't move: the build wrappers (`build`), the studio schema/manifest worker
(`uploadSchemaAndManifest`), and core-app manifest extraction (`extractManifest`). These
sit on `actions/manifest` and `actions/schema`, used by `dev` and `manifest extract`.

**Moves to `@sanity/cli-core`** — pure config resolvers now shared by build, dev, deploy,
_and_ undeploy: `getAppId` / `resolveAppIdIssue` ([`util/appId.ts`](../packages/@sanity/cli/src/util/appId.ts))
and `resolveAutoUpdates` + its message helpers ([`shouldAutoUpdate.ts`](../packages/@sanity/cli/src/actions/build/shouldAutoUpdate.ts)).

**Thin adapters left behind** — `commands/deploy.ts` and `commands/undeploy.ts` resolve
config to primitives, inject the callbacks, own the oclif flags and the user-facing copy,
and turn a `DeployOutcome` into human output or `--json`.

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

The entry points return `DeployOutcome` / `UndeployOutcome`. A failing check throws a typed
`DeployCheckError` (message + exit code) instead of `output.error(msg, {exit})`. The
commands catch it and exit; they also own the `--json` vs. human rendering
(`renderDeploymentPlan` / `deploymentPlanToJson` become caller-side).

- The core behavioural refactor. Coordinate with `feat/deploy-json`, which already pushes
  presentation to the edges — rebase onto it or land this there first.
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

The actions take `build`, `uploadSchemaAndManifest`, and `extractManifest` as callbacks.
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

### Phase 7 — Move the undeploy entries into the package

Turn `getStudioOrAppUserApplication` into `undeployStudio` / `undeployCoreApp` behind the
package export, reusing `resolveDeployTarget` for the studio lookup. `commands/undeploy.ts`
becomes an adapter like `deploy`.

- Small; the API client already moved in Phase 6.
- **Done when:** `commands/undeploy.ts` imports its entry points from `@sanity/cli-deploy`.

### Phase 8 — Adopt in runtime-cli (external)

`runtime-cli` depends on `@sanity/cli-deploy` and wires its own `build` /
`uploadSchemaAndManifest` / `extractManifest`, consuming the returned outcomes for its own
reporting. Lands in the `runtime-cli` repo, out of scope here, but it's the reason for the
shape.

## Non-goals

- No change to deploy behaviour, output, or exit codes for CLI users.
- No new deploy features. `--json` is the `feat/deploy-json` branch's work; this plan only
  makes its result types the package's contract.
- Manifest and schema extraction stay in `@sanity/cli`. Moving that shared stack is a
  separate effort.

## Risks and coordination

- **`feat/deploy-json` overlaps Phase 2.** Both rework the same runner. Sequence them — do
  not develop in parallel. Rebasing this work onto that branch is the cleaner path.
- **API client scope.** The studio undeploy short-circuit assumes the delete endpoint
  accepts a studio delete by application id without the project scope. The code path is
  global; confirm against the user-applications API before relying on it.
- **Worker packaging.** The studio schema worker resolves itself via
  `new URL(..., import.meta.url)` and stays in `@sanity/cli`. Keeping it out of the moved
  package (injected instead) sidesteps shipping a worker inside a dependency.
