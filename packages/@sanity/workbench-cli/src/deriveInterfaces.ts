import {type CliConfig} from '@sanity/cli-core'

import {FEDERATION_FILE_NAME, RUNTIME_DIR} from './actions/build/vite/constants.js'
import {
  type Dock,
  interfaceContractVersion,
  type InterfaceKind,
  interfaceModuleId,
  type TileInterfaceMetadata,
  type ViewPlacementMetadata,
} from './contract.js'
import {isWorkbenchApp} from './defineApp.js'

/** What a studio exposes as `./App` — the generated entry that renders `sanity.config.ts`. */
const GENERATED_ENTRY = `./${RUNTIME_DIR}/${FEDERATION_FILE_NAME}.jsx`

interface DerivedInterfaceBase {
  /** CLI-minted for a local interface; a deployed one gets its id from Brett. */
  id: string
  moduleId: string
  name: string
  src: string
  title: string

  version?: string
}

/** @internal */
export type DerivedInterface =
  | (DerivedInterfaceBase & {metadata: null; type: 'asset_source'})
  | (DerivedInterfaceBase & {metadata: null; type: 'worker'})
  | (DerivedInterfaceBase & {metadata: TileInterfaceMetadata; type: 'tile'})
  | (DerivedInterfaceBase & {metadata: ViewPlacementMetadata | null; type: 'app'})
  | (DerivedInterfaceBase & {metadata: ViewPlacementMetadata | null; type: 'panel'})

/**
 * `appTitle` titles the app view where a deploy resolved one through `--title`;
 * dev takes it from the config.
 * @internal
 */
export function deriveInterfaces(
  app: CliConfig['app'],
  {appTitle, isApp}: {appTitle?: string; isApp: boolean},
): DerivedInterface[] {
  if (!isWorkbenchApp(app)) return []

  // The schema rejects a *declared* studio with an `entry`; `isApp` is resolved
  // from the project, so a detected one only fails here.
  if (!isApp && app.entry !== undefined) {
    throw new Error('App views for studios are not implemented yet')
  }
  const entry = isApp ? app.entry : GENERATED_ENTRY

  // Identity, not address: interface ids and the app-view name key on `name`
  // (which defaults to `slug`, so existing apps derive byte-identical ids).
  const appName = app.name ?? app.slug

  const shared = <T extends InterfaceKind>(
    type: T,
    declaration: {name: string; src: string; title: string},
  ) => ({
    id: `${appName}-${type}-${declaration.name}`,
    moduleId: interfaceModuleId(type, declaration.name),
    name: declaration.name,
    src: declaration.src,
    title: declaration.title,
    type,
    version: interfaceContractVersion(type),
  })

  const placementMetadata = (dock?: Dock): ViewPlacementMetadata | null => {
    const group = dock?.group ?? app.dock?.group
    const order = dock?.order ?? app.dock?.order
    if (group === undefined && order === undefined) return null
    return {
      dock: {
        ...(group === undefined ? {} : {group}),
        ...(order === undefined ? {} : {order}),
      },
    }
  }

  return [
    ...(app.views ?? []).map((view): DerivedInterface => {
      if (view.type === 'tile') {
        return {
          ...shared(view.type, view),
          metadata:
            view.order === undefined ? {size: view.size} : {order: view.order, size: view.size},
        }
      }
      if (view.type === 'app' || view.type === 'panel') {
        return {...shared(view.type, view), metadata: placementMetadata(view.dock)}
      }
      return {...shared(view.type, view), metadata: null}
    }),
    ...(app.services ?? []).map(
      (service): DerivedInterface => ({...shared('worker', service), metadata: null}),
    ),
    ...(entry === undefined
      ? []
      : [
          {
            ...shared('app', {name: appName, src: entry, title: appTitle ?? app.title}),
            metadata: placementMetadata(),
          },
        ]),
  ]
}
