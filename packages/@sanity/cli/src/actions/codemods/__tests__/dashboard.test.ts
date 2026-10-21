import {
  type CliConfig,
  findPathForFiles,
  getCliConfig,
  getLocalPackageVersion,
  getStudioConfig,
  type Output,
  tryFindStudioConfigPath,
} from '@sanity/cli-core'
import {input, select} from '@sanity/cli-core/ux'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getOrganizationGrants, listOrganizations} from '../../../services/organizations.js'
import {getProjectById} from '../../../services/projects.js'
import {dashboard} from '../dashboard.js'

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  findPathForFiles: vi.fn(),
  getCliConfig: vi.fn(),
  getLocalPackageVersion: vi.fn(),
  getStudioConfig: vi.fn(),
  tryFindStudioConfigPath: vi.fn(),
}))
vi.mock('@sanity/cli-core/ux', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core/ux')>()),
  input: vi.fn(),
  select: vi.fn(),
}))
vi.mock('../../../services/projects.js', () => ({getProjectById: vi.fn()}))
vi.mock('../../../services/organizations.js', () => ({
  getOrganizationGrants: vi.fn(),
  listOrganizations: vi.fn(),
}))

const workDir = '/project'
const output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output

type InputConfig = Parameters<typeof input>[0]

function answerPrompts(answers: {slug: string; title?: string}) {
  vi.mocked(input).mockImplementation((async (config: InputConfig) =>
    config.message.includes('slug')
      ? answers.slug
      : (answers.title ?? config.default ?? '')) as unknown as typeof input)
}

function promptConfig(name: 'slug' | 'title'): InputConfig {
  const call = vi.mocked(input).mock.calls.find(([config]) => config.message.includes(name))
  if (!call) throw new Error(`No ${name} prompt`)
  return call[0]
}

function prepare(config: CliConfig) {
  vi.mocked(getCliConfig).mockResolvedValue(config)
  return dashboard.prepare!({output, workDir})
}

describe('dashboard codemod prepare', () => {
  beforeEach(() => {
    vi.mocked(findPathForFiles).mockResolvedValue([
      {exists: true, path: '/project/sanity.cli.ts'},
      {exists: false, path: '/project/sanity.cli.js'},
    ])
    vi.mocked(tryFindStudioConfigPath).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  test('deployed studio: suggests the studio title, uses the project org and rejects the studio host as slug', async () => {
    vi.mocked(tryFindStudioConfigPath).mockResolvedValue('/project/sanity.config.ts')
    vi.mocked(getStudioConfig).mockResolvedValue({
      dataset: 'production',
      projectId: 'p1',
      schema: {types: []},
      title: 'Acme Blog',
    } as unknown as Awaited<ReturnType<typeof getStudioConfig>>)
    vi.mocked(getProjectById).mockResolvedValue({organizationId: 'org-1'} as Awaited<
      ReturnType<typeof getProjectById>
    >)
    answerPrompts({slug: 'acme-dashboard'})

    const result = await prepare({
      api: {dataset: 'production', projectId: 'p1'},
      deployment: {autoUpdates: true},
      studioHost: 'acme-blog',
    })

    expect(getProjectById).toHaveBeenCalledWith('p1')
    expect(promptConfig('title').default).toBe('Acme Blog')
    expect(promptConfig('slug').validate?.('acme-blog')).toContain("is your Studio's hostname")
    expect(promptConfig('slug').validate?.('acme-dashboard')).toBe(true)
    expect(result).toEqual({
      options: {organizationId: 'org-1', slug: 'acme-dashboard', title: 'Acme Blog'},
      paths: ['/project/sanity.cli.ts'],
    })
    expect(output.warn).not.toHaveBeenCalled()
  })

  test('SDK app with an existing deployment: keeps its org and warns about deployment.appId', async () => {
    answerPrompts({slug: 'acme-app', title: 'Acme App'})

    const result = await prepare({
      app: {entry: './src/App.tsx', organizationId: 'org-2'},
      deployment: {appId: 'existing-app'},
    })

    expect(getProjectById).not.toHaveBeenCalled()
    expect(result.options).toEqual({organizationId: 'org-2', slug: 'acme-app', title: 'Acme App'})
    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('Remove `deployment.appId`'))
  })

  test('suggests the existing app title over the studio title, and a slug from the entered title', async () => {
    vi.mocked(tryFindStudioConfigPath).mockResolvedValue('/project/sanity.config.ts')
    vi.mocked(getStudioConfig).mockResolvedValue({
      title: 'Studio Title',
    } as unknown as Awaited<ReturnType<typeof getStudioConfig>>)
    answerPrompts({slug: 'acme-news', title: 'Acme News'})

    await prepare({app: {organizationId: 'org-2', title: 'Acme App'}})

    expect(promptConfig('title').default).toBe('Acme App')
    expect(promptConfig('slug').default).toBe('acme-news')
  })

  test('does not suggest a slug that matches the studio host', async () => {
    answerPrompts({slug: 'acme-dashboard', title: 'Acme Blog'})

    await prepare({app: {organizationId: 'org-2'}, studioHost: 'acme-blog'})

    expect(promptConfig('slug').default).toBeUndefined()
  })

  test('warns about the deprecated app.id', async () => {
    answerPrompts({slug: 'acme-app', title: 'Acme App'})

    await prepare({app: {id: 'existing-app', organizationId: 'org-2'}})

    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('Remove `app.id`'))
  })

  test.each(['Acme', 'acme_app', '1acme', 'acme-'])('rejects the slug %j', async (slug) => {
    answerPrompts({slug: 'acme-app', title: 'Acme'})

    await prepare({app: {organizationId: 'org-2'}})

    expect(promptConfig('slug').validate?.(slug)).toContain('lowercase letters')
  })

  test('fails when the project is not in an organization', async () => {
    vi.mocked(getProjectById).mockResolvedValue({organizationId: null} as Awaited<
      ReturnType<typeof getProjectById>
    >)

    await expect(prepare({api: {projectId: 'p1'}})).rejects.toThrow(
      "Project p1 isn't in an organization",
    )
    expect(select).not.toHaveBeenCalled()
    expect(input).not.toHaveBeenCalled()
  })

  test('without a project, offers only organizations the user can deploy applications to', async () => {
    vi.mocked(listOrganizations).mockResolvedValue([
      {id: 'org-deploy', name: 'Deployers', slug: null},
      {id: 'org-read', name: 'Readers', slug: null},
      {id: 'org-implicit', name: 'Implicit', slug: null},
    ])
    vi.mocked(getOrganizationGrants).mockImplementation(async (id) => {
      if (id === 'org-implicit') throw Object.assign(new Error('Unauthorized'), {statusCode: 401})
      return {
        'sanity.sdk.applications': [
          {grants: id === 'org-deploy' ? [{name: 'read'}, {name: 'deploy'}] : [{name: 'read'}]},
        ],
      }
    })
    vi.mocked(select).mockResolvedValue('org-deploy')
    answerPrompts({slug: 'acme', title: 'Acme'})

    const result = await prepare({})

    expect(vi.mocked(select).mock.calls[0][0].choices).toEqual([
      {disabled: false, name: 'Deployers [org-deploy]', value: 'org-deploy'},
      {disabled: 'Insufficient permissions', name: 'Readers [org-read]', value: 'org-read'},
      {
        disabled: 'Insufficient permissions',
        name: 'Implicit [org-implicit]',
        value: 'org-implicit',
      },
    ])
    expect(result.options.organizationId).toBe('org-deploy')
  })

  test('fails when the user cannot deploy applications to any organization', async () => {
    vi.mocked(listOrganizations).mockResolvedValue([{id: 'org-read', name: 'Readers', slug: null}])
    vi.mocked(getOrganizationGrants).mockResolvedValue({
      'sanity.sdk.applications': [{grants: [{name: 'read'}]}],
    })

    await expect(prepare({})).rejects.toThrow("You can't deploy applications")
    expect(select).not.toHaveBeenCalled()
  })

  test('warns when the installed sanity cannot import defineApplication', async () => {
    vi.mocked(getLocalPackageVersion).mockResolvedValue('6.11.0')
    answerPrompts({slug: 'acme-app', title: 'Acme App'})

    await prepare({app: {organizationId: 'org-2'}})

    expect(getLocalPackageVersion).toHaveBeenCalledWith('sanity', workDir)
    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('needs 6.12.0 or later'))
  })

  test.each(['6.12.0', null])('does not warn about sanity %s', async (installed) => {
    vi.mocked(getLocalPackageVersion).mockResolvedValue(installed)
    answerPrompts({slug: 'acme-app', title: 'Acme App'})

    await prepare({app: {organizationId: 'org-2'}})

    expect(output.warn).not.toHaveBeenCalled()
  })

  test('fails when the project is already a Dashboard application', async () => {
    const app = Object.defineProperty(
      {organizationId: 'o', slug: 's', title: 'T'},
      Symbol.for('sanity.workbench.defineApp'),
      {value: true},
    )

    await expect(prepare({app})).rejects.toThrow('already a Dashboard application')
    expect(input).not.toHaveBeenCalled()
  })
})
