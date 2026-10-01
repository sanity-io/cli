import {EventEmitter} from 'node:events'
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {PassThrough} from 'node:stream'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {type RequestOptions} from '../src/api.js'
import {type InitFlags} from '../src/flags.js'

const requestMock = vi.hoisted(() => vi.fn<(options: RequestOptions) => Promise<unknown>>())
const spawnMock = vi.hoisted(() => vi.fn())
const prompts = vi.hoisted(() => ({confirm: vi.fn(), input: vi.fn(), select: vi.fn()}))
const logs = vi.hoisted(() => [] as string[])

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: spawnMock,
}))
vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  request: requestMock,
}))
vi.mock('../src/ui.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/ui.js')>()),
  confirm: prompts.confirm,
  input: prompts.input,
  output: {log: (line = '') => logs.push(line), warn: (line: string) => logs.push(line)},
  select: prompts.select,
  spinner: () => {
    const spin = {fail: () => spin, start: () => spin, stop: () => spin, succeed: () => spin}
    return spin
  },
}))

const {initStudio} = await import('../src/init.js')

const templatesDir = resolve(import.meta.dirname, '../../@sanity/cli/templates')
const user = {email: 'a@example.com', id: 'u1', name: 'Ada', provider: 'github'}

function fakeChild(code: number, text = '') {
  const child = Object.assign(new EventEmitter(), {
    stderr: new PassThrough(),
    stdout: new PassThrough(),
  })
  queueMicrotask(() => {
    child.stdout.end(text)
    child.stderr.end()
    child.emit('close', code)
  })
  return child
}

function flags(overrides: Partial<InitFlags> = {}): InitFlags {
  return {
    autoUpdates: true,
    datasetDefault: false,
    install: true,
    mcp: true,
    skills: true,
    unattended: true,
    yes: true,
    ...overrides,
  }
}

let dir: string
let patches: unknown[]
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'create-sanity-init-'))
  logs.length = 0
  patches = []
  vi.stubEnv('SANITY_AUTH_TOKEN', 'token')
  vi.stubEnv('npm_config_registry', 'https://registry.example/')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({'dist-tags': {latest: '5.1.0'}})),
  )
  requestMock.mockImplementation(async (options) => {
    const key = `${options.method ?? 'GET'} ${options.url}`
    switch (key) {
      case 'GET /datasets': {
        return [{name: 'production'}]
      }
      case 'GET /features': {
        return []
      }
      case 'GET /organizations': {
        return [{id: 'o1', name: 'Org', slug: null}]
      }
      case 'GET /projects': {
        return [{createdAt: '2025', displayName: 'Movie Studio', id: 'p1', organizationId: 'o1'}]
      }
      case 'GET /projects/p1': {
        return {metadata: {cliInitializedAt: 'earlier'}}
      }
      case 'GET /users/me': {
        return user
      }
      case 'PATCH /projects/p1': {
        patches.push(options.body)
        return {}
      }
      default: {
        throw new Error(`Unexpected request ${key}`)
      }
    }
  })
})
afterEach(async () => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await rm(dir, {force: true, recursive: true})
})

const context = () => ({cliVersion: '9.9.9', interactive: false, templatesDir, workDir: dir})

describe('initStudio', () => {
  test('sets up a Studio unattended', async () => {
    spawnMock.mockImplementation(() => fakeChild(0))
    const outputPath = join(dir, 'studio')
    await initStudio(
      flags({dataset: 'production', git: false, outputPath, packageManager: 'npm', project: 'p1'}),
      context(),
    )
    const pkg = JSON.parse(await readFile(join(outputPath, 'package.json'), 'utf8'))
    expect(pkg.name).toBe('movie-studio')
    expect(pkg.dependencies).toMatchObject({'@sanity/vision': '^5.1.0', sanity: '^5.1.0'})
    expect(await readFile(join(outputPath, 'sanity.cli.ts'), 'utf8')).toContain("projectId: 'p1'")
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(spawnMock.mock.calls[0].slice(0, 2)).toEqual(['npm', ['install']])
    expect(patches).toEqual([{metadata: {initialTemplate: 'cli-clean'}}])
    expect(logs.join('\n')).toMatch(/You are logged in as a@example.com using GitHub/)
    expect(logs.join('\n')).toMatch(/Success!.*Your Studio has been created/)
  })

  test('validates unattended flags', async () => {
    await expect(initStudio(flags(), context())).rejects.toThrow(
      /Output path is required[\s\S]*Error: Project is required[\s\S]*Error: Organization is required/,
    )
    await expect(initStudio(flags({organization: 'o1', project: 'p1'}), context())).rejects.toThrow(
      'You have specified both a project and an organization',
    )
  })

  test('walks through the prompts, then configures editors and imports sample data', async () => {
    spawnMock.mockImplementation((command: string) => fakeChild(0, command === 'pnpm' ? '' : 'ok'))
    prompts.select
      .mockResolvedValueOnce('p1') // project
      .mockResolvedValueOnce('production') // dataset
      .mockResolvedValueOnce('moviedb') // template
    prompts.input.mockImplementationOnce(async ({default: suggested, validate}) => {
      expect(suggested).toBe(join(dir, 'movie-studio'))
      await mkdir(join(dir, 'taken'))
      await writeFile(join(dir, 'taken', 'file'), '')
      expect(validate(join(dir, 'taken'))).toBe('Given path is not empty')
      expect(validate(join(dir, 'free'))).toBe(true)
      return join(dir, 'free')
    })
    prompts.confirm
      .mockResolvedValueOnce(false) // TypeScript
      .mockResolvedValueOnce(true) // sample data
    await initStudio(flags({packageManager: 'pnpm', unattended: false, yes: false}), {
      ...context(),
      interactive: true,
    })
    const outputPath = join(dir, 'free')
    expect(await readFile(join(outputPath, 'sanity.config.js'), 'utf8')).toContain('visionTool')
    const pkg = JSON.parse(await readFile(join(outputPath, 'package.json'), 'utf8'))
    expect(pkg.dependencies['react-icons']).toBeTruthy()

    const commands = spawnMock.mock.calls.map(([command, args]) => [command, ...args].join(' '))
    expect(commands[0]).toBe('pnpm install')
    // No installed project CLI in this test, so the pinned CLI is used
    const cli = 'npm exec --yes --package=@sanity/cli@9.9.9 -- sanity'
    expect(commands).toContain(`${cli} mcp configure`)
    expect(commands).toContain(`${cli} skills install`)
    expect(commands).toContainEqual(
      expect.stringMatching(
        /sanity datasets import https:\/\/public\.sanity\.io\/moviesdb.* --project-id p1 --dataset production --token token --missing$/,
      ),
    )
    expect(logs.join('\n')).toContain('npx sanity dataset delete production')
  })

  test('creates a named project with its dataset and skips install', async () => {
    requestMock.mockImplementationOnce(async () => user)
    requestMock.mockImplementationOnce(async (options) => {
      expect(options).toMatchObject({method: 'POST', url: '/projects'})
      return {projectId: 'p1'}
    })
    requestMock.mockImplementationOnce(async (options) => {
      expect(options).toMatchObject({
        body: {aclMode: 'private'},
        method: 'PUT',
        url: '/datasets/staging',
      })
      return {}
    })
    const outputPath = join(dir, 'named')
    await initStudio(
      flags({
        dataset: 'staging',
        git: false,
        install: false,
        organization: 'o1',
        outputPath,
        packageManager: 'npm',
        projectName: 'Movie Studio',
        visibility: 'private',
      }),
      context(),
    )
    expect(spawnMock).not.toHaveBeenCalled()
    expect(logs.join('\n')).toContain(
      'Skipped dependency install. Run npm install to install them.',
    )
    expect(await readFile(join(outputPath, 'sanity.config.ts'), 'utf8')).toContain("'staging'")
  })
})
