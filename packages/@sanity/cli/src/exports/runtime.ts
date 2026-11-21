export type {
  AssetSourceComponent,
  AssetSourceViewComponents,
  DefinedService,
  DefinedView,
  PanelComponent,
  PanelViewComponents,
  PanelViewProps,
  ServiceBus,
  ServiceCallback,
  ServiceContext,
  ServiceInfo,
  ServiceType,
  TileComponent,
  TileSize,
  TileViewComponents,
  TileViewProps,
  ViewComponentsBySurface,
  ViewSurface,
  WebWorkerBus,
  WebWorkerInfo,
  WebWorkerProps,
  WebWorkerType,
} from '@sanity/cli-core/workbench'
export {unstable_defineService, unstable_defineView} from '@sanity/cli-core/workbench'
// Browser-safe runtime authoring helpers for the module-federation extension API.
//
// View/web worker src files bundle to the browser, so this entry re-exports ONLY
// from the browser-safe Workbench subpath of shared Core. The `sanity` runtime package re-exports from here, so the
// same constraint protects it.
//
// `defineApplication` is config-time (Node) and stays on the main `@sanity/cli`
// entry; only the runtime helpers live here.
export type {AssetSource, AssetSourceComponentProps} from '@sanity/types'
