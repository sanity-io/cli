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
  return Readable.from(
    (async function* () {
      const reader = stream.getReader()
      let completed = false
      try {
        while (true) {
          const {done, value} = await reader.read()
          if (done) {
            completed = true
            return
          }
          yield value
        }
      } finally {
        if (!completed) {
          await reader.cancel().catch(() => {
            // Preserve the error that stopped the Node stream.
          })
        }
        reader.releaseLock()
      }
    })(),
  )
}
