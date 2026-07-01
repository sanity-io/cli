import {z} from 'zod/mini'

import {InterfaceDeclarationSchema, ServiceDeclarationSchema} from './contract.js'

/** Allowed characters for an app `name`. */
const APP_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/

/**
 * Internal application discriminator. Sanity-owned singleton apps only;
 * validated by the schema but excluded from the public `DefineAppInput` type.
 */
const ApplicationType = z.enum(['coreApp', 'studio', 'canvas', 'dashboard', 'media-library'])

/** Dock groups an app can place itself into. */
const DockGroupSchema = z.enum(['dock.system', 'dock.applications', 'dock.user'])

/**
 * Dock group identifier. The API does not block a user app from declaring a
 * reserved group (e.g. `dock.system`); priority conventions keep Sanity-owned
 * apps ahead.
 * @public
 */
export type DockGroup = z.output<typeof DockGroupSchema>

/**
 * Runtime-validation schema for `unstable_defineApp`. Validates the full shape
 * including the internal `applicationType`; the user-facing `DefineAppInput`
 * type below omits that field.
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
    /**
     * App entrypoint module. Defaults to `./src/App.tsx` when omitted. The build
     * derives the app's navigable `app` view from it. SDK apps only — setting it
     * on a studio is rejected (studio app views are not yet implemented).
     */
    entry: z.optional(z.string()),
    /** Dock group to render in. Defaults to `dock.applications` when omitted. */
    group: z.optional(DockGroupSchema),
    /** Optional icon override (path to an SVG). Wins over manifest/studio icon. */
    icon: z.optional(z.string()),
    /** Internal — Sanity-owned singleton apps only; excluded from the public `DefineAppInput`. @internal */
    isSingleton: z.optional(z.boolean()),
    /** Unique app identifier — must match `APP_NAME_PATTERN`. */
    name: z.string().check(z.regex(APP_NAME_PATTERN, 'App `name` must match /^[a-zA-Z0-9_-]+$/')),
    /** Organization that owns the app — the workbench runs and deploys against it. */
    organizationId: z.string(
      "App `organizationId` is required — pass the owning organization's ID to `unstable_defineApp`",
    ),
    /** Sort position within the group, ascending. Defaults to `100` when omitted. */
    priority: z.optional(z.number()),
    /**
     * Background services the app runs (e.g. a `worker` emitting dock badges).
     * Metadata only — built into worker artifacts and persisted to the
     * application service on deploy, not into the app manifest. Service `name`s
     * must be unique within the app.
     */
    services: z.optional(
      z
        .array(ServiceDeclarationSchema)
        .check(
          z.refine(
            (services) => new Set(services.map((service) => service.name)).size === services.length,
            'Service `name` must be unique within an app',
          ),
        ),
    ),
    /** User-facing app title. Wins over studio.config.ts title on merge. */
    title: z.string(),
    /**
     * Views the app exposes (e.g. dock panels). Metadata only — built into
     * render artifacts and persisted to the application service on deploy, not
     * into the app manifest. View `name`s must be unique within the app.
     */
    views: z.optional(
      z
        .array(InterfaceDeclarationSchema)
        .check(
          z.refine(
            (views) => new Set(views.map((view) => view.name)).size === views.length,
            'View `name` must be unique within an app',
          ),
        ),
    ),
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
 * `applicationType` and `isSingleton` — both are validated by the schema but
 * are not part of the public surface (Sanity-owned apps set them via
 * `@ts-expect-error`).
 * @public
 */
export type DefineAppInput = Omit<
  z.output<typeof DefineAppInputSchema>,
  'applicationType' | 'isSingleton'
>

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
export interface DefineAppResult extends DefineAppInput {
  readonly [WORKBENCH_APP]: true
}

/**
 * Declare a Sanity Workbench application. Identity at runtime — returns the same
 * object reference, tagged with the workbench brand. Field validation (the
 * `name` pattern etc.) runs at build time in the CLI via `DefineAppInputSchema`;
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
