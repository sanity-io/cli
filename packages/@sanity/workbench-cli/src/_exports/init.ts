// Browser-safe `init` entry: the workbench `sanity.cli.ts` config templates the
// CLI's init scaffolding fills in, and the coercion that fills `%slug%`. No runtime deps.
export {
  workbenchAppConfigTemplate,
  workbenchStudioConfigTemplate,
} from '../actions/init/cliConfig.js'
export {toAppSlug} from '../appSlug.js'
