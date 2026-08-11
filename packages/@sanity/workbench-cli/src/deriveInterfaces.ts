import {type CliConfig} from '@sanity/cli-core'

import {FEDERATION_FILE_NAME, RUNTIME_DIR} from './actions/build/vite/constants.js'
import {
  type AppInterfaceMetadata,
  interfaceContractVersion,
  type InterfaceKind,
  interfaceModuleId,
  type TileInterfaceMetadata,
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
  | (DerivedInterfaceBase & {metadata: AppInterfaceMetadata | null; type: 'app'})
  | (DerivedInterfaceBase & {metadata: null; type: 'asset_source'})
  | (DerivedInterfaceBase & {metadata: null; type: 'panel'})
  | (DerivedInterfaceBase & {metadata: null; type: 'worker'})
  | (DerivedInterfaceBase & {metadata: TileInterfaceMetadata; type: 'tile'})

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

  const shared = <T extends InterfaceKind>(
    type: T,
    declaration: {name: string; src: string; title: string},
  ) => ({
    id: `${app.slug}-${type}-${declaration.name}`,
    moduleId: interfaceModuleId(type, declaration.name),
    name: declaration.name,
    src: declaration.src,
    title: declaration.title,
    type,
    version: interfaceContractVersion(type),
  })

  return [
    ...(app.views ?? []).map((view): DerivedInterface => {
      // Tile is the only view type with interface metadata: its footprint `size`
      // (required) and an optional sort `priority`. Both authored top-level.
      if (view.type === 'tile') {
        return {
          ...shared(view.type, view),
          metadata:
            view.priority === undefined
              ? {size: view.size}
              : {priority: view.priority, size: view.size},
        }
      }
      return {...shared(view.type, view), metadata: null}
    }),
    ...(app.services ?? []).map((service): DerivedInterface => ({
      ...shared('worker', service),
      metadata: null,
    })),
    ...(entry === undefined
      ? []
      : [
          {
            ...shared('app', {name: app.slug, src: entry, title: appTitle ?? app.title}),
            metadata: null,
          },
        ]),
  ]
}
