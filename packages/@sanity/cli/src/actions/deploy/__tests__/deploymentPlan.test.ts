import {type Dirent, type Stats} from 'node:fs'
import {readdir, stat} from 'node:fs/promises'
import {join} from 'node:path'

import {type Output} from '@sanity/cli-core'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {createCollectingReporter, type DeployCheck} from '../deployChecks.js'
import {
  type DeploymentFile,
  type DeploymentPlan,
  deploymentPlanToJson,
  listDeploymentFiles,
  renderDeploymentPlan,
  reportExposes,
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

const studioPlan = (checks: DeployCheck[], files: DeploymentFile[] = []): DeploymentPlan => ({
  checks,
  config: null,
  exposes: [],
  files,
  target: null,
  type: 'studio',
  version: '3.99.0',
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

    // No `exposes`/`config` keys — a plain (non-workbench) plan omits them.
    expect(json).toEqual({
      applicationType: 'studio',
      applicationVersion: '3.99.0',
      errors: {'No studio hostname configured': 'Set `studioHost`'},
      files: [{path: 'dist/index.html', size: 1_048_576}],
      isDeployable: false,
      target: null,
      totalBytes: 1_048_576,
      warnings: ['The autoUpdates config has moved'],
    })
  })

  test('passes the resolved target through to the JSON', () => {
    const target = {
      applicationId: 'app-1',
      title: 'My Studio',
      url: 'https://my-studio.sanity.studio',
    }
    const json = deploymentPlanToJson({
      checks: [],
      config: null,
      exposes: [],
      files: [],
      target,
      type: 'studio',
      version: null,
    })
    expect(json.target).toEqual(target)
  })

  test('an error without a solution maps to null', () => {
    const json = deploymentPlanToJson(studioPlan([{message: 'boom', status: 'fail'}]))
    expect(json.errors).toEqual({boom: null})
    expect(json.isDeployable).toBe(false)
  })

  test('isDeployable is true when no check failed', () => {
    expect(deploymentPlanToJson(studioPlan([{message: 'ok', status: 'pass'}])).isDeployable).toBe(
      true,
    )
  })

  test('surfaces the registered exposes and config summary', () => {
    const plan = studioPlan([{message: 'ok', status: 'pass'}])
    plan.exposes = [{name: 'edit', src: './edit.ts', title: 'Edit', type: 'panel'}]
    plan.config = 'Media Library fields:\n  Title (title)'

    const json = deploymentPlanToJson(plan)

    expect(json.exposes).toEqual([{name: 'edit', src: './edit.ts', title: 'Edit', type: 'panel'}])
    expect(json.config).toBe('Media Library fields:\n  Title (title)')
  })

  test('surfaces isSingleton only when the app sets it explicitly', () => {
    const unset = deploymentPlanToJson(studioPlan([]))
    expect(unset).not.toHaveProperty('isSingleton')

    const explicitFalse = studioPlan([])
    explicitFalse.isSingleton = false
    expect(deploymentPlanToJson(explicitFalse).isSingleton).toBe(false)

    const explicitTrue = studioPlan([])
    explicitTrue.isSingleton = true
    expect(deploymentPlanToJson(explicitTrue).isSingleton).toBe(true)
  })
})

describe('reportExposes', () => {
  test('reports views and services and returns them structured', () => {
    const reporter = createCollectingReporter()

    const exposes = reportExposes(reporter, {
      services: [{name: 'sync', src: './sync.ts', type: 'worker'}],
      views: [{name: 'edit', src: './edit.ts', title: 'Edit', type: 'panel'}],
    })

    expect(exposes).toEqual([
      {name: 'edit', src: './edit.ts', title: 'Edit', type: 'panel'},
      {name: 'sync', src: './sync.ts', title: 'sync', type: 'worker'},
    ])
    expect(reporter.results.every((check) => check.status === 'pass')).toBe(true)
    // The structured list rides on the first check so a dry run's collector reads it back.
    expect(reporter.results[0].exposes).toEqual(exposes)
  })

  test('reports nothing and returns empty without views or services', () => {
    const reporter = createCollectingReporter()
    expect(reportExposes(reporter, {})).toEqual([])
    expect(reporter.results).toEqual([])
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
      {
        checks: [],
        config: null,
        exposes: [],
        files: [],
        target: null,
        type: 'coreApp',
        version: '1.0.0',
      },
      output,
    )

    expect(lines.join('\n')).toContain('This application can be deployed.')
  })
})
