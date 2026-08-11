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

/**
 * Component slots each interface type exposes, in render order. Source of truth
 * for {@link InterfaceType} and the build; add a type by registering it here.
 * @internal
 */
export const VIEW_COMPONENTS = {
  asset_source: ['asset_source'],
  panel: ['title', 'panel'],
  tile: ['tile'],
} as const satisfies Record<string, readonly string[]>

/** @public */
export type InterfaceType = keyof typeof VIEW_COMPONENTS

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

/**
 * The `app` interface's dock-placement metadata. Interface metadata is
 * discriminated on `type`; `app` is the only type with a shape so far.
 * @internal
 */
export const AppInterfaceMetadataSchema = z.object({
  group: z.optional(z.string()),
  priority: z.optional(z.number()),
})

/** @internal */
export type AppInterfaceMetadata = z.infer<typeof AppInterfaceMetadataSchema>

/**
 * A tile's interface metadata: its footprint `size` and an optional `priority`
 * the dashboard sorts on, ascending. Both are authored as top-level view fields
 * (see {@link InterfaceDeclarationSchema}) but stored on the record as metadata.
 * Mirrors `app`'s dock metadata; tile is the first view type to carry any.
 * @internal
 */
export const TileInterfaceMetadataSchema = z.object({
  priority: z.optional(z.number()),
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
export function interfaceContractVersion(type: InterfaceKind): string | undefined {
  const version = INTERFACE_CONTRACT_VERSIONS[type]
  return version === undefined ? undefined : String(version)
}

/**
 * The module-federation id a build exposes an interface at. Dev stamps the same
 * id a deploy would, so the workbench loads a local interface like a deployed one.
 * @internal
 */
export function interfaceModuleId(type: string, name: string): string {
  switch (type) {
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
      throw new Error(`Cannot derive a moduleId for unknown interface type: ${type}`)
    }
  }
}

// Shared `name` + `src`; `kind` only tailors the validation message.
function extensionDeclarationFields(kind: 'Field' | 'Service' | 'View') {
  const pattern = /^[a-zA-Z0-9_-]+$/
  return {
    name: z.string().check(z.regex(pattern, `${kind} \`name\` must match ${pattern}`)),
    src: z.string(),
  }
}

// Every interface (view, service) shares `name` + `src` + a display `title`,
// which Brett requires on the record each becomes.
function interfaceDeclarationFields(kind: 'Service' | 'View') {
  return {
    ...extensionDeclarationFields(kind),
    title: z.string(`${kind} \`title\` is required`),
  }
}

const PanelViewSchema = z.object({
  type: z.literal('panel'),
  ...interfaceDeclarationFields('View'),
})

const AssetSourceViewSchema = z.object({
  type: z.literal('asset_source'),
  ...interfaceDeclarationFields('View'),
})

const TileViewSchema = z.object({
  type: z.literal('tile'),
  ...interfaceDeclarationFields('View'),
  /** Sort position within its layout track, ascending. Optional. */
  priority: z.optional(z.number()),
  /** Footprint family the dashboard lays the tile out by. */
  size: TileSizeSchema,
})

/** @internal */
export const InterfaceDeclarationSchema = z.discriminatedUnion('type', [
  PanelViewSchema,
  AssetSourceViewSchema,
  TileViewSchema,
])

const WorkerServiceSchema = z.object({
  type: z.literal('worker'),
  ...interfaceDeclarationFields('Service'),
})

/** @internal */
export const ServiceDeclarationSchema = z.discriminatedUnion('type', [WorkerServiceSchema])

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
 * An app's optional config, keyed by `appType`; deploys as a versioned snapshot, not an interface.
 * @internal
 */
export const ConfigSchema = z.discriminatedUnion('appType', [MediaLibraryConfigSchema])
