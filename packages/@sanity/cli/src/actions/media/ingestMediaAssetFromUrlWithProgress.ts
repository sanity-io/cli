import {
  ingestMediaLibraryAssetFromUrl,
  type MediaLibraryAsset,
} from '../../services/mediaLibraries.js'
import {withUrlIngestProgress} from '../assets/withUrlIngestProgress.js'

interface IngestMediaAssetFromUrlWithProgressOptions {
  isInteractive: boolean
  logToStderr: (message: string) => void
  mediaLibraryId: string
  url: string

  aspects?: Record<string, unknown>
  filename?: string
}

/**
 * Ingest a media library asset from a URL, reporting the wait.
 */
export async function ingestMediaAssetFromUrlWithProgress(
  options: IngestMediaAssetFromUrlWithProgressOptions,
): Promise<MediaLibraryAsset> {
  const {isInteractive, logToStderr, ...ingestOptions} = options

  return withUrlIngestProgress({
    ingest: (signal) => ingestMediaLibraryAssetFromUrl({...ingestOptions, signal}),
    isInteractive,
    logToStderr,
    successMessage: (result) => `Imported asset: ${result.asset._id}`,
    waitMessage:
      'Fetching asset from URL. Sanity downloads the asset, which may take several minutes.',
  })
}
