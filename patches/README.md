# Runtime CLI patch for app functions

`@sanity__runtime-cli@17.16.0.patch` adds the experimental app-function APIs to
the published `@sanity/runtime-cli@17.16.0` package. It contains compiled
JavaScript, type declarations, and package exports. Installing this workspace
does not require a sibling runtime-cli checkout or a runtime-cli preview release.

The patch covers function building, contract generation, stack provisioning, and
deployment. It also updates the existing Blueprint operations and transpiler
used by those exports. The source implementation is maintained on the
`feat/sdk-app-functions` branch in runtime-cli.

## Using the patch in a shared example

Copy the patch into the example's `patches/` directory and add these settings to
its root `pnpm-workspace.yaml`:

```yaml
overrides:
  '@sanity/runtime-cli': 17.16.0

patchedDependencies:
  '@sanity/runtime-cli@17.16.0': patches/@sanity__runtime-cli@17.16.0.patch

packageExtensions:
  '@sanity/runtime-cli@17.16.0':
    dependencies:
      typescript-compiler: npm:typescript@6.0.3
```

Install the CLI and SDK previews in that example, run `pnpm install`, and include
the resulting lockfile when sharing it. The compiler alias must be declared
through `packageExtensions`: editing dependencies inside a package patch does
not update pnpm's dependency graph.

These settings belong to the consuming workspace. Publishing the CLI package
does not apply its workspace's patch configuration to users' projects. Run the
installed CLI with `pnpm exec sanity`; a separate `pnpm dlx` or `npx` installation
does not use this project's patched dependency.

## Updating the patch

1. Build the app-functions branch in runtime-cli.
2. From this workspace, run
   `pnpm patch @sanity/runtime-cli@17.16.0 --edit-dir /tmp/runtime-cli-patch-update`.
   pnpm applies the current patch to the editable package.
3. Copy the rebuilt `dist/functions/` directory and the `.js` and `.d.ts` files
   for these modified modules into that editable package:
   - `dist/actions/blueprints/stacks`
   - `dist/actions/blueprints/wait-for-operation`
   - `dist/cores/blueprints/deploy`
   - `dist/utils/functions/transpile/function`
4. Update the four `./functions/*` package exports if needed. Keep the package
   version at `17.16.0`; configure dependency additions in `packageExtensions`.
5. Run `pnpm patch-commit /tmp/runtime-cli-patch-update` and retain the updated
   patch, workspace settings, and lockfile together.

Verify changes with a clean install, contract generation, function compilation,
and the CLI build. Do not format the patch file: its context must match the
published package exactly.
