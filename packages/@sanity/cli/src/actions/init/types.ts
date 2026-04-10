import {Framework} from '@vercel/frameworks'
import {z} from 'zod'

import {GenerateConfigOptions} from './createStudioConfig'

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

export const templateManifestSchema = z.object({
  postInitMessage: z.union([z.string().max(2000), z.array(z.string().max(500)).max(50)]).optional(),
})

export type TemplateManifest = z.infer<typeof templateManifestSchema>
