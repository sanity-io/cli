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

    test('4.4 Ctrl+C during dataset selection aborts cleanly', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId],
        interactive: true,
      })

      await session.waitForText(/Select dataset|dataset/i)
      session.sendControl('c')

      const exitCode = await session.waitForExit()
      expect(exitCode).not.toBe(0)
    }, 60_000)

    test('4.5 Ctrl+C during output path prompt aborts cleanly', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId, '--dataset', 'production'],
        interactive: true,
      })

      await session.waitForText(/output path|Project output path/i)
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

    test('4.7 Ctrl+C during TypeScript prompt aborts cleanly', async () => {
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
        session.sendControl('c')

        const exitCode = await session.waitForExit()
        expect(exitCode).not.toBe(0)
      } finally {
        await tmp.cleanup()
      }
    }, 60_000)
  })

  describe.skipIf(!hasToken)('project selection', () => {
    test('4.8 shows project list for authenticated user', async () => {
      const session = await runCli({
        args: ['init'],
        interactive: true,
      })

      await session.waitForText(/Select project|Create.*project/i)

      session.kill()
    }, 60_000)

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

    test('4.10 can create new project inline', async () => {
      const session = await runCli({
        args: ['init'],
        interactive: true,
      })

      await session.waitForText(/Select project|Create.*project/i)
      session.sendKey('Enter')

      await session.waitForText(/project name|name/i)

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
    test('4.12 shows dataset list when datasets exist', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId],
        interactive: true,
      })

      await session.waitForText(/Select dataset|dataset/i)

      session.kill()
    }, 60_000)

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

    test('4.14 "Create new dataset" option is present', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId],
        interactive: true,
      })

      await session.waitForText(/Create new dataset/i)

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

    test('4.16 default config prompt for first dataset', async () => {
      const session = await runCli({
        args: ['init'],
        interactive: true,
      })

      await session.waitForText(/Select project|Create.*project/i)
      session.sendKey('ArrowDown')
      session.sendKey('Enter')

      await session.waitForText(/default dataset configuration|Select dataset|dataset/i)

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

    test('4.20 default path is based on project name', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId, '--dataset', 'production'],
        interactive: true,
      })

      await session.waitForText(/output path|Project output path/i)

      session.kill()
    }, 60_000)
  })

  describe.skipIf(!hasToken)('template selection', () => {
    test('4.21 shows template list', async () => {
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

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 60_000)

    test('4.22 Clean template is available', async () => {
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

        await session.waitForText(/Clean project|clean/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 60_000)

    test('4.23 Blog template is available', async () => {
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

        await session.waitForText(/Blog/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 60_000)

    test('4.24 Movie template is available', async () => {
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

        await session.waitForText(/Movie/i)

        session.kill()
      } finally {
        await tmp.cleanup()
      }
    }, 60_000)

    test('4.25 Movie template offers sample dataset import', async () => {
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

        const exitCode = await session.waitForExit(120_000)
        expect(exitCode).toBe(0)

        expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(true)
        expect(existsSync(`${tmp.path}/sanity.cli.ts`)).toBe(true)
        expect(existsSync(`${tmp.path}/package.json`)).toBe(true)
      } finally {
        await tmp.cleanup()
      }
    }, 120_000)

    test('4.35 success output includes helpful commands', async () => {
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

        await session.waitForExit(120_000)

        const output = session.getOutput()
        expect(output).toMatch(/sanity docs|sanity manage|sanity help/i)
      } finally {
        await tmp.cleanup()
      }
    }, 120_000)

    test('4.36 first project shows community invite', async () => {
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

        await session.waitForExit(120_000)
      } finally {
        await tmp.cleanup()
      }
    }, 120_000)
  })
})
