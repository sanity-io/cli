# Dependency sharing

`shared-dependencies.ts` owns the sharing policy. To add an approved dependency, add one declaration:

```ts
{name: '@scope/package', scopeKey: 'package', share: true}
```

`share` makes consumed public imports eligible as providers. `required` disables sharing when the package is absent; `sameVersionAs` requires an exact peer match. `requireRootImport` also requires a discovered import of the package root (React needs this to keep hook identity with its renderer). Every declaration contributes its installed version (or `none`) to the compatibility scope. Keep scope keys stable: changing the tuple isolates the build from older tuples.

`build-federated-app.ts` follows Vite's production graph, including compiler-generated imports and transitive subpaths. It records actual package roots and versions. Uncertain resolution, aliases, duplicate copies, or patched packages keep the group local.

It runs discovery before constructing the federation plugin, which fixes its providers at creation time. The configuration factory recreates Sanity plugins for each pass; discovery retains resolution and transforms but skips output and finalization hooks. The final build generates the standalone app and federation remote.

`plugin-module-federation.ts` configures exact, lazy providers and writes their scope into the manifest. Provider fallbacks stay outside expose preload lists so loading can reuse an existing provider before downloading a local fallback. Workbench reads the scope before container initialization.

When styled-components is shared, `render-remote.ts` imports its `StyleSheetManager` and gives each mounted root a separate target. A shared default stylesheet lets global rules collide across apps; a target per root also makes unmount cleanup independent. Apps without shared styled-components emit no styled-components import.

The discovery pass still executes user resolution, transformation, and setup hooks. Object-form user plugins retain their closures across passes, and plugins that allocate resources in setup need a separate discovery lifecycle before this can ship with arbitrary Vite plugins. The local Module Federation patch is another release prerequisite.

The `@module-federation/vite@1.21.0` workspace patch keeps non-singleton providers lazy in custom scopes and treats the `federation` environment as a browser build. It does not propagate to published CLI packages: shipping needs an upstream release with both fixes.
