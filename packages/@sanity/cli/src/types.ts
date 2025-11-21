import {type SanityClient} from '@sanity/client'
import {type Options, type Ora} from 'ora'

export interface PackageJson {
  name: string
  version: string

  author?: string

  dependencies?: Record<string, string>
  description?: string
  devDependencies?: Record<string, string>
  license?: string

  peerDependencies?: Record<string, string>
  private?: boolean
  repository?: {type: string; url: string}

  scripts?: Record<string, string>
}

/**
 * Types for schema store actions - migrated from original CLI
 */
export interface CliOutputter {
  clear: () => void
  error: (...args: unknown[]) => void
  print: (...args: unknown[]) => void
  spinner(options: Options | string): Ora
  success: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
}

export interface ClientRequirements {
  requireProject?: boolean
  requireUser?: boolean
}

export type CliApiClient = (options?: ClientRequirements) => SanityClient

export interface CliCommandContext {
  apiClient: CliApiClient
  output: CliOutputter
  workDir: string
}
