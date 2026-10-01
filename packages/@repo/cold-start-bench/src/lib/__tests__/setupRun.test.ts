/* eslint-disable unicorn/prefer-event-target -- ChildProcess and its streams use EventEmitter. */
import {spawn} from 'node:child_process'
import {EventEmitter} from 'node:events'
import {readFile, rm} from 'node:fs/promises'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {measureSetup} from '../setup.ts'

const clock = vi.hoisted(() => ({now: 0}))
vi.mock('node:child_process', () => ({spawn: vi.fn()}))
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
}))
vi.mock('node:timers/promises', () => ({
  setTimeout: vi.fn(async (ms: number) => {
    clock.now += ms
  }),
}))
vi.mock('../apiFixture.ts', () => ({FIXTURE_TOKEN: 'fixture-token'}))
vi.mock('../measure.ts', () => ({
  cleanEnv: () => ({PATH: '/bin'}),
  entryCommand: (_entry: string, args: string[]) => ['npm', ['create', ...args]],
}))
vi.mock('../output.ts', () => ({
  visibleText: (chunks: {data: string}[]) => chunks.map((chunk) => chunk.data).join(''),
}))

const options = {
  dataset: 'production',
  dir: '/tmp/bench',
  entry: 'npm-create-sanity' as const,
  env: {},
  expectedFiles: ['package.json', 'sanity.config.ts'],
  project: 'bench123',
  registryUrl: 'http://localhost:123',
  template: 'clean' as const,
  timeoutMs: 500,
}
const children: (EventEmitter & {pid: number; stderr: EventEmitter; stdout: EventEmitter})[] = []

function child(onStart: (proc: (typeof children)[number]) => void) {
  const proc = Object.assign(new EventEmitter(), {
    pid: 123 + children.length,
    stderr: new EventEmitter(),
    stdout: new EventEmitter(),
  })
  children.push(proc)
  queueMicrotask(() => onStart(proc))
  return proc as unknown as ReturnType<typeof spawn>
}

beforeEach(() => {
  clock.now = 0
  children.length = 0
  vi.spyOn(performance, 'now').mockImplementation(() => clock.now)
  vi.spyOn(process, 'kill').mockImplementation((pid) => {
    children.find((proc) => proc.pid === Math.abs(pid))?.emit('exit', null)
    return true
  })
  vi.mocked(readFile).mockImplementation(async (path) => {
    if (String(path).endsWith('node_modules/sanity/package.json'))
      return '{"bin":{"sanity":"bin/sanity.js"}}'
    if (String(path).endsWith('package.json'))
      return '{"dependencies":{"sanity":"6"},"scripts":{"dev":"sanity dev"}}'
    return 'bench123 production'
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('<div id="sanity"></div>')),
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.resetAllMocks()
  vi.unstubAllGlobals()
})

function successfulInit() {
  vi.mocked(spawn).mockImplementationOnce(() => child((proc) => proc.emit('exit', 0)))
}
function runningStudio() {
  vi.mocked(spawn).mockImplementationOnce(() =>
    child((proc) => proc.stdout.emit('data', Buffer.from('running at http://127.0.0.1:12345/'))),
  )
}

describe('measureSetup', () => {
  test('runs unattended, measures all milestones, starts only the installed CLI and cleans up', async () => {
    successfulInit()
    runningStudio()
    const result = await measureSetup(options)
    expect(result).toMatchObject({
      end: 'completed',
      filesGeneratedMs: expect.any(Number),
      setupCompleteMs: expect.any(Number),
      studioRunningMs: expect.any(Number),
    })
    expect(result.studioRunningMs!).toBeGreaterThanOrEqual(result.setupCompleteMs!)
    expect(result.setupCompleteMs!).toBeGreaterThanOrEqual(result.filesGeneratedMs!)
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      'npm',
      expect.arrayContaining(['--yes', '--project', 'bench123']),
      expect.objectContaining({
        env: expect.objectContaining({CI: 'true', SANITY_AUTH_TOKEN: 'fixture-token'}),
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    )
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      process.execPath,
      [
        '/tmp/bench/project/node_modules/sanity/bin/sanity.js',
        'dev',
        '--host',
        '127.0.0.1',
        '--port',
        '0',
      ],
      expect.objectContaining({cwd: '/tmp/bench/project'}),
    )
    expect(process.kill).toHaveBeenCalledWith(-124, 'SIGKILL')
    expect(rm).toHaveBeenCalledWith('/tmp/bench', expect.objectContaining({recursive: true}))
  })
  test('does not count a URL or an unrelated HTTP response as Studio readiness', async () => {
    successfulInit()
    runningStudio()
    vi.mocked(fetch).mockResolvedValue(new Response('unrelated server'))
    expect(await measureSetup(options)).toMatchObject({
      end: 'failed',
      error: expect.stringContaining('within 500ms'),
      studioRunningMs: null,
    })
    expect(process.kill).toHaveBeenCalledWith(-124, 'SIGKILL')
  })
  test('reports init failure and never starts dev', async () => {
    vi.mocked(spawn).mockImplementationOnce(() =>
      child((proc) => {
        proc.stderr.emit('data', Buffer.from('install failed'))
        proc.emit('exit', 1)
      }),
    )
    expect(await measureSetup(options)).toMatchObject({
      end: 'failed',
      error: 'Initialization exited with code 1',
      output: 'install failed',
      setupCompleteMs: null,
    })
    expect(spawn).toHaveBeenCalledTimes(1)
  })
  test('reports spawn errors', async () => {
    vi.mocked(spawn).mockImplementationOnce(() =>
      child((proc) => proc.emit('error', new Error('ENOENT'))),
    )
    expect(await measureSetup(options)).toMatchObject({end: 'failed', error: 'ENOENT'})
  })
  test('fails a successful exit with incomplete files', async () => {
    successfulInit()
    vi.mocked(readFile).mockRejectedValue(Object.assign(new Error('missing'), {code: 'ENOENT'}))
    expect(await measureSetup(options)).toMatchObject({
      end: 'failed',
      error: 'Initialization exited without complete project files',
      filesGeneratedMs: null,
    })
  })
  test('kills init when it hangs', async () => {
    vi.mocked(spawn).mockImplementationOnce(() => child(() => {}))
    expect(await measureSetup(options)).toMatchObject({
      end: 'failed',
      error: expect.stringContaining('within 500ms'),
    })
    expect(process.kill).toHaveBeenCalledWith(-123, 'SIGKILL')
  })
  test('reports dev failure', async () => {
    successfulInit()
    vi.mocked(spawn).mockImplementationOnce(() => child((proc) => proc.emit('exit', 2)))
    expect(await measureSetup(options)).toMatchObject({
      end: 'failed',
      error: 'Studio exited before readiness with code 2',
      studioRunningMs: null,
    })
  })
})
