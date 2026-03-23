import {InitError} from './initError.js'
import {type InitOptions} from './types.js'

/**
 * Shape of the parsed oclif flags from `InitCommand`.
 * Kept loose so we don't need to import oclif types at runtime.
 */
export interface InitCommandFlags {
  'auto-updates': boolean
  bare: boolean
  'dataset-default': boolean
  mcp: boolean
  'no-git': boolean
  yes: boolean

  coupon?: string
  'create-project'?: string
  dataset?: string
  env?: string
  git?: string
  'import-dataset'?: boolean
  'nextjs-add-config-files'?: boolean
  'nextjs-append-env'?: boolean
  'nextjs-embed-studio'?: boolean
  organization?: string
  'output-path'?: string
  'overwrite-files'?: boolean
  'package-manager'?: string
  project?: string
  'project-name'?: string
  'project-plan'?: string
  provider?: string
  reconfigure?: boolean
  template?: string
  'template-token'?: string
  typescript?: boolean
  visibility?: string
}

/**
 * Shape of the parsed oclif args from `InitCommand`.
 */
export interface InitCommandArgs {
  type?: string
}

const VALID_PACKAGE_MANAGERS = new Set<string>(['npm', 'pnpm', 'yarn'])
function narrowPackageManager(value: string | undefined): InitOptions['packageManager'] {
  return value !== undefined && VALID_PACKAGE_MANAGERS.has(value)
    ? (value as InitOptions['packageManager'])
    : undefined
}

const VALID_VISIBILITIES = new Set<string>(['private', 'public'])
function narrowVisibility(value: string | undefined): InitOptions['visibility'] {
  return value !== undefined && VALID_VISIBILITIES.has(value)
    ? (value as InitOptions['visibility'])
    : undefined
}

/**
 * Converts kebab-case parsed flags into a framework-agnostic `InitOptions` object.
 *
 * @param flags - Parsed flags (from oclif or parseArgs)
 * @param isUnattended - Whether the session is unattended (resolved from `--yes` + TTY check by the caller)
 * @param args - Parsed positional arguments
 * @param mcpMode - MCP setup mode, computed by the command from flags and environment
 */
export function flagsToInitOptions(
  flags: InitCommandFlags,
  isUnattended: boolean,
  args: InitCommandArgs | undefined,
  mcpMode: InitOptions['mcpMode'],
): InitOptions {
  if (flags.env && !flags.env.startsWith('.env')) {
    throw new InitError('Env filename (`--env`) must start with `.env`', 3)
  }

  return {
    argType: args?.type,
    autoUpdates: flags['auto-updates'],
    bare: flags.bare,
    coupon: flags.coupon,
    dataset: flags.dataset,
    datasetDefault: flags['dataset-default'],
    env: flags.env,
    // --git is a string (commit message), --no-git is a separate boolean flag.
    // --no-git wins over --git since they're mutually exclusive.
    git: flags['no-git'] ? false : flags.git,
    importDataset: flags['import-dataset'],
    mcpMode,
    nextjsAddConfigFiles: flags['nextjs-add-config-files'],
    nextjsAppendEnv: flags['nextjs-append-env'],
    nextjsEmbedStudio: flags['nextjs-embed-studio'],
    organization: flags.organization,
    outputPath: flags['output-path'],
    overwriteFiles: flags['overwrite-files'],
    packageManager: narrowPackageManager(flags['package-manager']),
    project: flags.project,
    projectName: flags['project-name'] ?? flags['create-project'],
    projectPlan: flags['project-plan'],
    provider: flags.provider,
    reconfigure: flags.reconfigure,
    template: flags.template,
    templateToken: flags['template-token'],
    typescript: flags.typescript,
    unattended: isUnattended,
    visibility: narrowVisibility(flags.visibility),
  }
}
