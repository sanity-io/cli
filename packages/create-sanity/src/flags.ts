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
  | {flags: InitFlags; kind: 'init'}
  | {kind: 'delegate'; reason: string}
  | {kind: 'help'}

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
 * Parses `create-sanity` arguments. Anything outside what the built-in
 * initializer handles (including invalid input, so the user gets the canonical
 * error) is marked for delegation to `sanity init`.
 */
export function parseInitArgs(args: string[], interactive: boolean): ParsedArgs {
  let values: Values
  let positionals: string[]
  try {
    ;({positionals, values} = parse(args))
  } catch (error) {
    return {kind: 'delegate', reason: error instanceof Error ? error.message : String(error)}
  }

  if (values.help) return {kind: 'help'}
  if (positionals.length > 0) return {kind: 'delegate', reason: 'positional argument'}

  const delegated = DELEGATED_FLAGS.find((flag) => values[flag] !== undefined)
  if (delegated) return {kind: 'delegate', reason: `--${delegated}`}

  const conflicts: [keyof Values, keyof Values][] = [
    ['dataset', 'dataset-default'],
    ['project', 'project-name'],
    ['project-id', 'project-name'],
    ['project', 'project-id'],
  ]
  const conflict = conflicts.find(([a, b]) => values[a] !== undefined && values[b] !== undefined)
  if (conflict) return {kind: 'delegate', reason: `--${conflict[0]} with --${conflict[1]}`}
  // `--no-git` can be folded into `git`, so look at the raw arguments
  if (
    args.includes('--no-git') &&
    args.some((arg) => arg === '--git' || arg.startsWith('--git='))
  ) {
    return {kind: 'delegate', reason: '--git with --no-git'}
  }

  const packageManager = values['package-manager']
  if (packageManager !== undefined && !['npm', 'pnpm', 'yarn'].includes(packageManager)) {
    return {kind: 'delegate', reason: `--package-manager ${packageManager}`}
  }
  const visibility = values.visibility
  if (visibility !== undefined && visibility !== 'private' && visibility !== 'public') {
    return {kind: 'delegate', reason: `--visibility ${visibility}`}
  }
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
