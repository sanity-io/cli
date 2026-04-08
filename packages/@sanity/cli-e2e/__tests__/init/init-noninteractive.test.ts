import {existsSync, readFileSync} from 'node:fs'

import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {getE2EProjectId, runCli} from '../../helpers/runCli.js'
import {baseInitArgs, createTmpDir, optionalEnv} from './helpers.js'

const hasToken = Boolean(optionalEnv('SANITY_E2E_TOKEN'))
const projectId = hasToken ? getE2EProjectId() : 'skip'

describe.skipIf(!hasToken)('sanity init --yes (non-interactive)', () => {
  let tmpDir: string
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    const tmp = await createTmpDir()
    tmpDir = tmp.path
    cleanup = tmp.cleanup
  })

  afterEach(async () => {
    await cleanup()
  })

  test('2.1 creates studio with clean template', async () => {
    const {error} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--template', 'clean', '--typescript', '--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    if (error) throw error
    expect(existsSync(`${tmpDir}/sanity.config.ts`)).toBe(true)

    const pkg = JSON.parse(readFileSync(`${tmpDir}/package.json`, 'utf8'))
    expect(pkg.dependencies?.sanity ?? pkg.devDependencies?.sanity).toBeDefined()

    expect(existsSync(`${tmpDir}/node_modules`)).toBe(true)
  }, 120_000)

  test('2.2 creates studio with blog template', async () => {
    const {error} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--template', 'blog'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    if (error) throw error
    expect(existsSync(`${tmpDir}/schemaTypes`)).toBe(true)
  }, 120_000)

  test('2.4 default init creates correct TypeScript project with config files', async () => {
    const {error, stdout} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--typescript', '--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    if (error) throw error

    // TypeScript enabled by default (was 2.4)
    expect(existsSync(`${tmpDir}/tsconfig.json`)).toBe(true)
    expect(existsSync(`${tmpDir}/sanity.config.ts`)).toBe(true)
    expect(existsSync(`${tmpDir}/sanity.cli.ts`)).toBe(true)

    // sanity.cli.ts has correct content (was 2.17)
    const cliConfig = readFileSync(`${tmpDir}/sanity.cli.ts`, 'utf8')
    expect(cliConfig).toContain(projectId)
    expect(cliConfig).toContain('production')

    // sanity.config.ts has correct content (was 2.18)
    const config = readFileSync(`${tmpDir}/sanity.config.ts`, 'utf8')
    expect(config).toContain(projectId)
    expect(config).toContain('production')

    // Shows logged-in message (was 2.21)
    expect(stdout).toContain('You are logged in as')
  }, 120_000)

  test('2.5 --no-typescript generates JavaScript files', async () => {
    const {error} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--no-typescript', '--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    if (error) throw error
    expect(existsSync(`${tmpDir}/sanity.config.js`)).toBe(true)
    expect(existsSync(`${tmpDir}/sanity.cli.js`)).toBe(true)
    expect(existsSync(`${tmpDir}/tsconfig.json`)).toBe(false)
    expect(existsSync(`${tmpDir}/sanity.config.ts`)).toBe(false)
  }, 120_000)

  test('2.7 --package-manager installs with specified manager', async () => {
    const {error} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--package-manager', 'npm'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    if (error) throw error
    expect(existsSync(`${tmpDir}/node_modules`)).toBe(true)
    expect(existsSync(`${tmpDir}/package-lock.json`)).toBe(true)
  }, 120_000)

  test('2.9 --no-git skips git initialization', async () => {
    const {error} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--no-git', '--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    if (error) throw error
    expect(existsSync(`${tmpDir}/.git`)).toBe(false)
  }, 120_000)

  test('2.11 --git with custom commit message', async () => {
    const {error} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--git', 'initial commit', '--typescript', '--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
      env: {
        GIT_AUTHOR_EMAIL: 'test@example.com',
        GIT_AUTHOR_NAME: 'E2E Test',
        GIT_COMMITTER_EMAIL: 'test@example.com',
        GIT_COMMITTER_NAME: 'E2E Test',
      },
    })

    if (error) throw error
    expect(existsSync(`${tmpDir}/.git`)).toBe(true)
  }, 120_000)

  test('2.12 --dataset-default creates production dataset', async () => {
    const {error} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--typescript', '--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    if (error) throw error
    const config = readFileSync(`${tmpDir}/sanity.config.ts`, 'utf8')
    expect(config).toContain('production')
  }, 120_000)

  test('2.13 --dataset with specific name', async () => {
    const {error} = await runCli({
      args: baseInitArgs({
        dataset: 'staging',
        extraArgs: ['--typescript', '--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    if (error) throw error
    const config = readFileSync(`${tmpDir}/sanity.config.ts`, 'utf8')
    expect(config).toContain('staging')
    const cliConfig = readFileSync(`${tmpDir}/sanity.cli.ts`, 'utf8')
    expect(cliConfig).toContain('staging')
  }, 120_000)

  test.skipIf(!optionalEnv('SANITY_E2E_ORGANIZATION_ID'))(
    '2.14 creates new project with --project-name',
    async () => {
      const orgId = optionalEnv('SANITY_E2E_ORGANIZATION_ID')!
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
          tmpDir,
          '--typescript',
          '--package-manager',
          'pnpm',
        ],
      })

      if (error) throw error
      expect(stdout).toMatch(/[a-z0-9]{8}/)
    },
    120_000,
  )

  test('2.15 --coupon with invalid coupon falls back to default', async () => {
    const {exitCode} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--coupon', 'invalid-coupon-xyz', '--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    expect(exitCode).toBe(0)
  }, 120_000)

  test('2.16 --no-mcp skips MCP setup', async () => {
    const {error, stdout} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--no-mcp', '--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    if (error) throw error
    expect(stdout).not.toMatch(/configured for Sanity MCP/i)
  }, 120_000)

  test('2.19 --auto-updates enables auto-updates in config', async () => {
    const {error} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--auto-updates', '--typescript', '--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    if (error) throw error
    const cliConfig = readFileSync(`${tmpDir}/sanity.cli.ts`, 'utf8')
    expect(cliConfig).toContain('autoUpdates')
  }, 120_000)

  test('2.22 --env writes env file and exits early', async () => {
    const {error} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--env', '.env.custom', '--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    if (error) throw error
    const envContent = readFileSync(`${tmpDir}/.env.custom`, 'utf8')
    expect(envContent).toMatch(/PROJECT_ID/)
    expect(envContent).toMatch(/DATASET/)
    expect(existsSync(`${tmpDir}/sanity.config.ts`)).toBe(false)
  }, 120_000)

  test('2.23 --visibility sets dataset visibility', async () => {
    const uniqueDataset = `pub${Date.now().toString(36)}`
    const {exitCode} = await runCli({
      args: baseInitArgs({
        dataset: uniqueDataset,
        extraArgs: ['--visibility', 'public', '--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    expect(exitCode).toBe(0)
  }, 120_000)

  test('2.25 --import-dataset with moviedb template imports sample data', async () => {
    const {exitCode, stdout} = await runCli({
      args: baseInitArgs({
        extraArgs: [
          '--template',
          'moviedb',
          '--import-dataset',
          '--typescript',
          '--package-manager',
          'pnpm',
        ],
        outputPath: tmpDir,
        projectId,
      }),
    })

    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/import/i)
  }, 120_000)

  test('2.26 --overwrite-files overwrites existing files', async () => {
    const firstResult = await runCli({
      args: baseInitArgs({
        extraArgs: ['--package-manager', 'pnpm'],
        outputPath: tmpDir,
        projectId,
      }),
    })
    if (firstResult.error) throw firstResult.error

    const {error, exitCode} = await runCli({
      args: baseInitArgs({
        extraArgs: ['--overwrite-files', '--package-manager', 'pnpm', '--no-git'],
        outputPath: tmpDir,
        projectId,
      }),
    })

    if (error) throw error
    expect(exitCode).toBe(0)
  }, 120_000)
})
