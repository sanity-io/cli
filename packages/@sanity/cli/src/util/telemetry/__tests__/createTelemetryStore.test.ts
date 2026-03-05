import {readFileSync} from 'node:fs'
import {mkdir, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {type ConsentInformation} from '@sanity/cli-core'
import {createTestToken} from '@sanity/cli-test'
import {defineTrace, type TelemetryEvent, type TelemetryLogEvent} from '@sanity/telemetry'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {createTelemetryStore, type TestableTelemetryStore} from '../createTelemetryStore.js'

vi.mock('node:os', () => ({tmpdir: vi.fn()}))

const mockTmpdir = vi.mocked(tmpdir)

let testDir: string

beforeEach(async () => {
  const timestamp = Date.now()
  const random = Math.random().toString(36).slice(7)
  testDir = join(process.cwd(), 'tmp', 'telemetry-store-tests', `test-${timestamp}-${random}`)
  await mkdir(join(testDir, '.config', 'sanity'), {recursive: true})
  mockTmpdir.mockReturnValue(testDir)
  createTestToken('test-token-123')
})

afterEach(async () => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  await rm(testDir, {force: true, recursive: true}).catch(() => {})
})

/** Glob pattern using forward slashes for cross-platform compatibility (tinyglobby requires it). */
function telemetryGlob(dir: string): Promise<string[]> {
  const pattern = join(dir, '.config', 'sanity', 'telemetry-*.ndjson').replaceAll('\\', '/')
  return import('tinyglobby').then(({glob}) => glob(pattern))
}

function readNDJSON(filePath: string): TelemetryEvent[] {
  const content = readFileSync(filePath, 'utf8')
  if (!content.trim()) return []
  return content
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TelemetryEvent)
}

/** Await the internal initialization promise exposed for testing. */
function waitForInit(store: TestableTelemetryStore): Promise<void> {
  return store._initialized
}

const testEvent = {
  name: 'test-event',
  schema: {},
  type: 'log' as const,
  version: 1,
}

describe('createTelemetryStore', () => {
  describe('event buffering during initialization', () => {
    test('buffers events emitted before initialization completes', async () => {
      let resolveConsent!: (value: ConsentInformation) => void
      const consentPromise = new Promise<ConsentInformation>((resolve) => {
        resolveConsent = resolve
      })

      const store = createTelemetryStore('test-buffer', {
        resolveConsent: () => consentPromise,
      })

      // Emit events immediately — before init completes
      store.log(testEvent, {order: 1})
      store.log(testEvent, {order: 2})

      // Now resolve consent
      resolveConsent({status: 'granted'})

      // Wait for init + flush
      await waitForInit(store)

      // Find the telemetry file and verify events were written
      const files = await telemetryGlob(testDir)
      expect(files).toHaveLength(1)

      const events = readNDJSON(files[0])
      const logEvents = events.filter((e): e is TelemetryLogEvent => e.type === 'log')
      expect(logEvents).toHaveLength(2)
      expect(logEvents[0].data).toEqual({order: 1})
      expect(logEvents[1].data).toEqual({order: 2})
    })

    test('discards buffered events when consent is not granted', async () => {
      const store = createTelemetryStore('test-no-consent', {
        resolveConsent: async () => ({status: 'denied'}),
      })

      // Emit events before init
      store.log(testEvent, {should: 'be dropped'})

      await waitForInit(store)

      // No files should be created (events discarded due to denied consent)
      const files = await telemetryGlob(testDir)
      expect(files).toHaveLength(0)
    })

    test('discards buffered events when consent is undetermined', async () => {
      const store = createTelemetryStore('test-undetermined', {
        resolveConsent: async () => ({reason: 'unauthenticated', status: 'undetermined'}),
      })

      store.log(testEvent, {should: 'be dropped'})

      await waitForInit(store)

      const files = await telemetryGlob(testDir)
      expect(files).toHaveLength(0)
    })

    test('drops events when buffer is full', async () => {
      let resolveConsent!: (value: ConsentInformation) => void
      const consentPromise = new Promise<ConsentInformation>((resolve) => {
        resolveConsent = resolve
      })

      const store = createTelemetryStore('test-overflow', {
        resolveConsent: () => consentPromise,
      })

      // Emit more than MAX_PENDING_EVENTS (100)
      for (let i = 0; i < 110; i++) {
        store.log(testEvent, {index: i})
      }

      resolveConsent({status: 'granted'})
      await waitForInit(store)

      const files = await telemetryGlob(testDir)
      expect(files).toHaveLength(1)

      const events = readNDJSON(files[0])
      const logEvents = events.filter((e): e is TelemetryLogEvent => e.type === 'log')
      // Only 100 should be written (the buffer cap)
      expect(logEvents).toHaveLength(100)
      // First 100 events should be preserved (index 0-99)
      expect(logEvents[0].data).toEqual({index: 0})
      expect(logEvents[99].data).toEqual({index: 99})
    })

    test('writes events directly after initialization completes', async () => {
      const store = createTelemetryStore('test-post-init', {
        resolveConsent: async () => ({status: 'granted'}),
      })

      // Wait for init to complete
      await waitForInit(store)

      // Now emit — should write directly, not buffer
      store.log(testEvent, {after: 'init'})

      const files = await telemetryGlob(testDir)
      expect(files).toHaveLength(1)

      const events = readNDJSON(files[0])
      const logEvents = events.filter((e): e is TelemetryLogEvent => e.type === 'log')
      expect(logEvents).toHaveLength(1)
      expect(logEvents[0].data).toEqual({after: 'init'})
    })

    test('handles consent resolution failure gracefully', async () => {
      const store = createTelemetryStore('test-consent-error', {
        resolveConsent: async () => {
          throw new Error('Network error')
        },
      })

      store.log(testEvent, {should: 'be dropped'})

      await waitForInit(store)

      // Consent failure -> undetermined -> events dropped
      const files = await telemetryGlob(testDir)
      expect(files).toHaveLength(0)
    })

    test('buffers trace events during initialization', async () => {
      let resolveConsent!: (value: ConsentInformation) => void
      const consentPromise = new Promise<ConsentInformation>((resolve) => {
        resolveConsent = resolve
      })

      const store = createTelemetryStore('test-trace-buffer', {
        resolveConsent: () => consentPromise,
      })

      // Start a trace before init completes
      const traceEvent = defineTrace({
        description: 'Test trace',
        name: 'cli-command',
        version: 1,
      })
      const trace = store.trace(traceEvent)
      trace.start()

      resolveConsent({status: 'granted'})
      await waitForInit(store)

      // Complete the trace after init
      trace.complete()

      const files = await telemetryGlob(testDir)
      expect(files).toHaveLength(1)

      const events = readNDJSON(files[0])
      // Should have both trace.start (buffered) and trace.complete (direct)
      const traceStart = events.find((e) => e.type === 'trace.start')
      const traceComplete = events.find((e) => e.type === 'trace.complete')
      expect(traceStart).toBeDefined()
      expect(traceComplete).toBeDefined()
    })

    test('silently drops buffered events when file path initialization fails but consent is granted', async () => {
      // Spy on generateTelemetryFilePath to simulate a file system error.
      // vi.spyOn on the module namespace works because ESM imports are live bindings —
      // createTelemetryStore reads from the same namespace object.
      const mod = await import('../generateTelemetryFilePath.js')
      const spy = vi.spyOn(mod, 'generateTelemetryFilePath')
      spy.mockRejectedValueOnce(new Error('Disk full'))

      const store = createTelemetryStore('test-filepath-failure', {
        resolveConsent: async () => ({status: 'granted'}),
      })

      // Buffer events during init
      store.log(testEvent, {should: 'be silently dropped'})
      store.log(testEvent, {also: 'dropped'})

      await waitForInit(store)

      // Consent is granted but filePath is null — writeEvent bails, no files created
      const files = await telemetryGlob(testDir)
      expect(files).toHaveLength(0)

      // Events emitted after init should also be silently dropped
      store.log(testEvent, {post: 'init also dropped'})

      const filesAfter = await telemetryGlob(testDir)
      expect(filesAfter).toHaveLength(0)

      spy.mockRestore()
    })
  })
})
