import {getCliExecutionContext} from '@sanity/cli-core/executionContext'
import {spinner} from '@sanity/cli-core/ux'

interface WithUrlIngestProgressOptions<T> {
  /**
   * Performs the ingest. Receives a signal that aborts with an `Error('SIGINT')`
   * when the user interrupts, so callers can pass it straight to the request.
   */
  ingest: (signal: AbortSignal) => Promise<T>
  isInteractive: boolean
  logToStderr: (message: string) => void
  successMessage: (result: T) => string
  waitMessage: string
}

/**
 * Report progress for an asset ingest where Sanity fetches the source itself.
 *
 * The bytes never pass through this process, so there is no upload percentage
 * to report — only a single wait that can run into minutes. The spinner exists
 * to keep that wait legible rather than to track it.
 *
 * Shared by the dataset and media library ingest paths because the interrupt
 * handling below is easy to get subtly wrong, not because the two have much
 * else in common.
 */
export async function withUrlIngestProgress<T>({
  ingest,
  isInteractive,
  logToStderr,
  successMessage,
  waitMessage,
}: WithUrlIngestProgressOptions<T>): Promise<T> {
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
    const result = await ingest(ingestController.signal)
    const message = successMessage(result)

    if (executionContext) {
      ingestProgress.stop()
      logToStderr(message)
    } else {
      ingestProgress.succeed(message)
    }

    return result
  } catch (error) {
    ingestProgress.stop()
    ingestController.signal.throwIfAborted()
    throw error
  } finally {
    if (handlesInterrupt) process.off('SIGINT', interruptIngest)
    if (resumesInterruptInput) process.stdin.pause()
  }
}
