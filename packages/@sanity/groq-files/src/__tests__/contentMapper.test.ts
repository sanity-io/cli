import {mkdir, mkdtemp, readFile, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {PassThrough} from 'node:stream'

import {describe, expect, it} from 'vitest'

import {handleContentMapperRequest, startContentMapper} from '../contentMapper.js'
import {JsonRpcError, serveJsonRpc} from '../jsonrpc.js'

const SCHEMA = new URL('../../example/schema.json', import.meta.url)

interface Response {
  id: number | string | null

  error?: {code: number; message: string}
  result?: unknown
}

describe('content mapper', () => {
  it('answers initialize, openProject, and transform over Content-Length framing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-mapper-'))
    const schemaPath = join(directory, 'schema.json')
    await writeFile(schemaPath, await readFile(SCHEMA))

    const responses = await roundTrip([
      {
        id: 'api1',
        jsonrpc: '2.0',
        method: 'initialize',
        params: {positionEncodings: ['utf-8', 'utf-16']}, // eslint-disable-line unicorn/text-encoding-identifier-case -- TypeScript's protocol token
      },
      {
        id: 'api2',
        jsonrpc: '2.0',
        method: 'openProject',
        params: {
          compilerOptions: {},
          configFileName: join(directory, 'tsconfig.json'),
          options: {extra: true, schema: schemaPath},
          projectHandle: 'p1',
        },
      },
      {
        id: 'api3',
        jsonrpc: '2.0',
        method: 'transform',
        params: {
          content: '*[_type == "post" && slug.current == $slug][0]{title, role}',
          fileName: join(directory, 'postBySlug.groq'),
          projectHandle: 'p1',
        },
      },
      {id: 'api4', jsonrpc: '2.0', method: 'closeProject', params: {projectHandle: 'p1'}},
      {id: 'api5', jsonrpc: '2.0', method: 'nope', params: {}},
    ])

    expect(responses.map((response) => response.id)).toEqual([
      'api1',
      'api2',
      'api3',
      'api4',
      'api5',
    ])
    expect(responses[0]?.result).toEqual({
      diagnosticSource: 'sanity-groq',
      positionEncoding: 'utf-16',
    })
    const opened = responses[1]?.result as {
      configIdentity: string
      optionDiagnostics: Array<{code: number; path: string[]}>
      watchedFiles: string[]
    }
    expect(opened.configIdentity).toMatch(/^[a-f0-9]{64}$/)
    expect(opened.watchedFiles).toEqual([schemaPath])
    expect(opened.optionDiagnostics).toEqual([expect.objectContaining({code: 2, path: ['extra']})])
    const transformed = responses[2]?.result as {
      diagnostics?: unknown[]
      extension: string
      text: string
    }
    expect(transformed.extension).toBe('.ts')
    expect(transformed.diagnostics).toBeUndefined()
    expect(transformed.text).toContain('slug: string')
    expect(transformed.text).toContain('export default query')
    expect(transformed.text).not.toContain('declare module')
    expect(responses[3]?.result).toEqual({})
    expect(responses[4]?.error).toEqual(expect.objectContaining({code: -32_601}))
  })

  it('refuses a host that cannot take utf-16 positions', async () => {
    await expect(
      handleContentMapperRequest('initialize', {positionEncodings: ['utf-8']}), // eslint-disable-line unicorn/text-encoding-identifier-case -- TypeScript's protocol token
    ).rejects.toMatchObject({code: -32_602})
  })

  it('returns a resolvable module and a diagnostic for a syntax error', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-mapper-syntax-'))
    const opened = (await handleContentMapperRequest('openProject', {
      compilerOptions: {},
      configFileName: join(directory, 'tsconfig.json'),
      projectHandle: 'syntax',
    })) as {configIdentity: string; watchedFiles: string[]}
    expect(opened.configIdentity).toMatch(/^[a-f0-9]{64}$/)
    expect(opened.watchedFiles).toEqual([join(directory, 'schema.json')])

    const result = (await handleContentMapperRequest('transform', {
      content: '[',
      fileName: join(directory, 'bad.groq'),
      projectHandle: 'syntax',
    })) as {diagnostics?: Array<{code: number}>; text: string}
    expect(result.diagnostics?.[0]?.code).toBe(2)
    expect(result.text).toContain('export default query')
    await handleContentMapperRequest('closeProject', {projectHandle: 'syntax'})
  })

  it('reports malformed options and still opens the project', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-mapper-options-'))
    const configFileName = join(directory, 'tsconfig.json')

    const notObject = (await handleContentMapperRequest('openProject', {
      configFileName,
      options: 'schema.json',
      projectHandle: 'o1',
    })) as {optionDiagnostics: Array<{code: number}>}
    expect(notObject.optionDiagnostics).toEqual([expect.objectContaining({code: 1, path: []})])

    const wrongType = (await handleContentMapperRequest('openProject', {
      configFileName,
      options: {schema: 42},
      projectHandle: 'o2',
    })) as {optionDiagnostics: Array<{code: number}>; watchedFiles: string[]}
    expect(wrongType.optionDiagnostics).toEqual([
      expect.objectContaining({code: 3, path: ['schema']}),
    ])
    expect(wrongType.watchedFiles).toEqual([join(directory, 'schema.json')])

    await handleContentMapperRequest('closeProject', {projectHandle: 'o1'})
    await handleContentMapperRequest('closeProject', {projectHandle: 'o2'})
  })

  it('needs an absolute schema path for a project without a tsconfig', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-mapper-inferred-'))
    const schemaPath = join(directory, 'schema.json')
    await writeFile(schemaPath, await readFile(SCHEMA))

    const relative = (await handleContentMapperRequest('openProject', {
      configFileName: '',
      options: {schema: 'schema.json'},
      projectHandle: 'inferred-relative',
    })) as {
      configIdentity: string
      optionDiagnostics: Array<{code: number}>
      watchedFiles: string[]
    }
    expect(relative.optionDiagnostics).toEqual([
      expect.objectContaining({code: 4, path: ['schema']}),
    ])
    expect(relative.watchedFiles).toEqual([])
    expect(relative.configIdentity).toMatch(/^[a-f0-9]{64}$/)
    const untyped = (await handleContentMapperRequest('transform', {
      content: '*[_type == "post"]{title}',
      fileName: join(directory, 'posts.groq'),
      projectHandle: 'inferred-relative',
    })) as {diagnostics?: Array<{code: number; messageText: string}>; text: string}
    expect(untyped.diagnostics?.[0]).toMatchObject({code: 3})
    expect(untyped.diagnostics?.[0]?.messageText).toContain('No schema configured')
    expect(untyped.text).toContain('type Result = unknown')

    const noOptions = (await handleContentMapperRequest('openProject', {
      configFileName: '',
      projectHandle: 'inferred-none',
    })) as {optionDiagnostics: Array<{code: number; path: string[]}>}
    expect(noOptions.optionDiagnostics).toEqual([expect.objectContaining({code: 4, path: []})])

    const absolute = (await handleContentMapperRequest('openProject', {
      configFileName: '',
      options: {schema: schemaPath},
      projectHandle: 'inferred-absolute',
    })) as {optionDiagnostics?: unknown; watchedFiles: string[]}
    expect(absolute.optionDiagnostics).toBeUndefined()
    expect(absolute.watchedFiles).toEqual([schemaPath])
    const typed = (await handleContentMapperRequest('transform', {
      content: '*[_type == "post"]{title}',
      fileName: join(directory, 'posts.groq'),
      projectHandle: 'inferred-absolute',
    })) as {diagnostics?: unknown[]; text: string}
    expect(typed.diagnostics).toBeUndefined()
    expect(typed.text).toContain('title: string')

    for (const projectHandle of ['inferred-relative', 'inferred-none', 'inferred-absolute']) {
      await handleContentMapperRequest('closeProject', {projectHandle})
    }
  })

  it('types each folder against its own schema with resources', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-mapper-resources-'))
    const configFileName = join(directory, 'tsconfig.json')
    await mkdir(join(directory, 'blog', 'queries'), {recursive: true})
    await mkdir(join(directory, 'shop'), {recursive: true})
    await mkdir(join(directory, 'extra'), {recursive: true})
    await writeFile(join(directory, 'blog', 'schema.json'), await readFile(SCHEMA))
    await writeFile(
      join(directory, 'shop', 'schema.json'),
      JSON.stringify([
        {
          attributes: {
            _type: {type: 'objectAttribute', value: {type: 'string', value: 'product'}},
            price: {type: 'objectAttribute', value: {type: 'number'}},
            sku: {type: 'objectAttribute', value: {type: 'string'}},
          },
          name: 'product',
          type: 'document',
        },
      ]),
    )

    const opened = (await handleContentMapperRequest('openProject', {
      compilerOptions: {},
      configFileName,
      options: {
        resources: [
          {path: 'blog', schema: 'blog/schema.json'},
          {path: ['shop', 'extra'], schema: './shop/schema.json'},
        ],
      },
      projectHandle: 'multi',
    })) as {configIdentity: string; optionDiagnostics?: unknown; watchedFiles: string[]}
    expect(opened.optionDiagnostics).toBeUndefined()
    expect(opened.configIdentity).toMatch(/^[a-f0-9]{64}$/)
    expect(opened.watchedFiles).toEqual([
      join(directory, 'schema.json'),
      join(directory, 'blog', 'schema.json'),
      join(directory, 'shop', 'schema.json'),
    ])

    const typed = async (fileName: string, content: string) =>
      (await handleContentMapperRequest('transform', {
        content,
        fileName,
        projectHandle: 'multi',
      })) as {
        diagnostics?: Array<{code: number; messageText: string}>
        text: string
      }

    const posts = await typed(
      join(directory, 'blog', 'queries', 'posts.groq'),
      '*[_type == "post"]{title, role}',
    )
    expect(posts.diagnostics).toBeUndefined()
    expect(posts.text).toContain('role: "admin" | "member"')

    const products = await typed(
      join(directory, 'shop', 'products.groq'),
      '*[_type == "product"]{sku, price}',
    )
    expect(products.diagnostics).toBeUndefined()
    expect(products.text).toContain('sku: string')
    expect(products.text).toContain('price: number')
    expect(products.text).not.toContain('role')

    const extra = await typed(
      join(directory, 'extra', 'products.groq'),
      '*[_type == "product"]{sku}',
    )
    expect(extra.text).toContain('sku: string')

    // The blog schema has no product type, and the shop schema has no post type.
    const crossed = await typed(
      join(directory, 'blog', 'products.groq'),
      '*[_type == "product"]{sku}',
    )
    expect(crossed.text).toContain('type ProductsResult = Array<never>')

    // Outside every resource, the project-wide schema applies, and here it is missing.
    const outside = await typed(join(directory, 'posts.groq'), '*[_type == "post"]{title}')
    expect(outside.diagnostics?.[0]?.messageText).toMatch(
      /^This file is outside every "resources" path\. No schema file at /,
    )
    expect(outside.text).toContain('type Result = unknown')

    // A sibling whose name merely starts with a resource directory is not inside it.
    await mkdir(join(directory, 'shopping'))
    const sibling = await typed(
      join(directory, 'shopping', 'products.groq'),
      '*[_type == "product"]{sku}',
    )
    expect(sibling.diagnostics?.[0]?.messageText).toContain('outside every "resources" path')

    await handleContentMapperRequest('closeProject', {projectHandle: 'multi'})
  })

  it('reports malformed resources and keeps the well-formed ones', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'groq-mapper-resources-bad-'))
    const configFileName = join(directory, 'tsconfig.json')
    await mkdir(join(directory, 'ok'))
    await writeFile(join(directory, 'ok', 'schema.json'), await readFile(SCHEMA))

    const notArray = (await handleContentMapperRequest('openProject', {
      configFileName,
      options: {resources: {path: 'ok', schema: 'ok/schema.json'}},
      projectHandle: 'r1',
    })) as {optionDiagnostics: Array<{code: number; path: unknown[]}>}
    expect(notArray.optionDiagnostics).toEqual([
      expect.objectContaining({code: 5, path: ['resources']}),
    ])

    const shapes = (await handleContentMapperRequest('openProject', {
      configFileName,
      options: {
        resources: [
          'ok',
          {extra: 1, path: 'ok', schema: 'ok/schema.json'},
          {path: [], schema: 'x.json'},
          {path: 'ok'},
        ],
      },
      projectHandle: 'r2',
    })) as {optionDiagnostics: Array<{code: number; path: unknown[]}>; watchedFiles: string[]}
    expect(shapes.optionDiagnostics).toEqual([
      expect.objectContaining({code: 6, path: ['resources', 0]}),
      expect.objectContaining({code: 2, path: ['resources', 1, 'extra']}),
      expect.objectContaining({code: 6, path: ['resources', 2, 'path']}),
      expect.objectContaining({code: 6, path: ['resources', 3, 'schema']}),
    ])
    expect(shapes.watchedFiles).toEqual([
      join(directory, 'schema.json'),
      join(directory, 'ok', 'schema.json'),
    ])
    const typed = (await handleContentMapperRequest('transform', {
      content: '*[_type == "post"]{title}',
      fileName: join(directory, 'ok', 'posts.groq'),
      projectHandle: 'r2',
    })) as {diagnostics?: unknown[]; text: string}
    expect(typed.diagnostics).toBeUndefined()
    expect(typed.text).toContain('title: string')

    // Without a tsconfig, resource paths and schemas must be absolute too.
    const inferred = (await handleContentMapperRequest('openProject', {
      configFileName: '',
      options: {
        resources: [
          {path: ['ok', join(directory, 'ok')], schema: join(directory, 'ok', 'schema.json')},
          {path: join(directory, 'ok'), schema: 'ok/schema.json'},
        ],
        schema: join(directory, 'ok', 'schema.json'),
      },
      projectHandle: 'r3',
    })) as {optionDiagnostics: Array<{code: number; path: unknown[]}>; watchedFiles: string[]}
    expect(inferred.optionDiagnostics).toEqual([
      expect.objectContaining({code: 4, path: ['resources', 0, 'path', 0]}),
      expect.objectContaining({code: 4, path: ['resources', 1, 'schema']}),
    ])
    expect(inferred.watchedFiles).toEqual([join(directory, 'ok', 'schema.json')])

    for (const projectHandle of ['r1', 'r2', 'r3']) {
      await handleContentMapperRequest('closeProject', {projectHandle})
    }
  })

  it('rejects malformed params with invalid params errors', async () => {
    await expect(handleContentMapperRequest('openProject', {})).rejects.toMatchObject({
      code: -32_602,
    })
    await expect(
      handleContentMapperRequest('transform', {content: '*', projectHandle: 'nope'}),
    ).rejects.toMatchObject({code: -32_602})
    await expect(
      handleContentMapperRequest('transform', {
        content: '*',
        fileName: 'x.groq',
        projectHandle: 'never-opened',
      }),
    ).rejects.toMatchObject({code: -32_602, message: 'Unknown project "never-opened".'})
    await expect(handleContentMapperRequest('closeProject', {})).rejects.toMatchObject({
      code: -32_602,
    })
  })
})

describe('json-rpc framing', () => {
  it('distinguishes parse errors from invalid requests and skips notifications', async () => {
    const input = new PassThrough()
    const {chunks, output} = collectOutput()
    const connection = serveJsonRpc({
      handle: async (request) => ({echo: request.params}),
      input,
      output,
    })

    const first = frame({id: 1, jsonrpc: '2.0', method: 'a', params: 'x'})
    const second = frame({id: 2, jsonrpc: '2.0', method: 'b'})
    // Split one message across chunks and pack two into another.
    input.write(first.subarray(0, 7))
    input.write(Buffer.concat([first.subarray(7), second]))
    input.write(frame({jsonrpc: '2.0', method: 'notify'}))
    input.write(Buffer.from('Content-Length: 5\r\n\r\n{nope'))
    input.write(frame({id: 'bad', jsonrpc: '1.0', method: 'c'}))
    input.write(frame({id: {nested: true}, jsonrpc: '2.0', method: 'c'}))
    input.write(frame([1, 2, 3]))
    input.write(Buffer.from('Content-Length: nope\r\n\r\n'))
    input.write(frame({id: 3, jsonrpc: '2.0', method: 'd'}))
    input.end()
    await connection.done

    expect(decode(Buffer.concat(chunks))).toEqual([
      {id: 1, jsonrpc: '2.0', result: {echo: 'x'}},
      {id: 2, jsonrpc: '2.0', result: {}},
      {error: {code: -32_700, message: 'Parse error'}, id: null, jsonrpc: '2.0'},
      {error: {code: -32_600, message: 'Invalid Request'}, id: 'bad', jsonrpc: '2.0'},
      {error: {code: -32_600, message: 'Invalid Request'}, id: null, jsonrpc: '2.0'},
      {error: {code: -32_600, message: 'Invalid Request'}, id: null, jsonrpc: '2.0'},
      {error: {code: -32_600, message: 'Invalid Request'}, id: null, jsonrpc: '2.0'},
      {id: 3, jsonrpc: '2.0', result: {}},
    ])
  })

  it('maps thrown errors to error responses', async () => {
    const responses = await roundTrip(
      [
        {id: 1, jsonrpc: '2.0', method: 'typed'},
        {id: 2, jsonrpc: '2.0', method: 'plain'},
        {id: 3, jsonrpc: '2.0', method: 'weird'},
      ],
      async (request) => {
        switch (request.method) {
          case 'plain': {
            throw new Error('boom')
          }
          case 'typed': {
            throw new JsonRpcError(-32_000, 'custom')
          }
          default: {
            throw 'not an error'
          }
        }
      },
    )
    expect(responses.map((response) => response.error)).toEqual([
      {code: -32_000, message: 'custom'},
      {code: -32_603, message: 'boom'},
      {code: -32_603, message: 'Internal error'},
    ])
  })

  it('answers a request that is in flight when the input ends', async () => {
    const input = new PassThrough()
    const {chunks, output} = collectOutput()
    const release = Promise.withResolvers<void>()
    const connection = serveJsonRpc({
      handle: async () => {
        await release.promise
        return 'late'
      },
      input,
      output,
    })
    input.write(frame({id: 1, jsonrpc: '2.0', method: 'slow'}))
    input.end()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(chunks).toHaveLength(0)
    release.resolve()
    await connection.done
    expect(decode(Buffer.concat(chunks))).toEqual([{id: 1, jsonrpc: '2.0', result: 'late'}])
  })

  it('settles done when the input ends without any message', async () => {
    const input = new PassThrough()
    const connection = serveJsonRpc({
      handle: async () => undefined,
      input,
      output: new PassThrough(),
    })
    input.end()
    await expect(connection.done).resolves.toBeUndefined()
  })

  it('rejects done on an input error and ignores later data', async () => {
    const input = new PassThrough()
    const {chunks, output} = collectOutput()
    const connection = serveJsonRpc({
      handle: async () => 'never',
      input,
      output,
    })
    const failure = new Error('pipe broke')
    input.emit('error', failure)
    input.write(frame({id: 1, jsonrpc: '2.0', method: 'x'}))
    await expect(connection.done).rejects.toBe(failure)
    expect(chunks).toHaveLength(0)
  })
})

async function roundTrip(
  messages: unknown[],
  handle?: Parameters<typeof serveJsonRpc>[0]['handle'],
): Promise<Response[]> {
  const input = new PassThrough()
  const {chunks, output} = collectOutput()
  const connection = handle
    ? serveJsonRpc({handle, input, output})
    : startContentMapper({input, output})
  for (const message of messages) input.write(frame(message))
  input.end()
  await connection.done
  return decode(Buffer.concat(chunks))
}

function collectOutput(): {chunks: Buffer[]; output: PassThrough} {
  const output = new PassThrough()
  const chunks: Buffer[] = []
  output.on('data', (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  })
  return {chunks, output}
}

function frame(message: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(message))
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body])
}

function decode(buffer: Buffer): Response[] {
  const messages: Response[] = []
  let rest = buffer
  while (rest.length > 0) {
    const headerEnd = rest.indexOf('\r\n\r\n')
    const header = rest.toString('utf8', 0, headerEnd)
    const length = Number(/content-length:\s*(\d+)/i.exec(header)?.[1])
    const start = headerEnd + 4
    messages.push(JSON.parse(rest.toString('utf8', start, start + length)) as Response)
    rest = rest.subarray(start + length)
  }
  return messages
}
