// Browser-safe `init` entry: the workbench `sanity.cli.ts` config templates the
// CLI's init scaffolding fills in, and the coercion that fills `%slug%`. No runtime deps.
export {
  workbenchAppConfigTemplate,
  workbenchMediaLibraryConfigTemplate,
  workbenchStudioConfigTemplate,
} from '@sanity/cli-core/workbench'
export {toAppSlug} from '@sanity/cli-core/workbench'
