import {
  type InterfaceType,
  VIEW_CONTRACT_VERSION,
  type ViewComponent,
  type ViewComponentBaseProps,
} from './contract.js'

/**
 * Props a panel component receives: its interface record, minus the
 * service-assigned `id`/`deployment_id` a local dev server can't provide. Mirrors
 * the `panel` record the workbench host renders from (the wire format owned by
 * `@sanity/workbench`); drift is guarded by the stamped contract version.
 * @public
 */
export type PanelViewProps = ViewComponentBaseProps<{
  entry_point: string
  interface_type: 'panel'
  name: string
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
 * The components each interface type exposes, keyed by type.
 * @public
 */
export interface ViewComponentsByType {
  panel: PanelViewComponents
}

/**
 * The result of `unstable_defineView`: the author's component(s), the view type,
 * and the internal contract version the build artifact targets.
 * @public
 */
export interface DefinedView<TType extends InterfaceType = InterfaceType> {
  readonly components: ViewComponentsByType[TType]
  readonly type: TType
  /** @internal */
  readonly version: typeof VIEW_CONTRACT_VERSION
}

/**
 * Define a Sanity Workbench view. The first argument narrows the component shape
 * and the props each component receives — `"panel"` yields a `{title, panel}`
 * record whose components are typed with the panel props.
 *
 * Returns the component(s) tagged with their type and the contract version, for
 * the CLI build to generate render artifacts from. Used as the default export of
 * a view's `src` file.
 * @public
 */
export function unstable_defineView<TType extends InterfaceType>(
  type: TType,
  components: ViewComponentsByType[TType],
): DefinedView<TType> {
  return {components, type, version: VIEW_CONTRACT_VERSION}
}
