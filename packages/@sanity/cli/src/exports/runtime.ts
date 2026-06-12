// Browser-safe runtime authoring helpers for the module-federation extension API.
//
// View/service src files bundle to the browser, so this entry re-exports ONLY
// from dependency-light, browser-safe modules — it must never import
// `@sanity/cli-core` or anything Node-only, or it would drag the CLI into the
// frontend bundle. The `sanity` runtime package re-exports from here, so the
// same constraint protects it.
//
// `unstable_defineApp` is config-time (Node) and stays on the main `@sanity/cli`
// entry; only the runtime helpers live here.
export type {
  DefinedService,
  DefinedView,
  InterfaceType,
  PanelComponent,
  PanelViewComponents,
  PanelViewProps,
  ServiceCallback,
  ServiceContext,
  ServiceInfo,
  ServiceType,
  ViewComponentsByType,
} from '@sanity/cli-build/_internal/federation'
export {unstable_defineService, unstable_defineView} from '@sanity/cli-build/_internal/federation'
