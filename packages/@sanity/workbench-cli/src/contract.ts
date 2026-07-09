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
  panel: ['title', 'panel'],
} as const satisfies Record<string, readonly string[]>

/** @public */
export type InterfaceType = keyof typeof VIEW_COMPONENTS

/** @public */
export type ServiceType = 'worker'

// Shared `name` + `src`; `kind` only tailors the validation message.
function extensionDeclarationFields(kind: 'Field' | 'Service' | 'View') {
  const pattern = /^[a-zA-Z0-9_-]+$/
  return {
    name: z.string().check(z.regex(pattern, `${kind} \`name\` must match ${pattern}`)),
    src: z.string(),
  }
}

// Every interface (view, service) shares `name` + `src` + an optional display
// `title` that defaults to `name` on deploy.
function interfaceDeclarationFields(kind: 'Service' | 'View') {
  return {...extensionDeclarationFields(kind), title: z.optional(z.string())}
}

const PanelViewSchema = z.object({
  type: z.literal('panel'),
  ...interfaceDeclarationFields('View'),
})

/** @internal */
export const InterfaceDeclarationSchema = z.discriminatedUnion('type', [PanelViewSchema])

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
