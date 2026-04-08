import {existsSync, writeFileSync} from 'node:fs'

import {describe, expect, test} from 'vitest'

import {getE2EProjectId, runCli} from '../../helpers/runCli.js'
import {createTmpDir, optionalEnv} from './helpers.js'

const hasToken = Boolean(optionalEnv('SANITY_E2E_TOKEN'))
const projectId = hasToken ? getE2EProjectId() : 'skip'

describe('sanity init - interactive', () => {
  describe('auth in interactive mode', () => {
    test('4.1 no token triggers login prompt', async () => {
      const session = await runCli({
        args: ['init'],
        env: {SANITY_AUTH_TOKEN: ''},
        interactive: true,
      })

      await session.waitForText(/log in|create.*account|provider/i)

      session.kill()
    }, 60_000)

    test.skipIf(!hasToken)(
      '4.2 valid token shows logged-in message',
      async () => {
        const session = await runCli({
          args: ['init'],
          interactive: true,
        })

        await session.waitForText(/You are logged in as/i)

        session.kill()
      },
      60_000,
    )
  })

  describe.skipIf(!hasToken)('abort / cancel', () => {
    test('4.3 Ctrl+C during project selection aborts cleanly', async () => {
      const session = await runCli({
        args: ['init'],
        interactive: true,
      })

      await session.waitForText(/Select project|Create.*project/i)
      session.sendControl('c')

      const exitCode = await session.waitForExit()
      expect(exitCode).not.toBe(0)
    }, 60_000)

    test('4.6 Ctrl+C during template selection aborts cleanly', async () => {
      const tmp = await createTmpDir()
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
    }, 60_000)
  })

  describe.skipIf(!hasToken)('project selection', () => {
    test('4.9 can select existing project via arrow keys', async () => {
      const session = await runCli({
        args: ['init'],
        interactive: true,
      })

      await session.waitForText(/Select project|Create.*project/i)
      session.sendKey('ArrowDown')
      session.sendKey('Enter')

      await session.waitForText(/dataset/i)

      session.kill()
    }, 60_000)

    test('4.11 organization selection shown when creating project', async () => {
      const session = await runCli({
        args: ['init'],
        interactive: true,
      })

      await session.waitForText(/Select project|Create.*project/i)
      session.sendKey('Enter')

      await session.waitForText(/project name|name/i)
      session.write('E2E Test Project\n')

      await session.waitForText(/organization/i)

      session.kill()
    }, 60_000)
  })

  describe.skipIf(!hasToken)('dataset selection', () => {
    test('4.13 can select existing dataset', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId],
        interactive: true,
      })

      await session.waitForText(/Select dataset|dataset/i)
      session.sendKey('Enter')

      await session.waitForText(/output path|template/i)

      session.kill()
    }, 60_000)

    test('4.15 can create new dataset with custom name', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId],
        interactive: true,
      })

      await session.waitForText(/Select dataset|dataset/i)
      session.sendKey('ArrowUp')
      session.sendKey('Enter')

      await session.waitForText(/name.*dataset|dataset.*name/i)

      session.kill()
    }, 60_000)

    test('4.17 decline default config prompts for dataset name', async () => {
      const session = await runCli({
        args: ['init'],
        interactive: true,
      })

      await session.waitForText(/Select project|Create.*project/i)
      session.sendKey('ArrowDown')
      session.sendKey('Enter')

      await session.waitForText(/dataset/i)

      session.kill()
    }, 60_000)
  })

  describe.skipIf(!hasToken)('output path', () => {
    test('4.18 shows output path prompt with default', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId, '--dataset', 'production'],
        interactive: true,
      })

      await session.waitForText(/output path|Project output path/i)

      session.kill()
    }, 60_000)

    test('4.19 accepts custom output path', async () => {
      const tmp = await createTmpDir()
      try {
        const session = await runCli({
          args: ['init', '--project', projectId, '--dataset', 'production'],
          interactive: true,
        })

        await session.waitForText(/output path|Project output path/i)
        session.sendControl('a')
        session.write(`${tmp.path}\n`)

        await session.waitForText(/template|MCP|TypeScript/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 60_000)
  })

  describe.skipIf(!hasToken)('template selection', () => {
    test('4.21 shows template list with available templates', async () => {
      const tmp = await createTmpDir()
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
          ],
          interactive: true,
        })

        await session.waitForText(/template|Select project template/i)

        const output = session.getOutput()
        expect(output).toMatch(/Clean/i)
        expect(output).toMatch(/Blog/i)
        expect(output).toMatch(/Movie/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 60_000)

    test('4.26 accepting sample dataset import triggers import', async () => {
      const tmp = await createTmpDir()
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
          ],
          interactive: true,
        })

        await session.waitForText(/TypeScript/i)
        session.sendKey('Enter')

        await session.waitForText(/sample dataset|import/i)
        session.write('y\n')

        await session.waitForText(/import/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 120_000)

    test('4.27 declining sample dataset import skips import', async () => {
      const tmp = await createTmpDir()
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
          ],
          interactive: true,
        })

        await session.waitForText(/TypeScript/i)
        session.sendKey('Enter')

        await session.waitForText(/sample dataset|import/i)
        session.write('n\n')

        await session.waitForText(/package manager|Success/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 120_000)
  })

  describe.skipIf(!hasToken)('TypeScript prompt', () => {
    test('4.28 asks about TypeScript when flag not provided', async () => {
      const tmp = await createTmpDir()
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
          ],
          interactive: true,
        })

        await session.waitForText(/TypeScript/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 60_000)

    test('4.29 skips TypeScript prompt when --typescript passed', async () => {
      const tmp = await createTmpDir()
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
          ],
          interactive: true,
        })

        await session.waitForText(/package manager|installing|Success/i)

        const allOutput = session.getOutput()
        expect(allOutput).not.toMatch(/Do you want to use TypeScript/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 120_000)

    test('4.30 skips TypeScript prompt when --no-typescript passed', async () => {
      const tmp = await createTmpDir()
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
            '--no-typescript',
          ],
          interactive: true,
        })

        await session.waitForText(/package manager|installing|Success/i)

        const allOutput = session.getOutput()
        expect(allOutput).not.toMatch(/Do you want to use TypeScript/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 120_000)
  })

  describe.skipIf(!hasToken)('package manager', () => {
    test('4.31 shows package manager selection', async () => {
      const tmp = await createTmpDir()
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
          ],
          interactive: true,
        })

        await session.waitForText(/package manager|npm|yarn|pnpm/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 60_000)

    test('4.32 auto-detects from existing lockfile', async () => {
      const tmp = await createTmpDir()
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
          ],
          interactive: true,
        })

        await session.waitForText(/pnpm|installing|Success/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 120_000)

    test('4.33 --package-manager flag skips prompt', async () => {
      const tmp = await createTmpDir()
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
            'npm',
          ],
          interactive: true,
        })

        await session.waitForText(/npm|installing|Success/i)

        const allOutput = session.getOutput()
        expect(allOutput).not.toMatch(/Select.*package manager/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 120_000)
  })

  describe.skipIf(!hasToken)('full happy path', () => {
    test('4.34 complete interactive flow produces working studio', async () => {
      const tmp = await createTmpDir()
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

        // Success output includes helpful commands (was 4.35)
        const output = session.getOutput()
        expect(output).toMatch(/sanity docs|sanity manage|sanity help/i)
      } finally {
        await tmp.cleanup()
      }
    }, 120_000)
  })
})
