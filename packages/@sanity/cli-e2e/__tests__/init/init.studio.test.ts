import {existsSync, readFileSync} from 'node:fs'

import {createTmpDir} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {getE2EOrganizationId, getE2EProjectId, runCli} from '../../helpers/runCli.js'

const projectId = getE2EProjectId()

// Skipped: unattended mode (no -y, non-interactive terminal) defaults to JavaScript
// instead of TypeScript, causing assertion mismatches. See https://linear.app/sanity/issue/SDK-1316
describe.skip('sanity init - studio (unattended)', {timeout: 120_000}, () => {
  test.todo('unattended mode should match -y defaults')
})

describe('sanity init - studio (with -y flag)', {timeout: 120_000}, () => {
  let tmp: Awaited<ReturnType<typeof createTmpDir>>

  beforeEach(async () => {
    tmp = await createTmpDir({useSystemTmp: true})
  })

  afterEach(async () => {
    await tmp.cleanup()
  })

  test('creates studio with default settings', async () => {
    const {error} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--typescript',
      ],
    })

    if (error) throw error

    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)

    const pkg = JSON.parse(readFileSync(`${tmp.path}/package.json`, 'utf8'))
    expect(pkg.dependencies?.sanity ?? pkg.devDependencies?.sanity).toBeDefined()
    expect(existsSync(`${tmp.path}/node_modules`)).toBe(true)

    const cliConfig = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
    expect(cliConfig).toContain('autoUpdates')
  })

  test.each(['clean', 'blog'])('creates studio with %s template', async (template) => {
    const {error} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--template',
        template,
        '--typescript',
      ],
    })

    if (error) throw error
    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
    expect(existsSync(`${tmp.path}/package.json`)).toBe(true)
    if (template === 'blog') {
      expect(existsSync(`${tmp.path}/schemaTypes`)).toBe(true)
    }
  })

  test('creates TypeScript project with correct config files', async () => {
    const {error} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--typescript',
      ],
    })

    if (error) throw error
    expect(existsSync(`${tmp.path}/tsconfig.json`)).toBe(true)
    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
    expect(existsSync(`${tmp.path}/sanity.cli.ts`)).toBe(true)

    const cliConfig = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
    expect(cliConfig).toContain(projectId)
    expect(cliConfig).toContain('production')

    const config = readFileSync(`${tmp.path}/sanity.config.ts`, 'utf8')
    expect(config).toContain(projectId)
    expect(config).toContain('production')
  })

  test('generates JavaScript files with --no-typescript', async () => {
    const {error} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--no-typescript',
      ],
    })

    if (error) throw error
    expect(existsSync(`${tmp.path}/sanity.config.js`)).toBe(true)
    expect(existsSync(`${tmp.path}/sanity.cli.js`)).toBe(true)
    expect(existsSync(`${tmp.path}/tsconfig.json`)).toBe(false)
    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(false)
  })

  test('installs with npm and creates package-lock.json', async () => {
    const {error} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--package-manager',
        'npm',
      ],
    })

    if (error) throw error
    expect(existsSync(`${tmp.path}/node_modules`)).toBe(true)
    expect(existsSync(`${tmp.path}/package-lock.json`)).toBe(true)
    expect(existsSync(`${tmp.path}/pnpm-lock.yaml`)).toBe(false)
  })

  test('skips git with --no-git', async () => {
    const {error} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--no-git',
      ],
    })

    if (error) throw error
    expect(existsSync(`${tmp.path}/.git`)).toBe(false)
  })

  test('creates git repo with custom commit message', async () => {
    const {error} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--git',
        'initial commit',
      ],
      env: {
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_AUTHOR_NAME: 'E2E Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'E2E Test',
      },
    })

    if (error) throw error
    expect(existsSync(`${tmp.path}/.git`)).toBe(true)
  })

  test('uses production dataset by default', async () => {
    const {error} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset-default',
        '--output-path',
        tmp.path,
        '--typescript',
      ],
    })

    if (error) throw error
    const config = readFileSync(`${tmp.path}/sanity.config.ts`, 'utf8')
    expect(config).toContain('production')
  })

  test('uses specified dataset name', async () => {
    const {error} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'staging',
        '--output-path',
        tmp.path,
        '--typescript',
      ],
    })

    if (error) throw error
    const config = readFileSync(`${tmp.path}/sanity.config.ts`, 'utf8')
    expect(config).toContain('staging')
    const cliConfig = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
    expect(cliConfig).toContain('staging')
  })

  test('creates dataset with public visibility', async () => {
    const uniqueDataset = `pub${Date.now().toString(36)}`
    const {error, exitCode} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        uniqueDataset,
        '--output-path',
        tmp.path,
        '--visibility',
        'public',
        '--typescript',
      ],
    })

    if (error) throw error
    expect(exitCode).toBe(0)
    const cliConfig = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
    expect(cliConfig).toContain(uniqueDataset)
  })

  // Skipped: creates a new project on the Sanity backend that cannot be cleaned up automatically
  test.skip('creates new project with --project-name', async () => {
    const orgId = getE2EOrganizationId()
    const randomSuffix = Math.random().toString(36).slice(2, 8)
    const {error, stdout} = await runCli({
      args: [
        'init',
        '-y',
        '--project-name',
        `E2E Test ${randomSuffix}`,
        '--organization',
        orgId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
      ],
    })

    if (error) throw error
    expect(stdout).toContain('Project ID:')
  })

  test('falls back gracefully with invalid coupon', async () => {
    const {error, exitCode} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--coupon',
        'invalid-coupon-xyz',
        '--typescript',
      ],
    })

    if (error) throw error
    expect(exitCode).toBe(0)
    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
    expect(existsSync(`${tmp.path}/package.json`)).toBe(true)
  })

  test('skips MCP setup with --no-mcp', async () => {
    const {error, stdout} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--no-mcp',
      ],
    })

    if (error) throw error
    expect(stdout).not.toMatch(/configured for Sanity MCP/i)
  })

  test('disables auto-updates with --no-auto-updates', async () => {
    const {error} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--no-auto-updates',
        '--typescript',
      ],
    })

    if (error) throw error
    const cliConfig = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
    expect(cliConfig).toContain('autoUpdates: false')
  })

  test('writes env file and exits early with --env', async () => {
    const {error} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--env',
        '.env.custom',
      ],
    })

    if (error) throw error
    const envContent = readFileSync(`${tmp.path}/.env.custom`, 'utf8')
    expect(envContent).toMatch(/PROJECT_ID/)
    expect(envContent).toMatch(/DATASET/)
    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(false)
    expect(existsSync(`${tmp.path}/sanity.config.js`)).toBe(false)
  })

  test('imports sample data with --import-dataset', async () => {
    const {error, exitCode, stdout} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--template',
        'moviedb',
        '--import-dataset',
        '--typescript',
      ],
    })

    if (error) throw error
    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/Done! Imported \d+ documents/)
    expect(stdout).toContain('sanity dataset delete')
    expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
  })

  test('overwrites existing files with --overwrite-files', async () => {
    const firstResult = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
      ],
    })
    if (firstResult.error) throw firstResult.error

    const {error, exitCode} = await runCli({
      args: [
        'init',
        '-y',
        '--project',
        projectId,
        '--dataset',
        'production',
        '--output-path',
        tmp.path,
        '--overwrite-files',
      ],
    })

    if (error) throw error
    expect(exitCode).toBe(0)
  })
})
