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
 * Computes derived state (`isUnattended`, `mcpMode`) from the flags and
 * the caller's interactive-environment check so the logic lives in one place.
 *
 * @param flags - Parsed flags (from oclif or parseArgs)
 * @param interactive - Whether the session is running in an interactive terminal
 * @param args - Parsed positional arguments
 */
export function flagsToInitOptions(
  flags: InitCommandFlags,
  interactive: boolean,
  args: InitCommandArgs | undefined,
): InitOptions {
  if (flags.env && !flags.env.startsWith('.env')) {
    throw new InitError('Env filename (`--env`) must start with `.env`', 3)
  }

  const isUnattended = flags.yes || !interactive

  // MCP setup mode:
  // - CI (no TTY) or --no-mcp: skip MCP entirely
  // - --yes (user terminal): auto-configure all detected editors
  // - Interactive: prompt user
  let mcpMode: InitOptions['mcpMode'] = 'prompt'
  if (!flags.mcp || !interactive) {
    mcpMode = 'skip'
  } else if (flags.yes) {
    mcpMode = 'auto'
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
