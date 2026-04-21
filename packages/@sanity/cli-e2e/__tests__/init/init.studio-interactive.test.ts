import {existsSync, writeFileSync} from 'node:fs'

import {createTmpDir} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {getE2EProjectId, runCli} from '../../helpers/runCli.js'

const projectId = getE2EProjectId()

describe('sanity init - studio (interactive)', {timeout: 120_000}, () => {
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
