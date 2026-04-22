import {type CLITelemetryStore, type Output} from '@sanity/cli-core'
import {type Framework} from '@vercel/frameworks'

import {type GenerateConfigOptions} from './createStudioConfig.js'

export type VersionedFramework = Framework & {
  detectedVersion?: string
}

export interface ProjectTemplate {
  configTemplate?: ((variables: GenerateConfigOptions['variables']) => string) | string
  datasetUrl?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  entry?: string
  importPrompt?: string
  scripts?: Record<string, string>
  type?: 'commonjs' | 'module'
  typescriptOnly?: boolean
}

export interface InitOptions {
  autoUpdates: boolean
  bare: boolean
  datasetDefault: boolean
  fromCreate: boolean
  mcpMode: 'auto' | 'prompt' | 'skip'
  unattended: boolean

  argType?: string
  coupon?: string
  dataset?: string
  env?: string
  git?: boolean | string
  importDataset?: boolean
  nextjsAddConfigFiles?: boolean
  nextjsAppendEnv?: boolean
  nextjsEmbedStudio?: boolean
  organization?: string
  outputPath?: string
  overwriteFiles?: boolean
  packageManager?: 'npm' | 'pnpm' | 'yarn'
  project?: string
  projectName?: string
  projectPlan?: string
  provider?: string
  reconfigure?: boolean
  template?: string
  templateToken?: string
  typescript?: boolean
  visibility?: 'private' | 'public'
}

export interface InitContext {
  output: Output
  telemetry: CLITelemetryStore
  workDir: string
}

interface InitCommandFlags {
  'auto-updates': boolean
  bare: boolean
  'dataset-default': boolean
  'from-create': boolean
  mcp: boolean
  'no-git': boolean

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

interface InitCommandArgs {
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

export function flagsToInitOptions(
  flags: InitCommandFlags,
  isUnattended: boolean,
  args: InitCommandArgs | undefined,
  mcpMode: InitOptions['mcpMode'],
): InitOptions {
  return {
    argType: args?.type,
    autoUpdates: flags['auto-updates'],
    bare: flags.bare,
    coupon: flags.coupon,
    dataset: flags.dataset,
    datasetDefault: flags['dataset-default'],
    env: flags.env,
    fromCreate: flags['from-create'],
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
