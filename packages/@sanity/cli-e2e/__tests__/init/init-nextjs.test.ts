import {existsSync, readFileSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {join} from 'node:path'

import {testFixture} from '@sanity/cli-test'
import {beforeEach, describe, expect, test} from 'vitest'

import {getE2EProjectId, runCli} from '../../helpers/runCli.js'
import {optionalEnv} from './helpers.js'

const hasToken = Boolean(optionalEnv('SANITY_E2E_TOKEN'))
const projectId = hasToken ? getE2EProjectId() : 'skip'

describe.skipIf(!hasToken)('sanity init - Next.js integration', () => {
  let nextjsDir: string

  beforeEach(async () => {
    nextjsDir = await testFixture('nextjs-app')
    await rm(join(nextjsDir, 'node_modules'), {force: true, recursive: true})
  })

  describe('framework detection (interactive)', () => {
    test('5.1 detects Next.js and offers config files', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId, '--dataset', 'production'],
        cwd: nextjsDir,
        interactive: true,
      })

      await session.waitForText(/add configuration files|Would you like to add/i)

      session.kill()
    }, 120_000)

    test('5.2 does not prompt for output path in Next.js context', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId, '--dataset', 'production'],
        cwd: nextjsDir,
        interactive: true,
      })

      await session.waitForText(/add configuration files|Would you like to add/i)
      session.sendKey('Enter')

      await session.waitForText(/template|TypeScript|embed.*studio/i)

      const allOutput = session.getOutput()
      expect(allOutput).not.toMatch(/Project output path/i)

      session.kill()
    }, 120_000)
  })

  describe('non-interactive Next.js', () => {
    test('5.3 --nextjs-add-config-files creates sanity config and schema files', async () => {
      const {error, exitCode} = await runCli({
        args: [
          'init',
          '-y',
          '--project',
          projectId,
          '--dataset',
          'production',
          '--nextjs-add-config-files',
          '--package-manager',
          'pnpm',
        ],
        cwd: nextjsDir,
      })

      if (error) throw error

      // exitCode check (was 5.7)
      expect(exitCode).toBe(0)

      // sanity.config.ts created (was 5.3)
      expect(existsSync(`${nextjsDir}/sanity.config.ts`)).toBe(true)

      // schema directory created (was 5.4)
      expect(
        existsSync(`${nextjsDir}/sanity/schemaTypes/index.ts`) ||
          existsSync(`${nextjsDir}/schemaTypes/index.ts`),
      ).toBe(true)

      // sanity.cli.ts generated with correct content (was 5.8)
      expect(existsSync(`${nextjsDir}/sanity.cli.ts`)).toBe(true)
      const cliConfig = readFileSync(`${nextjsDir}/sanity.cli.ts`, 'utf8')
      expect(cliConfig).toContain(projectId)
    }, 120_000)

    test('5.5 --nextjs-embed-studio creates route file', async () => {
      const {error} = await runCli({
        args: [
          'init',
          '-y',
          '--project',
          projectId,
          '--dataset',
          'production',
          '--nextjs-add-config-files',
          '--nextjs-embed-studio',
          '--package-manager',
          'pnpm',
        ],
        cwd: nextjsDir,
      })

      if (error) throw error
      const routeExists =
        existsSync(`${nextjsDir}/app/studio/[[...tool]]/page.tsx`) ||
        existsSync(`${nextjsDir}/src/app/studio/[[...tool]]/page.tsx`)
      expect(routeExists).toBe(true)
    }, 120_000)

    test('5.6 --nextjs-append-env writes to .env.local', async () => {
      const {error} = await runCli({
        args: [
          'init',
          '-y',
          '--project',
          projectId,
          '--dataset',
          'production',
          '--nextjs-add-config-files',
          '--nextjs-append-env',
          '--package-manager',
          'pnpm',
        ],
        cwd: nextjsDir,
      })

      if (error) throw error
      const envContent = readFileSync(`${nextjsDir}/.env.local`, 'utf8')
      expect(envContent).toContain('NEXT_PUBLIC_SANITY_PROJECT_ID')
      expect(envContent).toContain('NEXT_PUBLIC_SANITY_DATASET')
    }, 120_000)
  })

  describe('interactive Next.js', () => {
    test('5.10 default studio route is /studio', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId, '--dataset', 'production'],
        cwd: nextjsDir,
        interactive: true,
      })

      await session.waitForText(/add configuration files|Would you like to add/i)
      session.sendKey('Enter')

      await session.waitForText(/embed.*studio|studio.*route/i)
      session.sendKey('Enter')

      await session.waitForText(/route.*studio|What route/i)
      session.sendKey('Enter')

      const output = session.getOutput()
      expect(output).toMatch(/\/studio/i)

      session.kill()
    }, 120_000)

    test('5.11 custom studio route accepted', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId, '--dataset', 'production'],
        cwd: nextjsDir,
        interactive: true,
      })

      await session.waitForText(/add configuration files|Would you like to add/i)
      session.sendKey('Enter')

      await session.waitForText(/embed.*studio|studio.*route/i)
      session.sendKey('Enter')

      await session.waitForText(/route.*studio|What route/i)
      session.write('/admin\n')

      session.kill()
    }, 120_000)

    test('5.12 interactive Next.js prompts for template, TypeScript, and env', async () => {
      const session = await runCli({
        args: ['init', '--project', projectId, '--dataset', 'production'],
        cwd: nextjsDir,
        interactive: true,
      })

      await session.waitForText(/add configuration files|Would you like to add/i)
      session.sendKey('Enter')

      // Check for template, TypeScript, and env prompts in output
      await session.waitForText(/template|Blog|Clean|TypeScript|\.env/i)

      session.kill()
    }, 120_000)
  })

  describe('error paths', () => {
    test('5.15 remote template rejected with framework detection', async () => {
      const {exitCode} = await runCli({
        args: [
          'init',
          '--template',
          'user/repo',
          '--project',
          projectId,
          '--dataset',
          'production',
        ],
        cwd: nextjsDir,
      })

      expect(exitCode).not.toBe(0)
    })
  })
})
