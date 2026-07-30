import {RUNTIME_DIR} from './actions/build/vite/constants.js'
import {type DockItemMetadata, type InterfaceDeclaration, type InterfaceType} from './contract.js'

/** Path relative to {@link RUNTIME_DIR}, so the build writes it where it belongs. @internal */
export const GENERATED_DOCK_ITEM_FILE = 'interfaces/dock-item.js'

const GENERATED_DOCK_ITEM_SRC = `./${RUNTIME_DIR}/${GENERATED_DOCK_ITEM_FILE}`

interface ResolvedViewBase {
  name: string
  src: string

  /** The build writes this view's `src`; the app authored no module for it. */
  generated?: boolean
  title?: string
}

/**
 * A view after normalization, discriminated like the interface record it deploys
 * as: only a `dock_item` carries placement metadata.
 * @internal
 */
export type ResolvedView =
  | (ResolvedViewBase & {metadata: DockItemMetadata; type: 'dock_item'})
  | (ResolvedViewBase & {type: Exclude<InterfaceType, 'dock_item'>})

interface ViewSource {
  name: string

  group?: string
  priority?: number
  views?: readonly InterfaceDeclaration[]
}

/**
 * The app's views, plus the dock item its placement implies. A declared
 * `dock_item` overrides the generated one and carries the placement instead.
 * @internal
 */
export function resolveViews(app: ViewSource): ResolvedView[] {
  const metadata: DockItemMetadata = {group: app.group, priority: app.priority}
  const views = (app.views ?? []).map(
    (view): ResolvedView => (view.type === 'dock_item' ? {...view, metadata} : view),
  )

  const declaresPlacement = app.group !== undefined || app.priority !== undefined
  if (!declaresPlacement || views.some((view) => view.type === 'dock_item')) return views
  return [
    ...views,
    {generated: true, metadata, name: app.name, src: GENERATED_DOCK_ITEM_SRC, type: 'dock_item'},
  ]
}
