import {type AssetType, ingestAssetFromUrl} from '../../services/assets.js'
import {withUrlIngestProgress} from './withUrlIngestProgress.js'

interface IngestAssetFromUrlWithProgressOptions {
  assetType: AssetType
  dataset: string
  isInteractive: boolean
  logToStderr: (message: string) => void
  projectId: string
  url: string

  filename?: string
}

/**
 * Ingest a dataset asset from a URL, reporting the wait.
 */
export async function ingestAssetFromUrlWithProgress(
  options: IngestAssetFromUrlWithProgressOptions,
) {
  const {assetType, isInteractive, logToStderr, ...ingestOptions} = options
  const ingestMessage = `Fetching ${assetType} asset from URL`

  return withUrlIngestProgress({
    ingest: (signal) => ingestAssetFromUrl({...ingestOptions, assetType, signal}),
    isInteractive,
    logToStderr,
    successMessage: (asset) => `Uploaded ${assetType} asset: ${asset._id}`,
    waitMessage: `${ingestMessage}. Sanity downloads the asset, which may take several minutes.`,
  })
}
