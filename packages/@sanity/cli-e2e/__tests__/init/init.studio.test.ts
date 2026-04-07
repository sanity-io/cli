import {existsSync, readFileSync, writeFileSync} from 'node:fs'

import {describe, expect, test} from 'vitest'

import {getE2EProjectId, runCli} from '../../helpers/runCli.js'
import {createTmpDir} from './helpers.js'

const projectId = getE2EProjectId()

describe('sanity init - studio', {timeout: 120_000}, () => {
  describe('non-interactive', () => {
    describe('templates', () => {
      test('creates studio with clean template', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              'clean',
              '--typescript',
              '--package-manager',
              'pnpm',
            ],
          })

          if (error) throw error
          expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)

          const pkg = JSON.parse(readFileSync(`${tmp.path}/package.json`, 'utf8'))
          expect(pkg.dependencies?.sanity ?? pkg.devDependencies?.sanity).toBeDefined()

          expect(existsSync(`${tmp.path}/node_modules`)).toBe(true)
        } finally {
          await tmp.cleanup()
        }
      })

      test('creates studio with blog template', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              'blog',
            ],
          })

          if (error) throw error
          expect(existsSync(`${tmp.path}/schemaTypes`)).toBe(true)
        } finally {
          await tmp.cleanup()
        }
      })
    })

    describe('TypeScript configuration', () => {
      test('creates TypeScript project with correct config files', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              '--typescript',
              '--package-manager',
              'pnpm',
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

          expect(stdout).toContain('You are logged in as')
        } finally {
          await tmp.cleanup()
        }
      })

      test('generates JavaScript files with --no-typescript', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              '--package-manager',
              'pnpm',
            ],
          })

          if (error) throw error
          expect(existsSync(`${tmp.path}/sanity.config.js`)).toBe(true)
          expect(existsSync(`${tmp.path}/sanity.cli.js`)).toBe(true)
          expect(existsSync(`${tmp.path}/tsconfig.json`)).toBe(false)
          expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(false)
        } finally {
          await tmp.cleanup()
        }
      })
    })

    describe('package manager', () => {
      test('installs with specified package manager', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
        } finally {
          await tmp.cleanup()
        }
      })
    })

    describe('git initialization', () => {
      test('skips git with --no-git', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              '--package-manager',
              'pnpm',
            ],
          })

          if (error) throw error
          expect(existsSync(`${tmp.path}/.git`)).toBe(false)
        } finally {
          await tmp.cleanup()
        }
      })

      test('creates git repo with custom commit message', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              '--typescript',
              '--package-manager',
              'pnpm',
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
        } finally {
          await tmp.cleanup()
        }
      })
    })

    describe('dataset', () => {
      test('uses production dataset by default', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              '--package-manager',
              'pnpm',
            ],
          })

          if (error) throw error
          const config = readFileSync(`${tmp.path}/sanity.config.ts`, 'utf8')
          expect(config).toContain('production')
        } finally {
          await tmp.cleanup()
        }
      })

      test('uses specified dataset name', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              '--package-manager',
              'pnpm',
            ],
          })

          if (error) throw error
          const config = readFileSync(`${tmp.path}/sanity.config.ts`, 'utf8')
          expect(config).toContain('staging')
          const cliConfig = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
          expect(cliConfig).toContain('staging')
        } finally {
          await tmp.cleanup()
        }
      })

      test('sets dataset visibility', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
          const uniqueDataset = `pub${Date.now().toString(36)}`
          const {exitCode} = await runCli({
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
              '--package-manager',
              'pnpm',
            ],
          })

          expect(exitCode).toBe(0)
        } finally {
          await tmp.cleanup()
        }
      })
    })

    describe('project creation', () => {
      test('creates new project with --project-name', async () => {
        const orgId = process.env.SANITY_E2E_ORGANIZATION_ID
        if (!orgId) return

        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              '--typescript',
              '--package-manager',
              'pnpm',
            ],
          })

          if (error) throw error
          expect(stdout).toMatch(/[a-z0-9]{8}/)
        } finally {
          await tmp.cleanup()
        }
      })
    })

    describe('flags', () => {
      test('falls back gracefully with invalid coupon', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
          const {exitCode} = await runCli({
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
              '--package-manager',
              'pnpm',
            ],
          })

          expect(exitCode).toBe(0)
        } finally {
          await tmp.cleanup()
        }
      })

      test('skips MCP setup with --no-mcp', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              '--package-manager',
              'pnpm',
            ],
          })

          if (error) throw error
          expect(stdout).not.toMatch(/configured for Sanity MCP/i)
        } finally {
          await tmp.cleanup()
        }
      })

      test('enables auto-updates in config', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              '--auto-updates',
              '--typescript',
              '--package-manager',
              'pnpm',
            ],
          })

          if (error) throw error
          const cliConfig = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
          expect(cliConfig).toContain('autoUpdates')
        } finally {
          await tmp.cleanup()
        }
      })

      test('writes env file and exits early with --env', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              '--package-manager',
              'pnpm',
            ],
          })

          if (error) throw error
          const envContent = readFileSync(`${tmp.path}/.env.custom`, 'utf8')
          expect(envContent).toMatch(/PROJECT_ID/)
          expect(envContent).toMatch(/DATASET/)
          expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(false)
        } finally {
          await tmp.cleanup()
        }
      })

      test('imports sample data with --import-dataset', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              '--package-manager',
              'pnpm',
            ],
          })

          if (error) throw error
          expect(exitCode).toBe(0)
          expect(stdout).toMatch(/import/i)
        } finally {
          await tmp.cleanup()
        }
      })

      test('overwrites existing files with --overwrite-files', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
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
              '--package-manager',
              'pnpm',
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
              '--package-manager',
              'pnpm',
              '--no-git',
            ],
          })

          if (error) throw error
          expect(exitCode).toBe(0)
        } finally {
          await tmp.cleanup()
        }
      })
    })
  })

  describe('interactive', () => {
    describe('authentication', () => {
      test('triggers login prompt without auth token', async () => {
        const session = await runCli({
          args: ['init'],
          env: {SANITY_AUTH_TOKEN: ''},
          interactive: true,
        })

        await session.waitForText(/log in|create.*account|provider/i)

        session.kill()
      })
    })

    describe('abort handling', () => {
      test('Ctrl+C during project selection aborts cleanly', async () => {
        const session = await runCli({
          args: ['init'],
          interactive: true,
        })

        await session.waitForText(/Select project|Create.*project/i)
        session.sendControl('c')

        const exitCode = await session.waitForExit()
        expect(exitCode).not.toBe(0)
      })

      test('Ctrl+C during template selection aborts cleanly', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
          const session = await runCli({
            args: [
              'init',
              '--project',
              projectId,
              '--dataset',
              'production',
              '--output-path',
              tmp.path,
              '--no-mcp',
            ],
            interactive: true,
          })

          await session.waitForText(/template|Select project template/i)
          session.sendControl('c')

          const exitCode = await session.waitForExit()
          expect(exitCode).not.toBe(0)
        } finally {
          await tmp.cleanup()
        }
      })
    })

    describe('complete flows', () => {
      test('produces working studio and flags bypass prompts', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
          const session = await runCli({
            args: [
              'init',
              '--project',
              projectId,
              '--dataset',
              'production',
              '--output-path',
              tmp.path,
              '--template',
              'clean',
              '--typescript',
              '--package-manager',
              'pnpm',
              '--no-mcp',
              '--no-git',
            ],
            interactive: true,
          })

          const exitCode = await session.waitForExit(90_000)
          expect(exitCode).toBe(0)

          expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
          expect(existsSync(`${tmp.path}/sanity.cli.ts`)).toBe(true)
          expect(existsSync(`${tmp.path}/package.json`)).toBe(true)

          const output = session.getOutput()
          expect(output).toMatch(/sanity docs|sanity manage|sanity help/i)
          expect(output).not.toMatch(/Select project template/i)
          expect(output).not.toMatch(/Do you want to use TypeScript/i)
          expect(output).not.toMatch(/Select.*package manager/i)
        } finally {
          await tmp.cleanup()
        }
      })

      test('shows template selection and completes with chosen template', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
          const session = await runCli({
            args: [
              'init',
              '--project',
              projectId,
              '--dataset',
              'production',
              '--output-path',
              tmp.path,
              '--typescript',
              '--package-manager',
              'pnpm',
              '--no-mcp',
              '--no-git',
            ],
            interactive: true,
          })

          await session.waitForText(/template|Select project template/i)
          const output = session.getOutput()
          expect(output).toMatch(/Clean/i)
          expect(output).toMatch(/Blog/i)
          session.sendKey('Enter')

          const exitCode = await session.waitForExit(90_000)
          expect(exitCode).toBe(0)

          expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
        } finally {
          await tmp.cleanup()
        }
      })

      test('shows TypeScript prompt when flag not provided and completes', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
          const session = await runCli({
            args: [
              'init',
              '--project',
              projectId,
              '--dataset',
              'production',
              '--output-path',
              tmp.path,
              '--template',
              'clean',
              '--package-manager',
              'pnpm',
              '--no-mcp',
              '--no-git',
            ],
            interactive: true,
          })

          await session.waitForText(/TypeScript/i)
          session.sendKey('Enter')

          const exitCode = await session.waitForExit(90_000)
          expect(exitCode).toBe(0)

          expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
        } finally {
          await tmp.cleanup()
        }
      })

      test('shows package manager prompt when flag not provided and completes', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
          const session = await runCli({
            args: [
              'init',
              '--project',
              projectId,
              '--dataset',
              'production',
              '--output-path',
              tmp.path,
              '--template',
              'clean',
              '--typescript',
              '--no-mcp',
              '--no-git',
            ],
            interactive: true,
          })

          await session.waitForText(/package manager|npm|yarn|pnpm/i)
          session.sendKey('Enter')

          const exitCode = await session.waitForExit(90_000)
          expect(exitCode).toBe(0)

          expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
        } finally {
          await tmp.cleanup()
        }
      })

      test('auto-detects package manager from existing lockfile', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
          writeFileSync(`${tmp.path}/pnpm-lock.yaml`, 'lockfileVersion: 5.4\n')

          const session = await runCli({
            args: [
              'init',
              '--project',
              projectId,
              '--dataset',
              'production',
              '--output-path',
              tmp.path,
              '--template',
              'clean',
              '--typescript',
              '--no-mcp',
              '--no-git',
            ],
            interactive: true,
          })

          await session.waitForText(/pnpm|installing|Success/i)

          const exitCode = await session.waitForExit(90_000)
          expect(exitCode).toBe(0)

          expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
        } finally {
          await tmp.cleanup()
        }
      })

      test('imports sample data when accepted', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
          const session = await runCli({
            args: [
              'init',
              '--project',
              projectId,
              '--dataset',
              'production',
              '--output-path',
              tmp.path,
              '--template',
              'moviedb',
              '--no-mcp',
              '--package-manager',
              'pnpm',
              '--no-git',
            ],
            interactive: true,
          })

          await session.waitForText(/TypeScript/i)
          session.sendKey('Enter')

          await session.waitForText(/sampling.*movies|dataset on the hosted backend/i)
          session.write('y\n')

          await session.waitForText(/import/i, {timeout: 90_000})

          const exitCode = await session.waitForExit(90_000)
          expect(exitCode).toBe(0)
        } finally {
          await tmp.cleanup()
        }
      })

      test('skips import when declined', async () => {
        const tmp = await createTmpDir({useSystemTmp: true})
        try {
          const session = await runCli({
            args: [
              'init',
              '--project',
              projectId,
              '--dataset',
              'production',
              '--output-path',
              tmp.path,
              '--template',
              'moviedb',
              '--no-mcp',
              '--package-manager',
              'pnpm',
              '--no-git',
            ],
            interactive: true,
          })

          await session.waitForText(/TypeScript/i)
          session.sendKey('Enter')

          await session.waitForText(/sampling.*movies|dataset on the hosted backend/i)
          session.write('n\n')

          await session.waitForText(/installing|Success/i, {timeout: 90_000})

          const exitCode = await session.waitForExit(90_000)
          expect(exitCode).toBe(0)
        } finally {
          await tmp.cleanup()
        }
      })
    })
  })
})
