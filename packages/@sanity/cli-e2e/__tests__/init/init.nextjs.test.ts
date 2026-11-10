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

  describe.each([
    {label: 'with -y flag', yFlag: ['-y']},
    {label: 'unattended (no -y)', yFlag: [] as string[]},
  ])('non-interactive ($label)', ({yFlag}) => {
    test('creates sanity config, schema, and cli files with --nextjs-add-config-files', async () => {
      const {error, exitCode} = await runCli({
        args: [
          'init',
          ...yFlag,
          '--project',
          projectId,
          '--dataset',
          'production',
          '--nextjs-add-config-files',
          '--package-manager',
          'pnpm',
          '--no-install',
        ],
        cwd: nextjsDir,
      })

      if (error) throw error
      expect(exitCode).toBe(0)

      expect(existsSync(`${nextjsDir}/sanity.config.ts`)).toBe(true)
      expect(existsSync(`${nextjsDir}/sanity/schemaTypes/index.ts`)).toBe(true)
      expect(existsSync(`${nextjsDir}/sanity/static/.gitkeep`)).toBe(true)
      expect(existsSync(`${nextjsDir}/app/studio/[[...tool]]/page.tsx`)).toBe(false)

      const config = readFileSync(`${nextjsDir}/sanity.config.ts`, 'utf8')
      expect(config).not.toContain("'use client'")
      expect(config).not.toContain('basePath')
      expect(config).toContain("publicDir: 'sanity/static'")
      expect(config).toContain(`projectId: ${JSON.stringify(projectId)}`)
      expect(config).toContain('dataset: "production"')
      expect(config).not.toContain('NEXT_PUBLIC_')

      const cliConfig = readFileSync(`${nextjsDir}/sanity.cli.ts`, 'utf8')
      expect(cliConfig).toContain(`projectId: ${JSON.stringify(projectId)}`)
      expect(cliConfig).toContain('dataset: "production"')
      expect(cliConfig).not.toContain('NEXT_PUBLIC_')
      expect(cliConfig).toContain('autoUpdates: true')

      const pkg = JSON.parse(readFileSync(`${nextjsDir}/package.json`, 'utf8')) as {
        scripts: Record<string, string>
      }
      expect(pkg.scripts.dev).toBe('next dev')
      expect(pkg.scripts.studio).toBe('sanity dev')
      expect(pkg.scripts['studio:build']).toBe('sanity build studio-static')
      expect(pkg.scripts['studio:deploy']).toBe('sanity deploy')

      const tsconfig = JSON.parse(readFileSync(`${nextjsDir}/tsconfig.json`, 'utf8')) as {
        exclude: string[]
      }
      expect(tsconfig.exclude).toEqual(expect.arrayContaining(['.sanity', 'studio-static']))

      const gitignore = readFileSync(`${nextjsDir}/.gitignore`, 'utf8')
      expect(gitignore).toContain('.sanity/')
      expect(gitignore).toContain('studio-static/')
    })

    test('creates embedded studio route with --nextjs-embed-studio', async () => {
      const {error, exitCode} = await runCli({
        args: [
          'init',
          ...yFlag,
          '--project',
          projectId,
          '--dataset',
          'production',
          '--nextjs-add-config-files',
          '--nextjs-embed-studio',
          '--package-manager',
          'pnpm',
          '--no-install',
        ],
        cwd: nextjsDir,
      })

      if (error) throw error
      expect(exitCode).toBe(0)
      expect(existsSync(`${nextjsDir}/app/studio/[[...tool]]/page.tsx`)).toBe(true)

      const config = readFileSync(`${nextjsDir}/sanity.config.ts`, 'utf8')
      expect(config).toContain("'use client'")
      expect(config).toContain("basePath: '/studio'")

      const pkg = JSON.parse(readFileSync(`${nextjsDir}/package.json`, 'utf8')) as {
        scripts: Record<string, string>
      }
      expect(pkg.scripts.studio).toBeUndefined()
    })

    test('writes env variables to .env.local with --nextjs-append-env', async () => {
      const {error, exitCode} = await runCli({
        args: [
          'init',
          ...yFlag,
          '--project',
          projectId,
          '--dataset',
          'production',
          '--nextjs-add-config-files',
          '--nextjs-append-env',
          '--package-manager',
          'pnpm',
          '--no-install',
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
          '--no-install',
        ],
        cwd: nextjsDir,
        interactive: true,
      })

      await session.waitForText(/Add a Sanity Studio to this project/i)
      session.sendKey('Enter')

      await session.waitForText(/Do you want to use TypeScript/i)
      session.sendKey('Enter')

      await session.waitForText(/Select project template to use/i)
      session.sendKey('Enter')

      await session.waitForText(/Would you like to add the project ID and dataset/i)
      session.sendKey('Enter')

      await session.waitForExit(0, 90_000)

      expect(existsSync(`${nextjsDir}/sanity.config.ts`)).toBe(true)
      expect(existsSync(`${nextjsDir}/app/studio/[[...tool]]/page.tsx`)).toBe(false)

      const output = session.getOutput()
      expect(output).toMatch(/pnpm studio/)
      expect(output).not.toMatch(/embedded Sanity Studio/i)
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
          '--nextjs-embed-studio',
          '--no-mcp',
          '--no-git',
          '--no-install',
        ],
        cwd: nextjsDir,
        interactive: true,
      })

      await session.waitForText(/Add a Sanity Studio to this project/i)
      session.sendKey('Enter')

      await session.waitForText(/Do you want to use TypeScript/i)
      session.sendKey('Enter')

      await session.waitForText(/Select project template to use/i)
      session.sendKey('Enter')

      await session.waitForText(/What route do you want to use for the Studio/i)
      session.write('/admin\n')

      await session.waitForText(/Would you like to add the project ID and dataset/i)
      session.sendKey('Enter')

      await session.waitForExit(0, 90_000)

      expect(existsSync(`${nextjsDir}/app/admin/[[...tool]]/page.tsx`)).toBe(true)
      expect(existsSync(`${nextjsDir}/sanity.config.ts`)).toBe(true)
    })
  })
})
