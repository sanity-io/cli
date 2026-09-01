import {type AssetSourceComponentProps} from '@sanity/types'

import {
  type TileSize,
  VIEW_CONTRACT_VERSION,
  type ViewComponent,
  type ViewComponentBaseProps,
  type ViewSurface,
} from './contract.js'

/** @public */
export type WindowViewProps = ViewComponentBaseProps<{
  name: string
  src: string
  surface: 'window'
  title: string
}>

/**
 * Props a panel component receives: its interface record, minus the
 * service-assigned `id`/`deployment_id` a local dev server can't provide. Mirrors
 * the `panel` record the workbench host renders from (the wire format owned by
 * `@sanity/workbench`); drift is guarded by the stamped contract version.
 * @public
 */
export type PanelViewProps = ViewComponentBaseProps<{
  name: string
  src: string
  surface: 'panel'
  title: string
}>

/**
 * The component slots a `panel` view exposes — each its own module-federation
 * island, typed with the panel props.
 * @public
 */
export interface PanelViewComponents {
  panel: ViewComponent<PanelViewProps>
  title: ViewComponent<PanelViewProps>
}

/**
 * A panel's view-component slot — the module-federation expose for one island.
 * @public
 */
export type PanelComponent = keyof PanelViewComponents

/**
 * The component slots an `asset_source` view exposes — a single picker island,
 * typed with the studio asset-source props it renders behind. The props are
 * `@sanity/types`' `AssetSourceComponentProps` directly, so an authored picker
 * receives exactly what a studio `AssetSource.component` does.
 * @public
 */
export interface AssetSourceViewComponents {
  asset_source: ViewComponent<AssetSourceComponentProps>
}

/**
 * An asset source's view-component slot — the module-federation expose for its
 * one island.
 * @public
 */
export type AssetSourceComponent = keyof AssetSourceViewComponents

/**
 * Props a tile component receives: its own interface record plus its footprint
 * `size`, so it can render per family. Mirrors the
 * `tile` record the dashboard host renders from; drift is guarded by the stamped
 * contract version. Placement `order` is host-only metadata, not surfaced here.
 * @public
 */
export type TileViewProps = ViewComponentBaseProps<{
  name: string
  size: TileSize
  src: string
  surface: 'tile'
  title: string
}>

/**
 * The component slot a `tile` view exposes — a single island, typed with the
 * tile props.
 * @public
 */
export interface TileViewComponents {
  tile: ViewComponent<TileViewProps>
}

/**
 * A tile's view-component slot — the module-federation expose for its one island.
 * @public
 */
export type TileComponent = keyof TileViewComponents

/**
 * The components each view surface exposes.
 * @public
 */
export interface ViewComponentsBySurface {
  asset_source: AssetSourceViewComponents
  panel: PanelViewComponents
  tile: TileViewComponents
  window: ViewComponent<WindowViewProps>
}

/**
 * The result of `unstable_defineView`: the author's component(s), the view surface,
 * and the internal contract version the build artifact targets.
 * @public
 */
export interface DefinedView<TSurface extends ViewSurface = ViewSurface> {
  readonly components: ViewComponentsBySurface[TSurface]
  readonly surface: TSurface
  /** @internal */
  readonly version: typeof VIEW_CONTRACT_VERSION
}

/**
 * Define a Sanity Workbench view. The first argument narrows the component shape
 * and the props each component receives — `"panel"` yields a `{title, panel}`
 * record whose components are typed with the panel props.
 *
 * Returns the component(s) tagged with their surface and contract version, for
 * the CLI build to generate render artifacts from. Used as the default export of
 * a view's `src` file.
 * @public
 */
export function unstable_defineView<TSurface extends ViewSurface>(
  surface: TSurface,
  components: ViewComponentsBySurface[TSurface],
): DefinedView<TSurface> {
  return {components, surface, version: VIEW_CONTRACT_VERSION}
}
