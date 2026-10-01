import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {ApiError, type RequestOptions} from '../src/api.js'

const requestMock = vi.hoisted(() => vi.fn<(options: RequestOptions) => Promise<unknown>>())
const prompts = vi.hoisted(() => ({
  confirm: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
}))

vi.mock('../src/api.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/api.js')>()),
  request: requestMock,
}))
vi.mock('../src/ui.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/ui.js')>()),
  confirm: prompts.confirm,
  input: prompts.input,
  output: {log: vi.fn(), warn: vi.fn()},
  select: prompts.select,
  spinner: () => {
    const spin = {fail: () => spin, start: () => spin, stop: () => spin, succeed: () => spin}
    return spin
  },
}))

const {ensureAuthenticated, validateSession} = await import('../src/auth.js')
const {getOrCreateDataset} = await import('../src/dataset.js')
const {createProjectFromName, getOrCreateProject, recordProjectInit} =
  await import('../src/project.js')
const {bootstrapStudio, selectTemplate, templateDependencies} = await import('../src/scaffold.js')

const user = {email: 'a@example.com', id: 'u1', name: 'Ada', provider: 'github'}
const project = (id: string, createdAt: string) => ({
  createdAt,
  displayName: `Project ${id}`,
  id,
  organizationId: 'org1',
})

type Route = (options: RequestOptions) => unknown
function routes(table: Record<string, Route | unknown>) {
  requestMock.mockImplementation(async (options) => {
    const key = `${options.method?.toUpperCase() ?? 'GET'} ${options.projectId ? `${options.projectId}:` : ''}${options.url}`
    if (!(key in table)) throw new Error(`Unexpected request ${key}`)
    const value = table[key]
    return typeof value === 'function' ? (value as Route)(options) : value
  })
}

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'create-sanity-flow-'))
  vi.stubEnv('SANITY_CLI_CONFIG_PATH', join(dir, 'config.json'))
})
afterEach(async () => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  await rm(dir, {force: true, recursive: true})
})

describe('auth', () => {
  test('no token means no session', async () => {
    expect(await validateSession()).toBeNull()
    expect(requestMock).not.toHaveBeenCalled()
  })

  test('valid and invalid tokens', async () => {
    vi.stubEnv('SANITY_AUTH_TOKEN', 'token')
    routes({'GET /users/me': user})
    expect(await ensureAuthenticated({unattended: true})).toEqual(user)
    requestMock.mockRejectedValueOnce(new ApiError(401, 'Unauthorized'))
    await expect(ensureAuthenticated({unattended: true})).rejects.toThrow(
      /No valid authentication credentials found/,
    )
    requestMock.mockRejectedValueOnce(new ApiError(500, 'Boom'))
    await expect(validateSession()).rejects.toThrow('Boom')
  })
})

describe('getOrCreateProject', () => {
  test('validates a given project', async () => {
    routes({'GET /projects': [project('p1', '2024'), project('p2', '2025')]})
    expect(
      await getOrCreateProject({organization: undefined, project: 'p1', unattended: true, user}),
    ).toEqual({
      displayName: 'Project p1',
      isFirstProject: false,
      organizationId: 'org1',
      projectId: 'p1',
    })
    await expect(
      getOrCreateProject({organization: undefined, project: 'nope', unattended: true, user}),
    ).rejects.toThrow('Given project ID (nope) not found')
  })

  test('falls back to the given project when unattended and the API fails', async () => {
    requestMock.mockRejectedValue(new Error('offline'))
    expect(
      await getOrCreateProject({organization: 'o', project: 'p1', unattended: true, user}),
    ).toMatchObject({displayName: 'Unknown project', projectId: 'p1'})
    await expect(
      getOrCreateProject({organization: undefined, project: undefined, unattended: false, user}),
    ).rejects.toThrow('Failed to communicate with the Sanity API')
  })

  test('selects an existing project, newest first', async () => {
    routes({
      'GET /organizations': [{id: 'org1', name: 'Org', slug: null}],
      'GET /projects': [project('old', '2020'), project('new', '2025')],
    })
    prompts.select.mockResolvedValueOnce('old')
    expect(
      await getOrCreateProject({
        organization: undefined,
        project: undefined,
        unattended: false,
        user,
      }),
    ).toMatchObject({isFirstProject: false, projectId: 'old'})
    const {choices} = prompts.select.mock.calls[0][0]
    expect(choices[0]).toEqual({name: 'Create new project', value: 'new'})
    expect(choices.slice(2).map((choice: {value: string}) => choice.value)).toEqual(['new', 'old'])
  })

  test('creates the first project in an organization with attach access', async () => {
    routes({
      'GET /organizations': [
        {id: 'org1', name: 'One', slug: null},
        {id: 'org2', name: 'Two', slug: 'two'},
      ],
      'GET /organizations/org1/grants': {
        'sanity.organization.projects': [{grants: [{name: 'attach'}]}],
      },
      'GET /organizations/org2/grants': () => Promise.reject(new ApiError(401, 'no')),
      'GET /projects': [],
      'POST /projects': (options: RequestOptions) => {
        expect(options.body).toEqual({
          displayName: 'My Studio',
          metadata: {integration: 'cli'},
          organizationId: 'org1',
        })
        return {id: 'created'}
      },
    })
    prompts.input.mockResolvedValueOnce('My Studio')
    prompts.select.mockResolvedValueOnce('org1')
    expect(
      await getOrCreateProject({
        organization: undefined,
        project: undefined,
        unattended: false,
        user,
      }),
    ).toEqual({
      displayName: 'My Studio',
      isFirstProject: true,
      organizationId: 'org1',
      projectId: 'created',
    })
    const orgPrompt = prompts.select.mock.calls[0][0]
    expect(orgPrompt.default).toBe('org1')
    expect(orgPrompt.choices[3]).toMatchObject({disabled: 'Insufficient permissions'})
  })

  test('creates an organization when the user has none', async () => {
    routes({
      'GET /organizations': [],
      'GET /projects': [project('p1', '2025')],
      'POST /organizations': {id: 'neworg'},
      'POST /projects': {projectId: 'created'},
    })
    prompts.select.mockResolvedValueOnce('new')
    prompts.input.mockResolvedValueOnce('Studio').mockResolvedValueOnce(' Org ')
    expect(
      await getOrCreateProject({
        organization: undefined,
        project: undefined,
        unattended: false,
        user,
      }),
    ).toMatchObject({organizationId: 'neworg', projectId: 'created'})
  })

  test('checks a given organization', async () => {
    routes({
      'GET /organizations': [{id: 'org1', name: 'Org', slug: 'org'}],
      'GET /organizations/org1/grants': {},
      'GET /projects': [project('p1', '2025')],
    })
    await expect(
      getOrCreateProject({organization: 'missing', project: undefined, unattended: false, user}),
    ).rejects.toThrow('Given organization ID (missing) not found')
    await expect(
      getOrCreateProject({organization: 'org1', project: undefined, unattended: false, user}),
    ).rejects.toThrow('You lack the necessary permissions')
  })

  test('createProjectFromName', async () => {
    routes({'POST /projects': {projectId: 'named'}})
    expect(await createProjectFromName({name: ' Named ', organization: 'org1', user})).toBe('named')
  })

  test('records init metadata without failing', async () => {
    const patches: unknown[] = []
    routes({
      'GET p1:/projects/p1': {metadata: {}},
      'PATCH p1:/projects/p1': (options: RequestOptions) => patches.push(options.body),
    })
    await recordProjectInit('p1', 'clean')
    expect(patches).toEqual([
      {metadata: {cliInitializedAt: expect.any(String)}},
      {metadata: {initialTemplate: 'cli-clean'}},
    ])
    requestMock.mockRejectedValue(new Error('offline'))
    await expect(recordProjectInit('p1', 'clean')).resolves.toBeUndefined()
  })
})

describe('getOrCreateDataset', () => {
  const base = {defaultConfig: undefined, projectId: 'p1', showDefaultConfigPrompt: false}

  test('uses a given dataset as-is when unattended', async () => {
    expect(await getOrCreateDataset({...base, dataset: 'prod', unattended: true})).toBe('prod')
    expect(requestMock).not.toHaveBeenCalled()
  })

  test('creates missing datasets with the right visibility', async () => {
    const created: unknown[] = []
    routes({
      'GET p1:/datasets': [{name: 'existing'}],
      'GET p1:/features': ['privateDataset'],
      'PUT p1:/datasets/new': (options: RequestOptions) => created.push(options.body),
      'PUT p1:/datasets/production': (options: RequestOptions) => created.push(options.body),
    })
    expect(await getOrCreateDataset({...base, dataset: 'existing', unattended: false})).toBe(
      'existing',
    )
    expect(
      await getOrCreateDataset({...base, dataset: 'new', unattended: false, visibility: 'private'}),
    ).toBe('new')
    expect(await getOrCreateDataset({...base, unattended: true})).toBe('production')
    expect(created).toEqual([{aclMode: 'private'}, {aclMode: 'public'}])
  })

  test('prompts to select or create a dataset', async () => {
    routes({
      'GET p1:/datasets': [{name: 'staging'}],
      'GET p1:/features': ['privateDataset'],
      'PUT p1:/datasets/production': {},
    })
    prompts.select.mockResolvedValueOnce('staging')
    expect(await getOrCreateDataset({...base, unattended: false})).toBe('staging')

    prompts.select.mockResolvedValueOnce('new').mockResolvedValueOnce('public')
    prompts.confirm.mockResolvedValueOnce(true)
    expect(
      await getOrCreateDataset({...base, showDefaultConfigPrompt: true, unattended: false}),
    ).toBe('production')
  })

  test('names the first dataset', async () => {
    routes({
      'GET p1:/datasets': [],
      'GET p1:/features': [],
      'PUT p1:/datasets/first': {},
    })
    prompts.input.mockImplementationOnce(async ({validate}) => {
      expect(validate('Bad')).toMatch(/lowercase/)
      return 'first'
    })
    expect(await getOrCreateDataset({...base, unattended: false})).toBe('first')
  })
})

describe('scaffold', () => {
  const templatesDir = resolve(import.meta.dirname, '../../@sanity/cli/templates')

  test('selects templates and TypeScript', async () => {
    expect(await selectTemplate({unattended: true})).toMatchObject({
      templateName: 'clean',
      useTypeScript: true,
    })
    expect(
      await selectTemplate({template: 'shopify', typescript: false, unattended: true}),
    ).toMatchObject({templateName: 'shopify', useTypeScript: true})
    prompts.select.mockResolvedValueOnce('blog')
    prompts.confirm.mockResolvedValueOnce(false)
    expect(await selectTemplate({unattended: false})).toMatchObject({
      templateName: 'blog',
      useTypeScript: false,
    })
    await expect(selectTemplate({template: 'nope', unattended: true})).rejects.toThrow(
      'Template "nope" not found',
    )
  })

  test('writes the project files', async () => {
    const selected = await selectTemplate({template: 'moviedb', unattended: true})
    expect(templateDependencies(selected.template)).toMatchObject({
      'react-icons': expect.any(String),
      sanity: 'latest',
    })
    const outputPath = join(dir, 'studio')
    await bootstrapStudio({
      autoUpdates: false,
      dataset: 'production',
      dependencyVersions: Promise.resolve({
        ...templateDependencies(selected.template),
        '@sanity/vision': '^5.0.0',
        sanity: '^5.0.0',
      }),
      organizationId: 'org1',
      outputPath,
      overwriteFiles: undefined,
      packageName: 'my-studio',
      projectId: 'p1',
      projectName: 'My Studio',
      selected,
      templatesDir,
    })
    const pkg = JSON.parse(await readFile(join(outputPath, 'package.json'), 'utf8'))
    expect(pkg).toMatchObject({
      dependencies: {
        '@sanity/vision': '^5.0.0',
        'react-icons': expect.any(String),
        sanity: '^5.0.0',
      },
      name: 'my-studio',
      private: true,
      scripts: {dev: 'sanity dev'},
    })
    const config = await readFile(join(outputPath, 'sanity.config.ts'), 'utf8')
    expect(config).toContain("projectId: 'p1'")
    expect(config).toContain("title: 'My Studio'")
    const cliConfig = await readFile(join(outputPath, 'sanity.cli.ts'), 'utf8')
    expect(cliConfig).toContain("dataset: 'production'")
    expect(cliConfig).toContain('autoUpdates: false')
    for (const file of [
      'tsconfig.json',
      '.gitignore',
      'eslint.config.mjs',
      'schemaTypes/index.ts',
    ]) {
      await expect(readFile(join(outputPath, file), 'utf8')).resolves.toBeTruthy()
    }

    // Existing files are kept unless overwriting is requested
    const {output} = await import('../src/ui.js')
    await bootstrapStudio({
      autoUpdates: false,
      dataset: 'other',
      dependencyVersions: Promise.resolve({}),
      organizationId: undefined,
      outputPath,
      overwriteFiles: undefined,
      packageName: 'my-studio',
      projectId: 'p2',
      projectName: 'My Studio',
      selected,
      templatesDir,
    })
    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('already exists, skipping'))
    expect(await readFile(join(outputPath, 'sanity.config.ts'), 'utf8')).toContain("'p1'")
  })
})
