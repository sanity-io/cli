import {getCliExecutionContext} from '@sanity/cli-core/executionContext'
import {spinner} from '@sanity/cli-core/ux'

import {type AssetType, ingestAssetFromUrl} from '../../services/assets.js'

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
 * Sanity fetches the asset itself, so there is no upload percentage to report
 * — only a single wait that can run into minutes. The spinner exists to keep
 * that wait legible rather than to track it.
 */
export async function ingestAssetFromUrlWithProgress(
  options: IngestAssetFromUrlWithProgressOptions,
) {
  const {assetType, isInteractive, logToStderr, ...ingestOptions} = options
  const ingestMessage = `Fetching ${assetType} asset from URL`
  const waitMessage = `${ingestMessage}. Sanity downloads the asset, which may take several minutes.`
  const executionContext = getCliExecutionContext()
  const isTTY = !executionContext && isInteractive
  const ingestProgress = spinner(waitMessage).start()
  if (executionContext) logToStderr(waitMessage)

  const ingestController = new AbortController()
  const interruptIngest = () => ingestController.abort(new Error('SIGINT'))
  const handlesInterrupt = !executionContext
  if (handlesInterrupt) process.once('SIGINT', interruptIngest)

  // Ora uses raw mode for Ctrl+C, but its input listener does not always make stdin flow.
  const resumesInterruptInput =
    handlesInterrupt &&
    isTTY &&
    ingestProgress.isSpinning &&
    process.stdin.isTTY &&
    process.stdin.isRaw &&
    process.stdin.readableFlowing !== true
  if (resumesInterruptInput) process.stdin.resume()

  try {
    const asset = await ingestAssetFromUrl({
      ...ingestOptions,
      assetType,
      signal: ingestController.signal,
    })
    const successMessage = `Uploaded ${assetType} asset: ${asset._id}`

    if (executionContext) {
      ingestProgress.stop()
      logToStderr(successMessage)
    } else {
      ingestProgress.succeed(successMessage)
    }

    return asset
  } catch (error) {
    ingestProgress.stop()
    ingestController.signal.throwIfAborted()
    throw error
  } finally {
    if (handlesInterrupt) process.off('SIGINT', interruptIngest)
    if (resumesInterruptInput) process.stdin.pause()
  }
}
