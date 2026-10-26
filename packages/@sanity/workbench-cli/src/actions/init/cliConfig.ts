// `sanity.cli.ts` templates for workbench (`defineApplication`) projects,
// consumed by the CLI's `init` scaffolding. The branded `defineApplication`
// result is the sole workbench (module-federation) opt-in, so its config shape
// is workbench's to own; the CLI keeps the non-workbench templates and the
// `%placeholder%` substitution. `%slug%`/`%title%`/etc. are filled in by the
// CLI's template processor.

/** App scaffold — `entry` auto-declares the navigable app view. */
export const workbenchAppConfigTemplate = `
import {defineApplication, defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  app: defineApplication({
    title: '%title%',
    name: '%slug%',
    slug: '%slug%',
    organizationId: '%organizationId%',
    entry: '%entry%',
  }),
})
`

/**
 * Media Library config app scaffold — `unstable_defineMediaLibrary` declares
 * field (aspect) definitions for an organization's Media Library; the
 * workbench CLI wires the island build natively for this app shape. The
 * `fields` entries must match the modules the template ships in
 * `src/fields/`.
 */
export const workbenchMediaLibraryConfigTemplate = `
import {defineCliConfig, unstable_defineMediaLibrary} from 'sanity/cli'

export default defineCliConfig({
  app: unstable_defineMediaLibrary({
    organizationId: '%organizationId%',
    fields: [
      {name: 'caption', src: './src/fields/caption.tsx', title: 'Caption'},
      {name: 'notes', src: './src/fields/notes.tsx', title: 'Notes'},
    ],
  }),
})
`

/**
 * Studio scaffold — brands with name/slug/title only, no `entry` (studio app views
 * aren't implemented yet).
 */
export const workbenchStudioConfigTemplate = `
import {defineApplication, defineCliConfig} from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: '%projectId%',
    dataset: '%dataset%'
  },
  app: defineApplication({
    title: '%title%',
    name: '%slug%',
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
