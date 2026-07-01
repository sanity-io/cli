import {type Dirent, type Stats} from 'node:fs'
import {readdir, stat} from 'node:fs/promises'
import {join} from 'node:path'

import {type Output} from '@sanity/cli-core'
import {beforeEach, describe, expect, test, vi} from 'vitest'

import {type DeployCheck} from '../deployChecks.js'
import {
  type DeploymentFile,
  type DeploymentPlan,
  deploymentPlanToJson,
  listDeploymentFiles,
  renderDeploymentPlan,
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
  files,
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

    expect(json).toEqual({
      applicationType: 'studio',
      applicationVersion: '3.99.0',
      deployable: false,
      errors: {'No studio hostname configured': 'Set `studioHost`'},
      files: [{path: 'dist/index.html', size: 1_048_576}],
      totalBytes: 1_048_576,
      warnings: ['The autoUpdates config has moved'],
    })
  })

  test('an error without a solution maps to null', () => {
    const json = deploymentPlanToJson(studioPlan([{message: 'boom', status: 'fail'}]))
    expect(json.errors).toEqual({boom: null})
    expect(json.deployable).toBe(false)
  })

  test('deployable is true when no check failed', () => {
    expect(deploymentPlanToJson(studioPlan([{message: 'ok', status: 'pass'}])).deployable).toBe(
      true,
    )
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
    expect(text).toContain('Files to deploy (1.50 MB):')
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
    renderDeploymentPlan({checks: [], files: [], type: 'coreApp', version: '1.0.0'}, output)

    expect(lines.join('\n')).toContain('This application can be deployed.')
  })
})
