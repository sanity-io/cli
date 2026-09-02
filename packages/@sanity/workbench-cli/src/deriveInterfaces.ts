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
  | (DerivedInterfaceBase & {metadata: null; surface: 'asset_source'})
  | (DerivedInterfaceBase & {metadata: null; type: 'worker'})
  | (DerivedInterfaceBase & {metadata: TileInterfaceMetadata; surface: 'tile'})
  | (DerivedInterfaceBase & {metadata: ViewPlacementMetadata | null; surface: 'panel'})
  | (DerivedInterfaceBase & {metadata: ViewPlacementMetadata | null; surface: 'window'})

/**
 * `appTitle` titles the window where a deploy resolved one through `--title`;
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

  // Identity, not address: interface ids and the window name key on `name`
  // (which defaults to `slug`, so existing apps derive byte-identical ids).
  const appName = app.name ?? app.slug

  const shared = (
    kind: InterfaceKind,
    declaration: {name: string; src: string; title: string},
  ) => ({
    id: `${appName}-${kind}-${declaration.name}`,
    moduleId: interfaceModuleId(kind, declaration.name),
    name: declaration.name,
    src: declaration.src,
    title: declaration.title,
    version: interfaceContractVersion(kind),
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
      if (view.surface === 'tile') {
        return {
          ...shared(view.surface, view),
          metadata:
            view.order === undefined ? {size: view.size} : {order: view.order, size: view.size},
          surface: view.surface,
        }
      }
      if (view.surface === 'panel' || view.surface === 'window') {
        return {
          ...shared(view.surface, view),
          metadata: placementMetadata(view.dock),
          surface: view.surface,
        }
      }
      return {...shared(view.surface, view), metadata: null, surface: view.surface}
    }),
    ...(app.webWorkers ?? []).map((webWorker): DerivedInterface => ({
      ...shared('worker', webWorker),
      metadata: null,
      type: 'worker',
    })),
    ...(entry === undefined
      ? []
      : [
          {
            ...shared('window', {name: appName, src: entry, title: appTitle ?? app.title}),
            metadata: placementMetadata(),
            surface: 'window' as const,
          },
        ]),
  ]
}
