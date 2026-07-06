# Extracting deploy into `@sanity/cli-deploy`

## Why

`@sanity/cli-build` is its own package, so [runtime-cli](https://github.com/sanity-io/runtime-cli)
can build studios and apps without pulling in the whole CLI. Deploy can't be reused that way
yet. We want `deployCoreApp`, `deployStudio`, and `undeploy` to be as reusable as `buildApp`
and `buildStudio`.

Four things tie deploy to the CLI today:

- **oclif flags** — [`types.ts`](../packages/@sanity/cli/src/actions/deploy/types.ts) builds its
  options from `DeployCommand['flags']`, so it imports the command.
- **`process.exit`** — a failing check calls `output.error(msg, {exit})`. A library shouldn't
  decide when the process exits.
- **the build step** — deploy calls the CLI's build wrappers directly.
- **schema and manifest** — the studio worker sits on `actions/manifest` and `actions/schema`,
  which `dev` and `manifest extract` also use.

The goal: entry points that take plain values plus a few injected callbacks, return data, and
leave printing and exit codes to the caller — the same shape `@sanity/cli-build` already has.

## The interfaces

Exported from `@sanity/cli-deploy/_internal/deploy`:

```ts
interface DeployContext {
  output: Output
  workDir: string
  sourceDir: string
  isUnattended: boolean
  autoUpdatesEnabled: boolean
  dryRun: boolean
  build: (() => Promise<void>) | null
  exposes?: ResolvedWorkbenchApp
}

function deployStudio(
  o: DeployContext & {
    applicationId: string | undefined
    projectId: string | undefined
    studioHost: string | undefined
    external: boolean
    extractSchema: () => Promise<StudioSchema | null>
  },
): Promise<Deployment>

function deployCoreApp(
  o: DeployContext & {
    applicationId: string | undefined
    organizationId: string | undefined
    extractManifest: () => Promise<CoreAppManifest | undefined>
  },
): Promise<Deployment>

function undeploy(o: {
  applicationId: string
  type: 'coreApp' | 'studio'
}): Promise<{applicationId: string} | null>
```

Each entry takes one extraction callback — `extractSchema` for a studio, `extractManifest` for
a core app — and the deploy function does the uploading. `undeploy` returns the id it removed,
or `null` when there was nothing to remove.

```ts
type Deployment = {deployed: true; result: DeployResult} | {deployed: false; plan: DeploymentPlan}

interface DeployResult {
  applicationId: string
  applicationType: 'coreApp' | 'studio'
  applicationVersion: string
  location: string | null
}

class DeployError extends Error {
  check: DeployCheck
}
```

### Errors and control flow

- A real deploy and a dry run both return a `Deployment`. A blocked dry run is data
  (`deployed: false`), not a throw.
- A real deploy that fails a check throws `DeployError`, carrying the check that stopped it
  (its message, fix, and exit code).
- Anything unexpected — network, build, schema extraction, filesystem — propagates untouched.
- `undeploy` returns `null` when nothing was removed, and throws only if the API call fails.
- Ctrl+C at a prompt comes through as the prompt library's `ExitPromptError`.
- `DeployError` is exported, so a caller can tell a failed check from a real crash.

### How the studio schema and manifest flow

A studio deploy has to do three things with the schema: upload it, get back a descriptor id,
and put that id in the manifest. Today a single worker call does all three — convert the schema,
upload it, generate the manifest — and hands back the finished manifest. That's why the upload
is buried inside "extract the manifest."

We want to pull those apart, and we can. The descriptor id is computed locally during conversion:
`DESCRIPTOR_CONVERTER.get(schema)` returns it before any network call. The upload that follows
just persists the descriptor. So the id doesn't depend on the upload.

Where we're taking it:

- **`extractSchema`** runs in the worker (it needs the live schema) and returns the descriptor,
  its id, and each workspace's metadata. No network.
- **`deployStudio`** takes over on the main thread: uploads the descriptor, builds the manifest
  with the id, and attaches it.

The callback only extracts; `deployStudio` owns every upload. The manifest and the schema can't
drift, because the manifest carries the exact id the extraction produced.

Getting there means splitting sanity's `uploadSchema` into convert and upload — see Phase 5.
Core apps have no schema; their `extractManifest` just reads the icon and title from config.

## What moves where

**Into `@sanity/cli-deploy`** — the deploy logic, which today only the command uses: `deployApp`
→ `deployCoreApp`, `deployStudio`, `deployRunner`, `deployChecks`, `deploymentPlan`,
`resolveDeployTarget`, `findUserApplication`, `createUserApplication`,
`installationConfigDeployment`, `checkDir`, `urlUtils`, `deployDebug`, `undeploy`, and the API
client `services/userApplications.ts` (it only needs manifest _types_, which already live in
`@sanity/cli-core`).

**Stays in `@sanity/cli`, passed in as callbacks** — the build wrappers (`build`) and the two
extraction callbacks (`extractSchema`, `extractManifest`). Both are pure; the deploy functions
do the uploads. These sit on `actions/manifest` and `actions/schema`, which `dev` and `manifest
extract` share, so they can't move.

**To `@sanity/cli-core`** — the config resolvers build, dev, deploy, and undeploy all use:
`getAppId` / `resolveAppIdIssue` ([`util/appId.ts`](../packages/@sanity/cli/src/util/appId.ts))
and `resolveAutoUpdates` + its messages ([`shouldAutoUpdate.ts`](../packages/@sanity/cli/src/actions/build/shouldAutoUpdate.ts)).

**Left behind as thin adapters** — `commands/deploy.ts` and `commands/undeploy.ts`. They resolve
config to plain values, pass in the callbacks, keep the oclif flags and the user-facing text,
and turn a `Deployment` into human output or `--json`.

## Phases

One PR each. The CLI keeps working and its behaviour doesn't change until the package is wired
in — these are refactors, not new features. The move itself (Phase 7) is mechanical; all the
reshaping happens before it, in place.

### Phase 1 — Cut the oclif flag dependency

Replace `flags: DeployFlags` (and the `DeployCommand` import) with a plain options type. The
commands map their parsed flags onto it. Mechanical, no behaviour change — but it removes the
action → command import, which is the one thing blocking every later move.

- **Done when:** nothing under `actions/deploy` imports from `commands/`.

### Phase 2 — Return data; stop exiting the process

`deployStudio` / `deployCoreApp` return a `Deployment`. A failed check throws `DeployError`
instead of calling `output.error(msg, {exit})`. The commands catch it, print, and exit, and own
the `--json` vs. human rendering (`renderDeploymentPlan` / `deploymentPlanToJson` move to the
caller). This is what makes deploy usable as a library — bigger than moving files.

- May split: **2a** return values; **2b** replace the `process.exit` calls with throws.
- **Done when:** no `actions/deploy` code calls `output.error(..., {exit})`.

### Phase 3 — Pass workbench in as `exposes`

The actions take `exposes?: ResolvedWorkbenchApp` instead of calling `getWorkbench(cliConfig)`.
They derive whether it's a workbench app from its presence, run the deployable check on the
data, and read `installationConfig` off it. The command resolves it and passes it in. This also
gives a report the data it needs to list what's exposed.

- **Done when:** `actions/deploy` no longer imports `getWorkbench`.

### Phase 4 — Move the config resolvers to `@sanity/cli-core`

Move `getAppId` / `resolveAppIdIssue` and `resolveAutoUpdates` + its messages into
`@sanity/cli-core`, re-exporting from the old paths so this stays a pure move. Point deploy,
build, and dev at the new home. Independent of the rest.

- **Done when:** the resolvers live in cli-core and deploy imports them from there.

### Phase 5 — Split `uploadSchema` in `sanity`

`uploadSchema` converts the live schema and uploads it in one call. Split it: `convertSchema`
returns the descriptor and its id (already computed locally); `synchronizeDescriptor` does the
upload. Both phases already exist inside the function — this draws a line and exports both.

Lands in the `sanity` repo. The CLI resolves these from the user's installed `sanity`, so it
needs a version floor, or a fallback to the old `uploadSchema` for older installs.

- **Done when:** `sanity` exports both, with `uploadSchema` built from them.

### Phase 6 — Inject extraction; own the uploads

The actions take `build`, `extractSchema` (studio), and `extractManifest` (core app) — all pure.
`deployStudio` uploads the descriptor, builds the manifest, and attaches it via
`createDeployment`; `deployCoreApp` attaches its config manifest the same way. The command wires
the worker and `extractCoreAppManifest`. Schema errors format inside the callback, so the action
never touches `SchemaExtractionError`.

- **Done when:** the deploy action only imports `@sanity/cli-core` and `@sanity/workbench-cli`.

### Phase 7 — Create `@sanity/cli-deploy` and move the files

Scaffold the package from `@sanity/cli-build` (`package.json`, `tsconfig*`, `package.config.ts`,
`vitest.config.ts`, `eslint.config.mjs`). Move the files and their tests, export
`_internal/deploy`, add the workspace dependency, and point the command adapters at it. A move,
not a rewrite — Phases 1–6 already made every file movable.

- Point the API client's other users (`undeploy`, `actions/undeploy`) at the new path.
- **Done when:** `@sanity/cli` depends on `@sanity/cli-deploy`, the suite passes, and `publint`
  and depcheck are clean.

### Phase 8 — Move undeploy into the package

Replace `getStudioOrAppUserApplication` with `undeploy`. `commands/undeploy.ts` resolves the
target for the confirm prompt, then calls it — an adapter like `deploy`.

- **Done when:** `commands/undeploy.ts` imports `undeploy` from `@sanity/cli-deploy`.

## Non-goals

- Deploy behaviour, output, and exit codes stay the same for CLI users.
- No new deploy features. (`--json` output is separate work.)
- Schema and manifest extraction stay in `@sanity/cli`; moving that shared stack is its own job.

## Risks

- **`undeploy` inputs.** Delete is a global endpoint keyed by application id. Confirm the API
  takes a studio delete without the project scope, whether it needs the `appType` query (drop
  `type` if not), and whether it reports not-found so `undeploy` can return `null`.
- **The descriptor payload.** Phase 5 assumes the converted descriptor can cross the worker
  boundary. It's built from encodable values, so it should — worth a spike before committing.
- **Worker packaging.** The studio worker resolves itself with `new URL(..., import.meta.url)`
  and stays in `@sanity/cli`. Keeping it out of the moved package avoids shipping a worker
  inside a dependency.
