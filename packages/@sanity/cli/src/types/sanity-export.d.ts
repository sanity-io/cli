declare module '@sanity/export' {
  import {type SanityClient} from '@sanity/client'

  interface ExportOptions {
    client: SanityClient
    outputPath: string

    assetConcurrency?: number
    assets?: boolean
    compress?: boolean
    dataset?: string
    drafts?: boolean
    mediaLibraryId?: string
    mode?: string
    onProgress?: (progress: {
      current: number
      step: string
      total: number
      update?: boolean
    }) => void
    raw?: boolean
    types?: string[]
  }

  function exportDataset(options: ExportOptions): Promise<void>
  export default exportDataset
}
