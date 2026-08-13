import {getCliExecutionContext} from '@sanity/cli-core/executionContext'
import {spinner} from '@sanity/cli-core/ux'

import {type AssetType} from '../../services/assets.js'
import {uploadAssetFromFile} from './uploadAssetFromFile.js'

interface UploadAssetWithProgressOptions {
  assetType: AssetType
  dataset: string
  filename: string
  filePath: string
  isInteractive: boolean
  logToStderr: (message: string) => void
  projectId: string

  contentType?: string
}

export async function uploadAssetWithProgress(options: UploadAssetWithProgressOptions) {
  const {assetType, isInteractive, logToStderr, ...uploadOptions} = options
  const uploadMessage = `Uploading ${assetType} asset`
  const assetDocumentMessage = `Creating ${assetType} asset document`
  const executionContext = getCliExecutionContext()
  const isTTY = !executionContext && isInteractive
  const uploadProgress = spinner(
    isTTY
      ? `${uploadMessage} [0%]. Large uploads may take several minutes.`
      : `${uploadMessage}. Large uploads may take several minutes.`,
  ).start()
  if (executionContext) logToStderr(`${uploadMessage}. Large uploads may take several minutes.`)

  let assetDocumentProgress: ReturnType<typeof spinner> | undefined
  let assetDocumentStarted = false
  let lastReportedProgress = 0
  let nextNonInteractiveCheckpoint = 25

  const startAssetDocument = () => {
    if (assetDocumentStarted) return
    assetDocumentStarted = true
    if (!isTTY) {
      uploadProgress.text = assetDocumentMessage
      logToStderr(assetDocumentMessage)
      return
    }

    uploadProgress.succeed(`${uploadMessage} [100%]`)
    assetDocumentProgress = spinner(assetDocumentMessage).start()
  }

  const uploadController = new AbortController()
  const interruptUpload = () => uploadController.abort(new Error('SIGINT'))
  const handlesInterrupt = !executionContext
  if (handlesInterrupt) process.once('SIGINT', interruptUpload)

  try {
    const asset = await uploadAssetFromFile({
      ...uploadOptions,
      assetType,
      onProgress: (percent) => {
        const progress = Math.min(100, Math.floor(percent))
        if (progress <= lastReportedProgress) return

        lastReportedProgress = progress
        if (progress === 100) {
          startAssetDocument()
        } else {
          uploadProgress.text = `${uploadMessage} [${progress}%]`
          if (!isTTY && progress >= nextNonInteractiveCheckpoint) {
            const checkpoint = Math.min(75, Math.floor(progress / 25) * 25)
            logToStderr(`${uploadMessage} [${checkpoint}%]`)
            nextNonInteractiveCheckpoint = checkpoint + 25
          }
        }
      },
      signal: uploadController.signal,
    })

    if (isTTY) {
      startAssetDocument()
      assetDocumentProgress?.succeed(assetDocumentMessage)
      spinner().succeed(`Uploaded ${assetType} asset: ${asset._id}`)
    } else if (executionContext) {
      logToStderr(`Uploaded ${assetType} asset: ${asset._id}`)
    } else {
      uploadProgress.succeed(`Uploaded ${assetType} asset: ${asset._id}`)
    }

    return asset
  } catch (error) {
    const activeProgress = assetDocumentProgress ?? uploadProgress
    activeProgress.stop()
    if (uploadController.signal.aborted) {
      throw uploadController.signal.reason
    }
    throw error
  } finally {
    if (handlesInterrupt) process.off('SIGINT', interruptUpload)
  }
}
