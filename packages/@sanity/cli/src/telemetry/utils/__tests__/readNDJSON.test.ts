import { rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {type TelemetryEvent} from '@sanity/telemetry'
import {afterEach, describe, expect, it} from 'vitest'

import {readNDJSON} from '../readNDJSON.js'

describe('readNDJSON', () => {
  let tempDirs: string[] = []

  afterEach(async () => {
    await Promise.all(
      tempDirs.map(async (dir) => {
        try {
          await rm(dir, {force: true, recursive: true})
        } catch {
          // Ignore cleanup errors
        }
      }),
    )
    tempDirs = []
  })

  const createTempDir = async (): Promise<string> => {
    const dir = await import('node:fs/promises').then((fs) =>
      fs.mkdtemp(join(tmpdir(), 'readndjson-test-')),
    )
    tempDirs.push(dir)
    return dir
  }

  it('should parse valid NDJSON file with multiple events', async () => {
    const tempDir = await createTempDir()
    const filePath = join(tempDir, 'events.ndjson')

    const events: TelemetryEvent[] = [
      {
        createdAt: '2023-01-01T00:00:00.000Z',
        data: {test: true},
        name: 'event-1',
        sessionId: 'test-1',
        type: 'log',
        version: 1,
      },
      {
        context: {},
        createdAt: '2023-01-01T00:01:00.000Z',
        name: 'trace-1',
        sessionId: 'test-2',
        traceId: 'trace-123',
        type: 'trace.start',
        version: 1,
      },
    ]

    const content = events.map((e) => JSON.stringify(e)).join('\n')
    await writeFile(filePath, content, 'utf8')

    const result = await readNDJSON(filePath)

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(events[0])
    expect(result[1]).toEqual(events[1])
  })

  it('should handle empty file', async () => {
    const tempDir = await createTempDir()
    const filePath = join(tempDir, 'empty.ndjson')

    await writeFile(filePath, '', 'utf8')

    const result = await readNDJSON(filePath)

    expect(result).toEqual([])
  })

  it('should handle file with only whitespace', async () => {
    const tempDir = await createTempDir()
    const filePath = join(tempDir, 'whitespace.ndjson')

    await writeFile(filePath, '\n\n  \n\t\n', 'utf8')

    const result = await readNDJSON(filePath)

    expect(result).toEqual([])
  })

  it('should filter out empty lines', async () => {
    const tempDir = await createTempDir()
    const filePath = join(tempDir, 'with-empty-lines.ndjson')

    const event: TelemetryEvent = {
      createdAt: '2023-01-01T00:00:00.000Z',
      data: {value: 42},
      name: 'event',
      sessionId: 'test',
      type: 'log',
      version: 1,
    }

    const content = `${JSON.stringify(event)}\n\n${JSON.stringify(event)}\n\n`
    await writeFile(filePath, content, 'utf8')

    const result = await readNDJSON(filePath)

    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(event)
    expect(result[1]).toEqual(event)
  })

  it('should throw error for invalid JSON', async () => {
    const tempDir = await createTempDir()
    const filePath = join(tempDir, 'invalid.ndjson')

    const content = '{"valid": true}\n{"invalid": json}\n{"also": "valid"}'
    await writeFile(filePath, content, 'utf8')

    await expect(readNDJSON(filePath)).rejects.toThrow()
  })

  it('should throw error for non-existent file', async () => {
    const filePath = join('/non/existent/path', 'file.ndjson')

    await expect(readNDJSON(filePath)).rejects.toThrow()
  })

  it('should handle single event without trailing newline', async () => {
    const tempDir = await createTempDir()
    const filePath = join(tempDir, 'single.ndjson')

    const event: TelemetryEvent = {
      createdAt: '2023-01-01T00:00:00.000Z',
      properties: {platform: 'test'},
      sessionId: 'test',
      type: 'userProperties',
    }

    await writeFile(filePath, JSON.stringify(event), 'utf8')

    const result = await readNDJSON(filePath)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(event)
  })
})