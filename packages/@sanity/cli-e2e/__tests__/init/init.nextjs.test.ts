import {existsSync, readFileSync} from 'node:fs'
import {rm} from 'node:fs/promises'
import {join} from 'node:path'

import {testFixture} from '@sanity/cli-test'
import {afterEach, beforeEach, describe, expect, test} from 'vitest'

import {getE2EProjectId, runCli} from '../../helpers/runCli.js'

const projectId = getE2EProjectId()

describe('sanity init - Next.js integration', {timeout: 120_000}, () => {
  let nextjsDir: string

  beforeEach(async () => {
    nextjsDir = await testFixture('nextjs-app', {useSystemTmp: true})
    await rm(join(nextjsDir, 'node_modules'), {force: true, recursive: true})
  })

  afterEach(async () => {
    if (nextjsDir) await rm(nextjsDir, {force: true, recursive: true})
  })

  describe('non-interactive', () => {
    test('creates sanity config, schema, and cli files with --nextjs-add-config-files', async () => {
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
      expect(exitCode).toBe(0)

      expect(existsSync(`${nextjsDir}/sanity.config.ts`)).toBe(true)
      expect(existsSync(`${nextjsDir}/sanity/schemaTypes/index.ts`)).toBe(true)

      const cliConfig = readFileSync(`${nextjsDir}/sanity.cli.ts`, 'utf8')
      expect(cliConfig).toContain('NEXT_PUBLIC_SANITY_PROJECT_ID')
    })

    test('creates embedded studio route with --nextjs-embed-studio', async () => {
      const {error, exitCode} = await runCli({
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
      expect(exitCode).toBe(0)
      expect(existsSync(`${nextjsDir}/app/studio/[[...tool]]/page.tsx`)).toBe(true)
    })

    test('writes env variables to .env.local with --nextjs-append-env', async () => {
      const {error, exitCode} = await runCli({
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
      expect(exitCode).toBe(0)

      const envContent = readFileSync(`${nextjsDir}/.env.local`, 'utf8')
      expect(envContent).toContain('NEXT_PUBLIC_SANITY_PROJECT_ID')
      expect(envContent).toContain('NEXT_PUBLIC_SANITY_DATASET')
    })
  })

  describe('interactive', () => {
    test('detects Next.js and completes with config files', async () => {
      const session = await runCli({
        args: [
          'init',
          '--project',
          projectId,
          '--dataset',
          'production',
          '--package-manager',
          'pnpm',
          '--no-mcp',
          '--no-git',
        ],
        cwd: nextjsDir,
        interactive: true,
      })

      await session.waitForText(/Would you like to add configuration files/i)
      session.sendKey('Enter')

      await session.waitForText(/Do you want to use TypeScript/i)
      session.sendKey('Enter')

      await session.waitForText(/Would you like an embedded Sanity Studio/i)
      session.sendKey('Enter')

      await session.waitForText(/What route do you want to use for the Studio/i)
      session.sendKey('Enter')

      await session.waitForText(/Select project template to use/i)
      session.sendKey('Enter')

      await session.waitForText(/Would you like to add the project ID and dataset/i)
      session.sendKey('Enter')

      const exitCode = await session.waitForExit(90_000)
      expect(exitCode).toBe(0)

      expect(existsSync(`${nextjsDir}/sanity.config.ts`)).toBe(true)

      const output = session.getOutput()
      expect(output).toMatch(/\/studio/i)
      expect(output).not.toMatch(/Project output path/i)
    })

    test('accepts custom studio route', async () => {
      const session = await runCli({
        args: [
          'init',
          '--project',
          projectId,
          '--dataset',
          'production',
          '--package-manager',
          'pnpm',
          '--no-mcp',
          '--no-git',
        ],
        cwd: nextjsDir,
        interactive: true,
      })

      await session.waitForText(/Would you like to add configuration files/i)
      session.sendKey('Enter')

      await session.waitForText(/Do you want to use TypeScript/i)
      session.sendKey('Enter')

      await session.waitForText(/Would you like an embedded Sanity Studio/i)
      session.sendKey('Enter')

      await session.waitForText(/What route do you want to use for the Studio/i)
      session.write('/admin\n')

      await session.waitForText(/Select project template to use/i)
      session.sendKey('Enter')

      await session.waitForText(/Would you like to add the project ID and dataset/i)
      session.sendKey('Enter')

      const exitCode = await session.waitForExit(90_000)
      expect(exitCode).toBe(0)

      expect(existsSync(`${nextjsDir}/app/admin/[[...tool]]/page.tsx`)).toBe(true)
      expect(existsSync(`${nextjsDir}/sanity.config.ts`)).toBe(true)
    })
  })
})
