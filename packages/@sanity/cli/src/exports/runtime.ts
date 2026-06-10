// Browser-safe runtime authoring helpers for the workbench extension API.
//
// View/service src files bundle to the browser, so this entry re-exports ONLY
// from `@sanity/federation` (a pure, dependency-light package) — it must never
// import `@sanity/cli-core` or anything Node-only, or it would drag the CLI
// into the frontend bundle. The `sanity` runtime package re-exports from here,
// so the same constraint protects it.
//
// `unstable_defineApp` is config-time (Node) and stays on the main `@sanity/cli`
// entry; only the runtime helpers live here.
export {unstable_defineService, unstable_defineView} from '@sanity/federation'
