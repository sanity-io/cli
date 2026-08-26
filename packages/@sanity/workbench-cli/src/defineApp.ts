import {z} from 'zod/mini'

import {APP_SLUG_PATTERN} from './appSlug.js'
import {
  InterfaceDeclarationSchema,
  ServiceDeclarationSchema,
  ViewPlacementMetadataSchema,
} from './contract.js'

/**
 * Dashboard visibility values. Mirrors `APP_VISIBILITIES` in `@sanity/cli-core`
 * (which can't be imported here — pulling the barrel into this lean module bloats
 * the config-load path). Kept in sync by a type test in `defineApp.test.ts`.
 */
const APP_VISIBILITIES = ['default', 'unlisted', 'disabled'] as const

/**
 * Internal application discriminator. Sanity-owned singleton apps only;
 * validated by the schema but excluded from the public `DefineAppInput` type.
 */
const ApplicationType = z.enum(['coreApp', 'studio', 'canvas', 'dashboard'])

/**
 * Runtime-validation schema for `unstable_defineApp`.
 * @internal
 */
export const DefineAppInputSchema = z
  .object({
    /**
     * Internal — Sanity-owned singleton apps only. Validated here but excluded
     * from the public `DefineAppInput` type.
     * @internal
     */
    applicationType: z.optional(ApplicationType),
    /** Default placement inherited by panel and window views. */
    dock: z.optional(ViewPlacementMetadataSchema),
    /**
     * App entrypoint module. Defaults to `./src/App.tsx` when omitted. The build
     * derives the app's navigable `app` view from it. SDK apps only — setting it
     * on a studio is rejected (studio app views are not yet implemented).
     */
    entry: z.optional(z.string("must be a path to the app's entry file")),
    /** Optional icon override (path to an SVG). Wins over manifest/studio icon. */
    icon: z.optional(z.string()),
    /**
     * Stable identity, distinct from the `slug` address. Defaults to `slug` when
     * omitted. Identity keys — the build id and derived interface ids — are built
     * from this, so renaming the slug no longer changes identity.
     */
    name: z.optional(
      z
        .string()
        .check(
          z.regex(
            APP_SLUG_PATTERN,
            'App `name` must be lowercase alphanumerics and hyphens, starting with a letter and ending with an alphanumeric',
          ),
        ),
    ),
    /** Organization that owns the app — the workbench runs and deploys against it. */
    organizationId: z.string(
      "App `organizationId` is required — pass the owning organization's ID to `unstable_defineApp`",
    ),
    /** Background services the app runs (e.g. a `worker` emitting dock badges). */
    services: z.optional(
      z
        .array(ServiceDeclarationSchema, 'must be an array of services')
        .check(
          z.refine(
            (services) => new Set(services.map((service) => service.name)).size === services.length,
            'Service `name` must be unique within an app',
          ),
        ),
    ),
    slug: z
      .string('App `slug` is required — the hostname the application is created at on deploy')
      .check(
        z.regex(
          APP_SLUG_PATTERN,
          'App `slug` must be lowercase alphanumerics and hyphens, starting with a letter and ending with an alphanumeric',
        ),
      ),
    /** User-facing app title. Wins over studio.config.ts title on merge. */
    title: z.string(),
    /** Views the app exposes (e.g. a window, dock panels, and tiles). */
    views: z.optional(
      z
        .array(InterfaceDeclarationSchema, 'must be an array of views')
        .check(
          z.refine(
            (views) => new Set(views.map((view) => view.name)).size === views.length,
            'View `name` must be unique within an app',
          ),
        ),
    ),
    /** Dashboard visibility of the app. Defaults to `default` when omitted. */
    visibility: z.optional(z.enum(APP_VISIBILITIES)),
  })
  .check(
    // Studio app views are not implemented yet. A studio that declares `entry`
    // (the SDK app-view entrypoint) is rejected here rather than silently
    // generating one; studios keep navigating via their existing render path.
    z.refine((input) => !(input.applicationType === 'studio' && input.entry !== undefined), {
      error: 'App views for studios are not implemented yet',
      path: ['entry'],
    }),
  )

/**
 * User-facing input for `unstable_defineApp`. Excludes the internal
 * `applicationType`.
 * @public
 */
export type DefineAppInput = Omit<z.output<typeof DefineAppInputSchema>, 'applicationType'>

/**
 * Nominal brand the CLI discriminates on to enable the workbench build/deploy
 * codepath. Registered via `Symbol.for` so the marker survives module-realm
 * boundaries — `@sanity/cli-core` re-derives the same global symbol with
 * `Symbol.for` rather than importing it, so it stays internal to this module.
 */
const WORKBENCH_APP: unique symbol = Symbol.for('sanity.workbench.defineApp')

/**
 * The branded result of `unstable_defineApp`. Carries the same fields as the
 * input plus the internal brand — users only ever see `DefineAppInput`.
 * @public
 */
export type DefineAppResult = DefineAppInput & {readonly [WORKBENCH_APP]: true}

/**
 * A branded app as the CLI reads it — the full schema shape, including the
 * internal fields `DefineAppInput` omits. Schema-derived so the narrowing
 * can't drift from what the schema validates.
 * @public
 */
export type WorkbenchApp = DefineAppResult & z.output<typeof DefineAppInputSchema>

/**
 * Whether `app` is a branded `unstable_defineApp(...)` result — the sole
 * workbench opt-in.
 * @public
 */
export function isWorkbenchApp(app: unknown): app is WorkbenchApp {
  return typeof app === 'object' && app !== null && WORKBENCH_APP in app
}

/**
 * Declare a Sanity Workbench application. Identity at runtime — returns the same
 * object reference, tagged with the workbench brand. Field validation (the
 * `slug` pattern etc.) runs at build time in the CLI via `DefineAppInputSchema`;
 * this helper stays a thin, pure identity wrapper.
 * @public
 */
export function unstable_defineApp(input: DefineAppInput): DefineAppResult {
  return Object.defineProperty(input, WORKBENCH_APP, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  }) as DefineAppResult
}

/**
 * One custom field a media library exposes. `src` default-exports a `defineField(...)` schema type.
 * @public
 */
export interface MediaLibraryField {
  /** Unique within the media library. */
  name: string
  src: string
  title: string

  /** Readable outside the owning organization. */
  public?: boolean
}

/**
 * Sanity-owned singleton, so authors don't name or title the app — only `organizationId` is required.
 * @public
 */
export interface DefineMediaLibraryInput {
  /** Organization that owns the media library — the CLI runs and deploys against it. */
  organizationId: string

  fields?: MediaLibraryField[]
}

/**
 * Nominal brand the CLI discriminates a config on. A config is *not* an app: it
 * carries no `slug`/`title`/application identity, only a target `appType`, its
 * owning `organizationId`, and its `fields`. Registered via `Symbol.for` so the
 * marker survives module-realm boundaries — `@sanity/cli-core` re-derives the
 * same global symbol rather than importing it.
 */
const WORKBENCH_CONFIG: unique symbol = Symbol.for('sanity.workbench.defineConfig')

/**
 * A branded workbench config as the CLI reads it: bound to its target app by
 * `appType`, not carrying its own app identity. The deploy/undeploy/build paths
 * discriminate it via {@link isWorkbenchConfig}.
 * @public
 */
export interface WorkbenchConfig {
  appType: 'media-library'
  fields: MediaLibraryField[]
  organizationId: string
  readonly [WORKBENCH_CONFIG]: true
}

/**
 * Whether `app` is a branded `unstable_defineMediaLibrary(...)` config — a
 * config-carrier rather than an app. Configs live in `cliConfig.app` alongside
 * apps but resolve through `resolveWorkbenchConfig`, not `resolveWorkbenchApp`.
 * @public
 */
export function isWorkbenchConfig(app: unknown): app is WorkbenchConfig {
  return typeof app === 'object' && app !== null && WORKBENCH_CONFIG in app
}

/**
 * Declare the Sanity Media Library config. The Media Library is a Sanity-owned
 * singleton, so this is not an app — it carries no slug or title, only the
 * target `appType`, its owning organization, and the `fields` it contributes to
 * the installation's config.
 * @public
 */
export function unstable_defineMediaLibrary(input: DefineMediaLibraryInput): WorkbenchConfig {
  return Object.defineProperty(
    {appType: 'media-library', fields: input.fields ?? [], organizationId: input.organizationId},
    WORKBENCH_CONFIG,
    {configurable: false, enumerable: false, value: true, writable: false},
  ) as WorkbenchConfig
}
