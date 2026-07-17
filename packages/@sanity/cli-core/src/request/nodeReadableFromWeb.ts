import {Readable} from 'node:stream'

/**
 * Convert a Web `ReadableStream` to a Node.js `Readable`.
 *
 * Prefer this over `Readable.fromWeb()` while the CLI engines range includes
 * Node versions where `fromWeb` is still experimental (`>=22.12 <22.17`).
 *
 * @param stream - Web readable stream of bytes
 * @returns A Node.js readable stream yielding the same chunks
 * @public
 */
export function nodeReadableFromWeb(stream: ReadableStream<Uint8Array>): Readable {
  const reader = stream.getReader()
  let reading = false
  let ended = false
  let released = false

  const releaseLock = () => {
    if (released) return
    released = true
    reader.releaseLock()
  }

  return new Readable({
    destroy(error, callback) {
      if (ended) {
        releaseLock()
        callback(error)
        return
      }

      ended = true
      reader.cancel(error ?? undefined).then(
        () => {
          releaseLock()
          callback(error)
        },
        (cancelError: unknown) => {
          releaseLock()
          callback(error ?? toError(cancelError))
        },
      )
    },
    read() {
      if (reading || ended) return
      reading = true
      reader.read().then(
        ({done, value}) => {
          reading = false
          if (ended) return
          if (done) {
            ended = true
            releaseLock()
            this.push(null)
            return
          }
          this.push(value)
        },
        (error: unknown) => {
          reading = false
          if (ended) return
          ended = true
          releaseLock()
          this.destroy(toError(error))
        },
      )
    },
  })
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
