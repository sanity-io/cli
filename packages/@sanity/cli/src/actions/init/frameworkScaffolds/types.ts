import {type Output, type TelemetryUserProperties} from '@sanity/cli-core'
import {type TelemetryTrace} from '@sanity/telemetry'

import {type InitStepResult} from '../../../telemetry/init.telemetry.js'
import {type InitOptions, type VersionedFramework} from '../types.js'

export interface ScaffoldContext {
  datasetName: string
  envFilename: string
  fileExtension: 'js' | 'ts'
  framework: VersionedFramework | null
  options: InitOptions
  output: Output
  projectId: string
  template: 'blog' | 'clean'
  trace: TelemetryTrace<TelemetryUserProperties, InitStepResult>
  useTypeScript: boolean
  workDir: string
}

/**
 * Framework-specific wiring that sits on top of the Studio. The
 * Studio files are the same for every framework. A scaffold only adds what the
 * app needs to talk to Sanity.
 */
export interface FrameworkScaffold {
  /** Allows the app's local dev server to query the API. */
  allowDevOrigin: (ctx: ScaffoldContext) => Promise<void>
  /** Adds the project ID and dataset to the app's env file. */
  appendEnv: (ctx: ScaffoldContext) => Promise<void>
  /** Package the app uses for Sanity queries. Installed last, through the package manager. */
  clientPackage: string
  /** The framework slug as used in the `@vercel/frameworks` package. */
  id: string
  /** Packages the app needs, installed with the Studio packages. */
  packages: readonly string[]
  /** Writes the framework's env and client files under `sanity/`. */
  writeClientFiles: (ctx: ScaffoldContext, options: {srcFolderPrefix: boolean}) => Promise<void>

  /**
   * Writes the Studio as a route in the app. Only frameworks that support an
   * in-app Studio implement this. Returns the route.
   */
  writeEmbeddedStudio?: (ctx: ScaffoldContext) => Promise<string>
}
