import {parseArgs, type ParseArgsConfig} from 'node:util'

/**
 * Flags understood by the built-in initializer. They mirror `sanity init` so
 * the same arguments work regardless of which path handles them.
 */
const options = {
  'auto-updates': {type: 'boolean'},
  bare: {type: 'boolean'},
  coupon: {type: 'string'},
  'create-project': {type: 'string'},
  dataset: {type: 'string'},
  'dataset-default': {type: 'boolean'},
  env: {type: 'string'},
  'from-create': {type: 'boolean'},
  git: {type: 'string'},
  help: {short: 'h', type: 'boolean'},
  'import-dataset': {type: 'boolean'},
  install: {type: 'boolean'},
  json: {type: 'boolean'},
  mcp: {type: 'boolean'},
  'nextjs-add-config-files': {type: 'boolean'},
  'nextjs-append-env': {type: 'boolean'},
  'nextjs-embed-studio': {type: 'boolean'},
  'no-git': {type: 'boolean'},
  organization: {type: 'string'},
  'output-path': {type: 'string'},
  'overwrite-files': {type: 'boolean'},
  'package-manager': {type: 'string'},
  project: {type: 'string'},
  'project-id': {type: 'string'},
  'project-name': {type: 'string'},
  'project-plan': {type: 'string'},
  provider: {type: 'string'},
  quickstart: {type: 'boolean'},
  reconfigure: {type: 'boolean'},
  skills: {type: 'boolean'},
  template: {type: 'string'},
  'template-token': {type: 'string'},
  typescript: {type: 'boolean'},
  'unstable--workbench': {type: 'boolean'},
  visibility: {type: 'string'},
  yes: {short: 'y', type: 'boolean'},
} satisfies ParseArgsConfig['options']

type Values = ReturnType<typeof parse>['values']

function parse(args: string[]) {
  return parseArgs({allowNegative: true, allowPositionals: true, args, options, strict: true})
}

export interface InitFlags {
  autoUpdates: boolean
  datasetDefault: boolean
  install: boolean
  mcp: boolean
  skills: boolean
  /** `--yes`, or no interactive terminal */
  unattended: boolean
  yes: boolean

  dataset?: string
  /** A commit message, or `false` for `--no-git` */
  git?: false | string
  importDataset?: boolean
  organization?: string
  outputPath?: string
  overwriteFiles?: boolean
  packageManager?: 'npm' | 'pnpm' | 'yarn'
  project?: string
  projectName?: string
  provider?: string
  template?: string
  typescript?: boolean
  visibility?: 'private' | 'public'
}

export type ParsedArgs =
  | {exitCode: number; kind: 'error'; message: string}
  | {flags: InitFlags; kind: 'init'}
  | {kind: 'delegate'; reason: string}
  | {kind: 'help'}

const USAGE_ERROR = 2

/** A usage error worded like `sanity init`'s, so either path reports it the same way */
function usageError(message: string): ParsedArgs {
  return {exitCode: USAGE_ERROR, kind: 'error', message: `${message}\nSee more help with --help`}
}

/**
 * `npm create sanity -- <flags>` strips the separator, but other ways of
 * running us may pass it through. `sanity init` takes no pass-through
 * arguments, so separators carry no meaning and are dropped.
 */
export function stripSeparators(args: string[]): string[] {
  return args.filter((arg) => arg !== '--')
}

function parseError(error: unknown): ParsedArgs {
  const message = error instanceof Error ? error.message : String(error)
  const code = (error as NodeJS.ErrnoException).code
  const flag = message.match(/'(-[^' ]+)/)?.[1] ?? ''
  if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') return usageError(`Nonexistent flag: ${flag}`)
  if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' && message.includes('argument missing')) {
    return usageError(`Flag ${flag} expects a value`)
  }
  return usageError(message)
}

/** Flags that only the full `sanity init` implements */
const DELEGATED_FLAGS = [
  'bare',
  'coupon',
  'create-project',
  'env',
  'json',
  'nextjs-add-config-files',
  'nextjs-append-env',
  'nextjs-embed-studio',
  'project-plan',
  'quickstart',
  'reconfigure',
  'template-token',
  'unstable--workbench',
] as const

/** Built-in Studio templates. App templates and remote templates use `sanity init`. */
const STUDIO_TEMPLATES = new Set([
  'blog',
  'clean',
  'get-started',
  'moviedb',
  'page-builder',
  'quickstart',
  'shopify',
  'shopify-online-storefront',
])

/**
 * Parses `create-sanity` arguments (separators already stripped). Usage
 * errors are reported directly, worded as `sanity init` does, rather than
 * paying for the full CLI just to print them. Features only the full
 * initializer implements are marked for delegation to `sanity init`.
 */
export function parseInitArgs(args: string[], interactive: boolean): ParsedArgs {
  let values: Values
  let positionals: string[]
  try {
    ;({positionals, values} = parse(args))
  } catch (error) {
    return parseError(error)
  }

  if (values.help) return {kind: 'help'}
  if (positionals.length > 1)
    return usageError(`Unexpected arguments: ${positionals.slice(1).join(', ')}`)
  if (positionals.length === 1) {
    return {
      exitCode: 1,
      kind: 'error',
      message:
        positionals[0] === 'plugin'
          ? 'Initializing plugins through the CLI is no longer supported'
          : `Unknown init type "${positionals[0]}"`,
    }
  }

  const conflicts: [keyof Values, keyof Values][] = [
    ['dataset', 'dataset-default'],
    ['project', 'project-name'],
    ['project-id', 'project-name'],
    ['project', 'project-id'],
  ]
  const conflict = conflicts.find(([a, b]) => values[a] !== undefined && values[b] !== undefined)
  if (conflict) {
    const [flag, other] = conflict
    const value = values[flag]
    const shown = typeof value === 'string' ? `--${flag}=${value}` : `--${flag}`
    return usageError(
      `The following error occurred:\n  ${shown} cannot also be provided when using --${other}`,
    )
  }
  // `--no-git` can be folded into `git`, so look at the raw arguments
  if (
    args.includes('--no-git') &&
    args.some((arg) => arg === '--git' || arg.startsWith('--git='))
  ) {
    return usageError(
      'The following error occurred:\n  --no-git cannot also be provided when using --git',
    )
  }

  const packageManager = values['package-manager']
  if (packageManager !== undefined && !['npm', 'pnpm', 'yarn'].includes(packageManager)) {
    return usageError(`Expected --package-manager=${packageManager} to be one of: npm, yarn, pnpm`)
  }
  const visibility = values.visibility
  if (visibility !== undefined && visibility !== 'private' && visibility !== 'public') {
    return usageError(`Expected --visibility=${visibility} to be one of: public, private`)
  }

  const delegated = DELEGATED_FLAGS.find((flag) => values[flag] !== undefined)
  if (delegated) return {kind: 'delegate', reason: `--${delegated}`}
  if (values.template !== undefined && !STUDIO_TEMPLATES.has(values.template)) {
    return {kind: 'delegate', reason: `--template ${values.template}`}
  }
  if (values.provider === 'vercel') return {kind: 'delegate', reason: '--provider vercel'}

  const yes = values.yes ?? false
  return {
    flags: {
      autoUpdates: values['auto-updates'] ?? true,
      dataset: values.dataset,
      datasetDefault: values['dataset-default'] ?? false,
      // Depending on the argument order, `--no-git` lands on either key
      git: values['no-git'] || (values.git as unknown) === false ? false : values.git,
      importDataset: values['import-dataset'],
      install: values.install ?? true,
      mcp: values.mcp ?? true,
      organization: values.organization,
      outputPath: values['output-path'],
      overwriteFiles: values['overwrite-files'],
      packageManager: packageManager as InitFlags['packageManager'],
      project: values.project ?? values['project-id'],
      projectName: values['project-name'],
      provider: values.provider,
      skills: values.skills ?? true,
      template: values.template,
      typescript: values.typescript,
      unattended: yes || !interactive,
      visibility,
      yes,
    },
    kind: 'init',
  }
}
