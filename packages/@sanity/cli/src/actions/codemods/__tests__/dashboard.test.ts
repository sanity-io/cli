import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'

import {
  type CliConfig,
  findPathForFiles,
  getCliConfig,
  getLocalPackageVersion,
  getStudioConfig,
  type Output,
  tryFindStudioConfigPath,
} from '@sanity/cli-core'
import {type PackageJson, readPackageJson} from '@sanity/cli-core/package-manager'
import {confirm, input, select} from '@sanity/cli-core/ux'
import {execa} from 'execa'
import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest'

import {getOrganizationGrants, listOrganizations} from '../../../services/organizations.js'
import {getProjectById} from '../../../services/projects.js'
import {
  getPackageManagerChoice,
  type PackageManager,
} from '../../../util/packageManager/packageManagerChoice.js'
import {dashboard} from '../dashboard.js'

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  findPathForFiles: vi.fn(),
  getCliConfig: vi.fn(),
  getLocalPackageVersion: vi.fn(),
  getStudioConfig: vi.fn(),
  tryFindStudioConfigPath: vi.fn(),
}))
vi.mock('@sanity/cli-core/package-manager', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core/package-manager')>()),
  readPackageJson: vi.fn(),
}))
vi.mock('@sanity/cli-core/ux', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core/ux')>()),
  confirm: vi.fn(),
  input: vi.fn(),
  select: vi.fn(),
}))
vi.mock('execa', () => ({execa: vi.fn()}))
vi.mock('../../../util/packageManager/packageManagerChoice.js', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../util/packageManager/packageManagerChoice.js')
  >()),
  getPackageManagerChoice: vi.fn(),
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

// Each lookup of a package returns its next version: before, then after the upgrade
function installed(versions: Record<string, string[]>) {
  vi.mocked(getLocalPackageVersion).mockImplementation(
    async (name) => versions[name]?.shift() ?? null,
  )
}

function project(packageManager: PackageManager, declared: string) {
  vi.mocked(getPackageManagerChoice).mockResolvedValue({chosen: packageManager})
  vi.mocked(readPackageJson).mockResolvedValue({
    dependencies: {'@sanity/sdk': declared, '@sanity/sdk-react': declared, sanity: declared},
  } as unknown as PackageJson)
  vi.mocked(execa).mockResolvedValue({failed: false} as never)
  answerPrompts({slug: 'acme-app', title: 'Acme App'})
}

function prepare(config: CliConfig, {dir = workDir, dry = false} = {}) {
  vi.mocked(getCliConfig).mockResolvedValue(config)
  return dashboard.prepare!({dry, output, workDir: dir})
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
    vi.unstubAllEnvs()
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

  describe('when required packages are too old', () => {
    const sdkApp = {app: {organizationId: 'org-2'}}

    test.each([
      ['pnpm', 'catalog:', ['update', 'sanity', '--latest']],
      ['pnpm', 'catalog:sanity', ['update', 'sanity', '--latest']],
      ['npm', '^6.5.0', ['install', '--legacy-peer-deps', 'sanity@latest']],
      ['bun', '^6.5.0', ['update', 'sanity@latest']],
    ] as const)(
      'upgrades with %s when sanity is declared as %j',
      async (packageManager, declared, args) => {
        installed({sanity: ['6.11.0', '6.20.0']})
        project(packageManager, declared)
        vi.mocked(confirm).mockResolvedValue(true)

        await prepare(sdkApp)

        expect(output.warn).toHaveBeenCalledExactlyOnceWith(
          '`sanity dev` and `sanity deploy` will fail until you upgrade:\n  - sanity 6.11.0 (the Dashboard needs 6.20.0 or later)',
        )
        expect(execa).toHaveBeenCalledWith(
          packageManager,
          args,
          expect.objectContaining({cwd: workDir}),
        )
      },
    )

    // Berry dropped `yarn upgrade`, and the agent only names yarn when the CLI was run through it
    describe('picking the yarn upgrade verb', () => {
      beforeEach(() => {
        vi.stubEnv('npm_config_user_agent', 'npm/10.9.0 node/v22.11.0')
        installed({sanity: ['6.11.0', '6.20.0']})
        project('yarn', '^6.5.0')
        vi.mocked(confirm).mockResolvedValue(true)
      })

      test.each([
        ['up', 'a .yarnrc.yml marks it as Berry', {'.yarnrc.yml': 'nodeLinker: node-modules\n'}],
        ['up', 'corepack pins Berry', {'package.json': '{"packageManager": "yarn@4.9.1"}'}],
        ['upgrade', 'nothing marks it as Berry', {}],
      ] as const)('runs `yarn %s` in a project where %s', async (verb, _reason, files) => {
        const dir = await mkdtemp(path.join(tmpdir(), 'dashboard-codemod-'))
        await Promise.all(
          Object.entries({'package.json': '{}', 'yarn.lock': '', ...files}).map(([name, content]) =>
            writeFile(path.join(dir, name), content),
          ),
        )

        try {
          await prepare(sdkApp, {dir})
        } finally {
          await rm(dir, {force: true, recursive: true})
        }

        expect(execa).toHaveBeenCalledWith(
          'yarn',
          [verb, 'sanity@latest'],
          expect.objectContaining({cwd: dir}),
        )
      })

      test('falls back to the user agent when the project says nothing', async () => {
        vi.stubEnv('npm_config_user_agent', 'yarn/4.9.1 npm/? node/v22.11.0')

        await prepare(sdkApp)

        expect(execa).toHaveBeenCalledWith('yarn', ['up', 'sanity@latest'], expect.anything())
      })
    })

    test('upgrades the SDK alongside sanity in an SDK app', async () => {
      installed({
        '@sanity/sdk': ['2.19.0', '3.9.1'],
        '@sanity/sdk-react': ['2.19.0', '3.9.1'],
        sanity: ['6.11.0', '6.20.0'],
      })
      project('pnpm', 'catalog:')
      vi.mocked(confirm).mockResolvedValue(true)

      await prepare(sdkApp)

      expect(output.warn).toHaveBeenCalledExactlyOnceWith(
        [
          '`sanity dev` and `sanity deploy` will fail until you upgrade:',
          '  - sanity 6.11.0 (the Dashboard needs 6.20.0 or later)',
          '  - @sanity/sdk 2.19.0 (SDK apps need 3.9.1 or later)',
          '  - @sanity/sdk-react 2.19.0 (SDK apps need 3.9.1 or later)',
        ].join('\n'),
      )
      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['update', 'sanity', '@sanity/sdk', '@sanity/sdk-react', '--latest'],
        expect.anything(),
      )
    })

    test('leaves the SDK alone in a studio', async () => {
      vi.mocked(getProjectById).mockResolvedValue({organizationId: 'org-1'} as Awaited<
        ReturnType<typeof getProjectById>
      >)
      installed({'@sanity/sdk': ['2.19.0'], sanity: ['6.11.0', '6.20.0']})
      project('pnpm', 'catalog:')
      vi.mocked(confirm).mockResolvedValue(true)

      await prepare({api: {projectId: 'p1'}})

      expect(getLocalPackageVersion).not.toHaveBeenCalledWith('@sanity/sdk', workDir)
      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['update', 'sanity', '--latest'],
        expect.anything(),
      )
    })

    test.each([
      ['bun', 'the root package.json'],
      ['yarn', '.yarnrc.yml'],
    ] as const)(
      'explains how to update a %s catalog instead of upgrading',
      async (packageManager, file) => {
        installed({'@sanity/sdk-react': ['2.19.0'], sanity: ['6.11.0']})
        project(packageManager, 'catalog:')

        await prepare(sdkApp)

        expect(output.log).toHaveBeenCalledWith(
          `${packageManager} can't upgrade catalog packages, so update them yourself: set sanity to ^6.20.0 or later, @sanity/sdk-react to ^3.9.1 or later in the catalog in ${file}, then run \`${packageManager} install\`.`,
        )
        expect(confirm).not.toHaveBeenCalled()
        expect(execa).not.toHaveBeenCalled()
      },
    )

    test('leaves pnpm catalog packages pinned by overrides to the user', async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'dashboard-codemod-'))
      await writeFile(
        path.join(dir, 'pnpm-workspace.yaml'),
        "catalog:\n  sanity: ^6.5.0\noverrides:\n  sanity: '6.5.0'\n",
      )
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({pnpm: {overrides: {'@sanity/sdk@2': '2.19.0'}}}),
      )
      installed({
        '@sanity/sdk': ['2.19.0'],
        '@sanity/sdk-react': ['2.19.0', '3.9.1'],
        sanity: ['6.5.0'],
      })
      project('pnpm', 'catalog:')
      vi.mocked(confirm).mockResolvedValue(true)

      try {
        await prepare(sdkApp, {dir})
      } finally {
        await rm(dir, {force: true, recursive: true})
      }

      expect(output.log).toHaveBeenCalledWith(
        "pnpm can't upgrade catalog packages that `overrides` pin, so update them yourself: set sanity to ^6.20.0 or later, @sanity/sdk to ^3.9.1 or later in the catalog and in `overrides`, then run `pnpm install`.",
      )
      expect(execa).toHaveBeenCalledWith(
        'pnpm',
        ['update', '@sanity/sdk-react', '--latest'],
        expect.objectContaining({cwd: dir}),
      )
    })

    test('only prints the upgrade command on a dry run', async () => {
      installed({sanity: ['6.11.0']})
      project('pnpm', 'catalog:')

      await prepare(sdkApp, {dry: true})

      expect(output.log).toHaveBeenCalledWith('Run `pnpm update sanity --latest` to upgrade.')
      expect(confirm).not.toHaveBeenCalled()
      expect(execa).not.toHaveBeenCalled()
    })

    test('prints the upgrade command when the user declines', async () => {
      installed({sanity: ['6.11.0']})
      project('npm', '^6.5.0')
      vi.mocked(confirm).mockResolvedValue(false)

      await prepare(sdkApp)

      expect(output.log).toHaveBeenCalledWith(
        'Run `npm install --legacy-peer-deps sanity@latest` to upgrade.',
      )
      expect(execa).not.toHaveBeenCalled()
    })

    test('warns about packages the upgrade left too old', async () => {
      installed({
        '@sanity/sdk': ['2.19.0', '3.9.1'],
        sanity: ['6.11.0', '6.11.0'],
      })
      project('bun', '^6.5.0')
      vi.mocked(confirm).mockResolvedValue(true)

      await prepare(sdkApp)

      expect(output.warn).toHaveBeenLastCalledWith(
        'These are still too old after the upgrade. Upgrade them before you run `sanity dev` or `sanity deploy`:\n  - sanity 6.11.0 (the Dashboard needs 6.20.0 or later)',
      )
    })
  })

  test.each(['6.20.0', null])('does not warn when installed packages are %s', async (version) => {
    vi.mocked(getLocalPackageVersion).mockResolvedValue(version)
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
