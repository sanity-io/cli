import {z} from 'zod/mini'

// Shared module-federation extension contract: interface (view/service) and
// config declaration schemas, plus the versions the build stamps.
// `zod/mini` keeps the bundle small.

/** @internal */
export const VIEW_CONTRACT_VERSION = 1

/** @internal */
export const SERVICE_CONTRACT_VERSION = 1

/** @internal */
export const MEDIA_LIBRARY_CONFIG_CONTRACT_VERSION = 1

/**
 * A view component. The return is opaque so the runtime helpers carry no React
 * dependency — the generated artifact renders it with the app's own React.
 * @public
 */
export type ViewComponent<TProps> = (props: TProps) => unknown

/** @public */
export interface ViewComponentBaseProps<TView> {
  view: TView
}

/** Component slots per view surface; windows load outside the component artifact path. @internal */
export const VIEW_COMPONENTS = {
  app: [],
  asset_source: ['asset_source'],
  panel: ['title', 'panel'],
  tile: ['tile'],
} as const satisfies Record<string, readonly string[]>

/** @public */
export type ViewSurface = keyof typeof VIEW_COMPONENTS

/**
 * A tile's footprint family — the shape it occupies on the dashboard. Modelled
 * on iOS WidgetKit families, not a linear scale: `banner` is full-width and
 * shallow, which a `small`→`large` magnitude can't express. The host maps a
 * family to a layout slot; the component reads it to render per footprint.
 * @public
 */
export const TileSizeSchema = z.enum(['small', 'large', 'banner'])

/** @public */
export type TileSize = z.infer<typeof TileSizeSchema>

/** @public */
export type ServiceType = 'worker'

const DockGroupSchema = z.enum(['dock.system', 'dock.applications', 'dock.user'])

/** @public */
export type DockGroup = z.output<typeof DockGroupSchema>

/** @internal */
export const DockSchema = z.object({
  group: z.optional(DockGroupSchema),
  order: z.optional(z.number()),
})

/** @internal */
export type Dock = z.infer<typeof DockSchema>

/** @internal */
export const ViewPlacementMetadataSchema = z.object({dock: DockSchema})

/** @internal */
export type ViewPlacementMetadata = z.infer<typeof ViewPlacementMetadataSchema>

/**
 * A tile's interface metadata: its footprint `size` and an optional `order`
 * the dashboard sorts on, ascending. Both are authored as top-level view fields
 * (see {@link InterfaceDeclarationSchema}) but stored on the record as metadata.
 * @internal
 */
export const TileInterfaceMetadataSchema = z.object({
  order: z.optional(z.number()),
  size: TileSizeSchema,
})

/** @internal */
export type TileInterfaceMetadata = z.infer<typeof TileInterfaceMetadataSchema>

/**
 * The contract version each interface type advertises, so the host can check it
 * renders/runs what it expects.
 * @internal
 */
const INTERFACE_CONTRACT_VERSIONS = {
  app: undefined,
  asset_source: VIEW_CONTRACT_VERSION,
  panel: VIEW_CONTRACT_VERSION,
  tile: VIEW_CONTRACT_VERSION,
  worker: SERVICE_CONTRACT_VERSION,
} as const

/** Every interface type an app exposes — an `app` view, a view, or a service. */
export type InterfaceKind = keyof typeof INTERFACE_CONTRACT_VERSIONS

/** @internal */
export function interfaceContractVersion(kind: InterfaceKind): string | undefined {
  const version = INTERFACE_CONTRACT_VERSIONS[kind]
  return version === undefined ? undefined : String(version)
}

/**
 * The module-federation id a build exposes an interface at. Dev stamps the same
 * id a deploy would, so the workbench loads a local interface like a deployed one.
 * @internal
 */
export function interfaceModuleId(kind: string, name: string): string {
  switch (kind) {
    case 'app': {
      return 'App'
    }
    case 'asset_source':
    case 'panel':
    case 'tile': {
      return `views/${name}`
    }
    case 'worker': {
      return `services/${name}`
    }
    default: {
      throw new Error(`Cannot derive a moduleId for unknown interface kind: ${kind}`)
    }
  }
}

// Shared `name` + `src`; `kind` only tailors the validation message.
function extensionDeclarationFields(kind: 'Field' | 'View' | 'Web worker') {
  const pattern = /^[a-zA-Z0-9_-]+$/
  return {
    name: z.string().check(z.regex(pattern, `${kind} \`name\` must match ${pattern}`)),
    src: z.string(),
  }
}

// Every interface shares `name` + `src` + a display `title`,
// which Brett requires on the record each becomes.
function interfaceDeclarationFields(kind: 'View' | 'Web worker') {
  return {
    ...extensionDeclarationFields(kind),
    title: z.string(`${kind} \`title\` is required`),
  }
}

const PanelViewSchema = z.object({
  surface: z.literal('panel'),
  ...interfaceDeclarationFields('View'),
  dock: z.optional(DockSchema),
})

/** @public */
export type PanelView = z.output<typeof PanelViewSchema>

/** @public */
export type DefinePanelViewInput = Omit<PanelView, 'surface'>

/** @public */
export function definePanelView(view: DefinePanelViewInput): PanelView {
  return {...view, surface: 'panel'}
}

const WindowViewSchema = z.object({
  surface: z.literal('app'),
  ...interfaceDeclarationFields('View'),
  dock: z.optional(DockSchema),
})

/** @public */
export type WindowView = z.output<typeof WindowViewSchema>

/** @public */
export type DefineWindowViewInput = Omit<WindowView, 'surface'>

/** @public */
export function defineWindowView(view: DefineWindowViewInput): WindowView {
  return {...view, surface: 'app'}
}

const AssetSourceViewSchema = z.object({
  surface: z.literal('asset_source'),
  ...interfaceDeclarationFields('View'),
})

/** @public */
export type AssetSourceView = z.output<typeof AssetSourceViewSchema>

/** @public */
export type DefineAssetSourceViewInput = Omit<AssetSourceView, 'surface'>

/** @public */
export function defineAssetSourceView(view: DefineAssetSourceViewInput): AssetSourceView {
  return {...view, surface: 'asset_source'}
}

const TileViewSchema = z.object({
  surface: z.literal('tile'),
  ...interfaceDeclarationFields('View'),
  /** Sort position within its layout track, ascending. Optional. */
  order: z.optional(z.number()),
  /** Footprint family the dashboard lays the tile out by. */
  size: TileSizeSchema,
})

/** @public */
export type TileView = z.output<typeof TileViewSchema>

/** @public */
export type DefineTileViewInput = Omit<TileView, 'surface'>

/** @public */
export function defineTileView(view: DefineTileViewInput): TileView {
  return {...view, surface: 'tile'}
}

/** @internal */
export const InterfaceDeclarationSchema = z.discriminatedUnion('surface', [
  WindowViewSchema,
  PanelViewSchema,
  AssetSourceViewSchema,
  TileViewSchema,
])

/** @public */
export type ViewDeclaration = z.output<typeof InterfaceDeclarationSchema>

const WebWorkerSchema = z.object({
  type: z.literal('worker'),
  ...interfaceDeclarationFields('Web worker'),
})

/** @public */
export type WebWorker = z.output<typeof WebWorkerSchema>

/** @public */
export type DefineWebWorkerInput = Omit<WebWorker, 'type'>

/** @public */
export function defineWebWorker(webWorker: DefineWebWorkerInput): WebWorker {
  return {...webWorker, type: 'worker'}
}

/** @internal */
export const ServiceDeclarationSchema = z.discriminatedUnion('type', [WebWorkerSchema])

const MediaLibraryFieldSchema = z.object({
  ...extensionDeclarationFields('Field'),
  public: z.optional(z.boolean()),
  title: z.string(),
})

/**
 * Stamped where the config crosses a boundary so the authoring model doesn't carry a constant discriminator.
 * @internal
 */
export const INSTALLATION_CONFIG_TYPE = 'installation_config'

// `appType` is stamped by `unstable_defineMediaLibrary`, never authored.
const MediaLibraryConfigSchema = z.object({
  appType: z.literal('media-library'),
  fields: z
    .array(MediaLibraryFieldSchema)
    .check(
      z.refine(
        (fields) => new Set(fields.map((field) => field.name)).size === fields.length,
        'Field `name` must be unique within a media library',
      ),
    ),
})

/**
 * A workbench config's built value, keyed by `appType`; deploys as a versioned
 * snapshot, not an interface.
 * @internal
 */
export const ConfigSchema = z.discriminatedUnion('appType', [MediaLibraryConfigSchema])

/**
 * The `{appType, fields}` config value the build expands into a federation
 * remote and the deploy summarizes.
 * @internal
 */
export type WorkbenchConfigValue = z.output<typeof ConfigSchema>
