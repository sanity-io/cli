import path from 'node:path'

import {
  type CliConfig,
  getCliConfig,
  getLocalPackageVersion,
  isInteractive,
  type Output,
} from '@sanity/cli-core'
import {confirm} from '@sanity/cli-core/ux'
import {
  defineApplication,
  definePanelView,
  defineTileView,
  defineWebWorker,
  defineWindowView,
} from '@sanity/workbench-cli'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {installNewPackages} from '../../../util/packageManager/installPackages.js'
import {getPackageManagerChoice} from '../../../util/packageManager/packageManagerChoice.js'
import {dashboardViewsV1} from '../dashboardViewsV1.js'
import {upgradeRequiredPackages} from '../upgradeRequiredPackages.js'

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getCliConfig: vi.fn(),
  getLocalPackageVersion: vi.fn(),
  isInteractive: vi.fn(),
}))
vi.mock('@sanity/cli-core/ux', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core/ux')>()),
  confirm: vi.fn(),
}))
vi.mock('../../../util/packageManager/installPackages.js', () => ({installNewPackages: vi.fn()}))
vi.mock('../../../util/packageManager/packageManagerChoice.js', () => ({
  getPackageManagerChoice: vi.fn(),
}))
vi.mock('../upgradeRequiredPackages.js', () => ({upgradeRequiredPackages: vi.fn()}))

const workDir = '/project'
const output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output
const neededBy = 'the migrated files need'

const app = defineApplication({
  entry: './src/App.tsx',
  organizationId: 'org',
  slug: 'notes',
  title: 'Notes',
  views: [
    defineWindowView({name: 'notes', src: './src/App.tsx', title: 'Notes'}),
    definePanelView({name: 'inbox', src: './src/views/panel.tsx', title: 'Inbox'}),
    defineTileView({name: 'summary', size: 'small', src: './src/views/tile.tsx', title: 'Summary'}),
  ],
  webWorkers: [defineWebWorker({name: 'feed', src: './src/feed.ts', title: 'Feed'})],
})

const workerOnly = defineApplication({
  organizationId: 'org',
  slug: 'feed',
  title: 'Feed',
  webWorkers: [defineWebWorker({name: 'feed', src: './src/feed.ts', title: 'Feed'})],
})

function prepare(config: CliConfig, versions: Record<string, string>, dry = false) {
  vi.mocked(getCliConfig).mockResolvedValue(config)
  vi.mocked(getLocalPackageVersion).mockImplementation(async (name) => versions[name] ?? null)

  return dashboardViewsV1.prepare!({dry, output, workDir})
}

describe('dashboard-views-v1 codemod prepare', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(confirm).mockResolvedValue(true)
    vi.mocked(isInteractive).mockReturnValue(true)
    vi.mocked(getPackageManagerChoice).mockResolvedValue({chosen: 'pnpm', mostOptimal: 'pnpm'})
  })

  test('targets the files of every view and web worker except the window view', async () => {
    await expect(
      prepare({app}, {'@sanity/sdk': '3.15.0', '@sanity/sdk-react': '3.15.0'}),
    ).resolves.toEqual({
      options: {},
      paths: ['src/views/panel.tsx', 'src/views/tile.tsx', 'src/feed.ts'].map((src) =>
        path.resolve(workDir, src),
      ),
    })
    expect(installNewPackages).not.toHaveBeenCalled()
    expect(upgradeRequiredPackages).toHaveBeenCalledWith(
      [
        {min: '6.24.0', name: 'sanity', neededBy},
        {min: '3.15.0', name: '@sanity/sdk-react', neededBy},
        {min: '3.15.0', name: '@sanity/sdk', neededBy},
      ],
      {dry: false, output, workDir},
    )
  })

  test('installs the missing SDK packages', async () => {
    await prepare({app}, {'@sanity/sdk-react': '3.12.0'})

    expect(installNewPackages).toHaveBeenCalledWith(
      {packageManager: 'pnpm', packages: ['@sanity/sdk@^3.15.0']},
      {output, workDir},
    )
  })

  test('lists the missing SDK packages and still offers upgrades when the install is declined', async () => {
    vi.mocked(confirm).mockResolvedValue(false)

    await prepare({app}, {'@sanity/sdk': '3.15.0'})

    expect(confirm).toHaveBeenCalledWith({
      default: true,
      message: 'Install @sanity/sdk-react@^3.15.0 now?',
    })
    expect(output.log).toHaveBeenCalledWith(
      'Install @sanity/sdk-react@^3.15.0 before you run `sanity dev`.',
    )
    expect(installNewPackages).not.toHaveBeenCalled()
    expect(upgradeRequiredPackages).toHaveBeenCalledWith(expect.any(Array), {
      dry: false,
      output,
      workDir,
    })
  })

  test('requires only @sanity/sdk without views to migrate', async () => {
    await prepare({app: workerOnly}, {})

    expect(installNewPackages).toHaveBeenCalledWith(
      {packageManager: 'pnpm', packages: ['@sanity/sdk@^3.15.0']},
      {output, workDir},
    )
    expect(upgradeRequiredPackages).toHaveBeenCalledWith(
      [
        {min: '6.24.0', name: 'sanity', neededBy},
        {min: '3.15.0', name: '@sanity/sdk', neededBy},
      ],
      {dry: false, output, workDir},
    )
  })

  test.each([
    ['on a dry run', true, true],
    ['without a terminal', false, false],
  ])('only lists the package changes %s', async (_, dry, interactive) => {
    vi.mocked(isInteractive).mockReturnValue(interactive)

    await prepare({app}, {'@sanity/sdk': '3.15.0'}, dry)

    expect(output.log).toHaveBeenCalledWith(
      'Install @sanity/sdk-react@^3.15.0 before you run `sanity dev`.',
    )
    expect(confirm).not.toHaveBeenCalled()
    expect(installNewPackages).not.toHaveBeenCalled()
    expect(upgradeRequiredPackages).toHaveBeenCalledWith(expect.any(Array), {
      dry: true,
      output,
      workDir,
    })
  })

  test('fails outside a Dashboard application', async () => {
    await expect(prepare({app: {organizationId: 'org'}}, {})).rejects.toThrow(
      'Run `sanity codemod dashboard` first.',
    )
  })

  test('fails when there is nothing to migrate', async () => {
    await expect(
      prepare({app: defineApplication({organizationId: 'org', slug: 'notes', title: 'Notes'})}, {}),
    ).rejects.toThrow('declares no views or web workers')
  })
})
