// `sanity.cli.ts` templates for workbench (`defineApplication`) projects,
// consumed by the CLI's `init` scaffolding. The branded `defineApplication`
// result is the sole workbench (module-federation) opt-in, so its config shape
// is workbench's to own; the CLI keeps the non-workbench templates and the
// `%placeholder%` substitution. `%slug%`/`%title%`/etc. are filled in by the
// CLI's template processor.

/** App scaffold — `entry` auto-declares the navigable app view. */
export const workbenchAppConfigTemplate = `
import {defineCliConfig, defineApplication} from 'sanity/cli'

export default defineCliConfig({
  app: defineApplication({
    title: '%title%',
    slug: '%slug%',
    organizationId: '%organizationId%',
    entry: '%entry%',
  }),
})
`

/**
 * Studio scaffold — brands with slug/title only, no `entry` (studio app views
 * aren't implemented yet).
 */
export const workbenchStudioConfigTemplate = `
import {defineCliConfig, defineApplication} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: '%projectId%',
    dataset: '%dataset%'
  },
  app: defineApplication({
    title: '%title%',
    slug: '%slug%',
    organizationId: '%organizationId%',
  }),
  deployment: {
    /**
     * Enable auto-updates for studios.
     * Learn more at https://www.sanity.io/docs/studio/latest-version-of-sanity#k47faf43faf56
     */
    autoUpdates: __BOOL__autoUpdates__,
  },
})
`
