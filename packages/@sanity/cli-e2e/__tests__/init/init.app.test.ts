import {existsSync, readFileSync} from 'node:fs'

import {createTmpDir} from '@sanity/cli-test'
import {describe, expect, test} from 'vitest'

import {runCli} from '../../helpers/runCli.js'

const orgId = process.env.SANITY_E2E_ORGANIZATION_ID

describe('sanity init - app', {timeout: 120_000}, () => {
  describe('non-interactive', () => {
    test('creates app with app-quickstart template', async () => {
      if (!orgId) return

      const tmp = await createTmpDir()
      try {
        const {error, exitCode, stdout} = await runCli({
          args: [
            'init',
            '-y',
            '--template',
            'app-quickstart',
            '--organization',
            orgId,
            '--output-path',
            tmp.path,
            '--typescript',
            '--package-manager',
            'pnpm',
            '--no-git',
          ],
        })

        if (error) throw error
        expect(exitCode).toBe(0)

        expect(existsSync(`${tmp.path}/src/App.tsx`)).toBe(true)
        expect(existsSync(`${tmp.path}/package.json`)).toBe(true)

        const cliConfig = readFileSync(`${tmp.path}/sanity.cli.ts`, 'utf8')
        expect(cliConfig).toContain('organizationId')
        expect(cliConfig).toContain('entry')

        expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(false)

        expect(stdout).toMatch(/app has been scaffolded|Success/i)
      } finally {
        await tmp.cleanup()
      }
    })

    test('creates app with JavaScript when --no-typescript', async () => {
      if (!orgId) return

      const tmp = await createTmpDir()
      try {
        const {error, exitCode} = await runCli({
          args: [
            'init',
            '-y',
            '--template',
            'app-quickstart',
            '--organization',
            orgId,
            '--output-path',
            tmp.path,
            '--no-typescript',
            '--package-manager',
            'pnpm',
            '--no-git',
          ],
        })

        if (error) throw error
        expect(exitCode).toBe(0)

        expect(existsSync(`${tmp.path}/src/App.jsx`)).toBe(true)
        expect(existsSync(`${tmp.path}/sanity.cli.js`)).toBe(true)
        expect(existsSync(`${tmp.path}/tsconfig.json`)).toBe(false)
      } finally {
        await tmp.cleanup()
      }
    })
  })

  describe('interactive', () => {
    test('complete flow produces working app', async () => {
      if (!orgId) return

      const tmp = await createTmpDir()
      try {
        const session = await runCli({
          args: [
            'init',
            '--template',
            'app-quickstart',
            '--organization',
            orgId,
            '--output-path',
            tmp.path,
            '--typescript',
            '--package-manager',
            'pnpm',
            '--no-git',
          ],
          interactive: true,
        })

        const exitCode = await session.waitForExit(90_000)
        expect(exitCode).toBe(0)

        expect(existsSync(`${tmp.path}/src/App.tsx`)).toBe(true)
        expect(existsSync(`${tmp.path}/sanity.cli.ts`)).toBe(true)
        expect(existsSync(`${tmp.path}/sanity.config.ts`)).toBe(false)
      } finally {
        await tmp.cleanup()
      }
    })
  })
})
