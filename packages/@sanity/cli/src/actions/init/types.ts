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
