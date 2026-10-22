type JsonRpcId = number | string | null

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  method: string

  id?: JsonRpcId
  params?: unknown
}

export const JsonRpcErrorCode = {
  internal: -32_603,
  invalidParams: -32_602,
  invalidRequest: -32_600,
  methodNotFound: -32_601,
  parseError: -32_700,
} as const

export class JsonRpcError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'JsonRpcError'
    this.code = code
  }
}

export interface JsonRpcConnection {
  done: Promise<void>
}

export interface JsonRpcInput {
  on(event: 'data', listener: (chunk: Buffer | string) => void): void
  on(event: 'end', listener: () => void): void
  on(event: 'error', listener: (error: Error) => void): void
}

export interface JsonRpcOutput {
  write(chunk: Buffer | string): void
}

type Incoming =
  | {id: JsonRpcId; kind: 'invalid'}
  | {kind: 'parse'}
  | {kind: 'request'; request: JsonRpcRequest}

/**
 * JSON-RPC 2.0 over stdio using the LSP `Content-Length` framing TypeScript's
 * content mapper host speaks. Requests are answered in order, and `done`
 * settles once the input has ended and the last answer has been written.
 */
export function serveJsonRpc(options: {
  handle: (request: JsonRpcRequest) => Promise<unknown>
  input: JsonRpcInput
  output: JsonRpcOutput
}): JsonRpcConnection {
  let buffer = Buffer.alloc(0)
  const queue: Incoming[] = []
  let reading = true
  let working = false
  let failed = false

  const {promise: done, reject: rejectDone, resolve: resolveDone} = Promise.withResolvers<void>()

  const pump = () => {
    if (working) return
    working = true
    void (async () => {
      for (let item = queue.shift(); item; item = queue.shift()) {
        await answer(options.output, options.handle, item)
      }
      working = false
      if (!reading) resolveDone()
    })().catch((error: unknown) => {
      failed = true
      rejectDone(error)
    })
  }

  options.input.on('data', (chunk: Buffer | string) => {
    if (failed) return
    buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)])
    for (let next = takeMessage(buffer); next; next = takeMessage(buffer)) {
      buffer = buffer.subarray(next.consumed)
      queue.push(next.item)
    }
    pump()
  })

  options.input.on('end', () => {
    reading = false
    if (!working) resolveDone()
  })

  options.input.on('error', (error: Error) => {
    failed = true
    rejectDone(error)
  })

  return {done}
}

async function answer(
  output: JsonRpcOutput,
  handle: (request: JsonRpcRequest) => Promise<unknown>,
  item: Incoming,
): Promise<void> {
  switch (item.kind) {
    case 'invalid': {
      writeError(output, item.id, JsonRpcErrorCode.invalidRequest, 'Invalid Request')
      return
    }
    case 'parse': {
      writeError(output, null, JsonRpcErrorCode.parseError, 'Parse error')
      return
    }
    case 'request': {
      const {request} = item
      if (request.id === undefined) return
      try {
        const result = await handle(request)
        writeMessage(output, {id: request.id, jsonrpc: '2.0', result})
      } catch (error) {
        const code = error instanceof JsonRpcError ? error.code : JsonRpcErrorCode.internal
        const message = error instanceof Error ? error.message : 'Internal error'
        writeError(output, request.id, code, message)
      }
      return
    }
    default: {
      const exhaustive: never = item
      throw new Error(`Unexpected message ${String(exhaustive)}`)
    }
  }
}

function takeMessage(buffer: Buffer): {consumed: number; item: Incoming} | undefined {
  const headerEnd = buffer.indexOf('\r\n\r\n')
  if (headerEnd === -1) return undefined
  const header = buffer.toString('utf8', 0, headerEnd)
  const match = /content-length:\s*(\d+)/i.exec(header)
  const length = match?.[1] === undefined ? Number.NaN : Number(match[1])
  if (!Number.isSafeInteger(length) || length < 0) {
    // The body cannot be located without a length, so only the header is dropped.
    return {consumed: headerEnd + 4, item: {id: null, kind: 'invalid'}}
  }
  const bodyStart = headerEnd + 4
  const bodyEnd = bodyStart + length
  if (buffer.length < bodyEnd) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(buffer.toString('utf8', bodyStart, bodyEnd))
  } catch {
    return {consumed: bodyEnd, item: {kind: 'parse'}}
  }
  return {
    consumed: bodyEnd,
    item: isRequest(parsed)
      ? {kind: 'request', request: parsed}
      : {id: idOf(parsed), kind: 'invalid'},
  }
}

function isRequest(value: unknown): value is JsonRpcRequest {
  if (typeof value !== 'object' || value === null) return false
  if (!('method' in value) || typeof value.method !== 'string') return false
  if (!('jsonrpc' in value) || value.jsonrpc !== '2.0') return false
  return !('id' in value) || isId(value.id)
}

function idOf(value: unknown): JsonRpcId {
  if (typeof value === 'object' && value !== null && 'id' in value && isId(value.id)) {
    return value.id
  }
  return null
}

function isId(value: unknown): value is JsonRpcId {
  return value === null || typeof value === 'string' || typeof value === 'number'
}

function writeError(output: JsonRpcOutput, id: JsonRpcId, code: number, message: string): void {
  writeMessage(output, {error: {code, message}, id, jsonrpc: '2.0'})
}

function writeMessage(output: JsonRpcOutput, message: unknown): void {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  output.write(`Content-Length: ${body.length}\r\n\r\n`)
  output.write(body)
}
