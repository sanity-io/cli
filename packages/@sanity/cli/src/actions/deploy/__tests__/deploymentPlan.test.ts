import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {type Output} from '@sanity/cli-core'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {type DeployCheck} from '../deployChecks.js'
import {
  type DeploymentFile,
  type DeploymentPlan,
  deploymentPlanToJson,
  listDeploymentFiles,
  renderDeploymentPlan,
} from '../deploymentPlan.js'

describe('listDeploymentFiles', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'deploy-plan-'))
  })

  afterEach(async () => {
    await rm(dir, {force: true, recursive: true})
  })

  test('lists nested files as sorted paths with sizes, relative to fromDir', async () => {
    await mkdir(join(dir, 'dist', 'assets'), {recursive: true})
    await writeFile(join(dir, 'dist', 'index.html'), 'x')
    await writeFile(join(dir, 'dist', 'assets', 'app.js'), 'xyz')

    const files = await listDeploymentFiles(join(dir, 'dist'), dir)

    expect(files).toEqual([
      {path: 'dist/assets/app.js', size: 3},
      {path: 'dist/index.html', size: 1},
    ])
  })

  test('returns an empty list when the directory is missing', async () => {
    expect(await listDeploymentFiles(join(dir, 'missing'), dir)).toEqual([])
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
    expect(text).toContain('Files to deploy (0.00 MB):')
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
