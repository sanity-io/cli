import path from 'node:path'

import {type CliConfig, getCliConfig, getLocalPackageVersion, type Output} from '@sanity/cli-core'
import {
  defineApplication,
  definePanelView,
  defineTileView,
  defineWebWorker,
  defineWindowView,
} from '@sanity/workbench-cli'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {dashboardViewsV1} from '../dashboardViewsV1.js'

vi.mock('@sanity/cli-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sanity/cli-core')>()),
  getCliConfig: vi.fn(),
  getLocalPackageVersion: vi.fn(),
}))

const workDir = '/project'
const output = {error: vi.fn(), log: vi.fn(), warn: vi.fn()} as unknown as Output

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

function prepare(config: CliConfig, versions: Record<string, string> = {}) {
  vi.mocked(getCliConfig).mockResolvedValue(config)
  vi.mocked(getLocalPackageVersion).mockImplementation(async (name) => versions[name] ?? null)

  return dashboardViewsV1.prepare!({dry: false, output, workDir})
}

describe('dashboard-views-v1 codemod prepare', () => {
  beforeEach(() => vi.clearAllMocks())

  test('targets the files of every view and web worker except the window view', async () => {
    await expect(
      prepare({app}, {'@sanity/sdk': '3.15.0', '@sanity/sdk-react': '3.15.0', sanity: '6.24.0'}),
    ).resolves.toEqual({
      options: {},
      paths: ['src/views/panel.tsx', 'src/views/tile.tsx', 'src/feed.ts'].map((src) =>
        path.resolve(workDir, src),
      ),
    })
    expect(output.warn).not.toHaveBeenCalled()
  })

  test('warns about each package that is missing or older than the migrated files need', async () => {
    await prepare({app}, {'@sanity/sdk-react': '3.15.0', sanity: '6.23.9'})

    expect(vi.mocked(output.warn).mock.calls).toEqual([
      [
        'The migrated files need sanity 6.24.0 or later. Install or upgrade it before you run `sanity dev`.',
      ],
      [
        'The migrated files need @sanity/sdk 3.15.0 or later. Install or upgrade it before you run `sanity dev`.',
      ],
    ])
  })

  test('requires @sanity/sdk-react only when there are views to migrate', async () => {
    await prepare(
      {
        app: defineApplication({
          organizationId: 'org',
          slug: 'feed',
          title: 'Feed',
          webWorkers: [defineWebWorker({name: 'feed', src: './src/feed.ts', title: 'Feed'})],
        }),
      },
      {'@sanity/sdk': '3.15.0', sanity: '6.24.0'},
    )

    expect(output.warn).not.toHaveBeenCalled()
  })

  test('fails outside a Dashboard application', async () => {
    await expect(prepare({app: {organizationId: 'org'}})).rejects.toThrow(
      'Run `sanity codemod dashboard` first.',
    )
  })

  test('fails when there is nothing to migrate', async () => {
    await expect(
      prepare({app: defineApplication({organizationId: 'org', slug: 'notes', title: 'Notes'})}),
    ).rejects.toThrow('declares no views or web workers')
  })
})
