import {z} from 'zod'

export const CURRENT_WORKSPACE_SCHEMA_VERSION = '2025-05-01'

export interface AppManifest {
  version: '1'

  icon?: string
  title?: string
}

export const extractManifestWorkerData = z.object({configPath: z.string(), workDir: z.string()})

export type ExtractManifestWorkerData = z.infer<typeof extractManifestWorkerData>
