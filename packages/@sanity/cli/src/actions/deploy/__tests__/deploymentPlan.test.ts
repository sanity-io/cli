import {type Dirent, type Stats} from 'node:fs'
import {readdir, stat} from 'node:fs/promises'
import {join} from 'node:path'

import {type Output} from '@sanity/cli-core'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {createCollectingReporter} from '../../../util/checks.js'
import {type DeployCheck} from '../deployChecks.js'
import {
  declaredInterfaces,
  type DeploymentFile,
  type DeploymentPlan,
  deploymentPlanToJson,
  listDeploymentFiles,
  renderDeploymentPlan,
  reportInterfaces,
} from '../deploymentPlan.js'

vi.mock(import('node:fs/promises'), async (importOriginal) => ({
  ...(await importOriginal()),
  readdir: vi.fn(),
  stat: vi.fn(),
}))

const mockReaddir = vi.mocked(readdir)
const mockStat = vi.mocked(stat)

// Minimal Dirent stand-in: listDeploymentFiles only reads `name` and `isDirectory()`.
const dirent = (name: string, isDirectory: boolean): Dirent =>
  ({isDirectory: () => isDirectory, name}) as Dirent

describe('listDeploymentFiles', () => {
  beforeEach(() => vi.clearAllMocks())

  test('lists nested files as sorted paths with sizes, relative to fromDir', async () => {
    mockReaddir.mockImplementation((async (dir: string) => {
      if (dir.endsWith(join('dist', 'assets'))) return [dirent('app.js', false)]
      if (dir.endsWith('dist')) return [dirent('index.html', false), dirent('assets', true)]
      return []
    }) as unknown as typeof readdir)
    mockStat.mockImplementation(
      (async (file: string) =>
        ({size: file.endsWith('app.js') ? 3 : 1}) as Stats) as unknown as typeof stat,
    )

    const files = await listDeploymentFiles(join('/root', 'dist'), '/root')

    expect(files).toEqual([
      {path: 'dist/assets/app.js', size: 3},
      {path: 'dist/index.html', size: 1},
    ])
  })

  test('returns an empty list when the directory is missing', async () => {
    mockReaddir.mockRejectedValue(new Error('ENOENT'))
    expect(await listDeploymentFiles(join('/root', 'missing'), '/root')).toEqual([])
  })
})

const payload = {appId: null, isAutoUpdating: false, type: 'studio' as const, version: '3.99.0'}

const studioPlan = (checks: DeployCheck[], files: DeploymentFile[] = []): DeploymentPlan => ({
  checks,
  files,
  payload: {...payload},
  target: null,
  type: 'studio',
})

describe('deploymentPlanToJson', () => {
  test('maps failing checks to fixes and warnings to messages, dropping pass/skip', () => {
    const json = deploymentPlanToJson(
      studioPlan(
        [
          {message: 'Project: p1', status: 'pass'},
          {message: 'No studio hostname configured', solution: 'Set `studioHost`', status: 'fail'},
          {message: 'The autoUpdates config has moved', status: 'warn'},
        ],
        [{path: 'dist/index.html', size: 1_048_576}],
      ),
    )

    expect(json).toEqual({
      action: null,
      application: null,
      canDeploy: false,
      errors: {'No studio hostname configured': 'Set `studioHost`'},
      files: [{path: 'dist/index.html', size: 1_048_576}],
      payload,
      reason: 'No studio hostname configured',
      totalBytes: 1_048_576,
      url: null,
      warnings: ['The autoUpdates config has moved'],
    })
  })

  test('reports the resolved action and url, never the backend record', () => {
    const json = deploymentPlanToJson({
      checks: [],
      files: [],
      payload: {...payload},
      target: {
        action: 'update',
        id: 'app-1',
        title: 'My Studio',
        type: 'studio',
        url: 'https://my-studio.sanity.studio',
      },
      type: 'studio',
    })
    expect(json.action).toBe('update')
    expect(json.url).toBe('https://my-studio.sanity.studio')
    expect(json.application).toBeNull()
    expect(json.reason).toBeNull()
  })

  test('an error without a solution maps to null', () => {
    const json = deploymentPlanToJson(studioPlan([{message: 'boom', status: 'fail'}]))
    expect(json.errors).toEqual({boom: null})
    expect(json.canDeploy).toBe(false)
  })

  test('canDeploy is true when no check failed', () => {
    expect(deploymentPlanToJson(studioPlan([{message: 'ok', status: 'pass'}])).canDeploy).toBe(true)
  })

  test('passes the collected payload straight through', () => {
    const plan = studioPlan([{message: 'ok', status: 'pass'}])
    plan.payload = {
      ...payload,
      config: 'Media Library fields:\n  Title (title)',
      isSingleton: false,
      services: [],
      views: [{name: 'edit', src: './edit.ts', title: 'Edit', type: 'panel'}],
    }

    expect(deploymentPlanToJson(plan).payload).toEqual(plan.payload)
  })

  test('omits every workbench-only key for a plain app', () => {
    const json = deploymentPlanToJson(studioPlan([]))
    for (const key of ['views', 'services', 'config', 'isSingleton']) {
      expect(json.payload).not.toHaveProperty(key)
    }
  })
})

describe('reportInterfaces', () => {
  test('reports views and services and returns them structured', () => {
    const reporter = createCollectingReporter<DeployCheck>()

    const interfaces = reportInterfaces(reporter, {
      services: [{name: 'sync', src: './sync.ts', title: 'sync', type: 'worker'}],
      views: [{name: 'edit', src: './edit.ts', title: 'Edit', type: 'panel'}],
    })

    expect(interfaces).toEqual({
      services: [{name: 'sync', src: './sync.ts', title: 'sync', type: 'worker'}],
      views: [{name: 'edit', src: './edit.ts', title: 'Edit', type: 'panel'}],
    })
    expect(reporter.results.every((check) => check.status === 'pass')).toBe(true)
  })

  test('reports nothing and returns empty without views or services', () => {
    const reporter = createCollectingReporter<DeployCheck>()
    expect(reportInterfaces(reporter, {})).toEqual({services: [], views: []})
    expect(reporter.results).toEqual([])
  })
})

describe('declaredInterfaces', () => {
  const views = [{name: 'edit', src: './edit.ts', title: 'Edit', type: 'panel'}]

  test('omits both keys for a plain app', () => {
    expect(declaredInterfaces(null)).toEqual({})
  })

  // A real run and a dry run gate on the same rule, so the two modes can't drift.
  test('omits both keys for a workbench app that declares neither', () => {
    expect(declaredInterfaces({services: [], views: []})).toEqual({})
  })

  test('reports both keys when either kind is declared', () => {
    expect(declaredInterfaces({services: [], views})).toEqual({services: [], views})
  })
})

describe('renderDeploymentPlan', () => {
  const lines: string[] = []
  const output = {log: (message: string) => lines.push(message)} as unknown as Output

  beforeEach(() => {
    lines.length = 0
  })

  test('reports a deployable studio with its files and sizes', () => {
    renderDeploymentPlan(
      studioPlan(
        [{message: 'Project: p1', status: 'pass'}],
        [{path: 'dist/index.html', size: 1_572_864}],
      ),
      output,
    )

    const text = lines.join('\n')
    expect(text).toContain('Dry run — no changes made.')
    expect(text).toContain('Project: p1')
    expect(text).toContain('This studio can be deployed.')
    expect(text).toContain('Files to deploy (1 file, 1.50 MB):')
    expect(text).toContain('dist/index.html (1.50 MB)')
  })

  test('lists problems with their solutions when a check failed', () => {
    renderDeploymentPlan(
      studioPlan([
        {message: 'No project ID configured', solution: 'Add `api.projectId`', status: 'fail'},
      ]),
      output,
    )

    const text = lines.join('\n')
    expect(text).toContain("This studio can't be deployed.")
    expect(text).toContain('Problems to fix:')
    expect(text).toContain('No project ID configured: Add `api.projectId`')
    // No files to list, so the section is omitted rather than shown as "0.00 MB"
    expect(text).not.toContain('Files to deploy')
  })

  test('omits the files section for a blocked plan even when files are present', () => {
    renderDeploymentPlan(
      studioPlan(
        [{message: 'No project ID configured', status: 'fail'}],
        [{path: 'dist/index.html', size: 1_048_576}],
      ),
      output,
    )

    expect(lines.join('\n')).not.toContain('Files to deploy')
  })

  test('nests multi-line check messages under their heading', () => {
    renderDeploymentPlan(
      studioPlan([
        {message: 'Views:\n  Feed (feed): ./src/feed.tsx', status: 'pass'},
        {message: 'Services:\n  sync: ./src/sync.ts', status: 'pass'},
        {message: 'Media library fields:\n  Author (author)', status: 'pass'},
      ]),
      output,
    )

    const text = lines.join('\n')
    expect(text).toContain('Views:\n      Feed (feed): ./src/feed.tsx')
    expect(text).toContain('Services:\n      sync: ./src/sync.ts')
    expect(text).toContain('Media library fields:\n      Author (author)')
  })

  test('surfaces warnings in their own section', () => {
    renderDeploymentPlan(
      studioPlan([
        {message: 'Project: p1', status: 'pass'},
        {message: 'The `autoUpdates` config has moved', solution: 'Move it', status: 'warn'},
      ]),
      output,
    )

    const text = lines.join('\n')
    expect(text).toContain('This studio can be deployed.')
    expect(text).toContain('Warnings:')
    expect(text).toContain('The `autoUpdates` config has moved: Move it')
  })

  test('labels a core app deploy as an application', () => {
    renderDeploymentPlan(
      {checks: [], files: [], payload: null, target: null, type: 'coreApp'},
      output,
    )

    expect(lines.join('\n')).toContain('This application can be deployed.')
  })
})
