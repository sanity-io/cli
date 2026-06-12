// Browser-safe module-federation extension API — the canonical source for the
// `unstable_define*` authoring helpers and their contract. Lives in
// `@sanity/cli-build` (alongside the vite plugin that consumes the same
// contract) so there is a single source of truth; `@sanity/cli` re-exports it on
// its public `.` and `/runtime` entries (→ `sanity/cli` and `sanity`).
//
// This entry's module graph is zod-only — no `node:*`, no `@sanity/cli-core`, no
// vite — so `@sanity/cli/runtime` re-exporting it stays browser-safe under
// per-entry resolution, exactly as the Node-only `./vite` and `./_internal/*`
// entries don't leak into it.
export type {InterfaceType, ServiceType} from '../../workbench/contract.js'
export {unstable_defineApp} from '../../workbench/defineApp.js'
export type {DefineAppInput, DefineAppResult, DockGroup} from '../../workbench/defineApp.js'
export {unstable_defineService} from '../../workbench/defineService.js'
export type {
  DefinedService,
  ServiceCallback,
  ServiceContext,
  ServiceInfo,
} from '../../workbench/defineService.js'
export {unstable_defineView} from '../../workbench/defineView.js'
export type {
  DefinedView,
  PanelComponent,
  PanelViewComponents,
  PanelViewProps,
  ViewComponentsByType,
} from '../../workbench/defineView.js'
