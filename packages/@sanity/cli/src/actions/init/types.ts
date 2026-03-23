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
  /**
   * Controls how MCP setup behaves during init:
   * - 'prompt': Ask the user which editors to configure (default, interactive)
   * - 'auto': Auto-configure all detected editors without prompting (--yes in TTY)
   * - 'skip': Skip MCP configuration entirely (CI, --no-mcp)
   */
  mcpMode: 'auto' | 'prompt' | 'skip'
  /** Resolved from `--yes` + TTY check before calling `initAction` */
  unattended: boolean

  /** Positional argument, e.g. `sanity init plugin` */
  argType?: string
  coupon?: string
  dataset?: string
  env?: string
  /** `string` = commit message, `true`/`undefined` = default, `false` = no git */
  git?: boolean | string
  importDataset?: boolean
  // Next.js specific
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
  /** Deprecated flag - kept for backwards compat error messaging */
  reconfigure?: boolean
  template?: string
  templateToken?: string
  typescript?: boolean
  visibility?: 'private' | 'public'
}

export interface InitContext {
  /**
   * Logging methods passed to sub-actions.
   * `initAction` itself throws `InitError` instead of calling `output.error`.
   */
  output: Output
  telemetry: CLITelemetryStore
  workDir: string
}
