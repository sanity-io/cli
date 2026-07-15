import {z} from 'zod/mini'

/**
 * Studio/app manifest schemas. They live in cli-core because more than one
 * package validates manifests: the CLI extracts and writes them, and the
 * workbench dev-server registry stores and rebroadcasts them. Keeping the
 * contract here lets both validate against the same schema without depending on
 * each other.
 */

/**
 * Core-app application manifest. Mirrors the workbench's
 * `CoreAppUserApplicationManifest` schema. Strictly validated via zod since the
 * CLI produces the payload in full.
 */
export const coreAppManifestSchema = z.object({
  icon: z.optional(z.string()),
  slug: z.optional(z.string()),
  title: z.optional(z.string()),
  version: z.string(),
})

export type CoreAppManifest = z.infer<typeof coreAppManifestSchema>

/**
 * Studio application manifest (serialized `create-manifest.json`). Kept loose so
 * the CLI isn't coupled to the workbench's evolving client-side schema — the
 * workbench consumer is authoritative on the inner shape. See its
 * `ClientManifest` for the fields clients expect.
 */
export const studioManifestSchema = z.record(z.string(), z.unknown())

export type StudioManifest = z.infer<typeof studioManifestSchema>
