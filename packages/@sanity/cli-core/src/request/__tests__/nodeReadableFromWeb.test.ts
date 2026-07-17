import {once} from 'node:events'
import {Readable} from 'node:stream'

import {describe, expect, test, vi} from 'vitest'

import {nodeReadableFromWeb} from '../nodeReadableFromWeb.js'

describe('#nodeReadableFromWeb', () => {
  test('converts a web ReadableStream into a Node Readable with the same bytes', async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])]
    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
    })

    const nodeStream = nodeReadableFromWeb(webStream)
    expect(nodeStream).toBeInstanceOf(Readable)

    const received: Buffer[] = []
    for await (const chunk of nodeStream) {
      received.push(Buffer.from(chunk))
    }

    expect(Buffer.concat(received)).toEqual(Buffer.from([1, 2, 3, 4, 5]))
  })

  test('handles an empty stream', async () => {
    const cancel = vi.fn()
    const webStream = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.close()
      },
    })

    const received: Buffer[] = []
    for await (const chunk of nodeReadableFromWeb(webStream)) {
      received.push(Buffer.from(chunk))
    }

    expect(received).toEqual([])
    expect(cancel).not.toHaveBeenCalled()
  })

  test('cancels the web stream when the Node stream is destroyed early', async () => {
    const cancel = vi.fn()
    const webStream = new ReadableStream<Uint8Array>({
      cancel,
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]))
      },
    })
    const nodeStream = nodeReadableFromWeb(webStream)

    nodeStream.once('data', () => nodeStream.destroy())
    await once(nodeStream, 'close')

    expect(cancel).toHaveBeenCalledOnce()
  })
})
